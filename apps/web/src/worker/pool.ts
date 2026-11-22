import {
  DEFAULT_LIMITS,
  PdfToolsError,
  type OpArgs,
  type OpName,
  type OpOutput,
  type WorkerRequest,
  type WorkerResponse,
} from '@pdf-tools/core';

/** The slice of the Worker API the pool uses, so tests can supply a fake. */
export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer: Transferable[]): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<WorkerResponse>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (e: Event) => void): void;
}

export interface RunOptions {
  /** Buffers inside `args` to transfer (zero-copy). They are detached after the call. */
  transfer?: Transferable[];
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface Job {
  request: WorkerRequest;
  opts: RunOptions;
  resolve: (out: OpOutput) => void;
  reject: (err: PdfToolsError) => void;
}

interface Slot {
  worker: WorkerLike;
  job: Job | null;
}

export function defaultPoolSize(
  hardwareConcurrency = globalThis.navigator?.hardwareConcurrency ?? 2,
): number {
  return Math.min(4, Math.max(1, hardwareConcurrency - 1));
}

/**
 * Runs ops on up to `size` workers. A job that times out or is cancelled terminates its worker
 * (the only way to stop a runaway parser), and a fresh worker takes the slot on the next job.
 */
export class WorkerPool {
  private slots: Slot[] = [];
  private queue: Job[] = [];
  private nextId = 1;

  constructor(
    private readonly create: () => WorkerLike,
    private readonly size = defaultPoolSize(),
  ) {}

  run<K extends OpName>(op: K, args: OpArgs[K], opts: RunOptions = {}): Promise<OpOutput> {
    return new Promise((resolve, reject) => {
      if (opts.signal?.aborted) return reject(new PdfToolsError('cancelled'));
      const request = { type: 'run', id: this.nextId++, op, args } as WorkerRequest;
      this.queue.push({ request, opts, resolve, reject });
      this.pump();
    });
  }

  /** Terminate every worker; queued and running jobs are cancelled. */
  destroy(): void {
    for (const job of this.queue) job.reject(new PdfToolsError('cancelled'));
    this.queue = [];
    for (const slot of this.slots) {
      slot.job?.reject(new PdfToolsError('cancelled'));
      slot.worker.terminate();
    }
    this.slots = [];
  }

  private pump(): void {
    while (this.queue.length > 0) {
      let slot = this.slots.find((s) => s.job === null);
      if (!slot) {
        if (this.slots.length >= this.size) return;
        slot = this.spawn();
      }
      this.start(slot, this.queue.shift()!);
    }
  }

  private spawn(): Slot {
    const slot: Slot = { worker: this.create(), job: null };
    slot.worker.addEventListener('message', (e) => this.onMessage(slot, e.data));
    const crash = () => this.finish(slot, new PdfToolsError('internal'), true);
    slot.worker.addEventListener('error', crash);
    slot.worker.addEventListener('messageerror', crash);
    this.slots.push(slot);
    return slot;
  }

  private start(slot: Slot, job: Job): void {
    slot.job = job;
    const { signal, timeoutMs = DEFAULT_LIMITS.timeoutMs } = job.opts;
    const timer = setTimeout(
      () => this.finish(slot, new PdfToolsError('timeout'), true),
      timeoutMs,
    );
    const onAbort = () => this.finish(slot, new PdfToolsError('cancelled'), true);
    signal?.addEventListener('abort', onAbort, { once: true });
    const settle = { resolve: job.resolve, reject: job.reject };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    job.resolve = (out) => (cleanup(), settle.resolve(out));
    job.reject = (err) => (cleanup(), settle.reject(err));
    try {
      slot.worker.postMessage(job.request, job.opts.transfer ?? []);
    } catch {
      this.finish(slot, new PdfToolsError('internal'), true);
    }
  }

  private onMessage(slot: Slot, msg: WorkerResponse): void {
    const job = slot.job;
    if (!job || msg.id !== job.request.id) return;
    if (msg.type === 'progress') job.opts.onProgress?.(msg.fraction);
    else if (msg.type === 'done') this.finish(slot, msg.output, false);
    else this.finish(slot, new PdfToolsError(msg.error.code, msg.error.message), false);
  }

  private finish(slot: Slot, result: OpOutput | PdfToolsError, kill: boolean): void {
    const job = slot.job;
    if (!job) return;
    slot.job = null;
    if (kill) {
      slot.worker.terminate();
      this.slots = this.slots.filter((s) => s !== slot);
    }
    if (result instanceof PdfToolsError) job.reject(result);
    else job.resolve(result);
    this.pump();
  }
}

let shared: WorkerPool | undefined;

/** The app-wide pool, created on first use so the landing page never spawns workers. */
export function pool(): WorkerPool {
  shared ??= new WorkerPool(
    () => new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' }) as WorkerLike,
  );
  return shared;
}
