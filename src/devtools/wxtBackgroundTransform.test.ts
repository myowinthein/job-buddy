import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { transformWxtBackground } from './wxtBackgroundTransform';

const source = readFileSync('node_modules/wxt/dist/virtual/background-entrypoint.mjs', 'utf8');
const id = '\0virtual:wxt-background-entrypoint?test';

it('routes the installed WXT template through the race-safe helper before reloading tabs', async () => {
  const transformed = transformWxtBackground(source, id)!;
  expect(transformed).not.toContain('browser.commands.onCommand.addListener');
  const fn = transformed.match(
    /async function reloadManifestContentScriptMv3\(contentScript\) \{[\s\S]*?\n\}(?=\nasync function reloadRuntimeContentScriptMv3)/,
  )![0];
  expect(fn).not.toContain('browser.scripting.registerContentScripts');
  const order: string[] = [];
  const register = vi.fn(async () => {
    order.push('register');
  });
  const reload = vi.fn(async () => {
    order.push('reload');
  });
  const run = new Function(
    'jbRegisterContentScript',
    'reloadTabsForContentScript',
    `return (${fn})`,
  )(register, reload);
  const script = {
    js: ['content-scripts/content.js'],
    matches: ['*://*/*'],
    allFrames: true,
    matchOriginAsFallback: true,
  };
  await run(script);
  expect(register).toHaveBeenCalledWith({
    ...script,
    id: 'wxt:content-scripts/content.js',
    css: [],
  });
  expect(reload).toHaveBeenCalledWith(script);
  expect(order).toEqual(['register', 'reload']);
  register.mockRejectedValueOnce(new Error('Permission denied'));
  await expect(run(script)).rejects.toThrow('Permission denied');
  expect(reload).toHaveBeenCalledTimes(1);
});

it('ignores other modules and fails visibly when the WXT template changes', () => {
  expect(transformWxtBackground(source, 'other-module')).toBeUndefined();
  expect(() => transformWxtBackground('changed template', id)).toThrow('template changed');
});
