# Generate Markdown from Action Inputs

> \[!CAUTION]
> This action is deprecated please use the cli [`@stephansama/auto-readme`](https://github.com/stephansama/packages/tree/main/core/auto-readme) instead as it is more feature-filled

This GitHub Action automatically generates a Markdown table of your action's inputs and adds it to your `README.md`. It's a simple way to keep your documentation in sync with your `action.yml` file.

## Why use this action?

* **Automated Documentation:** No more manually updating your `README.md` every time you change an input in your `action.yml`.
* **Improved Discoverability:** A clear and concise table of inputs makes it easier for users to understand and use your action.
* **Professional Look:** A well-documented action is a sign of a quality project.

## Before and After

**Before:**

```markdown
<!-- ACTION start -->
<!-- ACTION end -->
```

**After:**

```markdown
<!-- ACTION start -->

| Name       | Default         | Description               | Required |
| ---------- | --------------- | ------------------------- | -------- |
| `my-input` | `default-value` | This is my amazing input. | `false`  |

<!-- ACTION end -->
```

## Usage

1. **Add the comment block to your `README.md`:**

   Add the following comment block to your `README.md` where you want the table of inputs to be generated:

   ```markdown
   <!-- ACTION start -->
   <!-- ACTION end -->
   ```

2. **Create a workflow file:**

   Create a new workflow file in your `.github/workflows` directory (e.g., `.github/workflows/docs.yml`) with the following content:

[example-generate-md-action-inputs.yml](../.github/workflows/examples/example-generate-md-action-inputs.yml)

```yaml
name: generate-md-action-inputs example
on:
    workflow_dispatch:
permissions:
    actions: write
    contents: write
jobs:
    release:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
            - uses: stephansama/actions/generate-md-action-inputs@v1
              with:
                  verbose: true
```

## Required permissions

```yaml
permissions:
    actions: write
    contents: write
```

<!-- ACTION start -->

### ⚙️ Inputs

| Name               | Default                                      | Description                                                                                    | Required |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| comment\_tag\_name   | ACTION                                       | Prefix for delimiting block start and end                                                      | false    |
| commit\_message     | Updated readme with the latest action inputs | Commit message used while committing to the repo                                               | false    |
| committer\_username | stephansama-bot                              | Username used while committing to the repo                                                     | false    |
| committer\_email    | <stephansama-bot@example.com>                | Email id used while committing to the repo                                                     | false    |
| gh\_token           | ${{github.token}}                            | Github token scoped to current repo (need to have an environment variable set if not supplied) | false    |
| git\_provider       | github                                       | Git Provider to base remote urls from. Supported values are 'github' and 'gitlab'.             | false    |
| heading            | ⚙️ Inputs                                    | Heading for table                                                                              | false    |
| heading\_level      | 3                                            | Heading level for table                                                                        | false    |
| skip\_commit        | false                                        | Skips committing the changes to repo                                                           | false    |
| verbose            | false                                        | Whether or not to enable verbose logging for shell scripts                                     | false    |

<!-- ACTION end -->
