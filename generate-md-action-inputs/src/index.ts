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
export type TableHeading = keyof ActionInputOptions | "name";
export type GitProvider = keyof typeof GitProviders;
export type Inputs = ReturnType<typeof loadInputs>;

const GitProviders = {
	github: "https://github.com",
	gitlab: "https://gitlab.com",
};

function createTableHeading() {
	const order: TableHeading[] = [
		"name",
		"default",
		"description",
		"required",
	];

	return order.map(capitalize);
}

if (require.main === module) run();

async function run() {
	const inputs = loadInputs();

	await setupGit(inputs);

	const readmes = await updateLocalActionReadmes(inputs);
	if (inputs.skip_commit) {
		await debugCommit(readmes);
	} else {
		await commitReadmes(inputs, readmes);
	}
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

async function getGitRoot() {
	return (await sh`git rev-parse --show-toplevel`).stdout.trim();
}

async function getActionsPaths(gitRoot: string) {
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
	return [
		`<!-- ${tagName}:START -->` as const,
		`<!-- ${tagName}:END -->` as const,
	] as const;
}

export function findIndices(
	lines: string[],
	[startTag, endTag]: ReturnType<typeof buildCommentTags>,
) {
	const startIndex = lines.lastIndexOf(startTag);
	const endIndex = lines.lastIndexOf(endTag);

	if (!startIndex || !endIndex) {
		throw new Error("not able to find start or end comment index");
	}

	return [startIndex, endIndex];
}

export async function updateLocalActionReadmes(inputs: Inputs) {
	const gitRoot = await getGitRoot();
	const actions = await getActionsPaths(gitRoot);
	const [startTag, endTag] = buildCommentTags(inputs.comment_tag_name);

	const yamlActions = (
		await Promise.all(
			actions.map(async (actionPath) => {
				const file = await fsp.readFile(actionPath, {
					encoding: "utf8",
				});
				const data = yaml.parse(file) as ActionType;
				const readmePath = actionPath.replace(
					/action.y*ml/,
					"README.md",
				);
				const readme =
					fs.existsSync(readmePath) &&
					(await fsp.readFile(readmePath, { encoding: "utf8" }));
				return { actionPath, data, readme, readmePath };
			}),
		)
	).filter(
		(a) =>
			a.data.inputs &&
			typeof a.readme === "string" &&
			a.readme.split("\n").some((f) => f.trim() === startTag),
	);

	return (
		await Promise.all(
			yamlActions.map(async (action) => {
				if (!action.data.inputs) return "false";

				const entries = Object.entries(action.data.inputs).map(
					([name, value]) => [
						name,
						value.default || "",
						value.description || "",
						(value.required || false) + "",
					],
				);

				if (!action.readme) {
					throw new Error("somehow couldn't open readme");
				}

				const readmeLines = action.readme.split("\n");

				const [startIndex, endIndex] = findIndices(readmeLines, [
					startTag,
					endTag,
				]);

				if (!endIndex) throw new Error("found unclosed comment tag");

				const tableHeading = createTableHeading();
				const sectionHeading = createHeading(inputs);
				const table = markdownTable([tableHeading, ...entries]);
				const start = startIndex + 1;
				const end = Math.max(0, endIndex - startIndex - 1);

				readmeLines.splice(start, end, "", sectionHeading, table, "");

				const newBody = readmeLines.join("\n");

				if (action.readme === newBody) {
					console.info(
						`readme at path ${action.readmePath} is unchanged not writing changes`,
					);
					return "false";
				}

				await fsp.writeFile(action.readmePath, newBody);

				return action.readmePath;
			}),
		)
	).filter((f) => f !== "false");
}

async function setupGit(inputs: Inputs) {
	await sh` git config --global user.email ${inputs.committer_email} `;
	await sh` git config --global user.name ${inputs.committer_username} `;

	if (inputs.gh_token) {
		console.info("setting gh token");
		await sh`
git remote set-url origin https://${inputs.gh_token}@github.com/${process.env.GITHUB_REPOSITORY}.git
`;
	}

	await sh` git config pull.rebase true `;
	await sh` git pull `;
}

async function commitReadmes(inputs: Inputs, readmes: string[]) {
	if (!readmes.length) return console.info("no readmes to commit");

	await gitAddReadmes(readmes);

	await sh` git commit -m ${inputs.commit_message} `;
	await sh` git push `;

	console.info("committed readmes");
}

async function gitAddReadmes(readmes: string[]) {
	for (const readme of readmes) {
		await sh` git add ${readme} `;
	}
}

async function debugCommit(readmes: string[]) {
	await gitAddReadmes(readmes);

	for (const readme of readmes) {
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
	const verbose = JSON.parse(core.getInput("verbose", opts));

	if (verbose) sh.verbose = true;

	const skip_commit = JSON.parse(
		core.getInput("skip_commit", opts),
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

function capitalize(word: string) {
	return word.at(0)?.toUpperCase() + word.slice(1);
}
