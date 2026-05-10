import * as core from "@actions/core";
import * as github from "@actions/github";
import { markdownTable } from "markdown-table";
import * as url from "node:url";
import { parseSync } from "oxc-parser";

const argv = process.argv.at(1);

if (url.fileURLToPath(import.meta.url) === argv) await run();

export type TodoItem = {
	file: string;
	lineNumber: number;
	keyword: string;
	text: string;
};

export function loadInputs() {
	const github_token = core.getInput("github_token", { required: true });
	const keywordsRaw = core.getInput("keywords");
	const keywords = keywordsRaw
		.split(",")
		.map((k) => k.trim())
		.filter(Boolean);
	const comment_marker = core.getInput("comment_marker");
	const create_issues = core.getBooleanInput("create_issues");
	return { github_token, keywords, comment_marker, create_issues };
}

export function buildTodoRegex(keywords: string[]): RegExp {
	const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	const alt = escaped.join("|");
	return new RegExp(
		`(?:\\/\\/|\\/\\*|#)\\s*(${alt})(?::|(?=\\s)|$)(.*)`,
		"i",
	);
}

export function parseDiffHunk(
	patch: string,
	filename: string,
	regex: RegExp,
): TodoItem[] {
	if (!patch) return [];

	const items: TodoItem[] = [];
	const hunkHeaderRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
	let currentNewLine = 0;

	for (const line of patch.split("\n")) {
		const hunkMatch = hunkHeaderRe.exec(line);
		if (hunkMatch) {
			currentNewLine = parseInt(hunkMatch[1]!, 10) - 1;
			continue;
		}
		if (line.startsWith("-")) continue;
		if (line.startsWith(" ")) {
			currentNewLine++;
			continue;
		}
		if (line.startsWith("+")) {
			currentNewLine++;
			const content = line.slice(1);
			const m = regex.exec(content);
			if (m) {
				items.push({
					file: filename,
					lineNumber: currentNewLine,
					keyword: m[1]!.toUpperCase(),
					text: m[2]?.trim() ?? "",
				});
			}
		}
	}

	return items;
}

export function isJsOrTs(filename: string): boolean {
	return /\.[cm]?[jt]sx?$/.test(filename);
}

export function getAddedLines(patch: string): Set<number> {
	const addedLines = new Set<number>();
	const hunkHeaderRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
	let currentNewLine = 0;
	for (const line of patch.split("\n")) {
		const hunkMatch = hunkHeaderRe.exec(line);
		if (hunkMatch) {
			currentNewLine = parseInt(hunkMatch[1]!, 10) - 1;
			continue;
		}
		if (line.startsWith("-")) continue;
		if (line.startsWith(" ")) {
			currentNewLine++;
			continue;
		}
		if (line.startsWith("+")) {
			currentNewLine++;
			addedLines.add(currentNewLine);
		}
	}
	return addedLines;
}

export async function fetchFileContent(
	octokit: ReturnType<typeof github.getOctokit>,
	owner: string,
	repo: string,
	path: string,
	ref: string,
): Promise<string> {
	const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
	if (Array.isArray(data) || data.type !== "file") return "";
	return Buffer.from(data.content, "base64").toString("utf-8");
}

export function extractTodosWithOxc(
	content: string,
	filename: string,
	addedLines: Set<number>,
	keywords: string[],
): TodoItem[] {
	const { comments } = parseSync(filename, content, { sourceType: "module" });
	const todos: TodoItem[] = [];
	for (const comment of comments) {
		const lineNumber = content.slice(0, comment.start).split("\n").length;
		if (!addedLines.has(lineNumber)) continue;
		const text = comment.value.trimStart();
		for (const keyword of keywords) {
			const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const m = new RegExp(`^${escaped}(?::|(?=\\s)|$)(.*)`, "i").exec(text);
			if (m) {
				todos.push({
					file: filename,
					lineNumber,
					keyword: keyword.toUpperCase(),
					text: m[1]?.trim() ?? "",
				});
				break;
			}
		}
	}
	return todos;
}

function shouldSkipFile(filename: string, status: string, patch?: string): boolean {
	if (status === "removed") return true;
	if (!patch) return true;
	if (/\.min\.[jt]sx?$/.test(filename)) return true;
	if (["dist/", "build/", ".next/"].some((prefix) => filename.startsWith(prefix))) return true;
	return false;
}

export function buildPrCommentBody(todos: TodoItem[], marker: string): string {
	const header = `${marker}\n## TODO Comments Found in This PR\n`;
	if (todos.length === 0) {
		return `${header}\nNo new TODO-style comments were found in this PR's diff.\n`;
	}
	const table = markdownTable([
		["File", "Line", "Keyword", "Description"],
		...todos.map((t) => [
			`\`${t.file}\``,
			String(t.lineNumber),
			`\`${t.keyword}\``,
			t.text || "_(no description)_",
		]),
	]);
	return `${header}\n${table}\n`;
}

export function buildIssueTitle(todo: TodoItem): string {
	const desc = todo.text ? `: ${todo.text.slice(0, 60)}` : "";
	return `${todo.keyword} in \`${todo.file}\`${desc}`;
}

export function buildIssueBody(todo: TodoItem, repoUrl: string, sha: string): string {
	const fileLink = `${repoUrl}/blob/${sha}/${todo.file}#L${todo.lineNumber}`;
	return [
		`**Keyword:** \`${todo.keyword}\``,
		`**File:** [\`${todo.file}:${todo.lineNumber}\`](${fileLink})`,
		`**Description:** ${todo.text || "_(none provided)_"}`,
		"",
		`_Automatically created by the \`todo-to-pr-comment-issue\` action._`,
	].join("\n");
}

export async function findExistingComment(
	octokit: ReturnType<typeof github.getOctokit>,
	owner: string,
	repo: string,
	issueNumber: number,
	marker: string,
): Promise<number | null> {
	const comments = await octokit.paginate(octokit.rest.issues.listComments, {
		owner,
		repo,
		issue_number: issueNumber,
	});
	const found = comments.find((c) => c.body?.includes(marker));
	return found?.id ?? null;
}

export async function upsertPrComment(
	octokit: ReturnType<typeof github.getOctokit>,
	owner: string,
	repo: string,
	issueNumber: number,
	body: string,
	marker: string,
): Promise<void> {
	const existingId = await findExistingComment(
		octokit,
		owner,
		repo,
		issueNumber,
		marker,
	);
	if (existingId !== null) {
		await octokit.rest.issues.updateComment({
			owner,
			repo,
			comment_id: existingId,
			body,
		});
	} else {
		await octokit.rest.issues.createComment({
			owner,
			repo,
			issue_number: issueNumber,
			body,
		});
	}
}

export async function handlePullRequest(
	octokit: ReturnType<typeof github.getOctokit>,
	owner: string,
	repo: string,
	inputs: ReturnType<typeof loadInputs>,
	regex: RegExp,
): Promise<void> {
	const pullNumber = github.context.payload.pull_request?.number;
	if (!pullNumber) {
		throw new Error(
			"pull_request payload is missing — ensure this action runs on the pull_request event",
		);
	}

	const headSha = github.context.payload.pull_request!.head.sha as string;

	const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
		owner,
		repo,
		pull_number: pullNumber,
	});

	const todos: TodoItem[] = [];
	for (const file of files) {
		if (shouldSkipFile(file.filename, file.status, file.patch)) continue;
		const addedLines = getAddedLines(file.patch!);
		if (addedLines.size === 0) continue;
		if (isJsOrTs(file.filename)) {
			const content = await fetchFileContent(octokit, owner, repo, file.filename, headSha);
			todos.push(...extractTodosWithOxc(content, file.filename, addedLines, inputs.keywords));
		} else {
			todos.push(...parseDiffHunk(file.patch!, file.filename, regex));
		}
	}

	const body = buildPrCommentBody(todos, inputs.comment_marker);
	await upsertPrComment(octokit, owner, repo, pullNumber, body, inputs.comment_marker);
}

export async function handlePush(
	octokit: ReturnType<typeof github.getOctokit>,
	owner: string,
	repo: string,
	inputs: ReturnType<typeof loadInputs>,
	regex: RegExp,
): Promise<void> {
	const before = github.context.payload.before as string | undefined;

	if (!before || before === "0".repeat(40)) {
		core.warning("Skipping TODO issue creation: initial push has no base commit to diff against.");
		return;
	}

	const { data: comparison } = await octokit.rest.repos.compareCommits({
		owner,
		repo,
		base: before,
		head: github.context.sha,
	});

	const todos: TodoItem[] = [];
	for (const file of comparison.files ?? []) {
		if (shouldSkipFile(file.filename, file.status, file.patch)) continue;
		const addedLines = getAddedLines(file.patch!);
		if (addedLines.size === 0) continue;
		if (isJsOrTs(file.filename)) {
			const content = await fetchFileContent(octokit, owner, repo, file.filename, github.context.sha);
			todos.push(...extractTodosWithOxc(content, file.filename, addedLines, inputs.keywords));
		} else {
			todos.push(...parseDiffHunk(file.patch!, file.filename, regex));
		}
	}

	if (!inputs.create_issues) {
		core.warning(`create_issues is false — skipping issue creation for ${todos.length} TODO(s) found.`);
		return;
	}

	const repoUrl = `https://github.com/${owner}/${repo}`;
	for (const todo of todos) {
		await octokit.rest.issues.create({
			owner,
			repo,
			title: buildIssueTitle(todo),
			body: buildIssueBody(todo, repoUrl, github.context.sha),
			labels: ["todo"],
		});
	}
}

export async function run(): Promise<void> {
	const inputs = loadInputs();
	const { owner, repo } = github.context.repo;
	const octokit = github.getOctokit(inputs.github_token);
	const regex = buildTodoRegex(inputs.keywords);

	if (github.context.eventName === "pull_request") {
		await handlePullRequest(octokit, owner, repo, inputs, regex);
	} else if (github.context.eventName === "push") {
		await handlePush(octokit, owner, repo, inputs, regex);
	} else {
		core.warning(`Unsupported event: ${github.context.eventName}`);
	}
}
