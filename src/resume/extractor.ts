import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import type { ExtractedResume, DetectedField, TextChunk } from '../types/storage';

// ── PDF text extraction ───────────────────────────────────────────────────────
async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const data = new Uint8Array(buffer);
  const pdf  = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let lineText = '';
    let prevY: number | null = null;

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = (item.transform as number[])[5] ?? 0;
      if (prevY !== null && Math.abs(prevY - y) > 1) {
        if (lineText.trim()) lines.push(lineText.trim());
        lineText = item.str;
      } else {
        lineText += item.str;
      }
      prevY = y;
    }
    if (lineText.trim()) lines.push(lineText.trim());
    pages.push(lines.join('\n'));
  }

  return pages.join('\n\n');
}

// ── DOCX text extraction ──────────────────────────────────────────────────────
async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

// ── Field detection regexes ───────────────────────────────────────────────────
const RE_EMAIL    = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/;
const RE_PHONE    = /\+?[\d\s\-().]{7,20}/;
const RE_LINKEDIN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i;
const RE_PORTFOLIO= /https?:\/\/(?!(?:www\.)?linkedin|(?:www\.)?github)[\w.-]+\.[a-zA-Z]{2,}[^\s]*/i;
const RE_GITHUB   = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i;

const RE_EMAIL_INLINE = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/;
const RE_URL_INLINE   = /https?:\/\/|www\.|linkedin|github/i;
const RE_PHONE_INLINE = /^\+?[\d\s\-().]{7,20}$/;

function ensureHttps(url: string): string {
  return url.startsWith('http') ? url : 'https://' + url;
}

// ── Section splitting ─────────────────────────────────────────────────────────
const SECTION_HEADERS = [
  'WORK EXPERIENCE', 'EXPERIENCE',
  'ACADEMIC BACKGROUND', 'EDUCATION',
  'TECHNICAL SKILLS', 'CORE SKILLS', 'SKILLS',
  'CERTIFICATIONS', 'CERTIFICATES',
  'PROFESSIONAL SUMMARY', 'SUMMARY', 'PROFILE',
  'SIDE PROJECTS', 'PROJECTS',
  'LANGUAGES', 'AWARDS', 'PUBLICATIONS',
  'VOLUNTEERING', 'REFERENCES',
];

interface ResumeSection {
  name:    string;
  content: string;
}

function splitIntoSections(rawText: string): ResumeSection[] {
  const regex = new RegExp(
    `^(${SECTION_HEADERS.join('|')}):?\\s*$`,
    'gim',
  );

  const matches: Array<{ index: number; name: string; headerLen: number }> = [];
  let m;
  while ((m = regex.exec(rawText)) !== null) {
    matches.push({
      index:     m.index,
      name:      m[1].trim().toUpperCase(),
      headerLen: m[0].length,
    });
  }

  const sections: ResumeSection[] = [];

  // Everything before the first header → HEADER section (name/contact block)
  const firstIdx = matches.length > 0 ? matches[0].index : rawText.length;
  const headerContent = rawText.slice(0, firstIdx).trim();
  if (headerContent) sections.push({ name: 'HEADER', content: headerContent });

  for (let i = 0; i < matches.length; i++) {
    const contentStart = matches[i].index + matches[i].headerLen;
    const contentEnd   = i + 1 < matches.length ? matches[i + 1].index : rawText.length;
    const content      = rawText.slice(contentStart, contentEnd).trim();
    sections.push({ name: matches[i].name, content });
  }

  // Fallback: no section headers found → treat all text as HEADER
  if (sections.length === 0) sections.push({ name: 'HEADER', content: rawText });

  return sections;
}

// ── Date-boundary chunk splitting ─────────────────────────────────────────────
const DATE_LINE_RE =
  /^.{0,60}(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4}).{0,20}(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4}|Present)/i;

function splitByDateBoundary(content: string, minLength: number): string[] {
  const lines  = content.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (current.length > 0 && DATE_LINE_RE.test(line)) {
      const chunk = current.join('\n').trim();
      if (chunk.length >= minLength) chunks.push(chunk);
      current = [line];
    } else {
      current.push(line);
    }
  }

  const last = current.join('\n').trim();
  if (last.length >= minLength) chunks.push(last);

  return chunks;
}

// ── Field detection (runs against HEADER section only) ────────────────────────
function detectFieldsFromText(text: string): DetectedField[] {
  const detected: DetectedField[] = [];

  const emailMatch = text.match(RE_EMAIL);
  if (emailMatch) {
    detected.push({ fieldPath: 'personal.email', value: emailMatch[0], label: 'Email', confidence: 'high' });
  }

  const phoneMatch = text.match(RE_PHONE);
  if (phoneMatch) {
    const raw    = phoneMatch[0];
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 7) {
      if (raw.trim().startsWith('+')) {
        const ccMatch = raw.match(/^\+(\d{1,3})/);
        if (ccMatch) {
          detected.push({ fieldPath: 'personal.phone.callingCode', value: '+' + ccMatch[1], label: 'Phone Calling Code', confidence: 'high' });
          detected.push({ fieldPath: 'personal.phone.number', value: digits.slice(ccMatch[1].length), label: 'Phone Number', confidence: 'high' });
        } else {
          detected.push({ fieldPath: 'personal.phone.number', value: digits, label: 'Phone Number', confidence: 'high' });
        }
      } else {
        detected.push({ fieldPath: 'personal.phone.number', value: digits, label: 'Phone Number', confidence: 'high' });
      }
    }
  }

  const linkedinMatch = text.match(RE_LINKEDIN);
  if (linkedinMatch) {
    detected.push({ fieldPath: 'links.linkedin', value: ensureHttps(linkedinMatch[0]), label: 'LinkedIn URL', confidence: 'high' });
  }

  const portfolioMatch = text.match(RE_PORTFOLIO);
  if (portfolioMatch) {
    detected.push({ fieldPath: 'links.portfolio', value: portfolioMatch[0], label: 'Portfolio URL', confidence: 'high' });
  }

  const githubMatch = text.match(RE_GITHUB);
  if (githubMatch) {
    detected.push({ fieldPath: 'links.github', value: ensureHttps(githubMatch[0]), label: 'GitHub URL', confidence: 'high' });
  }

  // Name — first 5 non-empty lines with stricter filters (FIX 1)
  const nameCandidates = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5)
    .filter((line) => {
      if (RE_EMAIL_INLINE.test(line)) return false;
      if (RE_URL_INLINE.test(line))   return false;
      if (RE_PHONE_INLINE.test(line)) return false;
      // Skip section headers (all uppercase with at least one letter)
      if (line === line.toUpperCase() && /[A-Z]/.test(line)) return false;
      if (line.length < 2) return false;
      return true;
    });

  if (nameCandidates.length > 0) {
    const cleanLine = (nameCandidates[0] ?? '').replace(/\(.*?\)/g, '').trim();
    const parts = cleanLine.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      detected.push({ fieldPath: 'personal.firstName', value: parts[0]!,               label: 'First Name', confidence: 'medium' });
      detected.push({ fieldPath: 'personal.lastName',  value: parts[parts.length - 1]!, label: 'Last Name',  confidence: 'medium' });
    } else if (parts.length === 1) {
      detected.push({ fieldPath: 'personal.firstName', value: parts[0]!, label: 'First Name', confidence: 'medium' });
    }
  }

  return detected;
}

// ── Section → TextChunks ──────────────────────────────────────────────────────
function sectionToTexts(section: ResumeSection): string[] {
  const { name, content } = section;

  if (name === 'HEADER') {
    return content.length >= 20 ? [content] : [];
  }

  if (
    name === 'EXPERIENCE' || name === 'WORK EXPERIENCE' ||
    name === 'EDUCATION'  || name === 'ACADEMIC BACKGROUND'
  ) {
    return splitByDateBoundary(content, 30);
  }

  if (name === 'SKILLS' || name === 'TECHNICAL SKILLS' || name === 'CORE SKILLS') {
    return content.length >= 20 ? [content] : [];
  }

  if (name === 'CERTIFICATIONS' || name === 'CERTIFICATES') {
    return content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length >= 10);
  }

  if (name === 'SUMMARY' || name === 'PROFESSIONAL SUMMARY' || name === 'PROFILE') {
    return content.length >= 20 ? [content] : [];
  }

  // All other sections — blank-line split
  return content
    .split(/\n\s*\n+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 20);
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function extractFromFile(file: File): Promise<ExtractedResume> {
  try {
    const buffer   = await file.arrayBuffer();
    const fileName = file.name.toLowerCase();

    let rawText: string;
    if (fileName.endsWith('.pdf')) {
      rawText = await extractPdfText(buffer);
    } else if (fileName.endsWith('.docx')) {
      rawText = await extractDocxText(buffer);
    } else {
      throw new Error('Unsupported file type');
    }

    // Split into named sections
    const sections = splitIntoSections(rawText);

    // Field detection: header section only
    const headerSection = sections.find((s) => s.name === 'HEADER');
    const detected: DetectedField[] = detectFieldsFromText(headerSection?.content ?? rawText);

    // Summary auto-detect: treat SUMMARY section as a DetectedField too
    const summarySection = sections.find(
      (s) => s.name === 'SUMMARY' || s.name === 'PROFESSIONAL SUMMARY' || s.name === 'PROFILE',
    );
    if (summarySection) {
      const st = summarySection.content.trim();
      if (st.length >= 50 && st.length <= 2000) {
        detected.push({
          fieldPath:  'professional.summary',
          value:      st,
          label:      'Professional Summary',
          confidence: 'medium',
        });
      }
    }

    const detectedValues = new Set(detected.map((f) => f.value.toLowerCase().trim()));

    // Build text chunks from every section (excluding HEADER)
    const textChunks: TextChunk[] = [];
    let idx = 0;

    for (const section of sections) {
      if (section.name === 'HEADER') continue; // contact info is in detected fields
      const texts = sectionToTexts(section).filter(
        (t) => !detectedValues.has(t.toLowerCase()),
      );
      for (const text of texts) {
        textChunks.push({
          id:           `chunk-${idx++}`,
          text,
          used:         false,
          sectionLabel: section.name,
        });
      }
    }

    const result: ExtractedResume = { rawText, detectedFields: detected, textChunks };
    return result;
  } catch (err) {
    console.error('Extraction failed:', err);
    throw err;
  }
}
