// Downloads every cleared image in art/manifest.json that has a download location.
// Runs in GitHub Actions (see .github/workflows/fetch-art.yml); images land in art/images/.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, "art/images");
mkdirSync(outDir, { recursive: true });

const { images } = JSON.parse(readFileSync(join(root, "art/manifest.json"), "utf8"));
const UA = "CrownAndFable/0.1 (https://github.com/brightonspindoctor/crown-and-fable)";

let fetched = 0, skipped = 0, failed = 0;
for (const img of images) {
  if (!["cleared", "cleared-book"].includes(img.status)) { skipped++; continue; }
  const url = img.downloadUrl
    ?? (img.commonsFile ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img.commonsFile)}` : null);
  if (!url) { skipped++; continue; }
  const ext = (extname(img.commonsFile ?? new URL(url).pathname) || ".jpg").toLowerCase();
  const dest = join(outDir, `${img.id}${ext}`);
  if (existsSync(dest)) { skipped++; continue; }
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`fetched ${img.id}`);
    fetched++;
  } catch (e) {
    console.log(`failed ${img.id}: ${e.message}`);
    failed++;
  }
}
console.log(`${fetched} fetched, ${skipped} skipped, ${failed} failed`);
