// Downloads every cleared image in art/manifest.json that has a download location.
// Runs in GitHub Actions (see .github/workflows/fetch-art.yml); images land in art/images/
// and a report of what was and wasn't fetched goes to art/fetch-report.json.
//
// How an image is found, in order:
//   downloadUrl     a direct link to the image file
//   commonsFile     a Wikimedia Commons file name
//   metObjectId     a Metropolitan Museum object id (Open Access API)
//   wellcomeQuery   a Wellcome Collection record number (catalogue API + IIIF)
//   imagePage       a page about this one image; its og:image / twitter:image is used
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, "art/images");
mkdirSync(outDir, { recursive: true });

const { images } = JSON.parse(readFileSync(join(root, "art/manifest.json"), "utf8"));
const UA = "CrownAndFable/0.1 (https://github.com/brightonspindoctor/crown-and-fable)";
const get = (url, accept) => fetch(url, { headers: { "User-Agent": UA, ...(accept ? { Accept: accept } : {}) }, redirect: "follow" });

async function fromMet(id) {
  const r = await get(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
  const j = await r.json();
  if (!j.isPublicDomain) throw new Error("Met says not public domain");
  return j.primaryImage || null;
}

async function fromWellcome(q) {
  const r = await get(`https://api.wellcomecollection.org/catalogue/v2/works?query=${encodeURIComponent(q)}&include=items`);
  const j = await r.json();
  for (const work of j.results ?? []) {
    for (const item of work.items ?? []) {
      for (const loc of item.locations ?? []) {
        if (loc.locationType?.id === "iiif-image" && loc.url) {
          return loc.url.replace(/\/info\.json$/, "/full/2000,/0/default.jpg").replace("/thumbs/", "/image/");
        }
      }
    }
    if (work.thumbnail?.url) return work.thumbnail.url.replace("/thumbs/", "/image/").replace(/\/full\/[^/]+\//, "/full/2000,/");
  }
  return null;
}

async function fromCommonsSearch(q) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=1&format=json&srsearch=${encodeURIComponent(q + " filetype:bitmap")}`;
  const j = await (await get(api)).json();
  const title = j.query?.search?.[0]?.title;
  if (!title) return null;
  const file = title.replace(/^File:/, "").replace(/ /g, "_");
  return { url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`, file };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fromPage(page) {
  let r = await get(page, "text/html");
  for (let i = 0; r.status === 429 && i < 3; i++) { await sleep(5000 * (i + 1)); r = await get(page, "text/html"); }
  if (!r.ok) throw new Error(`page HTTP ${r.status}`);
  const html = await r.text();
  const pick = (re) => html.match(re)?.[1];
  const found =
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
    pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
    pick(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
  return found ? new URL(found.replace(/&amp;/g, "&"), page).href : null;
}

// Tries each known route in turn and returns the first that yields a URL.
async function resolve(img) {
  const routes = [];
  if (img.downloadUrl) routes.push(["downloadUrl", async () => img.downloadUrl]);
  if (img.commonsFile) routes.push(["commonsFile", async () => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img.commonsFile)}`]);
  if (img.metObjectId) routes.push(["met", () => fromMet(img.metObjectId)]);
  if (img.wellcomeQuery) routes.push(["wellcome", () => fromWellcome(img.wellcomeQuery)]);
  if (img.imagePage) routes.push(["imagePage", () => fromPage(img.imagePage)]);
  if (img.commonsSearch) routes.push(["commonsSearch", async () => {
    const hit = await fromCommonsSearch(img.commonsSearch);
    if (hit) img._commonsHit = hit.file;
    return hit?.url ?? null;
  }]);
  const errors = [];
  for (const [via, fn] of routes) {
    try {
      const url = await fn();
      if (url) return { url, via, errors };
    } catch (e) { errors.push(`${via}: ${e.message}`); }
  }
  if (errors.length) throw new Error(errors.join("; "));
  return { url: null, via: "none" };
}

const extFor = (type, url) => {
  if (type?.includes("png")) return ".png";
  if (type?.includes("gif")) return ".gif";
  if (type?.includes("webp")) return ".webp";
  if (type?.includes("jpeg")) return ".jpg";
  return (url.match(/\.(jpe?g|png|gif|webp)(\?|$)/i)?.[0].replace(/\?$/, "") ?? ".jpg").toLowerCase();
};

const already = new Set(readdirSync(outDir).map((f) => f.replace(/\.[^.]+$/, "")));
const report = { ranAt: new Date().toISOString(), fetched: [], alreadyHad: [], unresolved: [], failed: [], notCleared: [] };

for (const img of images) {
  if (!["cleared", "cleared-book"].includes(img.status)) { report.notCleared.push(img.id); continue; }
  if (already.has(img.id)) { report.alreadyHad.push(img.id); continue; }
  try {
    const { url, via } = await resolve(img);
    if (!url) { report.unresolved.push({ id: img.id, via }); continue; }
    const res = await get(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) throw new Error(`not an image (${type}) from ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const dest = join(outDir, `${img.id}${extFor(type, url)}`);
    writeFileSync(dest, buf);
    report.fetched.push({ id: img.id, via, url, bytes: buf.length, ...(img._commonsHit ? { commonsFile: img._commonsHit } : {}) });
    console.log(`fetched ${img.id} via ${via} (${buf.length} bytes)`);
  } catch (e) {
    report.failed.push({ id: img.id, error: e.message });
    console.log(`failed ${img.id}: ${e.message}`);
  }
  await sleep(2500); // Commons rate-limits quick runs of downloads
}

writeFileSync(join(root, "art/fetch-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`${report.fetched.length} fetched, ${report.alreadyHad.length} already had, ${report.unresolved.length} unresolved, ${report.failed.length} failed`);
