const state = {
  workspacePath: '',
  sessionId: '',
  pages: [],
  currentPageId: null,
  currentFragment: '',
  selectedNodeId: null,
  dragging: null,
};

const el = (id) => document.getElementById(id);
const engineStatus = el('engine-status');
const workspaceInput = el('workspace-path');
const sessionInput = el('session-id');
const canvasWidthInput = el('canvas-width');
const canvasHeightInput = el('canvas-height');
const promptInput = el('prompt');
const pagesList = el('pages');
const canvas = el('canvas');
const selectedNodeInput = el('selected-node');
const selectedTextInput = el('selected-text');
const selectedXInput = el('selected-x');
const selectedYInput = el('selected-y');
const selectedFontInput = el('selected-font');
const selectedColorInput = el('selected-color');
const eventsBox = el('events');

const logEvent = (message) => {
  const now = new Date().toISOString();
  eventsBox.textContent = `[${now}] ${message}\n` + eventsBox.textContent;
};

async function rpc(method, params = {}) {
  const res = await fetch('/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: `${Date.now()}`, method, params }),
  });
  const payload = await res.json();
  if (payload.error) {
    throw new Error(payload.error.message || 'RPC error');
  }
  return payload.result;
}

async function checkEngine() {
  try {
    const res = await fetch('/health');
    if (!res.ok) throw new Error('health check failed');
    engineStatus.textContent = 'Engine: connected';
  } catch (error) {
    engineStatus.textContent = `Engine: ${error.message}`;
  }
}

function updateStateFromInputs() {
  state.workspacePath = workspaceInput.value.trim();
  state.sessionId = sessionInput.value.trim();
}

function canvasSpec() {
  return {
    widthPx: Number(canvasWidthInput.value) || 1920,
    heightPx: Number(canvasHeightInput.value) || 1080,
  };
}

function clearSelection() {
  const selected = canvas.querySelector('.selected');
  if (selected) selected.classList.remove('selected');
  state.selectedNodeId = null;
  selectedNodeInput.value = '';
  selectedTextInput.value = '';
  selectedXInput.value = '';
  selectedYInput.value = '';
  selectedFontInput.value = '';
  selectedColorInput.value = '';
}

function parseNumber(value) {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function getStyleNumber(element, key) {
  const value = element.style[key] || window.getComputedStyle(element)[key];
  const num = parseNumber(String(value).replace('px', ''));
  return num ?? 0;
}

function selectNode(target) {
  clearSelection();
  target.classList.add('selected');
  state.selectedNodeId = target.dataset.nodeId;
  selectedNodeInput.value = state.selectedNodeId;
  selectedTextInput.value = target.textContent.trim();
  selectedXInput.value = getStyleNumber(target, 'left');
  selectedYInput.value = getStyleNumber(target, 'top');
  selectedFontInput.value = getStyleNumber(target, 'fontSize');
  selectedColorInput.value = target.style.color || '';
}

async function applyPatch(patch) {
  if (!state.currentPageId) return;
  await rpc('deck.patch.apply', {
    workspacePath: state.workspacePath,
    sessionId: state.sessionId,
    pageId: state.currentPageId,
    patch,
    actor: 'web-editor',
  });
}

async function applyInspectorChanges() {
  if (!state.selectedNodeId) return;
  const patch = [];
  const text = selectedTextInput.value;
  if (typeof text === 'string') {
    patch.push({ op: 'setText', nodeId: state.selectedNodeId, value: text });
  }
  const x = parseNumber(selectedXInput.value);
  const y = parseNumber(selectedYInput.value);
  const fontSize = parseNumber(selectedFontInput.value);
  const color = selectedColorInput.value.trim();
  if (x !== null) patch.push({ op: 'setStyle', nodeId: state.selectedNodeId, name: 'left', value: `${x}px` });
  if (y !== null) patch.push({ op: 'setStyle', nodeId: state.selectedNodeId, name: 'top', value: `${y}px` });
  if (fontSize !== null) patch.push({ op: 'setStyle', nodeId: state.selectedNodeId, name: 'font-size', value: `${fontSize}px` });
  if (color) patch.push({ op: 'setStyle', nodeId: state.selectedNodeId, name: 'color', value: color });
  if (patch.length === 0) return;
  await applyPatch(patch);
  await loadPages();
}

function attachCanvasHandlers() {
  canvas.addEventListener('mousedown', (event) => {
    const target = event.target.closest('[data-node-id]');
    if (!target) return;
    selectNode(target);
    const startX = event.clientX;
    const startY = event.clientY;
    const initialLeft = getStyleNumber(target, 'left');
    const initialTop = getStyleNumber(target, 'top');
    state.dragging = { target, startX, startY, initialLeft, initialTop };
  });

  window.addEventListener('mousemove', (event) => {
    if (!state.dragging) return;
    const { target, startX, startY, initialLeft, initialTop } = state.dragging;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const nextLeft = Math.round(initialLeft + dx);
    const nextTop = Math.round(initialTop + dy);
    target.style.left = `${nextLeft}px`;
    target.style.top = `${nextTop}px`;
    selectedXInput.value = nextLeft;
    selectedYInput.value = nextTop;
  });

  window.addEventListener('mouseup', async () => {
    if (!state.dragging || !state.selectedNodeId) return;
    const { target } = state.dragging;
    state.dragging = null;
    await applyPatch([
      { op: 'setStyle', nodeId: state.selectedNodeId, name: 'left', value: target.style.left },
      { op: 'setStyle', nodeId: state.selectedNodeId, name: 'top', value: target.style.top },
    ]);
  });
}

async function loadPages() {
  updateStateFromInputs();
  const result = await rpc('deck.get', {
    workspacePath: state.workspacePath,
    sessionId: state.sessionId,
  });
  state.pages = result.pages || [];
  pagesList.innerHTML = '';
  state.pages.forEach((page, index) => {
    const li = document.createElement('li');
    li.textContent = page.pageId;
    li.addEventListener('click', () => selectPage(page.pageId));
    if (index === 0 && !state.currentPageId) {
      state.currentPageId = page.pageId;
    }
    pagesList.appendChild(li);
  });
  if (state.currentPageId) {
    await selectPage(state.currentPageId);
  } else {
    canvas.innerHTML = '<div class="empty">No pages yet</div>';
  }
}

async function selectPage(pageId) {
  updateStateFromInputs();
  state.currentPageId = pageId;
  const result = await rpc('deck.get', {
    workspacePath: state.workspacePath,
    sessionId: state.sessionId,
    pageId,
  });
  state.currentFragment = result.fragment;
  renderFragment(result.fragment);
  Array.from(pagesList.children).forEach((li) => {
    li.classList.toggle('active', li.textContent === pageId);
  });
}

function renderFragment(fragment) {
  const { widthPx, heightPx } = canvasSpec();
  canvas.style.width = `${widthPx}px`;
  canvas.style.height = `${heightPx}px`;
  canvas.innerHTML = fragment;
  const root = canvas.querySelector('[data-deck-root="true"]');
  if (root) {
    root.style.position = 'relative';
    root.style.width = '100%';
    root.style.height = '100%';
  }
  clearSelection();
}

async function initWorkspace() {
  updateStateFromInputs();
  await rpc('workspace.init', { workspacePath: state.workspacePath });
  logEvent('workspace.init completed');
}

async function createSession() {
  updateStateFromInputs();
  await rpc('generate.createSession', {
    workspacePath: state.workspacePath,
    sessionId: state.sessionId,
    canvasSpec: canvasSpec(),
  });
  logEvent(`session ${state.sessionId} created`);
  await loadPages();
}

async function generateSession() {
  updateStateFromInputs();
  const result = await rpc('generate.start', {
    workspacePath: state.workspacePath,
    sessionId: state.sessionId,
    prompt: promptInput.value,
    canvasSpec: canvasSpec(),
  });
  logEvent(`generation started: ${result.jobId}`);
}

async function exportSession(format) {
  updateStateFromInputs();
  const result = await rpc('export.start', {
    workspacePath: state.workspacePath,
    sessionId: state.sessionId,
    format,
    canvasSpec: canvasSpec(),
  });
  logEvent(`export ${format} started: ${result.jobId}`);
}

function setupEvents() {
  const source = new EventSource('/events');
  ['generation.progress', 'export.progress', 'job.completed', 'job.failed', 'job.cancelled'].forEach((type) => {
    source.addEventListener(type, (event) => {
      logEvent(`${type} ${event.data}`);
    });
  });
  source.onerror = () => {
    logEvent('SSE disconnected');
  };
}

el('btn-init').addEventListener('click', () => initWorkspace().catch((err) => logEvent(err.message)));
el('btn-create').addEventListener('click', () => createSession().catch((err) => logEvent(err.message)));
el('btn-generate').addEventListener('click', () => generateSession().catch((err) => logEvent(err.message)));
el('btn-refresh').addEventListener('click', () => loadPages().catch((err) => logEvent(err.message)));
el('btn-export-png').addEventListener('click', () => exportSession('png').catch((err) => logEvent(err.message)));
el('btn-export-pdf').addEventListener('click', () => exportSession('pdf').catch((err) => logEvent(err.message)));
el('btn-apply').addEventListener('click', () => applyInspectorChanges().catch((err) => logEvent(err.message)));

attachCanvasHandlers();
checkEngine();
setupEvents();
