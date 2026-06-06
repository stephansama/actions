import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import * as url from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getExecOutput: vi.fn(),
	getInput: vi.fn(),
	readFile: vi.fn(),
	setFailed: vi.fn(),
	setOutput: vi.fn(),
	setSecret: vi.fn(),
}));

vi.mock("@actions/core", () => ({
	getInput: mocks.getInput,
	setFailed: mocks.setFailed,
	setOutput: mocks.setOutput,
	setSecret: mocks.setSecret,
}));

vi.mock("@actions/exec", () => ({
	getExecOutput: mocks.getExecOutput,
}));

vi.mock("node:fs/promises", () => ({
	readFile: mocks.readFile,
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
			strategy: "commit",
			submodules: [],
			token: "",
		});
		expect(mocks.setSecret).not.toHaveBeenCalled();
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
			strategy: "tag",
			submodules: ["first", "second", "third"],
			token: "ghp_abc",
		});
		expect(mocks.setSecret).toHaveBeenCalledWith("ghp_abc");
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

	it("configureAuth sets the extraheader git config with the right base64", async () => {
		mocks.getExecOutput.mockResolvedValue(okExec());
		const { configureAuth } = await import("./index.js");
		await configureAuth("ghs_tok");
		const expectedBasic = Buffer.from("x-access-token:ghs_tok").toString(
			"base64",
		);
		expect(mocks.getExecOutput).toHaveBeenCalledWith("git", [
			"config",
			"--local",
			"http.https://github.com/.extraheader",
			`AUTHORIZATION: basic ${expectedBasic}`,
		]);
	});

	it("cleanupAuth no-ops without a token", async () => {
		const { cleanupAuth } = await import("./index.js");
		await cleanupAuth("");
		expect(mocks.getExecOutput).not.toHaveBeenCalled();
	});

	it("cleanupAuth unsets the extraheader git config", async () => {
		mocks.getExecOutput.mockResolvedValue(okExec());
		const { cleanupAuth } = await import("./index.js");
		await cleanupAuth("ghs_tok");
		expect(mocks.getExecOutput).toHaveBeenCalledWith(
			"git",
			[
				"config",
				"--local",
				"--unset-all",
				"http.https://github.com/.extraheader",
			],
			{ ignoreReturnCode: true },
		);
	});
});

describe("getRemoteName", () => {
	it.each([
		["https://github.com/owner/repo", "owner/repo"],
		["https://github.com/owner/repo.git", "owner/repo"],
		["http://github.com/owner/repo.git", "owner/repo"],
		["git@github.com:owner/repo.git", "owner/repo"],
		["git@github.com:owner/repo", "owner/repo"],
		["ssh://git@github.com/owner/repo.git", "owner/repo"],
		["git://github.com/owner/repo.git", "owner/repo"],
	])("parses %s as %s", async (input, expected) => {
		const { getRemoteName } = await import("./index.js");
		expect(getRemoteName(input)).toBe(expected);
	});

	it("returns null for non-GitHub URLs", async () => {
		const { getRemoteName } = await import("./index.js");
		expect(
			getRemoteName("https://gitlab.com/owner/repo.git"),
		).toBeUndefined();
	});
});

describe("parseGitmodulesFile", () => {
	it("parses the canonical .gitmodules flat shape", async () => {
		mocks.readFile.mockResolvedValue(
			[
				'[submodule "icons"]',
				"  path = vendor/icons",
				"  url = https://github.com/vscode-icons/vscode-icons.git",
				'[submodule "fonts"]',
				"  path = vendor/fonts",
				"  url = git@github.com:google/fonts.git",
			].join("\n"),
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

	it("getPreviousTag returns null when no tags exist", async () => {
		mocks.getExecOutput.mockResolvedValue(okExec("", 128));
		const { getPreviousTag } = await import("./index.js");
		expect(await getPreviousTag("path")).toBeUndefined();
	});

	it("getPreviousTag returns the tag when present", async () => {
		mocks.getExecOutput.mockResolvedValue(okExec("v1.2.3\n"));
		const { getPreviousTag } = await import("./index.js");
		expect(await getPreviousTag("path")).toBe("v1.2.3");
	});

	it("hasTag reports whether the sha has any tag pointing at it", async () => {
		const { hasTag } = await import("./index.js");
		mocks.getExecOutput.mockResolvedValueOnce(okExec("v1.0.0\n"));
		expect(await hasTag("path", "sha")).toBe(true);
		mocks.getExecOutput.mockResolvedValueOnce(okExec(""));
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

	it("returns all when no filter and commit strategy", async () => {
		const { filterSubmodules } = await import("./index.js");
		expect(filterSubmodules(enriched, [], "commit")).toEqual(enriched);
	});

	it("filters by name", async () => {
		const { filterSubmodules } = await import("./index.js");
		expect(filterSubmodules(enriched, ["a"], "commit")).toEqual([
			enriched[0],
		]);
	});

	it("filters by path", async () => {
		const { filterSubmodules } = await import("./index.js");
		expect(filterSubmodules(enriched, ["vendor/b"], "commit")).toEqual([
			enriched[1],
		]);
	});

	it("drops untagged submodules in tag strategy", async () => {
		const { filterSubmodules } = await import("./index.js");
		expect(filterSubmodules(enriched, [], "tag")).toEqual([enriched[0]]);
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
		mocks.readFile.mockResolvedValue(
			[
				'[submodule "icons"]',
				"  path = vendor/icons",
				"  url = https://github.com/owner/icons.git",
			].join("\n"),
		);

		const previousSha = "abc1234567890000000000000000000000000000";
		const latestSha = "def4567890000000000000000000000000000000";
		let revParseCount = 0;
		mocks.getExecOutput.mockImplementation(
			(_cmd: string, arguments_: string[]) => {
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
				if (arguments_[0] === "describe")
					return Promise.resolve(okExec("", 128));
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

	it("calls setFailed and still cleans up auth on error", async () => {
		const inputs: Record<string, string> = {
			gitmodulesPath: ".gitmodules",
			strategy: "commit",
			submodules: "",
			token: "ghs_tok",
		};
		mocks.getInput.mockImplementation((name: string) => inputs[name] ?? "");
		mocks.readFile.mockRejectedValue(new Error("missing"));
		mocks.getExecOutput.mockResolvedValue(okExec());

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
