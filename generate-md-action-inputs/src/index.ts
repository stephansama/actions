import * as core from "@actions/core";
import { markdownTable } from "markdown-table";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as yaml from "yaml";
import { $ as sh } from "zx";

sh.verbose = true;

type Inputs = ReturnType<typeof loadInputs>;

type ActionInputOptions = {
	default?: string;
	description?: string;
	required?: boolean;
};

type ActionType = { inputs?: Record<string, ActionInputOptions> };

type GitProvider = keyof typeof GitProviders;

const GitProviders = {
	github: "https://github.com",
	gitlab: "",
};

if (require.main === module) run();

async function run() {
	const inputs = loadInputs();
	await setupGit(inputs);
	const readmes = await updateLocalActionReadmes(inputs);
	if (inputs.skip_commit) {
		await debugCommit(inputs, readmes);
	} else {
		await commitReadmes(inputs, readmes);
	}
}

function createHeading(inputs: Inputs) {
	return `${Array.from({ length: parseInt(inputs.heading_level) }, () => "#").join("")} ${inputs.heading}`;
}

async function getGitRoot() {
	return (await sh`git rev-parse --show-toplevel`).stdout.trim();
}

async function getActionsPaths(gitRoot: string) {
	return (
		await sh`
cd ${gitRoot}
find . -type f -name 'action.y*ml'
`
	).stdout
		.split("\n")
		.filter(Boolean)
		.map((p) => path.resolve(gitRoot, p));
}

function buildCommentTags(tagName: string) {
	return [
		`<!-- ${tagName}:START -->` as const,
		`<!-- ${tagName}:END -->` as const,
	] as const;
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

	const tableHeading = ["Name", "Default", "Description", "Required"];

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

				if (!action.readme)
					throw new Error("somehow couldn't open readme");

				const readmeLines = action.readme.split("\n");

				const startIndex = readmeLines.findIndex(
					(f) => f.trim() === startTag,
				);

				const endIndex = readmeLines.findIndex(
					(f) => f.trim() === endTag,
				);

				if (!endIndex) throw new Error("found unclosed comment tag");

				const heading = createHeading(inputs);
				const table = markdownTable([tableHeading, ...entries]);
				const start = startIndex + 1;
				const end = Math.max(0, endIndex - startIndex - 1);

				readmeLines.splice(start, end, "", heading, table, "");

				await fsp.writeFile(action.readmePath, readmeLines.join("\n"));

				return action.readmePath;
			}),
		)
	).filter((f) => f !== "false");
}

async function setupGit(inputs: Inputs) {
	await sh`
git config --global user.email ${inputs.committer_email}
git config --global user.name ${inputs.committer_username}
`;

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

async function debugCommit(inputs: Inputs, readmes: string[]) {
	await gitAddReadmes(readmes);

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

export function loadInputs() {
	if (process.env.LOGNAME === "stephanrandle") {
		return {
			// action: "stephansama/actions/generate-md-action-inputs",
			// ref: "feature/generate-md-action-input",
			action: "remix-run/release-comment-action",
			base_branch: "main",
			heading: "⚙️ Inputs",
			heading_level: "3",
			readme_path: "./README.md",
			skip_commit: JSON.parse("true") as boolean,
			git_provider: "github" as GitProvider,
			comment_tag_name: "ACTION-INPUT-LIST",
		};
	}

	const action = core.getInput("action", {
		trimWhitespace: true,
		required: true,
	});

	const base_branch = core.getInput("base_branch", { trimWhitespace: true });

	const heading = core.getInput("heading", { trimWhitespace: true });
	const heading_level = core.getInput("heading_level", {
		trimWhitespace: true,
	});
	const commit_message = core.getInput("commit_message", {
		trimWhitespace: true,
	});

	const committer_username = core.getInput("committer_username", {
		trimWhitespace: true,
	});
	const committer_email = core.getInput("committer_email", {
		trimWhitespace: true,
	});

	const ref = core.getInput("ref", { trimWhitespace: true });

	const gh_token = core.getInput("gh_token", { trimWhitespace: true });

	const comment_tag_name = core.getInput("comment_tag_name", {
		trimWhitespace: true,
	});

	const skip_commit = JSON.parse(
		core.getInput("skip_commit", {
			trimWhitespace: true,
		}),
	) as boolean;

	const git_provider = core.getInput("git_provider", {
		trimWhitespace: true,
	});

	const readme_path = core.getInput("readme_path", { trimWhitespace: true });

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
