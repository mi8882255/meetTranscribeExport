importScripts('storage.js');

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message) return;
  if (message.type === 'session-started' && sender.tab) {
    TranscriptStorage.setTabSession(sender.tab.id, message.sessionId);
  }
  if (message.type === 'session-ending') {
    handleSessionEnd(message.sessionId);
  }
});

async function downloadFile(session, ext) {
  const content = ext === 'json' ? TranscriptStorage.buildJson(session) : TranscriptStorage.buildTxt(session);
  const mime = ext === 'json' ? 'application/json' : 'text/plain';
  const dataUrl = `data:${mime};charset=utf-8;base64,${TranscriptStorage.toBase64Utf8(content)}`;
  const filename = `MeetTranscripts/${TranscriptStorage.buildFilename(session, ext)}`;
  await chrome.downloads.download({ url: dataUrl, filename, saveAs: false, conflictAction: 'uniquify' });
}

async function exportSessionIfNeeded(session) {
  if (!session || session.exported || !session.lines.length) return;
  const settings = await TranscriptStorage.getSettings();
  if (!settings.autoExportEnabled) return;
  const format = settings.autoExportFormat || 'txt';
  if (format === 'txt' || format === 'both') await downloadFile(session, 'txt');
  if (format === 'json' || format === 'both') await downloadFile(session, 'json');
  session.exported = true;
  await TranscriptStorage.upsertSession(session);
}

// Основной путь: content script сам просит выгрузить сессию на beforeunload
// (закрытие вкладки или переход на другой адрес). tabId для него не нужен.
async function handleSessionEnd(sessionId) {
  if (!sessionId) return;
  const session = await TranscriptStorage.getSession(sessionId);
  if (!session) return;
  session.endedAt = session.endedAt || new Date().toISOString();
  await exportSessionIfNeeded(session);
}

// Резервный путь: если сообщение от content script не успело дойти (например,
// вкладку закрыли слишком резко), пробуем найти сессию по tabId при закрытии вкладки.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const sessionId = await TranscriptStorage.getTabSession(tabId);
  await TranscriptStorage.clearTabSession(tabId);
  await handleSessionEnd(sessionId);
});
