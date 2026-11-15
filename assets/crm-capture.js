/* Sends website form submissions into the CRM (Supabase) before the normal
   Netlify Forms submission. If the CRM can't be reached within 4 seconds the
   form still submits to Netlify as usual, so no lead is ever lost. */
(function () {
  var cfg = window.CRM_CONFIG || {};
  if (!cfg.url || !cfg.key) return;
  var SKIP = { 'form-name': 1, company: 1, 'bot-field': 1 };
  var CORE = ['first_name', 'last_name', 'email', 'phone', 'address'];

  function typeFor(form, f) {
    if (form === 'home-value') return 'Seller';
    if (form === 'renewal-review') return 'Renewal';
    var s = f.service || '';
    if (/sell/i.test(s)) return 'Seller';
    if (/pre-?approv/i.test(s)) return 'Buyer';
    if (/mortgage/i.test(s)) return 'Mortgage';
    return 'Lead';
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.matches || !form.matches('form[data-netlify]') || e.defaultPrevented) return;
    if (form.dataset.crmSent) return;
    var hp = form.querySelector('[name=company]');
    if (hp && hp.value) return; // bot: let Netlify's honeypot handle it

    e.preventDefault();
    var p = { form: form.getAttribute('name') || 'website' }, fields = {}, norm = {};
    new FormData(form).forEach(function (v, k) {
      if (SKIP[k] || typeof v !== 'string') return;
      v = v.trim(); if (!v) return;
      var n = k.toLowerCase().replace(/-/g, '_');
      if (CORE.indexOf(n) >= 0) p[n] = v;
      fields[k] = v; norm[n] = v;
    });
    p.fields = fields;
    p.type = typeFor(p.form, norm);
    p.tags = [];
    if (norm.first_time_home_buyer) p.tags.push('First-time buyer');

    var sent = false;
    function go() {
      if (sent) return; sent = true;
      form.dataset.crmSent = '1';
      HTMLFormElement.prototype.submit.call(form);
    }
    var ctrl = window.AbortController ? new AbortController() : null;
    setTimeout(function () { if (ctrl) ctrl.abort(); go(); }, 4000);
    var headers = { 'Content-Type': 'application/json', apikey: cfg.key };
    if (/^eyJ/.test(cfg.key)) headers.Authorization = 'Bearer ' + cfg.key; // legacy anon key
    try {
      fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/capture_lead', {
        method: 'POST', headers: headers, body: JSON.stringify({ p: p }), signal: ctrl ? ctrl.signal : undefined
      }).then(go, go);
    } catch (err) { go(); }
  });
})();
