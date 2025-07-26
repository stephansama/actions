# 🕵️‍♂️ Do Not Track Polyfill · GitHub Action

A simple GitHub Action that conditionally disables telemetry by setting opt-out environment variables for several popular vendors. It ensures your workflow respects privacy-focused settings by preemptively opting out of analytics, usage reporting, and tracking features — if the relevant tools support them.

---

## ✨ Features

- Adds common telemetry-related environment variables (e.g., `DO_NOT_TRACK`, `CI`, etc.)
- Helps opt out of analytics, error reporting, and tracking
- Supports most major CI-aware packages and telemetry clients

---

## 🚀 Usage

Add the action to your workflow **before** any steps that might invoke telemetry-aware tools:

```yaml
# .github/workflows/test-do-not-track-polyfill-true.yml
name: Do not track
on:
    push:
        branches: [main]
    pull_request:
        branches: [main]
    workflow_dispatch:
env:
    DO_NOT_TRACK: 1
permissions:
    actions: write
    contents: write
    id-token: write
    pull-requests: write
    statuses: write
jobs:
    release:
        runs-on: ubuntu-latest
        steps:
            - uses: stephansama/actions/do-not-track-polyfill@v1
            - uses: actions/checkout@v4
              with:
                  sparse-checkout: |
                      scripts
            - uses: actions/setup-node@v4
            - run: node ./scripts/verify-do-not-track.js
```

---

## 🌱 What It Does

This action sets the following environment variables by default:

| Variable             | Value  | Description                                  |
| -------------------- | ------ | -------------------------------------------- |
| `DO_NOT_TRACK`       | `1`    | Industry-standard opt-out flag for analytics |
| `NO_COLOR`           | `1`    | Disables colored output (for cleaner logs)   |
| `CI`                 | `true` | Ensures packages treat the environment as CI |
| `DISABLE_TRACKING`   | `1`    | Generic opt-out flag used by some tools      |
| `TELEMETRY_DISABLED` | `1`    | Used by some telemetry clients to opt out    |

You can also customize which flags are set (see below).

---

## ⚙️ Inputs (Optional)

| Name         | Description                                    | Default |
| ------------ | ---------------------------------------------- | ------- |
| `additional` | Newline delimited list of env variables to add | ``      |

Example:

```yaml
- uses: your-org/do-not-track-polyfill-action@v1
  with:
      additional: |
    OTHER_TECH: false
```

---

## 🔒 Why Use This?

- Complies with privacy-focused workflows
- Prevents telemetry from bloating CI logs or triggering network requests
- Encourages ethical software development practices

---

## 📜 License

MIT © [@stephansama](https://github.com/stephansama)
