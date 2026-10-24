// Bundles the worker (migrate / seed / expiry-alerts / discover-aws) into one file
// so the production image can run it with plain `node`, no TypeScript toolchain.
import { build } from "esbuild";
import path from "node:path";

await build({
  entryPoints: ["src/worker/index.ts"],
  outfile: ".output/worker/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  alias: { "@": path.resolve("src") },
  // CommonJS deps (pg, pino) need require() available inside an ESM bundle.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
