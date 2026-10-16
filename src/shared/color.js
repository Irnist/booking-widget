// WCAG contrast helpers, so any brand colour a site owner picks stays readable.

export function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

export function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(parseHex(a)), luminance(parseHex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `bg`. */
export function textOn(bg) {
  return contrast(bg, '#ffffff') >= contrast(bg, '#14161b') ? '#ffffff' : '#14161b';
}

/**
 * The accent, darkened or lightened just enough to reach `min` contrast
 * against `bg`, for links, focus rings and selected outlines.
 */
export function inkOn(accent, bg, min = 4.5) {
  const rgb = parseHex(accent);
  if (!rgb) return null;
  if (contrast(accent, bg) >= min) return toHex(rgb);
  const target = luminance(parseHex(bg)) > 0.4 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0.05; t <= 1; t += 0.05) {
    const mixed = toHex(rgb.map((v, i) => v + (target[i] - v) * t));
    if (contrast(mixed, bg) >= min) return mixed;
  }
  return toHex(target);
}

/**
 * A fill colour for buttons and selected chips: the accent itself when white
 * or dark text reaches 4.5:1 on it, otherwise the closest shade that does.
 */
export function fillFrom(accent) {
  const rgb = parseHex(accent);
  if (!rgb) return null;
  const hex = toHex(rgb);
  if (Math.max(contrast(hex, '#ffffff'), contrast(hex, '#14161b')) >= 4.5) return hex;
  return inkOn(hex, '#ffffff', 4.5);
}
