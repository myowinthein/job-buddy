import type * as Gemini from '@/src/resume-ai/gemini';

const message = 'Gemini is disabled in the sample-data preview.';

export const checkApiKey: typeof Gemini.checkApiKey = async () => 'network_error';
export const validateApiKey: typeof Gemini.validateApiKey = async () => ({
  valid: false,
  error: message,
});
export const extractFromResume: typeof Gemini.extractFromResume = async () => {
  throw { code: 'network', message };
};
export const resolveFieldsWithAI: typeof Gemini.resolveFieldsWithAI = async () => {
  throw new Error(message);
};
