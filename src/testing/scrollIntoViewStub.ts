import { vi } from 'vitest';

// jsdom has no layout, so it does not implement scrollIntoView, which the
// searchable dropdowns call whenever their highlighted option changes.
Element.prototype.scrollIntoView = vi.fn();
