import dotenvx from "@dotenvx/dotenvx";
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
			const sh = String.raw;
			const mockGetInput = sh`
ADDITIONAL_TELEMETRY=1
SPY_ON_ME=false
`;

			const parsedEnv = dotenvx.parse(mockGetInput);

			mocks.getInput.mockReturnValue(mockGetInput);

			await import("./index");

			expect(mocks.getInput).toHaveBeenCalled();

			for (const [key, val] of Object.entries(parsedEnv)) {
				expect(mocks.exportVariable).toHaveBeenCalledWith(key, val);
			}

			const times =
				Object.keys(parsedEnv).length + Object.keys(defaultEnvs).length;

			expect(mocks.exportVariable).toHaveBeenCalledTimes(times);
		});

		it("does not enable additional environment variables when not supplied", async () => {
			await import("./index");

			const times = Object.keys(defaultEnvs).length;

			expect(mocks.exportVariable).toHaveBeenCalledTimes(times);
			expect(mocks.getInput).toHaveBeenCalled();
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
