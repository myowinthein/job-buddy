// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { adjustRepeatingEntryMatches } from './repeatingEntryResolution';
import { RULE_PROFILE } from './ruleMatching.fixture';
import type { FieldMatch } from './mapper';

afterEach(() => {
  document.body.replaceChildren();
});

for (const [family, anchor, other] of [
  ['workHistory', 'title', 'company'],
  ['education', 'degree', 'institution'],
] as const) {
  it(`does not let a weak ${family} guess shift real repeated entries`, () => {
    document.body.innerHTML =
      '<form><textarea id="essay"></textarea><fieldset><input id="a0"><input id="b0"></fieldset><fieldset><input id="a1"><input id="b1"></fieldset></form>';
    const match = (id: string, key: string, confidence = 0.85): FieldMatch => ({
      element: document.getElementById(id)!,
      fieldPath: `${family}.${key}`,
      confidence,
      value: null,
      matchLayer: confidence < 0.6 ? 'fuzzy' : 'dictionary_exact',
    });
    const matches = [
      match('essay', anchor, 0.5),
      match('a0', anchor),
      match('b0', other),
      match('a1', anchor),
      match('b1', other),
    ];
    adjustRepeatingEntryMatches(matches, RULE_PROFILE[family], family, RULE_PROFILE);
    expect(matches.slice(1).map((item) => item.fieldPath)).toEqual([
      `${family}.0.${anchor}`,
      `${family}.0.${other}`,
      `${family}.1.${anchor}`,
      `${family}.1.${other}`,
    ]);
    expect(matches[0].confidence).toBe(0.5);
  });
}
