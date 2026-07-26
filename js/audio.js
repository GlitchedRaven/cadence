/* ============================================================
   audio.js — notification cues.
   Files live in data/sounds/ and are listed in manifest.json,
   so you can drop your own in and add a line to the manifest.
   ============================================================ */

const DIR = 'data/sounds/';

const FALLBACK = [
  { id: 'bell',  label: 'Bell',  file: 'bell.wav' },
  { id: 'chime', label: 'Chime', file: 'chime.wav' },
  { id: 'block', label: 'Block', file: 'block.wav' },
  { id: 'gong',  label: 'Gong',  file: 'gong.wav' },
];

let catalogue = [];
let volume = 0.7;

export function setVolume(v) { volume = Math.min(1, Math.max(0, Number(v) || 0)); }

export async function loadCatalogue() {
  try {
    const res = await fetch(DIR + 'manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    catalogue = Array.isArray(data.sounds) && data.sounds.length ? data.sounds : FALLBACK;
  } catch {
    catalogue = FALLBACK; // reading from file:// — the files may still play
  }
  catalogue.forEach(s => { const a = new Audio(DIR + s.file); a.preload = 'auto'; s._el = a; });
  return catalogue;
}

export const sounds = () => catalogue;

export function play(id) {
  const entry = catalogue.find(s => s.id === id) ?? catalogue[0];
  if (!entry) return beep();
  const el = entry._el?.cloneNode() ?? new Audio(DIR + entry.file);
  el.volume = volume;
  el.play().catch(beep);
}

/** Last resort: a short synthesised tone, used when a file will not load. */
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume * 0.5, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1.25);
    osc.onended = () => ctx.close();
  } catch { /* silence is acceptable */ }
}

/** Browsers block audio until the page has been interacted with. */
export function unlockOnFirstGesture() {
  const unlock = () => {
    catalogue.forEach(s => {
      if (!s._el) return;
      s._el.volume = 0;
      s._el.play().then(() => { s._el.pause(); s._el.currentTime = 0; s._el.volume = volume; }).catch(() => {});
    });
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}
