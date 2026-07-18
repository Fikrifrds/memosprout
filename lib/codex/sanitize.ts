const credentialPatterns = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /\b(OPENAI_API_KEY|API_KEY|ACCESS_TOKEN|AUTH_TOKEN)\s*[=:]\s*[^\s"']+/gi,
];

const homePathPatterns = [
  /\/Users\/[^/\s"']+/g,
  /\/home\/[^/\s"']+/g,
  /[A-Za-z]:\\Users\\[^\\\s"']+/g,
];

export function sanitizeCodexText(
  input: string,
  options: { temporaryRepository?: string } = {},
): string {
  let sanitized = input;

  if (options.temporaryRepository) {
    sanitized = sanitized.replaceAll(
      options.temporaryRepository,
      "[TEMP_REPOSITORY]",
    );
  }
  for (const pattern of credentialPatterns) {
    sanitized = sanitized.replace(pattern, "[REDACTED_CREDENTIAL]");
  }
  for (const pattern of homePathPatterns) {
    sanitized = sanitized.replace(pattern, "[HOME]");
  }

  return sanitized;
}

export function assertSanitizedEvidence(input: string): void {
  const forbidden = [
    /\bsk-[A-Za-z0-9_-]{12,}\b/,
    /\/Users\/[^/\s"']+/,
    /\/home\/[^/\s"']+/,
    /[A-Za-z]:\\Users\\/,
    /\bOPENAI_API_KEY\s*[=:]\s*[^\s"']+/,
  ];
  if (forbidden.some((pattern) => pattern.test(input))) {
    throw new Error("Sanitized Codex evidence still contains a forbidden value.");
  }
}
