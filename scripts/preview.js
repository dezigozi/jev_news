// dist/ を手元で見るための小さな静的サーバー（127.0.0.1:3945）
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 3945;
const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

if (!existsSync(join(DIST, "index.html"))) {
  console.error("dist が無い。先に npm run build を実行して");
  process.exit(1);
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = normalize(join(DIST, path.endsWith("/") ? `${path}index.html` : path));
  if (!file.startsWith(DIST + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}/`));
