export class SyllabusBudgetReached extends Error {
  constructor() {
    super("Syllabus runtime budget reached");
    this.name = "SyllabusBudgetReached";
  }
}
export function syllabusBudget(seconds = 0, clock = () => performance.now()) {
  const deadline = seconds ? clock() + seconds * 1000 : Infinity;
  const remaining = () => deadline - clock();
  const check = () => {
    if (remaining() <= 0) throw new SyllabusBudgetReached();
  };
  return {
    check,
    remaining,
    async wait(ms, sleep) {
      check();
      if (ms >= remaining()) throw new SyllabusBudgetReached();
      await sleep(ms);
      check();
    },
    signal(original) {
      check();
      if (!Number.isFinite(deadline)) return original;
      const timeout = AbortSignal.timeout(Math.max(1, Math.ceil(remaining())));
      return original ? AbortSignal.any([original, timeout]) : timeout;
    },
  };
}
