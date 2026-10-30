import type { Profile } from '@/src/types/profile';

// Matches any line that already starts with a common bullet marker so we
// don't add a duplicate. Covers ASCII hyphens, asterisks, and common Unicode
// bullets seen in resumes (•, ·, ◦, ‣, ▪, ■, ▶, ▸, ▹, ►, →).
const BULLET_RE = /^\s*[-•*·◦‣▪■▶▸▹►→]\s+/;

/**
 * Normalises a description while preserving its context paragraphs.
 * The first explicit bullet marker starts the responsibility list. Blank lines
 * alone cannot distinguish company context, career progression, or achievements.
 *
 * Lines BEFORE the bullet section are preserved verbatim — they're the
 * company/team/product/role context paragraphs that shouldn't be bulletised.
 *
 * Lines AT or AFTER the bullet section:
 *   - Blank lines pass through as paragraph separators.
 *   - Lines that already begin with -, •, *, ·, ◦, ‣, ▪, ■, ▶, ▸, ▹, ►, → are kept as-is.
 *   - All other non-blank lines get a "- " prefix.
 *
 * If no explicit bullet marker is detected, the text
 * is returned UNCHANGED. This is intentional: blindly bulleting plain prose
 * would convert legitimate context paragraphs into responsibility lines.
 *
 * Idempotent: running this twice on the same input produces the same output.
 */
export function normalizeBullets(text: string): string {
  if (!text) return text;
  const lines = text.split('\n');

  let bulletStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (BULLET_RE.test(lines[i])) {
      bulletStartIdx = i;
      break;
    }
  }

  if (bulletStartIdx === -1) return text;

  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i < bulletStartIdx) {
      result.push(lines[i]);
      continue;
    }
    const line = lines[i];
    if (!line.trim()) {
      result.push('');
      continue;
    }
    if (BULLET_RE.test(line)) {
      result.push(line);
      continue;
    }
    result.push(`- ${line.trim()}`);
  }

  return result.join('\n');
}

/**
 * Merges soft line wraps inside a professional summary string.
 *
 * PDF text extraction inserts line breaks at column boundaries that are not
 * intentional paragraph breaks. Gemini copies these verbatim. This function
 * collapses single-newline soft wraps within each paragraph into spaces while
 * keeping intentional paragraph separators (blank lines / \n\n) intact.
 *
 * Input:  "Senior Designer specializing in complex systems,\nand SaaS.\n\nExperienced in..."
 * Output: "Senior Designer specializing in complex systems, and SaaS.\n\nExperienced in..."
 *
 * Idempotent: running twice produces the same result.
 */
export function normalizeSummaryLineWraps(text: string): string {
  if (!text) return text;
  // Split on one or more consecutive blank lines — these are intentional breaks.
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs
    .map((para) =>
      para
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(' '),
    )
    .join('\n\n');
}

/**
 * Strips a Markdown code-fence wrapper from an AI text response.
 * Handles optional language tag (e.g. ```json) on the opening fence.
 * Returns the trimmed inner text, or the original string if no fence found.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
}

// Older extraction prompts placed GitHub profiles in custom links. Promote only
// an explicitly labelled account URL, preserving repository links and ambiguity.
function normalizeExtractedLinks(links?: Profile['links']): Profile['links'] | undefined {
  if (!links?.custom?.length) return links;
  const profiles = links.custom.filter((entry) => {
    if (!/^github(?:\s+profile)?$/i.test(entry.label.trim())) return false;
    try {
      const url = new URL(entry.url);
      return ['github.com', 'www.github.com'].includes(url.hostname) &&
        /^\/[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?\/?$/i.test(url.pathname);
    } catch { return false; }
  });
  if (!profiles.length) return links;
  const sameUrl = (a: string, b: string) => a.replace(/\/$/, '').toLowerCase() === b.replace(/\/$/, '').toLowerCase();
  // Multiple different accounts need a human choice, not first-match selection.
  const github = links.github || profiles[0].url;
  if (!links.github && profiles.some((entry) => !sameUrl(entry.url, github))) return links;
  return {
    ...links,
    github,
    custom: links.custom.filter((entry) => !profiles.includes(entry) || !sameUrl(entry.url, github)),
  };
}

/**
 * Post-processes the Partial<Profile> returned by Gemini:
 *   - Normalises every workHistory[].description into bullet form.
 *   - Merges soft PDF line wraps in professional.summary into spaces.
 *   - Routes unambiguous extracted GitHub profiles to their dedicated field.
 *
 * Pure: returns a new object, does not mutate the input.
 */
export function normalizeExtractedProfile(p: Partial<Profile>): Partial<Profile> {
  const needsWorkNorm = !!p.workHistory?.length;
  const needsSummaryNorm = !!p.professional?.summary;
  const links = normalizeExtractedLinks(p.links);
  if (!needsWorkNorm && !needsSummaryNorm && links === p.links) return p;

  return {
    ...p,
    ...(links !== p.links ? { links } : undefined),
    ...(needsWorkNorm
      ? {
          workHistory: p.workHistory!.map((entry) =>
            entry.description ? { ...entry, description: normalizeBullets(entry.description) } : entry,
          ),
        }
      : undefined),
    ...(needsSummaryNorm
      ? {
          professional: {
            ...p.professional,
            summary: normalizeSummaryLineWraps(p.professional!.summary as string),
          },
        }
      : undefined),
  };
}
