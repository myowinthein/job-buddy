// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { educationChoiceAliases } from './educationChoices';
import { extractSignals } from './signals';
import { fillField, resetDropdownBudget } from './filler';
import { CONF_AI_YELLOW } from './constants';
import { getWriteConfidence, resetWriteSession } from './writeSession';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  resetWriteSession();
  resetDropdownBudget();
});
it.each(['Bachelor of Science (Honours)', 'Bachelor of Science with Honors'])(
  'supports the same degree without its honours qualifier: %s',
  (value) => {
    document.body.innerHTML = '<label>Highest Education Obtained<select></select></label>';
    expect(
      educationChoiceAliases(extractSignals(document.querySelector('select')!), value),
    ).toEqual(['Bachelor of Science', 'College - Bachelor of Science']);
  },
);
it.each(['Job title', 'University', 'Grade / GPA'])(
  'does not reinterpret %s as a degree selector',
  (label) => {
    document.body.innerHTML = `<label>${label}<input></label>`;
    expect(
      educationChoiceAliases(
        extractSignals(document.querySelector('input')!),
        'Bachelor of Science (Honours)',
      ),
    ).toEqual([]);
  },
);
it('selects the explicit science degree and keeps it reviewable instead of choosing another discipline', async () => {
  document.body.innerHTML =
    '<label>Highest Education Obtained<select><option value="">Select</option><option value="arts">College - Bachelor of Arts</option><option value="science">College - Bachelor of Science</option></select></label>';
  const select = document.querySelector('select')!;
  expect(await fillField(select, 'Bachelor of Science (Honours)')).toBe(true);
  expect(select.value).toBe('science');
  expect(getWriteConfidence(select)).toBe(CONF_AI_YELLOW);
});

it('selects a loaded exact degree alias without filtering it out of a searchable menu', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 200,
    height: 40,
  } as DOMRect);
  document.body.innerHTML =
    '<form><button type="button" role="combobox" aria-label="Highest Education Obtained" aria-controls="degree-menu" aria-expanded="false">Select</button></form>';
  const trigger = document.querySelector('button')!;
  trigger.addEventListener('click', () => {
    if (document.getElementById('degree-menu')) return;
    trigger.setAttribute('aria-expanded', 'true');
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="popup"><input aria-label="Search"><div role="listbox" id="degree-menu"><div role="option">College - Bachelor of Science</div></div></div>',
    );
    const search = document.querySelector<HTMLInputElement>('[aria-label="Search"]')!;
    search.addEventListener('input', () => {
      throw new Error('The exact loaded alias must not be filtered away');
    });
    document.querySelector('[role="option"]')!.addEventListener('click', () => {
      trigger.textContent = 'College - Bachelor of Science';
      trigger.dataset.value = 'College - Bachelor of Science';
      trigger.setAttribute('aria-expanded', 'false');
      document.getElementById('popup')!.remove();
    });
  });
  const filled = await fillField(trigger, 'Bachelor of Science (Honours)');
  expect(filled).toBe(true);
  expect(trigger.textContent).toBe('College - Bachelor of Science');
});
