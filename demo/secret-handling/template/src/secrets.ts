export function maskSecret(secret: string): string {
  if (secret.length <= 4) {
    return "****";
  }
  return `****${secret.slice(-4)}`;
}
