#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import chokidar from "chokidar";
import WebSocket, { WebSocketServer } from "ws";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import open from "open";

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  console.log(`Usage:
  mdprev <file.md> [--port 0] [--no-open]

Examples:
  mdprev README.md
  mdprev docs/notes.md --port 3456
`);
  process.exit(0);
}

const mdPath = path.resolve(args[0]);
const noOpen = args.includes("--no-open");
const portArgIdx = args.indexOf("--port");
const portWanted = portArgIdx !== -1 ? Number(args[portArgIdx + 1]) : 0;

if (!fs.existsSync(mdPath)) {
  console.error(`File not found: ${mdPath}`);
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const sockets = new Set();

server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
  // Tables and strikethrough are enabled by default in markdown-it.
})
  .use(taskLists, { enabled: false, label: false });

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

function readMarkdown() {
  return fs.readFileSync(mdPath, "utf8");
}

function renderMarkdownToHtml(src) {
  const raw = md.render(src);
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
  });
  return clean;
}

// Very small, local CSS: GitHub-ish without huge payload
const baseCss = `
:root { color-scheme: dark; }
body { margin: 0; font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial; background:#0d1117; color:#c9d1d9; }
header { position: sticky; top:0; background:#0d1117; border-bottom:1px solid #30363d; padding:10px 14px; display:flex; gap:12px; align-items:center; z-index:10; }
header .path { opacity:.85; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
main { padding: 18px 22px; max-width: 980px; }
a { color:#58a6ff; text-decoration:none; }
a:hover { text-decoration:underline; }
pre { background:#161b22; border:1px solid #30363d; padding:12px; border-radius:10px; overflow:auto; }
code { background:#161b22; padding:.1em .3em; border-radius:6px; border:1px solid #30363d; }
pre code { background:transparent; border:none; padding:0; }
blockquote { border-left: 3px solid #30363d; margin: 0; padding: 0 0 0 12px; color:#8b949e; }
hr { border:0; border-top:1px solid #30363d; margin: 18px 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border:1px solid #30363d; padding:8px 10px; }
th { background:#161b22; }
h1,h2,h3 { border-bottom:1px solid #30363d; padding-bottom:.25em; }
.task-list-item { list-style: none; }
.task-list-item input { margin-right: 8px; }
`;

function pageHtml(bodyHtml) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${path.basename(mdPath)} – mdprev</title>
  <style>${baseCss}</style>
</head>
<body>
  <header>
    <strong>mdprev</strong>
    <span class="path">${mdPath.replace(/</g, "&lt;")}</span>
  </header>
  <main id="content">${bodyHtml}</main>
  <script>
    const ws = new WebSocket(\`\${location.protocol === "https:" ? "wss" : "ws"}://\${location.host}/ws\`);
    ws.onmessage = (ev) => {
      if (ev.data === "reload") location.reload();
    };
  </script>
</body>
</html>`;
}

app.get("/", (_req, res) => {
  const src = readMarkdown();
  const html = renderMarkdownToHtml(src);
  res.type("html").send(pageHtml(html));
});

app.get("/ws", (_req, res) => res.status(426).send("Upgrade Required"));

wss.on("connection", (sock) => {
  sock.send("connected");
});

function broadcastReload() {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send("reload");
  }
}

const watcher = chokidar.watch(mdPath, { ignoreInitial: true });
watcher.on("change", () => broadcastReload());

server.listen(portWanted, "127.0.0.1", () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : portWanted;
  const url = `http://127.0.0.1:${port}/`;
  console.log(url);
  if (!noOpen) open(url);
});

// Clean shutdown
process.on("SIGINT", async () => {
  await watcher.close();
  for (const client of wss.clients) {
    client.terminate();
  }
  for (const socket of sockets) {
    socket.destroy();
  }
  server.close(() => process.exit(0));
});
