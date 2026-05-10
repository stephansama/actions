import * as core from "@actions/core";
import { markdownTable } from "markdown-table";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";
import * as url from "node:url";
import * as yaml from "yaml";
import { $ as sh } from "zx";

export type ActionData = Awaited<ReturnType<typeof loadActionData>>;

export type ActionType = { inputs?: Record<string, ActionInputOptions> };
export type BuiltCommentTags = ReturnType<typeof buildCommentTags>;
export type GitProvider = keyof typeof GitProviders;
export type Inputs = ReturnType<typeof loadInputs>;
export type TableHeading = "name" | keyof ActionInputOptions;
type ActionInputOptions = {
	default?: string;
	description?: string;
	required?: boolean;
};

const actionsRegex = /action.ya?ml/;

const GitProviders = {
	github: "https://github.com",
	gitlab: "https://gitlab.com",
} as const;

const TableOrder = [
	"name",
	"default",
	"description",
	"required",
] as const satisfies TableHeading[];

const argv = process.argv.at(1);

if (url.fileURLToPath(import.meta.url) === argv) await run();

export function buildCommentTags(tagName: string) {
	if (!tagName) {
		throw new Error("not able to build comment tag based on tagName");
	}

	const name = tagName.replaceAll(/\s+/g, "-").toUpperCase();
	return [
		`<!-- ${name}:START -->` as const,
		`<!-- ${name}:END -->` as const,
	] as const;
}

export function capitalize(word: string) {
	return word.length > 1 ? word.at(0)?.toUpperCase() + word.slice(1) : word;
}

export async function commitReadmes(inputs: Inputs, readmes: string[]) {
	if (readmes.length === 0) return console.error("no readmes to commit");

	await sh` git commit -m ${inputs.commit_message} `;
	await sh` git push `;

	console.info("pushed readme changes");
}

export function createHeading(inputs: Inputs) {
	const [min, max] = [1, 6];
	const length = Math.min(
		Math.max(Number.parseInt(inputs.heading_level) || 3, min),
		max,
	);
	const headingLevel = Array.from({ length: length }).fill("#").join("");
	return `${headingLevel} ${inputs.heading}`;
}

export function createTable(inputs: Inputs, entries: string[][]) {
	const tableHeading = TableOrder.map((word) => capitalize(word));
	const sectionHeading = createHeading(inputs);
	const table = markdownTable([tableHeading, ...entries]);

	return ["", sectionHeading, table, ""];
}

export async function debugCommit(readmes: string[]) {
	for (const readme of readmes) {
		console.info(`printing readme at ${readme}`);
		await sh`cat ${readme}`;
	}

	await sh` git status `;
}

export function findIndices(
	lines: string[],
	tags: BuiltCommentTags,
): [number, number] {
	const [startIndex, endIndex] = tags.map((tag) => lines.lastIndexOf(tag));

	if (startIndex === -1 || endIndex === -1) {
		throw new Error("not able to find start or end comment index");
	}

	if (endIndex < startIndex) {
		throw new Error("end tag appears before start tag");
	}

	return [startIndex, endIndex];
}

export async function getActionsPaths(gitRoot: string) {
	const { stdout } = await sh`
cd ${gitRoot}
find . -type f -name 'action.y*ml'
`;
	return stdout
		.split("\n")
		.filter(Boolean)
		.map((p) => path.resolve(gitRoot, p));
}

export async function getGitRoot() {
	const output = await sh`git rev-parse --show-toplevel`;
	return output.stdout.trim();
}

export function isValidActionData(tags: BuiltCommentTags) {
	return (actionData: ActionData) => {
		if (!actionData.readme || !actionData.data?.inputs) return false;
		const lines = actionData.readme.split("\n");
		return tags.every((tag) => lines.some((l) => l.trim() === tag));
	};
}

export async function loadActionData(actionPath: string) {
	const options: { encoding: BufferEncoding } = { encoding: "utf8" };
	const file = await fsp.readFile(actionPath, options);
	const data = yaml.parse(file) as ActionType;
	const readmePath = actionPath.replace(actionsRegex, "README.md");
	const readme =
		fs.existsSync(readmePath) && (await fsp.readFile(readmePath, options));
	return { actionPath, data, readme, readmePath };
}

export function loadInputs(options: core.InputOptions = {}) {
	options.trimWhitespace ??= true;

	const comment_tag_name = core.getInput("comment_tag_name", options);
	const commit_message = core.getInput("commit_message", options);
	const committer_email = core.getInput("committer_email", options);
	const committer_username = core.getInput("committer_username", options);
	const gh_token = core.getInput("gh_token", options);
	const git_provider = core.getInput("git_provider", options);
	const heading = core.getInput("heading", options);
	const heading_level = core.getInput("heading_level", options);
	const skip_commit = core.getBooleanInput("skip_commit", options);
	const verbose = core.getBooleanInput("verbose", options);

	if (verbose) sh.verbose = true;

	const GitProviderKeys = Object.keys(GitProviders);
	if (!GitProviderKeys.includes(git_provider)) {
		const possible = GitProviderKeys.join(",");
		throw new Error(`git_provider must be one of ${possible}`);
	}

	return {
		comment_tag_name,
		commit_message,
		committer_email,
		committer_username,
		gh_token,
		git_provider: git_provider as GitProvider,
		heading,
		heading_level,
		skip_commit,
	};
}

export async function run() {
	const inputs = loadInputs();

	await setupGit(inputs);

	const readmes = await updateLocalActionReadmes(inputs);

	for (const readme of readmes) {
		await sh` git add ${readme} `;
	}

	await (inputs.skip_commit
		? debugCommit(readmes)
		: commitReadmes(inputs, readmes));
}

export async function setupGit(inputs: Inputs) {
	await sh` git config --global user.email ${inputs.committer_email} `;
	await sh` git config --global user.name ${inputs.committer_username} `;

	if (inputs.gh_token) {
		console.info("setting gh token");
		const origin = `https://${inputs.gh_token}@github.com/${process.env.GITHUB_REPOSITORY}.git`;
		await sh` git remote set-url origin ${origin} `;
	}

	await sh` git config pull.rebase true `;
	await sh` git pull `;
}

export async function updateLocalActionReadmes(inputs: Inputs) {
	const gitRoot = await getGitRoot();
	const actions = await getActionsPaths(gitRoot);
	const tags = buildCommentTags(inputs.comment_tag_name);

	const allActionsData = await Promise.all(
		actions.map(async (current) => await loadActionData(current)),
	);

	const actionsData = allActionsData.filter(isValidActionData(tags));

	if (actionsData.length === 0) {
		console.info("no inputs found not updating any readmes");
		return [];
	}

	const writePromises = actionsData.map(writeActionsData(inputs, tags));

	const writes = await Promise.all(writePromises);

	return writes.filter((f) => f !== "false");
}

export function writeActionsData(inputs: Inputs, tags: BuiltCommentTags) {
	return async (action: ActionData) => {
		if (!action.data.inputs) return "false";
		if (!action.readme) {
			throw new Error(
				"somehow couldn't open readme. [should never happen after previous checks]",
			);
		}

		const readmeLines = action.readme.split("\n");

		const entries = Object.entries(action.data.inputs).map(
			mapEntryToOrder(TableOrder),
		);

		const [startIndex, endIndex] = findIndices(readmeLines, tags);
		const start = startIndex + 1;
		const end = Math.max(0, endIndex - startIndex - 1);

		readmeLines.splice(start, end, ...createTable(inputs, entries));

		const newBody = readmeLines.join("\n");

		if (action.readme === newBody) {
			console.info(
				`readme at path ${action.readmePath} is unchanged not writing changes`,
			);
			return "false";
		}

		await fsp.writeFile(action.readmePath, newBody);

		return action.readmePath;
	};
}

function mapEntryToOrder(order: TableHeading[]) {
	return ([name, value]: [string, ActionInputOptions]) =>
		order.map((o) => (o === "name" ? name : value[o] + ""));
}
