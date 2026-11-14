// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { mapField } from './mapper';
import { extractSignals } from './signals';
import { RULE_PROFILE } from './ruleMatching.fixture';
import { allowedAIPath } from './aiSafety';
import { likelyApplicationForm } from '../quick-fill/detect';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
const profile = {
  ...RULE_PROFILE,
  links: {
    linkedin: 'https://linkedin.example.test/me',
    github: 'https://github.example.test/me',
    custom: [
      { label: 'GitLab', url: 'https://gitlab.example.test/me' },
      { label: 'Instagram', url: 'https://instagram.example.test/me' },
    ],
  },
};
function field(html: string) {
  document.body.innerHTML = html;
  return document.querySelector<HTMLInputElement>('input')!;
}
it('matches GitLab to its own custom link instead of a similar GitHub dictionary alias', () => {
  const signals = extractSignals(field('<input name="gitlab" placeholder="GitLab Profile">'));
  expect(mapField(signals, profile, {}, 'example.test')).toMatchObject({
    fieldPath: 'links.custom.0.url',
    value: profile.links.custom[0].url,
  });
  expect(
    mapField(signals, { ...profile, links: { ...profile.links, custom: [] } }, {}, 'example.test')
      .fieldPath,
  ).toBeNull();
  expect(
    mapField(signals, profile, { 'example.test': { gitlab: 'links.github' } }, 'example.test')
      .fieldPath,
  ).toBe('links.custom.0.url');
});
it.each([
  ['GitHub Profile', 'links.github'],
  ['Instagram Profile', 'links.custom.1.url'],
])('preserves the correct destination for %s', (placeholder, path) => {
  expect(
    mapField(
      extractSignals(field(`<input placeholder="${placeholder}">`)),
      profile,
      {},
      'example.test',
    ).fieldPath,
  ).toBe(path);
});
it('rejects an AI GitHub answer to a GitLab question while allowing the saved GitLab row', () => {
  const question = { fieldId: 'gitlab', type: 'text' as const, label: 'GitLab Profile' };
  expect(allowedAIPath(profile, question, 'links.github')).toBe(false);
  expect(allowedAIPath(profile, question, 'links.custom.0.url')).toBe(true);
});
it('maps a technical resume-file identifier without an associated label', () => {
  expect(
    mapField(
      extractSignals(field('<input type="file" name="resume-file">')),
      RULE_PROFILE,
      {},
      'example.test',
    ),
  ).toMatchObject({ fieldPath: 'documents.cv.file', value: 'sample.pdf' });
});
it('uses the Resume question outside a generic nested Choose file label', () => {
  const input = field(
    '<div class="form-group"><label for="">Resume:</label><div class="custom-file"><input type="file" name="932783"><label for="">Choose file</label></div></div>',
  );
  expect(extractSignals(input).nearbyText.trim()).toBe('Resume:');
  expect(mapField(extractSignals(input), RULE_PROFILE, {}, 'example.test').fieldPath).toBe(
    'documents.cv.file',
  );
});
it('detects a job form with numeric identifiers and locally unlinked labels', () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    { width: 100, height: 30 },
  ] as unknown as DOMRectList);
  document.body.innerHTML =
    '<form><div class="form-group"><label for="">Full Name: *</label><div><input name="932779"></div></div><div class="form-group"><label for="">Email: *</label><div><input name="932780"></div></div><div class="form-group"><label for="">Resume:</label><div><input type="file" name="932783"><label>Choose file</label></div></div></form>';
  expect(likelyApplicationForm()).toBe(true);
  document.body.innerHTML =
    '<form><div class="form-group"><label>Name</label><input></div><div class="form-group"><label>Email</label><input></div><div class="form-group"><label>Message</label><textarea></textarea></div></form>';
  expect(likelyApplicationForm()).toBe(false);
});
