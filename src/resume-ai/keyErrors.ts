export const KEY_ERROR_MESSAGES = {
  invalid: 'Invalid API key. Check your key and try again.',
  permission_denied: 'This key cannot access Gemini. Check its permissions in Google AI Studio.',
  rate_limit: 'Gemini quota reached. Check your usage or try again later.',
  service_error: 'Gemini is unavailable right now. Please try again.',
  network_error: 'Could not connect to Gemini. Check your internet and try again.',
  timeout: 'Gemini took too long to respond. Please try again.',
  cancelled: 'Check cancelled.',
  no_model: 'No supported model found. Check access in Google AI Studio.',
} as const;
