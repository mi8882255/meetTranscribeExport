// Общий слой хранения и форматирования. Подключается как обычный (не module) script —
// через content_scripts (content.js), importScripts (background.js) или <script> тег
// (popup.js/options.js) — во всех этих контекстах top-level `const` из этого файла
// доступен без префикса, а self.TranscriptStorage — универсальный способ достать явно
// (self существует и в окне, и в service worker, в отличие от window).

const DEFAULT_SETTINGS = {
  containerSelector: '[aria-label="Captions"], [aria-label="Субтитры"]',
  entrySelector: ':scope > div',
  commitDelayMs: 1200,
  debug: false,
  autoExportEnabled: true,
  autoExportFormat: 'txt', // 'txt' | 'json' | 'both'
};

function sanitizeFilename(str) {
  return String(str).replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'meeting';
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function buildFilename(session, ext) {
  const dateStr = (session.startedAt || '').slice(0, 16).replace(/[:T]/g, '-');
  return `${sanitizeFilename(session.title)}_${dateStr}.${ext}`;
}

function buildTxt(session) {
  const header = [
    `Meeting: ${session.title}`,
    `Date: ${new Date(session.startedAt).toLocaleString()}`,
    `Meeting code: ${session.meetingCode}`,
    '',
  ].join('\n');
  const body = session.lines
    .map((l) => `[${new Date(l.time).toLocaleTimeString()}] ${l.speaker}: ${l.text}`)
    .join('\n');
  return `${header}\n${body}\n`;
}

function buildJson(session) {
  return JSON.stringify(session, null, 2);
}

const TranscriptStorage = {
  DEFAULT_SETTINGS,
  sanitizeFilename,
  toBase64Utf8,
  buildFilename,
  buildTxt,
  buildJson,

  async getSettings() {
    const { settings } = await chrome.storage.local.get('settings');
    return { ...DEFAULT_SETTINGS, ...(settings || {}) };
  },

  async saveSettings(partial) {
    const current = await this.getSettings();
    const next = { ...current, ...partial };
    await chrome.storage.local.set({ settings: next });
    return next;
  },

  async getSessions() {
    const { sessions } = await chrome.storage.local.get('sessions');
    return sessions || {};
  },

  async getSession(id) {
    const sessions = await this.getSessions();
    return sessions[id] || null;
  },

  async upsertSession(session) {
    const sessions = await this.getSessions();
    sessions[session.id] = session;
    await chrome.storage.local.set({ sessions });
  },

  async deleteSession(id) {
    const sessions = await this.getSessions();
    delete sessions[id];
    await chrome.storage.local.set({ sessions });
  },

  // Привязка сессии к вкладке — хранится отдельно от самой сессии, чтобы фоновый
  // service worker мог найти сессию по tabId при закрытии вкладки, даже если он
  // перезапустился (и потерял всё, что было только в памяти) между сообщениями.
  async setTabSession(tabId, sessionId) {
    const { tabSessions } = await chrome.storage.local.get('tabSessions');
    const next = { ...(tabSessions || {}), [tabId]: sessionId };
    await chrome.storage.local.set({ tabSessions: next });
  },

  async getTabSession(tabId) {
    const { tabSessions } = await chrome.storage.local.get('tabSessions');
    return (tabSessions || {})[tabId] || null;
  },

  async clearTabSession(tabId) {
    const { tabSessions } = await chrome.storage.local.get('tabSessions');
    const next = { ...(tabSessions || {}) };
    delete next[tabId];
    await chrome.storage.local.set({ tabSessions: next });
  },
};

self.TranscriptStorage = TranscriptStorage;
