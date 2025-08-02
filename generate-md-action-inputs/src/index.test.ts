import { describe, expect, it, vi } from "vitest";

import type { Inputs } from "./index";

import { createHeading } from "./index";

vi.mock("zx", () => ({
	["$"]: vi.fn(),
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

describe("generate-md-action-inputs", () => {
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
			expect(createHeading(opts)).toBe(expected);
		},
	);
});
