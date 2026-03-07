import { withTimeout } from './utils.mjs';

export class AsyncLock {
  constructor() {
    this._tail = Promise.resolve();
  }

  async runWithMetrics(task, timeoutMs = 120000) {
    const queuedAt = Date.now();
    let startedAt = queuedAt;

    const execute = async () => task();
    const wrapped = async () => {
      startedAt = Date.now();
      return execute();
    };

    const current = this._tail.then(wrapped, wrapped);
    this._tail = current.catch(() => {});
    const result = await withTimeout(current, timeoutMs, `Lock wait exceeded ${timeoutMs}ms`);

    return {
      result,
      lockWaitMs: Math.max(0, startedAt - queuedAt),
    };
  }

  async run(task, timeoutMs = 120000) {
    const { result } = await this.runWithMetrics(task, timeoutMs);
    return result;
  }
}
