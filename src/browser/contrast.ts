/** Measure flat UI surfaces from rendered colors, including translucent backgrounds. */
export function controlContrast(element: Element) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d')!;
  const rgba = (color: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const values = [...context.getImageData(0, 0, 1, 1).data];
    return [values[0], values[1], values[2], values[3] / 255];
  };
  const blend = (color: number[], background: number[]) =>
    color.slice(0, 3).map((value, i) => value * color[3] + background[i] * (1 - color[3]));
  const background = (target: Element | null) => {
    const ancestors: Element[] = [];
    for (let node = target; node; node = node.parentElement) ancestors.push(node);
    return ancestors.reverse().reduce((color, node) =>
      blend(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255]);
  };
  const luminance = (color: number[]) => color.map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((total, value, i) => total + value * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: number[], b: number[]) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (values[1] + 0.05) / (values[0] + 0.05);
  };
  const style = getComputedStyle(element);
  const surface = background(element);
  const outside = background(element.parentElement);
  const border = blend(rgba(style.borderTopColor), outside);
  const other = element.parentElement?.querySelector('[aria-pressed="false"]');
  return {
    text: ratio(blend(rgba(style.color), surface), surface),
    borderInside: ratio(border, surface),
    borderOutside: ratio(border, outside),
    borderWidth: parseFloat(style.borderTopWidth),
    fill: other ? ratio(surface, background(other)) : null,
  };
}
