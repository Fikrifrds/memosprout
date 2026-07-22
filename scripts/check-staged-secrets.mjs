#!/usr/bin/env node
/**
 * Rejects staged content that looks like a credential.
 *
 * Two independent checks, because they fail in different ways: a filename
 * rule catches the whole-file case even when the contents are unfamiliar,
 * and a content rule catches a key pasted into an ordinary source file.
 *
 * The bar for a content match is deliberately high. A hook that cries wolf
 * gets bypassed with --no-verify out of habit, and then it protects nothing
 * — so recognised placeholders are allowed through and generic
 * high-entropy strings are not flagged at all.
 *
 * Run directly to check the current index:
 *   node scripts/check-staged-secrets.mjs
 */
import { execFileSync } from "node:child_process";

/** Files that are credential material whatever they contain. */
const FORBIDDEN_PATHS = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)\.provider_list_to_test$/,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/,
  /(^|\/)(credentials|secrets?)\.(json|ya?ml)$/i,
  /\.(pem|p12|pfx|keystore|jks)$/i,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.aws\//,
];

/**
 * Key formats with a recognisable prefix. Generic long strings are not
 * included: hashes, base64 fixtures, and lockfile integrity lines would
 * all trip a length-and-entropy rule, and a hook nobody trusts is worse
 * than no hook.
 */
const SECRET_PATTERNS = [
  { name: "OpenAI key", re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "Stripe secret key", re: /\b[sr]k_live_[A-Za-z0-9]{20,}/ },
  { name: "private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/** Values the repository uses on purpose, in tests and documentation. */
const ALLOWED = [
  /\bsk-test\b/,
  /\bsk-ant-test\b/,
  /your[-_]?api[-_]?key/i,
  /<[^>]*(key|token|secret)[^>]*>/i,
  /\$\{?[A-Z_]*(KEY|TOKEN|SECRET)/,
  /process\.env\./,
];

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const staged = git("diff", "--cached", "--name-only", "--diff-filter=ACM")
  .split("\n")
  .filter(Boolean);

if (staged.length === 0) process.exit(0);

const findings = [];

for (const path of staged) {
  if (FORBIDDEN_PATHS.some((re) => re.test(path))) {
    findings.push({ path, line: null, what: "credential file" });
    continue;
  }

  let content;
  try {
    content = git("show", `:${path}`);
  } catch {
    continue; // deleted, or unreadable as text
  }
  if (content.includes("\0")) continue; // binary

  content.split("\n").forEach((text, index) => {
    if (ALLOWED.some((re) => re.test(text))) return;
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(text)) findings.push({ path, line: index + 1, what: name });
    }
  });
}

if (findings.length === 0) process.exit(0);

console.error("\nCommit blocked: staged changes look like they contain credentials.\n");
for (const { path, line, what } of findings) {
  console.error(`  ${path}${line ? `:${line}` : ""}  — ${what}`);
}
console.error(
  "\nUnstage the file, and add it to .gitignore if it should never be tracked:\n" +
    "  git restore --staged <file>\n" +
    "\nIf the key is real and was ever pushed, rotate it — removing the commit\n" +
    "does not un-share it.\n" +
    "\nIf this is a false positive: git commit --no-verify\n",
);
process.exit(1);
