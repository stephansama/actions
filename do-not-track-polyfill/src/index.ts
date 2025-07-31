import * as core from "@actions/core";
import dotenvx from "@dotenvx/dotenvx";

if (["1", "true"].includes(process.env.DO_NOT_TRACK || "")) {
	const additionalEnv = parseAdditionalEnvironments();
	const telemetryEnvs = getTelemetryEnvironments();
	const environments = [additionalEnv, telemetryEnvs].flatMap(Object.entries);

	for (const [name, val] of environments) {
		core.exportVariable(name, val);
	}
}

export function parseAdditionalEnvironments(): dotenvx.DotenvParseOutput {
	return dotenvx.parse(core.getInput("additional") || "");
}

export function getTelemetryEnvironments() {
	return {
		ASTRO_TELEMETRY_DISABLED: 1,
		NEXT_TELEMETRY_DISABLED: 1,
		STORYBOOK_DISABLE_TELEMETRY: 1,
		TURBO_TELEMETRY_DISABLED: 1,
		VERCEL_TELEMETRY_DISABLED: 1,
		WRANGLER_SEND_METRICS: false,
	};
}
