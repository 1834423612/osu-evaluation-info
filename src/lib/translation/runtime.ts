import { createTranslationGateway } from "./gateway.ts";
import { createTranslationHandler } from "./handler.ts";
import { createTranslationProviders } from "./providers.ts";
import { createDatabaseTranslationUsage } from "./usage.ts";

function createRuntime() {
  const usage = createDatabaseTranslationUsage();
  const gateway = createTranslationGateway(
    createTranslationProviders(),
    usage.observe,
  );
  return {
    handle: createTranslationHandler(gateway.translateBatch),
    flushUsage: usage.flush,
  };
}

const shared = globalThis as typeof globalThis & {
  osuTranslationRuntime?: ReturnType<typeof createRuntime>;
};
/** Share NAS permits, circuit state and bounded caches across requests and dev reloads. */
export const translationRuntime = (shared.osuTranslationRuntime ??=
  createRuntime());
