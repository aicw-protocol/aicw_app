/**
 * After a normal GitHub-Pages build (basePath /aicw_app), copies `out/` into
 * `nested-preview/aicw_app/` so you can run:
 *   npx serve nested-preview -p 4002
 * and open http://localhost:4002/aicw_app/ without chunk 404s.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const outDir = path.join(root, "out");
const nestedRoot = path.join(root, "nested-preview");
const nestedApp = path.join(nestedRoot, "aicw_app");

const env = { ...process.env };
delete env.NEXT_STATIC_BASE_PATH;

const br = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  cwd: root,
  env,
});
if (br.status !== 0) process.exit(br.status ?? 1);

if (!existsSync(outDir)) {
  console.error("missing out/ after build");
  process.exit(1);
}

rmSync(nestedRoot, { recursive: true, force: true });
mkdirSync(nestedApp, { recursive: true });
cpSync(outDir, nestedApp, { recursive: true });

console.log(`
Done. Static paths in HTML are /aicw_app/_next/...
Run from repo root:
  npx serve nested-preview -p 4002
Then open:
  http://localhost:4002/aicw_app/
`);
