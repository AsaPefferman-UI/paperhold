import type { WorkerRequest, WorkerResponse } from '@pdf-tools/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerPool, defaultPoolSize, type WorkerLike } from './pool.ts';

type Behaviour = (req: WorkerRequest, reply: (msg: WorkerResponse) => void) => void;

class FakeWorker implements WorkerLike {
  static all: FakeWorker[] = [];
  terminated = false;
  private listeners = new Map<string, ((e: never) => void)[]>();
  constructor(private behaviour: Behaviour) {
    FakeWorker.all.push(this);
  }
  postMessage(req: WorkerRequest): void {
    queueMicrotask(() =>
      this.behaviour(req, (msg) => {
        if (!this.terminated) this.emit('message', { data: msg });
      }),
    );
  }
  terminate(): void {
    this.terminated = true;
  }
  addEventListener(type: string, fn: (e: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, e: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn(e as never);
  }
}

const file = { name: 'a.pdf', bytes: new ArrayBuffer(1) };
const args = { files: [file, file] };
const done: Behaviour = (req, reply) => {
  reply({ type: 'progress', id: req.id, fraction: 0.5 });
  reply({ type: 'done', id: req.id, output: { files: [] } });
};
const hang: Behaviour = () => {};

afterEach(() => {
  FakeWorker.all = [];
  vi.useRealTimers();
});

describe('WorkerPool', () => {
  it('sizes to cores - 1, between 1 and 4', () => {
    expect(defaultPoolSize(1)).toBe(1);
    expect(defaultPoolSize(4)).toBe(3);
    expect(defaultPoolSize(32)).toBe(4);
  });

  it('runs a job, reports progress, and reuses the worker', async () => {
    const pool = new WorkerPool(() => new FakeWorker(done), 2);
    const progress: number[] = [];
    await expect(pool.run('merge', args, { onProgress: (f) => progress.push(f) })).resolves.toEqual(
      {
        files: [],
      },
    );
    await pool.run('merge', args);
    expect(progress).toEqual([0.5]);
    expect(FakeWorker.all).toHaveLength(1);
  });

  it('turns worker error replies into typed errors', async () => {
    const pool = new WorkerPool(
      () =>
        new FakeWorker((req, reply) =>
          reply({ type: 'error', id: req.id, error: { code: 'damaged', message: 'bad' } }),
        ),
      1,
    );
    await expect(pool.run('merge', args)).rejects.toMatchObject({
      code: 'damaged',
      message: 'bad',
    });
  });

  it('never runs more than `size` workers and queues the rest', async () => {
    const pool = new WorkerPool(() => new FakeWorker(done), 2);
    await Promise.all([1, 2, 3, 4, 5].map(() => pool.run('merge', args)));
    expect(FakeWorker.all.length).toBeLessThanOrEqual(2);
  });

  it('terminates the worker on timeout and recovers with a fresh one', async () => {
    let behaviour: Behaviour = hang;
    const pool = new WorkerPool(() => new FakeWorker(behaviour), 1);
    await expect(pool.run('merge', args, { timeoutMs: 10 })).rejects.toMatchObject({
      code: 'timeout',
    });
    expect(FakeWorker.all[0]?.terminated).toBe(true);
    behaviour = done;
    await expect(pool.run('merge', args)).resolves.toEqual({ files: [] });
    expect(FakeWorker.all).toHaveLength(2);
  });

  it('cancels via AbortSignal, before or during a run', async () => {
    const pool = new WorkerPool(() => new FakeWorker(hang), 1);
    const pre = new AbortController();
    pre.abort();
    await expect(pool.run('merge', args, { signal: pre.signal })).rejects.toMatchObject({
      code: 'cancelled',
    });
    const ctl = new AbortController();
    const running = pool.run('merge', args, { signal: ctl.signal });
    ctl.abort();
    await expect(running).rejects.toMatchObject({ code: 'cancelled' });
    expect(FakeWorker.all[0]?.terminated).toBe(true);
  });

  it('treats a worker crash as an internal error and keeps serving', async () => {
    let n = 0;
    const pool = new WorkerPool(() => {
      const w = new FakeWorker(n++ === 0 ? hang : done);
      return w;
    }, 1);
    const crashed = pool.run('merge', args);
    await Promise.resolve();
    FakeWorker.all[0]?.emit('error', new Event('error'));
    await expect(crashed).rejects.toMatchObject({ code: 'internal' });
    await expect(pool.run('merge', args)).resolves.toEqual({ files: [] });
  });

  it('destroy cancels queued and running jobs', async () => {
    const pool = new WorkerPool(() => new FakeWorker(hang), 1);
    const a = pool.run('merge', args);
    const b = pool.run('merge', args);
    pool.destroy();
    await expect(a).rejects.toMatchObject({ code: 'cancelled' });
    await expect(b).rejects.toMatchObject({ code: 'cancelled' });
  });
});
