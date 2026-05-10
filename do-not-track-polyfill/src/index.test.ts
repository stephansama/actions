import * as dotenvx from "@dotenvx/dotenvx";
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

const defaultEnvironments = getTelemetryEnvironments();

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

			for (const [key, value] of Object.entries(defaultEnvironments)) {
				expect(mocks.exportVariable).toHaveBeenCalledWith(key, value);
			}
		});

		it("enables additional environment variables when supplied", async () => {
			const sh = String.raw;
			const mockGetInput = sh`
ADDITIONAL_TELEMETRY=1
SPY_ON_ME=false
`;

			const parsedEnvironment = dotenvx.parse(mockGetInput);

			mocks.getInput.mockReturnValue(mockGetInput);

			await import("./index");

			expect(mocks.getInput).toHaveBeenCalled();

			for (const [key, value] of Object.entries(parsedEnvironment)) {
				expect(mocks.exportVariable).toHaveBeenCalledWith(key, value);
			}

			const times =
				Object.keys(parsedEnvironment).length +
				Object.keys(defaultEnvironments).length;

			expect(mocks.exportVariable).toHaveBeenCalledTimes(times);
		});

		it("does not enable additional environment variables when not supplied", async () => {
			await import("./index");

			const times = Object.keys(defaultEnvironments).length;

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
