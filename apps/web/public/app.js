'use strict';
/* Zero-Setup AI Mock API Server dashboard. Plain JS, no build step. All dynamic text goes through textContent. */
const $ = (sel, root = document) => root.querySelector(sel);
const state = { projects: [], fixtures: [], current: null, draft: null, tab: 'endpoints', history: [], selectedEp: null };

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2800);
}

async function api(method, url, body) {
  const headers = { accept: 'application/json' };
  const token = sessionStorage.getItem('adminToken');
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && url.startsWith('/api/')) {
    const t = window.prompt('This server requires a management token:');
    if (t) { sessionStorage.setItem('adminToken', t); return api(method, url, body); }
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) { const e = new Error((data && data.message) || res.statusText); e.data = data; e.status = res.status; throw e; }
  return data;
}

const pretty = (v) => JSON.stringify(v, null, 2);
const EXAMPLES = [
  'Student management API with students, departments, pagination and department filtering',
  'E-commerce API with products, users and orders; login simulation and order history',
  'Library API with books and authors, read-only',
  'Task tracker with tasks that have status and priority'
];

/* ---------- sidebar ---------- */
async function loadSidebar() {
  state.projects = await api('GET', '/api/projects');
  state.fixtures = await api('GET', '/api/fixtures');
  const pl = $('#project-list');
  pl.replaceChildren();
  if (!state.projects.length) pl.append(h('li', { class: 'empty-note' }, 'None yet. Describe an API to create one.'));
  for (const p of state.projects) {
    const expired = p.expiresAt && new Date(p.expiresAt) <= new Date();
    pl.append(h('li', {}, h('button', { 'aria-current': String(state.current === p.id), dataset: { testid: `project-${p.id}` }, onclick: () => openProject(p.id) },
      h('span', { class: 'dot ' + (expired ? 'exp' : p.status === 'active' ? '' : 'off') }), h('span', {}, p.name), h('span', { class: 'meta' }, `${p.endpointCount} ep`))));
  }
  const fl = $('#fixture-list');
  fl.replaceChildren();
  for (const f of state.fixtures)
    fl.append(h('li', {}, h('button', { dataset: { testid: `fixture-${f.name}` }, onclick: () => createFromFixture(f) }, h('span', {}, f.title), h('span', { class: 'meta' }, f.name))));
}

async function createFromFixture(f) {
  try {
    const p = await api('POST', '/api/projects', { name: f.title, fixture: f.name });
    toast(`Created “${p.name}”`);
    await loadSidebar();
    openProject(p.id);
  } catch (e) { toast(e.message); }
}

/* ---------- compose / review ---------- */
function viewCompose() {
  state.current = null;
  loadSidebar();
  const main = $('#main');
  const prompt = h('textarea', { id: 'prompt', 'data-testid': 'prompt', placeholder: 'Describe the API you need: resources, fields, operations, filtering…' });
  const name = h('input', { type: 'text', id: 'api-name', placeholder: 'Optional name', 'data-testid': 'api-name' });
  const err = h('div', { class: 'err', id: 'gen-error' });
  const btn = h('button', { class: 'btn primary', id: 'generate', 'data-testid': 'generate' }, 'Generate API');
  btn.addEventListener('click', async () => {
    if (prompt.value.trim().length < 3) { err.textContent = 'Please describe the API first.'; return; }
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Generating…';
    try {
      const body = { description: prompt.value.trim() };
      if (name.value.trim()) body.name = name.value.trim();
      state.draft = await api('POST', '/api/generate', body);
      renderDraft();
    } catch (e) {
      err.textContent = e.message + (e.data && e.data.details ? ' — ' + e.data.details.slice(0, 3).map((d) => `${d.field}: ${d.message}`).join('; ') : '');
    } finally { btn.disabled = false; btn.textContent = 'Generate API'; }
  });
  main.replaceChildren(
    h('h1', {}, 'Describe an API'),
    h('p', { class: 'sub' }, 'Write what you need in plain language. The generator returns declarative configuration that is validated before anything is activated — it never produces executable code.'),
    h('div', { class: 'card' },
      h('label', { for: 'prompt' }, 'Requirements'), prompt,
      h('div', { class: 'chips' }, EXAMPLES.map((ex) => h('button', { class: 'chip', onclick: () => { prompt.value = ex; prompt.focus(); } }, ex.split(' with ')[0].split(' API')[0] + ' example'))),
      h('div', { class: 'fields' },
        h('div', {}, h('label', { for: 'api-name' }, 'Name'), name),
        h('div', {}, h('label', { for: 'api-type' }, 'API type'), h('select', { id: 'api-type' }, h('option', {}, 'REST'), h('option', { disabled: true }, 'GraphQL (planned)'))),
        h('div', { style: 'align-self:end' }, btn)),
      err),
    h('div', { id: 'draft' }));
}

function exampleBody(schema) {
  const out = {};
  for (const [k, s] of Object.entries(schema.properties || {})) {
    if (s.enum) out[k] = s.enum[0];
    else if (s.format === 'email') out[k] = 'jane.doe@example.com';
    else if (s.format === 'date-time') out[k] = new Date().toISOString();
    else if (s.format === 'date') out[k] = '2026-01-01';
    else if (s.type === 'integer') out[k] = s.minimum ?? 1;
    else if (s.type === 'number') out[k] = s.minimum ?? 9.99;
    else if (s.type === 'boolean') out[k] = true;
    else out[k] = 'Sample ' + k;
  }
  return out;
}

function endpointTable(def) {
  return h('table', {}, h('thead', {}, h('tr', {}, ['Method', 'Path', 'Behavior', 'Resource'].map((t) => h('th', {}, t)))),
    h('tbody', {}, def.endpoints.map((e) => h('tr', {}, h('td', {}, h('span', { class: 'method ' + e.method }, e.method)), h('td', { class: 'mono' }, def.basePath + e.path), h('td', {}, e.behavior), h('td', {}, e.resource || '—')))));
}

function schemaViewer(schemas) {
  return h('div', {}, Object.entries(schemas).map(([n, s]) =>
    h('details', { dataset: { testid: `schema-${n}` } }, h('summary', {}, `${n} — create body schema`), h('pre', {}, pretty(s.create)))));
}

function renderDraft() {
  const d = state.draft, def = d.definition;
  const ttl = h('input', { type: 'number', min: '0', value: '0', id: 'ttl', 'data-testid': 'ttl' });
  const nm = h('input', { type: 'text', id: 'proj-name', value: def.name, 'data-testid': 'proj-name' });
  const err = h('div', { class: 'err' });
  const act = h('button', { class: 'btn primary', 'data-testid': 'activate' }, 'Activate environment');
  act.addEventListener('click', async () => {
    act.disabled = true;
    try {
      const p = await api('POST', '/api/projects', { name: nm.value.trim() || def.name, definition: def, ttlMinutes: Number(ttl.value) || 0 });
      toast('Environment activated');
      await loadSidebar();
      openProject(p.id);
    } catch (e) { err.textContent = e.message; act.disabled = false; }
  });
  $('#draft').replaceChildren(
    h('div', { class: 'card', 'data-testid': 'draft' },
      h('div', { class: 'row spread' }, h('h2', {}, `Review: ${def.name}`), h('span', { class: 'badge good' }, `validated · ${d.provider} · ${d.attempts} attempt${d.attempts > 1 ? 's' : ''}`)),
      h('p', { class: 'sub' }, `${def.endpoints.length} endpoints across ${Object.keys(def.resources).length} resource(s). Nothing is live until you activate it.`),
      endpointTable(def),
      h('h2', { style: 'margin-top:18px' }, 'Generated schemas'), schemaViewer(d.schemas),
      h('details', {}, h('summary', {}, 'Raw definition (JSON)'), h('pre', {}, pretty(def))),
      h('div', { class: 'fields', style: 'margin-top:14px' },
        h('div', {}, h('label', { for: 'proj-name' }, 'Environment name'), nm),
        h('div', {}, h('label', { for: 'ttl' }, 'Expires after (minutes, 0 = never)'), ttl),
        h('div', { style: 'align-self:end' }, act)),
      err));
  $('#draft').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- project view ---------- */
async function openProject(id) {
  state.current = id; state.tab = 'endpoints'; state.selectedEp = null;
  try {
    const [p, eps, schemas] = await Promise.all([api('GET', `/api/projects/${id}`), api('GET', `/api/projects/${id}/endpoints`), api('GET', `/api/projects/${id}/schemas`)]);
    state.project = p; state.eps = eps; state.schemas = schemas;
    await loadSidebar();
    renderProject();
  } catch (e) { toast(e.message); viewCompose(); }
}

function download(name, data) {
  const a = h('a', { href: URL.createObjectURL(new Blob([pretty(data)], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
}

function renderProject() {
  const p = state.project;
  const origin = location.origin;
  const act = async (fn, msg) => { try { await fn(); toast(msg); await openProject(p.id); } catch (e) { toast(e.message); } };
  const tabs = ['endpoints', 'schemas', 'logs'].map((t) =>
    h('button', { role: 'tab', 'aria-selected': String(state.tab === t), dataset: { testid: `tab-${t}` }, onclick: () => { state.tab = t; renderProject(); } }, t[0].toUpperCase() + t.slice(1)));
  let body;
  if (state.tab === 'endpoints') body = endpointsTab();
  else if (state.tab === 'schemas') body = schemaViewer(state.schemas);
  else body = h('div', { id: 'logs-box' }, 'Loading…');

  $('#main').replaceChildren(
    h('div', { class: 'row spread' },
      h('div', {}, h('h1', { 'data-testid': 'project-title' }, p.name), h('p', { class: 'sub', style: 'margin-bottom:8px' }, p.description || 'No description.')),
      h('div', { class: 'row' },
        h('span', { class: 'badge ' + (p.status === 'active' ? 'good' : 'warn'), 'data-testid': 'status-badge' }, p.status),
        p.expiresAt ? h('span', { class: 'badge' }, 'expires ' + new Date(p.expiresAt).toLocaleString()) : null)),
    h('div', { class: 'row', style: 'margin-bottom:16px' },
      h('span', { class: 'baseurl', 'data-testid': 'base-url' }, origin + p.baseUrl),
      h('button', { class: 'btn small', onclick: () => navigator.clipboard?.writeText(origin + p.baseUrl).then(() => toast('Copied')) }, 'Copy'),
      h('button', { class: 'btn small', dataset: { testid: 'toggle-status' }, onclick: () => act(() => api('POST', `/api/projects/${p.id}/${p.status === 'active' ? 'deactivate' : 'activate'}`), p.status === 'active' ? 'Deactivated' : 'Activated') }, p.status === 'active' ? 'Deactivate' : 'Activate'),
      h('button', { class: 'btn small', dataset: { testid: 'reset' }, onclick: () => act(() => api('POST', `/api/projects/${p.id}/reset`), 'Data reset to seed state') }, 'Reset data'),
      h('button', { class: 'btn small', onclick: async () => download(`${p.id}.api.json`, await api('GET', `/api/projects/${p.id}/export`)) }, 'Export definition'),
      h('button', { class: 'btn small', onclick: async () => download(`${p.id}.openapi.json`, await api('GET', `/api/projects/${p.id}/export?format=openapi`)) }, 'Export OpenAPI'),
      h('button', { class: 'btn small danger', dataset: { testid: 'delete' }, onclick: async () => {
        if (!confirm(`Delete “${p.name}” and all its simulated data?`)) return;
        try { await api('DELETE', `/api/projects/${p.id}`); toast('Deleted'); await loadSidebar(); viewCompose(); } catch (e) { toast(e.message); }
      } }, 'Delete')),
    h('div', { class: 'tabs', role: 'tablist' }, tabs),
    body);
  if (state.tab === 'logs') loadLogs();
}

function endpointsTab() {
  const list = h('ul', { class: 'eplist', 'data-testid': 'endpoint-list' }, state.eps.map((e) =>
    h('li', {}, h('button', { 'aria-current': String(state.selectedEp === e.id), dataset: { testid: `ep-${e.id}` }, onclick: () => selectEndpoint(e) },
      h('span', { class: 'method ' + e.method }, e.method),
      h('span', {}, h('span', { class: 'path' }, state.project.definition.basePath + e.path), h('div', { class: 'sum' }, e.summary || e.behavior)),
      h('span', { class: 'badge' }, String(e.expectedStatus))))));
  return h('div', {}, h('div', { class: 'card' }, h('h2', {}, 'Endpoint explorer'), list), testerPanel());
}

/* ---------- request tester ---------- */
function testerPanel() {
  const method = h('select', { id: 't-method', 'data-testid': 't-method' }, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => h('option', { value: m }, m)));
  const url = h('input', { type: 'text', id: 't-url', class: 'mono', 'data-testid': 't-url', value: location.origin + state.project.baseUrl + '/' });
  const body = h('textarea', { id: 't-body', class: 'mono', 'data-testid': 't-body', placeholder: 'JSON request body (for POST / PUT / PATCH)' });
  const send = h('button', { class: 'btn primary', id: 't-send', 'data-testid': 't-send' }, 'Send');
  const out = h('div', { id: 't-out', 'data-testid': 't-out' });
  const hist = h('div', { class: 'hist', id: 't-hist', 'data-testid': 't-hist' });
  const curl = h('button', { class: 'btn small', onclick: () => {
    const parts = [`curl -X ${method.value} '${url.value}'`];
    if (body.value.trim() && method.value !== 'GET') parts.push(`-H 'Content-Type: application/json'`, `-d '${body.value.replace(/'/g, "'\\''").replace(/\n\s*/g, ' ')}'`);
    navigator.clipboard?.writeText(parts.join(' ')).then(() => toast('cURL command copied'), () => toast(parts.join(' ')));
  } }, 'Copy as cURL');

  async function run() {
    send.disabled = true;
    out.replaceChildren(h('p', { style: 'color:#8ea2b0' }, 'Sending…'));
    const started = performance.now();
    const init = { method: method.value, headers: {} };
    if (method.value !== 'GET' && method.value !== 'DELETE' && body.value.trim()) { init.headers['content-type'] = 'application/json'; init.body = body.value; }
    try {
      const res = await fetch(url.value, init);
      const ms = Math.round(performance.now() - started);
      const text = await res.text();
      let shown = text;
      try { shown = pretty(JSON.parse(text)); } catch { /* not JSON */ }
      const cls = res.status < 300 ? 's2' : res.status < 500 ? 's4' : 's5';
      out.replaceChildren(
        h('div', { class: 'status-line' }, h('span', { class: 'code ' + cls, 'data-testid': 'resp-status' }, String(res.status)), h('span', {}, res.statusText), h('span', { 'data-testid': 'resp-time' }, `${ms} ms`)),
        h('label', {}, 'Headers'), h('pre', { 'data-testid': 'resp-headers' }, [...res.headers].map(([k, v]) => `${k}: ${v}`).join('\n')),
        h('label', { style: 'margin-top:10px' }, 'Body'), h('pre', { 'data-testid': 'resp-body' }, shown || '(empty)'));
      state.history.unshift({ m: method.value, u: url.value, b: body.value, s: res.status });
      state.history = state.history.slice(0, 8);
      renderHistory();
    } catch (e) { out.replaceChildren(h('div', { class: 'err' }, 'Network error: ' + e.message)); }
    send.disabled = false;
  }
  send.addEventListener('click', run);

  function renderHistory() {
    hist.replaceChildren(...(state.history.length ? [h('label', {}, 'Request history')] : []), ...state.history.map((r) =>
      h('button', { onclick: () => { method.value = r.m; url.value = r.u; body.value = r.b; } }, `${r.s}  ${r.m} ${r.u.replace(location.origin, '')}`)));
  }
  renderHistory();
  state.tester = { method, url, body };
  return h('div', { class: 'wire' }, h('h2', { style: 'color:#fff' }, 'Request console'),
    h('div', { class: 'reqline' }, method, url, send),
    h('label', { for: 't-body' }, 'Body'), body,
    h('div', { class: 'row', style: 'margin-top:10px' }, curl), out, hist);
}

function selectEndpoint(e) {
  state.selectedEp = e.id;
  const t = state.tester;
  const params = {};
  for (const name of e.pathParams) {
    const res = state.project.definition.resources[e.resource];
    params[name] = /user/i.test(name) ? 'usr_101' : res ? (res.idPrefix || e.resource.slice(0, 4)) + '_101' : '1';
  }
  let u = location.origin + state.project.baseUrl + e.path;
  for (const [k, v] of Object.entries(params)) u = u.replace(':' + k, v);
  t.method.value = e.method; t.url.value = u;
  let b = '';
  if (e.requestSchema) b = pretty(exampleBody(e.requestSchema).email ? { email: 'jane.doe@example.com', password: 'secret' } : exampleBody(e.requestSchema));
  else if (e.behavior === 'create' && state.schemas[e.resource]) b = pretty(exampleBody(state.schemas[e.resource].create));
  else if (e.behavior === 'update' && state.schemas[e.resource]) { const ex = exampleBody(state.schemas[e.resource].create); b = pretty(Object.fromEntries(Object.entries(ex).slice(0, 1))); }
  t.body.value = b;
  document.querySelectorAll('.eplist button').forEach((el) => el.setAttribute('aria-current', String(el.dataset.testid === `ep-${e.id}`)));
  $('#t-send').focus();
}

async function loadLogs() {
  const box = $('#logs-box');
  try {
    const logs = await api('GET', `/api/projects/${state.project.id}/logs?limit=50`);
    const refresh = h('button', { class: 'btn small', onclick: loadLogs, style: 'margin-bottom:10px' }, 'Refresh');
    box.replaceChildren(refresh, logs.length
      ? h('table', { 'data-testid': 'log-table' }, h('thead', {}, h('tr', {}, ['Time', 'Method', 'Path', 'Status', 'ms', 'Endpoint'].map((x) => h('th', {}, x)))),
        h('tbody', {}, logs.map((l) => h('tr', {}, h('td', {}, new Date(l.timestamp).toLocaleTimeString()), h('td', {}, h('span', { class: 'method ' + l.method }, l.method)), h('td', { class: 'mono' }, l.path),
          h('td', {}, h('span', { class: 'badge ' + (l.status < 300 ? 'good' : l.status < 500 ? 'warn' : 'bad') }, String(l.status))), h('td', {}, String(l.durationMs)), h('td', { class: 'mono' }, l.endpointId || '—')))))
      : h('p', { class: 'sub' }, 'No requests yet. Send one from the Endpoints tab. Only method, path, status and timing are recorded — never bodies, queries or headers.'));
  } catch (e) { box.textContent = e.message; }
}

/* ---------- boot ---------- */
$('#new-api').addEventListener('click', viewCompose);
(async function boot() {
  try {
    const meta = await api('GET', '/health');
    $('#provider-name').textContent = `${meta.aiProvider} · store: ${meta.store}`;
  } catch { /* ignore */ }
  viewCompose();
})();
