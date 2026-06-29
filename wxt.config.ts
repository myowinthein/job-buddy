import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Job Buddy - Autofill Job Applications',
    description: 'Automatically fill job application forms using your saved profile data.',
    permissions: ['storage', 'identity', 'activeTab'],
    host_permissions: [
      'https://generativelanguage.googleapis.com/*',
      'https://www.googleapis.com/*',
      'https://oauth2.googleapis.com/*',
    ],
  },
});
