import { describe, it, expect } from 'vitest';
import { normalizeBullets, normalizeExtractedProfile } from './normalize';
import type { Profile } from '@/src/types/profile';

describe('normalizeBullets', () => {
  it('returns empty input unchanged', () => {
    expect(normalizeBullets('')).toBe('');
  });

  it('prepends "- " to a single plain line', () => {
    expect(normalizeBullets('Led mobile design.')).toBe('- Led mobile design.');
  });

  it('prepends "- " to each line of a multi-line block', () => {
    const input  = 'Led mobile design.\nCollaborated with PMs.\nImproved retention.';
    const output = '- Led mobile design.\n- Collaborated with PMs.\n- Improved retention.';
    expect(normalizeBullets(input)).toBe(output);
  });

  it('preserves lines that already start with "- "', () => {
    const input = '- Led mobile design.\n- Improved retention.';
    expect(normalizeBullets(input)).toBe(input);
  });

  it('preserves Unicode bullet markers without adding duplicates', () => {
    const input = '• Led mobile design.\n◦ Improved retention.';
    expect(normalizeBullets(input)).toBe(input);
  });

  it('preserves "* " bullets', () => {
    expect(normalizeBullets('* One\n* Two')).toBe('* One\n* Two');
  });

  it('preserves blank lines as paragraph separators', () => {
    const input  = 'Led mobile design.\n\nImproved retention.';
    const output = '- Led mobile design.\n\n- Improved retention.';
    expect(normalizeBullets(input)).toBe(output);
  });

  it('mixes existing bullets and plain lines correctly', () => {
    const input  = '- Already bullet.\nPlain line.';
    const output = '- Already bullet.\n- Plain line.';
    expect(normalizeBullets(input)).toBe(output);
  });

  it('is idempotent — running twice produces the same output', () => {
    const input = 'Led mobile design.\nCollaborated with PMs.';
    const once  = normalizeBullets(input);
    const twice = normalizeBullets(once);
    expect(twice).toBe(once);
  });

  it('trims surrounding whitespace from converted lines', () => {
    expect(normalizeBullets('   indented line.   ')).toBe('- indented line.');
  });
});

describe('normalizeExtractedProfile', () => {
  const PARTIAL: Partial<Profile> = {
    workHistory: [
      {
        company: 'Acme',
        title: 'Senior PD',
        startDate: '2020-01',
        isCurrent: true,
        description: 'Led mobile design.\nCollaborated with PMs.',
      },
    ],
  };

  it('returns input unchanged when there is no workHistory', () => {
    const input = { personal: { firstName: 'Jane' } } as Partial<Profile>;
    expect(normalizeExtractedProfile(input)).toBe(input);
  });

  it('normalises workHistory[].description', () => {
    const result = normalizeExtractedProfile(PARTIAL);
    expect(result.workHistory?.[0]?.description).toBe(
      '- Led mobile design.\n- Collaborated with PMs.',
    );
  });

  it('leaves work history entries without a description untouched', () => {
    const input: Partial<Profile> = {
      workHistory: [
        { company: 'Acme', title: 'PD', startDate: '2020-01', isCurrent: true },
      ],
    };
    const result = normalizeExtractedProfile(input);
    expect(result.workHistory?.[0]?.description).toBeUndefined();
  });

  it('preserves non-workHistory fields unchanged', () => {
    const input: Partial<Profile> = {
      ...PARTIAL,
      personal: { firstName: 'Jane' } as Profile['personal'],
    };
    const result = normalizeExtractedProfile(input);
    expect(result.personal?.firstName).toBe('Jane');
  });

  it('does not mutate the original input', () => {
    const original = PARTIAL.workHistory?.[0]?.description;
    normalizeExtractedProfile(PARTIAL);
    expect(PARTIAL.workHistory?.[0]?.description).toBe(original);
  });
});
