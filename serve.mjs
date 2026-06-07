// CheerpX 検証用の最小静的サーバ。
// CheerpX は SharedArrayBuffer を使うため cross-origin isolation (COOP/COEP) が必須。
// このヘッダを付けて配信する。依存パッケージなし (Node 標準モジュールのみ)。
//
// 使い方:  node serve.mjs   →  http://localhost:8080 を開く

import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
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

    const st = await stat(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    const baseHeaders = {
      "Content-Type": type,
      "Accept-Ranges": "bytes", // CheerpX の HttpBytesDevice が部分読みするのに必須
      // HttpBytesDevice はイメージの一貫性確認に Last-Modified / ETag を要求する
      "Last-Modified": st.mtime.toUTCString(),
      "ETag": `"${st.size}-${Math.floor(st.mtimeMs)}"`,
      ...ISOLATION_HEADERS,
    };

    // Range リクエスト (例: bytes=0-1023) に 206 で部分応答する。
    // 大きな .ext2 を全部読まず、必要なブロックだけ返すため CheerpX に必須。
    const range = req.headers["range"];
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        let start = m[1] === "" ? null : Number(m[1]);
        let end = m[2] === "" ? null : Number(m[2]);
        if (start === null) { start = st.size - end; end = st.size - 1; }   // 末尾 N バイト
        else if (end === null || end >= st.size) { end = st.size - 1; }     // 開始〜末尾
        if (start > end || start < 0) {
          res.writeHead(416, { "Content-Range": `bytes */${st.size}` }).end();
          return;
        }
        res.writeHead(206, {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${end}/${st.size}`,
          "Content-Length": end - start + 1,
        });
        createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }

    // 通常応答 (Range なし) はストリームで返す
    res.writeHead(200, { ...baseHeaders, "Content-Length": st.size });
    createReadStream(filePath).pipe(res);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`CheerpX lab → http://localhost:${PORT}`);
  console.log("COOP/COEP 付きで配信中。Ctrl+C で停止。");
});
