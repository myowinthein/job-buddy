// @vitest-environment jsdom
import type { KeyboardEvent } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useSearchableDropdown } from './useSearchableDropdown';

afterEach(cleanup);

const ITEMS = ['Apple', 'Banana', 'Cherry'];

function filterItems(search: string): string[] {
  return ITEMS.filter((i) => i.toLowerCase().includes(search.toLowerCase()));
}

function key(k: string): KeyboardEvent<HTMLInputElement> {
  return { key: k, preventDefault: () => {} } as unknown as KeyboardEvent<HTMLInputElement>;
}

function setup(onSelect = vi.fn(), findOpenIndex = () => -1) {
  return renderHook(() => useSearchableDropdown({ filter: filterItems, onSelect, findOpenIndex }));
}

describe('useSearchableDropdown', () => {
  it('starts closed with hlIdx 0 and the unfiltered list', () => {
    const { result } = setup();
    expect(result.current.open).toBe(false);
    expect(result.current.hlIdx).toBe(0);
    expect(result.current.filtered).toEqual(ITEMS);
  });

  it('toggle opens the dropdown and seeds hlIdx from findOpenIndex', () => {
    const { result } = setup(vi.fn(), () => 2);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    expect(result.current.hlIdx).toBe(2);
  });

  it('toggle clamps a negative findOpenIndex to 0', () => {
    const { result } = setup(vi.fn(), () => -1);
    act(() => result.current.toggle());
    expect(result.current.hlIdx).toBe(0);
  });

  it('toggle closes an open dropdown on a second call', () => {
    const { result } = setup();
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
  });

  it('ArrowDown advances hlIdx and clamps at the last filtered index', () => {
    const { result } = setup();
    act(() => result.current.handleKeyDown(key('ArrowDown')));
    expect(result.current.hlIdx).toBe(1);
    act(() => result.current.handleKeyDown(key('ArrowDown')));
    act(() => result.current.handleKeyDown(key('ArrowDown')));
    act(() => result.current.handleKeyDown(key('ArrowDown')));
    expect(result.current.hlIdx).toBe(ITEMS.length - 1);
  });

  it('ArrowUp retreats hlIdx and clamps at 0', () => {
    const { result } = setup();
    act(() => result.current.handleKeyDown(key('ArrowDown')));
    act(() => result.current.handleKeyDown(key('ArrowUp')));
    expect(result.current.hlIdx).toBe(0);
    act(() => result.current.handleKeyDown(key('ArrowUp')));
    expect(result.current.hlIdx).toBe(0);
  });

  it('Enter selects the highlighted item and closes/resets state', () => {
    const onSelect = vi.fn();
    const { result } = setup(onSelect);
    act(() => result.current.toggle());
    act(() => result.current.handleKeyDown(key('ArrowDown'))); // hlIdx -> 1 (Banana)
    act(() => result.current.handleKeyDown(key('Enter')));
    expect(onSelect).toHaveBeenCalledWith('Banana');
    expect(result.current.open).toBe(false);
    expect(result.current.search).toBe('');
    expect(result.current.hlIdx).toBe(0);
  });

  it('Enter with no highlighted item (empty filtered list) does nothing', () => {
    const onSelect = vi.fn();
    const { result } = setup(onSelect);
    act(() => result.current.onSearchChange('zzz'));
    act(() => result.current.handleKeyDown(key('Enter')));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Escape closes the dropdown and resets search/hlIdx', () => {
    const { result } = setup();
    act(() => result.current.toggle());
    act(() => result.current.onSearchChange('ban'));
    act(() => result.current.handleKeyDown(key('Escape')));
    expect(result.current.open).toBe(false);
    expect(result.current.search).toBe('');
    expect(result.current.hlIdx).toBe(0);
  });

  it('onSearchChange updates search, resets hlIdx to 0, and re-filters', () => {
    const { result } = setup();
    act(() => result.current.handleKeyDown(key('ArrowDown')));
    expect(result.current.hlIdx).toBe(1);
    act(() => result.current.onSearchChange('ch'));
    expect(result.current.search).toBe('ch');
    expect(result.current.hlIdx).toBe(0);
    expect(result.current.filtered).toEqual(['Cherry']);
  });

  it('select() calls onSelect and closes/resets state', () => {
    const onSelect = vi.fn();
    const { result } = setup(onSelect);
    act(() => result.current.toggle());
    act(() => result.current.onSearchChange('app'));
    act(() => result.current.select('Apple'));
    expect(onSelect).toHaveBeenCalledWith('Apple');
    expect(result.current.open).toBe(false);
    expect(result.current.search).toBe('');
    expect(result.current.hlIdx).toBe(0);
  });

  it('closes the dropdown on an outside mousedown while open', () => {
    const { result } = setup();
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => { document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(result.current.open).toBe(false);
  });

  it('does not react to an outside mousedown while closed', () => {
    const { result } = setup();
    act(() => { document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(result.current.open).toBe(false);
  });
});
