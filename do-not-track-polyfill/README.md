# 🕵️‍♂️ Do Not Track Polyfill

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
# .github/workflows/examples/do-not-track-polyfill.yml
name: do-not-track-polyfill example
on:
    workflow_dispatch:
jobs:
    example:
        runs-on: ubuntu-latest
        if: ${{github.event.workflow_run.conclusion != 'success'}}
        steps:
            - uses: stephansama/actions/do-not-track-polyfill@v1
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

<!-- ACTION-INPUT-LIST:START -->

### ⚙️ Inputs
| Name       | Default | Description                             | Required |
| ---------- | ------- | --------------------------------------- | -------- |
| additional |         | Additional telemetry providers to block | false    |

<!-- ACTION-INPUT-LIST:END -->

Example:

```yaml
- uses: stephansama/actions/do-not-track-polyfill-action@v1
  with:
      additional: |
     TEST=https://test.com
```

---

## 🔒 Why Use This?

- Allows you to turn on and off
- Prevents telemetry from bloating CI logs or triggering network requests
