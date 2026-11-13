/** Tint the existing surface instead of making an opaque input translucent. */
export const FIELD_TINT_OPACITY = 0.12;
const COLORS = {
  green: [34, 197, 94],
  yellow: [234, 179, 8],
  red: [239, 68, 68],
  gray: [107, 114, 128],
} as const;
export type FieldTint = keyof typeof COLORS;

export function backgroundTint(background: string, tint: FieldTint): string {
  const color = COLORS[tint];
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(
    background,
  );
  const alpha = rgb ? Number(rgb[4] ?? 1) : 0;
  if (!rgb && background && background !== 'transparent') {
    // Preserve browser-supported color spaces such as display-p3 or oklch too.
    return `color-mix(in srgb, ${background} ${(1 - FIELD_TINT_OPACITY) * 100}%, rgb(${color.join(', ')}) ${FIELD_TINT_OPACITY * 100}%)`;
  }
  const mixedAlpha = FIELD_TINT_OPACITY + alpha * (1 - FIELD_TINT_OPACITY);
  const mixed = color.map((channel, i) =>
    Math.round(
      (channel * FIELD_TINT_OPACITY +
        Number(rgb?.[i + 1] ?? 0) * alpha * (1 - FIELD_TINT_OPACITY)) /
        mixedAlpha,
    ),
  );
  return mixedAlpha === 1
    ? `rgb(${mixed.join(', ')})`
    : `rgba(${mixed.join(', ')}, ${Number(mixedAlpha.toFixed(4))})`;
}
