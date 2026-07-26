/* ============================================================
   palette.js — colour maths, generator, and the swatch picker.
   A palette is { bg, surface, ink, accent, muted } in hex.
   ============================================================ */

export const ROLES = [
  { key: 'bg',      label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'ink',     label: 'Text' },
  { key: 'accent',  label: 'Accent' },
  { key: 'muted',   label: 'Muted' },
];

export const PRESETS = [
  { name: 'Pine & Paper',  bg: '#DCE0DD', surface: '#EFF1EE', ink: '#171B19', accent: '#2E6B58', muted: '#7C8781' },
  { name: 'Ink & Brass',   bg: '#12151A', surface: '#1B1F26', ink: '#E8E6E1', accent: '#C69749', muted: '#7A8290' },
  { name: 'Indigo Dusk',   bg: '#151428', surface: '#1E1D38', ink: '#E4E3F2', accent: '#7C7BF0', muted: '#8481A8' },
  { name: 'Salt Flat',     bg: '#EDEAE3', surface: '#F8F6F1', ink: '#20211E', accent: '#3D5A9B', muted: '#8A897F' },
  { name: 'Foundry',       bg: '#1A1817', surface: '#242120', ink: '#EDE7E0', accent: '#D2603A', muted: '#8B8078' },
  { name: 'Sea Glass',     bg: '#E3EAEA', surface: '#F2F6F6', ink: '#16232A', accent: '#1C7A8C', muted: '#77898E' },
  { name: 'Plum Study',    bg: '#1C1620', surface: '#26202B', ink: '#EFE6F0', accent: '#B5709E', muted: '#8E8194' },
];

export const defaultPalette = () => ({ ...PRESETS[0] });

/* ── conversions ───────────────────────────────────────────── */

export function normaliseHex(input) {
  let h = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map(c => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toUpperCase() : null;
}

export function hexToRgb(hex) {
  const h = normaliseHex(hex) ?? '#000000';
  return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
}

export const rgbToHex = ([r, g, b]) =>
  '#' + [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6];
  return rgbToHex(seg.map(v => (v + m) * 255));
}

export function hexToHsl(hex) {
  let [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return [((h % 360) + 360) % 360, s * 100, l * 100];
}

/* ── contrast ──────────────────────────────────────────────── */

const channel = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export const readableOn = hex => (contrast(hex, '#FFFFFF') >= 3.6 ? '#FFFFFF' : '#111111');

/* ── generator ─────────────────────────────────────────────── */

const rand = (a, b) => a + Math.random() * (b - a);

const OFFSETS = {
  analogous:     () => rand(20, 45) * (Math.random() < .5 ? -1 : 1),
  complementary: () => 180 + rand(-12, 12),
  triadic:       () => 120 * (Math.random() < .5 ? -1 : 1) + rand(-10, 10),
  mono:          () => rand(-6, 6),
};

/**
 * Build a palette. Locked roles are carried over from `base` untouched.
 * @param {object} opts { harmony, key: 'dark'|'light', base, locks: Set }
 */
export function randomPalette({ harmony = 'analogous', key = 'dark', base = {}, locks = new Set() } = {}) {
  const dark = key === 'dark';
  const baseHue = locks.has('accent') && base.accent
    ? hexToHsl(base.accent)[0] - OFFSETS[harmony]()
    : rand(0, 360);
  const accentHue = baseHue + OFFSETS[harmony]();

  const out = {
    bg:      hslToHex(baseHue, rand(6, 18), dark ? rand(7, 13) : rand(88, 94)),
    surface: hslToHex(baseHue, rand(8, 20), dark ? rand(13, 19) : rand(95, 98)),
    ink:     hslToHex(baseHue, rand(4, 12), dark ? rand(88, 95) : rand(9, 16)),
    accent:  hslToHex(accentHue, rand(42, 78), dark ? rand(52, 66) : rand(34, 48)),
    muted:   hslToHex(accentHue - 8, rand(8, 22), dark ? rand(46, 58) : rand(44, 56)),
  };

  for (const role of Object.keys(out)) if (locks.has(role) && base[role]) out[role] = base[role];

  // nudge, don't fight: only fix what is unlocked and unreadable
  if (!locks.has('ink') && contrast(out.ink, out.bg) < 7) {
    out.ink = hslToHex(...withL(out.ink, dark ? 95 : 10));
  }
  if (!locks.has('accent') && contrast(out.accent, out.bg) < 3.2) {
    out.accent = hslToHex(...withL(out.accent, dark ? 68 : 38));
  }
  return out;
}

const withL = (hex, l) => { const [h, s] = hexToHsl(hex); return [h, s, l]; };

/* ── applying ──────────────────────────────────────────────── */

export function applyPalette(palette, target = document.documentElement) {
  const p = { ...defaultPalette(), ...(palette ?? {}) };
  target.style.setProperty('--bg', p.bg);
  target.style.setProperty('--surface', p.surface);
  target.style.setProperty('--ink', p.ink);
  target.style.setProperty('--accent', p.accent);
  target.style.setProperty('--muted', p.muted);
  target.style.setProperty('--on-accent', readableOn(p.accent));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bg);
}

/* ── picker ────────────────────────────────────────────────── */

/**
 * Opens the palette dialog. Resolves with a palette, or null if cancelled.
 * Live-previews on the document while open.
 */
export function openPalettePicker(initial, { onPreview } = {}) {
  const dialog = document.getElementById('paletteDialog');
  const wrap = document.getElementById('swatches');
  const harmonySel = document.getElementById('harmonySelect');
  const keySel = document.getElementById('keySelect');
  const contrastNote = document.getElementById('contrastNote');
  const presetWrap = document.getElementById('presets');

  let working = { ...defaultPalette(), ...(initial ?? {}) };
  const locks = new Set();

  keySel.value = luminance(working.bg) < 0.4 ? 'dark' : 'light';

  const preview = () => onPreview?.(working);

  function paint() {
    wrap.replaceChildren(...ROLES.map(({ key, label }) => {
      const hex = working[key];
      const fg = readableOn(hex) === '#FFFFFF' ? '#FFFFFF' : '#111111';
      const el = document.createElement('div');
      el.className = 'swatch';
      el.style.background = hex;
      el.style.color = fg;
      el.dataset.role = key;
      el.dataset.locked = locks.has(key);
      el.title = locks.has(key) ? 'Click to unlock' : 'Click to lock';

      const role = document.createElement('span');
      role.className = 'swatch__role';
      role.textContent = label;

      const lock = document.createElement('span');
      lock.className = 'swatch__lock';
      lock.textContent = locks.has(key) ? 'Locked' : '';

      const input = document.createElement('input');
      input.className = 'swatch__hex';
      input.value = hex;
      input.setAttribute('aria-label', label + ' hex value');
      input.addEventListener('click', e => e.stopPropagation());
      input.addEventListener('change', () => {
        const v = normaliseHex(input.value);
        if (v) { working[key] = v; locks.add(key); paint(); preview(); }
        else input.value = working[key];
      });

      el.append(role, lock, input);
      el.addEventListener('click', () => {
        locks.has(key) ? locks.delete(key) : locks.add(key);
        paint();
      });
      return el;
    }));

    const c = contrast(working.ink, working.bg);
    const ca = contrast(working.accent, working.bg);
    const ok = c >= 4.5 && ca >= 2.5;
    contrastNote.textContent = `text ${c.toFixed(1)}:1 · accent ${ca.toFixed(1)}:1` + (ok ? '' : ' — hard to read');
    contrastNote.classList.toggle('contrast--warn', !ok);
  }

  function shuffle() {
    working = randomPalette({
      harmony: harmonySel.value,
      key: keySel.value,
      base: working,
      locks,
    });
    paint();
    preview();
  }

  presetWrap.replaceChildren(...PRESETS.map(p => {
    const b = document.createElement('button');
    b.className = 'preset';
    b.type = 'button';
    b.title = p.name;
    b.setAttribute('aria-label', p.name);
    ['bg', 'surface', 'ink', 'accent', 'muted'].forEach(k => {
      const s = document.createElement('span');
      s.style.background = p[k];
      b.append(s);
    });
    b.addEventListener('click', () => {
      const { name, ...colors } = p;
      working = { ...colors };
      locks.clear();
      keySel.value = luminance(working.bg) < 0.4 ? 'dark' : 'light';
      paint();
      preview();
    });
    return b;
  }));

  paint();

  return new Promise(resolve => {
    const onKey = e => {
      if (e.key === ' ' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) {
        e.preventDefault();
        shuffle();
      }
    };
    const finish = value => {
      dialog.removeEventListener('keydown', onKey);
      document.getElementById('shuffleBtn').removeEventListener('click', shuffle);
      dialog.close();
      resolve(value);
    };

    dialog.addEventListener('keydown', onKey);
    document.getElementById('shuffleBtn').addEventListener('click', shuffle);
    document.getElementById('paletteApply').onclick = () => finish({ ...working });
    document.getElementById('paletteCancel').onclick = () => finish(null);
    dialog.addEventListener('cancel', e => { e.preventDefault(); finish(null); }, { once: true });

    dialog.showModal();
  });
}
