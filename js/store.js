/* ============================================================
   store.js — single source of truth.
   Everything lives in localStorage; export/import moves it around.
   ============================================================ */

const KEY = 'cadence.v1';
const SCHEMA = 1;

const listeners = new Set();

export const state = {
  schema: SCHEMA,
  tasks: [],      // { id, name, focusSec, breakSec, palette, createdAt }
  stretches: [],  // { id, taskId, date, count, note, feel, checkins, focusSec, breakSec, startedAt, endedAt }
                  // checkins: [{ after, choice: 'want'|'need'|'stop', at }] — one per break decision
  settings: { sound: 'bell', volume: 0.7, activeTaskId: null },
};

export const uid = () =>
  (crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

export const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ── plumbing ──────────────────────────────────────────────── */

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() { listeners.forEach(fn => fn(state)); }

export function commit() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      schema: SCHEMA, tasks: state.tasks, stretches: state.stretches, settings: state.settings,
    }));
  } catch (err) {
    console.warn('Could not save to localStorage:', err);
  }
  emit();
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) adopt(JSON.parse(raw), 'replace');
  } catch (err) {
    console.warn('Stored data was unreadable, starting fresh:', err);
  }
  emit();
}

/* ── tasks ─────────────────────────────────────────────────── */

export const getTask = id => state.tasks.find(t => t.id === id) ?? null;
export const activeTask = () => getTask(state.settings.activeTaskId);

export function addTask({ name, focusSec, breakSec, palette }) {
  const task = { id: uid(), name, focusSec, breakSec, palette, createdAt: Date.now() };
  state.tasks.push(task);
  state.settings.activeTaskId = task.id;
  commit();
  return task;
}

export function updateTask(id, patch) {
  const task = getTask(id);
  if (!task) return null;
  Object.assign(task, patch);
  commit();
  return task;
}

export function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  state.stretches = state.stretches.filter(s => s.taskId !== id);
  if (state.settings.activeTaskId === id) {
    state.settings.activeTaskId = state.tasks[0]?.id ?? null;
  }
  commit();
}

export function selectTask(id) {
  state.settings.activeTaskId = id;
  commit();
}

/* ── stretches ─────────────────────────────────────────────── */

export function addStretch(entry) {
  const rec = { id: uid(), date: today(), endedAt: Date.now(), ...entry };
  state.stretches.push(rec);
  commit();
  return rec;
}

export function deleteStretch(id) {
  state.stretches = state.stretches.filter(s => s.id !== id);
  commit();
}

export const stretchesFor = taskId =>
  state.stretches.filter(s => s.taskId === taskId).sort((a, b) => b.endedAt - a.endedAt);

export function statsFor(taskId) {
  const rows = stretchesFor(taskId);
  const total = rows.reduce((n, s) => n + s.count, 0);
  const days = new Set(rows.map(s => s.date));
  const todayCount = rows.filter(s => s.date === today()).reduce((n, s) => n + s.count, 0);
  const best = rows.reduce((m, s) => Math.max(m, s.count), 0);
  return {
    total,
    stretches: rows.length,
    avg: rows.length ? total / rows.length : 0,
    best,
    days: days.size,
    todayCount,
  };
}

/* ── settings ──────────────────────────────────────────────── */

export function setSetting(key, value) {
  state.settings[key] = value;
  commit();
}

/* ── export / import ───────────────────────────────────────── */

export function exportBlob() {
  const payload = {
    app: 'cadence',
    schema: SCHEMA,
    exportedAt: new Date().toISOString(),
    tasks: state.tasks,
    stretches: state.stretches,
    settings: state.settings,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export function inspect(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.tasks)) {
    throw new Error('This file is not a Cadence backup.');
  }
  return {
    tasks: data.tasks.length,
    stretches: Array.isArray(data.stretches) ? data.stretches.length : 0,
    exportedAt: data.exportedAt ?? null,
  };
}

/** mode: 'replace' wipes current data, 'merge' keeps both and skips duplicate ids. */
export function adopt(data, mode = 'merge') {
  inspect(data);
  const tasks = data.tasks.map(normaliseTask).filter(Boolean);
  const stretches = (data.stretches ?? []).map(normaliseStretch).filter(Boolean);

  if (mode === 'replace') {
    state.tasks = tasks;
    state.stretches = stretches;
    state.settings = { ...state.settings, ...(data.settings ?? {}) };
  } else {
    const known = new Set(state.tasks.map(t => t.id));
    tasks.forEach(t => { if (!known.has(t.id)) state.tasks.push(t); });
    const seen = new Set(state.stretches.map(s => s.id));
    stretches.forEach(s => { if (!seen.has(s.id)) state.stretches.push(s); });
  }

  if (!getTask(state.settings.activeTaskId)) {
    state.settings.activeTaskId = state.tasks[0]?.id ?? null;
  }
  commit();
}

function normaliseTask(t) {
  if (!t?.id || !t?.name) return null;
  return {
    id: String(t.id),
    name: String(t.name).slice(0, 80),
    focusSec: clampInt(t.focusSec, 10, 7200, 1500),
    breakSec: clampInt(t.breakSec, 0, 7200, 300),
    palette: t.palette ?? null,
    createdAt: Number(t.createdAt) || Date.now(),
  };
}

function normaliseStretch(s) {
  if (!s?.id || !s?.taskId) return null;
  return {
    id: String(s.id),
    taskId: String(s.taskId),
    date: /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : today(),
    count: clampInt(s.count, 0, 999, 0),
    note: typeof s.note === 'string' ? s.note.slice(0, 2000) : '',
    feel: typeof s.feel === 'string' ? s.feel : '',
    checkins: Array.isArray(s.checkins)
      ? s.checkins
          .filter(c => c && ['want', 'need', 'stop'].includes(c.choice))
          .map(c => ({ after: clampInt(c.after, 0, 999, 0), choice: c.choice, at: Number(c.at) || null }))
      : [],
    focusSec: clampInt(s.focusSec, 0, 7200, 1500),
    breakSec: clampInt(s.breakSec, 0, 7200, 300),
    startedAt: Number(s.startedAt) || null,
    endedAt: Number(s.endedAt) || Date.now(),
  };
}

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
