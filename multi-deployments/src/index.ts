import * as core from "@actions/core";
import * as github from "@actions/github";
import * as url from "node:url";

const argv = process.argv.at(1);

if (url.fileURLToPath(import.meta.url) === argv) await run();

export function loadInputs() {
	const inputEnvironments = core.getInput("environments");
	const token = core.getInput("token");
	const ref = core.getInput("ref");

	if (!inputEnvironments) {
		throw new Error(
			"please provide a JSON object containing the target environments to deploy. with the keys being the environment name and the values being the deployment url",
		);
	}

	const parsedEnvironments = JSON.parse(inputEnvironments) as Record<
		string,
		string
	>;

	const environments = Object.entries<string>(parsedEnvironments);

	const auto_inactive = core.getBooleanInput("invalidate_previous");

	return {
		auto_inactive,
		environments,
		ref,
		token,
	};
}

export function parseEnvironments(environments: [string, string][]) {
	const environments_ = environments
		.map(([environment]) => environment)
		.filter(Boolean);
	const urls = environments.map(([, url]) => url).filter(Boolean);

	if (environments_.length !== urls.length) {
		throw new Error("the length of environments do not match the urls");
	}

	return { envs: environments_, urls };
}

export async function run() {
	const { auto_inactive, environments, ref, token } = loadInputs();
	const { envs, urls } = parseEnvironments(environments);
	const { owner, repo } = github.context.repo;
	const commonProps = {
		auto_inactive,
		owner,
		repo,
	};

	const octokit = github.getOctokit(token);

	const deploymentData = await Promise.all(
		envs.map(async (environment) =>
			octokit.rest.repos.createDeployment({
				...commonProps,
				auto_merge: false,
				environment,
				ref,
				required_contexts: [],
			}),
		),
	);

	await Promise.all(
		deploymentData.map(async (dep) =>
			octokit.rest.repos.createDeploymentStatus({
				...commonProps,
				deployment_id: "id" in dep.data ? dep.data.id : 0,
				state: "in_progress",
			}),
		),
	);

	const log_url = `https://github.com/${owner}/${repo}/commit/${github.context.sha}/checks`;

	await Promise.all(
		deploymentData.map(async (dep, index) =>
			octokit.rest.repos.createDeploymentStatus({
				...commonProps,
				deployment_id: "id" in dep.data ? dep.data.id : 0,
				environment_url: urls[index],
				log_url,
				ref,
				state: "success",
			}),
		),
	);
}
