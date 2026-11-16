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
    const j = await api({ action: "query", prop: "imageinfo", iiprop: "size|extmetadata|mime", titles: titles.slice(i, i + 40).join("|") });
    for (const p of Object.values(j.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      if (!ii) { out.push({ file: p.title, missing: true }); continue; }
      const m = ii.extmetadata ?? {};
      out.push({
        file: p.title.replace(/^File:/, ""), width: ii.width, height: ii.height, mime: ii.mime,
        licence: strip(m.LicenseShortName?.value), usage: strip(m.UsageTerms?.value), copyrighted: strip(m.Copyrighted?.value),
        artist: strip(m.Artist?.value), date: strip(m.DateTimeOriginal?.value), credit: strip(m.Credit?.value),
        description: strip(m.ImageDescription?.value), restrictions: strip(m.Restrictions?.value),
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
writeFileSync(join(root, "art/lookup-report.json"), JSON.stringify(report, null, 1) + "\n");
console.log(`${report.files.length} files, ${Object.keys(report.searches).length} searches, ${Object.keys(report.categories).length} categories`);
