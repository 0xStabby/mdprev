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
const showHelp = args.length === 0 || args.includes("-h") || args.includes("--help");

if (showHelp) {
  console.log(`Usage:
  mdprev <file.md> [more.md ...] [--port 0] [--no-open]

Examples:
  mdprev README.md
  mdprev README.md docs/notes.md docs/todo.md
  mdprev docs/notes.md --port 3456
`);
  process.exit(0);
}

const inputFiles = [];
let noOpen = false;
let portWanted = 0;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--no-open") {
    noOpen = true;
    continue;
  }
  if (arg === "--port") {
    const raw = args[i + 1];
    if (!raw || raw.startsWith("--")) {
      console.error("Missing value for --port");
      process.exit(1);
    }
    portWanted = Number(raw);
    if (!Number.isInteger(portWanted) || portWanted < 0 || portWanted > 65535) {
      console.error(`Invalid port: ${raw}`);
      process.exit(1);
    }
    i += 1;
    continue;
  }
  if (arg.startsWith("--")) {
    console.error(`Unknown option: ${arg}`);
    process.exit(1);
  }
  inputFiles.push(arg);
}

if (inputFiles.length === 0) {
  console.error("No markdown files provided.");
  process.exit(1);
}

const mdPaths = [...new Set(inputFiles.map((file) => path.resolve(file)))];
for (const mdPath of mdPaths) {
  if (!fs.existsSync(mdPath)) {
    console.error(`File not found: ${mdPath}`);
    process.exit(1);
  }
  if (!fs.statSync(mdPath).isFile()) {
    console.error(`Not a file: ${mdPath}`);
    process.exit(1);
  }
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

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readMarkdown(index) {
  return fs.readFileSync(mdPaths[index], "utf8");
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

function pageHtml(bodyHtml, index) {
  const currentPath = mdPaths[index];
  const title = `${path.basename(currentPath)} - mdprev`;
  const docLinks = mdPaths
    .map((docPath, i) => {
      const activeClass = i === index ? "active" : "";
      const label = escapeHtml(path.basename(docPath));
      return `<a class="doc-link ${activeClass}" href="/doc/${i}">${label}</a>`;
    })
    .join("");

  const hasPrev = index > 0;
  const hasNext = index < mdPaths.length - 1;
  const prevHref = hasPrev ? `/doc/${index - 1}` : "";
  const nextHref = hasNext ? `/doc/${index + 1}` : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>${baseCss}</style>
  <style>
    .nav { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .nav-btn { border:1px solid #30363d; border-radius:8px; padding:4px 8px; color:#c9d1d9; }
    .nav-btn.disabled { opacity:0.45; pointer-events:none; text-decoration:none; }
    .doc-links { display:flex; gap:6px; flex-wrap:wrap; }
    .doc-link { border:1px solid #30363d; border-radius:8px; padding:4px 8px; color:#c9d1d9; }
    .doc-link.active { background:#1f6feb; border-color:#1f6feb; color:white; }
  </style>
</head>
<body>
  <header>
    <strong>mdprev</strong>
    <span class="path">${escapeHtml(currentPath)}</span>
    <nav class="nav">
      <a class="nav-btn ${hasPrev ? "" : "disabled"}" href="${prevHref}">Prev</a>
      <a class="nav-btn ${hasNext ? "" : "disabled"}" href="${nextHref}">Next</a>
      <span>${index + 1}/${mdPaths.length}</span>
    </nav>
    <nav class="doc-links">${docLinks}</nav>
  </header>
  <main id="content">${bodyHtml}</main>
  <script>
    const currentIndex = ${index};
    const totalDocs = ${mdPaths.length};
    const ws = new WebSocket(\`\${location.protocol === "https:" ? "wss" : "ws"}://\${location.host}/ws\`);
    ws.onmessage = (ev) => {
      if (ev.data === "reload") location.reload();
    };

    document.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        location.href = "/doc/" + (currentIndex - 1);
      }
      if (event.key === "ArrowRight" && currentIndex < totalDocs - 1) {
        location.href = "/doc/" + (currentIndex + 1);
      }
    });
  </script>
</body>
</html>`;
}

app.get("/", (_req, res) => {
  res.redirect("/doc/0");
});

app.get("/doc/:index", (req, res) => {
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= mdPaths.length) {
    res.status(404).type("text").send("Document not found");
    return;
  }

  const src = readMarkdown(index);
  const html = renderMarkdownToHtml(src);
  res.type("html").send(pageHtml(html, index));
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

const watcher = chokidar.watch(mdPaths, { ignoreInitial: true });
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
