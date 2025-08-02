import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Inputs } from "./index";

import * as module from "./index";

const mocks = vi.hoisted(() => ({
	getInput: vi.fn(),
}));

vi.mock("@actions/core", () => ({
	getInput: mocks.getInput,
}));

const mockData: Inputs = {
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
			const expected = prefix + " " + mockData.heading;
			const opts = { ...mockData, heading_level };
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

describe("loadInputs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("", () => {
		mocks.getInput.mockImplementation(
			(s: keyof typeof mockData | "verbose") => {
				if (s === "verbose") return "true";
				return mockData[s];
			},
		);

		const result = module.loadInputs();
		for (const [name, val] of Object.entries(result)) {
			expect(result[name as keyof typeof mockData]).toBe(val);
		}
	});
});
