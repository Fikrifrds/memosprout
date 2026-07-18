import { spawn } from "node:child_process";
import {
  cp,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { regenerateClient } from "@/lib/scenario/generated-files";

export interface ProtectionAcceptanceResult {
  id: string;
  expected: "allow" | "reject";
  observed: "allow" | "reject";
  exitCode: number;
  repositoryUnchanged: boolean;
}

type Mutation = (repositoryRoot: string) => Promise<void>;

async function runProtection(repositoryRoot: string): Promise<number> {
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const check = join(repositoryRoot, "scripts", "check-generated-files.ts");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, check], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? -1));
  });
}

async function append(path: string, value: string): Promise<void> {
  const current = await readFile(path, "utf8");
  await writeFile(path, `${current}${value}`, "utf8");
}

async function snapshotRepository(
  repositoryRoot: string,
): Promise<Record<string, { content: string; mtimeMs: number; size: number }>> {
  const snapshot: Record<string, { content: string; mtimeMs: number; size: number }> = {};

  async function visit(directory: string, relativeDirectory = ""): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const relativePath = join(relativeDirectory, entry.name);
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        const [content, metadata] = await Promise.all([
          readFile(absolutePath),
          lstat(absolutePath),
        ]);
        snapshot[relativePath] = {
          content: content.toString("base64"),
          mtimeMs: metadata.mtimeMs,
          size: metadata.size,
        };
      }
    }
  }

  await visit(repositoryRoot);
  return snapshot;
}

const invalidMutations: Array<{ id: string; mutate: Mutation }> = [
  {
    id: "direct-generated-append",
    mutate: (root) => append(join(root, "generated/api-client.ts"), "// manual edit\n"),
  },
  {
    id: "direct-generated-rewrite",
    async mutate(root) {
      const path = join(root, "generated/api-client.ts");
      const current = await readFile(path, "utf8");
      await writeFile(path, current.replace("name: string;", "displayName: string;"), "utf8");
    },
  },
  {
    id: "truncated-generated-client",
    mutate: (root) => writeFile(join(root, "generated/api-client.ts"), "", "utf8"),
  },
  {
    id: "schema-change-without-regeneration",
    mutate: (root) =>
      append(
        join(root, "api/openapi.yaml"),
        "        mobile_number:\n          type: string\n",
      ),
  },
  {
    id: "missing-generated-client",
    mutate: (root) => unlink(join(root, "generated/api-client.ts")),
  },
];

const validMutations: Array<{ id: string; mutate: Mutation }> = [
  { id: "clean-repository", mutate: async () => undefined },
  {
    id: "unchanged-regeneration",
    async mutate(root) {
      await regenerateClient(root);
    },
  },
  {
    id: "optional-schema-field-with-regeneration",
    async mutate(root) {
      await append(
        join(root, "api/openapi.yaml"),
        "        email_address:\n          type: string\n",
      );
      await regenerateClient(root);
    },
  },
  {
    id: "required-schema-field-with-regeneration",
    async mutate(root) {
      const path = join(root, "api/openapi.yaml");
      const current = await readFile(path, "utf8");
      await writeFile(
        path,
        current
          .replace("        - name\n", "        - name\n        - account_id\n")
          .concat("        account_id:\n          type: string\n"),
        "utf8",
      );
      await regenerateClient(root);
    },
  },
  {
    id: "schema-metadata-only",
    async mutate(root) {
      const path = join(root, "api/openapi.yaml");
      const current = await readFile(path, "utf8");
      await writeFile(path, current.replace("  version: 1.0.0", "  version: 1.0.1"), "utf8");
    },
  },
  {
    id: "unrelated-source-change",
    mutate: (root) => append(join(root, "src/index.ts"), "\n"),
  },
  {
    id: "unrelated-documentation-file",
    mutate: (root) => writeFile(join(root, "NOTES.md"), "Valid control.\n", "utf8"),
  },
  {
    id: "schema-extension-only",
    mutate: (root) => append(join(root, "api/openapi.yaml"), "x-control: true\n"),
  },
];

async function evaluateMutation(options: {
  templateRoot: string;
  id: string;
  expected: "allow" | "reject";
  mutate: Mutation;
}): Promise<ProtectionAcceptanceResult> {
  const root = await mkdtemp(join(tmpdir(), "memosprout-acceptance-"));
  try {
    await cp(options.templateRoot, root, {
      recursive: true,
      filter: (source) => !source.endsWith("/node_modules"),
    });
    await symlink(join(process.cwd(), "node_modules"), join(root, "node_modules"));
    await options.mutate(root);
    const beforeProtection = await snapshotRepository(root);
    const exitCode = await runProtection(root);
    const afterProtection = await snapshotRepository(root);
    const observed = exitCode === 0 ? "allow" : "reject";
    return {
      id: options.id,
      expected: options.expected,
      observed,
      exitCode,
      repositoryUnchanged:
        JSON.stringify(beforeProtection) === JSON.stringify(afterProtection),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function runProtectionAcceptanceSuite(
  templateRoot = join(process.cwd(), "demo", "generated-files", "template"),
): Promise<{
  invalid: ProtectionAcceptanceResult[];
  valid: ProtectionAcceptanceResult[];
}> {
  const invalid = [];
  for (const fixture of invalidMutations) {
    invalid.push(
      await evaluateMutation({
        templateRoot,
        id: fixture.id,
        expected: "reject",
        mutate: fixture.mutate,
      }),
    );
  }
  const valid = [];
  for (const fixture of validMutations) {
    valid.push(
      await evaluateMutation({
        templateRoot,
        id: fixture.id,
        expected: "allow",
        mutate: fixture.mutate,
      }),
    );
  }
  return { invalid, valid };
}

export function assertProtectionAcceptance(
  results: Awaited<ReturnType<typeof runProtectionAcceptanceSuite>>,
): void {
  const mismatch = [...results.invalid, ...results.valid].find(
    (result) => result.expected !== result.observed || !result.repositoryUnchanged,
  );
  if (mismatch) {
    throw new Error(
      `Protection acceptance failed for ${mismatch.id}: expected ${mismatch.expected}, observed ${mismatch.observed}, repository unchanged ${mismatch.repositoryUnchanged}.`,
    );
  }
}
