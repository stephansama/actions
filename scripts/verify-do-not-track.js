#!/usr/bin/env node

const DO_NOT_TRACK = process.env.DO_NOT_TRACK;

if (!DO_NOT_TRACK) process.exit(0);

const envVars = [
	"ASTRO_TELEMETRY_DISABLED",
	"DO_NOT_TRACK",
	"NEXT_TELEMETRY_DISABLED",
	"TURBO_TELEMETRY_DISABLED",
	"VERCEL_TELEMETRY_DISABLED",
	"WRANGLER_SEND_METRICS",
];

for (const env of envVars) {
	if (!env) throw new Error(`env variable ${env} is not set`);
	console.info("verified ", env);
}
