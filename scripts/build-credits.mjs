// Writes CREDITS.md from art/manifest.json. This is also the source for the in-game credits screen.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const { images } = JSON.parse(readFileSync(join(root, "art/manifest.json"), "utf8"));

const credit = (i) => {
  const title = i.date ? `*${i.title}* (${i.date})` : `*${i.title}*`;
  const src = i.source.url ? `[${i.source.name}](${i.source.url})` : i.source.name;
  return `${i.artist}, ${title}. ${src}. ${i.licence}.`;
};

const rows = images
  .filter((i) => i.status !== "open" && i.status !== "to-confirm")
  .map((i) => `- **${(i.cards ?? [i.board]).join(", ")}** (${i.use}): ${credit(i)}`);

writeFileSync(
  join(root, "CREDITS.md"),
  `# Art credits\n\nGenerated from \`art/manifest.json\` by \`scripts/build-credits.mjs\`. Do not edit by hand.\n\n${rows.join("\n")}\n`,
);
console.log(`${rows.length} credits written`);
