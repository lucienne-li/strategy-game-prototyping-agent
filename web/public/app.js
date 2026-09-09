const state = { sessionId: null, mode: 'demo', source: null, visualSubmitted: false, events: [] };
const $ = (selector) => document.querySelector(selector);
const form = $('#prompt-form');
const prompt = $('#prompt');
const generate = $('#generate');
const progress = $('#progress');
const frame = $('#preview-frame');
const placeholder = $('#preview-placeholder');
const terminal = $('#terminal');

boot();

async function boot() {
  const config = await getJson('/api/config');
  const liveButton = $('[data-mode="live"]');
  liveButton.disabled = !config.liveAvailable;
  liveButton.title = config.liveAvailable ? 'Use the configured server-side model' : 'OPENAI_API_KEY is not configured on the server';
  $('#runtime-status').textContent = config.liveAvailable ? 'Runtime + model ready' : 'Runtime ready · Demo available';
}

$('#mode-choice').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-mode]');
  if (!button || button.disabled) return;
  state.mode = button.dataset.mode;
  document.querySelectorAll('#mode-choice button').forEach((item) => item.classList.toggle('active', item === button));
  $('#mode-badge').textContent = state.mode === 'demo' ? 'DEMO MODE' : 'LIVE MODEL';
  $('#mode-badge').classList.toggle('live', state.mode === 'live');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  resetRun();
  generate.disabled = true;
  generate.querySelector('span').textContent = 'Starting…';
  const request = prompt.value.trim();
  $('#user-message').textContent = request;
  $('#user-message').classList.remove('hidden');
  try {
    const session = await getJson('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request, mode: state.mode }) });
    state.sessionId = session.id;
    $('#download').href = `/api/sessions/${session.id}/download`;
    $('#preview-address').textContent = `${location.origin}/preview/${session.id}/`;
    connectEvents(session.id);
  } catch (error) {
    addEvent({ kind: 'error', label: 'Could not start', detail: error.message });
    generate.disabled = false;
  }
});

function connectEvents(id) {
  state.source?.close();
  const source = new EventSource(`/api/sessions/${id}/events`);
  state.source = source;
  source.onmessage = async ({ data }) => {
    const event = JSON.parse(data);
    if (state.events.some((item) => item.id === event.id)) return;
    state.events.push(event);
    addEvent(event);
    if (event.kind === 'preview') {
      await refreshFiles();
      loadPreview();
    }
    if (event.label === 'Evaluation passed' || event.label === 'Evaluator failed' || event.label === 'Complete' || event.label === 'Stopped') {
      await refreshSession();
    }
    if (event.label === 'Complete' || event.label === 'Stopped' || event.label === 'Run failed') {
      source.close();
      generate.disabled = false;
      generate.querySelector('span').textContent = 'Generate prototype';
      await refreshFiles();
    }
  };
}

function addEvent(event) {
  progress.querySelector('.empty-state')?.remove();
  const item = document.createElement('div');
  item.className = `progress-item ${event.kind}`;
  item.innerHTML = `<span class="event-icon">${event.kind === 'success' ? '●' : event.kind === 'error' ? '×' : event.kind === 'repair' ? '↻' : event.kind === 'tool' ? '›_' : '○'}</span><div><strong></strong><small></small></div><time></time>`;
  item.querySelector('strong').textContent = event.label;
  item.querySelector('small').textContent = event.detail || '';
  item.querySelector('time').textContent = new Date(event.at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  progress.append(item);
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('#run-state').textContent = event.label;
  const logLine = `[${event.kind.toUpperCase()}] ${event.label}${event.detail ? ` — ${event.detail}` : ''}`;
  terminal.textContent = terminal.textContent.includes('$ waiting') ? logLine : `${terminal.textContent}\n${logLine}`;
  terminal.scrollTop = terminal.scrollHeight;
  if (event.label === 'Repairing') setStatus('repair', 'Running', 'pending');
}

async function refreshSession() {
  if (!state.sessionId) return;
  const session = await getJson(`/api/sessions/${state.sessionId}`);
  if (session.finalResponse) {
    $('#final-message p').textContent = session.finalResponse;
    $('#final-message').classList.remove('hidden');
  }
  const evaluation = session.evaluation;
  if (!evaluation) return;
  setStatus('build', evaluation.filesValid && evaluation.buildArtifactMatches ? 'Passed' : 'Failed', evaluation.filesValid && evaluation.buildArtifactMatches ? 'pass' : 'fail');
  setStatus('functional', evaluation.logicPassed && evaluation.uiPassed && evaluation.launchPassed ? 'Passed' : 'Failed', evaluation.logicPassed && evaluation.uiPassed && evaluation.launchPassed ? 'pass' : 'fail');
  setStatus('visual', evaluation.visualPassed ? 'Passed' : 'Failed', evaluation.visualPassed ? 'pass' : 'fail');
  const repaired = state.events.some((event) => event.label === 'Repairing');
  setStatus('repair', repaired ? (evaluation.passed ? 'Passed' : 'Failed') : 'Not used', repaired ? (evaluation.passed ? 'pass' : 'fail') : 'neutral');
}

async function refreshFiles() {
  if (!state.sessionId) return;
  const { files } = await getJson(`/api/sessions/${state.sessionId}/files`);
  const tree = $('#file-tree');
  tree.replaceChildren();
  for (const file of files) {
    const button = document.createElement('button');
    button.className = 'file-button';
    button.dataset.depth = String(file.split('/').length - 1);
    button.textContent = `${file.includes('/') ? '└ ' : ''}${file}`;
    button.addEventListener('click', () => showFile(file, button));
    tree.append(button);
  }
  $('#file-count').textContent = `${files.length} generated files · evaluator and secrets excluded`;
  $('#download').classList.toggle('disabled', files.length === 0);
  $('#download').setAttribute('aria-disabled', String(files.length === 0));
}

async function showFile(file, button) {
  document.querySelectorAll('.file-button').forEach((item) => item.classList.remove('active'));
  button.classList.add('active');
  const data = await getJson(`/api/sessions/${state.sessionId}/file?path=${encodeURIComponent(file)}`);
  $('#file-name').textContent = data.path;
  $('#file-content code').textContent = data.content;
}

function loadPreview() {
  if (!state.sessionId) return;
  state.visualSubmitted = false;
  frame.src = `/preview/${state.sessionId}/?v=${Date.now()}`;
  frame.style.display = 'block';
  placeholder.classList.add('hidden');
}

const previewChecks = new Map();
window.addEventListener('message', async (event) => {
  const check = event.data;
  if (event.source !== frame.contentWindow || !state.sessionId || check?.type !== 'strategy-preview-check' || check.sessionId !== state.sessionId || state.visualSubmitted) return;
  previewChecks.set(check.phase, check);
  const before = previewChecks.get('before');
  const after = previewChecks.get('after');
  if (!before || !after) return;
  state.visualSubmitted = true;
  const rendered = before.rendered === true && after.rendered === true;
  const controlsVisible = before.controlsVisible === true && after.controlsVisible === true;
  const noObviousOverflow = before.noObviousOverflow === true && after.noObviousOverflow === true;
  const interactionPassed = before.energy === '3' && before.enemyHp === '20' && after.energy === '2' && after.enemyHp === '14';
  const result = { passed: rendered && controlsVisible && noObviousOverflow && interactionPassed, rendered, nonBlank: rendered, controlsVisible, noObviousOverflow, interactionPassed };
  await getJson(`/api/sessions/${state.sessionId}/visual`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result) });
});

$('#reload-preview').addEventListener('click', () => { if (state.sessionId) frame.src = `/preview/${state.sessionId}/?v=${Date.now()}`; });
document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === button));
  $('#preview-view').classList.toggle('active', button.dataset.tab === 'preview');
  $('#code-view').classList.toggle('active', button.dataset.tab === 'code');
}));

function setStatus(name, text, style) { const element = $(`#test-${name}`); element.textContent = text; element.className = `test-status ${style}`; }
function resetRun() {
  state.visualSubmitted = false; state.events = []; state.source?.close(); progress.innerHTML = ''; terminal.textContent = '';
  ['build','functional','visual'].forEach((name) => setStatus(name, 'Pending', 'pending')); setStatus('repair','Not used','neutral');
  $('#final-message').classList.add('hidden'); $('#download').classList.add('disabled'); $('#run-state').textContent = 'Starting';
}
async function getJson(url, options) { const response = await fetch(url, options); const value = await response.json(); if (!response.ok) throw new Error(value.error || `Request failed: ${response.status}`); return value; }
