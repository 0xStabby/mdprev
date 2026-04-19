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

function getCommonRoot(paths) {
  const [firstPath, ...rest] = paths;
  const root = path.parse(firstPath).root;
  const sharedParts = firstPath.slice(root.length).split(path.sep).filter(Boolean);

  while (sharedParts.length > 0) {
    const candidate = path.join(root, ...sharedParts);
    const matchesAll = rest.every((docPath) => {
      const relative = path.relative(candidate, docPath);
      return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
    });
    if (matchesAll) return candidate;
    sharedParts.pop();
  }

  return path.dirname(firstPath);
}

function sortTree(node) {
  node.directories.sort((a, b) => a.name.localeCompare(b.name));
  node.files.sort((a, b) => a.name.localeCompare(b.name));
  for (const directory of node.directories) sortTree(directory);
}

function buildDocTree(paths, rootDir) {
  const rootNode = { directories: [], files: [] };

  for (let index = 0; index < paths.length; index += 1) {
    const docPath = paths[index];
    const relativePath = path.relative(rootDir, docPath);
    const parts = relativePath.split(path.sep).filter(Boolean);
    let node = rootNode;

    for (const segment of parts.slice(0, -1)) {
      let child = node.directories.find((entry) => entry.name === segment);
      if (!child) {
        child = { name: segment, directories: [], files: [] };
        node.directories.push(child);
      }
      node = child;
    }

    node.files.push({
      index,
      name: parts.at(-1) ?? path.basename(docPath),
      relativePath,
    });
  }

  sortTree(rootNode);
  return rootNode;
}

function renderTree(node, currentIndex, activePathParts = []) {
  const sections = [];

  for (const directory of node.directories) {
    const nextParts = [...activePathParts, directory.name];
    const isActiveBranch = mdPaths[currentIndex]
      ? path.relative(docsRoot, mdPaths[currentIndex]).split(path.sep).slice(0, nextParts.length).join(path.sep) === nextParts.join(path.sep)
      : false;
    sections.push(`
      <details class="tree-dir" ${isActiveBranch ? "open" : ""}>
        <summary>${escapeHtml(directory.name)}</summary>
        <div class="tree-group">${renderTree(directory, currentIndex, nextParts)}</div>
      </details>
    `);
  }

  for (const file of node.files) {
    const activeClass = file.index === currentIndex ? "active" : "";
    sections.push(
      `<a class="tree-file ${activeClass}" href="/doc/${file.index}" title="${escapeHtml(file.relativePath)}">${escapeHtml(file.name)}</a>`,
    );
  }

  return sections.join("");
}

const docsRoot = getCommonRoot(mdPaths);
const docTree = buildDocTree(mdPaths, docsRoot);

// Very small, local CSS: GitHub-ish without huge payload
const baseCss = `
:root { color-scheme: dark; }
body { margin: 0; font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial; background:#0d1117; color:#c9d1d9; }
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
  const currentRelativePath = path.relative(docsRoot, currentPath);
  const treeHtml = renderTree(docTree, index);

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
    body { display:grid; grid-template-columns: 280px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); min-height:100vh; }
    body.sidebar-hidden { grid-template-columns: 0 minmax(0, 1fr); }
    .app-header { grid-column: 1 / -1; position: sticky; top:0; background:#0d1117; border-bottom:1px solid #30363d; padding:10px 14px; display:flex; gap:12px; align-items:center; z-index:20; }
    .brand { font-weight:700; }
    .header-main { min-width:0; display:flex; align-items:center; gap:12px; flex:1; }
    .header-copy { min-width:0; display:grid; gap:2px; }
    .header-copy .path { opacity:.85; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .header-copy .root { color:#8b949e; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .sidebar-toggle, .nav-btn { border:1px solid #30363d; border-radius:8px; padding:4px 10px; color:#c9d1d9; background:#161b22; cursor:pointer; font:inherit; }
    .sidebar-toggle:hover, .nav-btn:hover { text-decoration:none; border-color:#58a6ff; }
    .nav-btn { border:1px solid #30363d; border-radius:8px; padding:4px 8px; color:#c9d1d9; }
    .nav-btn.disabled { opacity:0.45; pointer-events:none; text-decoration:none; }
    .nav { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .sidebar { grid-column:1; grid-row:2; border-right:1px solid #30363d; padding:14px 10px 18px; overflow:auto; background:#0b0f14; }
    body.sidebar-hidden .sidebar { display:none; }
    .sidebar-title { padding:0 8px 10px; color:#8b949e; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
    .tree-dir { margin:2px 0; }
    .tree-dir > summary { list-style:none; cursor:pointer; color:#c9d1d9; border-radius:8px; padding:6px 8px; }
    .tree-dir > summary::-webkit-details-marker { display:none; }
    .tree-dir > summary::before { content:"▸"; display:inline-block; width:1em; color:#8b949e; }
    .tree-dir[open] > summary::before { content:"▾"; }
    .tree-dir > summary:hover, .tree-file:hover { background:#161b22; text-decoration:none; }
    .tree-group { margin-left:14px; border-left:1px solid #21262d; padding-left:8px; }
    .tree-file { display:block; border-radius:8px; padding:6px 8px 6px 14px; color:#c9d1d9; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tree-file.active { background:#1f6feb; color:white; }
    main { grid-column:2; grid-row:2; padding: 18px 22px; max-width: 980px; width:100%; margin:0 auto; }
    body.sidebar-hidden main { grid-column:1 / -1; }
    @media (max-width: 840px) {
      body { grid-template-columns: minmax(0, 1fr); }
      .app-header { flex-wrap:wrap; }
      .header-main { width:100%; }
      .sidebar { position:fixed; top:57px; left:0; bottom:0; width:min(82vw, 320px); z-index:15; box-shadow: 18px 0 32px rgba(0,0,0,.35); }
      body.sidebar-hidden .sidebar { display:none; }
      main, body.sidebar-hidden main { grid-column:1; }
    }
  </style>
</head>
<body>
  <header class="app-header">
    <button class="sidebar-toggle" type="button" aria-expanded="true" aria-controls="sidebar">Hide Files</button>
    <div class="header-main">
      <span class="brand">mdprev</span>
      <div class="header-copy">
        <span class="path">${escapeHtml(currentRelativePath)}</span>
        <span class="root">${escapeHtml(docsRoot)}</span>
      </div>
    </div>
    <nav class="nav">
      <a class="nav-btn ${hasPrev ? "" : "disabled"}" href="${prevHref}">Prev</a>
      <a class="nav-btn ${hasNext ? "" : "disabled"}" href="${nextHref}">Next</a>
      <span>${index + 1}/${mdPaths.length}</span>
    </nav>
  </header>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-title">Files</div>
    ${treeHtml}
  </aside>
  <main id="content">${bodyHtml}</main>
  <script>
    const currentIndex = ${index};
    const totalDocs = ${mdPaths.length};
    const sidebarKey = "mdprev.sidebar-hidden";
    const sidebarToggle = document.querySelector(".sidebar-toggle");
    const body = document.body;
    const ws = new WebSocket(\`\${location.protocol === "https:" ? "wss" : "ws"}://\${location.host}/ws\`);
    ws.onmessage = (ev) => {
      if (ev.data === "reload") location.reload();
    };

    function syncSidebarState(hidden) {
      body.classList.toggle("sidebar-hidden", hidden);
      sidebarToggle.textContent = hidden ? "Show Files" : "Hide Files";
      sidebarToggle.setAttribute("aria-expanded", hidden ? "false" : "true");
      localStorage.setItem(sidebarKey, hidden ? "1" : "0");
    }

    syncSidebarState(localStorage.getItem(sidebarKey) === "1");
    sidebarToggle.addEventListener("click", () => {
      syncSidebarState(!body.classList.contains("sidebar-hidden"));
    });

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
