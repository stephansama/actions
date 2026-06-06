import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as ini from "ini";
import { markdownTable } from "markdown-table";
import * as fs from "node:fs/promises";
import * as url from "node:url";
import { z } from "zod";

const StrategySchema = z.enum(["commit", "tag"]);
export type Strategy = z.infer<typeof StrategySchema>;

const SubmoduleEntrySchema = z.object({
	branch: z.string().optional(),
	path: z.string(),
	url: z.string(),
});

const AUTH_HEADER_CONFIG_KEY = "http.https://github.com/.extraheader";

const GITHUB_URL_PATTERNS = [
	/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/,
	/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?\/?$/,
	/^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/,
	/^git:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/,
];

const SUBMODULE_SECTION_PATTERN = /^submodule\s+"(.+)"$/;

export type EnrichedSubmodule = ParsedSubmodule & {
	previousCommitSha: string;
	previousCommitShaHasTag: boolean;
	previousShortCommitSha: string;
	previousTag: string | undefined;
};

export type Inputs = {
	gitmodulesPath: string;
	strategy: Strategy;
	submodules: string[];
	token: string;
};

export type ParsedSubmodule = {
	name: string;
	path: string;
	remoteName: string | undefined;
	url: string;
};

export type UpdatedSubmodule = EnrichedSubmodule & {
	latestCommitSha: string;
	latestShortCommitSha: string;
	latestTag: string | undefined;
	updated: boolean;
};

export function buildPrBody(
	records: UpdatedSubmodule[],
	strategy: Strategy,
): string {
	if (records.length === 0) return "";
	const header =
		strategy === "tag"
			? ["Submodule", "Previous Tag", "Latest Tag"]
			: ["Submodule", "Previous Commit", "Latest Commit"];

	const rows = records.map((r) => {
		const name = r.remoteName
			? `[${r.name}](https://github.com/${r.remoteName})`
			: r.name;
		if (strategy === "tag") {
			const compare =
				r.remoteName && r.previousTag && r.latestTag
					? `[${r.previousTag}...${r.latestTag}](https://github.com/${r.remoteName}/compare/${r.previousTag}...${r.latestTag})`
					: `${r.previousTag ?? "—"} → ${r.latestTag ?? "—"}`;
			return [name, r.previousTag ?? "—", compare];
		}
		const compare = r.remoteName
			? `[${r.previousShortCommitSha}...${r.latestShortCommitSha}](https://github.com/${r.remoteName}/compare/${r.previousCommitSha}...${r.latestCommitSha})`
			: `${r.previousShortCommitSha} → ${r.latestShortCommitSha}`;
		return [name, r.previousShortCommitSha, compare];
	});

	return markdownTable([header, ...rows]);
}

export async function cleanupAuth(token: string): Promise<void> {
	if (!token) return;
	await exec.getExecOutput(
		"git",
		["config", "--local", "--unset-all", AUTH_HEADER_CONFIG_KEY],
		{ ignoreReturnCode: true },
	);
}

export async function configureAuth(token: string): Promise<void> {
	if (!token) return;
	const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
	await exec.getExecOutput("git", [
		"config",
		"--local",
		AUTH_HEADER_CONFIG_KEY,
		`AUTHORIZATION: basic ${basic}`,
	]);
}

export async function enrichSubmodule(
	submodule: ParsedSubmodule,
): Promise<EnrichedSubmodule> {
	const [previousCommitSha, previousShortCommitSha] = await getCommit(
		submodule.path,
	);
	const previousTag = await getPreviousTag(submodule.path);
	const previousCommitShaHasTag = await hasTag(
		submodule.path,
		previousCommitSha,
	);
	return {
		...submodule,
		previousCommitSha,
		previousCommitShaHasTag,
		previousShortCommitSha,
		previousTag,
	};
}

export function filterSubmodules(
	submodules: EnrichedSubmodule[],
	filter: string[],
	strategy: Strategy,
): EnrichedSubmodule[] {
	let result = submodules;
	if (filter.length > 0) {
		result = result.filter(
			(s) => filter.includes(s.name) || filter.includes(s.path),
		);
	}
	if (strategy === "tag") {
		result = result.filter((s) => s.previousTag !== undefined);
	}
	return result;
}

export async function getCommit(cwd: string): Promise<[string, string]> {
	const { stdout } = await exec.getExecOutput("git", ["rev-parse", "HEAD"], {
		cwd,
	});
	const full = stdout.trim();
	return [full, full.slice(0, 7)];
}

export async function getLatestTag(cwd: string): Promise<string | undefined> {
	await exec.getExecOutput("git", ["fetch", "--tags", "--force"], {
		cwd,
		ignoreReturnCode: true,
	});
	return getPreviousTag(cwd);
}

export async function getPreviousTag(cwd: string): Promise<string | undefined> {
	const { exitCode, stdout } = await exec.getExecOutput(
		"git",
		["describe", "--abbrev=0", "--tags"],
		{ cwd, ignoreReturnCode: true },
	);
	if (exitCode !== 0) return undefined;
	return stdout.trim() || undefined;
}

export function getRemoteName(repoUrl: string): string | undefined {
	for (const pattern of GITHUB_URL_PATTERNS) {
		const match = repoUrl.match(pattern);
		if (match) return match[1];
	}
	return undefined;
}

export async function hasTag(cwd: string, sha: string): Promise<boolean> {
	const { exitCode, stdout } = await exec.getExecOutput(
		"git",
		["tag", "--points-at", sha],
		{ cwd, ignoreReturnCode: true },
	);
	if (exitCode !== 0) return false;
	return stdout.trim().length > 0;
}

export function loadInputs(): Inputs {
	const gitmodulesPath = core.getInput("gitmodulesPath") || ".gitmodules";
	const strategy = StrategySchema.parse(
		core.getInput("strategy") || "commit",
	);
	const submodules = core
		.getInput("submodules")
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean);
	const token = core.getInput("token") || "";
	if (token) core.setSecret(token);
	return { gitmodulesPath, strategy, submodules, token };
}

export async function parseGitmodulesFile(
	filePath: string,
): Promise<ParsedSubmodule[]> {
	const contents = await fs.readFile(filePath, "utf8");
	const parsed = ini.parse(contents) as Record<string, unknown>;
	const entries: Array<[string, unknown]> = [];

	for (const [key, value] of Object.entries(parsed)) {
		const flatMatch = key.match(SUBMODULE_SECTION_PATTERN);
		if (flatMatch) {
			entries.push([flatMatch[1], value]);
			continue;
		}
		if (key === "submodule" && value && typeof value === "object") {
			for (const [name, raw] of Object.entries(
				value as Record<string, unknown>,
			)) {
				entries.push([name, raw]);
			}
		}
	}

	return entries.map(([name, raw]) => {
		const entry = SubmoduleEntrySchema.parse(raw);
		return {
			name,
			path: entry.path,
			remoteName: getRemoteName(entry.url),
			url: entry.url,
		};
	});
}

export async function run(): Promise<void> {
	let token = "";
	try {
		const inputs = loadInputs();
		token = inputs.token;
		await configureAuth(token);

		const parsed = await parseGitmodulesFile(inputs.gitmodulesPath);
		const enriched = await Promise.all(
			parsed.map(async (s) => enrichSubmodule(s)),
		);
		const filtered = filterSubmodules(
			enriched,
			inputs.submodules,
			inputs.strategy,
		);

		const records =
			inputs.strategy === "tag"
				? await updateToLatestTag(filtered)
				: await updateToLatestCommit(filtered);

		core.setOutput("json", JSON.stringify(records));
		core.setOutput("matrix", JSON.stringify({ include: records }));
		core.setOutput("prBody", buildPrBody(records, inputs.strategy));

		for (const record of records) {
			setDynamicOutputs(record, inputs.strategy);
		}
	} catch (error) {
		core.setFailed(error instanceof Error ? error.message : String(error));
	} finally {
		await cleanupAuth(token);
	}
}

export function setDynamicOutputs(
	record: UpdatedSubmodule,
	strategy: Strategy,
): void {
	const fields: Array<[string, boolean | string | undefined]> = [
		["updated", record.updated],
		["path", record.path],
		["url", record.url],
		["remoteName", record.remoteName],
		["previousShortCommitSha", record.previousShortCommitSha],
		["previousCommitSha", record.previousCommitSha],
		["previousTag", record.previousTag],
		["previousCommitShaHasTag", record.previousCommitShaHasTag],
		["latestShortCommitSha", record.latestShortCommitSha],
		["latestCommitSha", record.latestCommitSha],
		["prBody", buildPrBody([record], strategy)],
	];
	if (strategy === "tag") {
		fields.push(["latestTag", record.latestTag]);
	}
	for (const prefix of [record.name, record.path]) {
		for (const [key, value] of fields) {
			core.setOutput(`${prefix}--${key}`, value);
		}
	}
}

export async function updateToLatestCommit(
	submodules: EnrichedSubmodule[],
): Promise<UpdatedSubmodule[]> {
	return Promise.all(
		submodules.map(async (s) => {
			await exec.getExecOutput("git", [
				"submodule",
				"update",
				"--remote",
				s.path,
			]);
			const [latestCommitSha, latestShortCommitSha] = await getCommit(
				s.path,
			);
			return {
				...s,
				latestCommitSha,
				latestShortCommitSha,
				latestTag: undefined,
				updated: latestCommitSha !== s.previousCommitSha,
			};
		}),
	);
}

export async function updateToLatestTag(
	submodules: EnrichedSubmodule[],
): Promise<UpdatedSubmodule[]> {
	return Promise.all(
		submodules.map(async (s) => {
			const latestTag = await getLatestTag(s.path);
			if (!latestTag) {
				return {
					...s,
					latestCommitSha: s.previousCommitSha,
					latestShortCommitSha: s.previousShortCommitSha,
					latestTag: undefined,
					updated: false,
				};
			}
			await exec.getExecOutput("git", ["reset", "--hard", latestTag], {
				cwd: s.path,
			});
			const [latestCommitSha, latestShortCommitSha] = await getCommit(
				s.path,
			);
			return {
				...s,
				latestCommitSha,
				latestShortCommitSha,
				latestTag,
				updated: latestTag !== s.previousTag,
			};
		}),
	);
}

const argv = process.argv.at(1);
if (url.fileURLToPath(import.meta.url) === argv) await run();
