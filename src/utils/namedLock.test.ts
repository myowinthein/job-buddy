import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNamedLock } from './namedLock';

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.__JB_DEV_CONTEXT__ = undefined;
});

describe('createNamedLock without Web Locks', () => {
  it('runs a second action only after the first has finished', async () => {
    const lock = createNamedLock('test');
    const events: string[] = [];
    let release!: () => void;
    const first = lock(async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => (release = resolve));
      events.push('first:end');
    });
    const second = lock(async () => {
      events.push('second:start');
    });
    await Promise.resolve();
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('rejects the failing action but still runs the next one', async () => {
    const lock = createNamedLock('test');
    await expect(
      lock(async () => {
        throw new Error('write failed');
      }),
    ).rejects.toThrow('write failed');
    await expect(lock(async () => 'next')).resolves.toBe('next');
  });

  it('does not make separate locks wait for each other', async () => {
    const a = createNamedLock('a');
    const b = createNamedLock('b');
    let release!: () => void;
    const blocked = a(() => new Promise<void>((resolve) => (release = resolve)));
    await expect(b(async () => 'ran')).resolves.toBe('ran');
    release();
    await blocked;
  });
});

describe('createNamedLock with Web Locks', () => {
  const stubLocks = () => {
    const request = vi.fn(async (_name: string, action: () => Promise<unknown>) => action());
    vi.stubGlobal('navigator', { locks: { request } });
    return request;
  };

  it('requests the lock by its name and returns the result', async () => {
    const request = stubLocks();
    await expect(createNamedLock('job-buddy:test')(async () => 'saved')).resolves.toBe('saved');
    expect(request).toHaveBeenCalledWith('job-buddy:test', expect.any(Function));
  });

  it('namespaces the name inside a development simulation', async () => {
    const request = stubLocks();
    globalThis.__JB_DEV_CONTEXT__ = { id: 'sim-1', extensionId: 'x', version: '1' };
    await createNamedLock('job-buddy:test')(async () => 'saved');
    expect(request).toHaveBeenCalledWith('job-buddy:test:simulation:sim-1', expect.any(Function));
  });
});
