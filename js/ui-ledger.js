/* ============================================================
   ui-ledger.js — the record. Each stretch is drawn as a tally
   strip: one stroke per finished focus unit.
   ============================================================ */

import { stretchesFor, statsFor, deleteStretch, today } from './store.js';
import { formatDuration } from './timer.js';

const el = id => document.getElementById(id);

export const FEELS = {
  fresh: 'Still fresh',
  fading: 'Fading',
  spent: 'Spent',
  interrupted: 'Interrupted',
};

export const CHOICES = {
  want: 'wanted to continue',
  need: 'needed to continue',
  stop: 'chose to stop',
};

/**
 * Builds a tally strip. Each stroke is one finished focus unit; a stroke that
 * followed a "needed to" decision is drawn faint, and a deliberate stop is
 * closed off with a bar.
 */
export function buildTally(count, { live = false, checkins = [] } = {}) {
  const strip = document.createElement('div');
  strip.className = 'tally' + (live ? ' tally--live' : '');

  const decisionBefore = new Map(checkins.map(c => [c.after, c.choice]));
  const shown = Math.min(count, 40);

  for (let i = 0; i < shown; i++) {
    const stroke = document.createElement('i');
    const choice = decisionBefore.get(i);           // the decision that led to this unit
    if (choice === 'need') stroke.className = 'need';
    if (choice) stroke.title = `You ${CHOICES[choice]} before this one`;
    strip.append(stroke);
  }

  if (count > 40) {
    const more = document.createElement('span');
    more.className = 'livetally__count';
    more.textContent = `+${count - 40}`;
    strip.append(more);
  }

  if (checkins.some(c => c.choice === 'stop')) {
    const stop = document.createElement('span');
    stop.className = 'stop';
    stop.title = 'You chose to stop here';
    strip.append(stop);
  }
  return strip;
}

/** "2 wanted, 1 needed, stopped on purpose" — or nothing, if no decisions were logged. */
export function summariseCheckins(checkins = []) {
  if (!checkins.length) return '';
  const want = checkins.filter(c => c.choice === 'want').length;
  const need = checkins.filter(c => c.choice === 'need').length;
  const stopped = checkins.some(c => c.choice === 'stop');
  const parts = [];
  if (want) parts.push(`${want} wanted`);
  if (need) parts.push(`${need} needed`);
  if (stopped) parts.push('stopped on purpose');
  return parts.join(' · ');
}

function dayLabel(dateStr) {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 864e5);
  if (dateStr === today(now)) return 'Today';
  if (dateStr === today(yesterday)) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(y !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

const clockOf = ts => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export function renderLedger(taskId, { onChange } = {}) {
  const body = el('ledgerBody');
  const rows = stretchesFor(taskId);

  renderStats(taskId);

  if (!rows.length) {
    body.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'ledger__empty',
      textContent: 'No stretches recorded for this task yet.',
    }));
    return;
  }

  const byDay = new Map();
  for (const r of rows) {
    if (!byDay.has(r.date)) byDay.set(r.date, []);
    byDay.get(r.date).push(r);
  }

  const anyDecisions = rows.some(r => r.checkins?.length);

  body.replaceChildren(...[...byDay.entries()].map(([date, entries]) => {
    const day = document.createElement('section');
    day.className = 'day';

    const label = document.createElement('div');
    label.className = 'day__label';
    const total = entries.reduce((n, e) => n + e.count, 0);
    label.textContent = `${dayLabel(date)} — ${total} focus ${total === 1 ? 'unit' : 'units'} over ${entries.length} ${entries.length === 1 ? 'stretch' : 'stretches'}`;
    day.append(label);

    entries.sort((a, b) => a.endedAt - b.endedAt).forEach(entry => {
      const row = document.createElement('article');
      row.className = 'entry';

      row.append(buildTally(entry.count, { checkins: entry.checkins }));

      const note = document.createElement('p');
      note.className = 'entry__note';
      if (entry.feel) {
        const tag = document.createElement('span');
        tag.className = 'entry__feel';
        tag.textContent = FEELS[entry.feel] ?? entry.feel;
        note.append(tag);
      }
      if (entry.note) note.append(document.createTextNode(entry.note));
      else if (!entry.feel) note.append(Object.assign(document.createElement('em'), { textContent: 'No note' }));

      const decisions = summariseCheckins(entry.checkins);
      if (decisions) {
        note.append(document.createElement('br'));
        note.append(Object.assign(document.createElement('em'), { textContent: decisions }));
      }
      row.append(note);

      const side = document.createElement('div');
      side.className = 'entry__side';
      const meta = document.createElement('span');
      meta.textContent = `${entry.count} × ${formatDuration(entry.focusSec)} · ${clockOf(entry.endedAt)}`;
      const del = document.createElement('button');
      del.className = 'entry__del';
      del.type = 'button';
      del.title = 'Delete this stretch';
      del.setAttribute('aria-label', 'Delete this stretch');
      del.textContent = '×';
      del.addEventListener('click', () => {
        deleteStretch(entry.id);
        onChange?.();
      });
      side.append(meta, del);
      row.append(side);

      day.append(row);
    });

    return day;
  }));

  if (anyDecisions) {
    const legend = document.createElement('p');
    legend.className = 'legend';
    legend.innerHTML =
      '<span><b>Full stroke</b> — you wanted to continue</span>' +
      '<span><b>Faint stroke</b> — you needed to</span>' +
      '<span><b>End bar</b> — you chose to stop</span>';
    body.append(legend);
  }
}

function renderStats(taskId) {
  const s = statsFor(taskId);
  const items = [
    ['Today', String(s.todayCount)],
    ['Typical stretch', s.stretches ? s.avg.toFixed(1) : '—'],
    ['Longest', s.best ? String(s.best) : '—'],
    ['All time', String(s.total)],
  ];
  el('stats').replaceChildren(...items.map(([key, val]) => {
    const wrap = document.createElement('div');
    wrap.className = 'stat';
    wrap.append(
      Object.assign(document.createElement('span'), { className: 'stat__val', textContent: val }),
      Object.assign(document.createElement('span'), { className: 'stat__key', textContent: key }),
    );
    return wrap;
  }));
}

/**
 * Asks whether to start another focus unit, and why.
 * @returns {Promise<'want'|'need'|'stop'|null>} null if dismissed
 */
export function openContinueDialog({ count, breakSec, focusSec }) {
  const dialog = el('continueDialog');
  const choices = el('choices');
  let picked = null;

  el('continueTitle').textContent = breakSec > 0 ? 'Break\u2019s over' : 'Unit finished';
  el('continueSummary').textContent =
    `${count} focus ${count === 1 ? 'unit' : 'units'} so far. Another ${formatDuration(focusSec)}?`;

  const onPick = e => {
    const btn = e.target.closest('.choice');
    if (!btn) return;
    picked = btn.dataset.choice;
    dialog.close(picked);
  };
  const onKey = e => {
    const map = { 1: 'want', 2: 'need', 3: 'stop' };
    if (map[e.key]) { e.preventDefault(); picked = map[e.key]; dialog.close(picked); }
  };

  return new Promise(resolve => {
    choices.addEventListener('click', onPick);
    dialog.addEventListener('keydown', onKey);
    dialog.addEventListener('close', () => {
      choices.removeEventListener('click', onPick);
      dialog.removeEventListener('keydown', onKey);
      resolve(picked);
    }, { once: true });
    dialog.showModal();
    choices.querySelector('.choice')?.focus();
  });
}

/**
 * Asks how the stretch went.
 * @returns {Promise<{action:'save'|'discard', note:string, feel:string}>}
 */
export function openNoteDialog({ count, focusSec, checkins = [] }) {
  const dialog = el('noteDialog');
  const chips = [...el('feelChips').querySelectorAll('.chip')];
  let feel = '';

  const decisions = summariseCheckins(checkins);
  el('noteSummary').textContent =
    `${count} focus ${count === 1 ? 'unit' : 'units'} of ${formatDuration(focusSec)}`
    + (decisions ? ` — ${decisions}.` : '.') + ' How did it end?';
  el('fNote').value = '';
  chips.forEach(c => c.setAttribute('aria-pressed', 'false'));

  const onChip = e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const value = chip.dataset.feel;
    feel = feel === value ? '' : value;
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.feel === feel)));
  };

  return new Promise(resolve => {
    el('feelChips').addEventListener('click', onChip);
    dialog.addEventListener('close', () => {
      el('feelChips').removeEventListener('click', onChip);
      resolve({
        action: dialog.returnValue === 'discard' ? 'discard' : 'save',
        note: el('fNote').value.trim(),
        feel,
      });
    }, { once: true });
    dialog.showModal();
    el('fNote').focus();
  });
}
