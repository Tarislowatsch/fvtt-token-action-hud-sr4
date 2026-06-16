const fs   = require('fs');
const path = require('path');
require('dotenv').config();

const ROOT_DIR  = path.resolve(__dirname, './');
const TARGET_DIR = process.env.FOUNDRY_PATH;

if (!TARGET_DIR) {
  console.error('FOUNDRY_PATH missing in .env');
  process.exit(1);
}

const ROOT_FILE_ALLOWLIST = new Set(['module.json']);
const ROOT_DIR_ALLOWLIST  = new Set(['lang', 'src']);

function isAllowed(absPath) {
  const rel = path.relative(ROOT_DIR, absPath).replace(/\\/g, '/');
  if (ROOT_FILE_ALLOWLIST.has(rel)) return true;
  const topDir = rel.split('/')[0];
  return ROOT_DIR_ALLOWLIST.has(topDir);
}

function toTarget(absPath) {
  return path.join(TARGET_DIR, path.relative(ROOT_DIR, absPath));
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('changed:', path.relative(ROOT_DIR, src));
}

function removeFile(dest, srcAbs) {
  if (fs.existsSync(dest)) {
    fs.unlinkSync(dest);
    console.log('removed:', path.relative(ROOT_DIR, srcAbs));
  }
}

function copyAll(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (!isAllowed(absPath)) continue;
    if (entry.isDirectory()) {
      copyAll(absPath);
    } else {
      copyFile(absPath, toTarget(absPath));
    }
  }
}

function watchDir(dir) {
  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    const absPath = path.join(dir, filename);
    if (!isAllowed(absPath)) return;
    if (!fs.existsSync(absPath)) {
      removeFile(toTarget(absPath), absPath);
      return;
    }
    if (fs.statSync(absPath).isFile()) {
      copyFile(absPath, toTarget(absPath));
    }
  });
}

copyAll(ROOT_DIR);
watchDir(ROOT_DIR);
console.log('watch active');