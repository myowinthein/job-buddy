export { KEY_ERROR_MESSAGES } from '../resume-ai/keyErrors';
import { devContext } from '../devtools/context';
import type * as Gemini from '@/src/resume-ai/gemini';

const message = 'Gemini is disabled in the sample-data preview.';

export const checkApiKey: typeof Gemini.checkApiKey = async (...args) =>
  devContext() ? (await import('../resume-ai/gemini')).checkApiKey(...args) : 'network_error';
export const validateApiKey: typeof Gemini.validateApiKey = async (...args) =>
  devContext()
    ? (await import('../resume-ai/gemini')).validateApiKey(...args)
    : {
        valid: false,
        error: message,
      };
export const extractFromResume: typeof Gemini.extractFromResume = async (...args) => {
  if (devContext()) return (await import('../resume-ai/gemini')).extractFromResume(...args);
  throw { code: 'network', message };
};
export const resolveFieldsWithAI: typeof Gemini.resolveFieldsWithAI = async (...args) => {
  if (devContext()) return (await import('../resume-ai/gemini')).resolveFieldsWithAI(...args);
  throw new Error(message);
};
export const reviewMappingsWithAI: typeof Gemini.reviewMappingsWithAI = async (...args) => {
  if (devContext()) return (await import('../resume-ai/gemini')).reviewMappingsWithAI(...args);
  throw new Error(message);
};
