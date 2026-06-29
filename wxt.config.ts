import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Job Buddy - Autofill Job Applications',
    description: 'Fill job application forms in one click using your saved profile. Works across any site, no account required.',
    permissions: ['storage', 'identity', 'activeTab'],
    host_permissions: [
      'https://generativelanguage.googleapis.com/*',
      'https://www.googleapis.com/*',
      'https://oauth2.googleapis.com/*',
    ],
  },
});
