import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast, fillFrom, inkOn, paletteFrom, textOn } from '../../src/shared/color.js';

test('any accent becomes a readable fill, ink and button text', () => {
  const accents = ['#0f766e', '#facc15', '#ffffff', '#000000', '#ff5a5f', '#22d3ee', '#7c3aed', '#a3e635', '#888888'];
  for (const accent of accents) {
    const fill = fillFrom(accent);
    assert.ok(contrast(fill, textOn(fill)) >= 4.5, `${accent}: button text on ${fill}`);
    for (const bg of ['#ffffff', '#17191e']) {
      assert.ok(contrast(inkOn(accent, bg), bg) >= 4.5, `${accent}: ink on ${bg}`);
    }
  }
});

test('theme tokens meet WCAG contrast on every surface they appear on', () => {
  const css = readFileSync(new URL('../../src/widget/styles.js', import.meta.url), 'utf8');
  const block = (selector) => {
    const body = css.slice(css.indexOf(selector)).match(/\{([^}]*)\}/)[1];
    return Object.fromEntries([...body.matchAll(/--bw-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
  };
  const light = block('.bw, .bw-launch, .bw-dialog {');
  const dark = { ...light, ...block('.bw[data-theme="dark"]') };
  for (const [name, t] of [['light', light], ['dark', dark]]) {
    for (const surface of [t.bg, t.surface]) {
      assert.ok(contrast(t.text, surface) >= 4.5, `${name}: text on ${surface}`);
      assert.ok(contrast(t.muted, surface) >= 4.5, `${name}: muted text on ${surface}`);
      assert.ok(contrast(t.control, surface) >= 3, `${name}: control borders on ${surface}`);
    }
    assert.ok(contrast(t.danger, t.bg) >= 4.5, `${name}: error text`);
    assert.ok(contrast(t.danger, t['danger-bg']) >= 4.5, `${name}: alert text`);
  }
});

test('any background colour becomes a readable palette', () => {
  const backgrounds = ['#ffffff', '#000000', '#f3ede2', '#221d13', '#1e3a8a', '#b91c1c', '#facc15', '#7dd3fc',
    '#777777', '#808080', '#959595', '#ff00ff', '#00ff00', '#0f766e', '#fec726', '#1c1c1d', '#c0c0c0', '#4b5563'];
  for (const background of backgrounds) {
    const { theme, tokens: t } = paletteFrom(background);
    const at = (k) => t[`--bw-${k}`];
    for (const surface of [at('bg'), at('surface')]) {
      assert.ok(contrast(at('text'), surface) >= 7, `${background}: text on ${surface}`);
      assert.ok(contrast(at('muted'), surface) >= 4.5, `${background}: muted text on ${surface}`);
      assert.ok(contrast(at('control'), surface) >= 3, `${background}: control borders on ${surface}`);
      assert.ok(contrast(at('danger'), surface) >= 4.5, `${background}: error text on ${surface}`);
    }
    assert.ok(contrast(at('danger'), at('danger-bg')) >= 4.5, `${background}: alert text`);
    assert.equal(theme, textOn(at('bg')) === '#ffffff' ? 'dark' : 'light', `${background}: base theme`);
    for (const accent of ['#0f766e', '#facc15', '#fec726', '#b91c1c', '#7dd3fc']) {
      const ink = inkOn(accent, at('surface'));
      assert.ok(contrast(ink, at('surface')) >= 4.5 && contrast(ink, at('bg')) >= 4.5, `${background}: ${accent} ink`);
    }
  }
  // A background that already reads well is used exactly as given.
  for (const kept of ['#f3ede2', '#221d13', '#ffffff', '#1c1c1d']) assert.equal(paletteFrom(kept).tokens['--bw-bg'], kept);
  assert.equal(paletteFrom('nope'), null);
});

test('the widget never uses CSS transitions or keyframes (motion runs in JS)', () => {
  const css = readFileSync(new URL('../../src/widget/styles.js', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\btransition\s*:|\banimation\s*:|@keyframes/);
});
