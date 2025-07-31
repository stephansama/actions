#!/usr/bin/env node

if (process.env.DO_NOT_TRACK !== "1" || process.env.DO_NOT_TRACK !== "true") {
	console.info("DO_NOT_TRACK not set. not running verification script");
	process.exit(0);
}

for (const env of [
	"ASTRO_TELEMETRY_DISABLED",
	"NEXT_TELEMETRY_DISABLED",
	"TURBO_TELEMETRY_DISABLED",
	"VERCEL_TELEMETRY_DISABLED",
	"WRANGLER_SEND_METRICS",
	"ADDITIONAL_DISABLE_TELEMETRY",
	"TRACK_ME_PLEASE",
]) {
	if (!process.env[env]) throw new Error(`env variable ${env} is not set`);
	console.info("verified ", env);
}
