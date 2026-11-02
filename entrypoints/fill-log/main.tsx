// Preserve old links without maintaining a second options interface.
const target = new URL(chrome.runtime.getURL('options.html'));
target.searchParams.set('section', 'fillDetails');
target.searchParams.set('tabId', new URLSearchParams(location.search).get('tabId') ?? '');
location.replace(target.href);
