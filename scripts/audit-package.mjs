/**
 * Pre-publish supply-chain audit.
 *
 * Packs the real tarball and inspects what would land on a user's machine:
 * install-time hooks, dangerous APIs in shipped code, network destinations,
 * secrets, and file leakage. Run before every publish:
 *
 *   pnpm audit:package
 */
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";

let failures = 0;
const check = (name, passed, detail = "") => {
  console.log(`${passed ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures++;
};

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

console.log("── Install-time execution ──");
const hooks = ["preinstall", "install", "postinstall", "preuninstall", "postuninstall", "prepare"];
const present = hooks.filter((h) => pkg.scripts?.[h]);
check("no install-time lifecycle scripts", present.length === 0, present.join(",") || "none");

console.log("\n── Dependency surface ──");
const deps = Object.keys(pkg.dependencies ?? {});
check("minimal runtime dependencies", deps.length <= 3, deps.join(", ") || "none");
check(
  "all dependency versions pinned exactly",
  Object.values(pkg.dependencies ?? {}).every((v) => /^\d+\.\d+\.\d+$/.test(v)),
);

console.log("\n── Building and packing ──");
execSync("pnpm build:lib", { stdio: "pipe" });
const tarball = execSync("npm pack", { encoding: "utf8" }).trim().split("\n").pop();

try {
  const files = execSync(`tar -tzf ${tarball}`, { encoding: "utf8" }).trim().split("\n");
  console.log("\n── Tarball contents ──");
  check("only dist/ + metadata shipped",
    files.every((f) => /^package\/(dist\/|package\.json$|README\.md$|LICENSE$)/.test(f)),
    `${files.length} files`);
  check("no source, tests, or config", !files.some((f) => /\/(lib|tests?|scripts|app|bin|docs)\//.test(f)));
  check("no secrets or key material", !files.some((f) => /\.(env|pem|key|p12|crt)$/i.test(f)));
  check("no native binaries or shell scripts", !files.some((f) => /\.(node|so|dylib|dll|exe|sh)$/i.test(f)));

  console.log("\n── Shipped code behavior ──");
  const shipped = ["dist/index.js", "dist/index.cjs", "dist/cli.js"]
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  check("no child_process / shell execution",
    !/child_process|execSync|spawnSync|execFile/.test(shipped));
  check("no eval or Function constructor", !/\beval\(|new Function\(/.test(shipped));
  check("no vm / dynamic module loading", !/require\(["']vm["']\)|node:vm/.test(shipped));

  const urls = [...new Set(shipped.match(/https?:\/\/[a-zA-Z0-9._/-]+/g) ?? [])];
  const allowedHosts = [
    "api.openai.com", "api.anthropic.com", "api.deepseek.com",
    "dashscope.aliyuncs.com", "api.moonshot.cn", "api.xiaomimimo.com",
    "api.minimax.chat", "api.groq.com", "api.together.xyz",
    "openrouter.ai", "localhost",
  ];
  const unexpected = urls.filter((u) => !allowedHosts.some((h) => u.includes(h)));
  check("only documented LLM endpoints referenced", unexpected.length === 0,
    unexpected.join(", ") || `${urls.length} known endpoints`);

  const envReads = [...new Set(shipped.match(/process\.env\.[A-Z_]+/g) ?? [])];
  check("reads only MEMOSPROUT_* env vars",
    envReads.every((e) => e.startsWith("process.env.MEMOSPROUT_")),
    envReads.join(", ") || "none");

  check("no API-key-shaped literals",
    !/sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-/.test(shipped));
  check("no absolute developer paths leaked", !/\/Users\/|\/home\/[a-z]/.test(shipped));
} finally {
  rmSync(tarball, { force: true });
}

console.log(
  failures === 0
    ? "\n✅ Package audit passed — safe to publish."
    : `\n❌ ${failures} check(s) failed — DO NOT PUBLISH.`,
);
process.exit(failures === 0 ? 0 : 1);
