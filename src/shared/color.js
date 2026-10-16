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
  // Move toward whichever of black or white stands out more on this background.
  const target = contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? [0, 0, 0] : [255, 255, 255];
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

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const INK = [20, 22, 27];
const blend = (a, b, t) => toHex(a.map((v, i) => v + (b[i] - v) * t));
const passes = (fg, bgs, min) => bgs.every((bg) => contrast(fg, bg) >= min);

/** `color` moved toward `target` just far enough to reach `min` on every background. */
function reach(color, target, bgs, min) {
  const rgb = parseHex(color);
  for (let t = 0; t <= 1; t += 0.02) {
    const c = blend(rgb, target, t);
    if (passes(c, bgs, min)) return c;
  }
  return toHex(target);
}

/** The most faded mix of `text` into `bg` that still reaches `min` on every background. */
function fade(text, bg, bgs, min, from) {
  const [a, b] = [parseHex(text), parseHex(bg)];
  for (let t = from; t > 0; t -= 0.02) {
    const c = blend(a, b, t);
    if (passes(c, bgs, min)) return c;
  }
  return text;
}

/**
 * Every surface token for a widget drawn on any background colour. The
 * background is kept when text can reach 7:1 on it, otherwise it moves just
 * far enough toward white or black. Then text and muted text pass 4.5:1,
 * control borders 3:1 and error text 4.5:1 on every surface they sit on.
 */
export function paletteFrom(color) {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const darkText = contrast(toHex(rgb), '#14161b') >= contrast(toHex(rgb), '#ffffff');
  const ink = darkText ? INK : WHITE;
  let bg, surface, text;
  for (let t = 0; t <= 1.001; t += 0.02) {
    const base = parseHex(blend(rgb, darkText ? WHITE : BLACK, Math.min(t, 1)));
    bg = toHex(base);
    surface = blend(base, ink, darkText ? 0.04 : 0.06);
    text = blend(ink, base, 0.06); // a hint of the background's hue
    if (passes(text, [bg, surface], 7)) break;
  }
  const dangerBase = darkText ? '#b42318' : '#ff9e92';
  const dangerBg = blend(parseHex(bg), parseHex(dangerBase), darkText ? 0.08 : 0.14);
  return {
    theme: darkText ? 'light' : 'dark',
    tokens: {
      '--bw-bg': bg,
      '--bw-surface': surface,
      '--bw-text': text,
      '--bw-muted': fade(text, bg, [bg, surface], 4.6, 0.6),
      '--bw-line': blend(parseHex(text), parseHex(bg), 0.85),
      '--bw-control': fade(text, bg, [bg, surface], 3.1, 0.8),
      '--bw-danger': reach(dangerBase, ink, [bg, surface, dangerBg], 4.6),
      '--bw-danger-bg': dangerBg,
    },
  };
}
