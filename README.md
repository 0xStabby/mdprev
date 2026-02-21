# mdprev

Small local Markdown preview server with live reload.

## Features

- Renders GitHub Flavored Markdown (GFM): tables, strikethrough, autolink literals, and task lists.
- Auto-reloads the browser when the file changes.
- Sanitizes HTML output via DOMPurify.

## Install

Install it globally from npm:

```bash
npm install -g mdprev
```

## Usage

```bash
mdprev README.md
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
```

The server only binds to `127.0.0.1` and prints the URL on startup.
