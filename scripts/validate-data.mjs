import fs from "node:fs";

const files = [
  "app/data/followup-items.json",
  "app/data/projects-index.json",
  "app/data/portfolio-summary.json",
  "app/data/commercial-flags.json"
];

for (const file of files) {
  JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(`OK ${file}`);
}
