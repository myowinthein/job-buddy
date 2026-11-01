import { feedback } from '@/src/ui/feedback';
import type { ResumeDocumentType } from './types';

/** Provider metadata is never part of the profile or backup schemas. */
export function resumeDocumentType(raw: unknown): ResumeDocumentType {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw {
      code: 'parse',
      message: feedback.resumeInvalidData,
    };
  const type = (raw as Record<string, unknown>).documentType;
  if (type === 'other')
    throw {
      code: 'not_resume',
      message: feedback.resumeNotResume,
    };
  if (type === 'resume' || type === 'uncertain') return type;
  // Missing assessment is not evidence that the document is a resume.
  if (type == null) return 'uncertain';
  throw {
    code: 'parse',
    message: feedback.resumeAssessmentFailed,
  };
}
