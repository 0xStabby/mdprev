# mdprev

Small local Markdown preview server with live reload.

## Features

- Renders Markdown to HTML with task lists, footnotes, definition lists, and TOC.
- Auto-reloads the browser when the file changes.
- Sanitizes HTML output via DOMPurify.

## Install

This is a local CLI package. Install dependencies first:

```bash
pnpm install
```

If you want to run it as a command, use `pnpm exec` (or `npm`/`npx` equivalents).

## Usage

```bash
pnpm exec mdprev README.md
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
pnpm exec mdprev docs/notes.md --port 3456
pnpm exec mdprev README.md --no-open
```

The server only binds to `127.0.0.1` and prints the URL on startup.
