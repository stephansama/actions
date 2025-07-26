import type { PlopTypes } from "@turbo/gen";

export default function generator(plop: PlopTypes.NodePlopAPI) {
	plop.setGenerator("action", {
		description: "Generate a new action",
		prompts: [
			{
				message: "What is the name of the new action?",
				name: "name",
				type: "input",
				validate(input: string) {
					if (input.includes(".")) {
						return "library name cannot include an extension";
					}
					if (input.includes(" ")) {
						return "library name cannot include spaces";
					}
					if (!input) {
						return "library name is required";
					}
					return true;
				},
			},
			{
				message: "What is the description of the new package?",
				name: "description",
				type: "input",
			},
		],
		actions: [
			{
				path: "{{ turbo.paths.root }}/{{ dashCase name }}/package.json",
				templateFile: "template/package.json.hbs",
				type: "add",
			},
			{
				path: "{{ turbo.paths.root }}/{{ dashCase name }}/action.yml",
				templateFile: "template/action.yml.hbs",
				type: "add",
			},
			{
				path: "{{ turbo.paths.root }}/{{ dashCase name }}/README.md",
				templateFile: "template/README.md.hbs",
				type: "add",
			},
			{
				path: "{{ turbo.paths.root }}/{{ dashCase name }}/tsup.config.ts",
				templateFile: "template/tsup.config.ts",
				type: "add",
			},
			{
				path: "{{ turbo.paths.root }}/{{ dashCase name }}/src/index.ts",
				templateFile: "template/BLANK",
				type: "add",
			},
		],
	});
}
