export type TranslationCallbacks = {
  onQueued?: () => void;
  onStarted?: () => void;
  onDownload?: () => void;
  canStart?: () => boolean;
};

/** Shared work remains relevant while any mounted consumer still needs it. */
export function createTranslationConsumers(initial: TranslationCallbacks) {
  const consumers = new Set([initial]);
  const current = (consumer: TranslationCallbacks) =>
    consumer.canStart?.() ?? true;
  const notify = (event: "onQueued" | "onStarted" | "onDownload") => {
    for (const consumer of consumers)
      if (current(consumer)) consumer[event]?.();
  };
  return {
    add: (consumer: TranslationCallbacks) => consumers.add(consumer),
    canStart: () => [...consumers].some(current),
    onQueued: () => notify("onQueued"),
    onStarted: () => notify("onStarted"),
    onDownload: () => notify("onDownload"),
  };
}
