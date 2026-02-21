# mdprev

Small local Markdown preview server with live reload.

## Features

- Renders GitHub Flavored Markdown (GFM): tables, strikethrough, autolink literals, and task lists.
- Auto-reloads the browser when the file changes.
- Sanitizes HTML output via DOMPurify.
- Supports multiple Markdown files with in-browser navigation.

## Install

Install it globally from npm:

```bash
npm install -g mdprev
```

Install from local source during development:

```bash
pnpm install
pnpm link --global
```

## Usage

```bash
mdprev README.md
```

Multiple files:

```bash
mdprev README.md docs/notes.md README-GFM.md
```

You can also run it directly:

```bash
node main.mjs README.md
```

Options:

- `--port <number>`: Bind to a specific port (default is random).
- `--no-open`: Do not auto-open a browser tab.

Examples:

```bash
mdprev docs/notes.md --port 3456
mdprev README.md --no-open
mdprev chapter1.md chapter2.md chapter3.md --port 3456
```

The server only binds to `127.0.0.1` and prints the URL on startup.

## Release and npm Publish Automation

This repo is configured to publish to npm when you publish a GitHub Release.

One-time setup:

1. In npm, create an automation token:
   - npmjs.com -> Account Settings -> Access Tokens -> Generate New Token -> Automation
2. In GitHub, add the token as a repository secret:
   - Settings -> Secrets and variables -> Actions -> New repository secret
   - Name: `NPM_TOKEN`
3. Ensure your npm package name (`mdprev`) is available to your npm account/org.

How to release:

1. Bump version in `package.json` (or run `npm version patch|minor|major`).
2. Commit and push to GitHub.
3. Create and publish a GitHub Release with tag `vX.Y.Z` (example: `v0.0.4`).
4. GitHub Actions workflow `.github/workflows/release-npm.yml` publishes that version to npm.

Notes:

- The workflow requires the release tag version to match `package.json` version.
- Pre-releases are skipped by default (`prerelease == false`).
