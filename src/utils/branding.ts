// Amber in the dev build vs. the production blue, so the in-app logo (popup
// header, options sidebar) is visually distinct from a Chrome Web Store
// install when both are loaded side by side — without a loud toolbar badge.
export const LOGO_ICON_SRC = import.meta.env.DEV ? '/icon-dev.svg' : '/icon.svg';
