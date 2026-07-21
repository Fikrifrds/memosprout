import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "tsup";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function resolveExtension(base: string): string {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return base;
}

// Resolves the Next.js/tsconfig "@/" alias to the project root so the
// published bundle has no dangling "@/" imports.
const aliasPlugin = {
  name: "resolve-at-alias",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setup(build: any) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    build.onResolve({ filter: /^@\// }, (args: any) => {
      const base = path.resolve(rootDir, args.path.replace(/^@\//, ""));
      return { path: resolveExtension(base) };
    });
  },
};

export default defineConfig([
  // The publishable library.
  {
    entry: { index: "lib/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    // Source maps embed the full TypeScript source (sourcesContent) and
    // would more than double the install size. The source is on GitHub.
    sourcemap: false,
    clean: true,
    target: "es2022",
    platform: "node",
    outDir: "dist",
    tsconfig: "tsconfig.build.json",
    esbuildPlugins: [aliasPlugin],
  },
  // The CLI binary (JS only, no type declarations needed).
  {
    entry: { cli: "bin/memosprout.ts" },
    format: ["esm"],
    dts: false,
    // Source maps embed the full TypeScript source (sourcesContent) and
    // would more than double the install size. The source is on GitHub.
    sourcemap: false,
    clean: false,
    target: "es2022",
    platform: "node",
    outDir: "dist",
    tsconfig: "tsconfig.build.json",
    esbuildPlugins: [aliasPlugin],
    banner: { js: "#!/usr/bin/env node" },
  },
]);
