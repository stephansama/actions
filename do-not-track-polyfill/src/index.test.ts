import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTelemetryEnvironments } from "./index";

const mocks = vi.hoisted(() => ({
	error: vi.fn(),
	exportVariable: vi.fn(),
	getInput: vi.fn(),
}));

vi.mock("@actions/core", () => ({
	error: mocks.error,
	exportVariable: mocks.exportVariable,
	getInput: mocks.getInput,
}));

const defaultEnvs = getTelemetryEnvironments();

describe("do-not-track-polyfill", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllEnvs();
		vi.resetAllMocks();
	});

	describe("truthy", () => {
		beforeEach(() => vi.stubEnv("DO_NOT_TRACK", "1"));

		it("enables default environment variables", async () => {
			await import("./index");

			for (const [key, val] of Object.entries(defaultEnvs)) {
				expect(mocks.exportVariable).toHaveBeenCalledWith(key, val);
			}
		});

		it("enables additional environment variables when supplied", async () => {
			const mockReturn = { ADDITIONAL_TELEMETRY: 1, SPY_ON_ME: false };

			mocks.getInput.mockReturnValue(JSON.stringify(mockReturn));

			await import("./index");

			expect(mocks.getInput).toHaveBeenCalled();

			for (const [key, val] of Object.entries(mockReturn)) {
				expect(mocks.exportVariable).toHaveBeenCalledWith(key, val);
			}

			const times =
				Object.keys(mockReturn).length +
				Object.keys(defaultEnvs).length;

			expect(mocks.exportVariable).toHaveBeenCalledTimes(times);
		});

		it("does not enable additional environment variables when not supplied", async () => {
			await import("./index");

			const times = Object.keys(defaultEnvs).length;

			expect(mocks.exportVariable).toHaveBeenCalledTimes(times);
			expect(mocks.getInput).toHaveBeenCalled();
		});

		it("throws an error when an invalid additional environment variables object is passed", async () => {
			mocks.getInput.mockReturnValue(
				JSON.stringify({ obj: 1 }).slice(1, 14),
			);

			await expect(import("./index")).rejects.toThrow();
		});
	});

	describe("falsy", () => {
		beforeEach(() => vi.stubEnv("DO_NOT_TRACK", "0"));

		it("does not add additional environment variables", async () => {
			await import("./index");

			expect(mocks.getInput).not.toHaveBeenCalled();
		});
	});
});
