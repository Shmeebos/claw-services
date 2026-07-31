export type RequestLease = {
  signal: AbortSignal;
  isCurrent: () => boolean;
  finish: () => boolean;
};

export class LatestRequestCoordinator {
  private generation = 0;
  private activeController: AbortController | null = null;

  begin(): RequestLease {
    this.activeController?.abort();

    const generation = ++this.generation;
    const controller = new AbortController();
    this.activeController = controller;

    const isCurrent = () =>
      this.generation === generation &&
      this.activeController === controller &&
      !controller.signal.aborted;

    return {
      signal: controller.signal,
      isCurrent,
      finish: () => {
        if (!isCurrent()) return false;
        this.activeController = null;
        return true;
      },
    };
  }

  invalidate() {
    this.generation += 1;
    this.activeController?.abort();
    this.activeController = null;
  }
}
