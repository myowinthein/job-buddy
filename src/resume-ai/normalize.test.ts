import { describe, it, expect } from 'vitest';
import { normalizeBullets, normalizeSummaryLineWraps, normalizeExtractedProfile } from './normalize';
import type { Profile } from '@/src/types/profile';

describe('normalizeBullets', () => {
  it('returns empty input unchanged', () => {
    expect(normalizeBullets('')).toBe('');
  });

  // ── No structure → leave alone ─────────────────────────────────────────────

  it('leaves a single plain line unchanged (no markers, no separator)', () => {
    expect(normalizeBullets('Led mobile design.')).toBe('Led mobile design.');
  });

  it('leaves a multi-line plain prose block unchanged when no marker/separator is present', () => {
    const input = 'Worked at TechCo.\nLed mobile design.\nCollaborated with PMs.';
    expect(normalizeBullets(input)).toBe(input);
  });

  // ── Already-bulleted content → preserved ───────────────────────────────────

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

  // ── Intro paragraph + bullet section → keep intro, bullet the rest ─────────

  it('preserves a one-line context paragraph followed by a blank-line separator and plain lines', () => {
    const input  = 'Worked at TechCo as Senior PD.\n\nLed mobile design.\nCollaborated with PMs.';
    const output = 'Worked at TechCo as Senior PD.\n\n- Led mobile design.\n- Collaborated with PMs.';
    expect(normalizeBullets(input)).toBe(output);
  });

  it('preserves a context paragraph immediately followed by pre-bulleted lines (no blank)', () => {
    const input = 'Worked at TechCo as Senior PD.\n- Led mobile design.\n- Collaborated with PMs.';
    expect(normalizeBullets(input)).toBe(input);
  });

  it('mixes a first-line bullet with subsequent plain lines (no intro to preserve)', () => {
    const input  = '- Already bullet.\nPlain line.';
    const output = '- Already bullet.\n- Plain line.';
    expect(normalizeBullets(input)).toBe(output);
  });

  // ── Blank-line semantics ───────────────────────────────────────────────────

  it('preserves trailing blank lines between bullets', () => {
    const input  = 'Context.\n\n- One.\n\n- Two.';
    const output = 'Context.\n\n- One.\n\n- Two.';
    expect(normalizeBullets(input)).toBe(output);
  });

  // ── Idempotence ────────────────────────────────────────────────────────────

  it('is idempotent for already-structured input', () => {
    const input = 'Context.\n\n- Led design.\n- Improved retention.';
    const once  = normalizeBullets(input);
    const twice = normalizeBullets(once);
    expect(twice).toBe(once);
  });

  it('is idempotent for plain-prose input (returns same text on each pass)', () => {
    const input = 'Worked at TechCo.\nLed design.';
    const once  = normalizeBullets(input);
    expect(once).toBe(input);
    expect(normalizeBullets(once)).toBe(input);
  });

  // ── Whitespace handling inside the bullet section ──────────────────────────

  it('trims surrounding whitespace from converted lines inside the bullet section', () => {
    const input  = 'Context.\n\n   indented line.   ';
    const output = 'Context.\n\n- indented line.';
    expect(normalizeBullets(input)).toBe(output);
  });
});

describe('normalizeSummaryLineWraps', () => {
  it('returns empty string unchanged', () => {
    expect(normalizeSummaryLineWraps('')).toBe('');
  });

  it('returns a single-line summary unchanged', () => {
    const s = 'Senior Product Designer with 10 years of experience.';
    expect(normalizeSummaryLineWraps(s)).toBe(s);
  });

  it('merges soft line wraps within a single paragraph into spaces', () => {
    const input  = 'Senior Product Designer specializing in complex systems, operational workflows, and multi-role\nplatforms across fintech and SaaS products.';
    const output = 'Senior Product Designer specializing in complex systems, operational workflows, and multi-role platforms across fintech and SaaS products.';
    expect(normalizeSummaryLineWraps(input)).toBe(output);
  });

  it('preserves intentional paragraph breaks (\\n\\n)', () => {
    const input  = 'Paragraph one line one.\nParagraph one line two.\n\nParagraph two.';
    const output = 'Paragraph one line one. Paragraph one line two.\n\nParagraph two.';
    expect(normalizeSummaryLineWraps(input)).toBe(output);
  });

  it('handles the exact user-reported three-paragraph case', () => {
    const input = [
      'Senior Product Designer specializing in complex systems, operational workflows, and multi-role',
      'platforms across fintech and SaaS products.',
      '',
      'Experienced in simplifying high-risk processes such as onboarding, authentication, and platform',
      'operations into clear, scalable workflows aligned with business and technical constraints.',
      '',
      'Collaborates with product and engineering teams to translate complex requirements into structured',
      'solutions for operational and customer-facing platforms.',
    ].join('\n');

    const expected = [
      'Senior Product Designer specializing in complex systems, operational workflows, and multi-role platforms across fintech and SaaS products.',
      '',
      'Experienced in simplifying high-risk processes such as onboarding, authentication, and platform operations into clear, scalable workflows aligned with business and technical constraints.',
      '',
      'Collaborates with product and engineering teams to translate complex requirements into structured solutions for operational and customer-facing platforms.',
    ].join('\n');

    expect(normalizeSummaryLineWraps(input)).toBe(expected);
  });

  it('normalises multiple consecutive blank lines between paragraphs to a single \\n\\n', () => {
    const input = 'Para one.\n\n\n\nPara two.';
    // split on /\n{2,}/ then rejoin with \n\n — result has exactly \n\n
    expect(normalizeSummaryLineWraps(input)).toBe('Para one.\n\nPara two.');
  });

  it('trims leading and trailing whitespace from each line within a paragraph', () => {
    const input  = '  Line one with leading space.  \n  Line two with leading space.  ';
    const output = 'Line one with leading space. Line two with leading space.';
    expect(normalizeSummaryLineWraps(input)).toBe(output);
  });

  it('is idempotent', () => {
    const input = 'Line one.\nLine two.\n\nParagraph two.';
    const once  = normalizeSummaryLineWraps(input);
    expect(normalizeSummaryLineWraps(once)).toBe(once);
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
        // Context paragraph + blank separator + plain responsibilities is the
        // shape the updated prompt asks Gemini for. The normaliser turns the
        // bullet-section lines into "- " bullets while leaving the context
        // paragraph alone.
        description: 'Led design at Acme, a B2B SaaS startup.\n\nLed mobile design.\nCollaborated with PMs.',
      },
    ],
  };

  it('returns input unchanged when there is no workHistory', () => {
    const input = { personal: { firstName: 'Jane' } } as Partial<Profile>;
    expect(normalizeExtractedProfile(input)).toBe(input);
  });

  it('normalises only the bullet section of workHistory[].description, preserving the context paragraph', () => {
    const result = normalizeExtractedProfile(PARTIAL);
    expect(result.workHistory?.[0]?.description).toBe(
      'Led design at Acme, a B2B SaaS startup.\n\n- Led mobile design.\n- Collaborated with PMs.',
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

  it('merges soft line wraps in professional.summary', () => {
    const input: Partial<Profile> = {
      professional: {
        summary: 'Senior Designer specializing in complex systems,\nand multi-role platforms.\n\nExperienced in simplifying processes\nacross fintech.',
      },
    };
    const result = normalizeExtractedProfile(input);
    expect(result.professional?.summary).toBe(
      'Senior Designer specializing in complex systems, and multi-role platforms.\n\nExperienced in simplifying processes across fintech.',
    );
  });

  it('leaves professional.summary unchanged when there are no soft line wraps', () => {
    const input: Partial<Profile> = {
      professional: {
        summary: 'Senior Designer.\n\nExperienced in fintech.',
      },
    };
    const result = normalizeExtractedProfile(input);
    expect(result.professional?.summary).toBe('Senior Designer.\n\nExperienced in fintech.');
  });

  it('preserves noticePeriod when normalising summary', () => {
    const input: Partial<Profile> = {
      professional: {
        summary: 'Line one.\nLine two.',
        noticePeriod: { immediate: false, value: 1, unit: 'month' },
      },
    };
    const result = normalizeExtractedProfile(input);
    expect(result.professional?.noticePeriod).toEqual({ immediate: false, value: 1, unit: 'month' });
    expect(result.professional?.summary).toBe('Line one. Line two.');
  });

  it('normalises workHistory descriptions AND professional.summary in a single call', () => {
    const input: Partial<Profile> = {
      workHistory: [
        {
          company: 'Acme',
          title: 'Senior PD',
          startDate: '2020-01',
          isCurrent: true,
          description: 'Led design at Acme, a B2B SaaS startup.\n\nLed mobile design.\nCollaborated with PMs.',
        },
      ],
      professional: {
        summary: 'Senior Designer specializing in complex systems,\nand multi-role platforms.\n\nExperienced in simplifying processes\nacross fintech.',
      },
    };
    const result = normalizeExtractedProfile(input);

    // workHistory description: context paragraph preserved, responsibilities bulleted
    expect(result.workHistory?.[0]?.description).toBe(
      'Led design at Acme, a B2B SaaS startup.\n\n- Led mobile design.\n- Collaborated with PMs.',
    );

    // summary: soft line wraps merged, paragraph break preserved
    expect(result.professional?.summary).toBe(
      'Senior Designer specializing in complex systems, and multi-role platforms.\n\nExperienced in simplifying processes across fintech.',
    );
  });
});
