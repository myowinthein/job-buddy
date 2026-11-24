// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyHighlight,
  applyMissingDataHighlight,
  clearElementHighlight,
  clearHighlights,
} from './highlighter';
import { CONF_FILL, CONF_GREEN } from './constants';

function makeInput(bg = '', transition = ''): HTMLInputElement {
  const el = document.createElement('input');
  el.style.backgroundColor = bg;
  el.style.transition = transition;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  clearHighlights();
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

describe('missing-data tints', () => {
  it('tints the background without changing the field outline, text, or editability', () => {
    const el = makeInput('rgb(20, 30, 40)', 'opacity 0.3s');
    el.style.outline = '2px dotted blue';
    el.style.outlineOffset = '3px';
    applyMissingDataHighlight(el);
    expect(el.style.backgroundColor).toBe('rgb(30, 40, 51)');
    expect(el.style.outline).toBe('2px dotted blue');
    expect(el.disabled).toBe(false);
    expect(el.style.color).toBe('');
    el.focus();
    expect(el.style.outline).toBe('2px dotted blue');
    expect(el.style.outlineOffset).toBe('3px');
    expect(el.dataset.jbMissingData).toBe('1');
    el.blur();
    expect(el.style.backgroundColor).toBe('rgb(30, 40, 51)');
    clearElementHighlight(el);
    expect(el.style.outline).toBe('2px dotted blue');
    expect(el.style.outlineOffset).toBe('3px');
    expect(el.style.backgroundColor).toBe('rgb(20, 30, 40)');
    expect(el.style.transition).toBe('opacity 0.3s');
    expect(el.dataset.jbMissingData).toBeUndefined();
    el.focus();
    el.blur();
    expect(el.style.outline).toBe('2px dotted blue');
  });

  it('keeps the site focus style if the missing field is already focused', () => {
    const el = makeInput();
    el.focus();
    applyMissingDataHighlight(el);
    expect(el.style.outline).toBe('');
    el.blur();
    expect(el.style.backgroundColor).toBe('rgba(107, 114, 128, 0.12)');
  });

  it.each([CONF_GREEN, CONF_FILL])(
    'removes gray styling when filling at confidence %s',
    (confidence) => {
      const el = makeInput('white');
      el.style.outlineColor = 'purple';
      applyMissingDataHighlight(el);
      applyHighlight(el, confidence);
      expect(el.style.outlineColor).toBe('purple');
      expect(el.style.outlineStyle).toBe('');
      expect(el.dataset.jbMissingData).toBeUndefined();
      el.focus();
      el.blur();
      expect(el.style.outlineColor).toBe('purple');
      clearElementHighlight(el);
      expect(el.style.backgroundColor).toBe('white');
    },
  );

  it('restores original important styles after repeated applications and clearing', () => {
    const el = makeInput();
    el.style.setProperty('background-color', 'white', 'important');
    el.style.setProperty('outline-color', 'purple', 'important');
    applyHighlight(el, CONF_GREEN);
    applyMissingDataHighlight(el);
    applyMissingDataHighlight(el);
    expect(el.style.backgroundColor).toBe('rgb(237, 238, 240)');
    clearElementHighlight(el);
    clearElementHighlight(el);
    expect(el.style.backgroundColor).toBe('white');
    expect(el.style.outlineColor).toBe('purple');
    expect(el.style.getPropertyPriority('outline-color')).toBe('important');
  });

  it('clears shadow-root and detached missing fields without altering their values', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const shadow = document.createElement('input');
    root.appendChild(shadow);
    const detached = makeInput();
    applyMissingDataHighlight(shadow);
    applyMissingDataHighlight(detached);
    detached.value = 'Manually entered';
    detached.remove();
    clearHighlights();
    expect(shadow.style.outline).toBe('');
    expect(shadow.dataset.jbMissingData).toBeUndefined();
    expect(detached.style.outline).toBe('');
    expect(detached.value).toBe('Manually entered');
  });
});

describe('bordered widget surfaces', () => {
  function widget(extra = '') {
    document.body.innerHTML = `<div id="surface" style="border:1px solid gray;border-radius:12px;transition:box-shadow .1s;background-color:white"><input style="border:0;background:transparent">${extra}</div>`;
    return {
      input: document.querySelector('input')!,
      surface: document.querySelector<HTMLElement>('#surface')!,
    };
  }
  it('tints the nearest single-control border without changing input or focus styles', () => {
    const { input, surface } = widget('<button type="button">Open</button>');
    input.style.outline = '2px solid blue';
    applyHighlight(input, CONF_GREEN);
    expect(input.style.backgroundColor).toBe('transparent');
    expect(input.style.outline).toBe('2px solid blue');
    expect(input.hasAttribute('aria-describedby')).toBe(true);
    expect(surface.hasAttribute('aria-describedby')).toBe(false);
    expect(surface.style.backgroundColor).toBe('rgb(228, 248, 236)');
    expect(surface.style.borderRadius).toBe('12px');
    expect(surface.style.transition).toBe('box-shadow .1s');
    applyMissingDataHighlight(input);
    expect(surface.style.backgroundColor).toBe('rgb(237, 238, 240)');
    clearElementHighlight(input);
    expect(surface.style.backgroundColor).toBe('white');
    expect(surface.style.transition).toBe('box-shadow .1s');
    expect(surface.dataset.jbHighlighted).toBeUndefined();
  });
  it('never tints a wrapper shared by two answer controls', () => {
    const { input, surface } = widget('<input type="tel">');
    applyHighlight(input, CONF_GREEN);
    expect(surface.style.backgroundColor).toBe('white');
    expect(input.style.backgroundColor).toBe('rgba(34, 197, 94, 0.12)');
  });
  it('does not let cleanup of a replaced input erase its replacement highlight', () => {
    const { input, surface } = widget();
    applyMissingDataHighlight(input);
    const replacement = document.createElement('input');
    replacement.style.border = '0';
    input.replaceWith(replacement);
    applyHighlight(replacement, CONF_GREEN);
    clearElementHighlight(input);
    expect(surface.style.backgroundColor).toBe('rgb(228, 248, 236)');
    clearHighlights();
    expect(surface.style.backgroundColor).toBe('white');
  });
  it('keeps a native bordered input as its own surface', () => {
    const { input, surface } = widget();
    input.style.border = '1px solid black';
    applyHighlight(input, CONF_GREEN);
    expect(surface.style.backgroundColor).toBe('white');
    expect(input.style.backgroundColor).toBe('rgba(34, 197, 94, 0.12)');
  });
  it('restores detached shadow widget surfaces and important styles on clear', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<div style="border:1px solid gray;background-color:white!important"><input style="border:0"></div>';
    const input = root.querySelector('input')!;
    const surface = root.querySelector('div')!;
    applyMissingDataHighlight(input);
    host.remove();
    clearHighlights();
    expect(surface.style.backgroundColor).toBe('white');
    expect(surface.style.getPropertyPriority('background-color')).toBe('important');
    expect(input.dataset.jbHighlighted).toBeUndefined();
  });
});
