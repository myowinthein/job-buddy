/** Keep validation attached to the same entries after removal or clearing the last row. */
export function removeEntryErrors(errors: Record<string, string>, index: number, prefix = '') {
  return Object.fromEntries(
    Object.entries(errors).flatMap(([key, value]) => {
      if (key === 'general') return [];
      if (!key.startsWith(prefix)) return [[key, value]];
      const match = /^(\d+)\.(.+)$/.exec(key.slice(prefix.length));
      if (!match) return [[key, value]];
      const row = Number(match[1]);
      if (row === index) return [];
      return [[`${prefix}${row > index ? row - 1 : row}.${match[2]}`, value]];
    }),
  );
}
