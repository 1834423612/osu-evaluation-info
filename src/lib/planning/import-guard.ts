/** Import work may finish after cancellation; only the current generation can commit. */
export class ImportGuard {
  private generation = 0;
  private controller: AbortController | null = null;
  start() {
    this.invalidate();
    this.controller = new AbortController();
    return { generation: this.generation, signal: this.controller.signal };
  }
  invalidate() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
  }
  current(generation: number) {
    return generation === this.generation;
  }
}
