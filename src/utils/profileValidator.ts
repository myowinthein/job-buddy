import type { Profile } from '../types/profile';

export interface InvalidField {
  path:   string;
  reason: string;
}

export interface ValidationResult {
  valid:         boolean;
  invalidFields: InvalidField[];
  sanitized:     Partial<Profile>;
}

const RE_EMAIL    = /^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$/;
const RE_YYYYMM   = /^\d{4}-\d{2}$/;
const RE_YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;
const RE_CURRENCY = /^[A-Z]{3}$/;

const VALID_GENDERS     = new Set(['male', 'female', 'other', 'prefer_not_to_say']);
const VALID_VETERAN     = new Set(['yes', 'no', 'prefer_not_to_say']);
const VALID_AUTH_STATUS = new Set(['citizen_or_pr', 'work_visa', 'requires_sponsorship']);
const VALID_PROFICIENCY = new Set([
  'native_bilingual', 'full_professional', 'professional_working',
  'limited_working', 'elementary',
]);

export function validateImportedProfile(raw: unknown): ValidationResult {
  const errors: InvalidField[] = [];
  const s: Partial<Profile>    = {};

  function err(path: string, reason: string) { errors.push({ path, reason }); }

  if (typeof raw !== 'object' || raw === null) {
    return { valid: false, invalidFields: [{ path: 'root', reason: 'not an object' }], sanitized: {} };
  }

  const data = raw as Record<string, unknown>;

  // ── personal ────────────────────────────────────────────────────────────────
  if ('personal' in data && typeof data.personal === 'object' && data.personal !== null) {
    const p = data.personal as Record<string, unknown>;
    const sp: Record<string, unknown> = {};

    if (p.firstName !== undefined) {
      if (typeof p.firstName === 'string' && p.firstName.length <= 100) sp.firstName = p.firstName;
      else err('personal.firstName', 'expected string, max 100 chars');
    }
    if (p.lastName !== undefined) {
      if (typeof p.lastName === 'string' && p.lastName.length <= 100) sp.lastName = p.lastName;
      else err('personal.lastName', 'expected string, max 100 chars');
    }
    if (p.email !== undefined) {
      if (typeof p.email === 'string' && RE_EMAIL.test(p.email)) sp.email = p.email;
      else err('personal.email', 'invalid email format');
    }
    if (p.phone !== undefined) {
      if (
        typeof p.phone === 'object' && p.phone !== null &&
        typeof (p.phone as Record<string, unknown>).countryCode === 'string' &&
        typeof (p.phone as Record<string, unknown>).callingCode === 'string' &&
        typeof (p.phone as Record<string, unknown>).number === 'string'
      ) {
        sp.phone = p.phone;
      } else {
        err('personal.phone', 'expected object with countryCode, callingCode, number strings');
      }
    }
    if (p.dateOfBirth !== undefined) {
      if (typeof p.dateOfBirth === 'string' && RE_YYYYMMDD.test(p.dateOfBirth)) sp.dateOfBirth = p.dateOfBirth;
      else err('personal.dateOfBirth', 'invalid date format, expected YYYY-MM-DD');
    }
    if (p.gender !== undefined) {
      if (typeof p.gender === 'string' && VALID_GENDERS.has(p.gender)) sp.gender = p.gender;
      else err('personal.gender', 'expected male | female | other | prefer_not_to_say');
    }
    if (p.ethnicity !== undefined && typeof p.ethnicity === 'string') sp.ethnicity = p.ethnicity;
    if (p.veteranStatus !== undefined) {
      if (typeof p.veteranStatus === 'string' && VALID_VETERAN.has(p.veteranStatus)) sp.veteranStatus = p.veteranStatus;
      else err('personal.veteranStatus', 'expected yes | no | prefer_not_to_say');
    }
    if (p.disabilityStatus !== undefined) {
      if (typeof p.disabilityStatus === 'string' && VALID_VETERAN.has(p.disabilityStatus)) sp.disabilityStatus = p.disabilityStatus;
      else err('personal.disabilityStatus', 'expected yes | no | prefer_not_to_say');
    }

    if (Object.keys(sp).length > 0) s.personal = sp as Profile['personal'];
  }

  // ── address ─────────────────────────────────────────────────────────────────
  if ('address' in data && typeof data.address === 'object' && data.address !== null) {
    const a = data.address as Record<string, unknown>;
    const sa: Record<string, unknown> = {};

    if (a.city !== undefined) {
      if (typeof a.city === 'string' && a.city.length <= 100) sa.city = a.city;
      else err('address.city', 'expected string, max 100 chars');
    }
    if (a.country !== undefined) {
      if (typeof a.country === 'string' && a.country.length <= 100) sa.country = a.country;
      else err('address.country', 'expected string, max 100 chars');
    }
    if (a.street !== undefined) {
      if (typeof a.street === 'string' && a.street.length <= 255) sa.street = a.street;
      else err('address.street', 'expected string, max 255 chars');
    }
    if (a.state !== undefined) {
      if (typeof a.state === 'string' && a.state.length <= 100) sa.state = a.state;
      else err('address.state', 'expected string, max 100 chars');
    }
    if (a.postalCode !== undefined) {
      if (typeof a.postalCode === 'string' && a.postalCode.length <= 20) sa.postalCode = a.postalCode;
      else err('address.postalCode', 'expected string, max 20 chars');
    }

    if (Object.keys(sa).length > 0) s.address = sa as Profile['address'];
  }

  // ── professional (pass-through, not in spec validation rules) ───────────────
  if ('professional' in data && typeof data.professional === 'object' && data.professional !== null) {
    const pr = data.professional as Record<string, unknown>;
    const sp: Profile['professional'] = {};
    if (typeof pr.summary === 'string') sp.summary = pr.summary;
    if (pr.noticePeriod && typeof pr.noticePeriod === 'object') {
      sp.noticePeriod = pr.noticePeriod as Profile['professional']['noticePeriod'];
    }
    s.professional = sp;
  }

  // ── salary ──────────────────────────────────────────────────────────────────
  if ('salary' in data && typeof data.salary === 'object' && data.salary !== null) {
    const sal = data.salary as Record<string, unknown>;
    const ss: Partial<Profile['salary']> = {};

    if ('current' in sal && typeof sal.current === 'object' && sal.current !== null) {
      const cur = sal.current as Record<string, unknown>;
      if (typeof cur.amount === 'number' && cur.amount > 0 &&
          typeof cur.currency === 'string' && RE_CURRENCY.test(cur.currency)) {
        ss.current = { amount: cur.amount, currency: cur.currency };
      } else {
        if (typeof cur.amount !== 'number' || cur.amount <= 0) err('salary.current.amount', 'expected positive number');
        if (typeof cur.currency !== 'string' || !RE_CURRENCY.test(cur.currency)) err('salary.current.currency', 'expected 3-letter uppercase currency code');
      }
    }

    if ('expected' in sal && Array.isArray(sal.expected)) {
      const expected: Profile['salary']['expected'] = [];
      (sal.expected as unknown[]).forEach((entry) => {
        if (typeof entry === 'object' && entry !== null) {
          const e = entry as Record<string, unknown>;
          if (typeof e.currency === 'string') {
            // Current shape: { country?, currency, amount? }
            expected.push({
              country:  typeof e.country === 'string' ? e.country : undefined,
              currency: e.currency,
              amount:   typeof e.amount === 'number' ? e.amount : undefined,
            });
          }
          // Entries missing currency (e.g. partially-filled rows from older
          // exports) are dropped silently — they carry no usable data.
        }
      });
      if (expected.length > 0) ss.expected = expected;
    }

    if (Object.keys(ss).length > 0) s.salary = ss as Profile['salary'];
  }

  // ── workAuthorization ───────────────────────────────────────────────────────
  if ('workAuthorization' in data && Array.isArray(data.workAuthorization)) {
    const valid: Profile['workAuthorization'] = [];
    (data.workAuthorization as unknown[]).forEach((entry, i) => {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        if (typeof e.country === 'string' && typeof e.status === 'string' && VALID_AUTH_STATUS.has(e.status)) {
          valid.push({
            country:  e.country,
            status:   e.status as Profile['workAuthorization'][0]['status'],
            visaType:   typeof e.visaType === 'string' ? e.visaType : undefined,
            expiryDate: typeof e.expiryDate === 'string' ? e.expiryDate : undefined,
          });
        } else {
          err(`workAuthorization[${i}]`, 'missing country string or invalid status');
        }
      }
    });
    if (valid.length > 0) s.workAuthorization = valid;
  }

  // ── workHistory ─────────────────────────────────────────────────────────────
  if ('workHistory' in data && Array.isArray(data.workHistory)) {
    const valid: Profile['workHistory'] = [];
    (data.workHistory as unknown[]).forEach((entry, i) => {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        if (
          typeof e.company === 'string' && typeof e.title === 'string' &&
          typeof e.startDate === 'string' && RE_YYYYMM.test(e.startDate) &&
          typeof e.isCurrent === 'boolean'
        ) {
          valid.push({
            company:     e.company,
            title:       e.title,
            startDate:   e.startDate,
            isCurrent:   e.isCurrent,
            endDate:     typeof e.endDate === 'string' ? e.endDate : undefined,
            description: typeof e.description === 'string' ? e.description : undefined,
            arrangement: typeof e.arrangement === 'string' ? e.arrangement as Profile['workHistory'][0]['arrangement'] : undefined,
            location:    (typeof e.location === 'object' && e.location !== null) ? e.location as Profile['workHistory'][0]['location'] : undefined,
          });
        } else {
          err(`workHistory[${i}]`, 'missing company, title, startDate (YYYY-MM), or isCurrent boolean');
        }
      }
    });
    if (valid.length > 0) s.workHistory = valid;
  }

  // ── education ───────────────────────────────────────────────────────────────
  if ('education' in data && Array.isArray(data.education)) {
    const valid: Profile['education'] = [];
    (data.education as unknown[]).forEach((entry, i) => {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        if (
          typeof e.institution === 'string' && typeof e.degree === 'string' &&
          typeof e.fieldOfStudy === 'string' &&
          typeof e.startDate === 'string' && RE_YYYYMM.test(e.startDate)
        ) {
          valid.push({
            institution: e.institution,
            degree:      e.degree,
            fieldOfStudy: e.fieldOfStudy,
            startDate:   e.startDate,
            isCurrent:   typeof e.isCurrent === 'boolean' ? e.isCurrent : false,
            endDate:     typeof e.endDate === 'string' ? e.endDate : undefined,
            grade:       typeof e.grade === 'string' ? e.grade : undefined,
            description: typeof e.description === 'string' ? e.description : undefined,
          });
        } else {
          err(`education[${i}]`, 'missing institution, degree, fieldOfStudy, or startDate (YYYY-MM)');
        }
      }
    });
    if (valid.length > 0) s.education = valid;
  }

  // ── languages ───────────────────────────────────────────────────────────────
  if ('languages' in data && Array.isArray(data.languages)) {
    const valid: Profile['languages'] = [];
    (data.languages as unknown[]).forEach((entry, i) => {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        if (typeof e.language === 'string' && typeof e.proficiency === 'string' && VALID_PROFICIENCY.has(e.proficiency)) {
          valid.push({ language: e.language, proficiency: e.proficiency as Profile['languages'][0]['proficiency'] });
        } else {
          err(`languages[${i}]`, 'missing language string or invalid proficiency');
        }
      }
    });
    if (valid.length > 0) s.languages = valid;
  }

  // ── links ───────────────────────────────────────────────────────────────────
  if ('links' in data && typeof data.links === 'object' && data.links !== null) {
    const lnk = data.links as Record<string, unknown>;
    const sl: Partial<Profile['links']> = {};

    if (lnk.linkedin !== undefined) {
      if (typeof lnk.linkedin === 'string' && (lnk.linkedin === '' || lnk.linkedin.includes('linkedin.com'))) {
        if (lnk.linkedin) sl.linkedin = lnk.linkedin;
      } else if (typeof lnk.linkedin === 'string' && lnk.linkedin !== '') {
        err('links.linkedin', 'must contain linkedin.com');
      }
    }
    if (lnk.portfolio !== undefined && typeof lnk.portfolio === 'string') sl.portfolio = lnk.portfolio;
    if (lnk.github    !== undefined && typeof lnk.github    === 'string') sl.github    = lnk.github;
    if (lnk.twitter   !== undefined && typeof lnk.twitter   === 'string') sl.twitter   = lnk.twitter;
    if (lnk.dribbble  !== undefined && typeof lnk.dribbble  === 'string') sl.dribbble  = lnk.dribbble;
    if (lnk.behance   !== undefined && typeof lnk.behance   === 'string') sl.behance   = lnk.behance;
    if (Array.isArray(lnk.custom)) sl.custom = lnk.custom as Profile['links']['custom'];

    if (Object.keys(sl).length > 0) s.links = sl as Profile['links'];
  }

  // ── documents ───────────────────────────────────────────────────────────────
  if ('documents' in data && typeof data.documents === 'object' && data.documents !== null) {
    const docs = data.documents as Record<string, unknown>;
    const sd: Partial<Profile['documents']> = {};

    if ('cv' in docs && typeof docs.cv === 'object' && docs.cv !== null) {
      const cv = docs.cv as Record<string, unknown>;
      const scv: Profile['documents']['cv'] = {};

      if (cv.url !== undefined) {
        if (typeof cv.url === 'string' && cv.url.length <= 255) scv.url = cv.url;
        else err('documents.cv.url', 'expected string, max 255 chars');
      }
      if (cv.file !== undefined && typeof cv.file === 'object' && cv.file !== null) {
        const f = cv.file as Record<string, unknown>;
        if (typeof f.name === 'string' && typeof f.size === 'number' && typeof f.base64 === 'string') {
          scv.file = { name: f.name, size: f.size, base64: f.base64 };
        } else {
          err('documents.cv.file', 'expected object with name (string), size (number), base64 (string)');
        }
      }

      sd.cv = scv;
    }

    if ('coverLetter' in docs && typeof docs.coverLetter === 'object' && docs.coverLetter !== null) {
      sd.coverLetter = docs.coverLetter as Profile['documents']['coverLetter'];
    }

    if (Object.keys(sd).length > 0) s.documents = sd as Profile['documents'];
  }

  return { valid: errors.length === 0, invalidFields: errors, sanitized: s };
}
