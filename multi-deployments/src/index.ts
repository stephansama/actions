import * as core from "@actions/core";
import * as github from "@actions/github";

const [envs, urls] = Object.entries(
	JSON.parse(core.getInput("environments") || "{}"),
) as [string, string][];
const auto_inactive = JSON.parse(
	core.getInput("invalidate_previous") || "false",
);

const token = process.env.GITHUB_TOKEN;

if (!token) {
	throw new Error("failed to load github token. needed to create deploys");
}

if (!envs.filter(Boolean).length !== !urls.filter(Boolean)) {
	throw new Error("the length of environments do not match the urls");
}

const octokit = github.getOctokit(token);

const ref = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF || "";

async function run() {
	const deploymentData = await Promise.all(
		envs.map(async (environment) =>
			octokit.rest.repos.createDeployment({
				auto_inactive,
				auto_merge: false,
				environment,
				owner: github.context.repo.owner,
				ref,
				repo: github.context.repo.repo,
				required_contexts: [],
			}),
		),
	);

	await Promise.all(
		deploymentData.map(async (data) =>
			octokit.rest.repos.createDeploymentStatus({
				auto_inactive,
				deployment_id: parseInt(data.data.id, 10),
				owner: github.context.repo.owner,
				repo: github.context.repo.repo,
				state: "in_progress",
			}),
		),
	);

	const deployments = deploymentData.map((deployment, index) => ({
		...deployment.data,
		deployment_url: envs[index],
	}));

	await Promise.all(
		deployments.map(async (dep, i) =>
			octokit.rest.repos.createDeploymentStatus({
				auto_inactive,
				deployment_id: parseInt(dep.id, 10),
				environment_url: urls[i],
				log_url: `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/commit/${github.context.sha}/checks`,
				owner: github.context.repo.owner,
				ref,
				repo: github.context.repo.repo,
				state: "success",
			}),
		),
	);
}

run();
