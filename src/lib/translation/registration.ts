import { createHash } from "node:crypto";
import type { TranslationNode } from "./providers.ts";
import type { ProviderRegistration } from "./state-store.ts";

export function serverProviderRegistration(
  nodes: TranslationNode[],
  environment: NodeJS.ProcessEnv = process.env,
): ProviderRegistration {
  const node = nodes.find((entry) => entry.id === "ollama");
  return {
    id: "ollama",
    configured: Boolean(node),
    // Store only a one-way fingerprint. Changed credentials/model clear stale health and fence old work.
    configHash: createHash("sha256")
      .update(
        JSON.stringify([
          environment.KJCH_AI_SERVICES_API_URL?.trim(),
          environment.KJCH_AI_SERVICES_MODEL?.trim(),
          environment.KJCH_AI_SERVICES_CF_CLIENT_ID?.trim(),
          environment.KJCH_AI_SERVICES_CF_CLIENT_SECRET?.trim(),
        ]),
      )
      .digest("hex"),
    policy: node
      ? {
          timeoutMs: node.timeoutMs,
          slowMs: node.slowMs,
          cooldownMs: node.cooldownMs,
          concurrency: node.concurrency,
        }
      : { timeoutMs: 6000, slowMs: 2500, cooldownMs: 30000, concurrency: 1 },
  };
}
