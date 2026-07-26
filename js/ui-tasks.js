/* ============================================================
   ui-tasks.js — the left rail and the task editor.
   ============================================================ */

import { state, getTask } from './store.js';
import { parseDuration, formatDuration } from './timer.js';
import { PRESETS, defaultPalette } from './palette.js';

const el = id => document.getElementById(id);

export function renderRail({ onSelect }) {
  const list = el('taskList');
  el('railHint').hidden = state.tasks.length > 0;

  list.replaceChildren(...state.tasks.map(task => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'taskitem';
    btn.type = 'button';
    btn.style.setProperty('--dot', task.palette?.accent ?? 'currentColor');
    if (task.id === state.settings.activeTaskId) btn.setAttribute('aria-current', 'true');

    const name = document.createElement('span');
    name.className = 'taskitem__name';
    name.textContent = task.name;

    const meta = document.createElement('span');
    meta.className = 'taskitem__meta';
    meta.textContent = `${formatDuration(task.focusSec)} / ${formatDuration(task.breakSec)}`;

    btn.append(name, meta);
    btn.addEventListener('click', () => onSelect(task.id));
    li.append(btn);
    return li;
  }));
}

/** Palette handed to a brand new task: walk the presets so successive tasks differ. */
export const nextPalette = () => {
  const { name, ...colors } = PRESETS[state.tasks.length % PRESETS.length];
  return colors;
};

/**
 * Opens the task editor.
 * @param {string|null} taskId  null creates a new task
 * @returns {Promise<{action:'save'|'delete'|'cancel', data?:object}>}
 */
export function openTaskDialog(taskId) {
  const dialog = el('taskDialog');
  const task = taskId ? getTask(taskId) : null;

  el('taskDialogTitle').textContent = task ? 'Edit task' : 'New task';
  el('fName').value = task?.name ?? '';
  el('fFocus').value = formatDuration(task?.focusSec ?? 1500);
  el('fBreak').value = formatDuration(task?.breakSec ?? 300);
  el('saveTaskBtn').textContent = task ? 'Save changes' : 'Create task';
  el('deleteTaskBtn').hidden = !task;

  return new Promise(resolve => {
    const form = el('taskForm');
    let outcome = { action: 'cancel' };

    const onDelete = () => {
      if (!confirm(`Delete "${task.name}" and its ledger? This cannot be undone.`)) return;
      outcome = { action: 'delete' };
      dialog.close();
    };

    const onSubmit = e => {
      if (e.submitter?.value === 'cancel') return;
      const focusSec = parseDuration(el('fFocus').value);
      const breakSec = parseDuration(el('fBreak').value);
      const name = el('fName').value.trim();

      if (!name) { e.preventDefault(); el('fName').focus(); return; }
      if (focusSec === null || focusSec < 5) {
        e.preventDefault();
        el('fFocus').setCustomValidity('Use minutes:seconds, at least 5 seconds.');
        el('fFocus').reportValidity();
        return;
      }
      if (breakSec === null) {
        e.preventDefault();
        el('fBreak').setCustomValidity('Use minutes:seconds. Zero is allowed.');
        el('fBreak').reportValidity();
        return;
      }
      outcome = {
        action: 'save',
        data: { name, focusSec, breakSec, palette: task?.palette ?? nextPalette() },
      };
    };

    const clearValidity = e => e.target.setCustomValidity('');

    const onClose = () => {
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('input', clearValidity);
      el('deleteTaskBtn').removeEventListener('click', onDelete);
      resolve(outcome);
    };

    form.addEventListener('submit', onSubmit);
    form.addEventListener('input', clearValidity);
    el('deleteTaskBtn').addEventListener('click', onDelete);
    dialog.addEventListener('close', onClose, { once: true });

    dialog.showModal();
    el('fName').focus();
  });
}

/** Confirms the header line under the task name. */
export function renderStageHead(task) {
  el('taskName').textContent = task.name;
  el('taskMeta').textContent =
    `${formatDuration(task.focusSec)} focus · ${formatDuration(task.breakSec)} break`;
}
