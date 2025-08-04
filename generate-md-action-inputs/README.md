# Generate Markdown from Action Inputs

[![CI](https://github.com/stephansama/generate-md-action-inputs/actions/workflows/ci.yml/badge.svg)](https://github.com/stephansama/generate-md-action-inputs/actions/workflows/ci.yml)

This GitHub Action automatically generates a Markdown table of your action's inputs and adds it to your `README.md`. It's a simple way to keep your documentation in sync with your `action.yml` file.

## Why use this action?

- **Automated Documentation:** No more manually updating your `README.md` every time you change an input in your `action.yml`.
- **Improved Discoverability:** A clear and concise table of inputs makes it easier for users to understand and use your action.
- **Professional Look:** A well-documented action is a sign of a quality project.

## Before and After

**Before:**

```markdown
<!-- ACTION-INPUT-LIST:START -->
<!-- ACTION-INPUT-LIST:END -->
```

**After:**

```markdown
<!-- ACTION-INPUT-LIST:START -->

### ⚙️ Inputs
| Name               | Default                                      | Description                                                                                    | Required |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| comment_tag_name   | ACTION-INPUT-LIST                            | Prefix for delimiting block start and end                                                      | false    |
| commit_message     | Updated readme with the latest action inputs | Commit message used while committing to the repo                                               | false    |
| committer_username | stephansama-bot                              | Username used while committing to the repo                                                     | false    |
| committer_email    | stephansama-bot@example.com                  | Email id used while committing to the repo                                                     | false    |
| gh_token           | ${{github.token}}                            | Github token scoped to current repo (need to have an environment variable set if not supplied) | false    |
| git_provider       | github                                       | Git Provider to base remote urls from. Supported values are 'github' and 'gitlab'.             | false    |
| heading            | ⚙️ Inputs                                    | Heading for table                                                                              | false    |
| heading_level      | 3                                            | Heading level for table                                                                        | false    |
| skip_commit        | false                                        | Skips committing the changes to repo                                                           | false    |
| verbose            | false                                        | Whether or not to enable verbose logging for shell scripts                                     | false    |

<!-- ACTION-INPUT-LIST:END -->
```

## Usage

1.  **Add the comment block to your `README.md`:**

    Add the following comment block to your `README.md` where you want the table of inputs to be generated:

    ```markdown
    <!-- ACTION-INPUT-LIST:START -->
    <!-- ACTION-INPUT-LIST:END -->
    ```

2.  **Create a workflow file:**

    Create a new workflow file in your `.github/workflows` directory (e.g., `.github/workflows/docs.yml`) with the following content:

    ```yaml
    name: Generate Docs
    on:
        push:
            branches:
                - main
    jobs:
        docs:
            runs-on: ubuntu-latest
            steps:
                - uses: actions/checkout@v3
                - name: Generate action inputs markdown table
                  uses: stephansama/generate-md-action-inputs@v1
                  with:
                      gh_token: ${{ secrets.GITHUB_TOKEN }}
    ```

## Required permissions

```yaml
permissions:
    actions: write
    contents: write
```

## Inputs

| Name                 | Default                                        | Description                                                                                    | Required |
| -------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| `comment_tag_name`   | `ACTION-INPUT-LIST`                            | Prefix for delimiting block start and end                                                      | `false`  |
| `commit_message`     | `Updated readme with the latest action inputs` | Commit message used while committing to the repo                                               | `false`  |
| `committer_username` | `stephansama-bot`                              | Username used while committing to the repo                                                     | `false`  |
| `committer_email`    | `<stephansama-bot@example.com>`                | Email id used while committing to the repo                                                     | `false`  |
| `gh_token`           | `${{github.token}}`                            | Github token scoped to current repo (need to have an environment variable set if not supplied) | `false`  |
| `git_provider`       | `github`                                       | Git Provider to base remote urls from. Supported values are 'github' and 'gitlab'.             | `false`  |
| `heading`            | `⚙️ Inputs`                                    | Heading for table                                                                              | `false`  |
| `heading_level`      | `3`                                            | Heading level for table                                                                        | `false`  |
| `skip_commit`        | `false`                                        | Skips committing the changes to repo                                                           | `false`  |
| `verbose`            | `false`                                        | Whether or not to enable verbose logging for shell scripts                                     | `false`  |
