import { config, presets } from "@stephansama/eslint-config";

import pkg from "./package.json";

export default await config({
	...presets.base,
	markdown: true,
	node: { allowModules: Object.keys(pkg?.devDependencies) },
	overrides: [
		{
			rules: {
				"markdown/no-missing-label-refs": "off",
				"n/no-unpublished-import": "off",
			},
		},
	],
});
