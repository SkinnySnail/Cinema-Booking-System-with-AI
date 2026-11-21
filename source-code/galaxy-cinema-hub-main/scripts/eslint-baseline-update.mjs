#!/usr/bin/env node
/**
 * Sinh lại `.eslint-baseline.json` từ kết quả lint hiện tại.
 * Chạy khi bạn đã sửa lỗi lint và muốn nới/nén baseline.
 *   npm run lint:baseline
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, ".eslint-baseline.json");

let results = [];
try {
  const raw = execFileSync("npx", ["eslint", ".", "-f", "json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  results = JSON.parse(raw);
} catch (err) {
  if (err.stdout) {
    results = JSON.parse(err.stdout);
  } else {
    console.error("::error::Không chạy được ESLint:", err.message);
    process.exit(1);
  }
}

const baseline = {};
for (const file of results) {
  const errors = file.messages.filter((m) => m.severity === 2);
  if (!errors.length) continue;
  const rel = file.filePath.replace(root + "/", "");
  const rules = {};
  for (const m of errors) rules[m.ruleId] = (rules[m.ruleId] || 0) + 1;
  baseline[rel] = { errors: errors.length, rules };
}

const sorted = {};
for (const k of Object.keys(baseline).sort()) sorted[k] = baseline[k];

writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");
const total = Object.values(sorted).reduce((sum, f) => sum + f.errors, 0);
console.log(`Đã cập nhật .eslint-baseline.json — ${Object.keys(sorted).length} file, ${total} lỗi.`);
