import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import * as url from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getBooleanInput: vi.fn(),
	getExecOutput: vi.fn(),
	getInput: vi.fn(),
	setFailed: vi.fn(),
	setOutput: vi.fn(),
	setSecret: vi.fn(),
}));

vi.mock("@actions/core", () => ({
	getBooleanInput: mocks.getBooleanInput,
	getInput: mocks.getInput,
	setFailed: mocks.setFailed,
	setOutput: mocks.setOutput,
	setSecret: mocks.setSecret,
}));

vi.mock("@actions/exec", () => ({
	getExecOutput: mocks.getExecOutput,
}));

const okExec = (stdout = "", exitCode = 0) => ({
	exitCode,
	stderr: "",
	stdout,
});

const callKey = (call: unknown[]) => call[0] as string;
const callValue = (call: unknown[]) => call[1];

beforeEach(() => {
	vi.resetAllMocks();
	vi.resetModules();
});

describe("loadInputs", () => {
	it("returns defaults when nothing is set", async () => {
		mocks.getInput.mockReturnValue("");
		const { loadInputs } = await import("./index.js");
		expect(loadInputs()).toEqual({
			gitmodulesPath: ".gitmodules",
			init: false,
			strategy: "commit",
			submodules: [],
			token: "",
		});
		expect(mocks.setSecret).not.toHaveBeenCalled();
		expect(mocks.getBooleanInput).not.toHaveBeenCalled();
	});

	it("parses multi-line submodules and registers token as secret", async () => {
		const inputs: Record<string, string> = {
			gitmodulesPath: "custom.gitmodules",
			strategy: "tag",
			submodules: "first\n second \n\nthird\n",
			token: "ghp_abc",
		};
		mocks.getInput.mockImplementation((name: string) => inputs[name] ?? "");
		const { loadInputs } = await import("./index.js");
		expect(loadInputs()).toEqual({
			gitmodulesPath: "custom.gitmodules",
			init: false,
			strategy: "tag",
			submodules: ["first", "second", "third"],
			token: "ghp_abc",
		});
		expect(mocks.setSecret).toHaveBeenCalledWith("ghp_abc");
	});

	it("parses init: true via getBooleanInput when the raw input is non-empty", async () => {
		const inputs: Record<string, string> = { init: "true" };
		mocks.getInput.mockImplementation((name: string) => inputs[name] ?? "");
		mocks.getBooleanInput.mockReturnValue(true);
		const { loadInputs } = await import("./index.js");
		expect(loadInputs().init).toBe(true);
		expect(mocks.getBooleanInput).toHaveBeenCalledWith("init");
	});

	it("treats an explicit init: false the same as unset", async () => {
		const inputs: Record<string, string> = { init: "false" };
		mocks.getInput.mockImplementation((name: string) => inputs[name] ?? "");
		mocks.getBooleanInput.mockReturnValue(false);
		const { loadInputs } = await import("./index.js");
		expect(loadInputs().init).toBe(false);
	});

	it("rejects an invalid strategy", async () => {
		mocks.getInput.mockImplementation((name: string) =>
			name === "strategy" ? "merge" : "",
		);
		const { loadInputs } = await import("./index.js");
		expect(() => loadInputs()).toThrow();
	});
});

describe("configureAuth / cleanupAuth", () => {
	it("configureAuth no-ops without a token", async () => {
		const { configureAuth } = await import("./index.js");
		await configureAuth("");
		expect(mocks.getExecOutput).not.toHaveBeenCalled();
	});

	it("configureAuth sets the global extraheader git config so submodule cwd ops inherit", async () => {
		mocks.getExecOutput.mockResolvedValue(okExec());
		const { configureAuth } = await import("./index.js");
		await configureAuth("ghs_tok");
		const expectedBasic = Buffer.from("x-access-token:ghs_tok").toString(
			"base64",
		);
		expect(mocks.getExecOutput).toHaveBeenCalledWith("git", [
			"config",
			"--global",
			"http.https://github.com/.extraheader",
			`AUTHORIZATION: basic ${expectedBasic}`,
		]);
	});

	it("configureAuth adds insteadOf rewrites so SSH submodule URLs use the extraheader", async () => {
		mocks.getExecOutput.mockResolvedValue(okExec());
		const { configureAuth } = await import("./index.js");
		await configureAuth("ghs_tok");
		expect(mocks.getExecOutput).toHaveBeenCalledWith("git", [
			"config",
			"--global",
			"--add",
			"url.https://github.com/.insteadOf",
			"git@github.com:",
		]);
		expect(mocks.getExecOutput).toHaveBeenCalledWith("git", [
			"config",
			"--global",
			"--add",
			"url.https://github.com/.insteadOf",
			"ssh://git@github.com/",
		]);
	});

	it("cleanupAuth no-ops without a token", async () => {
		const { cleanupAuth } = await import("./index.js");
		await cleanupAuth("");
		expect(mocks.getExecOutput).not.toHaveBeenCalled();
	});

	it("cleanupAuth unsets both the extraheader and the insteadOf rewrites", async () => {
		mocks.getExecOutput.mockResolvedValue(okExec());
		const { cleanupAuth } = await import("./index.js");
		await cleanupAuth("ghs_tok");
		expect(mocks.getExecOutput).toHaveBeenCalledWith(
			"git",
			[
				"config",
				"--global",
				"--unset-all",
				"http.https://github.com/.extraheader",
			],
			{ ignoreReturnCode: true },
		);
		expect(mocks.getExecOutput).toHaveBeenCalledWith(
			"git",
			[
				"config",
				"--global",
				"--unset-all",
				"url.https://github.com/.insteadOf",
			],
			{ ignoreReturnCode: true },
		);
	});
});

describe("assertSubmodulesInitialized", () => {
	it("no-ops when the path list is empty", async () => {
		const { assertSubmodulesInitialized } = await import("./index.js");
		await assertSubmodulesInitialized([]);
		expect(mocks.getExecOutput).not.toHaveBeenCalled();
	});

	it("returns without throwing when every target path is initialized", async () => {
		mocks.getExecOutput.mockResolvedValue(
			okExec(
				[
					" abc1234567890abcdef1234567890abcdef12345 vendor/a (heads/main)",
					"+abc1234567890abcdef1234567890abcdef12345 vendor/b (heads/main)",
				].join("\n"),
			),
		);
		const { assertSubmodulesInitialized } = await import("./index.js");
		await expect(
			assertSubmodulesInitialized(["vendor/a", "vendor/b"]),
		).resolves.toBeUndefined();
		expect(mocks.getExecOutput).toHaveBeenCalledWith(
			"git",
			["submodule", "status", "--", "vendor/a", "vendor/b"],
			{ ignoreReturnCode: true },
		);
	});

	it("throws naming only the uninitialized paths when some are initialized and some aren't", async () => {
		mocks.getExecOutput.mockResolvedValue(
			okExec(
				[
					" abc1234567890abcdef1234567890abcdef12345 vendor/a (heads/main)",
					"-bcd1234567890abcdef1234567890abcdef12345 vendor/b",
					"-cde1234567890abcdef1234567890abcdef12345 vendor/c",
				].join("\n"),
			),
		);
		const { assertSubmodulesInitialized } = await import("./index.js");
		await expect(
			assertSubmodulesInitialized(["vendor/a", "vendor/b", "vendor/c"]),
		).rejects.toThrow(/vendor\/b, vendor\/c/);
	});

	it("error message tells the caller how to fix it (init: true or submodules: recursive)", async () => {
		mocks.getExecOutput.mockResolvedValue(
			okExec("-abc1234567890abcdef1234567890abcdef12345 vendor/a"),
		);
		const { assertSubmodulesInitialized } = await import("./index.js");
		await expect(
			assertSubmodulesInitialized(["vendor/a"]),
		).rejects.toThrow(/init: true|submodules: recursive/);
	});
});

describe("initSubmodules", () => {
	it("issues sync --recursive followed by update --init --force --recursive", async () => {
		const calls: string[][] = [];
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				calls.push(arguments_);
				return Promise.resolve(okExec(""));
			},
		);
		const { initSubmodules } = await import("./index.js");
		await initSubmodules();
		expect(calls).toEqual([
			["submodule", "sync", "--recursive"],
			["submodule", "update", "--init", "--force", "--recursive"],
		]);
	});
});

describe("getRemoteName", () => {
	it.each([
		["https://github.com/owner/repo", "owner/repo"],
		["https://github.com/owner/repo.git", "owner/repo"],
		["http://github.com/owner/repo.git", "owner/repo"],
		["https://x-access-token:abc@github.com/owner/repo.git", "owner/repo"],
		["git@github.com:owner/repo.git", "owner/repo"],
		["git@github.com:owner/repo", "owner/repo"],
		["ssh://git@github.com/owner/repo.git", "owner/repo"],
		["git://github.com/owner/repo.git", "owner/repo"],
	])("parses absolute %s as %s", async (input, expected) => {
		const { getRemoteName } = await import("./index.js");
		expect(getRemoteName(input)).toBe(expected);
	});

	it("returns undefined for non-GitHub URLs", async () => {
		const { getRemoteName } = await import("./index.js");
		expect(
			getRemoteName("https://gitlab.com/owner/repo.git"),
		).toBeUndefined();
	});

	it.each([
		[
			"../sibling.git",
			"https://github.com/owner/parent.git",
			"owner/sibling",
		],
		[
			"../../other-org/dep.git",
			"https://github.com/owner/parent.git",
			"other-org/dep",
		],
		["../sibling.git", "git@github.com:owner/parent.git", "owner/sibling"],
	])(
		"resolves relative %s against %s as %s",
		async (relative, parent, expected) => {
			const { getRemoteName } = await import("./index.js");
			expect(getRemoteName(relative, parent)).toBe(expected);
		},
	);

	it("returns undefined for relative URL with no parent URL", async () => {
		const { getRemoteName } = await import("./index.js");
		expect(getRemoteName("../sibling.git")).toBeUndefined();
	});

	it("returns undefined when parent URL is non-GitHub", async () => {
		const { getRemoteName } = await import("./index.js");
		expect(
			getRemoteName("../sibling.git", "file:///tmp/parent"),
		).toBeUndefined();
	});

	it("returns undefined for non-relative non-GitHub URL even when parent URL is given", async () => {
		const { getRemoteName } = await import("./index.js");
		expect(
			getRemoteName(
				"https://gitlab.com/owner/repo.git",
				"https://github.com/owner/parent.git",
			),
		).toBeUndefined();
	});

	it("returns undefined when the parent URL fails to parse as a URL", async () => {
		const { getRemoteName } = await import("./index.js");
		expect(
			getRemoteName("../sibling.git", "not::a::valid::url"),
		).toBeUndefined();
	});
});

describe("parseGitmodulesFile", () => {
	it("parses the canonical git config --list output", async () => {
		mocks.getExecOutput.mockResolvedValue(
			okExec(
				[
					"submodule.icons.path=vendor/icons",
					"submodule.icons.url=https://github.com/vscode-icons/vscode-icons.git",
					"submodule.fonts.path=vendor/fonts",
					"submodule.fonts.url=git@github.com:google/fonts.git",
				].join("\n"),
			),
		);
		const { parseGitmodulesFile } = await import("./index.js");
		const result = await parseGitmodulesFile(".gitmodules");
		expect(result).toEqual([
			{
				name: "icons",
				path: "vendor/icons",
				remoteName: "vscode-icons/vscode-icons",
				url: "https://github.com/vscode-icons/vscode-icons.git",
			},
			{
				name: "fonts",
				path: "vendor/fonts",
				remoteName: "google/fonts",
				url: "git@github.com:google/fonts.git",
			},
		]);
		expect(mocks.getExecOutput).toHaveBeenCalledWith("git", [
			"config",
			"-f",
			".gitmodules",
			"--list",
		]);
	});

	it("recovers submodule names that contain dots", async () => {
		mocks.getExecOutput.mockResolvedValue(
			okExec(
				[
					"submodule.libs.foo.path=vendor/foo",
					"submodule.libs.foo.url=https://github.com/o/foo.git",
				].join("\n"),
			),
		);
		const { parseGitmodulesFile } = await import("./index.js");
		const result = await parseGitmodulesFile(".gitmodules");
		expect(result).toEqual([
			{
				name: "libs.foo",
				path: "vendor/foo",
				remoteName: "o/foo",
				url: "https://github.com/o/foo.git",
			},
		]);
	});

	it("resolves relative submodule URLs using the parent remote URL", async () => {
		mocks.getExecOutput.mockResolvedValue(
			okExec(
				[
					"submodule.sibling.path=vendor/sibling",
					"submodule.sibling.url=../sibling.git",
				].join("\n"),
			),
		);
		const { parseGitmodulesFile } = await import("./index.js");
		const result = await parseGitmodulesFile(
			".gitmodules",
			"https://github.com/owner/parent.git",
		);
		expect(result[0]?.remoteName).toBe("owner/sibling");
	});

	it("ignores non-submodule config lines in the output", async () => {
		mocks.getExecOutput.mockResolvedValue(
			okExec(
				[
					"core.repositoryformatversion=0",
					"submodule.icons.path=vendor/icons",
					"submodule.icons.url=https://github.com/o/icons.git",
					"submodule.icons.branch=main",
					"",
				].join("\n"),
			),
		);
		const { parseGitmodulesFile } = await import("./index.js");
		const result = await parseGitmodulesFile(".gitmodules");
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("icons");
	});

	it("skips submodule entries missing path or url", async () => {
		mocks.getExecOutput.mockResolvedValue(
			okExec(
				[
					"submodule.incomplete.path=vendor/x",
					"submodule.icons.path=vendor/icons",
					"submodule.icons.url=https://github.com/o/icons.git",
				].join("\n"),
			),
		);
		const { parseGitmodulesFile } = await import("./index.js");
		const result = await parseGitmodulesFile(".gitmodules");
		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe("icons");
	});
});

describe("git helpers", () => {
	it("getCommit returns [full, short]", async () => {
		mocks.getExecOutput.mockResolvedValue(
			okExec("abc1234567890abcdef1234567890abcdef12345\n"),
		);
		const { getCommit } = await import("./index.js");
		expect(await getCommit("path")).toEqual([
			"abc1234567890abcdef1234567890abcdef12345",
			"abc1234",
		]);
	});

	it("getPreviousTag returns undefined when no tags exist", async () => {
		mocks.getExecOutput.mockResolvedValue(okExec("", 128));
		const { getPreviousTag } = await import("./index.js");
		expect(await getPreviousTag("path")).toBeUndefined();
	});

	it("getPreviousTag returns the tag when present", async () => {
		mocks.getExecOutput.mockResolvedValue(okExec("v1.2.3\n"));
		const { getPreviousTag } = await import("./index.js");
		expect(await getPreviousTag("path")).toBe("v1.2.3");
	});

	it("getPreviousTag returns undefined when stdout is empty even with exit 0", async () => {
		mocks.getExecOutput.mockResolvedValue(okExec("   \n"));
		const { getPreviousTag } = await import("./index.js");
		expect(await getPreviousTag("path")).toBeUndefined();
	});

	it("getLatestTag returns the tag reachable from the just-fetched ref (not an unrelated-branch tag)", async () => {
		const { getLatestTag } = await import("./index.js");
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				if (arguments_[0] === "fetch")
					return Promise.resolve(okExec(""));
				if (
					arguments_[0] === "describe" &&
					arguments_.at(-1) === "FETCH_HEAD"
				) {
					return Promise.resolve(okExec("v1.5.0\n"));
				}
				if (
					arguments_[0] === "tag" &&
					arguments_[1] === "--sort=-v:refname"
				) {
					// Would surface v2.0.0 if fallback was hit — but reachability check should pick v1.5.0
					return Promise.resolve(okExec("v2.0.0\nv1.5.0\nv1.0.0\n"));
				}
				return Promise.resolve(okExec(""));
			},
		);
		expect(await getLatestTag("path")).toBe("v1.5.0");
	});

	it("getLatestTag falls back to version-sort when describe FETCH_HEAD fails", async () => {
		const { getLatestTag } = await import("./index.js");
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				if (arguments_[0] === "fetch")
					return Promise.resolve(okExec(""));
				if (arguments_[0] === "describe")
					return Promise.resolve(okExec("", 128));
				if (
					arguments_[0] === "tag" &&
					arguments_[1] === "--sort=-v:refname"
				) {
					return Promise.resolve(okExec("v2.0.0\nv1.5.0\n"));
				}
				return Promise.resolve(okExec(""));
			},
		);
		expect(await getLatestTag("path")).toBe("v2.0.0");
	});

	it("getLatestTag returns undefined when there are no tags", async () => {
		const { getLatestTag } = await import("./index.js");
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				if (arguments_[0] === "fetch")
					return Promise.resolve(okExec(""));
				if (arguments_[0] === "describe")
					return Promise.resolve(okExec("", 128));
				if (arguments_[0] === "tag") return Promise.resolve(okExec(""));
				return Promise.resolve(okExec(""));
			},
		);
		expect(await getLatestTag("path")).toBeUndefined();
	});

	it("getParentRemoteUrl returns the origin URL", async () => {
		mocks.getExecOutput.mockResolvedValue(
			okExec("https://github.com/owner/repo.git\n"),
		);
		const { getParentRemoteUrl } = await import("./index.js");
		expect(await getParentRemoteUrl()).toBe(
			"https://github.com/owner/repo.git",
		);
	});

	it("getParentRemoteUrl returns undefined when no origin remote", async () => {
		mocks.getExecOutput.mockResolvedValue(okExec("", 128));
		const { getParentRemoteUrl } = await import("./index.js");
		expect(await getParentRemoteUrl()).toBeUndefined();
	});

	it("hasTag reports whether the sha has any tag pointing at it", async () => {
		const { hasTag } = await import("./index.js");
		mocks.getExecOutput.mockResolvedValueOnce(okExec("v1.0.0\n"));
		expect(await hasTag("path", "sha")).toBe(true);
		mocks.getExecOutput.mockResolvedValueOnce(okExec(""));
		expect(await hasTag("path", "sha")).toBe(false);
	});

	it("hasTag returns false when git exits non-zero", async () => {
		const { hasTag } = await import("./index.js");
		mocks.getExecOutput.mockResolvedValueOnce(okExec("", 128));
		expect(await hasTag("path", "sha")).toBe(false);
	});
});

describe("filterSubmodules", () => {
	const enriched = [
		{
			name: "a",
			path: "vendor/a",
			previousCommitSha: "1",
			previousCommitShaHasTag: false,
			previousShortCommitSha: "1",
			previousTag: "v1",
			remoteName: "o/a",
			url: "https://github.com/o/a",
		},
		{
			name: "b",
			path: "vendor/b",
			previousCommitSha: "2",
			previousCommitShaHasTag: false,
			previousShortCommitSha: "2",
			previousTag: undefined,
			remoteName: "o/b",
			url: "https://github.com/o/b",
		},
	];

	it("returns all when no filter is given", async () => {
		const { filterSubmodules } = await import("./index.js");
		expect(filterSubmodules(enriched, [])).toEqual(enriched);
	});

	it("filters by name", async () => {
		const { filterSubmodules } = await import("./index.js");
		expect(filterSubmodules(enriched, ["a"])).toEqual([enriched[0]]);
	});

	it("filters by path", async () => {
		const { filterSubmodules } = await import("./index.js");
		expect(filterSubmodules(enriched, ["vendor/b"])).toEqual([enriched[1]]);
	});

	it("accepts mixed name and path filters in one call", async () => {
		const { filterSubmodules } = await import("./index.js");
		expect(filterSubmodules(enriched, ["a", "vendor/b"])).toEqual(enriched);
	});

	it("keeps untagged submodules so tag strategy can transition them on first run", async () => {
		const { filterSubmodules } = await import("./index.js");
		expect(filterSubmodules(enriched, [])).toEqual(enriched);
	});
});

describe("setDynamicOutputs", () => {
	const record = {
		latestCommitSha: "lll",
		latestShortCommitSha: "lll",
		latestTag: undefined,
		name: "icons",
		path: "vendor/icons",
		previousCommitSha: "ppp",
		previousCommitShaHasTag: false,
		previousShortCommitSha: "ppp",
		previousTag: undefined,
		remoteName: "vscode-icons/vscode-icons",
		updated: true,
		url: "https://github.com/vscode-icons/vscode-icons.git",
	};

	it("emits distinct --url and --remoteName keys (regression for original bug)", async () => {
		const { setDynamicOutputs } = await import("./index.js");
		setDynamicOutputs(record, "commit");

		const urlCalls = mocks.setOutput.mock.calls.filter(
			(call) => callKey(call) === "icons--url",
		);
		const remoteCalls = mocks.setOutput.mock.calls.filter(
			(call) => callKey(call) === "icons--remoteName",
		);
		expect(urlCalls).toHaveLength(1);
		expect(callValue(urlCalls[0])).toBe(
			"https://github.com/vscode-icons/vscode-icons.git",
		);
		expect(remoteCalls).toHaveLength(1);
		expect(callValue(remoteCalls[0])).toBe("vscode-icons/vscode-icons");
	});

	it("emits each output once per name and once per path", async () => {
		const { setDynamicOutputs } = await import("./index.js");
		setDynamicOutputs(record, "commit");
		const keys = mocks.setOutput.mock.calls.map((c) => callKey(c));
		expect(keys).toContain("icons--updated");
		expect(keys).toContain("vendor/icons--updated");
		expect(keys).toContain("icons--prBody");
		expect(keys).toContain("vendor/icons--prBody");
	});

	it("includes --latestTag only for the tag strategy", async () => {
		const { setDynamicOutputs } = await import("./index.js");
		setDynamicOutputs({ ...record, latestTag: "v2.0.0" }, "tag");
		const tagKeys = mocks.setOutput.mock.calls.map((c) => callKey(c));
		expect(tagKeys).toContain("icons--latestTag");

		mocks.setOutput.mockClear();
		setDynamicOutputs(record, "commit");
		const commitKeys = mocks.setOutput.mock.calls.map((c) => callKey(c));
		expect(commitKeys).not.toContain("icons--latestTag");
	});
});

describe("buildPrBody", () => {
	const base = {
		latestCommitSha: "def0000000000000000000000000000000000000",
		latestShortCommitSha: "def0000",
		name: "icons",
		path: "vendor/icons",
		previousCommitSha: "abc0000000000000000000000000000000000000",
		previousCommitShaHasTag: false,
		previousShortCommitSha: "abc0000",
		previousTag: undefined,
		remoteName: "owner/icons",
		updated: true,
		url: "https://github.com/owner/icons.git",
	};

	it("renders a commit-strategy table", async () => {
		const { buildPrBody } = await import("./index.js");
		const md = buildPrBody([{ ...base, latestTag: undefined }], "commit");
		expect(md).toContain("Previous Commit");
		expect(md).toContain("Latest Commit");
		expect(md).toContain(
			"[abc0000...def0000](https://github.com/owner/icons/compare/",
		);
	});

	it("renders a tag-strategy table", async () => {
		const { buildPrBody } = await import("./index.js");
		const md = buildPrBody(
			[
				{
					...base,
					latestTag: "v2.0.0",
					previousTag: "v1.0.0",
				},
			],
			"tag",
		);
		expect(md).toContain("Previous Tag");
		expect(md).toContain("Latest Tag");
		expect(md).toContain(
			"[v1.0.0...v2.0.0](https://github.com/owner/icons/compare/v1.0.0...v2.0.0)",
		);
	});

	it("renders a commit-strategy row without a compare link when remoteName is missing", async () => {
		const { buildPrBody } = await import("./index.js");
		const md = buildPrBody(
			[{ ...base, latestTag: undefined, remoteName: undefined }],
			"commit",
		);
		expect(md).toContain("abc0000 → def0000");
		expect(md).not.toContain("compare/");
		expect(md).not.toContain("[icons](");
	});

	it("renders a tag-strategy row without a compare link when remoteName is missing", async () => {
		const { buildPrBody } = await import("./index.js");
		const md = buildPrBody(
			[
				{
					...base,
					latestTag: "v2.0.0",
					previousTag: "v1.0.0",
					remoteName: undefined,
				},
			],
			"tag",
		);
		expect(md).toContain("v1.0.0 → v2.0.0");
		expect(md).not.toContain("compare/");
	});
});

describe("updateToLatestCommit", () => {
	it("processes submodules sequentially", async () => {
		const enriched = [
			{
				name: "a",
				path: "vendor/a",
				previousCommitSha: "aaa0000000000000000000000000000000000000",
				previousCommitShaHasTag: false,
				previousShortCommitSha: "aaa0000",
				previousTag: undefined,
				remoteName: "o/a",
				url: "https://github.com/o/a",
			},
			{
				name: "b",
				path: "vendor/b",
				previousCommitSha: "bbb0000000000000000000000000000000000000",
				previousCommitShaHasTag: false,
				previousShortCommitSha: "bbb0000",
				previousTag: undefined,
				remoteName: "o/b",
				url: "https://github.com/o/b",
			},
		];
		const callOrder: string[] = [];
		mocks.getExecOutput.mockImplementation(
			(
				_cmd: string,
				arguments_: string[],
				options?: { cwd?: string },
			) => {
				callOrder.push(arguments_.join(" "));
				if (arguments_[0] === "rev-parse") {
					const sha =
						options?.cwd === "vendor/a"
							? "a".repeat(40)
							: "b".repeat(40);
					return Promise.resolve(okExec(`${sha}\n`));
				}
				return Promise.resolve(okExec(""));
			},
		);

		const { updateToLatestCommit } = await import("./index.js");
		const result = await updateToLatestCommit(enriched);

		// First all of a's commands, then all of b's — never interleaved.
		const indexOfUpdateA = callOrder.indexOf(
			"submodule update --remote vendor/a",
		);
		const indexOfUpdateB = callOrder.indexOf(
			"submodule update --remote vendor/b",
		);
		expect(indexOfUpdateA).toBeLessThan(indexOfUpdateB);
		expect(result[0]?.latestCommitSha).toBe("a".repeat(40));
		expect(result[1]?.latestCommitSha).toBe("b".repeat(40));
	});

	it("propagates a git failure and stops the sequence", async () => {
		const enriched = [
			{
				name: "a",
				path: "vendor/a",
				previousCommitSha: "a".repeat(40),
				previousCommitShaHasTag: false,
				previousShortCommitSha: "aaa0000",
				previousTag: undefined,
				remoteName: "o/a",
				url: "https://github.com/o/a",
			},
			{
				name: "b",
				path: "vendor/b",
				previousCommitSha: "b".repeat(40),
				previousCommitShaHasTag: false,
				previousShortCommitSha: "bbb0000",
				previousTag: undefined,
				remoteName: "o/b",
				url: "https://github.com/o/b",
			},
		];
		const callOrder: string[] = [];
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				callOrder.push(arguments_.join(" "));
				if (
					arguments_.join(" ") ===
					"submodule update --remote vendor/b"
				) {
					return Promise.reject(new Error("submodule update failed"));
				}
				if (arguments_[0] === "rev-parse") {
					return Promise.resolve(okExec(`${"a".repeat(40)}\n`));
				}
				return Promise.resolve(okExec(""));
			},
		);

		const { updateToLatestCommit } = await import("./index.js");
		await expect(updateToLatestCommit(enriched)).rejects.toThrow(
			"submodule update failed",
		);
		// a's update completed before b's update failed
		expect(callOrder).toContain("submodule update --remote vendor/a");
		expect(callOrder).toContain("submodule update --remote vendor/b");
	});
});

describe("updateToLatestTag", () => {
	const enriched = [
		{
			name: "a",
			path: "vendor/a",
			previousCommitSha: "a".repeat(40),
			previousCommitShaHasTag: false,
			previousShortCommitSha: "aaa0000",
			previousTag: "v1.0.0",
			remoteName: "o/a",
			url: "https://github.com/o/a",
		},
		{
			name: "b",
			path: "vendor/b",
			previousCommitSha: "b".repeat(40),
			previousCommitShaHasTag: false,
			previousShortCommitSha: "bbb0000",
			previousTag: "v1.0.0",
			remoteName: "o/b",
			url: "https://github.com/o/b",
		},
	];

	it("resets each submodule to its latest tag and reports updated: true", async () => {
		const tagPerCwd: Record<string, string> = {
			"vendor/a": "v1.5.0",
			"vendor/b": "v2.0.0",
		};
		const newShaPerCwd: Record<string, string> = {
			"vendor/a": "1".repeat(40),
			"vendor/b": "2".repeat(40),
		};
		mocks.getExecOutput.mockImplementation(
			(
				_cmd: string,
				arguments_: string[],
				options?: { cwd?: string },
			) => {
				if (arguments_[0] === "fetch")
					return Promise.resolve(okExec(""));
				if (
					arguments_[0] === "describe" &&
					arguments_.at(-1) === "FETCH_HEAD"
				) {
					return Promise.resolve(
						okExec(`${tagPerCwd[options?.cwd ?? ""]}\n`),
					);
				}
				if (arguments_[0] === "reset") {
					return Promise.resolve(okExec(""));
				}
				if (arguments_[0] === "rev-parse") {
					return Promise.resolve(
						okExec(`${newShaPerCwd[options?.cwd ?? ""]}\n`),
					);
				}
				return Promise.resolve(okExec(""));
			},
		);

		const { updateToLatestTag } = await import("./index.js");
		const result = await updateToLatestTag(enriched);

		expect(result[0]).toMatchObject({
			latestCommitSha: "1".repeat(40),
			latestTag: "v1.5.0",
			updated: true,
		});
		expect(result[1]).toMatchObject({
			latestCommitSha: "2".repeat(40),
			latestTag: "v2.0.0",
			updated: true,
		});
	});

	it("leaves the submodule untouched when no tag is found", async () => {
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				if (arguments_[0] === "fetch")
					return Promise.resolve(okExec(""));
				if (arguments_[0] === "describe")
					return Promise.resolve(okExec("", 128));
				if (arguments_[0] === "tag") return Promise.resolve(okExec(""));
				return Promise.resolve(okExec(""));
			},
		);

		const { updateToLatestTag } = await import("./index.js");
		const first = enriched[0];
		if (!first) throw new Error("test fixture missing");
		const result = await updateToLatestTag([first]);

		expect(result[0]).toMatchObject({
			latestCommitSha: first.previousCommitSha,
			latestShortCommitSha: first.previousShortCommitSha,
			latestTag: undefined,
			updated: false,
		});
		// reset --hard must NOT be invoked when there's no tag to land on
		const resetCalls = mocks.getExecOutput.mock.calls.filter((call) => {
			const arguments_ = call[1] as string[];
			return arguments_[0] === "reset";
		});
		expect(resetCalls).toHaveLength(0);
	});

	it("processes submodules sequentially", async () => {
		const callOrder: string[] = [];
		mocks.getExecOutput.mockImplementation(
			(
				_cmd: string,
				arguments_: string[],
				options?: { cwd?: string },
			) => {
				callOrder.push(
					`${options?.cwd ?? "."}::${arguments_.join(" ")}`,
				);
				if (arguments_[0] === "fetch")
					return Promise.resolve(okExec(""));
				if (
					arguments_[0] === "describe" &&
					arguments_.at(-1) === "FETCH_HEAD"
				) {
					return Promise.resolve(okExec("v1.0.0\n"));
				}
				if (arguments_[0] === "reset")
					return Promise.resolve(okExec(""));
				if (arguments_[0] === "rev-parse") {
					return Promise.resolve(okExec(`${"f".repeat(40)}\n`));
				}
				return Promise.resolve(okExec(""));
			},
		);

		const { updateToLatestTag } = await import("./index.js");
		await updateToLatestTag(enriched);

		const lastA = callOrder.findLastIndex((c) =>
			c.startsWith("vendor/a::"),
		);
		const firstB = callOrder.findIndex((c) => c.startsWith("vendor/b::"));
		expect(lastA).toBeLessThan(firstB);
	});
});

describe("run", () => {
	it("orchestrates load → parse → update → outputs", async () => {
		const inputs: Record<string, string> = {
			gitmodulesPath: ".gitmodules",
			strategy: "commit",
			submodules: "",
			token: "",
		};
		mocks.getInput.mockImplementation((name: string) => inputs[name] ?? "");

		const previousSha = "abc1234567890000000000000000000000000000";
		const latestSha = "def4567890000000000000000000000000000000";
		let revParseCount = 0;
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				if (
					arguments_[0] === "config" &&
					arguments_[1] === "-f" &&
					arguments_[3] === "--list"
				) {
					return Promise.resolve(
						okExec(
							[
								"submodule.icons.path=vendor/icons",
								"submodule.icons.url=https://github.com/owner/icons.git",
							].join("\n"),
						),
					);
				}
				if (arguments_[0] === "remote" && arguments_[1] === "get-url") {
					return Promise.resolve(okExec("", 128));
				}
				if (arguments_[0] === "rev-parse") {
					revParseCount++;
					return Promise.resolve(
						okExec(
							revParseCount === 1
								? `${previousSha}\n`
								: `${latestSha}\n`,
						),
					);
				}
				if (arguments_[0] === "describe") {
					return Promise.resolve(okExec("", 128));
				}
				return Promise.resolve(okExec(""));
			},
		);

		const { run } = await import("./index.js");
		await run();

		expect(mocks.setFailed).not.toHaveBeenCalled();
		const outputs = Object.fromEntries(
			mocks.setOutput.mock.calls.map((call) => [
				callKey(call),
				callValue(call),
			]),
		);
		expect(outputs.json).toContain(latestSha);
		expect(outputs.prBody).toContain("Previous Commit");
		expect(outputs["icons--latestCommitSha"]).toBe(latestSha);
		expect(outputs["icons--remoteName"]).toBe("owner/icons");
		expect(outputs["vendor/icons--latestCommitSha"]).toBe(latestSha);
	});

	it("orchestrates the tag strategy end-to-end", async () => {
		const inputs: Record<string, string> = {
			gitmodulesPath: ".gitmodules",
			strategy: "tag",
			submodules: "",
			token: "",
		};
		mocks.getInput.mockImplementation((name: string) => inputs[name] ?? "");

		const previousSha = "abc1234567890000000000000000000000000000";
		const latestSha = "def4567890000000000000000000000000000000";
		const previousTag = "v1.0.0";
		const latestTag = "v2.0.0";
		let revParseCount = 0;
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				if (
					arguments_[0] === "config" &&
					arguments_[1] === "-f" &&
					arguments_[3] === "--list"
				) {
					return Promise.resolve(
						okExec(
							[
								"submodule.icons.path=vendor/icons",
								"submodule.icons.url=https://github.com/owner/icons.git",
							].join("\n"),
						),
					);
				}
				if (arguments_[0] === "remote" && arguments_[1] === "get-url") {
					return Promise.resolve(okExec("", 128));
				}
				if (arguments_[0] === "rev-parse") {
					revParseCount++;
					return Promise.resolve(
						okExec(
							revParseCount === 1
								? `${previousSha}\n`
								: `${latestSha}\n`,
						),
					);
				}
				if (
					arguments_[0] === "describe" &&
					arguments_.at(-1) === "FETCH_HEAD"
				) {
					return Promise.resolve(okExec(`${latestTag}\n`));
				}
				if (arguments_[0] === "describe") {
					return Promise.resolve(okExec(`${previousTag}\n`));
				}
				if (arguments_[0] === "tag") return Promise.resolve(okExec(""));
				if (arguments_[0] === "fetch")
					return Promise.resolve(okExec(""));
				if (arguments_[0] === "reset")
					return Promise.resolve(okExec(""));
				return Promise.resolve(okExec(""));
			},
		);

		const { run } = await import("./index.js");
		await run();

		expect(mocks.setFailed).not.toHaveBeenCalled();
		const outputs = Object.fromEntries(
			mocks.setOutput.mock.calls.map((call) => [
				callKey(call),
				callValue(call),
			]),
		);
		expect(outputs.json).toContain(latestTag);
		expect(outputs.prBody).toContain("Previous Tag");
		expect(outputs["icons--latestTag"]).toBe(latestTag);
		expect(outputs["icons--previousTag"]).toBe(previousTag);
		expect(outputs["icons--latestCommitSha"]).toBe(latestSha);
	});

	it("invokes initSubmodules when init: true (after configureAuth, before parseGitmodulesFile)", async () => {
		const inputs: Record<string, string> = {
			gitmodulesPath: ".gitmodules",
			init: "true",
			strategy: "commit",
			submodules: "",
			token: "ghs_tok",
		};
		mocks.getInput.mockImplementation((name: string) => inputs[name] ?? "");
		mocks.getBooleanInput.mockImplementation(
			(name: string) => inputs[name] === "true",
		);

		const callOrder: string[] = [];
		const previousSha = "abc1234567890000000000000000000000000000";
		const latestSha = "def4567890000000000000000000000000000000";
		let revParseCount = 0;
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				callOrder.push(arguments_.join(" "));
				if (
					arguments_[0] === "config" &&
					arguments_[1] === "-f" &&
					arguments_[3] === "--list"
				) {
					return Promise.resolve(
						okExec(
							[
								"submodule.icons.path=vendor/icons",
								"submodule.icons.url=https://github.com/owner/icons.git",
							].join("\n"),
						),
					);
				}
				if (arguments_[0] === "remote" && arguments_[1] === "get-url") {
					return Promise.resolve(okExec("", 128));
				}
				if (arguments_[0] === "rev-parse") {
					revParseCount++;
					return Promise.resolve(
						okExec(
							revParseCount === 1
								? `${previousSha}\n`
								: `${latestSha}\n`,
						),
					);
				}
				if (arguments_[0] === "describe") {
					return Promise.resolve(okExec("", 128));
				}
				return Promise.resolve(okExec(""));
			},
		);

		const { run } = await import("./index.js");
		await run();

		expect(mocks.setFailed).not.toHaveBeenCalled();
		const indexOfAuth = callOrder.findIndex((c) =>
			c.includes("http.https://github.com/.extraheader"),
		);
		const indexOfSync = callOrder.indexOf("submodule sync --recursive");
		const indexOfInit = callOrder.indexOf(
			"submodule update --init --force --recursive",
		);
		const indexOfList = callOrder.findIndex((c) => c.endsWith("--list"));
		expect(indexOfAuth).toBeGreaterThanOrEqual(0);
		expect(indexOfSync).toBeGreaterThan(indexOfAuth);
		expect(indexOfInit).toBe(indexOfSync + 1);
		expect(indexOfList).toBeGreaterThan(indexOfInit);
	});

	it("skips initSubmodules when init is unset / false", async () => {
		const inputs: Record<string, string> = {
			gitmodulesPath: ".gitmodules",
			strategy: "commit",
			submodules: "",
			token: "",
		};
		mocks.getInput.mockImplementation((name: string) => inputs[name] ?? "");

		const callOrder: string[] = [];
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				callOrder.push(arguments_.join(" "));
				if (
					arguments_[0] === "config" &&
					arguments_[1] === "-f" &&
					arguments_[3] === "--list"
				) {
					return Promise.resolve(okExec(""));
				}
				if (arguments_[0] === "remote" && arguments_[1] === "get-url") {
					return Promise.resolve(okExec("", 128));
				}
				return Promise.resolve(okExec(""));
			},
		);

		const { run } = await import("./index.js");
		await run();

		expect(callOrder).not.toContain("submodule sync --recursive");
		expect(callOrder).not.toContain(
			"submodule update --init --force --recursive",
		);
	});

	it("calls setFailed and still cleans up auth on error", async () => {
		const inputs: Record<string, string> = {
			gitmodulesPath: ".gitmodules",
			strategy: "commit",
			submodules: "",
			token: "ghs_tok",
		};
		mocks.getInput.mockImplementation((name: string) => inputs[name] ?? "");
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				if (
					arguments_[0] === "config" &&
					arguments_.includes(`--list`)
				) {
					return Promise.reject(new Error("missing"));
				}
				return Promise.resolve(okExec(""));
			},
		);

		const { run } = await import("./index.js");
		await run();

		expect(mocks.setFailed).toHaveBeenCalledWith("missing");
		const cleanupCall = mocks.getExecOutput.mock.calls.find((call) => {
			const arguments_ = call[1] as string[] | undefined;
			return (
				Array.isArray(arguments_) && arguments_.includes("--unset-all")
			);
		});
		expect(cleanupCall).toBeDefined();
	});

	it("fails with the assertion error when a target submodule is uninitialized", async () => {
		const inputs: Record<string, string> = {
			gitmodulesPath: ".gitmodules",
			strategy: "commit",
			submodules: "",
			token: "",
		};
		mocks.getInput.mockImplementation((name: string) => inputs[name] ?? "");

		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				if (
					arguments_[0] === "config" &&
					arguments_[1] === "-f" &&
					arguments_[3] === "--list"
				) {
					return Promise.resolve(
						okExec(
							[
								"submodule.icons.path=vendor/icons",
								"submodule.icons.url=https://github.com/owner/icons.git",
							].join("\n"),
						),
					);
				}
				if (arguments_[0] === "remote" && arguments_[1] === "get-url") {
					return Promise.resolve(okExec("", 128));
				}
				if (
					arguments_[0] === "submodule" &&
					arguments_[1] === "status"
				) {
					return Promise.resolve(
						okExec("-abc1234567890abcdef1234567890abcdef12345 vendor/icons"),
					);
				}
				return Promise.resolve(okExec(""));
			},
		);

		const { run } = await import("./index.js");
		await run();

		expect(mocks.setFailed).toHaveBeenCalledWith(
			expect.stringContaining("Submodule path(s) not initialized: vendor/icons"),
		);
		// rev-parse must not run — we bailed before any enrichment that could
		// silently walk up to the parent repo.
		const revParseCalls = mocks.getExecOutput.mock.calls.filter(
			(call) => (call[1] as string[])[0] === "rev-parse",
		);
		expect(revParseCalls).toHaveLength(0);
	});

	it("setFailed handles non-Error rejections by stringifying them", async () => {
		const inputs: Record<string, string> = {
			gitmodulesPath: ".gitmodules",
			strategy: "commit",
			submodules: "",
			token: "",
		};
		mocks.getInput.mockImplementation((name: string) => inputs[name] ?? "");
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
				if (
					arguments_[0] === "config" &&
					arguments_.includes("--list")
				) {
					// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- testing non-Error rejection path
					return Promise.reject("plain-string-rejection");
				}
				return Promise.resolve(okExec(""));
			},
		);

		const { run } = await import("./index.js");
		await run();

		expect(mocks.setFailed).toHaveBeenCalledWith("plain-string-rejection");
	});
});

const TDZ_PATTERN = /before initialization/;
const REFERENCE_ERROR_PATTERN = /ReferenceError/;

describe("entry-point smoke test", () => {
	const here = path.dirname(url.fileURLToPath(import.meta.url));
	const distribution = path.resolve(here, "..", "dist", "index.mjs");

	it.skipIf(!fs.existsSync(distribution))(
		"module loads without TDZ when invoked directly (regression)",
		() => {
			let combined = "";
			try {
				execFileSync("node", [distribution], {
					encoding: "utf8",
					env: {
						...process.env,
						INPUT_GITMODULESPATH: "/nonexistent-path",
						INPUT_STRATEGY: "commit",
						INPUT_SUBMODULES: "",
						INPUT_TOKEN: "",
					},
				});
			} catch (error) {
				const failure = error as { stderr?: string; stdout?: string };
				combined = (failure.stderr ?? "") + (failure.stdout ?? "");
			}
			expect(combined).not.toMatch(TDZ_PATTERN);
			expect(combined).not.toMatch(REFERENCE_ERROR_PATTERN);
		},
	);
});
