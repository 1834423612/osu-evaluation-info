type Generation = { run: string; term: string };
const budgetError = () =>
  Object.assign(Error("Search request budget exhausted"), {
    code: "SEARCH_DEADLINE_EXCEEDED",
  });

/** Bounds shared-cache queue waits as well as active work. Late promises stay handled. */
export async function withinSearchDeadline<T>(
  work: Promise<T>,
  deadline: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(budgetError()),
          Math.max(0, deadline - performance.now()),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** A late pool acquisition is returned immediately, without starting any SQL. */
export async function withSearchConnection<
  C extends { release: (destroy?: boolean) => void },
  T,
>(
  pool: { connect: () => Promise<C> },
  deadline: number,
  attemptMs: number,
  work: (connection: C) => Promise<T>,
): Promise<T> {
  if (performance.now() >= deadline) throw budgetError();
  let abandoned = false;
  const acquired = pool.connect().then((connection) => {
    if (abandoned) {
      connection.release();
      throw budgetError();
    }
    return connection;
  });
  let connection: C;
  try {
    connection = await withinSearchDeadline(acquired, deadline);
  } catch (error) {
    abandoned = true;
    throw error;
  }
  return withGenerationDeadline(
    connection,
    Math.min(attemptMs, deadline - performance.now()),
    () => work(connection),
  );
}
/** Bound all reads in an attempt; destroying a timed-out pooled connection cancels its SQL. */
export async function withGenerationDeadline<T>(
  connection: { release: (destroy?: boolean) => void },
  budgetMs: number,
  work: () => Promise<T>,
): Promise<T> {
  if (budgetMs <= 0) {
    connection.release(true);
    throw Error("Search generation read budget exhausted");
  }
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    connection.release(true);
  }, budgetMs);
  try {
    return await work();
  } finally {
    clearTimeout(timer);
    if (!expired) connection.release();
  }
}
type Options<G extends Generation, T> = {
  load: (generation: G) => Promise<T>;
  previous: (generation: G) => Promise<G | null>;
  pinned?: boolean;
  onFallback?: (event: {
    term: string;
    failedRun: string;
    fallbackRun: string;
  }) => void;
};
export async function loadSearchGeneration<G extends Generation, T>(
  initial: G,
  options: Options<G, T>,
): Promise<T> {
  let selected = initial;
  const visited = new Set([selected.run]);
  for (let attempt = 0; ; attempt++) {
    try {
      return await options.load(selected);
    } catch (error) {
      if (options.pinned || attempt >= 2) throw error;
      const previous = await options.previous(selected);
      if (
        !previous ||
        previous.term !== initial.term ||
        visited.has(previous.run)
      )
        throw error;
      const event = {
        term: initial.term,
        failedRun: selected.run,
        fallbackRun: previous.run,
        code: /^[A-Z0-9_]{1,64}$/.test(
          String((error as { code?: unknown })?.code),
        )
          ? String((error as { code: unknown }).code)
          : "GENERATION_LOAD_FAILED",
      };
      if (options.onFallback) options.onFallback(event);
      else
        console.warn(
          JSON.stringify({
            event: "catalog.search_generation_fallback",
            ...event,
          }),
        );
      visited.add(previous.run);
      selected = previous;
    }
  }
}
