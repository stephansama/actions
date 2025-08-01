import * as core from "@actions/core";
import * as github from "@actions/github";

if (require.main === module) run();

export async function run() {
	const { ref, token } = loadEnvVariables();
	const { auto_inactive, environments } = loadInputs();
	const { envs, urls } = parseEnvironments(environments);

	const octokit = github.getOctokit(token);

	const { owner, repo } = github.context.repo;

	const commonProps = {
		auto_inactive,
		owner,
		repo,
	};

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

	if (!inputEnvironments) {
		throw new Error(
			"please provide a JSON object containing the target environments to deploy. with the keys being the environment name and the values being the deployment url",
		);
	}

	const parsedEnvironments = JSON.parse(inputEnvironments);

	const environments: [string, string][] = Object.entries(parsedEnvironments);

	const auto_inactive: boolean = JSON.parse(
		core.getInput("invalidate_previous") || "false",
	);

	return {
		auto_inactive,
		environments,
	};
}

export function loadEnvVariables() {
	const token = process.env.GITHUB_TOKEN;
	const ref =
		core.getInput("ref") ||
		process.env.GITHUB_HEAD_REF ||
		process.env.GITHUB_REF;

	if (!ref && !token) {
		throw new Error(
			"failed to load $GITHUB_TOKEN or target commit ref. both are needed to create deploys",
		);
	}

	if (!ref) {
		throw new Error(
			"failed to load ref to create deploys from. it is needed to create deploys",
		);
	}

	if (!token) {
		throw new Error(
			"failed to load $GITHUB_TOKEN from head. it is needed to create deploys",
		);
	}

	return {
		ref,
		token,
	};
}
