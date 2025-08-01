// import * as core from "@actions/core";
import degit from "degit";
// import { downloadTemplate } from "@bluwy/giget-core";

// const action = core.getInput("action", {
// 	trimWhitespace: true,
// 	required: true,
// });
//
// const readme_path = core.getInput("readme_path", {
// 	trimWhitespace: true,
// });
//
// const comment_tag_name = core.getInput("comment_tag_name", {
// 	trimWhitespace: true,
// });

if (require.main === module) run();

const emitter = degit("stephansama/actions", {
	cache: true,
	force: true,
	verbose: true,
});

emitter.clone("scripts").then(() => {
	console.info("done");
});

async function run() {
	const action = "stephansama/actions/generate-md-action-input";
	console.info(action);
	// await downloadTemplate(action + "/action.yml");
}

export function loadInputs() {}

// console.info({
// 	action,
// 	readme_path,
// 	comment_tag_name,
// });
