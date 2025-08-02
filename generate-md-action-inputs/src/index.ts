import * as core from "@actions/core";
import { markdownTable } from "markdown-table";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as yaml from "yaml";
import { $ as sh } from "zx";

type ActionInputOptions = {
	default?: string;
	description?: string;
	required?: boolean;
};

export type ActionType = { inputs?: Record<string, ActionInputOptions> };
export type GitProvider = keyof typeof GitProviders;
export type TableHeading = keyof ActionInputOptions | "name";
export type Inputs = ReturnType<typeof loadInputs>;
export type ActionData = Awaited<ReturnType<typeof loadActionData>>;
export type BuiltCommentTags = ReturnType<typeof buildCommentTags>;

const GitProviders = {
	github: "https://github.com",
	gitlab: "https://gitlab.com",
};

const TableOrder: TableHeading[] = [
	"name",
	"default",
	"description",
	"required",
];

if (require.main === module) run();

export async function run() {
	const inputs = loadInputs();

	await setupGit(inputs);

	const readmes = await updateLocalActionReadmes(inputs);

	await gitAddReadmes(readmes);

	if (inputs.skip_commit) {
		await debugCommit(readmes);
	} else {
		await commitReadmes(inputs, readmes);
	}
}

function mapEntryToOrder(order: TableHeading[]) {
	return ([name, value]: [string, ActionInputOptions]) =>
		order.map((o) => (o === "name" ? name : value[o] + ""));
}

export function createHeading(inputs: Inputs) {
	const [min, max] = [1, 6];
	const length = Math.min(
		Math.max(parseInt(inputs.heading_level) || 3, min),
		max,
	);
	const headingLevel = Array.from({ length }, () => "#").join("");
	return `${headingLevel} ${inputs.heading}`;
}

export async function getGitRoot() {
	return (await sh`git rev-parse --show-toplevel`).stdout.trim();
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

export function buildCommentTags(tagName: string) {
	if (!tagName) {
		throw new Error("not able to build comment tag based on tagName");
	}

	const name = tagName.replace(/\s+/g, "-").toUpperCase();
	return [
		`<!-- ${name}:START -->` as const,
		`<!-- ${name}:END -->` as const,
	] as const;
}

export function findIndices(
	lines: string[],
	[startTag, endTag]: BuiltCommentTags,
): [number, number] {
	const startIndex = lines.lastIndexOf(startTag);
	const endIndex = lines.lastIndexOf(endTag);

	if (startIndex === -1 || endIndex === -1) {
		throw new Error("not able to find start or end comment index");
	}

	return [startIndex, endIndex];
}

export async function loadActionData(actionPath: string) {
	const opts: { encoding: BufferEncoding } = { encoding: "utf8" };
	const file = await fsp.readFile(actionPath, opts);
	const data = yaml.parse(file) as ActionType;
	const readmePath = actionPath.replace(/action.y*ml/, "README.md");
	const readme =
		fs.existsSync(readmePath) && (await fsp.readFile(readmePath, opts));
	return { actionPath, data, readme, readmePath };
}

export function isValidActionData([startTag, endTag]: BuiltCommentTags) {
	return (actionData: ActionData) => {
		if (!actionData.readme) return false;
		const lines = actionData.readme.split("\n");
		return (
			actionData.data?.inputs &&
			lines.some((f) => f.trim() === startTag) &&
			lines.some((f) => f.trim() === endTag)
		);
	};
}

export function createTable(inputs: Inputs, entries: string[][]) {
	const tableHeading = TableOrder.map(capitalize);
	const sectionHeading = createHeading(inputs);
	const table = markdownTable([tableHeading, ...entries]);

	return ["", sectionHeading, table, ""];
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

export async function updateLocalActionReadmes(inputs: Inputs) {
	const gitRoot = await getGitRoot();
	const actions = await getActionsPaths(gitRoot);
	const tags = buildCommentTags(inputs.comment_tag_name);

	const actionsData = (await Promise.all(actions.map(loadActionData))).filter(
		isValidActionData(tags),
	);

	if (!actionsData.length) {
		console.info("no inputs found not updating any readmes");
		return [];
	}

	const writePromises = actionsData.map(writeActionsData(inputs, tags));

	return (await Promise.all(writePromises)).filter((f) => f !== "false");
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

export async function gitAddReadmes(readmes: string[]) {
	for (const readme of readmes) {
		await sh` git add ${readme} `;
	}
}

export async function commitReadmes(inputs: Inputs, readmes: string[]) {
	if (!readmes.length) return console.error("no readmes to commit");

	await sh` git commit -m ${inputs.commit_message} `;
	await sh` git push `;

	console.info("pushed readme changes");
}

export async function debugCommit(readmes: string[]) {
	for (const readme of readmes) {
		console.info(`printing readme at ${readme}`);
		await sh`cat ${readme}`;
	}

	await sh` git status `;
}

export async function loadRemoteActionFile(inputs: Inputs) {
	const actionPath = inputs.action.split("/");
	const repo = actionPath.slice(0, 2).join("/");
	const url = [GitProviders[inputs.git_provider], repo].join("/");

	const branch = inputs.ref || inputs.base_branch;

	const tmpBaseDir = "./tmp";

	await sh`
rm -rf ${tmpBaseDir}
git init ${tmpBaseDir} 
cd ${tmpBaseDir}

git remote add origin ${url}
git config core.sparseCheckout true

echo "action.y*ml" > .git/info/sparse-checkout

git fetch origin ${branch}
git checkout ${branch}
	`;

	const joined = path.join(tmpBaseDir, actionPath.slice(3).join("/"));

	const dir = await fsp.readdir(joined);
	const filename = dir.find(
		(file) => file.startsWith("action.y") && file.endsWith("ml"),
	);

	if (!filename) {
		throw new Error("not able to find action.y*ml file");
	}

	const filepath = path.join(joined, filename);
	const file = await fsp.readFile(filepath, { encoding: "utf8" });
	const parsed = yaml.parse(file) as ActionType;

	if (!parsed.inputs) {
		throw new Error(
			`the requested action at ${inputs.action} does not have any inputs`,
		);
	}

	return parsed;
}

export function loadInputs(opts: core.InputOptions = { trimWhitespace: true }) {
	const action = core.getInput("action", { ...opts, required: true });
	const base_branch = core.getInput("base_branch", opts);
	const comment_tag_name = core.getInput("comment_tag_name", opts);
	const commit_message = core.getInput("commit_message", opts);
	const committer_email = core.getInput("committer_email", opts);
	const committer_username = core.getInput("committer_username", opts);
	const gh_token = core.getInput("gh_token", opts);
	const git_provider = core.getInput("git_provider", opts);
	const heading = core.getInput("heading", opts);
	const heading_level = core.getInput("heading_level", opts);
	const readme_path = core.getInput("readme_path", opts);
	const ref = core.getInput("ref", opts);
	const verbose = JSON.parse(core.getInput("verbose", opts) || "false");

	if (verbose) sh.verbose = true;

	const skip_commit = JSON.parse(
		core.getInput("skip_commit", opts) || "false",
	) as boolean;

	const GitProviderKeys = Object.keys(GitProviders);
	if (!GitProviderKeys.includes(git_provider)) {
		throw new Error(
			`git_provider must be one of ${GitProviderKeys.join()}`,
		);
	}

	return {
		action,
		base_branch,
		comment_tag_name,
		commit_message,
		committer_email,
		committer_username,
		gh_token,
		git_provider: git_provider as GitProvider,
		heading,
		heading_level,
		readme_path,
		ref,
		skip_commit,
	};
}

export function capitalize(word: string) {
	return word.length > 1 ? word.at(0)?.toUpperCase() + word.slice(1) : word;
}
