/* Josh Gleason CRM — single-page app (vanilla JS, Supabase backend) */
(function () {
'use strict';

/* ================= constants ================= */
var STAGES = ['New', 'Contacted', 'Appointment', 'Active', 'Under contract', 'Closed', 'Nurture', 'Lost'];
var TYPES = ['Lead', 'Buyer', 'Seller', 'Mortgage', 'Renewal', 'Investor', 'Past client', 'Referral partner'];
var ACT_KINDS = { note: 'Note', call: 'Call', text: 'Text', email: 'Email', meeting: 'Meeting' };
var SYS_KINDS = { form: 'Website form', stage: 'Stage', import: 'Import', consent: 'CASL consent' };
var FIELDS = [ // importable / exportable contact fields
  ['first_name', 'First name'], ['last_name', 'Last name'], ['email', 'Email'], ['phone', 'Phone'],
  ['address', 'Address'], ['city', 'City'], ['type', 'Type'], ['stage', 'Stage'], ['source', 'Source'],
  ['tags', 'Tags'], ['renewal_date', 'Renewal date'], ['lender', 'Lender'], ['follow_up', 'Follow-up date'],
  ['birthday', 'Birthday'], ['consent_email', 'Email consent'], ['notes', 'Notes']
];
var SYNONYMS = {
  first_name: ['first', 'firstname', 'first name', 'given name', 'fname'],
  last_name: ['last', 'lastname', 'last name', 'surname', 'family name', 'lname'],
  email: ['email', 'e-mail', 'email address', 'primary email'],
  phone: ['phone', 'mobile', 'cell', 'phone number', 'telephone', 'mobile phone', 'primary phone'],
  address: ['address', 'street', 'street address', 'address 1', 'property address'],
  city: ['city', 'town', 'municipality'],
  type: ['type', 'contact type', 'category'],
  stage: ['stage', 'status', 'pipeline stage'],
  source: ['source', 'lead source'],
  tags: ['tags', 'tag', 'labels', 'groups'],
  renewal_date: ['renewal', 'renewal date', 'maturity', 'maturity date', 'mortgage renewal'],
  lender: ['lender', 'bank', 'mortgage lender'],
  follow_up: ['follow up', 'follow-up', 'followup', 'next follow up'],
  birthday: ['birthday', 'birth date', 'date of birth', 'dob'],
  consent_email: ['consent', 'email consent', 'opt in', 'opt-in', 'subscribed'],
  notes: ['notes', 'note', 'comments', 'description']
};
var PAGE_SIZE = 100;
var IDLE_LIMIT_MS = 60 * 60 * 1000;

/* ================= tiny helpers ================= */
function $(s, el) { return (el || document).querySelector(s); }
function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function pad(n) { return (n < 10 ? '0' : '') + n; }
function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today() { return ymd(new Date()); }
function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
function parseYmd(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDay(s) {
  if (!s) return '';
  var d = parseYmd(s), now = new Date();
  return MON[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== now.getFullYear() ? ', ' + d.getFullYear() : '');
}
function fmtWhen(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  return fmtDay(ymd(d)) + ' · ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function daysSince(ts) { return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000); }
function fullName(c) {
  var n = [c.first_name, c.last_name].filter(Boolean).join(' ');
  return n || c.email || c.phone || '(no name)';
}
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
function debounce(fn, ms) { var t; return function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }; }
function errMsg(e) { return (e && (e.message || e.error_description || e.msg)) || String(e); }

function toast(msg) {
  var t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600);
}

/* ================= data layer ================= */
function makeApi(cfg) {
  var sb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  function ok(r) { if (r.error) throw r.error; return r.data; }
  async function pageAll(build) {
    var all = [], from = 0;
    for (;;) {
      var d = ok(await build().range(from, from + 999));
      all = all.concat(d);
      if (d.length < 1000) return all;
      from += 1000;
    }
  }
  var api = {
    onAuth: function (cb) { sb.auth.onAuthStateChange(function (ev, s) { cb(ev, s); }); },
    session: async function () { return ok(await sb.auth.getSession()).session; },
    user: async function () { return ok(await sb.auth.getUser()).user; },
    signIn: async function (email, password) { return ok(await sb.auth.signInWithPassword({ email: email, password: password })); },
    signOut: async function (scope) { await sb.auth.signOut(scope ? { scope: scope } : undefined); },
    aal: async function () { return ok(await sb.auth.mfa.getAuthenticatorAssuranceLevel()); },
    factors: async function () { return ok(await sb.auth.mfa.listFactors()); },
    enroll: async function () {
      var f = await api.factors();
      for (var i = 0; i < (f.all || []).length; i++) {
        if (f.all[i].status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.all[i].id });
      }
      return ok(await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'CRM ' + new Date().toISOString().slice(0, 16) }));
    },
    verify: async function (factorId, code) { return ok(await sb.auth.mfa.challengeAndVerify({ factorId: factorId, code: code })); },
    resetPassword: async function (email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/crm/' })); },
    updatePassword: async function (pw) { ok(await sb.auth.updateUser({ password: pw })); },
    isCrmUser: async function () { return ok(await sb.rpc('is_crm_user')); },

    listContacts: function () { return pageAll(function () { return sb.from('contacts').select('*').order('created_at', { ascending: false }); }); },
    insertContact: async function (c) { return ok(await sb.from('contacts').insert(c).select().single()); },
    updateContact: async function (id, p) { return ok(await sb.from('contacts').update(p).eq('id', id).select().single()); },
    listTasks: function () {
      var since = new Date(Date.now() - 30 * 86400000).toISOString();
      return pageAll(function () { return sb.from('tasks').select('*').or('done.eq.false,done_at.gte.' + since).order('created_at'); });
    },
    insertTask: async function (t) { return ok(await sb.from('tasks').insert(t).select().single()); },
    updateTask: async function (id, p) { return ok(await sb.from('tasks').update(p).eq('id', id).select().single()); },
    deleteTask: async function (id) { ok(await sb.from('tasks').delete().eq('id', id)); },
    listActivities: async function (cid) { return ok(await sb.from('activities').select('*').eq('contact_id', cid).order('created_at', { ascending: false }).limit(300)); },
    insertActivity: async function (a) { return ok(await sb.from('activities').insert(a).select().single()); },
    deleteActivity: async function (id) { ok(await sb.from('activities').delete().eq('id', id)); },
    bulkTags: async function (ids, tag, add) { return ok(await sb.rpc('crm_bulk_tags', { ids: ids, tag: tag, do_add: add })); },
    bulkSet: async function (ids, col, val) { return ok(await sb.rpc('crm_bulk_set', { ids: ids, col: col, val: val })); },
    bulkDelete: async function (ids) { return ok(await sb.rpc('crm_bulk_delete', { ids: ids })); },
    importRows: async function (rows, mode) { return ok(await sb.rpc('crm_import', { rows: rows, mode: mode })); }
  };
  return api;
}

/* ================= state ================= */
var api;
var S = {
  contacts: [], byId: new Map(), tasks: [], loadedAt: 0,
  f: { q: '', stage: '', type: '', tag: '', source: '', created: '', renewal: '', openTasks: false },
  sort: { key: 'created_at', dir: -1 }, page: 0,
  selected: new Set(), allMatching: false,
  pf: { q: '', type: '', tag: '' },
  taskTab: 'due', taskTabFull: 'due'
};

function setContacts(list) {
  S.contacts = list; S.byId = new Map();
  list.forEach(function (c) { S.byId.set(c.id, c); });
}
function upsertLocal(c) {
  if (S.byId.has(c.id)) {
    var i = S.contacts.findIndex(function (x) { return x.id === c.id; });
    S.contacts[i] = c;
  } else S.contacts.unshift(c);
  S.byId.set(c.id, c);
}
async function loadAll() {
  var r = await Promise.all([api.listContacts(), api.listTasks()]);
  setContacts(r[0]); S.tasks = r[1]; S.loadedAt = Date.now();
  var valid = new Set(S.contacts.map(function (c) { return c.id; }));
  S.selected.forEach(function (id) { if (!valid.has(id)) S.selected.delete(id); });
  updateBadge();
}
function allTags() {
  var m = new Map();
  S.contacts.forEach(function (c) { (c.tags || []).forEach(function (t) { m.set(t, (m.get(t) || 0) + 1); }); });
  return Array.from(m.keys()).sort(function (a, b) { return a.localeCompare(b); });
}
function allSources() {
  var s = new Set();
  S.contacts.forEach(function (c) { if (c.source) s.add(c.source); });
  return Array.from(s).sort();
}
function openTasksFor(cid) {
  return S.tasks.filter(function (t) { return !t.done && t.contact_id === cid; });
}
function nextTaskDue(cid) {
  var d = null;
  S.tasks.forEach(function (t) { if (!t.done && t.contact_id === cid && t.due_date && (!d || t.due_date < d)) d = t.due_date; });
  return d;
}
function updateBadge() {
  var t = today();
  var n = S.tasks.filter(function (x) { return !x.done && x.due_date && x.due_date <= t; }).length;
  var b = $('#taskCount'); b.textContent = n; b.hidden = !n;
}

/* ================= modal ================= */
function modal(html, opts) {
  opts = opts || {};
  var root = $('#modal-root');
  root.innerHTML = '<div class="modal-bg"><div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + html + '</div></div>';
  var bg = root.firstChild;
  bg.addEventListener('mousedown', function (e) { if (e.target === bg && !opts.sticky) closeModal(); });
  var first = bg.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea');
  if (first) setTimeout(function () { first.focus(); }, 30);
  return bg.firstChild;
}
function closeModal() { $('#modal-root').innerHTML = ''; }
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && $('#modal-root').firstChild) closeModal(); });

function confirmBox(title, msg, okLabel) {
  return new Promise(function (res) {
    var m = modal('<h2>' + esc(title) + '</h2><p>' + esc(msg) + '</p><div class="acts"><button class="btn ghost" data-a="no">Cancel</button><button class="btn" data-a="yes">' + esc(okLabel || 'OK') + '</button></div>');
    m.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a]'); if (!a) return;
      closeModal(); res(a.dataset.a === 'yes');
    });
  });
}
function promptBox(title, label, opts) {
  opts = opts || {};
  return new Promise(function (res) {
    var input = opts.options
      ? '<select name="v">' + opts.options.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>'
      : '<input name="v" value="' + esc(opts.value || '') + '" list="pdl" autocomplete="off">' +
        (opts.suggest ? '<datalist id="pdl">' + opts.suggest.map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>' : '');
    var m = modal('<form><h2>' + esc(title) + '</h2><div class="f"><label>' + esc(label) + '</label>' + input + '</div>' +
      '<div class="acts"><button type="button" class="btn ghost" data-a="no">Cancel</button><button class="btn">' + esc(opts.okLabel || 'OK') + '</button></div></form>');
    var form = $('form', m);
    form.addEventListener('submit', function (e) { e.preventDefault(); var v = form.v.value.trim(); closeModal(); res(v || null); });
    $('[data-a=no]', m).addEventListener('click', function () { closeModal(); res(null); });
  });
}

/* ================= auth screens ================= */
var authEl, appEl;
function authCard(inner) {
  authEl.hidden = false; appEl.hidden = true;
  authEl.innerHTML = '<div class="auth-card"><div class="logo">JOSH<span>.</span>CRM</div>' + inner + '</div>';
  var first = $('input', authEl); if (first) first.focus();
}

function showLogin(msg) {
  authCard('<p>Private. Sign in to continue.</p><form id="lf">' +
    '<div class="f"><label for="le">Email</label><input id="le" type="email" autocomplete="username" required></div>' +
    '<div class="f"><label for="lp">Password</label><input id="lp" type="password" autocomplete="current-password" required></div>' +
    '<div class="err" id="lerr">' + esc(msg || '') + '</div><button class="btn">Sign in →</button></form>' +
    '<button class="link" id="forgot">Forgot password?</button>');
  $('#lf').addEventListener('submit', async function (e) {
    e.preventDefault();
    var b = $('button', this); b.disabled = true; $('#lerr').textContent = '';
    try { await api.signIn($('#le').value.trim(), $('#lp').value); await route2fa(); }
    catch (err) { $('#lerr').textContent = errMsg(err); b.disabled = false; }
  });
  $('#forgot').addEventListener('click', async function () {
    var email = $('#le').value.trim();
    if (!email) { $('#lerr').textContent = 'Enter your email above first.'; return; }
    try { await api.resetPassword(email); $('#lerr').textContent = 'If that email has an account, a reset link is on its way.'; }
    catch (err) { $('#lerr').textContent = errMsg(err); }
  });
}

async function route2fa() {
  var aal = await api.aal();
  if (aal.currentLevel === 'aal2') return enterApp();
  var f = await api.factors();
  var verified = (f.totp || []).filter(function (x) { return x.status === 'verified'; });
  if (verified.length) showChallenge(verified[0]); else showEnroll();
}

function codeForm(id) {
  return '<form id="' + id + '"><div class="f"><label for="cc">6-digit code</label>' +
    '<input id="cc" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></div>' +
    '<div class="err" id="cerr"></div><button class="btn">Verify →</button></form>' +
    '<button class="link" id="out">Use a different account</button>';
}
function wireCode(formId, factorId) {
  $('#' + formId).addEventListener('submit', async function (e) {
    e.preventDefault();
    var b = $('button', this); b.disabled = true; $('#cerr').textContent = '';
    try { await api.verify(factorId, $('#cc').value.trim()); await enterApp(); }
    catch (err) { $('#cerr').textContent = errMsg(err); b.disabled = false; $('#cc').select(); }
  });
  $('#out').addEventListener('click', async function () { await api.signOut(); showLogin(); });
}
function showChallenge(factor) {
  authCard('<p>2-step verification: enter the code from your authenticator app.</p>' + codeForm('chf'));
  wireCode('chf', factor.id);
}
async function showEnroll() {
  authCard('<p>Setting up 2-step verification…</p>');
  try {
    var d = await api.enroll();
    authCard('<p><b>Set up 2-step verification.</b> Scan this with Google Authenticator, Microsoft Authenticator, 1Password or Authy, then enter the 6-digit code it shows.</p>' +
      '<img class="qr" alt="QR code for your authenticator app" src="' + esc(d.totp.qr_code) + '">' +
      '<label>Can\'t scan? Enter this key manually:</label><div class="secret">' + esc(d.totp.secret) + '</div>' + codeForm('enf'));
    wireCode('enf', d.id);
  } catch (err) {
    authCard('<p class="err">' + esc(errMsg(err)) + '</p><button class="btn" id="retry">Try again</button>');
    $('#retry').addEventListener('click', showEnroll);
  }
}

/* ================= app shell / router ================= */
var mainEl;
var booted = false;
async function enterApp() {
  authEl.hidden = true; authEl.innerHTML = ''; appEl.hidden = false;
  mainEl.innerHTML = '<p class="muted">Loading…</p>';
  try {
    var allowed = await api.isCrmUser();
    if (!allowed) {
      mainEl.innerHTML = '<div class="banner">You\'re signed in, but this login isn\'t on the CRM access list yet. Run the "LAST STEP" query from the setup file in Supabase, then refresh.</div>';
      return;
    }
    await loadAll();
  } catch (err) {
    mainEl.innerHTML = '<div class="banner">Couldn\'t load your data: ' + esc(errMsg(err)) + '</div>';
    return;
  }
  if (sessionStorage.getItem('crm-recovery')) { sessionStorage.removeItem('crm-recovery'); changePassword(true); }
  if (!booted) {
    booted = true;
    window.addEventListener('hashchange', render);
    window.addEventListener('focus', function () { if (Date.now() - S.loadedAt > 60000 && !$('#modal-root').firstChild) refresh(); });
  }
  if (!location.hash || location.hash === '#') location.hash = '#/dashboard'; else render();
}
async function refresh() {
  try { await loadAll(); render(); } catch (err) { toast('Refresh failed: ' + errMsg(err)); }
}

function render() {
  var parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  var r = parts[0] || 'dashboard';
  $$('.nav').forEach(function (a) { a.classList.toggle('on', a.dataset.route === (r === 'contact' ? 'contacts' : r)); });
  var views = { dashboard: viewDashboard, pipeline: viewPipeline, contacts: viewContacts, tasks: viewTasks, account: viewAccount };
  if (r === 'contact' && parts[1]) return viewContact(decodeURIComponent(parts[1]));
  (views[r] || viewDashboard)();
  window.scrollTo(0, 0);
}

/* ================= tasks component ================= */
function dueBadge(d) {
  if (!d) return '';
  var t = today(), cls = d < t ? 'over' : d === t ? 'today' : '';
  var label = d < t ? 'Overdue · ' + fmtDay(d) : d === t ? 'Today' : d === addDays(t, 1) ? 'Tomorrow' : fmtDay(d);
  return '<span class="due ' + cls + '">' + esc(label) + '</span>';
}
function taskSort(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.done) return (b.done_at || '').localeCompare(a.done_at || '');
  var ad = a.due_date || '9999', bd = b.due_date || '9999';
  if (ad !== bd) return ad.localeCompare(bd);
  var pr = { high: 0, normal: 1, low: 2 };
  return pr[a.priority] - pr[b.priority];
}
function filterTasks(tab, cid) {
  var t = today();
  return S.tasks.filter(function (x) {
    if (cid && x.contact_id !== cid) return false;
    if (tab === 'done') return x.done;
    if (x.done) return false;
    if (tab === 'due') return x.due_date && x.due_date <= t;
    if (tab === 'upcoming') return !x.due_date || x.due_date > t;
    return true;
  }).sort(taskSort);
}
function taskList(tasks, showContact) {
  if (!tasks.length) return '<div class="empty">Nothing here. </div>';
  return '<ul class="tasks">' + tasks.map(function (x) {
    var c = x.contact_id && S.byId.get(x.contact_id);
    return '<li class="task' + (x.done ? ' done' : '') + '">' +
      '<input type="checkbox" data-act="task-toggle" data-id="' + esc(x.id) + '"' + (x.done ? ' checked' : '') + ' aria-label="Mark done">' +
      '<div class="t"><div class="title" data-act="task-edit" data-id="' + esc(x.id) + '">' + (x.priority === 'high' ? '<span class="pri-high">● </span>' : '') + esc(x.title) + '</div>' +
      '<div class="meta">' + (x.done ? '<span>Done ' + esc(fmtWhen(x.done_at)) + '</span>' : dueBadge(x.due_date)) +
      (showContact && c ? '<a href="#/contact/' + esc(c.id) + '">' + esc(fullName(c)) + '</a>' : '') +
      (x.notes ? '<span>' + esc(x.notes.slice(0, 80)) + '</span>' : '') + '</div></div>' +
      '<button class="x" data-act="task-del" data-id="' + esc(x.id) + '" title="Delete task" aria-label="Delete task">×</button></li>';
  }).join('') + '</ul>';
}
function contactPicker(name) {
  var opts = S.contacts.slice().sort(function (a, b) { return fullName(a).localeCompare(fullName(b)); })
    .map(function (c) { return '<option value="' + esc(pickerLabel(c)) + '">'; }).join('');
  return '<input name="' + name + '" list="cpick" placeholder="Link to contact (optional)" autocomplete="off"><datalist id="cpick">' + opts + '</datalist>';
}
function pickerLabel(c) { return fullName(c) + (c.email ? ' · ' + c.email : c.phone ? ' · ' + c.phone : ''); }
function pickerResolve(v) {
  v = (v || '').trim(); if (!v) return null;
  var hit = S.contacts.find(function (c) { return pickerLabel(c) === v; }) ||
            S.contacts.find(function (c) { return fullName(c).toLowerCase() === v.toLowerCase(); });
  return hit ? hit.id : undefined;
}
function taskPanel(tab, opts) {
  opts = opts || {};
  var tabs = [['due', 'Due & overdue'], ['upcoming', 'Upcoming'], ['open', 'All open'], ['done', 'Completed']];
  return '<form class="addtask' + (opts.cid ? '' : ' wide') + '" data-form="task-add"' + (opts.cid ? ' data-cid="' + esc(opts.cid) + '"' : '') + '>' +
    '<input name="title" placeholder="New task…" required>' + (opts.cid ? '' : contactPicker('contact')) +
    '<input name="due" type="date" value="' + today() + '" aria-label="Due date">' +
    (opts.cid ? '' : '<select name="priority" aria-label="Priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select>') +
    '<button class="btn">Add</button></form>' +
    (opts.noTabs ? '' : '<div class="tabs">' + tabs.map(function (t) {
      var n = filterTasks(t[0], opts.cid).length;
      return '<button class="tab' + (tab === t[0] ? ' on' : '') + '" data-act="task-tab" data-tab="' + t[0] + '" data-scope="' + esc(opts.scope || '') + '">' + t[1] + (t[0] !== 'done' ? ' · ' + n : '') + '</button>';
    }).join('') + '</div>') +
    taskList(filterTasks(tab, opts.cid), !opts.cid);
}

async function addTaskFromForm(form) {
  var title = form.title.value.trim(); if (!title) return;
  var cid = form.dataset.cid || null;
  if (!cid && form.contact) {
    var r = pickerResolve(form.contact.value);
    if (r === undefined) { toast('Pick a contact from the list, or leave it blank'); return; }
    cid = r;
  }
  var t = await api.insertTask({ title: title, due_date: form.due.value || null, contact_id: cid, priority: form.priority ? form.priority.value : 'normal' });
  S.tasks.push(t); updateBadge(); render(); toast('Task added');
}
async function toggleTask(id, done) {
  var t = await api.updateTask(id, { done: done, done_at: done ? new Date().toISOString() : null });
  S.tasks = S.tasks.map(function (x) { return x.id === id ? t : x; }); updateBadge(); render();
}
async function deleteTask(id) {
  if (!(await confirmBox('Delete task?', 'This can\'t be undone.', 'Delete'))) return;
  await api.deleteTask(id); S.tasks = S.tasks.filter(function (x) { return x.id !== id; }); updateBadge(); render();
}
function editTask(id) {
  var t = S.tasks.find(function (x) { return x.id === id; }); if (!t) return;
  var c = t.contact_id && S.byId.get(t.contact_id);
  var m = modal('<form><h2>Edit task</h2>' +
    '<div class="f"><label>Task</label><input name="title" value="' + esc(t.title) + '" required></div>' +
    '<div class="form"><div><label>Due</label><input name="due" type="date" value="' + esc(t.due_date || '') + '"></div>' +
    '<div><label>Priority</label><select name="priority">' + ['high', 'normal', 'low'].map(function (p) { return '<option' + (t.priority === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
    '<div class="full"><label>Contact</label>' + contactPicker('contact') + '</div>' +
    '<div class="full"><label>Notes</label><textarea name="notes">' + esc(t.notes || '') + '</textarea></div></div>' +
    '<div class="acts"><button type="button" class="btn ghost" data-a="no">Cancel</button><button class="btn">Save</button></div></form>');
  var f = $('form', m);
  if (c) f.contact.value = pickerLabel(c);
  $('[data-a=no]', m).addEventListener('click', closeModal);
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    var cid = pickerResolve(f.contact.value);
    if (cid === undefined) { toast('Pick a contact from the list, or leave it blank'); return; }
    try {
      var u = await api.updateTask(id, { title: f.title.value.trim(), due_date: f.due.value || null, priority: f.priority.value, notes: f.notes.value.trim() || null, contact_id: cid });
      S.tasks = S.tasks.map(function (x) { return x.id === id ? u : x; }); closeModal(); updateBadge(); render();
    } catch (err) { toast(errMsg(err)); }
  });
}

/* ================= dashboard ================= */
function viewDashboard() {
  var t = today(), wk = new Date(Date.now() - 7 * 86400000).toISOString();
  var open = S.tasks.filter(function (x) { return !x.done; });
  var overdue = open.filter(function (x) { return x.due_date && x.due_date < t; }).length;
  var dueToday = open.filter(function (x) { return x.due_date === t; }).length;
  var newLeads = S.contacts.filter(function (c) { return c.created_at >= wk; }).length;
  var renewals = S.contacts.filter(function (c) { return c.renewal_date && c.renewal_date >= t && c.renewal_date <= addDays(t, 180); }).length;
  var active = S.contacts.filter(function (c) { return ['Contacted', 'Appointment', 'Active', 'Under contract'].indexOf(c.stage) >= 0; }).length;
  var hour = new Date().getHours();
  var recent = S.contacts.slice().sort(function (a, b) { return b.created_at.localeCompare(a.created_at); }).slice(0, 8);
  var counts = STAGES.map(function (s) { return [s, S.contacts.filter(function (c) { return c.stage === s; }).length]; });
  var max = Math.max.apply(null, counts.map(function (x) { return x[1]; }).concat([1]));

  mainEl.innerHTML =
    '<div class="head"><h1>Good ' + (hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening') + ', Josh</h1>' +
    '<button class="btn ghost sm" data-act="refresh">↻ Refresh</button><button class="btn sm" data-act="new-contact">+ Contact</button></div>' +
    '<div class="kpis">' +
      kpi(overdue, 'Overdue tasks', '#/tasks', overdue > 0) + kpi(dueToday, 'Due today', '#/tasks') +
      kpi(newLeads, 'New contacts (7 days)', '#/contacts?new') + kpi(active, 'Active in pipeline', '#/pipeline') +
      kpi(renewals, 'Renewals next 6 months', '#/contacts?renewal') + kpi(S.contacts.length, 'Total contacts', '#/contacts') +
    '</div>' +
    '<div class="grid g2"><section class="card"><h2>Master task list</h2>' + taskPanel(S.taskTab, { scope: 'dash' }) + '</section>' +
    '<div class="grid" style="align-content:start">' +
      '<section class="card"><h2>Newest contacts <a class="r btn ghost sm" href="#/contacts">All →</a></h2>' +
      (recent.length ? '<ul class="tasks">' + recent.map(function (c) {
        return '<li class="task"><div class="t"><a class="title" style="text-decoration:none" href="#/contact/' + esc(c.id) + '">' + esc(fullName(c)) + '</a>' +
          '<div class="meta"><span class="badge ' + esc(c.stage) + '">' + esc(c.stage) + '</span><span>' + esc(c.source || '') + '</span><span>' + esc(fmtDay(ymd(new Date(c.created_at)))) + '</span></div></div></li>';
      }).join('') + '</ul>' : '<div class="empty">No contacts yet. Website leads will show up here automatically.</div>') + '</section>' +
      '<section class="card"><h2>Pipeline <a class="r btn ghost sm" href="#/pipeline">Board →</a></h2>' +
      counts.map(function (x) {
        return '<div style="display:grid;grid-template-columns:110px 1fr 34px;gap:8px;align-items:center;margin:5px 0">' +
          '<span class="muted">' + esc(x[0]) + '</span><div style="height:8px;background:var(--s2);border-radius:4px"><div style="height:8px;border-radius:4px;background:var(--ember);width:' + Math.round(x[1] / max * 100) + '%"></div></div>' +
          '<span class="mono" style="text-align:right">' + x[1] + '</span></div>';
      }).join('') + '</section>' +
    '</div></div>';
}
function kpi(n, label, href, hot) {
  return '<a class="kpi' + (hot ? ' hot' : '') + '" href="' + href + '"><b>' + n + '</b><span>' + esc(label) + '</span></a>';
}

function viewTasks() {
  mainEl.innerHTML = '<div class="head"><h1>Tasks</h1><button class="btn ghost sm" data-act="refresh">↻ Refresh</button></div>' +
    '<section class="card">' + taskPanel(S.taskTabFull, { scope: 'full' }) + '</section>';
}

/* ================= pipeline ================= */
function pipeMatch(c) {
  var f = S.pf;
  if (f.type && c.type !== f.type) return false;
  if (f.tag && (c.tags || []).indexOf(f.tag) < 0) return false;
  if (f.q && searchText(c).indexOf(f.q.toLowerCase()) < 0) return false;
  return true;
}
function viewPipeline() {
  var tags = allTags();
  mainEl.innerHTML = '<div class="head"><h1>Pipeline</h1><button class="btn sm" data-act="new-contact">+ Contact</button></div>' +
    '<div class="toolbar"><input type="search" id="pq" placeholder="Search…" value="' + esc(S.pf.q) + '">' +
    sel('ptype', 'All types', TYPES, S.pf.type) + sel('ptag', 'All tags', tags, S.pf.tag) +
    '<span class="muted">Drag cards between columns to change stage.</span></div>' +
    '<div class="board" id="board">' + STAGES.map(function (s) {
      var list = S.contacts.filter(function (c) { return c.stage === s && pipeMatch(c); })
        .sort(function (a, b) { return (b.last_activity_at || '').localeCompare(a.last_activity_at || ''); });
      return '<div class="col" data-stage="' + esc(s) + '"><h3>' + esc(s) + '<span>' + list.length + '</span></h3><div class="cards">' +
        list.slice(0, 200).map(pipeCard).join('') + (list.length > 200 ? '<div class="muted">+' + (list.length - 200) + ' more — filter to narrow</div>' : '') + '</div></div>';
    }).join('') + '</div>';
  wirePipeline();
}
function pipeCard(c) {
  var nd = nextTaskDue(c.id);
  return '<div class="pc" draggable="true" data-id="' + esc(c.id) + '"><a href="#/contact/' + esc(c.id) + '">' + esc(fullName(c)) + '</a>' +
    '<div class="meta"><span class="badge">' + esc(c.type) + '</span>' + (nd ? dueBadge(nd) : '') +
    '<span title="Days in this stage">' + daysSince(c.stage_changed_at) + 'd</span></div>' +
    ((c.tags || []).length ? '<div class="chips" style="margin-top:6px">' + c.tags.slice(0, 3).map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
    '<select data-act="pc-stage" data-id="' + esc(c.id) + '" aria-label="Move to stage">' + STAGES.map(function (s) { return '<option' + (s === c.stage ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>';
}
function wirePipeline() {
  var board = $('#board'), dragId = null;
  board.addEventListener('dragstart', function (e) {
    var pc = e.target.closest('.pc'); if (!pc) return;
    dragId = pc.dataset.id; pc.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {}
  });
  board.addEventListener('dragend', function (e) { var pc = e.target.closest('.pc'); if (pc) pc.classList.remove('dragging'); $$('.col.over').forEach(function (c) { c.classList.remove('over'); }); });
  board.addEventListener('dragover', function (e) { var col = e.target.closest('.col'); if (!col || !dragId) return; e.preventDefault(); $$('.col.over').forEach(function (c) { if (c !== col) c.classList.remove('over'); }); col.classList.add('over'); });
  board.addEventListener('drop', function (e) {
    var col = e.target.closest('.col'); if (!col || !dragId) return;
    e.preventDefault(); var id = dragId; dragId = null; setStage(id, col.dataset.stage);
  });
  var rerender = debounce(function () { S.pf.q = $('#pq').value; var pos = $('#pq').selectionStart; viewPipeline(); var q = $('#pq'); q.focus(); q.setSelectionRange(pos, pos); }, 200);
  $('#pq').addEventListener('input', rerender);
  $('#ptype').addEventListener('change', function () { S.pf.type = this.value; viewPipeline(); });
  $('#ptag').addEventListener('change', function () { S.pf.tag = this.value; viewPipeline(); });
}
async function setStage(id, stage) {
  var c = S.byId.get(id); if (!c || c.stage === stage) return;
  try { var u = await api.updateContact(id, { stage: stage }); upsertLocal(u); render(); toast(fullName(u) + ' → ' + stage); }
  catch (err) { toast(errMsg(err)); render(); }
}

/* ================= contacts ================= */
function searchText(c) {
  return [c.first_name, c.last_name, c.email, c.phone, digits(c.phone), c.address, c.city, c.source, c.lender, c.notes, (c.tags || []).join(' ')].join(' ').toLowerCase();
}
function filtered() {
  var f = S.f, t = today(), q = f.q.trim().toLowerCase();
  var since = f.created ? new Date(Date.now() - (+f.created) * 86400000).toISOString() : null;
  var renewTo = f.renewal ? addDays(t, +f.renewal) : null;
  var openSet = f.openTasks ? new Set(S.tasks.filter(function (x) { return !x.done && x.contact_id; }).map(function (x) { return x.contact_id; })) : null;
  var list = S.contacts.filter(function (c) {
    if (f.stage && c.stage !== f.stage) return false;
    if (f.type && c.type !== f.type) return false;
    if (f.tag === '__none' ? (c.tags || []).length : f.tag && (c.tags || []).indexOf(f.tag) < 0) return false;
    if (f.source && c.source !== f.source) return false;
    if (since && c.created_at < since) return false;
    if (renewTo && !(c.renewal_date && c.renewal_date >= t && c.renewal_date <= renewTo)) return false;
    if (openSet && !openSet.has(c.id)) return false;
    if (q && searchText(c).indexOf(q) < 0) return false;
    return true;
  });
  var k = S.sort.key, d = S.sort.dir;
  var val = function (c) {
    if (k === 'name') return fullName(c).toLowerCase();
    if (k === 'next_task') return nextTaskDue(c.id) || '9999';
    if (k === 'tags') return (c.tags || []).join(',').toLowerCase();
    var v = c[k]; return v == null || v === '' ? (d > 0 ? '￿' : '') : String(v).toLowerCase();
  };
  return list.sort(function (a, b) { var x = val(a), y = val(b); return x < y ? -d : x > y ? d : 0; });
}
function sel(id, all, opts, cur) {
  return '<select id="' + id + '"><option value="">' + esc(all) + '</option>' +
    opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>';
}
function viewContacts() {
  var qs = (location.hash.split('?')[1] || '');
  if (qs === 'new') { S.f = blankFilters(); S.f.created = '7'; history.replaceState(null, '', '#/contacts'); }
  if (qs === 'renewal') { S.f = blankFilters(); S.f.renewal = '180'; S.sort = { key: 'renewal_date', dir: 1 }; history.replaceState(null, '', '#/contacts'); }
  var list = filtered(), total = list.length;
  var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (S.page >= pages) S.page = pages - 1;
  var rows = list.slice(S.page * PAGE_SIZE, (S.page + 1) * PAGE_SIZE);
  var selCount = S.allMatching ? total : S.selected.size;
  var pageAllSel = rows.length && rows.every(function (c) { return S.allMatching || S.selected.has(c.id); });
  var cols = [['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['type', 'Type'], ['stage', 'Stage'], ['tags', 'Tags'], ['source', 'Source'], ['next_task', 'Next task'], ['renewal_date', 'Renewal'], ['created_at', 'Added']];
  var anyFilter = Object.keys(S.f).some(function (k) { return S.f[k]; });

  mainEl.innerHTML = '<div class="head"><h1>Contacts</h1>' +
    '<button class="btn ghost sm" data-act="import">⇪ Import</button><button class="btn ghost sm" data-act="export-filtered">⇩ Export' + (anyFilter ? ' filtered' : '') + '</button>' +
    '<button class="btn sm" data-act="new-contact">+ Contact</button></div>' +
    '<div class="toolbar"><input type="search" id="cq" placeholder="Search name, email, phone, tag…" value="' + esc(S.f.q) + '">' +
      sel('fstage', 'All stages', STAGES, S.f.stage) + sel('ftype', 'All types', TYPES, S.f.type) +
      sel('ftag', 'All tags', [['__none', '(no tags)']].concat(allTags()), S.f.tag) + sel('fsource', 'All sources', allSources(), S.f.source) +
      sel('fcreated', 'Added: any time', [['1', 'Added: last 24h'], ['7', 'Added: last 7 days'], ['30', 'Added: last 30 days'], ['90', 'Added: last 90 days'], ['365', 'Added: last year']], S.f.created) +
      sel('frenewal', 'Renewal: any', [['90', 'Renews in 3 months'], ['180', 'Renews in 6 months'], ['365', 'Renews in 12 months']], S.f.renewal) +
      '<label class="chip" style="cursor:pointer;margin:0"><input type="checkbox" id="fopen"' + (S.f.openTasks ? ' checked' : '') + '> Has open tasks</label>' +
      (anyFilter ? '<button class="btn ghost sm" data-act="clear-filters">Clear</button>' : '') + '</div>' +
    (selCount ? '<div class="bulk"><b>' + selCount + ' selected</b>' +
      (!S.allMatching && pageAllSel && total > rows.length ? '<button class="btn ghost sm" data-act="sel-all-matching">Select all ' + total + ' matching</button>' : '') +
      (S.allMatching ? '<span class="muted">(all ' + total + ' matching the filters)</span>' : '') +
      '<select id="bulkAct"><option value="">Bulk action…</option><option value="tag-add">Add tag</option><option value="tag-remove">Remove tag</option><option value="stage">Set stage</option><option value="type">Set type</option><option value="task">Add a task to each</option><option value="export">Export selected</option><option value="delete">Delete</option></select>' +
      '<button class="btn sm" data-act="bulk-run">Apply</button><button class="btn ghost sm" data-act="sel-clear">Clear selection</button></div>' : '') +
    '<div class="tablewrap"><table><thead><tr><th class="nosort"><input type="checkbox" data-act="sel-page"' + (pageAllSel ? ' checked' : '') + ' aria-label="Select page"></th>' +
    cols.map(function (c) { return '<th data-sort="' + c[0] + '">' + c[1] + (S.sort.key === c[0] ? ' <span class="arr">' + (S.sort.dir > 0 ? '▲' : '▼') + '</span>' : '') + '</th>'; }).join('') +
    '</tr></thead><tbody>' + (rows.length ? rows.map(function (c) {
      var on = S.allMatching || S.selected.has(c.id), nd = nextTaskDue(c.id);
      return '<tr class="' + (on ? 'sel' : '') + '"><td><input type="checkbox" data-act="sel-row" data-id="' + esc(c.id) + '"' + (on ? ' checked' : '') + ' aria-label="Select"></td>' +
        '<td><a class="nm" href="#/contact/' + esc(c.id) + '">' + esc(fullName(c)) + '</a></td>' +
        '<td>' + (c.email ? '<a href="mailto:' + esc(c.email) + '" style="color:var(--body)">' + esc(c.email) + '</a>' : '') + '</td>' +
        '<td>' + (c.phone ? '<a href="tel:' + esc(digits(c.phone)) + '" style="color:var(--body)">' + esc(c.phone) + '</a>' : '') + '</td>' +
        '<td>' + esc(c.type) + '</td><td><span class="badge ' + esc(c.stage) + '">' + esc(c.stage) + '</span></td>' +
        '<td><div class="chips">' + (c.tags || []).map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div></td>' +
        '<td class="muted">' + esc(c.source || '') + '</td><td>' + (nd ? dueBadge(nd) : '') + '</td>' +
        '<td>' + esc(fmtDay(c.renewal_date)) + '</td><td class="muted">' + esc(fmtDay(ymd(new Date(c.created_at)))) + '</td></tr>';
    }).join('') : '<tr><td colspan="11" class="empty">' + (S.contacts.length ? 'No contacts match these filters.' : 'No contacts yet. Import a list, or they\'ll arrive from your website forms.') + '</td></tr>') +
    '</tbody></table></div>' +
    '<div class="pager">' + total + ' contact' + (total === 1 ? '' : 's') +
    (pages > 1 ? ' · <button class="btn ghost sm" data-act="pg" data-d="-1"' + (S.page ? '' : ' disabled') + '>‹</button> Page ' + (S.page + 1) + ' of ' + pages +
      ' <button class="btn ghost sm" data-act="pg" data-d="1"' + (S.page < pages - 1 ? '' : ' disabled') + '>›</button>' : '') + '</div>';

  var refilter = function () { S.page = 0; S.allMatching = false; viewContacts(); };
  $('#cq').addEventListener('input', debounce(function () { S.f.q = $('#cq').value; var p = $('#cq').selectionStart; refilter(); var q = $('#cq'); q.focus(); q.setSelectionRange(p, p); }, 200));
  [['fstage', 'stage'], ['ftype', 'type'], ['ftag', 'tag'], ['fsource', 'source'], ['fcreated', 'created'], ['frenewal', 'renewal']].forEach(function (p) {
    $('#' + p[0]).addEventListener('change', function () { S.f[p[1]] = this.value; refilter(); });
  });
  $('#fopen').addEventListener('change', function () { S.f.openTasks = this.checked; refilter(); });
  $$('th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.dataset.sort;
      S.sort = S.sort.key === k ? { key: k, dir: -S.sort.dir } : { key: k, dir: (k === 'created_at' ? -1 : 1) };
      viewContacts();
    });
  });
}
function blankFilters() { return { q: '', stage: '', type: '', tag: '', source: '', created: '', renewal: '', openTasks: false }; }
function selectedIds() { return S.allMatching ? filtered().map(function (c) { return c.id; }) : Array.from(S.selected); }

async function runBulk() {
  var act = $('#bulkAct').value; if (!act) { toast('Choose a bulk action'); return; }
  var ids = selectedIds(); if (!ids.length) return;
  var n = ids.length, label = plural(n, 'contact');
  try {
    if (act === 'tag-add') {
      var tag = await promptBox('Add tag to ' + label, 'Tag', { suggest: allTags(), okLabel: 'Add tag' }); if (!tag) return;
      await api.bulkTags(ids, tag, true); toast('Tagged ' + label + ' "' + tag + '"');
    } else if (act === 'tag-remove') {
      var present = new Set(); ids.forEach(function (id) { var c = S.byId.get(id); (c && c.tags || []).forEach(function (t) { present.add(t); }); });
      if (!present.size) { toast('None of these contacts have tags'); return; }
      var rt = await promptBox('Remove tag from ' + label, 'Tag', { options: Array.from(present).sort(), okLabel: 'Remove' }); if (!rt) return;
      var k = await api.bulkTags(ids, rt, false); toast('Removed "' + rt + '" from ' + plural(k, 'contact'));
    } else if (act === 'stage') {
      var st = await promptBox('Set stage for ' + label, 'Stage', { options: STAGES }); if (!st) return;
      await api.bulkSet(ids, 'stage', st); toast('Moved ' + label + ' to ' + st);
    } else if (act === 'type') {
      var ty = await promptBox('Set type for ' + label, 'Type', { options: TYPES }); if (!ty) return;
      await api.bulkSet(ids, 'type', ty); toast('Set ' + label + ' to ' + ty);
    } else if (act === 'task') {
      var title = await promptBox('Add a task to each of ' + label, 'Task (due today)', { okLabel: 'Add tasks' }); if (!title) return;
      if (n > 300 && !(await confirmBox('Lots of tasks', 'This creates ' + n + ' tasks. Continue?', 'Create'))) return;
      for (var i = 0; i < ids.length; i++) S.tasks.push(await api.insertTask({ title: title, contact_id: ids[i], due_date: today() }));
      toast('Added ' + plural(n, 'task'));
    } else if (act === 'export') {
      exportCsv(ids.map(function (id) { return S.byId.get(id); }).filter(Boolean), 'contacts-selected'); return;
    } else if (act === 'delete') {
      if (!(await confirmBox('Delete ' + label + '?', 'Their tasks and history are deleted too. This can\'t be undone. Tip: export them first.', 'Delete ' + n))) return;
      await api.bulkDelete(ids); S.selected.clear(); S.allMatching = false; toast('Deleted ' + label);
    }
    S.selected.clear(); S.allMatching = false;
    await loadAll(); render();
  } catch (err) { toast(errMsg(err)); }
}

/* ================= CSV import / export ================= */
function csvCell(v) {
  if (v == null) return '';
  v = Array.isArray(v) ? v.join('; ') : String(v);
  if (/^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && !/^[+-][\d\s().-]+$/.test(v))) v = "'" + v; // spreadsheet formula guard
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function exportCsv(list, name) {
  var cols = FIELDS.map(function (f) { return f[0]; }).concat(['consent_at', 'consent_source', 'created_at', 'id']);
  var lines = [cols.join(',')].concat(list.map(function (c) { return cols.map(function (k) { return csvCell(c[k]); }).join(','); }));
  var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '-' + today() + '.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  toast('Exported ' + plural(list.length, 'contact'));
}
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  var rows = [], row = [], cell = '', q = false, i, ch;
  var delim = (function () { var first = text.split(/\r?\n/)[0] || ''; return (first.split(';').length > first.split(',').length && first.split(';').length > first.split('\t').length) ? ';' : (first.split('\t').length > first.split(',').length ? '\t' : ','); })();
  for (i = 0; i < text.length; i++) {
    ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
}
function normDate(v) {
  v = (v || '').trim(); if (!v) return null;
  var m = v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
  m = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/); // assume M/D/Y (Excel North America)
  if (m) { var y = +m[3]; if (y < 100) y += 2000; if (+m[1] <= 12) return y + '-' + pad(+m[1]) + '-' + pad(+m[2]); return y + '-' + pad(+m[2]) + '-' + pad(+m[1]); }
  var d = new Date(v); return isNaN(d) ? null : ymd(d);
}
function guessField(h) {
  var k = h.trim().toLowerCase().replace(/[_]+/g, ' ');
  for (var f in SYNONYMS) if (SYNONYMS[f].indexOf(k) >= 0 || f === h.trim().toLowerCase()) return f;
  if (k === 'name' || k === 'full name' || k === 'contact name') return '__fullname';
  return '__extra';
}
function openImport() {
  var m = modal('<h2>Import contacts</h2><p class="muted">Upload a CSV (from Excel, Google Sheets, your old CRM or your phone). You\'ll match the columns next. Duplicates are matched by email, then phone.</p>' +
    '<div class="f"><input type="file" id="impFile" accept=".csv,text/csv,text/plain"></div>' +
    '<p class="muted" style="font-size:12px">Need a template? <a href="#" id="tmpl">Download a blank CSV</a>.</p>' +
    '<div class="err" id="impErr"></div><div class="acts"><button class="btn ghost" data-a="no">Cancel</button></div>', { wide: true });
  $('[data-a=no]', m).addEventListener('click', closeModal);
  $('#tmpl', m).addEventListener('click', function (e) {
    e.preventDefault();
    var blob = new Blob([FIELDS.map(function (f) { return f[0]; }).join(',') + '\r\nJane,Doe,jane@example.com,705-555-0100,1 Main St,Barrie,Buyer,New,Referral,Past client; Barrie,2027-06-01,TD,,,yes,Met at open house\r\n'], { type: 'text/csv' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'crm-import-template.csv'; a.click();
  });
  $('#impFile', m).addEventListener('change', function () {
    var file = this.files[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) { $('#impErr').textContent = 'That file is over 10 MB. Split it into smaller files.'; return; }
    var rd = new FileReader();
    rd.onload = function () {
      var rows = parseCsv(String(rd.result));
      if (rows.length < 2) { $('#impErr').textContent = 'Couldn\'t find a header row and at least one contact.'; return; }
      importMapping(rows[0], rows.slice(1), file.name);
    };
    rd.readAsText(file);
  });
}
function importMapping(headers, rows, fname) {
  var opts = [['__extra', 'Keep as extra info'], ['__skip', 'Ignore'], ['__fullname', 'Full name (split)']].concat(FIELDS);
  var used = {};
  var guesses = headers.map(function (h) { var g = guessField(h); if (g[0] !== '_' && used[g]) g = '__extra'; used[g] = 1; return g; });
  var m = modal('<h2>Match columns · ' + esc(fname) + '</h2><p class="muted">' + plural(rows.length, 'row') + ' found.</p>' +
    '<div class="tablewrap map"><table><thead><tr><th class="nosort">Your column</th><th class="nosort">Example</th><th class="nosort">Goes into</th></tr></thead><tbody>' +
    headers.map(function (h, i) {
      var ex = rows.map(function (r) { return r[i]; }).filter(function (v) { return v && v.trim(); }).slice(0, 2).join(' · ');
      return '<tr><td><b>' + esc(h || '(blank)') + '</b></td><td class="muted">' + esc(ex.slice(0, 60)) + '</td><td><select data-col="' + i + '">' +
        opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === guesses[i] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></td></tr>';
    }).join('') + '</tbody></table></div>' +
    '<div class="form" style="margin-top:14px"><div><label>Tag everyone in this import</label><input id="impTag" value="Import ' + today() + '"></div>' +
    '<div><label>If a contact already exists</label><select id="impMode"><option value="update">Update it (fill blanks, add tags)</option><option value="skip">Skip it</option></select></div>' +
    '<div><label>Type when blank</label><select id="impType">' + TYPES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
    '<div><label>Stage when blank</label><select id="impStage">' + STAGES.map(function (t) { return '<option' + (t === 'Nurture' ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div></div>' +
    '<div class="progress" hidden><div></div></div><div class="err" id="impErr"></div>' +
    '<div class="acts"><button class="btn ghost" data-a="no">Cancel</button><button class="btn" data-a="go">Import ' + plural(rows.length, 'contact') + '</button></div>', { wide: true, sticky: true });
  $('[data-a=no]', m).addEventListener('click', closeModal);
  $('[data-a=go]', m).addEventListener('click', async function () {
    var btn = this;
    var map = $$('select[data-col]', m).map(function (s) { return s.value; });
    if (map.indexOf('email') < 0 && map.indexOf('phone') < 0 && map.indexOf('first_name') < 0 && map.indexOf('__fullname') < 0) {
      $('#impErr').textContent = 'Match at least a name, email or phone column.'; return;
    }
    var extraTag = $('#impTag').value.trim(), defType = $('#impType').value, defStage = $('#impStage').value;
    var out = rows.map(function (r) {
      var o = { tags: [], details: {} }, extra = {};
      map.forEach(function (f, i) {
        var v = (r[i] || '').trim(); if (!v || f === '__skip') return;
        if (f === '__extra') { extra[headers[i] || 'Column ' + (i + 1)] = v.slice(0, 1000); return; }
        if (f === '__fullname') { var p = v.split(/\s+/); o.first_name = o.first_name || p.shift(); o.last_name = o.last_name || p.join(' ') || null; return; }
        if (f === 'tags') { o.tags = o.tags.concat(v.split(/[;|,]/).map(function (t) { return t.trim(); }).filter(Boolean)); return; }
        if (f === 'renewal_date' || f === 'follow_up' || f === 'birthday') { var d = normDate(v); if (d) o[f] = d; else extra[headers[i]] = v; return; }
        if (f === 'consent_email') { o[f] = /^(y|yes|true|1|x|opted in|subscribed)$/i.test(v); return; }
        if (f === 'type') { var t = TYPES.find(function (x) { return x.toLowerCase() === v.toLowerCase(); }); o.type = t || defType; if (!t) o.tags.push(v); return; }
        if (f === 'stage') { var s = STAGES.find(function (x) { return x.toLowerCase() === v.toLowerCase(); }); o.stage = s || defStage; if (!s) extra[headers[i]] = v; return; }
        o[f] = v.slice(0, 2000);
      });
      if (extraTag) o.tags.push(extraTag);
      o.type = o.type || defType; o.stage = o.stage || defStage;
      if (Object.keys(extra).length) o.details = { import: extra };
      return o;
    });
    btn.disabled = true; $('[data-a=no]', m).disabled = true;
    var bar = $('.progress', m); bar.hidden = false;
    var tot = { created: 0, updated: 0, skipped: 0 }, BATCH = 250;
    try {
      for (var i = 0; i < out.length; i += BATCH) {
        var r = await api.importRows(out.slice(i, i + BATCH), $('#impMode').value);
        tot.created += r.created; tot.updated += r.updated; tot.skipped += r.skipped;
        $('div', bar).style.width = Math.round(Math.min(i + BATCH, out.length) / out.length * 100) + '%';
      }
      closeModal(); await loadAll(); location.hash = '#/contacts'; render();
      modal('<h2>Import complete</h2><p>' + tot.created + ' added · ' + tot.updated + ' updated · ' + tot.skipped + ' skipped (duplicates or rows with no name, email or phone).</p>' +
        (extraTag ? '<p class="muted">Everyone from this file is tagged "' + esc(extraTag) + '", so you can filter to them.</p>' : '') +
        '<div class="acts"><button class="btn" data-a="ok">Done</button></div>');
      $('[data-a=ok]').addEventListener('click', closeModal);
    } catch (err) {
      $('#impErr').textContent = 'Stopped: ' + errMsg(err) + ' (' + (tot.created + tot.updated) + ' rows were saved before the error).';
      btn.disabled = false; $('[data-a=no]', m).disabled = false;
    }
  });
}

/* ================= contact page ================= */
var actCache = { id: null, list: [] };
async function viewContact(id) {
  var c = S.byId.get(id);
  if (!c) { mainEl.innerHTML = '<div class="banner">Contact not found. It may have been deleted.</div><a class="btn ghost" href="#/contacts">← Contacts</a>'; return; }
  if (actCache.id !== id) {
    mainEl.innerHTML = '<p class="muted">Loading…</p>';
    try { actCache = { id: id, list: await api.listActivities(id) }; } catch (err) { actCache = { id: id, list: [] }; toast(errMsg(err)); }
    if (!location.hash.startsWith('#/contact/' + encodeURIComponent(id)) && !location.hash.startsWith('#/contact/' + id)) return;
  }
  var tel = digits(c.phone);
  var details = c.details && typeof c.details === 'object' ? c.details : {};
  var input = function (k, label, type, full) {
    return '<div' + (full ? ' class="full"' : '') + '><label>' + label + '</label><input name="' + k + '" type="' + (type || 'text') + '" value="' + esc(c[k] || '') + '"></div>';
  };
  mainEl.innerHTML =
    '<a href="#/contacts" class="muted" style="text-decoration:none">← Contacts</a>' +
    '<div class="ch" style="margin-top:8px"><h1>' + esc(fullName(c)) + '</h1>' +
      '<select id="cstage" aria-label="Stage">' + STAGES.map(function (s) { return '<option' + (s === c.stage ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div>' +
    '<div class="muted" style="margin-bottom:10px">' + esc(c.type) + ' · ' + esc(c.source || 'No source') + ' · added ' + esc(fmtWhen(c.created_at)) + ' · in "' + esc(c.stage) + '" for ' + plural(daysSince(c.stage_changed_at), 'day') + '</div>' +
    '<div class="quick">' +
      (tel ? '<a class="btn ghost sm" href="tel:' + esc(tel) + '">✆ Call</a><a class="btn ghost sm" href="sms:' + esc(tel) + '">✉ Text</a>' : '') +
      (c.email ? '<a class="btn ghost sm" href="mailto:' + esc(c.email) + '">@ Email</a>' : '') +
      '<button class="btn ghost sm" data-act="log-quick" data-kind="call">Log a call</button></div>' +
    '<div class="grid g2"><div class="grid" style="align-content:start">' +
      '<section class="card"><h2>Details</h2><form id="cform" class="form">' +
        input('first_name', 'First name') + input('last_name', 'Last name') + input('email', 'Email', 'email') + input('phone', 'Phone', 'tel') +
        input('address', 'Address', 'text', true) + input('city', 'City') +
        '<div><label>Type</label><select name="type">' + TYPES.map(function (t) { return '<option' + (t === c.type ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
        input('source', 'Source') + input('lender', 'Current lender') + input('renewal_date', 'Mortgage renewal date', 'date') + input('follow_up', 'Follow-up date', 'date') +
        input('birthday', 'Birthday', 'date') +
        '<div class="full"><label style="display:flex;gap:8px;align-items:center;color:var(--body)"><input type="checkbox" name="consent_email"' + (c.consent_email ? ' checked' : '') + '> Has given express consent to marketing emails (CASL)</label>' +
          (c.consent_email ? '<div class="muted" style="font-size:12px;margin-top:4px">Since ' + esc(fmtWhen(c.consent_at)) + ' · ' + esc(c.consent_source || '') + '</div>' : '<div class="muted" style="font-size:12px;margin-top:4px">Only tick this if they actually said yes (verbally or in writing). Note how in the activity log.</div>') + '</div>' +
        '<div class="full"><label>Tags</label><div class="tagbox" id="tagbox">' + (c.tags || []).map(function (t) {
          return '<span class="chip">' + esc(t) + '<button type="button" data-act="tag-x" data-tag="' + esc(t) + '" aria-label="Remove tag">×</button></span>'; }).join('') +
          '<input id="tagIn" list="taglist" placeholder="Add tag + Enter" autocomplete="off"><datalist id="taglist">' + allTags().map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist></div></div>' +
        '<div class="full"><label>Notes</label><textarea name="notes" rows="4">' + esc(c.notes || '') + '</textarea></div>' +
        '<div class="full" style="display:flex;gap:8px;justify-content:space-between"><button type="button" class="btn danger sm" data-act="del-contact">Delete contact</button><button class="btn">Save changes</button></div>' +
      '</form></section>' +
      (Object.keys(details).length ? '<section class="card"><h2>Form & import info</h2>' + Object.keys(details).map(function (k) {
        var v = details[k];
        return '<h3 style="margin:10px 0 4px;font-size:13px">' + esc(k) + '</h3>' + (v && typeof v === 'object' ?
          '<dl class="kv">' + Object.keys(v).map(function (kk) { return '<dt>' + esc(kk) + '</dt><dd>' + esc(typeof v[kk] === 'object' ? JSON.stringify(v[kk]) : v[kk]) + '</dd>'; }).join('') + '</dl>' :
          '<div>' + esc(v) + '</div>');
      }).join('') + '</section>' : '') +
    '</div><div class="grid" style="align-content:start">' +
      '<section class="card"><h2>Tasks</h2>' + taskPanel('open', { cid: c.id, noTabs: true }) +
        (filterTasks('done', c.id).length ? '<details style="margin-top:8px"><summary class="muted" style="cursor:pointer">Completed (' + filterTasks('done', c.id).length + ')</summary>' + taskList(filterTasks('done', c.id), false) + '</details>' : '') + '</section>' +
      '<section class="card"><h2>Activity</h2><form id="logf"><div class="logrow"><select name="kind">' +
        Object.keys(ACT_KINDS).map(function (k) { return '<option value="' + k + '">' + ACT_KINDS[k] + '</option>'; }).join('') +
        '</select><button class="btn sm">Log it</button></div><textarea name="body" placeholder="What happened? (call notes, what they need, next step…)" required></textarea></form>' +
        '<ul class="tl" style="margin-top:14px">' + (actCache.list.length ? actCache.list.map(function (a) {
          var data = a.data && Object.keys(a.data).length ? '<dl class="kv">' + Object.keys(a.data).map(function (k) { return '<dt>' + esc(k) + '</dt><dd>' + esc(a.data[k]) + '</dd>'; }).join('') + '</dl>' : '';
          return '<li class="k-' + esc(a.kind) + '"><div class="when">' + esc((ACT_KINDS[a.kind] || SYS_KINDS[a.kind] || a.kind).toUpperCase()) + ' · ' + esc(fmtWhen(a.created_at)) +
            (ACT_KINDS[a.kind] ? ' <button class="x" data-act="act-del" data-id="' + esc(a.id) + '" title="Delete" aria-label="Delete entry">×</button>' : '') + '</div>' +
            '<div class="body">' + esc(a.body || '') + '</div>' + data + '</li>';
        }).join('') : '<li class="muted">No activity yet.</li>') + '</ul></section>' +
    '</div></div>';

  $('#cstage').addEventListener('change', function () { setStage(c.id, this.value); });
  $('#cform').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = this, p = {};
    ['first_name', 'last_name', 'email', 'phone', 'address', 'city', 'type', 'source', 'lender', 'notes'].forEach(function (k) { p[k] = f[k].value.trim() || null; });
    ['renewal_date', 'follow_up', 'birthday'].forEach(function (k) { p[k] = f[k].value || null; });
    p.type = p.type || 'Lead'; p.consent_email = f.consent_email.checked;
    try { upsertLocal(await api.updateContact(c.id, p)); toast('Saved'); render(); }
    catch (err) { toast(err && err.code === '23505' ? 'Another contact already uses that email' : errMsg(err)); }
  });
  $('#tagIn').addEventListener('keydown', async function (e) {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault(); var t = this.value.trim().replace(/,$/, ''); if (!t) return;
    if ((c.tags || []).indexOf(t) >= 0) { this.value = ''; return; }
    try { upsertLocal(await api.updateContact(c.id, { tags: (c.tags || []).concat(t) })); render(); setTimeout(function () { var i = $('#tagIn'); if (i) i.focus(); }, 0); }
    catch (err) { toast(errMsg(err)); }
  });
  $('#logf').addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = this.body.value.trim(); if (!body) return;
    try {
      var a = await api.insertActivity({ contact_id: c.id, kind: this.kind.value, body: body });
      actCache.list.unshift(a); var cc = S.byId.get(c.id); if (cc) cc.last_activity_at = a.created_at; render(); toast('Logged');
    } catch (err) { toast(errMsg(err)); }
  });
}

function newContact() {
  var m = modal('<form><h2>New contact</h2><div class="form">' +
    '<div><label>First name</label><input name="first_name"></div><div><label>Last name</label><input name="last_name"></div>' +
    '<div><label>Email</label><input name="email" type="email"></div><div><label>Phone</label><input name="phone" type="tel"></div>' +
    '<div><label>Type</label><select name="type">' + TYPES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
    '<div><label>Stage</label><select name="stage">' + STAGES.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
    '<div class="full"><label>Source</label><input name="source" placeholder="Referral, open house, Instagram…"></div>' +
    '<div class="full"><label>Tags (comma-separated)</label><input name="tags" list="taglist2"><datalist id="taglist2">' + allTags().map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist></div>' +
    '</div><div class="err" id="ncErr"></div><div class="acts"><button type="button" class="btn ghost" data-a="no">Cancel</button><button class="btn">Create</button></div></form>');
  var f = $('form', m);
  $('[data-a=no]', m).addEventListener('click', closeModal);
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    var p = {};
    ['first_name', 'last_name', 'email', 'phone', 'type', 'stage', 'source'].forEach(function (k) { p[k] = f[k].value.trim() || null; });
    if (!p.first_name && !p.last_name && !p.email && !p.phone) { $('#ncErr').textContent = 'Add at least a name, email or phone.'; return; }
    p.tags = f.tags.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    try {
      var c = await api.insertContact(p); upsertLocal(c); closeModal(); location.hash = '#/contact/' + c.id;
    } catch (err) {
      if (err && err.code === '23505') {
        var dup = S.contacts.find(function (x) { return x.email === (p.email || '').toLowerCase(); });
        $('#ncErr').innerHTML = 'A contact with that email already exists' + (dup ? ': <a href="#/contact/' + esc(dup.id) + '">' + esc(fullName(dup)) + '</a>' : '') + '.';
        var link = $('#ncErr a'); if (link) link.addEventListener('click', closeModal);
      } else $('#ncErr').textContent = errMsg(err);
    }
  });
}

/* ================= account ================= */
async function viewAccount() {
  mainEl.innerHTML = '<div class="head"><h1>Account</h1></div><section class="card" style="max-width:560px"><p class="muted">Loading…</p></section>';
  var u = null, f = { totp: [] };
  try { u = await api.user(); f = await api.factors(); } catch (err) { /* shown below */ }
  var card = $('section', mainEl); if (!card) return;
  card.innerHTML = '<h2>Your login</h2><p>Signed in as <b>' + esc(u && u.email) + '</b></p>' +
    '<p>2-step verification: <b style="color:var(--ok)">' + ((f.totp || []).length ? 'On' : 'Not set up') + '</b>' +
    ((f.totp || []).length ? ' <span class="muted">(' + esc(f.totp.map(function (x) { return x.friendly_name || 'Authenticator'; }).join(', ')) + ')</span>' : '') + '</p>' +
    '<p class="muted">You\'re signed out automatically after an hour without activity.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn ghost sm" data-act="pw">Change password</button>' +
    '<button class="btn ghost sm" data-act="export-all">Export all contacts (backup)</button>' +
    '<button class="btn ghost sm" data-act="signout-all">Sign out on all devices</button><button class="btn sm" data-act="signout">Sign out</button></div>';
}
function changePassword(fromReset) {
  var m = modal('<form><h2>' + (fromReset ? 'Set a new password' : 'Change password') + '</h2>' +
    '<div class="f"><label>New password (12+ characters)</label><input name="p1" type="password" minlength="12" autocomplete="new-password" required></div>' +
    '<div class="f"><label>Confirm</label><input name="p2" type="password" minlength="12" autocomplete="new-password" required></div>' +
    '<div class="err" id="pwErr"></div><div class="acts"><button type="button" class="btn ghost" data-a="no">Cancel</button><button class="btn">Save password</button></div></form>', { sticky: !!fromReset });
  var f = $('form', m);
  $('[data-a=no]', m).addEventListener('click', closeModal);
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (f.p1.value !== f.p2.value) { $('#pwErr').textContent = 'Passwords don\'t match.'; return; }
    try { await api.updatePassword(f.p1.value); closeModal(); toast('Password updated'); }
    catch (err) { $('#pwErr').textContent = errMsg(err); }
  });
}

/* ================= global event delegation ================= */
function wireMain() {
  mainEl.addEventListener('click', async function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var a = el.dataset.act, id = el.dataset.id;
    try {
      if (a === 'refresh') { await refresh(); toast('Up to date'); }
      else if (a === 'new-contact') newContact();
      else if (a === 'task-toggle') { e.preventDefault(); await toggleTask(id, !S.tasks.find(function (x) { return x.id === id; }).done); }
      else if (a === 'task-del') await deleteTask(id);
      else if (a === 'task-edit') editTask(id);
      else if (a === 'task-tab') { if (el.dataset.scope === 'full') S.taskTabFull = el.dataset.tab; else S.taskTab = el.dataset.tab; render(); }
      else if (a === 'sel-row') { if (S.allMatching) { S.allMatching = false; filtered().forEach(function (c) { S.selected.add(c.id); }); } if (el.checked) S.selected.add(id); else S.selected.delete(id); viewContacts(); }
      else if (a === 'sel-page') {
        var list = filtered().slice(S.page * PAGE_SIZE, (S.page + 1) * PAGE_SIZE);
        if (el.checked) list.forEach(function (c) { S.selected.add(c.id); }); else { S.allMatching = false; list.forEach(function (c) { S.selected.delete(c.id); }); }
        viewContacts();
      }
      else if (a === 'sel-all-matching') { S.allMatching = true; viewContacts(); }
      else if (a === 'sel-clear') { S.selected.clear(); S.allMatching = false; viewContacts(); }
      else if (a === 'bulk-run') await runBulk();
      else if (a === 'clear-filters') { S.f = blankFilters(); S.page = 0; S.allMatching = false; viewContacts(); }
      else if (a === 'pg') { S.page += +el.dataset.d; viewContacts(); window.scrollTo(0, 0); }
      else if (a === 'import') openImport();
      else if (a === 'export-filtered') exportCsv(filtered(), 'contacts');
      else if (a === 'export-all') exportCsv(S.contacts, 'contacts-all');
      else if (a === 'tag-x') {
        var cid = location.hash.split('/')[2], c = S.byId.get(cid);
        upsertLocal(await api.updateContact(cid, { tags: (c.tags || []).filter(function (t) { return t !== el.dataset.tag; }) })); render();
      }
      else if (a === 'del-contact') {
        var cid2 = location.hash.split('/')[2], c2 = S.byId.get(cid2);
        if (!(await confirmBox('Delete ' + fullName(c2) + '?', 'Their tasks and history are deleted too. This can\'t be undone.', 'Delete'))) return;
        await api.bulkDelete([cid2]); await loadAll(); location.hash = '#/contacts'; toast('Deleted');
      }
      else if (a === 'act-del') {
        if (!(await confirmBox('Delete this entry?', 'This can\'t be undone.', 'Delete'))) return;
        await api.deleteActivity(id); actCache.list = actCache.list.filter(function (x) { return x.id !== id; }); render();
      }
      else if (a === 'log-quick') { var lf = $('#logf'); if (lf) { lf.kind.value = el.dataset.kind; lf.body.focus(); lf.scrollIntoView({ block: 'center' }); } }
      else if (a === 'pw') changePassword(false);
      else if (a === 'signout') { await api.signOut(); location.hash = ''; showLogin('Signed out.'); }
      else if (a === 'signout-all') { await api.signOut('global'); location.hash = ''; showLogin('Signed out on all devices.'); }
    } catch (err) { toast(errMsg(err)); }
  });
  mainEl.addEventListener('change', function (e) {
    var el = e.target.closest('[data-act=pc-stage]'); if (el) setStage(el.dataset.id, el.value);
  });
  mainEl.addEventListener('submit', async function (e) {
    var f = e.target.closest('[data-form=task-add]'); if (!f) return;
    e.preventDefault(); var b = $('button', f); b.disabled = true;
    try { await addTaskFromForm(f); } catch (err) { toast(errMsg(err)); b.disabled = false; }
  });
}

/* ================= idle sign-out ================= */
var lastSeen = Date.now();
['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) { window.addEventListener(ev, function () { lastSeen = Date.now(); }, { passive: true }); });
setInterval(async function () {
  if (appEl && !appEl.hidden && Date.now() - lastSeen > IDLE_LIMIT_MS) {
    try { await api.signOut(); } catch (e) {}
    closeModal(); location.hash = ''; showLogin('Signed out after an hour without activity.');
  }
}, 60000);

/* ================= boot ================= */
async function boot() {
  authEl = $('#auth'); appEl = $('#app'); mainEl = $('#main');
  var cfg = window.CRM_CONFIG || {};
  if (window.CRM_MOCK_API) api = window.CRM_MOCK_API;
  else if (!cfg.url || !cfg.key) { authCard('<p>The CRM isn\'t connected to its database yet. Add your Supabase URL and key to <span class="mono">/crm/config.js</span>.</p>'); return; }
  else api = makeApi(cfg);
  wireMain();
  api.onAuth(function (ev) {
    if (ev === 'PASSWORD_RECOVERY') sessionStorage.setItem('crm-recovery', '1');
    if (ev === 'SIGNED_OUT' && appEl && !appEl.hidden) showLogin('Your session ended. Sign in again.');
  });
  try {
    var s = await api.session();
    if (!s) return showLogin();
    await route2fa();
  } catch (err) { showLogin(errMsg(err)); }
}
document.addEventListener('DOMContentLoaded', boot);
})();
