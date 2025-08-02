# **🚀 Multi-Deployments**

[![🧪 Test multi deployments](https://github.com/stephansama/actions/actions/workflows/test-multi-deployments.yml/badge.svg)](https://github.com/stephansama/actions/actions/workflows/test-multi-deployments.yml)

This GitHub Action simplifies the process of creating multiple GitHub Deployments within a single workflow run. It's particularly useful for scenarios where you need to deploy to various environments (e.g., staging, preview, production) or different regions simultaneously and track their statuses directly within GitHub.

## **✨ Features**

- **Batch Deployment Creation**: Create multiple deployments with a single action call.
- **Environment Tracking**: Clearly define and track deployments for different environments.
- **Previous Deployment Invalidation**: Optionally invalidate previous deployments for a cleaner deployment history.
- **Customizable References**: Specify the commit reference for deployments, or let the action automatically use GitHub CI environment variables.

## **🚀 Usage**

Add the multi-deployments action to your workflow. You'll need to provide a JSON object specifying the environments and their corresponding URLs.

### **Example Workflow**

This example demonstrates how to use the multi-deployments action to create preview deployments for multiple URLs.

```yaml
# .github/workflows/examples/example-multi-deployments
name: multi-deployments example
on:
    workflow_dispatch:
permissions:
    actions: read
    contents: write
    deployments: write
    id-token: write
    issues: write
    pull-requests: write
    statuses: write
jobs:
    example:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: pnpm/action-setup@v4
            - uses: actions/setup-node@v4
              with:
                  cache: "pnpm"
                  node-version-file: ".nvmrc"
            - name: Installing dependencies
              run: pnpm install
            - name: Build all actions
              run: pnpm run build
            - name: This is where you create your environments
              run: node ./scripts/generate-multi-urls.js
              id: generate
            - uses: stephansama/actions/multi-deployments@v1
              env:
                  GITHUB_TOKEN: ${{secrets.GITHUB_TOKEN}}
              with:
                  invalidate_previous: true
                  environments: ${{steps.generate.outputs.environments}}
```

<!-- ACTION-INPUT-LIST:START -->

### ⚙️ Inputs
| Name                | Default   | Description                                                                     | Required |
| ------------------- | --------- | ------------------------------------------------------------------------------- | -------- |
| environments        | undefined | Environments to deploy                                                          | true     |
| invalidate_previous | false     | Invalidate previous deploys                                                     | false    |
| ref                 |           | Commit ref to reference for deploys (automatically uses Github CI environments) | false    |

<!-- ACTION-INPUT-LIST:END -->

### **Example environments JSON**

```json
{
	"my-staging-env": "https://staging.example.com",
	"my-preview-env": "https://preview.example.com/pr-123",
	"production-east": "https://prod-east.example.com"
}
```

## **💡 How It Works**

The action leverages the GitHub Deployments API to create and manage deployment records. For each environment provided in the environments input, it performs the following steps:

1. **Creates a Deployment**: Initiates a new deployment record for the specified environment and commit reference.
2. **Sets Deployment Status to "in_progress"**: Immediately updates the deployment status to indicate that the deployment process has started.
3. **Sets Deployment Status to "success"**: Once all deployments are created, it updates their statuses to "success," including the environment_url (the URL you provided) and a log_url pointing back to the GitHub Actions workflow run for traceability.

The invalidate_previous input, when set to true, tells the action to mark any existing deployments for the given environments as inactive before creating the new ones, ensuring only the latest deployments are active.

### Inspired by

- [bobheadxi/deployments](https://github.com/bobheadxi/deployments)
- [maxgfr/github-multi-deployments](https://github.com/maxgfr/github-multi-deployments)
