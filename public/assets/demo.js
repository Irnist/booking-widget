// The demo page's "Make it yours" panel: every control changes the live
// widget and the embed code below it.
(() => {
  const form = document.getElementById('builder');
  const mount = document.getElementById('mount');
  const site = document.getElementById('site');
  const snippet = document.getElementById('snippet');
  const note = document.getElementById('contrast-note');
  const bgNote = document.getElementById('bg-note');
  const themeCustom = document.getElementById('theme-custom');
  const presets = [...form.querySelectorAll('input[name="accent"]')];
  const status = document.getElementById('copy-status');
  const origin = location.origin;
  const DEFAULTS = { mode: 'booking', display: 'inline', accent: '#0f766e', theme: 'light' };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  // Each colour lives in one variable; its picker, hex field (and presets) follow it.
  let accent = DEFAULTS.accent;
  let background = document.getElementById('bg-hex').value;
  const current = () => {
    const data = new FormData(form);
    const theme = data.get('theme');
    const o = { mode: data.get('mode'), display: data.get('display'), accent };
    // A custom background replaces the theme attribute in the embed code.
    return theme === 'custom' ? { ...o, background } : { ...o, theme };
  };

  /** "#ABC", "abc" or "#aabbcc" → "#aabbcc"; anything else → null. */
  function normalHex(value) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
    if (!m) return null;
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return `#${h.toLowerCase()}`;
  }

  /**
   * A colour picker and hex field that stay in sync. The hex applies as soon
   * as it's complete; it only complains once the visitor leaves the field.
   */
  function colourControl(name, onSet) {
    const picker = document.getElementById(`${name}-picker`);
    const hex = document.getElementById(`${name}-hex`);
    const error = document.getElementById(`${name}-hex-error`);
    const showError = (message) => {
      error.textContent = message;
      error.hidden = !message;
      if (message) hex.setAttribute('aria-invalid', 'true');
      else hex.removeAttribute('aria-invalid');
    };
    const set = (value, from) => {
      if (from !== 'picker') picker.value = value;
      if (from !== 'hex') hex.value = value;
      showError('');
      onSet(value);
    };
    // Some pickers only fire change, when they close; set() is cheap, so listen to both.
    picker.addEventListener('input', () => set(picker.value, 'picker'));
    picker.addEventListener('change', () => set(picker.value, 'picker'));
    hex.addEventListener('input', () => {
      const value = normalHex(hex.value);
      if (value && hex.value.replace('#', '').length >= 6) set(value, 'hex');
    });
    hex.addEventListener('change', () => {
      const value = normalHex(hex.value);
      if (value) set(value, 'blur');
      else showError('Use a hex code like #e4572e (3 or 6 digits, 0–9 and a–f).');
    });
    hex.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); hex.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    return { picker, hex, set };
  }

  const accentControl = colourControl('accent', (value) => {
    accent = value;
    for (const p of presets) p.checked = p.value === value;
    update();
  });
  colourControl('bg', (value) => {
    background = value;
    update();
  });

  const widgetEl = () => mount.querySelector('booking-widget')?.shadowRoot?.querySelector('.bw, .bw-launch');

  // Reads back what the widget chose, so the notes match what's on screen.
  function describeContrast() {
    const el = widgetEl();
    const fill = el?.style.getPropertyValue('--bw-fill');
    const onFill = el?.style.getPropertyValue('--bw-on-fill');
    if (!fill || !onFill) return;
    const text = onFill === '#ffffff' ? 'white' : 'dark';
    note.textContent = fill === accent
      ? `Buttons get ${text} text on this colour, and links are darkened where needed to pass 4.5:1 contrast.`
      : `Neither white nor dark text is readable on ${accent}, so buttons use ${fill} with ${text} text instead.`;
  }

  function describeBackground(o) {
    const el = widgetEl();
    const bg = el?.style.getPropertyValue('--bw-bg');
    if (!o.background || !bg) return;
    const text = el.dataset.theme === 'dark' ? 'light' : 'dark';
    bgNote.textContent = bg === o.background
      ? `It gets ${text} text, with muted text, borders and errors worked out from this colour to pass WCAG contrast.`
      : `Text isn't clear enough on ${o.background}, so the background moves to ${bg}, the closest shade where it is.`;
  }

  // The mock site behind the widget wears the same colours, as a real site would.
  function paintSite(o) {
    const el = widgetEl();
    const props = { '--site-bg': '--bw-bg', '--site-ink': '--bw-text', '--site-muted': '--bw-muted' };
    for (const [prop, token] of Object.entries(props)) {
      if (o.background && el) site.style.setProperty(prop, el.style.getPropertyValue(token));
      else site.style.removeProperty(prop);
    }
    site.dataset.theme = o.background ? el?.dataset.theme || 'light' : o.theme;
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
    // A new display or mode starts the widget fresh; colours and theme change in place.
    if (o.display !== last.display || o.mode !== last.mode) {
      mount.innerHTML = '<booking-widget site="demo"></booking-widget>';
      widget = mount.firstElementChild;
    }
    for (const k of ['theme', 'background']) if (!(k in o)) widget.removeAttribute(k);
    for (const [k, v] of Object.entries(o)) widget.setAttribute(k, v);
    themeCustom.hidden = !o.background;
    snippet.innerHTML = code(o);
    if (o.display !== last.display && !reduce.matches && widget.animate) {
      widget.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }
    last = o;
    paintSite(o);
    describeContrast();
    describeBackground(o);
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'accent') accentControl.set(e.target.value, 'preset');
    else if (e.target.type === 'radio') update();
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
