// Looks things up on Wikimedia Commons and records what each file's own page says about its rights.
// Reads art/lookups.json ({ files: [...], searches: [...], categories: [...] }) and writes
// art/lookup-report.json. Runs in GitHub Actions (see .github/workflows/commons-lookup.yml).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const asks = JSON.parse(readFileSync(join(root, "art/lookups.json"), "utf8"));
const UA = "CrownAndFable/0.1 (https://github.com/brightonspindoctor/crown-and-fable)";
const api = async (params) => {
  const url = "https://commons.wikimedia.org/w/api.php?format=json&origin=*&" + new URLSearchParams(params);
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return r.json();
    await new Promise((s) => setTimeout(s, 3000 * (i + 1)));
  }
  throw new Error("Commons API failed: " + url);
};
const strip = (s) => (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);

async function info(titles) {
  const out = [];
  for (let i = 0; i < titles.length; i += 40) {
    const j = await api({ action: "query", prop: "imageinfo|templates", iiprop: "size|extmetadata|mime", tllimit: 500, titles: titles.slice(i, i + 40).join("|") });
    for (const p of Object.values(j.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      if (!ii) { out.push({ file: p.title, missing: true }); continue; }
      const m = ii.extmetadata ?? {};
      out.push({
        file: p.title.replace(/^File:/, ""), width: ii.width, height: ii.height, mime: ii.mime,
        licence: strip(m.LicenseShortName?.value), usage: strip(m.UsageTerms?.value), copyrighted: strip(m.Copyrighted?.value),
        artist: strip(m.Artist?.value), date: strip(m.DateTimeOriginal?.value), credit: strip(m.Credit?.value),
        description: strip(m.ImageDescription?.value), restrictions: strip(m.Restrictions?.value),
        licenceTags: (p.templates ?? []).map((t) => t.title.replace(/^Template:/, "")).filter((t) => /^(PD|CC|Cc-|FAL|GFDL|Copyright|No |Licen|Non-free|Public domain)/i.test(t)),
      });
    }
  }
  return out;
}

const report = { ranAt: new Date().toISOString(), files: [], searches: {}, categories: {} };
if (asks.files?.length) report.files = await info(asks.files.map((f) => "File:" + f));
for (const q of asks.searches ?? []) {
  const j = await api({ action: "query", list: "search", srnamespace: 6, srlimit: 12, srsearch: q + " filetype:bitmap" });
  report.searches[q] = await info((j.query?.search ?? []).map((s) => s.title));
}
// peekSearches: preview the top hits of a search as well as listing them.
for (const q of asks.peekSearches ?? []) {
  const j = await api({ action: "query", list: "search", srnamespace: 6, srlimit: 5, srsearch: q + " filetype:bitmap" });
  report.searches[q] = await info((j.query?.search ?? []).map((s) => s.title));
  (asks.peek ??= []).push(...report.searches[q].filter((f) => !f.missing).map((f) => f.file));
}
for (const c of asks.categories ?? []) {
  const j = await api({ action: "query", list: "categorymembers", cmtitle: "Category:" + c, cmtype: "file|subcat", cmlimit: 80 });
  const members = j.query?.categorymembers ?? [];
  report.categories[c] = {
    subcategories: members.filter((m) => m.ns === 14).map((m) => m.title.replace(/^Category:/, "")),
    files: await info(members.filter((m) => m.ns === 6).map((m) => m.title)),
  };
}

// peek: small copies of candidate images so they can be looked at before one is chosen.
// art/peek/ is scratch space and is emptied on every run.
rmSync(join(root, "art/peek"), { recursive: true, force: true });
if (asks.peek?.length) {
  mkdirSync(join(root, "art/peek"), { recursive: true });
  report.peek = [];
  for (const [n, f] of asks.peek.entries()) {
    const r = await fetch(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f.replace(/ /g, "_"))}?width=640`, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!r.ok) { report.peek.push({ file: f, error: r.status }); continue; }
    const name = String(n).padStart(2, "0") + ".jpg";
    writeFileSync(join(root, "art/peek", name), Buffer.from(await r.arrayBuffer()));
    report.peek.push({ file: f, saved: name });
    await new Promise((s) => setTimeout(s, 400));
  }
}

// ia: Internet Archive. iaSearch finds book scans; iaPages saves small thumbnails of chosen pages
// (to spot the plates), iaFull saves full-size pages that have been chosen.
const IA_UA = { headers: { "User-Agent": UA } };
if (asks.iaSearch?.length) {
  report.iaSearch = {};
  for (const q of asks.iaSearch) {
    const u = "https://archive.org/advancedsearch.php?" + new URLSearchParams({ q, "fl[]": "identifier", rows: 15, output: "json" });
    const j = await (await fetch(u, IA_UA)).json();
    const ids = (j.response?.docs ?? []).map((d) => d.identifier);
    report.iaSearch[q] = [];
    for (const id of ids) {
      const md = await (await fetch(`https://archive.org/metadata/${id}`, IA_UA)).json();
      const m = md.metadata ?? {};
      report.iaSearch[q].push({ id, title: m.title, creator: m.creator, date: m.date, publisher: m.publisher, pages: m.imagecount, rights: m.rights ?? m["possible-copyright-status"] });
    }
  }
}
const iaPage = async (id, n, width) => {
  const urls = [
    `https://iiif.archive.org/iiif/3/${id}$${n}/full/${width ? width + "," : "max"}/0/default.jpg`,
    `https://archive.org/download/${id}/page/n${n}${width ? "_w" + width : ""}.jpg`,
  ];
  for (const u of urls) {
    const r = await fetch(u, { ...IA_UA, redirect: "follow" });
    if (r.ok && (r.headers.get("content-type") ?? "").startsWith("image/")) return Buffer.from(await r.arrayBuffer());
  }
  throw new Error(`IA ${id} page ${n}: no image`);
};
if (asks.iaPages?.length || asks.iaFull?.length) mkdirSync(join(root, "art/peek"), { recursive: true });
for (const { id, from, to, step = 1 } of asks.iaPages ?? []) {
  const pages = [];
  for (let n = from; n <= to; n += step) pages.push(n);
  for (let i = 0; i < pages.length; i += 6) {
    await Promise.all(pages.slice(i, i + 6).map(async (n) => {
      try { writeFileSync(join(root, "art/peek", `ia-${id}-${String(n).padStart(4, "0")}.jpg`), await iaPage(id, n, 160)); }
      catch (e) { (report.errors ??= []).push(e.message); }
    }));
  }
}
for (const { id, page, name } of asks.iaFull ?? []) {
  try { writeFileSync(join(root, "art/peek", `full-${name}.jpg`), await iaPage(id, page)); }
  catch (e) { (report.errors ??= []).push(e.message); }
}
// pageImages: list every image linked from a web page (to find the real file behind a gallery page).
if (asks.pageImages?.length) {
  report.pageImages = {};
  for (const url of asks.pageImages) {
    try {
      const html = await (await fetch(url, IA_UA)).text();
      report.pageImages[url] = [...new Set([...html.matchAll(/(?:src|href|content|srcset)="([^"]+\.(?:jpe?g|png|webp|avif)[^"\s]*)/gi)].map((m) => new URL(m[1], url).href))].slice(0, 40);
    } catch (e) { report.pageImages[url] = ["error: " + e.message]; }
  }
}
writeFileSync(join(root, "art/lookup-report.json"), JSON.stringify(report, null, 1) + "\n");
console.log(`${report.files.length} files, ${Object.keys(report.searches).length} searches, ${Object.keys(report.categories).length} categories`);
