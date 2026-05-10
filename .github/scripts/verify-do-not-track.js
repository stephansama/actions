#!/usr/bin/env node

if (!["1", "true"].includes(process.env.DO_NOT_TRACK)) {
	console.info("DO_NOT_TRACK not set. not running verification script");
	process.exit(0);
}

for (const environment of [
	"ASTRO_TELEMETRY_DISABLED",
	"NEXT_TELEMETRY_DISABLED",
	"TURBO_TELEMETRY_DISABLED",
	"VERCEL_TELEMETRY_DISABLED",
	"WRANGLER_SEND_METRICS",
	"ADDITIONAL_DISABLE_TELEMETRY",
	"TRACK_ME_PLEASE",
]) {
	if (!process.env[environment])
		throw new Error(`env variable ${environment} is not set`);
	console.info("verified", environment);
}
