/** WXT 0.20's generated worker duplicates our offline startup registration.
 * Keep its tab reload, but route both registration paths through one upsert. */
export function transformWxtBackground(code: string, id: string): string | undefined {
  if (!id.startsWith('\0virtual:wxt-background-entrypoint?')) return;
  const registration =
    /async function reloadManifestContentScriptMv3\(contentScript\) \{[\s\S]*?\n\}(?=\nasync function reloadRuntimeContentScriptMv3)/;
  if (!registration.test(code)) throw new Error('WXT development registration template changed');
  return (
    "import { registerDevelopmentContentScript as jbRegisterContentScript } from '@/src/devtools/registerContentScript';\n" +
    code
      .replace(
        registration,
        `async function reloadManifestContentScriptMv3(contentScript) {
  await jbRegisterContentScript({
    ...contentScript,
    id: \`wxt:\${contentScript.js[0]}\`,
    css: contentScript.css ?? [],
  });
  await reloadTabsForContentScript(contentScript);
}`,
      )
      // Chrome omits commands when none are declared, even though WXT adds
      // this listener with reloadCommand disabled.
      .replace(/browser\.commands\.onCommand\.addListener\(\(command\) => \{[\s\S]*?\n\s*\}\);/, '')
  );
}
