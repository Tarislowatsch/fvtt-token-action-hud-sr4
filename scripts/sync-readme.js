#!/usr/bin/env node
// Keeps the Requirements table in README.md in sync with the minimum versions declared in module.json.

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const modulePath = path.join(rootDir, "module.json");
const readmePath = path.join(rootDir, "README.md");

const moduleJson = JSON.parse(fs.readFileSync(modulePath, "utf8"));

const rows = [
  {
    label: "Foundry VTT",
    version: moduleJson.compatibility?.minimum,
  },
  {
    label: "Shadowrun 4e system (`shadowrun4e`)",
    version: moduleJson.relationships?.systems?.find((s) => s.id === "shadowrun4e")?.compatibility?.minimum,
  },
  {
    label: "Token Action HUD Core",
    version: moduleJson.relationships?.requires?.find((r) => r.id === "token-action-hud-core")?.compatibility?.minimum,
  },
];

const missing = rows.filter((row) => !row.version).map((row) => row.label);
if (missing.length > 0) {
  console.error(`sync-readme: no minimum version in module.json for: ${missing.join(", ")}`);
  process.exit(1);
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let readme = fs.readFileSync(readmePath, "utf8");

for (const { label, version } of rows) {
  // Matches the table row whose first cell is exactly `label`, capturing its version cell.
  const rowRegex = new RegExp(`^(\\|[ \t]*${escapeRegExp(label)}[ \t]*\\|[ \t]*)([^|\n]*?)([ \t]*\\|[ \t]*)$`, "gm");

  const matches = [...readme.matchAll(rowRegex)];
  if (matches.length !== 1) {
    console.error(
      `sync-readme: expected exactly one README row for "${label}", found ${matches.length}. ` +
        "Update the label in scripts/sync-readme.js if the table changed."
    );
    process.exit(1);
  }

  readme = readme.replace(rowRegex, `$1${version}$3`);
}

const original = fs.readFileSync(readmePath, "utf8");
if (readme !== original) {
  fs.writeFileSync(readmePath, readme);
  console.log("sync-readme: README.md updated");
} else {
  console.log("sync-readme: README.md already up to date");
}
