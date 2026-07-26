/* ============================================================
   timer.js — the engine. Clock-based, so it stays honest when
   the tab is backgrounded and setInterval is throttled.
   ============================================================ */

export function createTimer({ onTick, onPhaseEnd } = {}) {
  let focusSec = 1500;
  let breakSec = 300;
  let phase = 'focus';
  let running = false;
  let endsAt = 0;          // epoch ms, while running
  let remaining = focusSec * 1000;
  let count = 0;           // finished focus units in the current stretch
  let startedAt = null;    // when the stretch began
  let awaiting = false;    // a focus unit is queued, waiting on a decision
  let ticker = null;

  const totalMs = () => (phase === 'focus' ? focusSec : breakSec) * 1000;

  const snapshot = () => ({
    phase, running, count, startedAt, awaiting,
    remainingMs: Math.max(0, running ? endsAt - Date.now() : remaining),
    totalMs: totalMs(),
    focusSec, breakSec,
  });

  const emit = () => onTick?.(snapshot());

  function loop() {
    if (!running) return;
    if (Date.now() >= endsAt) {
      const finished = phase;
      if (phase === 'focus') count += 1;
      phase = phase === 'focus' && breakSec > 0 ? 'break' : 'focus';
      remaining = totalMs();

      if (phase === 'focus') {
        // never start another focus unit on its own — that decision is yours
        running = false;
        awaiting = true;
        endsAt = 0;
        clearInterval(ticker);
      } else {
        endsAt = Date.now() + remaining;
      }

      emit();
      onPhaseEnd?.(finished, snapshot());
      return;
    }
    emit();
  }

  function tickOn() {
    clearInterval(ticker);
    ticker = setInterval(loop, 200);
  }

  return {
    get state() { return snapshot(); },

    configure({ focusSec: f, breakSec: b }) {
      focusSec = f ?? focusSec;
      breakSec = b ?? breakSec;
      if (!running) remaining = totalMs();
      emit();
    },

    start() {
      if (running) return;
      running = true;
      awaiting = false;
      startedAt ??= Date.now();
      endsAt = Date.now() + remaining;
      tickOn();
      emit();
    },

    pause() {
      if (!running) return;
      remaining = Math.max(0, endsAt - Date.now());
      running = false;
      clearInterval(ticker);
      emit();
    },

    toggle() { running ? this.pause() : this.start(); },

    /** back to the start of the current phase */
    reset() {
      running = false;
      awaiting = false;
      clearInterval(ticker);
      remaining = totalMs();
      emit();
    },

    /** jump to the other phase without crediting a focus unit */
    skip() {
      awaiting = false;
      phase = phase === 'focus' ? (breakSec > 0 ? 'break' : 'focus') : 'focus';
      remaining = totalMs();
      if (running) { endsAt = Date.now() + remaining; }
      emit();
    },

    /** manual correction, e.g. you finished one away from the screen */
    adjustCount(delta) {
      count = Math.max(0, count + delta);
      startedAt ??= Date.now();
      emit();
    },

    /** wipe the stretch: count, phase and clock */
    clearStretch() {
      running = false;
      clearInterval(ticker);
      phase = 'focus';
      count = 0;
      awaiting = false;
      startedAt = null;
      remaining = totalMs();
      emit();
    },
  };
}

/* ── time parsing & formatting ─────────────────────────────── */

/** Accepts "25", "25:00", "1:05:00", "90s". Returns seconds, or null. */
export function parseDuration(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return null;

  const secMatch = raw.match(/^(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?$/);
  if (secMatch) return Math.round(Number(secMatch[1]));

  const minMatch = raw.match(/^(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?$/);
  if (minMatch) return Math.round(Number(minMatch[1]) * 60);

  if (/^\d+(\.\d+)?$/.test(raw)) return Math.round(Number(raw) * 60);

  const parts = raw.split(':');
  if (parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  while (nums.length < 3) nums.unshift(0);
  const [h, m, s] = nums;
  if (m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}

export function formatDuration(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export const formatMs = ms => formatDuration(Math.ceil(ms / 1000));
