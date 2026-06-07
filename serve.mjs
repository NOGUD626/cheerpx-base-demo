// CheerpX 検証用の最小静的サーバ。
// CheerpX は SharedArrayBuffer を使うため cross-origin isolation (COOP/COEP) が必須。
// このヘッダを付けて配信する。依存パッケージなし (Node 標準モジュールのみ)。
//
// 使い方:  node serve.mjs   →  http://localhost:8080 を開く

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 8080;

// 拡張子 → Content-Type
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

// SharedArrayBuffer 有効化に必須のヘッダ (c2w の serve.mjs と同等)
const ISOLATION_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

const server = createServer(async (req, res) => {
  try {
    // パストラバーサル防止しつつ index.html にフォールバック
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const filePath = join(ROOT, normalize(urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, ...ISOLATION_HEADERS });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`CheerpX lab → http://localhost:${PORT}`);
  console.log("COOP/COEP 付きで配信中。Ctrl+C で停止。");
});
