#!/usr/bin/env node

if (process.env.DO_NOT_TRACK === "1" || process.env.DO_NOT_TRACK === "true") {
	process.exit(0);
}

const envVars = [
	"ASTRO_TELEMETRY_DISABLED",
	"NEXT_TELEMETRY_DISABLED",
	"TURBO_TELEMETRY_DISABLED",
	"VERCEL_TELEMETRY_DISABLED",
	"WRANGLER_SEND_METRICS",
];

for (const env of envVars) {
	if (!process.env[env]) throw new Error(`env variable ${env} is not set`);
	console.info("verified ", env);
}
