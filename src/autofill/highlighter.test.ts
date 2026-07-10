// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { applyHighlight, clearElementHighlight, clearHighlights } from './highlighter';
import { CONF_FILL, CONF_GREEN } from './constants';

function makeInput(bg = '', transition = ''): HTMLInputElement {
  const el = document.createElement('input');
  el.style.backgroundColor = bg;
  el.style.transition      = transition;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('applyHighlight', () => {
  it('marks element as highlighted', () => {
    const el = makeInput();
    applyHighlight(el, CONF_GREEN);
    expect(el.dataset.jbHighlighted).toBe('1');
  });

  it('applies green tint when confidence >= CONF_GREEN', () => {
    const el = makeInput();
    applyHighlight(el, CONF_GREEN);
    expect(el.style.backgroundColor).toBe('rgba(34, 197, 94, 0.12)');
  });

  it('applies yellow tint when CONF_FILL <= confidence < CONF_GREEN', () => {
    const el = makeInput();
    applyHighlight(el, CONF_FILL);
    expect(el.style.backgroundColor).toBe('rgba(234, 179, 8, 0.12)');

    const el2 = makeInput();
    applyHighlight(el2, CONF_GREEN - 0.01);
    expect(el2.style.backgroundColor).toBe('rgba(234, 179, 8, 0.12)');
  });

  it('applies red tint when confidence < CONF_FILL', () => {
    const el = makeInput();
    applyHighlight(el, CONF_FILL - 0.01);
    expect(el.style.backgroundColor).toBe('rgba(239, 68, 68, 0.12)');
  });

  it('saves original background before overwriting', () => {
    const el = makeInput('rgb(255, 0, 0)');
    applyHighlight(el, CONF_GREEN);
    expect(el.dataset.jbOrigBackground).toBe('rgb(255, 0, 0)');
  });

  it('saves original transition before overwriting', () => {
    const el = makeInput('', 'opacity 0.3s');
    applyHighlight(el, CONF_GREEN);
    expect(el.dataset.jbOrigTransition).toBe('opacity 0.3s');
  });

  it('does not overwrite saved originals on re-apply', () => {
    const el = makeInput('rgb(255, 0, 0)', 'opacity 0.3s');
    applyHighlight(el, CONF_GREEN);
    applyHighlight(el, CONF_FILL); // second call — saved values must be preserved
    expect(el.dataset.jbOrigBackground).toBe('rgb(255, 0, 0)');
    expect(el.dataset.jbOrigTransition).toBe('opacity 0.3s');
  });

  it('applies the new transition on every call', () => {
    const el = makeInput();
    applyHighlight(el, CONF_GREEN);
    expect(el.style.transition).toBe('background-color 0.2s ease');
  });
});

describe('clearElementHighlight', () => {
  it('restores original background and transition', () => {
    const el = makeInput('rgb(0, 128, 0)', 'opacity 0.2s');
    applyHighlight(el, CONF_GREEN);
    clearElementHighlight(el);
    expect(el.style.backgroundColor).toBe('rgb(0, 128, 0)');
    expect(el.style.transition).toBe('opacity 0.2s');
  });

  it('removes the jbHighlighted data attribute', () => {
    const el = makeInput();
    applyHighlight(el, CONF_GREEN);
    clearElementHighlight(el);
    expect(el.dataset.jbHighlighted).toBeUndefined();
  });

  it('removes the saved data attributes after restore', () => {
    const el = makeInput('blue');
    applyHighlight(el, CONF_GREEN);
    clearElementHighlight(el);
    expect(el.dataset.jbOrigBackground).toBeUndefined();
    expect(el.dataset.jbOrigTransition).toBeUndefined();
  });

  it('clears to empty string when element had no original background', () => {
    const el = makeInput();
    applyHighlight(el, CONF_GREEN);
    clearElementHighlight(el);
    expect(el.style.backgroundColor).toBe('');
  });
});

describe('clearHighlights', () => {
  it('clears all highlighted elements in the document', () => {
    const a = makeInput('red');
    const b = makeInput('blue');
    applyHighlight(a, CONF_GREEN);
    applyHighlight(b, CONF_FILL);

    clearHighlights();

    expect(a.dataset.jbHighlighted).toBeUndefined();
    expect(b.dataset.jbHighlighted).toBeUndefined();
    expect(a.style.backgroundColor).toBe('red');
    expect(b.style.backgroundColor).toBe('blue');
  });

  it('removes the saved data attributes from every cleared element', () => {
    const a = makeInput('red', 'opacity 0.3s');
    const b = makeInput('blue');
    applyHighlight(a, CONF_GREEN);
    applyHighlight(b, CONF_FILL);

    clearHighlights();

    expect(a.dataset.jbOrigBackground).toBeUndefined();
    expect(a.dataset.jbOrigTransition).toBeUndefined();
    expect(b.dataset.jbOrigBackground).toBeUndefined();
    expect(b.dataset.jbOrigTransition).toBeUndefined();
  });

  it('does not touch elements that were never highlighted', () => {
    const el = makeInput('green');
    clearHighlights();
    expect(el.style.backgroundColor).toBe('green');
  });

  it('is a no-op when no elements are highlighted', () => {
    expect(() => clearHighlights()).not.toThrow();
  });
});
