import type * as github from "@actions/github";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as module from "./index";

type OctokitClient = ReturnType<typeof github.getOctokit>;

const mocks = vi.hoisted(() => ({
	compareCommits: vi.fn(),
	createComment: vi.fn(),
	createIssue: vi.fn(),
	getBooleanInput: vi.fn(),
	getInput: vi.fn(),
	getOctokit: vi.fn((): OctokitClient => ({
		paginate: mocks.paginate,
		rest: {
			issues: {
				create: mocks.createIssue,
				createComment: mocks.createComment,
				listComments: mocks.listComments,
				updateComment: mocks.updateComment,
			},
			pulls: { listFiles: mocks.listFiles },
			repos: { compareCommits: mocks.compareCommits },
		},
	} as unknown as OctokitClient)),
	listComments: vi.fn(),
	listFiles: vi.fn(),
	paginate: vi.fn(
		async (
			function_: (p: unknown) => Promise<{ data: unknown[] }>,
			parameters: unknown,
		) => {
			const resp = await function_(parameters);
			return resp.data;
		},
	),
	updateComment: vi.fn(),
	warning: vi.fn(),
}));

vi.mock("@actions/core", () => ({
	getBooleanInput: mocks.getBooleanInput,
	getInput: mocks.getInput,
	warning: mocks.warning,
}));

vi.mock("@actions/github", () => ({
	context: {
		eventName: "pull_request",
		payload: {
			before: "def456",
			pull_request: { head: { sha: "abc123" }, number: 42 },
		},
		repo: { owner: "stephansama", repo: "actions" },
		sha: "abc123",
	},
	getOctokit: mocks.getOctokit,
}));

const DEFAULT_KEYWORDS = [
	"TODO",
	"FIXME",
	"FIX",
	"BUG",
	"HACK",
	"WARN",
	"WARNING",
	"XXX",
	"PERF",
	"TEST",
];
const DEFAULT_MARKER = "<!-- todo-to-pr-comment-issue -->";

describe("todo-to-pr-comment-issue", () => {
	beforeEach(() => {
		mocks.getInput.mockImplementation((input: string) => {
			if (input === "github_token") return "gh-token";
			if (input === "keywords") return DEFAULT_KEYWORDS.join(",");
			if (input === "comment_marker") return DEFAULT_MARKER;
			return "";
		});
		mocks.getBooleanInput.mockReturnValue(true);
	});

	afterEach(() => {
		vi.resetAllMocks();
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	describe("buildTodoRegex", () => {
		it("returns a RegExp", () => {
			expect(module.buildTodoRegex(["TODO"])).toBeInstanceOf(RegExp);
		});

		it("matches // TODO: comment", () => {
			const re = module.buildTodoRegex(DEFAULT_KEYWORDS);
			expect(re.test("// TODO: fix this")).toBe(true);
		});

		it("matches # FIXME comment", () => {
			const re = module.buildTodoRegex(DEFAULT_KEYWORDS);
			expect(re.test("# FIXME: bad code")).toBe(true);
		});

		it("matches /* BUG: comment */", () => {
			const re = module.buildTodoRegex(DEFAULT_KEYWORDS);
			expect(re.test("/* BUG: memory leak */")).toBe(true);
		});

		it("does not match bare TODO without comment prefix", () => {
			const re = module.buildTodoRegex(DEFAULT_KEYWORDS);
			expect(re.test("const TODO = 'value'")).toBe(false);
		});

		it("does not match NOTODO", () => {
			const re = module.buildTodoRegex(DEFAULT_KEYWORDS);
			expect(re.test("// NOTODO: not a match")).toBe(false);
		});

		it("is case-insensitive", () => {
			const re = module.buildTodoRegex(DEFAULT_KEYWORDS);
			expect(re.test("// todo: lowercase")).toBe(true);
		});

		it("captures keyword and description", () => {
			const re = module.buildTodoRegex(DEFAULT_KEYWORDS);
			const m = re.exec("// TODO: implement auth");
			expect(m?.[1]?.toUpperCase()).toBe("TODO");
			expect(m?.[2]?.trim()).toBe("implement auth");
		});
	});

	describe("parseDiffHunk", () => {
		const re = module.buildTodoRegex(DEFAULT_KEYWORDS);

		it("returns empty array for empty patch", () => {
			expect(module.parseDiffHunk("", "file.ts", re)).toEqual([]);
		});

		it("detects a TODO on an added line with correct line number", () => {
			const patch =
				"@@ -1,3 +1,4 @@\n context\n+// TODO: do something\n context";
			const items = module.parseDiffHunk(patch, "src/foo.ts", re);
			expect(items).toHaveLength(1);
			expect(items[0]).toMatchObject({
				file: "src/foo.ts",
				keyword: "TODO",
				lineNumber: 2,
				text: "do something",
			});
		});

		it("does not report TODOs on removed lines", () => {
			const patch = "@@ -1,2 +1,1 @@\n context\n-// TODO: old todo";
			const items = module.parseDiffHunk(patch, "src/foo.ts", re);
			expect(items).toHaveLength(0);
		});

		it("does not report TODOs on context lines (pre-existing)", () => {
			const patch = "@@ -1,2 +1,2 @@\n // TODO: existing\n context";
			const items = module.parseDiffHunk(patch, "src/foo.ts", re);
			expect(items).toHaveLength(0);
		});

		it("correctly counts line numbers across multiple hunks", () => {
			const patch = [
				"@@ -1,3 +1,3 @@",
				" line1",
				" line2",
				" line3",
				"@@ -10,3 +10,4 @@",
				" line10",
				"+// FIXME: second hunk",
				" line11",
			].join("\n");
			const items = module.parseDiffHunk(patch, "src/bar.ts", re);
			expect(items).toHaveLength(1);
			expect(items[0].lineNumber).toBe(11);
			expect(items[0].keyword).toBe("FIXME");
		});

		it("returns empty array when no TODOs in added lines", () => {
			const patch = "@@ -1,1 +1,2 @@\n context\n+const x = 1;";
			expect(module.parseDiffHunk(patch, "src/foo.ts", re)).toEqual([]);
		});
	});

	describe("buildPrCommentBody", () => {
		it("starts with the marker", () => {
			const body = module.buildPrCommentBody([], DEFAULT_MARKER);
			expect(body).toContain(DEFAULT_MARKER);
		});

		it("shows no-todos message when empty", () => {
			const body = module.buildPrCommentBody([], DEFAULT_MARKER);
			expect(body).toContain("No new TODO-style comments");
		});

		it("contains a table header when todos present", () => {
			const todos: module.TodoItem[] = [
				{
					file: "src/a.ts",
					keyword: "TODO",
					lineNumber: 5,
					text: "fix me",
				},
			];
			const body = module.buildPrCommentBody(todos, DEFAULT_MARKER);
			expect(body).toContain("File");
			expect(body).toContain("Line");
			expect(body).toContain("Keyword");
			expect(body).toContain("Description");
		});

		it("includes each todo item in the output", () => {
			const todos: module.TodoItem[] = [
				{
					file: "src/a.ts",
					keyword: "TODO",
					lineNumber: 5,
					text: "fix me",
				},
				{
					file: "src/b.ts",
					keyword: "FIXME",
					lineNumber: 10,
					text: "broken",
				},
			];
			const body = module.buildPrCommentBody(todos, DEFAULT_MARKER);
			expect(body).toContain("src/a.ts");
			expect(body).toContain("src/b.ts");
			expect(body).toContain("5");
			expect(body).toContain("FIXME");
		});
	});

	describe("buildIssueTitle", () => {
		it("includes keyword and filename", () => {
			const title = module.buildIssueTitle({
				file: "src/auth.ts",
				keyword: "TODO",
				lineNumber: 42,
				text: "implement auth",
			});
			expect(title).toContain("TODO");
			expect(title).toContain("src/auth.ts");
		});

		it("truncates long description to 60 chars", () => {
			const longText = "a".repeat(80);
			const title = module.buildIssueTitle({
				file: "src/foo.ts",
				keyword: "BUG",
				lineNumber: 1,
				text: longText,
			});
			expect(title).toContain("a".repeat(60));
			expect(title).not.toContain("a".repeat(61));
		});

		it("omits description when text is empty", () => {
			const title = module.buildIssueTitle({
				file: "src/foo.ts",
				keyword: "HACK",
				lineNumber: 1,
				text: "",
			});
			expect(title).not.toContain(":");
		});
	});

	describe("buildIssueBody", () => {
		const repoUrl = "https://github.com/stephansama/actions";
		const todo: module.TodoItem = {
			file: "src/auth.ts",
			keyword: "TODO",
			lineNumber: 42,
			text: "implement auth",
		};

		it("contains a link to the file with line anchor using the provided sha", () => {
			const body = module.buildIssueBody(todo, repoUrl, "abc123");
			expect(body).toContain(`${repoUrl}/blob/abc123/src/auth.ts#L42`);
		});

		it("contains the keyword", () => {
			const body = module.buildIssueBody(todo, repoUrl, "abc123");
			expect(body).toContain("`TODO`");
		});

		it("contains the attribution footer", () => {
			const body = module.buildIssueBody(todo, repoUrl, "abc123");
			expect(body).toContain("todo-to-pr-comment-issue");
		});
	});

	describe("findExistingComment", () => {
		const octokit = mocks.getOctokit();

		it("returns null when no comments match the marker", async () => {
			mocks.listComments.mockResolvedValue({ data: [] });
			const result = await module.findExistingComment(
				octokit,
				"stephansama",
				"actions",
				42,
				DEFAULT_MARKER,
			);
			expect(result).toBeNull();
		});

		it("returns the comment_id when a matching comment is found", async () => {
			mocks.listComments.mockResolvedValue({
				data: [
					{ body: `${DEFAULT_MARKER}\n## TODO Comments...`, id: 99 },
				],
			});
			const result = await module.findExistingComment(
				octokit,
				"stephansama",
				"actions",
				42,
				DEFAULT_MARKER,
			);
			expect(result).toBe(99);
		});
	});

	describe("upsertPrComment", () => {
		const octokit = mocks.getOctokit();

		it("calls createComment when no existing comment", async () => {
			mocks.listComments.mockResolvedValue({ data: [] });
			mocks.createComment.mockResolvedValue({});

			await module.upsertPrComment(
				octokit,
				"stephansama",
				"actions",
				42,
				"body",
				DEFAULT_MARKER,
			);

			expect(mocks.createComment).toHaveBeenCalledOnce();
			expect(mocks.updateComment).not.toHaveBeenCalled();
		});

		it("calls updateComment when existing comment found", async () => {
			mocks.listComments.mockResolvedValue({
				data: [{ body: DEFAULT_MARKER, id: 99 }],
			});
			mocks.updateComment.mockResolvedValue({});

			await module.upsertPrComment(
				octokit,
				"stephansama",
				"actions",
				42,
				"new body",
				DEFAULT_MARKER,
			);

			expect(mocks.updateComment).toHaveBeenCalledWith(
				expect.objectContaining({ body: "new body", comment_id: 99 }),
			);
			expect(mocks.createComment).not.toHaveBeenCalled();
		});
	});

	describe("handlePullRequest", () => {
		const octokit = mocks.getOctokit();
		const inputs = {
			comment_marker: DEFAULT_MARKER,
			create_issues: true,
			github_token: "gh-token",
			keywords: DEFAULT_KEYWORDS,
		};
		const re = module.buildTodoRegex(DEFAULT_KEYWORDS);

		it("throws when pull_request payload is absent", async () => {
			const { context } = await import("@actions/github");
			const originalPayload = context.payload;
			context.payload = {};

			await expect(
				module.handlePullRequest(
					octokit,
					"stephansama",
					"actions",
					inputs,
					re,
				),
			).rejects.toThrow("pull_request payload is missing");

			context.payload = originalPayload;
		});

		it("skips files with no patch (binary files)", async () => {
			mocks.listFiles.mockResolvedValue({
				data: [
					{
						filename: "image.png",
						patch: undefined,
						status: "added",
					},
				],
			});
			mocks.listComments.mockResolvedValue({ data: [] });
			mocks.createComment.mockResolvedValue({});

			await module.handlePullRequest(
				octokit,
				"stephansama",
				"actions",
				inputs,
				re,
			);

			const callArgument = mocks.createComment.mock.calls[0][0];
			expect(callArgument.body).toContain("No new TODO-style comments");
		});

		it("skips removed files", async () => {
			mocks.listFiles.mockResolvedValue({
				data: [
					{
						filename: "src/old.ts",
						patch: "-// TODO: removed",
						status: "removed",
					},
				],
			});
			mocks.listComments.mockResolvedValue({ data: [] });
			mocks.createComment.mockResolvedValue({});

			await module.handlePullRequest(
				octokit,
				"stephansama",
				"actions",
				inputs,
				re,
			);

			const callArgument = mocks.createComment.mock.calls[0][0];
			expect(callArgument.body).toContain("No new TODO-style comments");
		});

		it("calls upsertPrComment with found TODOs", async () => {
			mocks.listFiles.mockResolvedValue({
				data: [
					{
						filename: "src/foo.ts",
						patch: "@@ -0,0 +1,2 @@\n+const x = 1;\n+// TODO: add tests",
						status: "added",
					},
				],
			});
			mocks.listComments.mockResolvedValue({ data: [] });
			mocks.createComment.mockResolvedValue({});

			await module.handlePullRequest(
				octokit,
				"stephansama",
				"actions",
				inputs,
				re,
			);

			expect(mocks.createComment).toHaveBeenCalledOnce();
			const body = mocks.createComment.mock.calls[0][0].body as string;
			expect(body).toContain("src/foo.ts");
			expect(body).toContain("TODO");
		});
	});

	describe("handlePush", () => {
		const octokit = mocks.getOctokit();
		const inputs = {
			comment_marker: DEFAULT_MARKER,
			create_issues: true,
			github_token: "gh-token",
			keywords: DEFAULT_KEYWORDS,
		};
		const re = module.buildTodoRegex(DEFAULT_KEYWORDS);

		it("calls compareCommits with before/sha", async () => {
			mocks.compareCommits.mockResolvedValue({ data: { files: [] } });

			await module.handlePush(
				octokit,
				"stephansama",
				"actions",
				inputs,
				re,
			);

			expect(mocks.compareCommits).toHaveBeenCalledWith(
				expect.objectContaining({ base: "def456", head: "abc123" }),
			);
		});

		it("does not call issues.create when create_issues is false", async () => {
			mocks.compareCommits.mockResolvedValue({
				data: {
					files: [
						{
							filename: "src/foo.ts",
							patch: "@@ -0,0 +1,1 @@\n+// TODO: fix",
							status: "added",
						},
					],
				},
			});

			await module.handlePush(
				octokit,
				"stephansama",
				"actions",
				{ ...inputs, create_issues: false },
				re,
			);

			expect(mocks.createIssue).not.toHaveBeenCalled();
		});

		it("creates one issue per TODO when create_issues is true", async () => {
			mocks.compareCommits.mockResolvedValue({
				data: {
					files: [
						{
							filename: "src/foo.ts",
							patch: "@@ -0,0 +1,2 @@\n+// TODO: first\n+// FIXME: second",
							status: "added",
						},
					],
				},
			});
			mocks.createIssue.mockResolvedValue({});

			await module.handlePush(
				octokit,
				"stephansama",
				"actions",
				inputs,
				re,
			);

			expect(mocks.createIssue).toHaveBeenCalledTimes(2);
		});

		it("skips when before is the zero SHA (initial push)", async () => {
			const { context } = await import("@actions/github");
			const originalBefore = context.payload.before;
			context.payload.before = "0".repeat(40);

			await module.handlePush(
				octokit,
				"stephansama",
				"actions",
				inputs,
				re,
			);

			expect(mocks.compareCommits).not.toHaveBeenCalled();
			expect(mocks.warning).toHaveBeenCalled();

			context.payload.before = originalBefore;
		});
	});

	describe("run", () => {
		it("calls handlePullRequest on pull_request event", async () => {
			const { context } = await import("@actions/github");
			context.eventName = "pull_request";

			mocks.listFiles.mockResolvedValue({ data: [] });
			mocks.listComments.mockResolvedValue({ data: [] });
			mocks.createComment.mockResolvedValue({});

			await module.run();

			expect(mocks.listFiles).toHaveBeenCalled();
		});

		it("calls handlePush on push event", async () => {
			const { context } = await import("@actions/github");
			context.eventName = "push";

			mocks.compareCommits.mockResolvedValue({ data: { files: [] } });

			await module.run();

			expect(mocks.compareCommits).toHaveBeenCalled();
		});

		it("warns on unknown event", async () => {
			const { context } = await import("@actions/github");
			context.eventName = "schedule";

			await module.run();

			expect(mocks.warning).toHaveBeenCalledWith(
				expect.stringContaining("schedule"),
			);
		});
	});
});
