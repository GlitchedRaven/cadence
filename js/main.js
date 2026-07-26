/* ============================================================
   main.js — wiring. Modules do the work; this file decides
   when they talk to each other.
   ============================================================ */

import * as store from './store.js';
import { createTimer, formatMs, formatDuration } from './timer.js';
import { applyPalette, openPalettePicker, defaultPalette } from './palette.js';
import * as audio from './audio.js';
import { renderRail, openTaskDialog, renderStageHead, nextPalette } from './ui-tasks.js';
import { renderLedger, buildTally, openNoteDialog, openContinueDialog } from './ui-ledger.js';

const el = id => document.getElementById(id);

/* ── timer ─────────────────────────────────────────────────── */

/** Decisions taken during the stretch in progress; filed with it at the end. */
let checkins = [];

const timer = createTimer({
  onTick: paintInstrument,
  onPhaseEnd: (finished, snap) => {
    audio.play(store.state.settings.sound);
    notify(finished, snap);
    if (snap.awaiting) askToContinue(snap);
  },
});

function paintInstrument(snap) {
  const task = store.activeTask();
  if (!task) return;

  el('clock').textContent = formatMs(snap.remainingMs);
  el('clock').classList.toggle('clock--rest', snap.phase === 'break');
  el('phaseLabel').textContent = snap.phase === 'focus' ? 'Focus' : 'Break';

  const done = 1 - (snap.totalMs ? snap.remainingMs / snap.totalMs : 0);
  const pct = (Math.min(1, Math.max(0, done)) * 100).toFixed(2) + '%';
  el('ruleFill').style.width = pct;
  el('ruleHead').style.left = pct;

  if (snap.awaiting) el('phaseLabel').textContent = 'Waiting on you';
  el('startBtn').textContent = snap.awaiting ? 'Next unit'
    : snap.running ? 'Pause'
    : snap.remainingMs < snap.totalMs ? 'Resume' : 'Start';
  el('endStretchBtn').disabled = snap.count === 0;
  el('stretchLabel').textContent = snap.startedAt
    ? `Stretch started ${new Date(snap.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    : 'Stretch not started';

  const live = el('liveTally');
  if (Number(live.dataset.count || 0) !== snap.count) {
    live.dataset.count = String(snap.count);
    live.replaceChildren(...buildTally(snap.count, { live: true }).childNodes);
  }
  el('liveCount').textContent = `${snap.count} in this stretch`;

  document.title = snap.running
    ? `${formatMs(snap.remainingMs)} · ${snap.phase === 'focus' ? task.name : 'Break'}`
    : 'Cadence — attention ledger';
}

function notify(finished, snap) {
  const task = store.activeTask();
  const text = finished === 'focus'
    ? `Focus unit ${snap.count} done. ${snap.phase === 'break' ? 'Break started.' : 'Carry on?'}`
    : 'Break over. Carry on?';
  toast(text);
  if (window.Notification?.permission === 'granted') {
    new Notification(task ? task.name : 'Cadence', { body: text, silent: true });
  }
}

/* ── the decision ──────────────────────────────────────────── */

/**
 * Nothing starts another focus unit but you. The answer is kept and filed
 * with the stretch, so the ledger records not just how many, but on what terms.
 */
let asking = false;

async function askToContinue(snap) {
  const task = store.activeTask();
  if (!task || asking) return;
  asking = true;
  const choice = await openContinueDialog({
    count: snap.count, breakSec: task.breakSec, focusSec: task.focusSec,
  });
  asking = false;

  if (!choice) return;                                    // Esc: decide later
  checkins.push({ after: snap.count, choice, at: Date.now() });

  if (choice === 'stop') {
    await endStretch();
  } else {
    timer.start();
    toast(choice === 'want' ? 'Because you want to.' : 'Noted — obligation, not appetite.');
  }
}

async function endStretch() {
  await closeStretch();
  resetStretch();
  render();
}

function resetStretch() {
  timer.clearStretch();
  checkins = [];
}

/* ── rendering ─────────────────────────────────────────────── */

function render() {
  const task = store.activeTask();
  renderRail({ onSelect: selectTask });

  el('stage').hidden = !task;
  el('emptyStage').hidden = !!task;
  if (!task) {
    applyPalette(defaultPalette());
    return;
  }

  applyPalette(task.palette);
  renderStageHead(task);
  timer.configure({ focusSec: task.focusSec, breakSec: task.breakSec });
  renderLedger(task.id, { onChange: render });
  paintInstrument(timer.state);
}

/* ── task switching ────────────────────────────────────────── */

async function selectTask(id) {
  if (id === store.state.settings.activeTaskId) return;
  if (!(await closeStretch({ reason: 'switch' }))) return;
  resetStretch();
  store.selectTask(id);
  render();
}

/**
 * Offers to file the running stretch. Returns false if the user backed out.
 */
async function closeStretch({ reason } = {}) {
  const snap = timer.state;
  const task = store.activeTask();
  if (!task || snap.count === 0) return true;

  timer.pause();
  const { action, note, feel } = await openNoteDialog({
    count: snap.count, focusSec: task.focusSec, checkins,
  });
  if (action === 'save') {
    store.addStretch({
      taskId: task.id,
      count: snap.count,
      note, feel,
      checkins: [...checkins],
      focusSec: task.focusSec,
      breakSec: task.breakSec,
      startedAt: snap.startedAt,
    });
    toast('Stretch saved to the ledger.');
  } else if (reason !== 'switch') {
    toast('Stretch discarded.');
  }
  return true;
}

/* ── controls ──────────────────────────────────────────────── */

el('startBtn').addEventListener('click', () => {
  const snap = timer.state;
  snap.awaiting ? askToContinue(snap) : timer.toggle();
});
el('resetBtn').addEventListener('click', () => timer.reset());
el('skipBtn').addEventListener('click', () => timer.skip());

el('endStretchBtn').addEventListener('click', endStretch);

/* ── tasks ─────────────────────────────────────────────────── */

async function newTask() {
  const res = await openTaskDialog(null);
  if (res.action !== 'save') return;
  if (!(await closeStretch({ reason: 'switch' }))) return;
  resetStretch();
  store.addTask({ ...res.data, palette: nextPalette() });
  render();
  toast('Task created.');
}

el('newTaskBtn').addEventListener('click', newTask);
el('emptyNewTask').addEventListener('click', newTask);

el('editTaskBtn').addEventListener('click', async () => {
  const task = store.activeTask();
  if (!task) return;
  const res = await openTaskDialog(task.id);
  if (res.action === 'save') {
    store.updateTask(task.id, res.data);
    timer.reset();
    toast('Task updated.');
  } else if (res.action === 'delete') {
    resetStretch();
    store.deleteTask(task.id);
    toast('Task deleted.');
  }
  render();
});

/* ── palette ───────────────────────────────────────────────── */

el('paletteBtn').addEventListener('click', async () => {
  const task = store.activeTask();
  if (!task) return;
  const original = task.palette ?? defaultPalette();
  const chosen = await openPalettePicker(original, { onPreview: applyPalette });
  applyPalette(chosen ?? original);
  if (chosen) {
    store.updateTask(task.id, { palette: chosen });
    render();
    toast('Palette applied.');
  }
});

/* ── sound ─────────────────────────────────────────────────── */

async function initSound() {
  const list = await audio.loadCatalogue();
  const sel = el('soundSelect');
  sel.replaceChildren(...list.map(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = s.label;
    if (s.note) o.title = s.note;
    return o;
  }));
  sel.value = store.state.settings.sound ?? list[0]?.id;
  audio.setVolume(store.state.settings.volume ?? 0.7);
  audio.unlockOnFirstGesture();

  sel.addEventListener('change', () => {
    store.setSetting('sound', sel.value);
    audio.play(sel.value);
  });
  el('testSound').addEventListener('click', () => audio.play(sel.value));
}

/* ── export / import ───────────────────────────────────────── */

el('exportBtn').addEventListener('click', () => {
  const url = URL.createObjectURL(store.exportBlob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `cadence-${store.today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup downloaded.');
});

el('importBtn').addEventListener('click', () => el('importInput').click());

el('importInput').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;

  let data, summary;
  try {
    data = JSON.parse(await file.text());
    summary = store.inspect(data);
  } catch (err) {
    toast(err.message || 'That file could not be read.');
    return;
  }

  const when = summary.exportedAt ? new Date(summary.exportedAt).toLocaleString() : 'unknown date';
  el('importSummary').textContent =
    `${summary.tasks} tasks and ${summary.stretches} stretches, exported ${when}.`;

  const dialog = el('importDialog');
  dialog.showModal();
  await new Promise(r => dialog.addEventListener('close', r, { once: true }));
  const mode = dialog.returnValue;
  if (mode !== 'merge' && mode !== 'replace') return;

  try {
    store.adopt(data, mode);
    resetStretch();
    render();
    toast(mode === 'replace' ? 'Data replaced.' : 'Data merged.');
  } catch (err) {
    toast(err.message || 'Import failed.');
  }
});

/* ── shortcuts ─────────────────────────────────────────────── */

document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (!store.activeTask()) return;

  if (e.key === ' ') {
    e.preventDefault();
    const snap = timer.state;
    snap.awaiting ? askToContinue(snap) : timer.toggle();
  }
  else if (e.key.toLowerCase() === 'r') timer.reset();
  else if (e.key.toLowerCase() === 's') timer.skip();
  else if (e.key === '+') timer.adjustCount(1);
  else if (e.key === '-') timer.adjustCount(-1);
});

window.addEventListener('beforeunload', e => {
  if (timer.state.count > 0) { e.preventDefault(); e.returnValue = ''; }
});

/* ── toast ─────────────────────────────────────────────────── */

let toastTimer;
function toast(message) {
  const node = el('toast');
  node.textContent = message;
  node.classList.add('toast--on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('toast--on'), 2600);
}

/* ── go ────────────────────────────────────────────────────── */

store.load();
render();
initSound();

// offline shell; harmless when opened over plain http on a LAN address
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
  });
}

if (window.Notification && Notification.permission === 'default') {
  document.addEventListener('pointerdown', () => Notification.requestPermission?.(), { once: true });
}
