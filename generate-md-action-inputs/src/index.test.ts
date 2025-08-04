import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as module from "./index";

const md = String.raw;
const yaml = String.raw;

const mocks = vi.hoisted(() => ({
	existsSync: vi.fn(),
	getBooleanInput: vi.fn(),
	getInput: vi.fn(),
	readFile: vi.fn(),
	writeFile: vi.fn(),
	sh: vi.fn(),
}));

vi.mock("@actions/core", () => ({
	getBooleanInput: mocks.getBooleanInput,
	getInput: mocks.getInput,
}));

vi.mock("node:fs/promises", () => ({
	readFile: mocks.readFile,
	writeFile: mocks.writeFile,
}));

vi.mock("node:fs", () => ({
	existsSync: mocks.existsSync,
}));

vi.mock("zx", () => ({
	["$"]: mocks.sh,
}));

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

const mockTags = module.buildCommentTags("ACTION-INPUT-LIST");
const mockReadme = md`
# Heading

Content before

- [ ] todo

${mockTags.join("\n")}
	`;

// TODO: should programmatically create table instead of hard coding it
const mockReadmeWithTable = md`
${mockReadme.split("\n").slice(0, -2).join("\n")}

### Inputs
| Name   | Default | Description | Required |
| ------ | ------- | ----------- | -------- |
| action | default | description | false    |

${mockTags[1]}
`;

const mockActionYaml = yaml`
inputs:
  action:
    description: description
    default: default
    required: false
`;

const mockActionData: module.ActionData = {
	readme: mockReadme,
	actionPath: "/Users/stephansama-bot/Code/actions/action.yml",
	readmePath: "/Users/stephansama-bot/Code/actions/README.md",
	data: { inputs: {} },
};

const mockInputData: module.Inputs = {
	comment_tag_name: "ACTION-INPUT-LIST",
	commit_message: "update",
	committer_email: "stephansama-bot@gmail.com",
	committer_username: "stephansama-bot",
	gh_token: "***",
	git_provider: "github",
	heading: "Inputs",
	heading_level: "3",
	skip_commit: true,
};

afterEach(() => {
	vi.clearAllMocks();
	vi.resetModules();
});

describe("isValidActionData", () => {
	it("validates a valid readme", () => {
		const createValid = module.isValidActionData(mockTags);

		expect(createValid(mockActionData)).toBe(true);
	});

	it("invalidates an invalid readme", () => {
		const createValid = module.isValidActionData(mockTags);
		const readme = mockReadme.split("\n").slice(0, -2).join("\n");

		expect(createValid({ ...mockActionData, readme })).toBe(false);
	});
});

describe("updateLocalActionReadmes", () => {
	it("updates local readmes when there are inputs", async () => {
		mocks.sh.mockResolvedValueOnce({
			stdout: `/Users/stephansama-bot/Code/actions/`,
		});

		mocks.sh.mockResolvedValueOnce({
			stdout: `./action.yaml`,
		});

		mocks.existsSync.mockReturnValue(true);

		mocks.readFile.mockResolvedValueOnce(mockActionYaml);

		mocks.readFile.mockResolvedValueOnce(mockReadme);

		await module.updateLocalActionReadmes(mockInputData);

		expect(mocks.existsSync).toHaveBeenCalled();
		expect(mocks.readFile).toHaveBeenCalled();
		expect(mocks.sh).toHaveBeenCalled();
	});

	it("does not update readme when there are no actions", async () => {
		mocks.sh.mockResolvedValueOnce({
			stdout: `/Users/stephansama-bot/Code/actions/`,
		});

		mocks.sh.mockResolvedValueOnce({
			stdout: `./action.yaml`,
		});

		mocks.existsSync.mockReturnValue(true);

		mocks.readFile.mockResolvedValueOnce("");
		mocks.readFile.mockResolvedValueOnce(mockReadme);

		const infoSpy = vi.spyOn(console, "info");

		await module.updateLocalActionReadmes(mockInputData);

		expect(infoSpy).toHaveBeenCalledWith(
			"no inputs found not updating any readmes",
		);

		expect(mocks.existsSync).toHaveBeenCalled();
		expect(mocks.readFile).toHaveBeenCalled();
		expect(mocks.sh).toHaveBeenCalled();
	});

	it("does not update readme when it is already updated", async () => {
		const mockGitRoot = `/Users/stephansama-bot/Code/actions/`;
		const mockActionPath = `./action.yaml`;

		mocks.sh.mockResolvedValueOnce({ stdout: mockGitRoot });
		mocks.sh.mockResolvedValueOnce({ stdout: mockActionPath });

		mocks.existsSync.mockReturnValue(true);

		mocks.readFile.mockResolvedValueOnce(mockActionYaml);
		mocks.readFile.mockResolvedValueOnce(mockReadmeWithTable);

		const infoSpy = vi.spyOn(console, "info");

		await module.updateLocalActionReadmes(mockInputData);

		expect(infoSpy).toHaveBeenCalledWith(
			`readme at path ${path.resolve(mockGitRoot, "./README.md")} is unchanged not writing changes`,
		);

		expect(mocks.existsSync).toHaveBeenCalled();
		expect(mocks.readFile).toHaveBeenCalled();
		expect(mocks.sh).toHaveBeenCalled();
	});
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

describe("run", () => {
	it("loads the run function with debug flag", async () => {
		mocks.sh.mockResolvedValueOnce({});
		mocks.sh.mockResolvedValueOnce({});
		mocks.sh.mockResolvedValueOnce({});
		mocks.sh.mockResolvedValueOnce({});
		mocks.sh.mockResolvedValueOnce({});
		mocks.sh.mockResolvedValueOnce({
			stdout: `/Users/stephansama-bot/Code/actions/`,
		});
		mocks.sh.mockResolvedValueOnce({
			stdout: `./action.yaml`,
		});

		mocks.readFile.mockResolvedValueOnce(mockActionYaml);
		mocks.readFile.mockResolvedValueOnce(mockReadme);

		mocks.getBooleanInput.mockReturnValueOnce(true);
		mocks.getBooleanInput.mockReturnValueOnce(true);

		mocks.getInput.mockImplementation(
			(s: keyof typeof mockInputData) => mockInputData[s],
		);

		await module.run();
		expect(mocks.sh).toHaveBeenCalled();
	});

	it("loads the run function and commits the readmes", async () => {
		mocks.sh.mockResolvedValueOnce({});
		mocks.sh.mockResolvedValueOnce({});
		mocks.sh.mockResolvedValueOnce({});
		mocks.sh.mockResolvedValueOnce({});
		mocks.sh.mockResolvedValueOnce({});
		mocks.sh.mockResolvedValueOnce({
			stdout: `/Users/stephansama-bot/Code/actions/`,
		});
		mocks.sh.mockResolvedValueOnce({
			stdout: `./action.yaml`,
		});

		mocks.readFile.mockResolvedValueOnce(mockActionYaml);
		mocks.readFile.mockResolvedValueOnce(mockReadme);

		mocks.getInput.mockImplementation(
			(s: keyof typeof mockInputData) => mockInputData[s],
		);

		const infoSpy = vi.spyOn(console, "info");

		await module.run();

		expect(infoSpy).toHaveBeenCalled();
		expect(mocks.sh).toHaveBeenCalled();
	});
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
	const mockGitRoot = "/Users/stephansama-bot/Code/actions/\n";

	beforeEach(() => {
		mocks.sh.mockReturnValue({ stdout: mockGitRoot });
	});

	it("runs", async () => {
		const root = await module.getGitRoot();
		expect(mocks.sh).toHaveBeenCalled();
		expect(root).toBe(mockGitRoot.trim());
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
	it("throws an error when there is no end comment", () => {
		expect(() =>
			module.findIndices(mockReadme.split("\n").slice(0, -2), mockTags),
		).toThrowError();
	});

	it("finds the start and end indices", () => {
		const [start, end] = module.findIndices(
			mockReadme.split("\n"),
			mockTags,
		);
		expect(start).toBe(7);
		expect(end).toBe(8);
	});

	it("finds the last start and end indices when there are multiple", () => {
		const mockLines = (mockReadme + "\n" + mockTags.join("\n")).split("\n");
		const [start, end] = module.findIndices(mockLines, mockTags);
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

describe("writeActionsData", () => {
	it("returns false when there are no inputs", async () => {
		const writeCb = module.writeActionsData(mockInputData, mockTags);
		const result = await writeCb({ ...mockActionData, data: {} });
		expect(result).toBe("false");
	});

	it("throws an error when there is no readme to update", async () => {
		const writeCb = module.writeActionsData(mockInputData, mockTags);
		expect(
			async () => await writeCb({ ...mockActionData, readme: "" }),
		).rejects.toThrow();
	});
});

describe("loadInputs", () => {
	it("throws an error when invalid git_provider is provided", () => {
		mocks.getInput.mockImplementation((s: keyof typeof mockInputData) => {
			if (s === "git_provider") return "invalid_provider";
			return mockInputData[s];
		});
		expect(() => module.loadInputs()).toThrowError();
	});

	it("loads valid inputs when supplied", () => {
		mocks.getInput.mockImplementation(
			(s: keyof typeof mockInputData) => mockInputData[s],
		);

		const result = module.loadInputs();
		for (const [name, val] of Object.entries(result)) {
			expect(result[name as keyof typeof mockInputData]).toBe(val);
		}
	});
});
