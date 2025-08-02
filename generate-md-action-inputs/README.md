# generate-md-action-inputs

## Required permissions

## How to use

1. Star this repo 😉

1. Go to your repository

1. Add the following section to your README.md file, you can give whatever title you want. Just make sure that you use \<!-- ACTION-INPUT-LIST:START -->\<!-- ACTION-INPUT-LIST:END --> in your readme. The workflow will replace this comment with the actual blog post list:

<!-- ACTION-INPUT-LIST:START -->

### ⚙️ Inputs
| Name               | Default                                      | Description                                                                                    | Required |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| action             | ${{github.repository}}                       | Github Action to parse the action.yml file from                                                | true     |
| base_branch        | main                                         | Base branch for main commits                                                                   | true     |
| comment_tag_name   | ACTION-INPUT-LIST                            | Prefix for delimiting block start and end                                                      | false    |
| commit_message     | Updated readme with the latest action inputs | Commit message used while committing to the repo                                               | false    |
| committer_username | stephansama-bot                              | Username used while committing to the repo                                                     | false    |
| committer_email    | stephansama-bot@example.com                  | Email id used while committing to the repo                                                     | false    |
| gh_token           | ${{github.token}}                            | Github token scoped to current repo (need to have an environment variable set if not supplied) | false    |
| git_provider       | github                                       | Prefix for delimiting block start and end                                                      | false    |
| heading            | ⚙️ Inputs                                    | Heading for table                                                                              | false    |
| heading_level      | 3                                            | Heading level for table                                                                        | false    |
| readme_path        | ./README.md                                  | Path to the readme file to edit                                                                | false    |
| ref                | ${{github.head_ref}}                         | Pull request head ref to match against                                                         | false    |
| skip_commit        | false                                        | Skips committing the changes to repo                                                           | false    |

<!-- ACTION-INPUT-LIST:END -->
