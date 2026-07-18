import { chmod, copyFile, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

const allowedEnvironmentKeys = [
  "PATH",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TERM",
  "TMPDIR",
  "TEMP",
  "TMP",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
] as const;

export interface IsolatedCodexRuntime {
  codexHome: string;
  environment: Record<string, string | undefined>;
  authenticationMode: "auth-file" | "environment";
  cleanup: () => Promise<void>;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export function resolveSourceCodexHome(
  environment: Record<string, string | undefined> = process.env,
): string {
  const configured = environment.CODEX_HOME?.trim();
  return configured ? configured : join(homedir(), ".codex");
}

export async function materializeIsolatedCodexRuntime(options: {
  environment?: Record<string, string | undefined>;
  sourceCodexHome?: string;
  temporaryRoot?: string;
} = {}): Promise<IsolatedCodexRuntime> {
  const sourceEnvironment = options.environment ?? process.env;
  const sourceCodexHome =
    options.sourceCodexHome ?? resolveSourceCodexHome(sourceEnvironment);
  const runtimeRoot = await mkdtemp(
    join(options.temporaryRoot ?? tmpdir(), "memosprout-v2-codex-home-"),
  );
  const environment: Record<string, string | undefined> = {};
  for (const key of allowedEnvironmentKeys) {
    if (sourceEnvironment[key] !== undefined) environment[key] = sourceEnvironment[key];
  }
  environment.CODEX_HOME = runtimeRoot;

  let authenticationMode: IsolatedCodexRuntime["authenticationMode"];
  const sourceAuth = join(sourceCodexHome, "auth.json");
  if (await isFile(sourceAuth)) {
    await mkdir(dirname(join(runtimeRoot, "auth.json")), { recursive: true });
    await copyFile(sourceAuth, join(runtimeRoot, "auth.json"));
    await chmod(join(runtimeRoot, "auth.json"), 0o600);
    authenticationMode = "auth-file";
  } else if (sourceEnvironment.CODEX_API_KEY?.trim()) {
    environment.CODEX_API_KEY = sourceEnvironment.CODEX_API_KEY;
    authenticationMode = "environment";
  } else {
    await rm(runtimeRoot, { recursive: true, force: true });
    throw new Error(
      "No minimum Codex authentication material is available for an isolated runtime.",
    );
  }

  const entries = await readdir(runtimeRoot);
  const expectedEntries = authenticationMode === "auth-file" ? ["auth.json"] : [];
  if (JSON.stringify(entries.sort()) !== JSON.stringify(expectedEntries)) {
    await rm(runtimeRoot, { recursive: true, force: true });
    throw new Error("Isolated CODEX_HOME contains non-authentication state.");
  }

  return {
    codexHome: runtimeRoot,
    environment,
    authenticationMode,
    cleanup: () => rm(runtimeRoot, { recursive: true, force: true }),
  };
}

export const isolatedRuntimeEnvironmentAllowlist = [
  ...allowedEnvironmentKeys,
  "CODEX_HOME",
  "CODEX_API_KEY",
] as const;
