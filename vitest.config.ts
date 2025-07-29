import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		reporters: ["default", "junit"],
		outputFile: { junit: "./coverage/test-report.junit.xml" },
		coverage: {
			exclude: [
				...(configDefaults.coverage.exclude ?? []),
				"**/dist/**",
				"**/scripts/**",
				"**/turbo/**",
			],
		},
	},
});
