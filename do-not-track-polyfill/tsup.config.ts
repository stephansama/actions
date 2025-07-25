import { defineConfig } from "tsup";

export default defineConfig({
	dts: true,
	entry: ["src/*.ts"],
	format: ["esm", "cjs"],
	splitting: false,
	target: "esnext",
});
