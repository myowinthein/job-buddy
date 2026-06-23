import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Job Buddy',
    description: 'Automatically fill job application forms using your saved profile data.',
    permissions: ['storage', 'tabs'],
    host_permissions: ['https://generativelanguage.googleapis.com/*'],
  },
});
