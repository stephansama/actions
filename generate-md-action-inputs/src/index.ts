import * as core from "@actions/core";

const action = core.getInput("action", {
	trimWhitespace: true,
	required: true,
});

const readme_path = core.getInput("readme_path", {
	trimWhitespace: true,
});

const comment_tag_name = core.getInput("comment_tag_name", {
	trimWhitespace: true,
});

console.log({
	action,
	readme_path,
	comment_tag_name,
});
