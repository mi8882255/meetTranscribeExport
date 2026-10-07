const containerSelectorEl = document.getElementById('containerSelector');
const entrySelectorEl = document.getElementById('entrySelector');
const commitDelayMsEl = document.getElementById('commitDelayMs');
const debugEl = document.getElementById('debug');
const autoExportEnabledEl = document.getElementById('autoExportEnabled');
const autoExportFormatEl = document.getElementById('autoExportFormat');
const statusEl = document.getElementById('status');

async function load() {
  const settings = await window.TranscriptStorage.getSettings();
  containerSelectorEl.value = settings.containerSelector;
  entrySelectorEl.value = settings.entrySelector;
  commitDelayMsEl.value = settings.commitDelayMs;
  debugEl.checked = !!settings.debug;
  autoExportEnabledEl.checked = !!settings.autoExportEnabled;
  autoExportFormatEl.value = settings.autoExportFormat;
}

async function save() {
  await window.TranscriptStorage.saveSettings({
    containerSelector: containerSelectorEl.value.trim(),
    entrySelector: entrySelectorEl.value.trim(),
    commitDelayMs: Number(commitDelayMsEl.value) || window.TranscriptStorage.DEFAULT_SETTINGS.commitDelayMs,
    debug: debugEl.checked,
    autoExportEnabled: autoExportEnabledEl.checked,
    autoExportFormat: autoExportFormatEl.value,
  });
  statusEl.textContent = 'Сохранено. Изменения применятся на открытых вкладках Meet сразу.';
  setTimeout(() => (statusEl.textContent = ''), 3000);
}

async function reset() {
  await window.TranscriptStorage.saveSettings(window.TranscriptStorage.DEFAULT_SETTINGS);
  await load();
  statusEl.textContent = 'Сброшено к значениям по умолчанию.';
  setTimeout(() => (statusEl.textContent = ''), 3000);
}

document.getElementById('save').addEventListener('click', save);
document.getElementById('reset').addEventListener('click', reset);
load();
