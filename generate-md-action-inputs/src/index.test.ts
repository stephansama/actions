import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as module from "./index";

const mocks = vi.hoisted(() => ({
	getInput: vi.fn(),
	sh: vi.fn(),
}));

vi.mock("@actions/core", () => ({
	getInput: mocks.getInput,
}));

vi.mock("zx", () => ({
	["$"]: mocks.sh,
}));

const mockInputData: module.Inputs = {
	action: "stephansama",
	heading_level: "3",
	heading: "Inputs",
	git_provider: "github",
	ref: "feature/test",
	readme_path: "./README.md",
	commit_message: "update",
	skip_commit: true,
	committer_email: "stephansama-bot@gmail.com",
	comment_tag_name: "ACTION-INPUT-LIST",
	committer_username: "stephansama-bot",
	gh_token: "***",
	base_branch: "main",
};

const mockFullReadmePaths = [
	[
		[
			"/Users/stephansama-bot/Code/actions/action.yaml",
			"/Users/stephansama-bot/Code/actions/do-not-track-polyfill/action.yml",
			"/Users/stephansama-bot/Code/actions/generate-md-action-inputs/action.yml",
		],
	],
	[
		[
			"/Users/stephansama-bot/Code/actions/action.yaml",
			"/Users/stephansama-bot/Code/actions/do-not-track-polyfill/action.yml",
		],
	],
];

afterEach(() => {
	vi.clearAllMocks();
});

describe("buildCommentTags", () => {
	it.each([
		["TEST-TAG", ["<!-- TEST-TAG:START -->", "<!-- TEST-TAG:END -->"]],
		["TEST TAG", ["<!-- TEST-TAG:START -->", "<!-- TEST-TAG:END -->"]],
		["test tag", ["<!-- TEST-TAG:START -->", "<!-- TEST-TAG:END -->"]],
		["123", ["<!-- 123:START -->", "<!-- 123:END -->"]],
		["false", ["<!-- FALSE:START -->", "<!-- FALSE:END -->"]],
	])("Builds tag", (input, expected) => {
		const result = module.buildCommentTags(input);
		expect(result).toStrictEqual(expected);
	});

	it("throws an error when an invalid tagname is used", () => {
		expect(() => module.buildCommentTags("")).toThrowError();
	});
});

describe("createHeading", () => {
	it.each([
		["something else", "###"],
		["7", "######"],
		["-1", "#"],
		["1", "#"],
		["2", "##"],
		["3", "###"],
		["4", "####"],
		["5", "#####"],
		["6", "######"],
	])(
		"creates the heading with the proper level (defaulting when out of range)",
		(heading_level, prefix) => {
			const expected = prefix + " " + mockInputData.heading;
			const opts = { ...mockInputData, heading_level };
			expect(module.createHeading(opts)).toBe(expected);
		},
	);
});

describe("capitalize", () => {
	it.each([
		["", ""],
		["capitalize", "Capitalize"],
	])("capitalizes the word", (input, expected) => {
		expect(module.capitalize(input)).toBe(expected);
	});
});

describe("getGitRoot", () => {
	const mockGitRoot = "/Users/stephansama-bot/Code/actions\n";

	beforeEach(() => {
		mocks.sh.mockReturnValue({
			stdout: mockGitRoot,
		});
	});

	it("runs", async () => {
		const root = await module.getGitRoot();
		expect(mocks.sh).toHaveBeenCalled();
		expect(root).toBe(mockGitRoot.trim());
	});
});

describe("gitAddReadmes", () => {
	it.each(mockFullReadmePaths)("calls sh for each readme", async (input) => {
		await module.gitAddReadmes(input);
		expect(mocks.sh).toHaveBeenCalledTimes(input.length);
	});
});

describe("createTable", () => {
	it("returns four items", () => {
		const table = module.createTable(mockInputData, []);
		expect(table.length).toBe(4);
	});
});

describe("debugCommit", () => {
	it.each(mockFullReadmePaths)(
		"debugs as many as requested",
		async (input) => {
			await module.debugCommit(input);
			expect(mocks.sh).toHaveBeenCalledTimes(input.length + 1);
		},
	);
});

describe("commitReadmes", () => {
	it("logs to console.error when there are no readmes to commit", async () => {
		const errorSpy = vi.spyOn(console, "error");
		await module.commitReadmes(mockInputData, []);
		expect(errorSpy).toHaveBeenCalled();
	});

	it("logs to console.info when there are readmes to commit", async () => {
		const infoSpy = vi.spyOn(console, "info");
		await module.commitReadmes(mockInputData, [
			"/Users/stephansama-bot/actions/action.yml",
		]);
		expect(infoSpy).toHaveBeenCalled();
	});
});

describe("setupGit", () => {
	it("sets up git", () => {
		module.setupGit(mockInputData);
		expect(mocks.sh).toHaveBeenCalled();
	});
});

describe("findIndices", () => {
	const tags = module.buildCommentTags("ACTION-INPUT-LIST");
	const md = String.raw;
	const mockReadme = md`
# Heading

Content before

- [ ] todo

${tags.join("\n")}
	`;

	it("throws an error when there is no end comment", () => {
		expect(() =>
			module.findIndices(mockReadme.split("\n").slice(0, -2), tags),
		).toThrowError();
	});

	it("finds the start and end indices", () => {
		const [start, end] = module.findIndices(mockReadme.split("\n"), tags);
		expect(start).toBe(7);
		expect(end).toBe(8);
	});

	it("finds the last start and end indices when there are multiple", () => {
		const mockLines = (mockReadme + "\n" + tags.join("\n")).split("\n");
		const [start, end] = module.findIndices(mockLines, tags);
		expect(start).toBe(10);
		expect(end).toBe(11);
	});
});

describe("getActionsPaths", () => {
	const mockGitRoot = "/Users/stephansama-bot/Code/actions/";
	const mockActionPaths = [
		"./action.yaml",
		"./do-not-track-polyfill/action.yml",
		"./generate-md-action-inputs/action.yml",
	].join("\n");

	beforeEach(() => {
		mocks.sh.mockReturnValue({ stdout: mockActionPaths });
	});

	it("resolves the proper paths for the action.y*ml(s)", async () => {
		const root = await module.getActionsPaths(mockGitRoot);
		const resolvedPaths = mockActionPaths
			.split("\n")
			.map((action) => path.resolve(mockGitRoot, action));
		expect(mocks.sh).toHaveBeenCalled();
		expect(root).toStrictEqual(resolvedPaths);
	});
});

describe("loadInputs", () => {
	it("throws an error when invalid git_provider is provided", () => {
		mocks.getInput.mockImplementation(
			(s: keyof typeof mockInputData | "verbose") => {
				if (s === "verbose") return "true";
				if (s === "git_provider") return "invalid_provider";
				return mockInputData[s];
			},
		);
		expect(() => module.loadInputs()).toThrowError();
	});

	it("loads valid inputs when supplied", () => {
		mocks.getInput.mockImplementation(
			(s: keyof typeof mockInputData | "verbose") => {
				if (s === "verbose") return "true";
				return mockInputData[s];
			},
		);

		const result = module.loadInputs();
		for (const [name, val] of Object.entries(result)) {
			expect(result[name as keyof typeof mockInputData]).toBe(val);
		}
	});
});
