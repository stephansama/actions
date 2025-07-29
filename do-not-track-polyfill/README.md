# 🕵️‍♂️ Do Not Track Polyfill · GitHub Action

[![🧪 Test do not track (False)](https://github.com/stephansama/actions/actions/workflows/test-do-not-track-polyfill-false.yml/badge.svg)](https://github.com/stephansama/actions/actions/workflows/test-do-not-track-polyfill-false.yml)
[![🧪 Test do not track (True)](https://github.com/stephansama/actions/actions/workflows/test-do-not-track-polyfill-true.yml/badge.svg)](https://github.com/stephansama/actions/actions/workflows/test-do-not-track-polyfill-true.yml)

A simple GitHub Action that conditionally disables telemetry by setting opt-out environment variables for several popular vendors. It ensures your workflow respects privacy-focused settings by preemptively opting out of analytics, usage reporting, and tracking features — if the relevant tools support them.

---

## ✨ Features

- Adds common telemetry-related environment variables
  (e.g., `ASTRO_TELEMETRY_DISABLED`, etc.)
- Helps opt out of analytics, error reporting, and tracking

---

## 🚀 Usage

Add the action to your workflow **before** any steps that might invoke telemetry aware tools

example workflow:

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

This action conditionally sets additionally environment
variables to disable telemetry for popular platforms such as:

- AstroJS
- Storybook
- Vercel

You can also customize which flags are set (see below).

---

## ⚙️ Inputs (Optional)

| Name         | Description                                                              | Default |
| ------------ | ------------------------------------------------------------------------ | ------- |
| `additional` | valid json object containing environment names and environment variables | `{}`    |

Example:

```yaml
- uses: stephansama/actions/do-not-track-polyfill-action@v1
  with:
      additional: '{"preview": "https://madprofessorblog.org/"}'
```

---

## 🔒 Why Use This?

- Allows you to turn on and off
- Prevents telemetry from bloating CI logs or triggering network requests
