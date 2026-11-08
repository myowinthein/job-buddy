// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoDataRegistry, type NoDataEntry } from './noDataRegistry';

const entry = (): NoDataEntry => ({
  element: document.createElement('input'),
  fieldPath: 'personal.email',
  confidence: 0.9,
  identity: 'email',
});

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
};

afterEach(() => setVisibility('visible'));

describe('NoDataRegistry', () => {
  it('calls back when the tab becomes visible', () => {
    const onVisible = vi.fn();
    new NoDataRegistry(onVisible).listen();
    setVisibility('visible');
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('ignores the tab becoming hidden', () => {
    const onVisible = vi.fn();
    new NoDataRegistry(onVisible).listen();
    setVisibility('hidden');
    expect(onVisible).not.toHaveBeenCalled();
  });

  it('adds the listener only once', () => {
    const onVisible = vi.fn();
    const registry = new NoDataRegistry(onVisible);
    registry.listen();
    registry.listen();
    setVisibility('visible');
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('stops calling back after stop', () => {
    const onVisible = vi.fn();
    const registry = new NoDataRegistry(onVisible);
    registry.listen();
    registry.stop();
    setVisibility('visible');
    expect(onVisible).not.toHaveBeenCalled();
  });

  it('keeps listening while an entry remains', () => {
    const onVisible = vi.fn();
    const registry = new NoDataRegistry(onVisible);
    registry.add(entry());
    registry.listen();
    registry.settle();
    setVisibility('visible');
    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('stops listening when settled with no entries', () => {
    const onVisible = vi.fn();
    const registry = new NoDataRegistry(onVisible);
    registry.listen();
    registry.settle();
    setVisibility('visible');
    expect(onVisible).not.toHaveBeenCalled();
  });

  it('keeps only the entries the predicate accepts', () => {
    const registry = new NoDataRegistry(vi.fn());
    const kept = entry();
    registry.add(kept);
    registry.add(entry());
    registry.keepWhere((item) => item === kept);
    expect(registry.entries).toEqual([kept]);
  });

  it('reset forgets entries but keeps listening', () => {
    const onVisible = vi.fn();
    const registry = new NoDataRegistry(onVisible);
    registry.add(entry());
    registry.listen();
    registry.reset();
    setVisibility('visible');
    expect([registry.entries.length, onVisible.mock.calls.length]).toEqual([0, 1]);
  });

  it('clear forgets entries and stops listening', () => {
    const onVisible = vi.fn();
    const registry = new NoDataRegistry(onVisible);
    registry.add(entry());
    registry.listen();
    registry.clear();
    setVisibility('visible');
    expect([registry.entries.length, onVisible.mock.calls.length]).toEqual([0, 0]);
  });
});
