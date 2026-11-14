export const KEY_ERROR_MESSAGES = {
  invalid: 'Invalid API key. Check your key and try again.',
  permission_denied: 'This key cannot access Gemini. Check its permissions in Google AI Studio.',
  rate_limit: 'Gemini quota reached. Try again later.',
  service_error: 'Gemini is unavailable right now. Try again later.',
  network_error: 'Could not reach Gemini. Check your connection and try again.',
  timeout: 'Gemini took too long to respond. Try again.',
  cancelled: 'Key check cancelled.',
  no_model: 'This key cannot use a supported model. Check access in Google AI Studio.',
} as const;
