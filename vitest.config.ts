import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			exclude: [
				...(configDefaults.coverage.exclude ?? []),
				"**/dist/**",
				"**/scripts/**",
				"**/turbo/**",
			],
		},
		outputFile: { junit: "./coverage/test-report.junit.xml" },
		reporters: ["default", "junit"],
	},
});
