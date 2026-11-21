#!/usr/bin/env node
/**
 * ESLint baseline check.
 *
 * Dự án có nợ kỹ thuật lint sẵn (chủ yếu `@typescript-eslint/no-explicit-any`).
 * Script này so sánh kết quả lint hiện tại với `.eslint-baseline.json`:
 *   - Lỗi ĐÃ có trong baseline  -> được bỏ qua (không chặn CI).
 *   - Lỗi MỚI (ngoài baseline)  -> CI fail, bắt dev sửa trước khi merge.
 *
 * Khi sửa hết nợ lint của một file, chạy lệnh sau để cập nhật baseline:
 *   npm run lint:baseline
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = resolve(root, ".eslint-baseline.json");

const baseline = existsSync(baselinePath)
  ? JSON.parse(readFileSync(baselinePath, "utf8"))
  : {};

let results = [];
try {
  const raw = execFileSync(
    "npx",
    ["eslint", ".", "-f", "json", "--no-error-on-unmatched-pattern"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }
  );
  results = JSON.parse(raw);
} catch (err) {
  // eslint trả exit code 1 khi có lỗi -> stdout vẫn chứa JSON hợp lệ.
  if (err.stdout) {
    results = JSON.parse(err.stdout);
  } else {
    console.error("::error::Không chạy được ESLint:", err.message);
    process.exit(1);
  }
}

const newViolations = [];
let baselineHits = 0;

for (const file of results) {
  const rel = file.filePath.replace(root + "/", "");
  const known = baseline[rel];
  const errors = file.messages.filter((m) => m.severity === 2);
  if (!errors.length) continue;

  if (!known) {
    // File mới hoặc file chưa từng có lỗi -> mọi lỗi đều là lỗi mới.
    for (const m of errors) {
      newViolations.push({ file: rel, line: m.line, rule: m.ruleId, message: m.message });
    }
    continue;
  }

  // Đếm số lỗi theo rule đã được baseline cho phép.
  const allowed = { ...known.rules };
  for (const m of errors) {
    const rule = m.ruleId;
    const remaining = allowed[rule] ?? 0;
    if (remaining > 0) {
      allowed[rule] = remaining - 1;
      baselineHits += 1;
    } else {
      newViolations.push({ file: rel, line: m.line, rule: m.ruleId, message: m.message });
    }
  }
}

if (newViolations.length) {
  console.error(`::error::Phát hiện ${newViolations.length} lỗi lint MỚI (ngoài baseline):`);
  for (const v of newViolations) {
    console.error(`  ${v.file}:${v.line}  ${v.rule}  ${v.message}`);
  }
  console.error("");
  console.error("Sửa các lỗi trên, hoặc nếu chúng là nợ kỹ thuật cũ được chấp nhận:");
  console.error("  npm run lint:baseline   # cập nhật .eslint-baseline.json");
  process.exit(1);
}

console.log(`Lint OK — ${baselineHits} lỗi nằm trong baseline, 0 lỗi mới.`);
