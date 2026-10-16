// The demo page's "Make it yours" panel: every control changes the live
// widget and the embed code below it.
(() => {
  const form = document.getElementById('builder');
  const mount = document.getElementById('mount');
  const site = document.getElementById('site');
  const snippet = document.getElementById('snippet');
  const picker = document.getElementById('accent-picker');
  const hex = document.getElementById('accent-hex');
  const hexError = document.getElementById('accent-hex-error');
  const note = document.getElementById('contrast-note');
  const presets = [...form.querySelectorAll('input[name="accent"]')];
  const status = document.getElementById('copy-status');
  const origin = location.origin;
  const DEFAULTS = { mode: 'booking', display: 'inline', accent: '#0f766e', theme: 'light' };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // The colour lives in `accent`; the presets, the picker and the hex field all follow it.
  let accent = DEFAULTS.accent;
  const current = () => {
    const data = new FormData(form);
    return { mode: data.get('mode'), display: data.get('display'), accent, theme: data.get('theme') };
  };

  /** "#ABC", "abc" or "#aabbcc" → "#aabbcc"; anything else → null. */
  function normalHex(value) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
    if (!m) return null;
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return `#${h.toLowerCase()}`;
  }

  function setAccent(value, from) {
    accent = value;
    if (from !== 'picker') picker.value = value;
    if (from !== 'hex') hex.value = value;
    for (const p of presets) p.checked = p.value === value;
    showHexError('');
    update();
  }

  function showHexError(message) {
    hexError.textContent = message;
    hexError.hidden = !message;
    if (message) hex.setAttribute('aria-invalid', 'true');
    else hex.removeAttribute('aria-invalid');
  }

  // Reads back what the widget chose, so the note matches the buttons on screen.
  function describeContrast() {
    const el = mount.querySelector('booking-widget')?.shadowRoot?.querySelector('.bw, .bw-launch');
    const fill = el?.style.getPropertyValue('--bw-fill');
    const onFill = el?.style.getPropertyValue('--bw-on-fill');
    if (!fill || !onFill) return;
    const text = onFill === '#ffffff' ? 'white' : 'dark';
    note.textContent = fill === accent
      ? `Buttons get ${text} text on this colour, and links are darkened where needed to pass 4.5:1 contrast.`
      : `Neither white nor dark text is readable on ${accent}, so buttons use ${fill} with ${text} text instead.`;
  }

  // Only attributes that differ from the defaults go into the snippet.
  const attrsFor = (o) => Object.entries(o).filter(([k, v]) => v !== DEFAULTS[k]);

  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function code(o) {
    const attrs = attrsFor(o).map(([k, v]) => ` <span class="tok-attr">${k}</span>=<span class="tok-str">"${esc(v)}"</span>`).join('');
    return `<span class="tok-tag">&lt;script</span> <span class="tok-attr">src</span>=<span class="tok-str">"${origin}/widget.js"</span> <span class="tok-attr">defer</span><span class="tok-tag">&gt;&lt;/script&gt;</span>\n`
      + `<span class="tok-tag">&lt;booking-widget</span> <span class="tok-attr">site</span>=<span class="tok-str">"demo"</span>${attrs}<span class="tok-tag">&gt;&lt;/booking-widget&gt;</span>`;
  }
  const plain = () => snippet.textContent;

  let last = current();
  function update() {
    const o = current();
    let widget = mount.querySelector('booking-widget');
    // A new display or mode starts the widget fresh; colour and theme change in place.
    if (o.display !== last.display || o.mode !== last.mode) {
      mount.innerHTML = '<booking-widget site="demo"></booking-widget>';
      widget = mount.firstElementChild;
    }
    for (const [k, v] of Object.entries(o)) widget.setAttribute(k, v);
    site.dataset.theme = o.theme;
    snippet.innerHTML = code(o);
    if (o.display !== last.display && !reduce.matches && widget.animate) {
      widget.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    last = o;
    describeContrast();
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'accent') setAccent(e.target.value, 'preset');
    else if (e.target !== hex && e.target !== picker) update();
  });
  picker.addEventListener('input', () => setAccent(picker.value, 'picker'));
  // Apply the hex as soon as it's complete; only complain once the visitor leaves the field.
  hex.addEventListener('input', () => {
    const value = normalHex(hex.value);
    if (value && hex.value.replace('#', '').length >= 6) setAccent(value, 'hex');
  });
  hex.addEventListener('change', () => {
    const value = normalHex(hex.value);
    if (value) setAccent(value, 'blur');
    else showHexError('Use a hex code like #e4572e (3 or 6 digits, 0–9 and a–f).');
  });
  hex.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); hex.dispatchEvent(new Event('change', { bubbles: true })); }
  });

  document.getElementById('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(plain());
      status.textContent = 'Copied the embed code.';
    } catch {
      status.textContent = 'Copy didn’t work here; select the code and copy it by hand.';
    }
  });

  update();
})();
