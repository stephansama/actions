import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { markdownTable } from "markdown-table";
import * as url from "node:url";
import { z } from "zod";

const StrategySchema = z.enum(["commit", "tag"]);
export type Strategy = z.infer<typeof StrategySchema>;

const AUTH_HEADER_CONFIG_KEY = "http.https://github.com/.extraheader";

const INSTEAD_OF_CONFIG_KEY = "url.https://github.com/.insteadOf";

const GITHUB_URL_PATTERNS = [
	/^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/,
	/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?\/?$/,
	/^ssh:\/\/git@github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/,
	/^git:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/,
];

const SSH_URL_PATTERN = /^([^@\s]+)@([^:\s]+):(.+)$/;

const GIT_CONFIG_LINE_PATTERN = /^submodule\.(.+)\.(path|url)=(.*)$/;

const TRAILING_SLASH_PATTERN = /\/$/;

const NEWLINE_PATTERN = /\r?\n/;

export type EnrichedSubmodule = ParsedSubmodule & {
	previousCommitSha: string;
	previousCommitShaHasTag: boolean;
	previousShortCommitSha: string;
	previousTag: string | undefined;
};

export type Inputs = {
	gitmodulesPath: string;
	init: boolean;
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
		["config", "--global", "--unset-all", AUTH_HEADER_CONFIG_KEY],
		{ ignoreReturnCode: true },
	);
	await exec.getExecOutput(
		"git",
		["config", "--global", "--unset-all", INSTEAD_OF_CONFIG_KEY],
		{ ignoreReturnCode: true },
	);
}

export async function configureAuth(token: string): Promise<void> {
	if (!token) return;
	const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
	await exec.getExecOutput("git", [
		"config",
		"--global",
		AUTH_HEADER_CONFIG_KEY,
		`AUTHORIZATION: basic ${basic}`,
	]);
	// Rewrite SSH submodule URLs to HTTPS so the extraheader applies to them too.
	await exec.getExecOutput("git", [
		"config",
		"--global",
		"--add",
		INSTEAD_OF_CONFIG_KEY,
		"git@github.com:",
	]);
	await exec.getExecOutput("git", [
		"config",
		"--global",
		"--add",
		INSTEAD_OF_CONFIG_KEY,
		"ssh://git@github.com/",
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
): EnrichedSubmodule[] {
	if (filter.length === 0) return submodules;
	return submodules.filter(
		(s) => filter.includes(s.name) || filter.includes(s.path),
	);
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
	// Prefer the closest tag reachable from the just-fetched ref: respects branch
	// tracking (no surprise tags from unrelated branches) and still sees tags
	// that aren't yet reachable from local HEAD.
	const described = await exec.getExecOutput(
		"git",
		["describe", "--tags", "--abbrev=0", "FETCH_HEAD"],
		{ cwd, ignoreReturnCode: true },
	);
	if (described.exitCode === 0) {
		const tag = described.stdout.trim();
		if (tag) return tag;
	}
	// Fallback when FETCH_HEAD isn't set or describe can't resolve a tag —
	// e.g. an initial fetch with no upstream branch context.
	const sorted = await exec.getExecOutput(
		"git",
		["tag", "--sort=-v:refname"],
		{ cwd, ignoreReturnCode: true },
	);
	if (sorted.exitCode !== 0) return undefined;
	return sorted.stdout.split("\n")[0]?.trim() || undefined;
}

export async function getParentRemoteUrl(
	cwd = ".",
): Promise<string | undefined> {
	const { exitCode, stdout } = await exec.getExecOutput(
		"git",
		["remote", "get-url", "origin"],
		{ cwd, ignoreReturnCode: true },
	);
	if (exitCode !== 0) return undefined;
	return stdout.trim() || undefined;
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

export function getRemoteName(
	repoUrl: string,
	parentRemoteUrl?: string,
): string | undefined {
	const direct = matchGitHubUrl(repoUrl);
	if (direct) return direct;
	if (!parentRemoteUrl) return undefined;
	if (!repoUrl.startsWith("./") && !repoUrl.startsWith("../"))
		return undefined;
	try {
		const base = normalizeGitUrl(parentRemoteUrl);
		const baseWithSlash = base.endsWith("/") ? base : `${base}/`;
		const resolved = new URL(repoUrl, baseWithSlash);
		return matchGitHubUrl(
			resolved.href.replace(TRAILING_SLASH_PATTERN, ""),
		);
	} catch {
		return undefined;
	}
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

export async function initSubmodules(): Promise<void> {
	await exec.getExecOutput("git", ["submodule", "sync", "--recursive"]);
	await exec.getExecOutput("git", [
		"submodule",
		"update",
		"--init",
		"--force",
		"--recursive",
	]);
}

export function loadInputs(): Inputs {
	const gitmodulesPath = core.getInput("gitmodulesPath") || ".gitmodules";
	const init = core.getInput("init") ? core.getBooleanInput("init") : false;
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
	return { gitmodulesPath, init, strategy, submodules, token };
}

export async function parseGitmodulesFile(
	filePath: string,
	parentRemoteUrl?: string,
): Promise<ParsedSubmodule[]> {
	const { stdout } = await exec.getExecOutput("git", [
		"config",
		"-f",
		filePath,
		"--list",
	]);
	const submodules = new Map<string, { path?: string; url?: string }>();
	for (const line of stdout.split(NEWLINE_PATTERN)) {
		const m = line.match(GIT_CONFIG_LINE_PATTERN);
		if (!m) continue;
		const [, name, key, value] = m;
		const entry = submodules.get(name) ?? {};
		entry[key as "path" | "url"] = value;
		submodules.set(name, entry);
	}
	const result: ParsedSubmodule[] = [];
	for (const [name, s] of submodules) {
		if (!s.path || !s.url) continue;
		result.push({
			name,
			path: s.path,
			remoteName: getRemoteName(s.url, parentRemoteUrl),
			url: s.url,
		});
	}
	return result;
}

export async function run(): Promise<void> {
	let token = "";
	try {
		const inputs = loadInputs();
		token = inputs.token;
		await configureAuth(token);
		if (inputs.init) await initSubmodules();

		const parentRemoteUrl = await getParentRemoteUrl();
		const parsed = await parseGitmodulesFile(
			inputs.gitmodulesPath,
			parentRemoteUrl,
		);
		const enriched: EnrichedSubmodule[] = [];
		for (const s of parsed) {
			enriched.push(await enrichSubmodule(s));
		}
		const filtered = filterSubmodules(enriched, inputs.submodules);

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
	const records: UpdatedSubmodule[] = [];
	for (const s of submodules) {
		await exec.getExecOutput("git", [
			"submodule",
			"update",
			"--remote",
			s.path,
		]);
		const [latestCommitSha, latestShortCommitSha] = await getCommit(s.path);
		records.push({
			...s,
			latestCommitSha,
			latestShortCommitSha,
			latestTag: undefined,
			updated: latestCommitSha !== s.previousCommitSha,
		});
	}
	return records;
}

export async function updateToLatestTag(
	submodules: EnrichedSubmodule[],
): Promise<UpdatedSubmodule[]> {
	const records: UpdatedSubmodule[] = [];
	for (const s of submodules) {
		const latestTag = await getLatestTag(s.path);
		if (!latestTag) {
			records.push({
				...s,
				latestCommitSha: s.previousCommitSha,
				latestShortCommitSha: s.previousShortCommitSha,
				latestTag: undefined,
				updated: false,
			});
			continue;
		}
		await exec.getExecOutput("git", ["reset", "--hard", latestTag], {
			cwd: s.path,
		});
		const [latestCommitSha, latestShortCommitSha] = await getCommit(s.path);
		records.push({
			...s,
			latestCommitSha,
			latestShortCommitSha,
			latestTag,
			updated: latestTag !== s.previousTag,
		});
	}
	return records;
}

function matchGitHubUrl(repoUrl: string): string | undefined {
	for (const pattern of GITHUB_URL_PATTERNS) {
		const match = repoUrl.match(pattern);
		if (match) return match[1];
	}
	return undefined;
}

function normalizeGitUrl(u: string): string {
	const m = u.match(SSH_URL_PATTERN);
	return m ? `ssh://${m[1]}@${m[2]}/${m[3]}` : u;
}

const argv = process.argv.at(1);
if (url.fileURLToPath(import.meta.url) === argv) await run();
