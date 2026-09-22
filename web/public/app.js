const state = { ready: false, running: false, sessionId: null, mode: 'demo', source: null, visualSubmitted: false, events: [] };
const $ = (selector) => document.querySelector(selector);
const form = $('#prompt-form');
const prompt = $('#prompt');
const generate = $('#generate');
const progress = $('#progress');
const frame = $('#preview-frame');
const placeholder = $('#preview-placeholder');
const checkFrame = $('#check-frame');
const fixedRequest = prompt.value;
let customRequest = fixedRequest;
const terminal = $('#terminal');

boot();

async function boot() {
  generate.disabled = true;
  try {
    const config = await getJson('/api/config');
    state.ready = true;
    const liveButton = $('[data-mode="live"]');
    liveButton.disabled = !config.liveAvailable;
    liveButton.title = config.liveAvailable ? 'Customize this fixed card activity using the configured AI model' : 'AI customization is unavailable. Guided practice works without a model.';
    $('#runtime-status').textContent = config.liveAvailable ? 'Activity ready · AI configured' : 'Activity ready · AI not configured';
    setMode('demo');
    generate.disabled = false;
  } catch {
    $('#runtime-status').textContent = 'Connection unavailable';
    $('#prompt-error').textContent = 'Cannot connect to the activity server. Reload the page to try again.';
  }
}
function buttonLabel() { return state.mode === 'demo' ? 'Start activity' : 'Generate activity'; }
function setMode(mode) {
  if (state.mode === 'live') customRequest = prompt.value;
  state.mode = mode;
  prompt.readOnly = mode === 'demo';
  prompt.value = mode === 'demo' ? fixedRequest : customRequest;
  document.querySelectorAll('#mode-choice button').forEach(item => {
    const selected = item.dataset.mode === mode;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  $('#mode-badge').textContent = mode === 'demo' ? 'GUIDED PRACTICE' : 'AI CUSTOMIZATION';
  $('#mode-badge').classList.toggle('live', mode === 'live');
  $('#prompt-hint').textContent = mode === 'demo' ? 'Fixed example in guided practice' : '8–8000 characters. Keep HP 20, energy 3, and Strike cost 1 / damage 6.';
  $('#mode-help').textContent = mode === 'demo'
    ? 'Guided practice builds a fixed, playable example with prediction feedback and restart. It does not use AI generation or interpret a custom prompt.'
    : 'Customize presentation or learning explanations within the fixed card-combat rules. Your request is sent to the configured AI provider. Avoid personal information. Generated content needs instructor review.';
  generate.querySelector('span').textContent = buttonLabel();
}
$('#mode-choice').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-mode]');
  if (!button || button.disabled || state.running) return;
  setMode(button.dataset.mode);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.ready || state.running) return;
  const request = prompt.value.trim();
  if (request.length < 8 || request.length > 8000) {
    $('#prompt-error').textContent = 'Enter 8–8000 characters describing your activity. Keep the stated card-combat rules.';
    prompt.setAttribute('aria-invalid', 'true'); prompt.focus(); return;
  }
  $('#prompt-error').textContent = ''; prompt.removeAttribute('aria-invalid');
  resetRun();
  state.running = true;
  generate.disabled = true;
  generate.querySelector('span').textContent = 'Starting…';
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
    state.running = false;
    $('#prompt-error').textContent = error.message;
    generate.disabled = false;
    generate.querySelector('span').textContent = buttonLabel();
  }
});

function connectEvents(id) {
  state.source?.close();
  const source = new EventSource(`/api/sessions/${id}/events`);
  state.source = source;
  source.onmessage = async ({ data }) => {
    if (state.sessionId !== id) return;
    const event = JSON.parse(data);
    if (state.events.some((item) => item.id === event.id)) return;
    state.events.push(event);
    addEvent(event);
    if (event.kind === 'preview') {
      await refreshFiles();
      loadPreview();
    }
    if (event.label === 'Evaluation passed' || event.label === 'Evaluator failed' || event.label === 'Complete' || event.label === 'Stopped' || event.label === 'Run failed') {
      await refreshSession();
    }
    if (event.label === 'Complete' || event.label === 'Stopped' || event.label === 'Run failed') {
      source.close();
      generate.disabled = false;
      state.running = false;
      generate.querySelector('span').textContent = buttonLabel();
      await refreshFiles();
    }
  };
  source.onerror = () => { if (state.sessionId === id && state.running) { $('#run-state').textContent = 'Connection interrupted · reconnecting'; } };
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
  progress.scrollTop = progress.scrollHeight;
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
  $('#file-count').textContent = `${files.length} activity files · download to keep a copy`;
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
  previewChecks.clear();
  checkFrame.src = `/preview/${state.sessionId}/?check=1&v=${Date.now()}`;
  frame.src = `/preview/${state.sessionId}/?v=${Date.now()}`;
  frame.style.display = 'block';
  placeholder.classList.add('hidden');
}

const previewChecks = new Map();
window.addEventListener('message', async (event) => {
  const check = event.data;
  if (event.source !== checkFrame.contentWindow || !state.sessionId || check?.type !== 'strategy-preview-check' || check.sessionId !== state.sessionId || state.visualSubmitted) return;
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
  try {
    await getJson(`/api/sessions/${state.sessionId}/visual`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(result) });
  } catch { $('#prompt-error').textContent = 'Could not send browser-check results. Please start the activity again.'; }
});

$('#reload-preview').addEventListener('click', () => { if (state.sessionId) frame.src = `/preview/${state.sessionId}/?v=${Date.now()}`; });
document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === button));
  $('#preview-view').classList.toggle('active', button.dataset.tab === 'preview');
  $('#code-view').classList.toggle('active', button.dataset.tab === 'code');
}));

function setStatus(name, text, style) { const element = $(`#test-${name}`); element.textContent = text; element.className = `test-status ${style}`; }
function resetRun() {
  state.sessionId = null; state.visualSubmitted = false; state.events = []; previewChecks.clear();
  frame.removeAttribute('src'); checkFrame.removeAttribute('src'); frame.style.display = 'none'; placeholder.classList.remove('hidden');
  $('#preview-address').textContent = 'Preparing activity'; $('#download').removeAttribute('href'); $('#download').setAttribute('aria-disabled','true');
  $('#file-tree').replaceChildren(); $('#file-content code').textContent = ''; $('#file-name').textContent = 'Select a file'; $('#file-count').textContent = 'No generated files'; state.source?.close(); progress.innerHTML = ''; terminal.textContent = '';
  ['build','functional','visual'].forEach((name) => setStatus(name, 'Pending', 'pending')); setStatus('repair','Not used','neutral');
  $('#final-message').classList.add('hidden'); $('#download').classList.add('disabled'); $('#run-state').textContent = 'Starting';
}
async function getJson(url, options) { const response = await fetch(url, options); const value = await response.json(); if (!response.ok) throw new Error(value.error || `Request failed: ${response.status}`); return value; }
