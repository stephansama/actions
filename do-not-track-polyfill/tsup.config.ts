import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/*.ts"],
	format: ["cjs"],
	target: "esnext",
});
