import * as core from "@actions/core";

const telemetryEnvs = {
	ASTRO_TELEMETRY_DISABLED: 1,
	DO_NOT_TRACK: 1,
	NEXT_TELEMETRY_DISABLED: 1,
	TURBO_TELEMETRY_DISABLED: 1,
	VERCEL_TELEMETRY_DISABLED: 1,
	WRANGLER_SEND_METRICS: false,
};

if (process.env.DO_NOT_TRACK) {
	const additionalEnv: Record<string, number | boolean> = JSON.parse(
		core.getInput("additional") || "{}",
	);

	for (const [name, val] of [additionalEnv, telemetryEnvs].flatMap(
		Object.entries,
	)) {
		core.exportVariable(name, val);
	}
}
