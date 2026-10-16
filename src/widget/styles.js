// The widget's styles, scoped inside its shadow root so the host site's CSS
// can't reach in and the widget's can't leak out. Colours are tokens; the
// accent tokens (--bw-fill, --bw-on-fill, --bw-ink, --bw-tint) are set from
// JavaScript so any brand colour keeps 4.5:1 contrast. No CSS transitions or
// keyframes: motion runs in JavaScript (motion.js) and respects reduced motion.
export default /* css */ `
:host { display: block; }
:host([hidden]) { display: none; }
*, *::before, *::after { box-sizing: border-box; }
/* Classes below set display, which would otherwise beat the hidden attribute. */
[hidden] { display: none !important; }

.bw, .bw-launch, .bw-dialog {
  --bw-bg: #ffffff;
  --bw-surface: #f4f5f7;
  --bw-text: #15171c;
  --bw-muted: #575d68;
  --bw-line: #e0e3e8;
  --bw-control: #858b96;
  --bw-danger: #b42318;
  --bw-danger-bg: #fdf0ee;
  --bw-radius: 12px;
  --bw-shadow: 0 1px 2px rgb(16 18 24 / .06), 0 8px 24px rgb(16 18 24 / .08);
  font-family: inherit;
  font-size: 16px;
  line-height: 1.5;
  color: var(--bw-text);
  -webkit-font-smoothing: antialiased;
}
.bw[data-theme="dark"], .bw-dialog[data-theme="dark"], .bw-launch[data-theme="dark"] {
  --bw-bg: #17191e;
  --bw-surface: #21242b;
  --bw-text: #eef0f3;
  --bw-muted: #a9afba;
  --bw-line: #333741;
  --bw-control: #747b88;
  --bw-danger: #ff9e92;
  --bw-danger-bg: #3a2220;
  --bw-shadow: 0 1px 2px rgb(0 0 0 / .4), 0 8px 24px rgb(0 0 0 / .35);
}

/* ---------- card ---------- */
.bw {
  container-type: inline-size;
  background: var(--bw-bg);
  border: 1px solid var(--bw-line);
  border-radius: var(--bw-radius);
  box-shadow: var(--bw-shadow);
  overflow: hidden;
  text-align: left;
}
.bw-dialog .bw { border: 0; box-shadow: none; border-radius: 0; }
.bw-head { padding: 20px 20px 0; }
.bw-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.bw-title { margin: 0; font-size: 1.25em; line-height: 1.2; font-weight: 700; letter-spacing: -.01em; }
.bw-biz { margin: 2px 0 0; color: var(--bw-muted); font-size: .875em; }
.bw-body { padding: 16px 20px 20px; min-height: 220px; }
.bw-loading { display: grid; place-items: center; min-height: 380px; color: var(--bw-muted); }
.bw-note {
  margin: 0; padding: 10px 20px; border-top: 1px solid var(--bw-line);
  background: var(--bw-surface); color: var(--bw-muted); font-size: .8125em;
}

/* ---------- progress ---------- */
.bw-steps { list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 16px 0 0; padding: 0; counter-reset: step; }
.bw-steps li { counter-increment: step; border-top: 3px solid var(--bw-line); padding-top: 6px; font-size: .8125em; color: var(--bw-muted); white-space: nowrap; min-width: 0; }
.bw-steps li::before { content: counter(step) ". "; }
.bw-steps li.is-done, .bw-steps li.is-current { border-top-color: var(--bw-fill); }
.bw-steps li.is-current { color: var(--bw-text); font-weight: 600; }
.bw-steps button {
  all: unset; cursor: pointer; color: var(--bw-ink); text-decoration: underline; text-underline-offset: 2px;
  min-height: 24px; display: inline-flex; align-items: center;
}
.bw-steps button:focus-visible { outline: 2px solid var(--bw-ink); outline-offset: 2px; border-radius: 2px; }

/* ---------- type ---------- */
.bw-h { margin: 0 0 4px; font-size: 1.0625em; line-height: 1.3; font-weight: 650; }
.bw-h:focus { outline: none; }
.bw-sub { margin: 0 0 14px; color: var(--bw-muted); font-size: .9375em; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.bw-visually-hidden { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* ---------- buttons ---------- */
.bw-btn {
  font: inherit; font-weight: 600; font-size: 1em; line-height: 1.2;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 48px; padding: 12px 20px; border-radius: 10px; cursor: pointer;
  border: 2px solid transparent; text-decoration: none; white-space: nowrap;
}
.bw-btn:focus-visible, .bw-link:focus-visible, .bw-icon-btn:focus-visible { outline: 2px solid var(--bw-ink); outline-offset: 2px; }
.bw-btn svg { width: 18px; height: 18px; flex: none; }
.bw-primary { background: var(--bw-fill); color: var(--bw-on-fill); }
.bw-primary:hover { background: var(--bw-fill-hover); }
.bw-primary[aria-busy="true"] { cursor: progress; }
.bw-ghost { background: transparent; color: var(--bw-ink); border-color: var(--bw-control); }
.bw-ghost:hover { background: var(--bw-tint); }
.bw-link {
  font: inherit; background: none; border: 0; padding: 0; cursor: pointer;
  color: var(--bw-ink); text-decoration: underline; text-underline-offset: 2px; min-height: 24px;
}
.bw-icon-btn {
  display: inline-grid; place-items: center; width: 44px; height: 44px; flex: none;
  border-radius: 10px; border: 1px solid var(--bw-line); background: var(--bw-bg); color: var(--bw-text); cursor: pointer;
}
.bw-icon-btn:hover:not([aria-disabled="true"]) { background: var(--bw-surface); }
.bw-icon-btn[aria-disabled="true"] { color: var(--bw-control); cursor: not-allowed; }
.bw-icon-btn svg { width: 20px; height: 20px; }
.bw-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-top: 20px; }
.bw-actions .bw-primary { flex: 1 1 auto; }
@container (min-width: 520px) { .bw-actions .bw-primary { flex: 0 0 auto; min-width: 200px; } }

/* ---------- service options ---------- */
.bw-group { border: 0; margin: 0; padding: 0; min-width: 0; }
.bw-options { display: grid; gap: 8px; }
@container (min-width: 560px) { .bw-options { grid-template-columns: 1fr 1fr; } }
.bw-option {
  position: relative; display: flex; justify-content: space-between; gap: 12px; align-items: flex-start;
  padding: 14px 16px; border: 1px solid var(--bw-control); border-radius: 10px; cursor: pointer; background: var(--bw-bg);
}
.bw-option:hover { background: var(--bw-surface); }
.bw-option:has(input:checked) { border-color: var(--bw-ink); box-shadow: inset 0 0 0 1px var(--bw-ink); background: var(--bw-tint); }
.bw-option:has(input:focus-visible) { outline: 2px solid var(--bw-ink); outline-offset: 2px; }
.bw-option input { position: absolute; opacity: 0; pointer-events: none; }
.bw-opt-name { display: block; font-weight: 600; }
.bw-opt-desc { display: block; color: var(--bw-muted); font-size: .875em; margin-top: 2px; }
.bw-opt-meta { flex: none; text-align: right; font-size: .875em; color: var(--bw-muted); white-space: nowrap; }
.bw-opt-meta strong { display: block; color: var(--bw-text); font-size: 1.0625em; }

/* ---------- date and time ---------- */
.bw-when { display: grid; gap: 20px; }
@container (min-width: 600px) { .bw-when { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); align-items: start; } }
.bw-cal-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.bw-month { margin: 0; font-size: 1em; font-weight: 650; }
.bw-grid { border-collapse: separate; border-spacing: 3px; table-layout: fixed; margin: 0 -3px; width: calc(100% + 6px); }
.bw-grid th { font-size: .75em; font-weight: 600; color: var(--bw-muted); padding: 2px 0 4px; text-align: center; }
.bw-grid td { padding: 0; text-align: center; }
.bw-day {
  font: inherit; font-size: .9375em; width: 100%; min-height: 44px; border-radius: 8px; cursor: pointer;
  border: 1px solid transparent; background: var(--bw-surface); color: var(--bw-text); font-weight: 600;
  position: relative; padding: 0;
}
.bw-day:hover:not([aria-disabled="true"]) { border-color: var(--bw-control); }
.bw-day[aria-disabled="true"] { background: transparent; color: var(--bw-muted); font-weight: 400; cursor: default; }
.bw-day[aria-pressed="true"] { background: var(--bw-fill); color: var(--bw-on-fill); }
.bw-day:focus-visible { outline: 2px solid var(--bw-ink); outline-offset: 1px; }
.bw-day.is-today::after {
  content: ""; position: absolute; left: 50%; bottom: 5px; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: currentColor;
}
.bw-times-h { margin: 0 0 2px; font-size: 1em; font-weight: 650; }
.bw-tz { margin: 0 0 10px; font-size: .8125em; color: var(--bw-muted); }
.bw-period + .bw-period { margin-top: 12px; }
.bw-period-h { margin: 0 0 6px; font-size: .8125em; font-weight: 600; color: var(--bw-muted); }
.bw-chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 6px; }
.bw-chip {
  position: relative; display: grid; place-items: center; min-height: 44px; padding: 0 8px;
  border: 1px solid var(--bw-control); border-radius: 8px; cursor: pointer; font-size: .9375em; font-weight: 600;
  white-space: nowrap; background: var(--bw-bg);
}
.bw-chip:hover { background: var(--bw-surface); }
.bw-chip:has(input:checked) { background: var(--bw-fill); border-color: var(--bw-fill); color: var(--bw-on-fill); }
.bw-chip:has(input:focus-visible) { outline: 2px solid var(--bw-ink); outline-offset: 2px; }
.bw-chip input { position: absolute; opacity: 0; pointer-events: none; }
.bw-empty { margin: 0; padding: 16px; border-radius: 10px; background: var(--bw-surface); color: var(--bw-muted); font-size: .9375em; }

/* ---------- details form ---------- */
.bw-summary {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
  padding: 12px 14px; margin: 8px 0 18px; border-radius: 10px; background: var(--bw-surface); font-size: .9375em;
}
.bw-summary strong { font-weight: 650; }
.bw-summary span { color: var(--bw-muted); }
.bw-form { display: grid; gap: 16px; }
.bw-field { display: grid; gap: 6px; min-width: 0; border: 0; margin: 0; padding: 0; }
.bw-label { font-weight: 600; font-size: .9375em; padding: 0; }
.bw-hint { font-weight: 400; color: var(--bw-muted); }
.bw-input {
  font: inherit; font-size: 16px; width: 100%; min-height: 48px; padding: 11px 14px;
  color: var(--bw-text); background: var(--bw-bg); border: 1px solid var(--bw-control); border-radius: 10px;
}
textarea.bw-input { min-height: 96px; resize: vertical; line-height: 1.45; }
select.bw-input { appearance: none; padding-right: 40px; background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%); background-position: calc(100% - 20px) 21px, calc(100% - 15px) 21px; background-size: 5px 5px; background-repeat: no-repeat; }
.bw-input:focus { outline: 2px solid var(--bw-ink); outline-offset: 1px; border-color: var(--bw-ink); }
.bw-input[aria-invalid="true"] { border-color: var(--bw-danger); box-shadow: inset 0 0 0 1px var(--bw-danger); }
.bw-row2 { display: grid; gap: 16px; }
@container (min-width: 520px) { .bw-row2 { grid-template-columns: 1fr 1fr; } }
.bw-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.bw-seg label {
  position: relative; display: grid; place-items: center; min-height: 48px; padding: 0 6px; text-align: center;
  border: 1px solid var(--bw-control); border-radius: 10px; cursor: pointer; font-weight: 600; font-size: .9375em; white-space: nowrap;
}
.bw-seg label:hover { background: var(--bw-surface); }
.bw-seg label:has(input:checked) { border-color: var(--bw-ink); box-shadow: inset 0 0 0 1px var(--bw-ink); background: var(--bw-tint); }
.bw-seg label:has(input:focus-visible) { outline: 2px solid var(--bw-ink); outline-offset: 2px; }
.bw-seg input { position: absolute; opacity: 0; pointer-events: none; }
.bw-err { margin: 0; color: var(--bw-danger); font-size: .875em; font-weight: 500; display: flex; gap: 6px; align-items: flex-start; }
.bw-err svg { flex: none; width: 16px; height: 16px; margin-top: 2px; }
.bw-alert {
  margin: 0; padding: 12px 14px; border-radius: 10px; background: var(--bw-danger-bg); color: var(--bw-danger);
  font-size: .9375em; font-weight: 500; display: flex; gap: 8px; align-items: flex-start;
}
.bw-alert svg { flex: none; width: 18px; height: 18px; margin-top: 2px; }
.bw-next { margin: 0; font-size: .875em; color: var(--bw-muted); padding-left: 12px; border-left: 3px solid var(--bw-line); }
.bw-hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.bw-phone { white-space: nowrap; color: var(--bw-ink); font-weight: 600; }

/* ---------- done ---------- */
.bw-done { text-align: left; }
.bw-done-icon { width: 48px; height: 48px; color: var(--bw-ink); margin-bottom: 8px; }
.bw-done p { margin: 0 0 16px; }
.bw-receipt { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 0; padding: 14px 16px; border-radius: 10px; background: var(--bw-surface); font-size: .9375em; }
.bw-receipt dt { color: var(--bw-muted); white-space: nowrap; }
.bw-receipt dd { margin: 0; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }

/* ---------- popup ---------- */
.bw-launch.bw-btn { box-shadow: var(--bw-shadow); }
.bw-dialog {
  padding: 0; border: 0; color: var(--bw-text); background: var(--bw-bg);
  width: 100%; max-width: 100%; height: 100%; max-height: 100%; margin: 0;
  overflow: auto; overscroll-behavior: contain;
}
.bw-dialog::backdrop { background: rgb(10 12 16 / .55); }
@media (min-width: 640px) {
  /* fit-content, not auto: a modal dialog is pinned top and bottom, so auto would stretch it. */
  .bw-dialog { width: min(600px, calc(100% - 48px)); height: fit-content; max-height: calc(100% - 48px); margin: auto; border-radius: var(--bw-radius); box-shadow: 0 24px 64px rgb(0 0 0 / .3); }
}
`;
