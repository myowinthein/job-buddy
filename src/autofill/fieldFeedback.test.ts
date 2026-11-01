// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getByRole, waitFor } from '@testing-library/react';
import {
  setFieldFeedback,
  clearFieldFeedback,
  clearAllFieldFeedback,
  confirmFieldFeedback,
} from './fieldFeedback';

function input(root: ParentNode & Node = document.body): HTMLInputElement {
  const element = document.createElement('input');
  root.appendChild(element);
  return element;
}
function description(element: HTMLElement): HTMLElement | null {
  const id = element.getAttribute('aria-describedby')!.split(' ').at(-1)!;
  return (element.getRootNode() as Document | ShadowRoot).getElementById(id);
}

beforeEach(() => {
  clearAllFieldFeedback();
  document.body.innerHTML = '';
});
afterEach(clearAllFieldFeedback);

describe('accessible field status descriptions', () => {
  it('preserves existing and concurrent site hints without duplicating descriptions', () => {
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
    const originalDescription = element.getAttribute('aria-describedby');
    setFieldFeedback(element, 'yellow');
    expect(element.getAttribute('aria-describedby')).toBe(originalDescription);
    expect(description(element)?.textContent).toBe('Job Buddy: Review this answer.');
    expect(document.querySelectorAll('[data-jb-field-description]')).toHaveLength(1);
    element.setAttribute('aria-describedby', `${originalDescription} later-hint`);
    clearFieldFeedback(element);
    expect(element.getAttribute('aria-describedby')).toBe('hint later-hint');
  });

  it('creates no overlay, markers, tooltips, or extra tab stops on focus or hover', () => {
    const element = input();
    setFieldFeedback(element, 'red');
    element.focus();
    element.dispatchEvent(new Event('pointerenter'));
    expect(document.activeElement).toBe(element);
    expect(
      document.querySelector('[data-jb-feedback-root], [data-jb-field-status], [role="tooltip"]'),
    ).toBeNull();
    expect(document.querySelectorAll('input,button,[tabindex="0"]')).toHaveLength(1);
    expect(description(element)?.textContent).toBe('Job Buddy: No confident match found.');
  });

  it('keeps shadow-field descriptions in their own tree scope and removes them on cleanup', () => {
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

  it('describes manually confirmed values without prematurely confirming unresolved fields', () => {
    const green = input();
    const yellow = input();
    setFieldFeedback(green, 'green');
    setFieldFeedback(yellow, 'yellow');
    confirmFieldFeedback(green);
    confirmFieldFeedback(yellow);
    expect(description(green)?.textContent).toBe('Job Buddy: Confirmed by you.');
    expect(description(yellow)?.textContent).toBe('Job Buddy: Review this answer.');
  });

  it('cleans up descriptions for removed fields in both document and shadow scopes', async () => {
    const element = input();
    setFieldFeedback(element, 'red');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    const shadowInput = input(root);
    setFieldFeedback(shadowInput, 'gray');
    element.remove();
    shadowInput.remove();
    await waitFor(() => {
      expect(document.querySelector('[data-jb-field-description]')).toBeNull();
      expect(root.querySelector('[data-jb-field-description]')).toBeNull();
    });
    expect(element.hasAttribute('aria-describedby')).toBe(false);
    expect(shadowInput.hasAttribute('aria-describedby')).toBe(false);
  });
});
