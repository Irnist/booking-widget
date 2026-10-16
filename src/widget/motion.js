// All motion runs here, through the Web Animations API: transform and opacity
// only, and nothing at all when the visitor prefers reduced motion.

const EASE_OUT = 'cubic-bezier(.2, .7, .2, 1)';
const EASE_IN = 'cubic-bezier(.4, 0, 1, 1)';

export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fade and slide an element into place. */
export function enter(el, { x = 0, y = 8, scale = 1, duration = 240 } = {}) {
  if (!el || reducedMotion() || !el.animate) return;
  el.animate(
    [{ opacity: 0, transform: `translate(${x}px, ${y}px) scale(${scale})` }, { opacity: 1, transform: 'none' }],
    { duration, easing: EASE_OUT },
  );
}

/** Fade and slide an element out; resolves when done (at once under reduced motion). */
export function leave(el, { x = 0, y = 8, scale = 1, duration = 160 } = {}) {
  if (!el || reducedMotion() || !el.animate) return Promise.resolve();
  const anim = el.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate(${x}px, ${y}px) scale(${scale})` }],
    { duration, easing: EASE_IN, fill: 'forwards' },
  );
  return anim.finished.catch(() => {}).then(() => anim);
}

/** A short shake for a blocked action (e.g. Continue with nothing chosen). */
export function nudge(el) {
  if (!el || reducedMotion() || !el.animate) return;
  el.animate(
    [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
    { duration: 220, easing: 'ease-in-out' },
  );
}
