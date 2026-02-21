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
