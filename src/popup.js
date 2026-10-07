function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function exportTxt(session) {
  const Storage = window.TranscriptStorage;
  download(Storage.buildFilename(session, 'txt'), Storage.buildTxt(session), 'text/plain');
}

function exportJson(session) {
  const Storage = window.TranscriptStorage;
  download(Storage.buildFilename(session, 'json'), Storage.buildJson(session), 'application/json');
}

async function removeSession(session) {
  if (!confirm(`Удалить транскрипт «${session.title}»?`)) return;
  await window.TranscriptStorage.deleteSession(session.id);
  render();
}

async function render() {
  const list = document.getElementById('list');
  const sessions = await window.TranscriptStorage.getSessions();
  const items = Object.values(sessions).sort(
    (a, b) => new Date(b.startedAt) - new Date(a.startedAt)
  );

  if (!items.length) {
    list.innerHTML = '<div class="empty">Пока нет сохранённых транскриптов.<br>Откройте звонок в Google Meet со включёнными субтитрами.</div>';
    return;
  }

  list.innerHTML = '';
  for (const session of items) {
    const el = document.createElement('div');
    el.className = 'session';
    const date = new Date(session.startedAt).toLocaleString();
    el.innerHTML = `
      <div class="title">${escapeHtml(session.title)}</div>
      <div class="meta">${date} · ${session.lines.length} строк · ${escapeHtml(session.meetingCode)}</div>
      <div class="actions">
        <button data-action="txt">Экспорт TXT</button>
        <button data-action="json">Экспорт JSON</button>
        <button data-action="delete">Удалить</button>
      </div>
    `;
    el.querySelector('[data-action="txt"]').addEventListener('click', () => exportTxt(session));
    el.querySelector('[data-action="json"]').addEventListener('click', () => exportJson(session));
    el.querySelector('[data-action="delete"]').addEventListener('click', () => removeSession(session));
    list.appendChild(el);
  }
}

document.getElementById('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
