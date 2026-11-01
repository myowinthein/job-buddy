// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getByRole, waitFor } from '@testing-library/react';
import {
  setFieldFeedback,
  clearFieldFeedback,
  clearAllFieldFeedback,
  confirmFieldFeedback,
  withoutFieldFeedback,
} from './fieldFeedback';

function input(root: ParentNode & Node = document.body): HTMLInputElement {
  const element = document.createElement('input');
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({
      x: 80,
      y: 80,
      left: 80,
      top: 80,
      right: 320,
      bottom: 120,
      width: 240,
      height: 40,
    }),
  });
  root.appendChild(element);
  return element;
}
function layer(): ShadowRoot {
  return document.querySelector('[data-jb-feedback-root]')!.shadowRoot!;
}
function tip(): HTMLElement {
  return layer().querySelector('[role="tooltip"]')!;
}

beforeEach(() => {
  clearAllFieldFeedback();
  document.body.innerHTML = '';
});
afterEach(clearAllFieldFeedback);

describe('field status feedback', () => {
  it('adds an accessible description without replacing site hints or adding tab stops', () => {
    const hint = document.createElement('p');
    hint.id = 'hint';
    hint.textContent = 'Your public profile.';
    document.body.appendChild(hint);
    const element = input();
    element.setAttribute('aria-describedby', 'hint');
    setFieldFeedback(element, 'gray');
    expect(
      getByRole(document.body, 'textbox', {
        description: 'Your public profile. Job Buddy: No saved answer in your profile.',
      }),
    ).toBe(element);
    const marker = layer().querySelector<HTMLElement>('[data-jb-field-status]')!;
    expect(marker.tabIndex).toBe(-1);
    expect(marker.getAttribute('aria-hidden')).toBe('true');
    expect(layer().querySelectorAll('input, button, [tabindex="0"]')).toHaveLength(0);
    const originalDescription = element.getAttribute('aria-describedby');
    setFieldFeedback(element, 'yellow');
    expect(element.getAttribute('aria-describedby')).toBe(originalDescription);
    expect(layer().querySelectorAll('[data-jb-field-status]')).toHaveLength(1);
    element.setAttribute('aria-describedby', `${originalDescription} later-hint`);
    clearFieldFeedback(element);
    expect(element.getAttribute('aria-describedby')).toBe('hint later-hint');
  });

  it('shows one explanation on focus, updates it, and dismisses it with Escape', () => {
    const first = input();
    const second = input();
    setFieldFeedback(first, 'red');
    setFieldFeedback(second, 'gray');
    first.focus();
    expect(tip().textContent).toBe('Job Buddy: No confident match found.');
    expect(tip().style.display).toBe('block');
    second.focus();
    expect(tip().textContent).toBe('Job Buddy: No saved answer in your profile.');
    setFieldFeedback(second, 'confirmed');
    expect(tip().textContent).toBe('Job Buddy: Confirmed by you.');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tip().style.display).toBe('none');
    expect(document.activeElement).toBe(second);
  });

  it('does not open explanations while autofill focuses fields or on synthetic focus events', () => {
    const element = input();
    setFieldFeedback(element, 'gray');
    withoutFieldFeedback(() => element.focus());
    expect(tip().style.display).toBe('none');
    element.dispatchEvent(new FocusEvent('focus'));
    expect(tip().style.display).toBe('none');
    element.blur();
    element.focus();
    expect(tip().style.display).toBe('block');
  });

  it('keeps shadow-field descriptions in their own tree scope', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const element = input(root);
    setFieldFeedback(element, 'green');
    const id = element.getAttribute('aria-describedby')!;
    expect(root.getElementById(id)?.textContent).toBe('Job Buddy: Filled with high confidence.');
    expect(document.getElementById(id)).toBeNull();
    clearAllFieldFeedback();
    expect(root.getElementById(id)).toBeNull();
    expect(element.hasAttribute('aria-describedby')).toBe(false);
  });

  it('updates already-green manual edits without prematurely confirming unresolved fields', () => {
    const green = input();
    const yellow = input();
    setFieldFeedback(green, 'green');
    setFieldFeedback(yellow, 'yellow');
    confirmFieldFeedback(green);
    confirmFieldFeedback(yellow);
    expect(layer().querySelector('[data-jb-field-status="confirmed"]')).not.toBeNull();
    expect(layer().querySelector('[data-jb-field-status="yellow"]')).not.toBeNull();
  });

  it('uses one marker for a checkbox group and gives review priority over confident fills', async () => {
    const group = document.createElement('fieldset');
    document.body.appendChild(group);
    Object.defineProperty(group, 'getBoundingClientRect', {
      value: () => ({ left: 80, top: 80, right: 400, bottom: 160, width: 320, height: 80 }),
    });
    const first = input(group);
    first.type = 'checkbox';
    const second = input(group);
    second.type = 'checkbox';
    setFieldFeedback(first, 'green');
    setFieldFeedback(second, 'yellow');
    await waitFor(() =>
      expect(
        layer().querySelector<HTMLElement>('[data-jb-field-status="yellow"]')!.style.display,
      ).toBe('flex'),
    );
    expect(
      layer().querySelector<HTMLElement>('[data-jb-field-status="green"]')!.style.display,
    ).toBe('none');
  });

  it('dismisses its explanation when a site opens the field dropdown', async () => {
    const element = input();
    setFieldFeedback(element, 'green');
    element.focus();
    expect(tip().style.display).toBe('block');
    element.setAttribute('aria-expanded', 'true');
    await waitFor(() => expect(tip().style.display).toBe('none'));
    expect(document.activeElement).toBe(element);
  });

  it('cleans up feedback when a field is removed from the page', async () => {
    const element = input();
    setFieldFeedback(element, 'red');
    element.remove();
    await waitFor(() => expect(document.querySelector('[data-jb-feedback-root]')).toBeNull());
    expect(element.hasAttribute('aria-describedby')).toBe(false);
    expect(document.querySelector('[data-jb-field-description]')).toBeNull();
  });
});
