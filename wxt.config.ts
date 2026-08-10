import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ mode }) => ({
    name: mode === 'development'
      ? 'Job Buddy - Autofill Job Applications (Dev)'
      : 'Job Buddy - Autofill Job Applications',
    description: 'Fill job application forms in one click using your saved profile. Works across any site, no account required.',
    permissions: ['storage', 'identity', 'activeTab', 'webNavigation', 'scripting'],
    host_permissions: [
      'https://generativelanguage.googleapis.com/*',
      'https://www.googleapis.com/*',
      'https://oauth2.googleapis.com/*',
    ],
    // Amber icon set for the dev build, so chrome://extensions and the
    // toolbar icon are distinguishable from a Chrome Web Store install at a
    // glance — not just the in-app logo. Omitted for production so WXT's
    // normal public/icon/*.png auto-discovery applies unchanged.
    ...(mode === 'development' ? {
      icons: {
        16: 'icon-dev/16.png',
        32: 'icon-dev/32.png',
        48: 'icon-dev/48.png',
        96: 'icon-dev/96.png',
        128: 'icon-dev/128.png',
      },
    } : {}),
  }),
});
