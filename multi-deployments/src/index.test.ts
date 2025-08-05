import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as module from "./index";

const mocks = vi.hoisted(() => ({
	createDeployment: vi.fn(),
	createDeploymentStatus: vi.fn(),
	getInput: vi.fn(),
	isInvoked: vi.fn(),
	getOctokit: vi.fn(() => ({
		rest: {
			repos: {
				createDeployment: mocks.createDeployment,
				createDeploymentStatus: mocks.createDeploymentStatus,
			},
		},
	})),
}));

vi.mock("@actions/core", () => ({
	getInput: mocks.getInput,
	getBooleanInput: vi.fn(
		(input: string) =>
			input === "invalidate_previous" && mocks.getInput(input) === "true",
	),
}));

vi.mock("@actions/github", () => ({
	context: {
		sha: "f3fb078cbfe3342f5032d5abb9260080e2f89d9d6ce6647c20bc23842fa0a0e7",
		repo: { owner: "stephansama", repo: "actions" },
	},
	getOctokit: mocks.getOctokit,
}));

describe("multi-deployments", () => {
	beforeEach(() => {
		vi.stubEnv("GITHUB_HEAD_REF", "");
		vi.stubEnv("GITHUB_REF", "");
		vi.stubEnv("GITHUB_TOKEN", "");
	});

	afterEach(() => {
		vi.resetAllMocks();
		vi.resetModules();
		vi.unstubAllEnvs();
	});

	describe("run", () => {
		it("fails to run when nothing is supplied", async () => {
			await expect(module.run).rejects.toThrowError();
		});

		it("successfully runs when environments and github token are supplied", async () => {
			vi.stubEnv("GITHUB_REF", "ref");
			vi.stubEnv("GITHUB_TOKEN", "token");

			mocks.getInput.mockImplementation((input: string) => {
				if (input === "environments") {
					return JSON.stringify({
						["test-1"]: "https://www.google.com",
					});
				}
			});

			mocks.createDeployment.mockReturnValue({ data: { id: 10 } });

			expect(() => module.run()).not.toThrowError();
		});
	});

	describe("loadInputs", () => {
		it("throws an error when you do not supply any environments", () => {
			expect(module.loadInputs).toThrowError();
		});

		it("returns the formatted values with only environments supplied", () => {
			const mockEnvironments = { ["test - 1"]: "https://www.google.com" };
			const mockEnvironmentsStr = JSON.stringify(mockEnvironments);

			mocks.getInput.mockImplementation((input: string) =>
				input === "environments" ? mockEnvironmentsStr : "",
			);

			const { auto_inactive, environments } = module.loadInputs();

			expect(auto_inactive).toBe(false);
			expect(environments).toEqual(Object.entries(mockEnvironments));
		});

		it("allows overriding of auto_inactive", () => {
			const mockEnvironments = { ["test - 1"]: "https://www.google.com" };
			const mockEnvironmentsStr = JSON.stringify(mockEnvironments);
			const mockInvalidatePrevious = "true";

			mocks.getInput.mockImplementation((input: string) =>
				input === "environments"
					? mockEnvironmentsStr
					: mockInvalidatePrevious,
			);

			const { auto_inactive, environments } = module.loadInputs();

			expect(auto_inactive).toBe(true);
			expect(environments).toEqual(Object.entries(mockEnvironments));
		});
	});

	describe("parseEnvironments", () => {
		it("throws an error when nothing is supplied", () => {
			expect(module.parseEnvironments).toThrowError();
		});

		it("throws an error when there are invalid environment urls", () => {
			const environments = Object.entries({
				["test-1"]: undefined,
				["test-2"]: "https://www.google.com",
			}) as [string, string][];

			expect(() => module.parseEnvironments(environments)).toThrowError();
		});

		it("returns the environments and urls properly", () => {
			const envKey = "test-1";
			const envUrl = "https://www.google.com";
			const environments = { [envKey]: envUrl };
			const envEntries = Object.entries(environments);

			const { envs, urls } = module.parseEnvironments(envEntries);

			expect(envs).toContain(envKey);
			expect(urls).toContain(envUrl);
		});
	});
});
