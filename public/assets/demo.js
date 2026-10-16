// The demo page's "Make it yours" panel: every control changes the live
// widget and the embed code below it.
(() => {
  const form = document.getElementById('builder');
  const mount = document.getElementById('mount');
  const site = document.getElementById('site');
  const snippet = document.getElementById('snippet');
  const picker = document.getElementById('accent-picker');
  const custom = document.getElementById('accent-custom');
  const status = document.getElementById('copy-status');
  const origin = location.origin;
  const DEFAULTS = { mode: 'booking', display: 'inline', accent: '#0f766e', theme: 'light' };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  const current = () => {
    const data = new FormData(form);
    const accent = data.get('accent') === 'custom' ? picker.value : data.get('accent');
    return { mode: data.get('mode'), display: data.get('display'), accent, theme: data.get('theme') };
  };

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
  }

  form.addEventListener('change', update);
  picker.addEventListener('input', () => { custom.checked = true; update(); });
  picker.addEventListener('click', () => { custom.checked = true; update(); });

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
