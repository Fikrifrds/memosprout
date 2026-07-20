import type { ServiceConfig } from "./types";

export function describeConfig(config: ServiceConfig): string {
  return `region=${config.region} apiKey=${config.apiKey} timeout=${config.timeoutMs}ms`;
}
