import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Use one loopback address for Chrome and the dev server. Resolving localhost
  // to IPv6 alone can leave Chrome's IPv4 connection refused.
  dev: { reloadCommand: false, server: { host: '127.0.0.1', origin: 'http://127.0.0.1' } },
  vite: () => ({
    plugins: [{
      name: 'job-buddy-disabled-dev-command',
      enforce: 'pre',
      transform(code, id) {
        // WXT 0.20.26 attaches this listener even with reloadCommand disabled.
        // Chrome omits the commands API when no commands are declared.
        if (!id.startsWith('\0virtual:wxt-background-entrypoint?')) return;
        return code.replace(/browser\.commands\.onCommand\.addListener\(\(command\) => \{[\s\S]*?\n\s*\}\);/, '');
      },
    }],
  }),
  manifest: ({ mode }) => ({
    name: 'Job Buddy: Autofill Job Applications',
    description: 'Fill job application forms with AI assistance using your saved profile. Works across supported job sites.',
    permissions: ['storage', 'identity', 'activeTab', 'webNavigation', 'scripting', 'alarms'],
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
