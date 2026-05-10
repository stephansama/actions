import * as core from "@actions/core";
import * as dotenvx from "@dotenvx/dotenvx";

if (["1", "true"].includes(process.env.DO_NOT_TRACK || "")) {
	const additionalEnvironment = parseAdditionalEnvironments();
	const telemetryEnvironments = getTelemetryEnvironments();
	const environments = [additionalEnvironment, telemetryEnvironments].flatMap(
		(item) => Object.entries(item),
	);

	for (const [name, value] of environments) {
		core.exportVariable(name, value);
	}
}

export function getTelemetryEnvironments() {
	return {
		ASTRO_TELEMETRY_DISABLED: 1,
		AZURE_CORE_COLLECT_TELEMETRY: 0,
		NEXT_TELEMETRY_DISABLED: 1,
		STORYBOOK_DISABLE_TELEMETRY: 1,
		TURBO_TELEMETRY_DISABLED: 1,
		VERCEL_TELEMETRY_DISABLED: 1,
		WRANGLER_SEND_METRICS: false,
	} as const;
}

export function parseAdditionalEnvironments(): dotenvx.DotenvParseOutput {
	return dotenvx.parse(core.getInput("additional") || "");
}
