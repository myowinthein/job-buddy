import { describe, it, expect } from 'vitest';
import { mapField } from './mapper';
import { CONF_FUZZY_THRESHOLD, CONF_FUZZY_STRONG_MULT, CONF_FUZZY_WEAK_MULT } from './constants';
import type { Profile } from '../types/profile';
import type { LearnedMappings } from '../types/storage';

// Avoids importing signals.ts (DOM-dependent); mapField never reads the element field.
function sig(overrides: Partial<{
  name: string; id: string; placeholder: string; autocomplete: string;
  ariaLabel: string; label: string; nearbyText: string; type: string;
}> = {}) {
  return {
    element: null,
    name: '', id: '', placeholder: '', autocomplete: '',
    ariaLabel: '', label: '', nearbyText: '', type: 'text',
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const PROFILE: Profile = {
  id: 'test-id',
  personal: {
    firstName: 'Jane',
    lastName: 'Doe',
    nickname: 'Janey',
    email: 'jane@example.com',
    phone: { countryCode: 'TH', callingCode: '+66', number: '812345678' },
    gender: 'male',
    ethnicity: 'East Asian',
    veteranStatus: 'no',
    disabilityStatus: 'prefer_not_to_say',
  },
  address: { city: 'Bangkok', country: 'TH' },
  professional: {},
  salary: { current: { amount: 80000, currency: 'THB', period: 'monthly' }, expected: [] },
  workAuthorization: [],
  workHistory: [{ company: 'Acme', title: 'Senior Engineer', startDate: '2020-01', isCurrent: true }],
  education: [],
  languages: [],
  links: { linkedin: 'https://linkedin.com/in/jane' },
  documents: { cv: {} },
  derived: {
    fullName: 'Jane Doe',
    currentTitle: 'Senior Engineer',
    currentCompany: 'Acme',
    totalExperience: { totalMonths: 50, years: 4, months: 2, label: '4 years 2 months' },
  },
};

const NO_MAPPINGS: LearnedMappings = {};
const DOMAIN = 'example.com';

describe('mapField — Layer 0: Learned mappings', () => {
  it('returns a legacy string mapping with 0.97 confidence (trusted unconditionally)', () => {
    const mappings: LearnedMappings = { 'example.com': { 'customlabel': 'personal.firstName' } };
    const result = mapField(sig({ name: 'customlabel' }), PROFILE, mappings, DOMAIN);
    expect(result.matchLayer).toBe('learned');
    expect(result.confidence).toBe(0.97);
    expect(result.fieldPath).toBe('personal.firstName');
    expect(result.value).toBe('Jane');
  });

  it('does not apply learned mappings from a different domain', () => {
    const mappings: LearnedMappings = { 'other.com': { 'firstname': 'personal.lastName' } };
    const result = mapField(sig({ name: 'firstname' }), PROFILE, mappings, DOMAIN);
    expect(result.matchLayer).not.toBe('learned');
  });

  it('learned mapping takes priority over autocomplete', () => {
    const mappings: LearnedMappings = { 'example.com': { 'givenname': 'personal.lastName' } };
    const result = mapField(sig({ name: 'givenname', autocomplete: 'given-name' }), PROFILE, mappings, DOMAIN);
    expect(result.matchLayer).toBe('learned');
    expect(result.fieldPath).toBe('personal.lastName');
  });

  // ── Confidence / threshold tests ─────────────────────────────────────────

  it('does NOT promote a count:1 entry to Layer 0 (below threshold)', () => {
    const mappings: LearnedMappings = {
      'example.com': { 'customlabel': { path: 'personal.firstName', count: 1 } },
    };
    const result = mapField(sig({ name: 'customlabel' }), PROFILE, mappings, DOMAIN);
    expect(result.matchLayer).not.toBe('learned');
  });

  it('DOES promote a count:2 entry to Layer 0 (meets threshold)', () => {
    const mappings: LearnedMappings = {
      'example.com': { 'customlabel': { path: 'personal.firstName', count: 2 } },
    };
    const result = mapField(sig({ name: 'customlabel' }), PROFILE, mappings, DOMAIN);
    expect(result.matchLayer).toBe('learned');
    expect(result.fieldPath).toBe('personal.firstName');
    expect(result.confidence).toBe(0.97);
  });

  it('promotes a count well above threshold', () => {
    const mappings: LearnedMappings = {
      'example.com': { 'customlabel': { path: 'personal.email', count: 10 } },
    };
    const result = mapField(sig({ name: 'customlabel' }), PROFILE, mappings, DOMAIN);
    expect(result.matchLayer).toBe('learned');
    expect(result.fieldPath).toBe('personal.email');
  });

  it('falls through to dictionary when the only learned entry is below threshold', () => {
    const mappings: LearnedMappings = {
      'example.com': { 'email': { path: 'personal.firstName', count: 1 } }, // below threshold
    };
    // 'email' signal would hit dictionary (personal.email) if Layer 0 is skipped
    const result = mapField(sig({ name: 'email' }), PROFILE, mappings, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.email');
  });
});

describe('mapField — Layer 1: Autocomplete attribute', () => {
  it('maps given-name → personal.firstName at 0.95', () => {
    const result = mapField(sig({ autocomplete: 'given-name' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('personal.firstName');
    expect(result.confidence).toBe(0.95);
    expect(result.value).toBe('Jane');
  });

  it('maps family-name → personal.lastName', () => {
    const result = mapField(sig({ autocomplete: 'family-name' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('personal.lastName');
  });

  it('maps nickname → personal.nickname', () => {
    const result = mapField(sig({ autocomplete: 'nickname' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('personal.nickname');
    expect(result.value).toBe('Janey');
  });

  it('maps email → personal.email', () => {
    const result = mapField(sig({ autocomplete: 'email' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.value).toBe('jane@example.com');
  });

  it('maps tel → personal.phone.full (full number including calling code)', () => {
    const result = mapField(sig({ autocomplete: 'tel' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('personal.phone.full');
  });

  it('maps tel-national → personal.phone.number (local number only)', () => {
    const result = mapField(sig({ autocomplete: 'tel-national' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('personal.phone.number');
  });

  it('maps tel-country-code → personal.phone.callingCode', () => {
    const result = mapField(sig({ autocomplete: 'tel-country-code' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('personal.phone.callingCode');
  });

  it('maps country → address.country', () => {
    const result = mapField(sig({ autocomplete: 'country' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('address.country');
  });

  it('maps postal-code → address.postalCode', () => {
    const result = mapField(sig({ autocomplete: 'postal-code' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('autocomplete');
    expect(result.fieldPath).toBe('address.postalCode');
  });
});

describe('mapField — Layer 2: Dictionary exact match', () => {
  it('matches "firstname" name signal → personal.firstName at 0.85', () => {
    const result = mapField(sig({ name: 'firstname' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.firstName');
    expect(result.confidence).toBe(0.85);
    expect(result.value).toBe('Jane');
  });

  it('matches "email" label signal → personal.email', () => {
    const result = mapField(sig({ label: 'Email' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.email');
  });

  it('matches "preferred name" label signal → personal.nickname', () => {
    const result = mapField(sig({ label: 'Preferred Name' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.nickname');
    expect(result.value).toBe('Janey');
  });

  it('matches "language" label signal → the unindexed languages.language marker', () => {
    // Left unindexed here — adjustLanguageMatches (languageResolution.ts)
    // assigns the real languages.N.language path once every field on the
    // page is scanned; mapField() alone has no page-wide visibility.
    const result = mapField(sig({ label: 'Language' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('languages.language');
  });

  it('matches "proficiency" label signal → the unindexed languages.proficiency marker', () => {
    const result = mapField(sig({ label: 'Proficiency' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('languages.proficiency');
  });

  it('matches "institution" label signal → the unindexed education.institution marker', () => {
    // Left unindexed here too — adjustEducationMatches (educationResolution.ts)
    // assigns the real education.N.institution path afterward.
    const result = mapField(sig({ label: 'Institution' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('education.institution');
  });

  it('matches "degree" label signal → the unindexed education.degree marker', () => {
    const result = mapField(sig({ label: 'Degree' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('education.degree');
  });

  it('matches "field of study" label signal → the unindexed education.fieldOfStudy marker', () => {
    const result = mapField(sig({ label: 'Field of Study' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('education.fieldOfStudy');
  });

  it('matches "start date" label signal → the unindexed education.startDate.formatted marker', () => {
    const result = mapField(sig({ label: 'Start Date' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('education.startDate.formatted');
  });

  it('matches "end date" label signal → the unindexed education.endDate.formatted marker', () => {
    const result = mapField(sig({ label: 'End Date' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('education.endDate.formatted');
  });

  it('matches "currently enrolled" label signal → the unindexed education.isCurrent marker', () => {
    const result = mapField(sig({ label: 'Currently Enrolled' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('education.isCurrent');
  });

  it('matches "city" placeholder signal → address.city', () => {
    const result = mapField(sig({ placeholder: 'City' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('address.city');
    expect(result.value).toBe('Bangkok');
  });

  it('matches "linkedin" aria-label → links.linkedin', () => {
    const result = mapField(sig({ ariaLabel: 'LinkedIn' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('links.linkedin');
  });

  it('matches "phone" → personal.phone.full (combined, for single-field forms)', () => {
    const result = mapField(sig({ name: 'phone' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.phone.full');
  });

  it('matches "phonenumber" → personal.phone.number (local number for two-field forms)', () => {
    const result = mapField(sig({ name: 'phonenumber' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.phone.number');
  });

  it('matches "countrycode" → personal.phone.callingCode', () => {
    const result = mapField(sig({ name: 'countrycode' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.phone.callingCode');
  });

  it('matches "callingcode" → personal.phone.callingCode', () => {
    const result = mapField(sig({ name: 'callingcode' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.phone.callingCode');
  });

  it('matches "dateavailable" → professional.noticePeriod.availableDate', () => {
    const result = mapField(sig({ name: 'dateavailable' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('professional.noticePeriod.availableDate');
  });

  it('matches "availablefrom" → professional.noticePeriod.availableDate', () => {
    const result = mapField(sig({ label: 'Available From' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('professional.noticePeriod.availableDate');
  });

  it('matches "portfoliowebsite" → links.portfolio', () => {
    const result = mapField(sig({ label: 'Portfolio Website' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('links.portfolio');
  });

  it('matches "websiteblogorportfolio" → links.portfolio', () => {
    const result = mapField(sig({ label: 'Website, Blog or Portfolio' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('links.portfolio');
  });

  it('matches "websiteblogportfolio" → links.portfolio', () => {
    const result = mapField(sig({ label: 'Website / Blog / Portfolio' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('links.portfolio');
  });

  it('matches "gender" → personal.gender', () => {
    const result = mapField(sig({ label: 'Gender' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.gender');
    expect(result.value).toBe('male');
  });

  it('matches "sex" → personal.gender', () => {
    const result = mapField(sig({ label: 'Sex' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.gender');
  });

  it('matches "ethnicity" → personal.ethnicity', () => {
    const result = mapField(sig({ label: 'Ethnicity' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.ethnicity');
    expect(result.value).toBe('East Asian');
  });

  it('matches "race" → personal.ethnicity', () => {
    const result = mapField(sig({ label: 'Race' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.ethnicity');
  });

  it('matches "veteranstatus" → personal.veteranStatus', () => {
    const result = mapField(sig({ label: 'Veteran Status' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.veteranStatus');
    expect(result.value).toBe('no');
  });

  it('matches "disabilitystatus" → personal.disabilityStatus', () => {
    const result = mapField(sig({ label: 'Disability Status' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.disabilityStatus');
    expect(result.value).toBe('prefer_not_to_say');
  });
});

describe('mapField — documents.cv.file vs documents.cv.url disambiguation', () => {
  const withUrl = {
    ...PROFILE,
    documents: { cv: { url: 'https://drive.google.com/jane-cv', file: { name: 'jane-cv.pdf', size: 1024, base64: 'abc' } } },
  };

  it('keeps documents.cv.file for an actual file input', () => {
    const result = mapField(sig({ label: 'Resume', type: 'file' }), withUrl, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('documents.cv.file');
    expect(result.value).toBe('jane-cv.pdf');
  });

  it('redirects to documents.cv.url for a text input sharing the same label', () => {
    const result = mapField(sig({ label: 'Resume', type: 'text' }), withUrl, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('documents.cv.url');
    expect(result.value).toBe('https://drive.google.com/jane-cv');
  });

  it('redirects for a url-type input too', () => {
    const result = mapField(sig({ label: 'CV', type: 'url' }), withUrl, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('documents.cv.url');
  });

  it('never fills a text field with the raw filename, even with no url stored', () => {
    const fileOnly = { ...PROFILE, documents: { cv: { file: { name: 'jane-cv.pdf', size: 1024, base64: 'abc' } } } };
    const result = mapField(sig({ label: 'Resume', type: 'text' }), fileOnly, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('documents.cv.url');
    expect(result.value).toBeNull();
  });
});

describe('mapField — signal priority: label beats name/id', () => {
  it('prefers label over name when they point to different fields', () => {
    // Real-world case: name="linkedin" on a "Website, Blog or Portfolio" field
    const result = mapField(
      sig({ name: 'linkedin', label: 'Website, Blog or Portfolio' }),
      PROFILE, NO_MAPPINGS, DOMAIN,
    );
    expect(result.fieldPath).toBe('links.portfolio');
    expect(result.matchLayer).toBe('dictionary_exact');
  });

  it('prefers label over id when they conflict', () => {
    const result = mapField(
      sig({ id: 'linkedin', label: 'Portfolio Website' }),
      PROFILE, NO_MAPPINGS, DOMAIN,
    );
    expect(result.fieldPath).toBe('links.portfolio');
  });

  it('still matches name when label is absent', () => {
    const result = mapField(sig({ name: 'linkedin' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('links.linkedin');
  });
});

describe('mapField — autocomplete: url is not mapped to linkedin', () => {
  it('does not match autocomplete="url" to any field (falls through to dictionary)', () => {
    // url autocomplete is too generic — the label/name should decide the field.
    const result = mapField(sig({ autocomplete: 'url' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).not.toBe('autocomplete');
  });

  it('still maps autocomplete="url" field to portfolio when label says so', () => {
    const result = mapField(
      sig({ autocomplete: 'url', label: 'Portfolio Website' }),
      PROFILE, NO_MAPPINGS, DOMAIN,
    );
    expect(result.fieldPath).toBe('links.portfolio');
  });

  it('still maps autocomplete="url" field to linkedin when label says so', () => {
    const result = mapField(
      sig({ autocomplete: 'url', label: 'LinkedIn URL' }),
      PROFILE, NO_MAPPINGS, DOMAIN,
    );
    expect(result.fieldPath).toBe('links.linkedin');
  });
});

describe('mapField — Layer 3: Fuzzy match', () => {
  it('fuzzy-matches a near-miss signal to the correct profile field', () => {
    // "firstnam" is close to "firstname" in the dictionary
    const result = mapField(sig({ name: 'firstnam' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('personal.firstName');
    expect(result.matchLayer).toBe('fuzzy');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('applies the STRONG multiplier when the fuzzy score exceeds the threshold', () => {
    // "firstnam" vs "firstname" → similarity 8/9 ≈ 0.8889 (> CONF_FUZZY_THRESHOLD).
    const result = mapField(sig({ name: 'firstnam' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('fuzzy');
    const score = 8 / 9; // 1 - levenshtein(1) / maxLen(9)
    expect(score).toBeGreaterThan(CONF_FUZZY_THRESHOLD);
    // confidence === score * CONF_FUZZY_STRONG_MULT
    expect(result.confidence).toBeCloseTo(score * CONF_FUZZY_STRONG_MULT, 6);
    // Sanity: strong tier stays below the green tint boundary.
    expect(result.confidence).toBeLessThan(0.85);
  });

  it('applies the WEAK multiplier when CONF_FILL <= score <= threshold', () => {
    // "compayn" vs dictionary "company" → similarity 5/7 ≈ 0.7143
    // (>= CONF_FILL and <= CONF_FUZZY_THRESHOLD → weak tier).
    const result = mapField(sig({ name: 'compayn' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('fuzzy');
    expect(result.fieldPath).toBe('derived.currentCompany');
    const score = 5 / 7; // 1 - levenshtein(2) / maxLen(7)
    expect(score).toBeGreaterThanOrEqual(0.60);           // CONF_FILL
    expect(score).toBeLessThanOrEqual(CONF_FUZZY_THRESHOLD);
    // confidence === score * CONF_FUZZY_WEAK_MULT
    expect(result.confidence).toBeCloseTo(score * CONF_FUZZY_WEAK_MULT, 6);
  });
});

describe('mapField — Layer 3.5: Custom link labels', () => {
  const withCustomLinks = {
    ...PROFILE,
    links: {
      ...PROFILE.links,
      custom: [
        { label: 'GitHub', url: 'https://github.com/janedoe' },
        { label: 'Behance', url: 'https://behance.net/janedoe' },
      ],
    },
  };

  it('matches an exact label signal at CONF_DICT_EXACT', () => {
    const result = mapField(sig({ label: 'GitHub' }), withCustomLinks, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('custom_link');
    expect(result.fieldPath).toBe('links.custom.0.url');
    expect(result.confidence).toBe(0.85);
    expect(result.value).toBe('https://github.com/janedoe');
  });

  it('matches the correct entry among multiple custom links', () => {
    const result = mapField(sig({ label: 'Behance' }), withCustomLinks, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('links.custom.1.url');
    expect(result.value).toBe('https://behance.net/janedoe');
  });

  it('fuzzy-matches a close-but-not-exact label at a lower confidence', () => {
    // "guthub" vs "github" → similarity 5/6 ≈ 0.833 (single-char typo).
    const result = mapField(sig({ label: 'Guthub' }), withCustomLinks, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('custom_link');
    expect(result.fieldPath).toBe('links.custom.0.url');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThan(0.85);
  });

  it('lets the static dictionary win over a same-named custom link', () => {
    const p = {
      ...PROFILE,
      links: { ...PROFILE.links, custom: [{ label: 'Portfolio', url: 'https://custom-portfolio.example' }] },
    };
    const result = mapField(sig({ label: 'Portfolio' }), p, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('links.portfolio');
  });

  it('ignores a custom link entry with a blank label or url', () => {
    const p = {
      ...PROFILE,
      links: { ...PROFILE.links, custom: [{ label: '', url: 'https://x.example' }, { label: 'Medium', url: '' }] },
    };
    const result = mapField(sig({ label: 'Medium' }), p, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).not.toBe('custom_link');
  });

  it('does not affect fields unrelated to any custom link', () => {
    const result = mapField(sig({ name: 'firstname' }), withCustomLinks, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('dictionary_exact');
    expect(result.fieldPath).toBe('personal.firstName');
  });
});

describe('mapField — Layer 4: Context (nearbyText)', () => {
  it('matches via nearbyText when primary signals produce no match', () => {
    const result = mapField(sig({ name: 'field1', nearbyText: 'city' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('context');
    expect(result.fieldPath).toBe('address.city');
    expect(result.confidence).toBe(0.70);
  });
});

describe('mapField — no match', () => {
  it('returns confidence 0 and null path when no signal matches', () => {
    const result = mapField(sig({ name: 'xyzcompletely123random' }), PROFILE, NO_MAPPINGS, DOMAIN);
    expect(result.matchLayer).toBe('none');
    expect(result.confidence).toBe(0);
    expect(result.fieldPath).toBeNull();
    expect(result.value).toBeNull();
  });

  it('returns null value when profile value is empty for a matched path', () => {
    const p = { ...PROFILE, links: { ...PROFILE.links, linkedin: '' } };
    const result = mapField(sig({ name: 'linkedin' }), p, NO_MAPPINGS, DOMAIN);
    expect(result.fieldPath).toBe('links.linkedin');
    expect(result.value).toBeNull();
  });
});
