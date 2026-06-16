# 🔁 update-git-submodules

<!-- BADGE start -->
<!-- BADGE end -->

[![🧪 Test update-git-submodules](https://github.com/stephansama/actions/actions/workflows/test-update-git-submodules.yml/badge.svg)](https://github.com/stephansama/actions/actions/workflows/test-update-git-submodules.yml)

Update git submodule(s) to their latest **commit** or **tag** and emit structured outputs suitable for opening a pull request, driving a matrix job, or chaining further steps.

The action only updates the working tree — it does not commit or push. Combine it with a commit/PR step (e.g. `peter-evans/create-pull-request`) to ship the updates.

---

## ✨ Features

- Two strategies — `commit` (default) and `tag`
- Filter which submodules to update
- Rich outputs: `json`, `matrix` (drop-in for `strategy.matrix`), `prBody` (markdown table)
- Per-submodule outputs keyed by both submodule **name** and **path**
- Authenticates against private GitHub submodules via the `token` input
- Optional `init: true` mode clones submodules itself, so one PAT can cover both checkout and update for cross-repo private submodules

---

## 🚀 Usage

[example-update-git-submodules.yml](../.github/workflows/examples/example-update-git-submodules.yml)

```yaml
name: update-git-submodules example
on:
  workflow_dispatch:
jobs:
  example:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: stephansama/actions/update-git-submodules@v1
        id: update
      - run: echo "${{ steps.update.outputs.prBody }}"
```

---

## 🔐 Required permissions

The calling workflow must grant the right token scope. Submodules must be present on disk before this step runs — either via `actions/checkout` with `submodules: recursive`, or by setting `init: true` here so this action clones them itself.

| Concern                               | What to do                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Submodules in the **same repo**       | The default `${{ github.token }}` is enough. Set workflow `permissions: contents: read`.                                                                                                                                                                                                                        |
| Submodules in **other public repos**  | The default token also works — no extra setup.                                                                                                                                                                                                                                                                  |
| Submodules in **other private repos** | `GITHUB_TOKEN` is scoped to the current repo only. Either (a) pass a **PAT** (scope `repo`) / **App installation token** to both `actions/checkout` and this action's `token:` input, or (b) skip `submodules: recursive` on checkout and use `init: true` here so this action clones them with the PAT itself. |
| Committing/pushing the update         | Set `permissions: contents: write` on the **caller's** workflow. This action itself does not commit.                                                                                                                                                                                                            |
| Submodules present on disk            | Either use `actions/checkout@v4` with `submodules: recursive` (or `true`) before this step, **or** set `init: true` here and provide a `token` that can clone the submodules.                                                                                                                                   |

Example wiring a PAT for cross-repo private submodules:

```yaml
- uses: actions/checkout@v4
  with:
    submodules: recursive
    token: ${{ secrets.SUBMODULE_PAT }}
- uses: stephansama/actions/update-git-submodules@v1
  with:
    token: ${{ secrets.SUBMODULE_PAT }}
```

Or skip `submodules: recursive` on checkout and let this action handle cloning with `init: true` — one PAT covers both clone and update:

```yaml
- uses: actions/checkout@v4
  with:
    persist-credentials: false
- uses: stephansama/actions/update-git-submodules@v1
  with:
    init: true
    token: ${{ secrets.SUBMODULE_PAT }}
```

---

<!-- ACTION start -->
<!-- ACTION end -->

## 📤 Outputs

### Static outputs

| Name     | Description                                                   |
| -------- | ------------------------------------------------------------- |
| `json`   | JSON array of every update record                             |
| `matrix` | `{ "include": [...] }` — drop directly into `strategy.matrix` |
| `prBody` | Markdown table summarizing all updates                        |

### Dynamic per-submodule outputs

For each updated submodule, the action emits **two sets** of identically-named keys — one prefixed by the submodule's `name` and one prefixed by its `path` — so you can address it either way:

```text
${name}--updated                  ${path}--updated
${name}--path                     ${path}--path
${name}--url                      ${path}--url
${name}--remoteName               ${path}--remoteName
${name}--previousShortCommitSha   ${path}--previousShortCommitSha
${name}--previousCommitSha        ${path}--previousCommitSha
${name}--previousTag              ${path}--previousTag
${name}--previousCommitShaHasTag  ${path}--previousCommitShaHasTag
${name}--latestShortCommitSha     ${path}--latestShortCommitSha
${name}--latestCommitSha          ${path}--latestCommitSha
${name}--latestTag                ${path}--latestTag         (tag strategy only)
${name}--prBody                   ${path}--prBody
```

---

## 🧩 Inputs in detail

- **`gitmodulesPath`** — path to the `.gitmodules` file. Defaults to `.gitmodules`.
- **`init`** — when `true`, run `git submodule sync --recursive` followed by `git submodule update --init --force --recursive` using the configured `token` before reading submodule state. Lets you omit `submodules: recursive` on `actions/checkout` and use a single PAT for both clone and update. Defaults to `false`.
- **`strategy`** — `commit` (default) walks each submodule to the tip of its tracked branch via `git submodule update --remote`. `tag` resolves each submodule to its latest tag and `git reset --hard`s onto it.
- **`submodules`** — newline-delimited list of submodule names or paths to limit the update to. Empty (default) means all.
- **`token`** — GitHub token used to authenticate the underlying `git` operations against `github.com`. Defaults to `${{ github.token }}`.
