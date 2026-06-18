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

// ── Regex patterns ────────────────────────────────────────────────────────────
const RE_EMAIL    = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/;
const RE_PHONE    = /\+?[\d\s\-().]{7,20}/;
const RE_LINKEDIN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i;
const RE_PORTFOLIO= /https?:\/\/(?!(?:www\.)?linkedin|(?:www\.)?github)[\w.-]+\.[a-zA-Z]{2,}[^\s]*/i;
const RE_GITHUB   = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/i;

const RE_HEADER      = /^(Summary|Experience|Education|Skills|Profile|Objective|Contact|References|Work\s+History|Technical\s+Skills|Certifications|Projects)/i;
const RE_EMAIL_LINE  = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/;
const RE_URL_LINE    = /https?:\/\/|www\.|linkedin|github/i;
const RE_PHONE_LINE  = /^\+?[\d\s\-().]{7,20}$/;

function ensureHttps(url: string): string {
  return url.startsWith('http') ? url : 'https://' + url;
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

    const detected: DetectedField[] = [];

    // Email
    const emailMatch = rawText.match(RE_EMAIL);
    if (emailMatch) {
      detected.push({ fieldPath: 'personal.email', value: emailMatch[0], label: 'Email', confidence: 'high' });
    }

    // Phone — clean digits, optionally extract calling code
    const phoneMatch = rawText.match(RE_PHONE);
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

    // LinkedIn
    const linkedinMatch = rawText.match(RE_LINKEDIN);
    if (linkedinMatch) {
      detected.push({ fieldPath: 'links.linkedin', value: ensureHttps(linkedinMatch[0]), label: 'LinkedIn URL', confidence: 'high' });
    }

    // Portfolio
    const portfolioMatch = rawText.match(RE_PORTFOLIO);
    if (portfolioMatch) {
      detected.push({ fieldPath: 'links.portfolio', value: portfolioMatch[0], label: 'Portfolio URL', confidence: 'high' });
    }

    // GitHub (stored only — not shown in UI)
    const githubMatch = rawText.match(RE_GITHUB);
    if (githubMatch) {
      detected.push({ fieldPath: 'links.github', value: ensureHttps(githubMatch[0]), label: 'GitHub URL', confidence: 'high' });
    }

    // Name — inspect first 5 non-empty lines
    const nameCandidates = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 5)
      .filter(
        (line) =>
          !RE_EMAIL_LINE.test(line) &&
          !RE_URL_LINE.test(line) &&
          !RE_PHONE_LINE.test(line) &&
          !RE_HEADER.test(line) &&
          line.length < 80,
      );

    if (nameCandidates.length > 0) {
      const words = (nameCandidates[0] ?? '').split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        detected.push({ fieldPath: 'personal.firstName', value: words[0]!,               label: 'First Name', confidence: 'medium' });
        detected.push({ fieldPath: 'personal.lastName',  value: words[words.length - 1]!, label: 'Last Name',  confidence: 'medium' });
      } else if (words.length === 1) {
        detected.push({ fieldPath: 'personal.firstName', value: words[0]!, label: 'First Name', confidence: 'medium' });
      }
    }

    // Chunks — split on blank lines, discard short/exact-match sections
    const detectedValues = new Set(detected.map((f) => f.value.toLowerCase().trim()));

    const textChunks: TextChunk[] = rawText
      .split(/\n\s*\n+/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length >= 20)
      .filter((chunk) => !detectedValues.has(chunk.toLowerCase()))
      .map((text, idx): TextChunk => ({ id: `chunk-${idx}`, text, used: false }));

    return { rawText, detectedFields: detected, textChunks };
  } catch (err) {
    console.error('Extraction failed:', err);
    throw err;
  }
}
