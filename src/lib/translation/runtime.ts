import { createTranslationGateway } from "./gateway.ts";
import { createTranslationHandler } from "./handler.ts";
import { createTranslationProviders } from "./providers.ts";
import { createDatabaseTranslationUsage } from "./usage.ts";
import { createTranslationUsageHandler } from "./usage-handler.ts";
import { createMemoryTranslationState } from "./state-store.ts";
import {
  createPostgresTranslationState,
  createTranslationStatePool,
} from "./postgres-state.ts";
import { serverProviderRegistration } from "./registration.ts";
import { saveBrowserProviderStates } from "./browser-state.ts";

function createRuntime() {
  const usage = createDatabaseTranslationUsage();
  const providers = createTranslationProviders();
  const statePool = process.env.DATABASE_URL?.trim()
    ? createTranslationStatePool()
    : null;
  const persistentState = statePool
    ? createPostgresTranslationState(statePool)
    : null;
  const store = persistentState
    ? persistentState
    : createMemoryTranslationState();
  const gateway = createTranslationGateway(
    providers,
    usage.observe,
    Date.now,
    store,
    [serverProviderRegistration(providers)],
  );
  let lastMaintenance = -Infinity;
  return {
    handle: createTranslationHandler(gateway.translateBatch),
    reportUsage: createTranslationUsageHandler(
      usage.observe,
      Date.now,
      (events) =>
        statePool
          ? saveBrowserProviderStates(statePool, events)
          : Promise.resolve(),
    ),
    async flushUsage() {
      await usage.flush();
      if (persistentState && Date.now() - lastMaintenance >= 3600000) {
        lastMaintenance = Date.now();
        await persistentState.prune().catch(() => undefined);
      }
    },
  };
}

const shared = globalThis as typeof globalThis & {
  osuTranslationRuntimeV3?: ReturnType<typeof createRuntime>;
};
/** Share NAS permits, circuit state and bounded caches across requests and dev reloads. */
export const translationRuntime = (shared.osuTranslationRuntimeV3 ??=
  createRuntime());
