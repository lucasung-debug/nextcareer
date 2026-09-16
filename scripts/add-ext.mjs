/**
 * 상대 경로 import 에 .js 확장자를 붙인다.
 *
 * 이유: Vercel 의 Node 함수는 ESM 으로 실행되는데, ESM 은 확장자 없는
 * 상대 경로를 해석하지 못한다. TypeScript 소스에 .js 를 써도
 * Vite / Vitest / tsc 는 .ts 파일로 올바르게 찾아간다.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const targets = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) targets.push(p);
  }
}

walk("src");
walk("api");

const RE = /(from\s+|import\()(['"])(\.\.?\/[^'"]+?)\2/g;
let changed = 0;

for (const file of targets) {
  const src = readFileSync(file, "utf8");
  const out = src.replace(RE, (match, prefix, quote, spec) => {
    if (/\.(js|json|css|svg|png)$/.test(spec)) return match;
    return `${prefix}${quote}${spec}.js${quote}`;
  });
  if (out !== src) {
    writeFileSync(file, out);
    changed += 1;
  }
}

console.log(`rewritten: ${changed} / ${targets.length}`);
