import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

const env = { ...process.env, NEXT_STATIC_BASE_PATH: "" };
const r = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env,
  cwd: root,
});
process.exit(r.status ?? 1);
