// Захватывает живые субтитры Google Meet и сохраняет их через TranscriptStorage.
//
// ВАЖНО: Google Meet не даёт официального API для субтитров — этот скрипт читает
// DOM-разметку панели субтитров, а она у Google меняется без предупреждения.
// Если бейдж в углу экрана показывает «субтитры не найдены» при включённых
// субтитрах — откройте настройки расширения (options) и подправьте селекторы,
// глядя в DevTools (Inspect element на строке субтитров).

(async function () {
  const Storage = window.TranscriptStorage;

  let settings = await Storage.getSettings();
  let session = createSession();
  chrome.runtime.sendMessage({ type: 'session-started', sessionId: session.id }).catch(() => {});
  let persisted = false;
  let containerAttached = false;
  let containerObserver = null;
  let bodyObserver = null;
  let pendingRefresh = false;
  let lastKnownSpeaker = '';
  const trackedNodes = new Map();

  function logDebug(...args) {
    if (settings.debug) console.log('[MeetTranscriptExport]', ...args);
  }

  // Google Meet сам держит document.title равным теме встречи — используем его
  // напрямую вместо хрупких DOM-селекторов, которые у Google меняются без предупреждения.
  function refreshTitle() {
    const title = (document.title && document.title.trim()) || '';
    if (title) session.title = title;
  }

  function createSession() {
    const meetingCode = location.pathname.replace(/^\//, '') || 'unknown';
    return {
      id: `${meetingCode}_${Date.now()}`,
      meetingCode,
      title: document.title || 'Untitled meeting',
      startedAt: new Date().toISOString(),
      endedAt: null,
      lines: [],
    };
  }

  function persistSession() {
    Storage.upsertSession(session).catch((e) => logDebug('ошибка сохранения', e));
  }

  function isControlNode(node) {
    return !!node.querySelector('button, [role="button"]');
  }

  function extractEntryData(node) {
    const children = Array.from(node.children || []);
    let speaker = '';
    let text = '';
    if (children.length >= 2) {
      speaker = (children[0].textContent || '').trim();
      text = children
        .slice(1)
        .map((c) => (c.textContent || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
    } else {
      text = (node.textContent || '').trim();
    }
    return { speaker, text };
  }

  function commitEntry(node) {
    const state = trackedNodes.get(node);
    if (!state || !state.text) return;
    if (state.speaker) lastKnownSpeaker = state.speaker;
    const line = {
      time: new Date().toISOString(),
      speaker: state.speaker || lastKnownSpeaker || 'Unknown',
      text: state.text,
    };
    if (state.lineIndex == null) {
      state.lineIndex = session.lines.length;
      session.lines.push(line);
    } else {
      session.lines[state.lineIndex] = line;
    }
    persisted = true;
    persistSession();
    renderBadge();
  }

  function refreshEntries(container) {
    let nodes;
    try {
      nodes = Array.from(container.querySelectorAll(settings.entrySelector)).filter(
        (node) => !isControlNode(node)
      );
    } catch (e) {
      logDebug('некорректный entrySelector', settings.entrySelector, e);
      return;
    }
    const currentSet = new Set(nodes);

    for (const [node, state] of trackedNodes) {
      if (!currentSet.has(node) || !document.contains(node)) {
        clearTimeout(state.timer);
        commitEntry(node);
        trackedNodes.delete(node);
      }
    }

    for (const node of nodes) {
      const data = extractEntryData(node);
      let state = trackedNodes.get(node);
      if (!state) {
        state = { text: '', speaker: '', lineIndex: null, timer: null };
        trackedNodes.set(node, state);
      }
      if (data.text !== state.text || (data.speaker && data.speaker !== state.speaker)) {
        state.text = data.text;
        state.speaker = data.speaker || state.speaker;
        clearTimeout(state.timer);
        state.timer = setTimeout(() => commitEntry(node), settings.commitDelayMs);
      }
    }
  }

  function scheduleRefresh(container) {
    if (pendingRefresh) return;
    pendingRefresh = true;
    requestAnimationFrame(() => {
      pendingRefresh = false;
      refreshEntries(container);
    });
  }

  function checkContainer() {
    let container = null;
    try {
      container = document.querySelector(settings.containerSelector);
    } catch (e) {
      logDebug('некорректный containerSelector', settings.containerSelector, e);
    }

    if (container && !containerAttached) {
      containerAttached = true;
      logDebug('контейнер субтитров найден', container);
      containerObserver = new MutationObserver(() => scheduleRefresh(container));
      containerObserver.observe(container, { childList: true, subtree: true, characterData: true });
      refreshEntries(container);
      renderBadge();
    } else if (!container && containerAttached) {
      containerAttached = false;
      logDebug('контейнер субтитров пропал из DOM');
      if (containerObserver) {
        containerObserver.disconnect();
        containerObserver = null;
      }
      renderBadge();
    }
  }

  function ensureBadge() {
    let el = document.getElementById('__meetTranscriptBadge');
    if (el) return el;
    el = document.createElement('div');
    el.id = '__meetTranscriptBadge';
    el.style.cssText = [
      'position:fixed', 'bottom:16px', 'right:16px', 'z-index:999999',
      'background:rgba(32,33,36,0.9)', 'color:#fff',
      'font:12px/1.4 Roboto,Arial,sans-serif', 'padding:6px 10px',
      'border-radius:8px', 'box-shadow:0 1px 4px rgba(0,0,0,.4)',
      'cursor:pointer', 'user-select:none',
    ].join(';');
    el.title = 'Meet Transcript Export — клик, чтобы свернуть/развернуть';
    el.addEventListener('click', () => {
      el.dataset.collapsed = el.dataset.collapsed === '1' ? '0' : '1';
      renderBadge();
    });
    document.body.appendChild(el);
    return el;
  }

  function renderBadge() {
    refreshTitle();
    const el = ensureBadge();
    if (el.dataset.collapsed === '1') {
      el.textContent = '📝';
      return;
    }
    const state = containerAttached ? '🟢 захват идёт' : '⚪ субтитры не найдены';
    el.textContent = `📝 ${state} · строк: ${session.lines.length}`;
  }

  bodyObserver = new MutationObserver(() => checkContainer());
  bodyObserver.observe(document.body, { childList: true, subtree: true });
  checkContainer();
  renderBadge();
  setInterval(renderBadge, 3000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      settings = { ...Storage.DEFAULT_SETTINGS, ...changes.settings.newValue };
      logDebug('настройки обновлены, переинициализация', settings);
      if (containerObserver) {
        containerObserver.disconnect();
        containerObserver = null;
      }
      containerAttached = false;
      trackedNodes.clear();
      checkContainer();
    }
  });

  window.addEventListener('beforeunload', () => {
    session.endedAt = new Date().toISOString();
    if (persisted) {
      persistSession();
      chrome.runtime.sendMessage({ type: 'session-ending', sessionId: session.id }).catch(() => {});
    }
  });
})();
