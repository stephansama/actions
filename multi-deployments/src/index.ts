import * as core from "@actions/core";
import * as github from "@actions/github";

if (require.main === module) run();

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
		deploymentData.map(async (dep, i) =>
			octokit.rest.repos.createDeploymentStatus({
				...commonProps,
				deployment_id: "id" in dep.data ? dep.data.id : 0,
				environment_url: urls[i],
				log_url,
				ref,
				state: "success",
			}),
		),
	);
}

export function parseEnvironments(environments: [string, string][]) {
	const envs = environments.map(([env]) => env).filter(Boolean);
	const urls = environments.map(([, url]) => url).filter(Boolean);

	if (envs.length !== urls.length) {
		throw new Error("the length of environments do not match the urls");
	}

	return { envs, urls };
}

export function loadInputs() {
	const inputEnvironments = core.getInput("environments");
	const token = core.getInput("token");
	const ref = core.getInput("ref");

	if (!inputEnvironments) {
		throw new Error(
			"please provide a JSON object containing the target environments to deploy. with the keys being the environment name and the values being the deployment url",
		);
	}

	const parsedEnvironments = JSON.parse(inputEnvironments);

	const environments: [string, string][] = Object.entries(parsedEnvironments);

	const auto_inactive = core.getBooleanInput("invalidate_previous");

	console.info("loaded action inputs");

	return {
		auto_inactive,
		environments,
		ref,
		token,
	};
}
