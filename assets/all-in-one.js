/* All-in-One Mortgage Calculator
   Compares three paths for the same household cash flow:
   A) current mortgage (and debts) as-is, B) current mortgage plus the same
   spare cash as prepayments, C) an all-in-one account where pay is deposited
   on payday, spending comes out through the month and interest is charged
   daily on the balance and posted monthly. */
(function () {
  var form = document.getElementById('aio');
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var MAX_M = 50 * 12;
  var PREPAY_CAP = 0.20; // assumed annual prepayment privilege, % of original balance
  var DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function num(id) { var el = $(id); if (!el) return 0; var v = parseFloat(String(el.value).replace(/[^0-9.\-]/g, '')); return isFinite(v) ? v : 0; }
  function money(v) { return (v < 0 ? '-$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-CA'); }
  function dur(m) {
    if (m == null) return 'Not within 50 years';
    var y = Math.floor(m / 12), mo = m % 12;
    return (y ? y + ' yr' + (y === 1 ? '' : 's') : '') + (y && mo ? ' ' : '') + (mo ? mo + ' mo' : '') || '0 mo';
  }
  function fmtInput(el) {
    var raw = el.value.replace(/[^0-9]/g, '');
    if (raw) el.value = Number(raw).toLocaleString('en-CA');
  }

  /* ---------- debts rows ---------- */
  var debtsEl = $('aio-debts');
  function addDebt(name, bal, rate, pay) {
    var row = document.createElement('div');
    row.className = 'debt';
    row.innerHTML =
      '<div><label>Debt</label><input class="d-name" value="' + (name || '') + '" placeholder="Car loan"></div>' +
      '<div><label>Balance $</label><input class="d-bal m" inputmode="numeric" value="' + (bal || '') + '"></div>' +
      '<div><label>Rate %</label><input class="d-rate" inputmode="decimal" value="' + (rate || '') + '"></div>' +
      '<div><label>Payment $/mo</label><input class="d-pay m" inputmode="numeric" value="' + (pay || '') + '"></div>' +
      '<button type="button" class="rm" aria-label="Remove debt">×</button>';
    debtsEl.appendChild(row);
  }
  debtsEl.addEventListener('click', function (e) { if (e.target.classList.contains('rm')) { e.target.closest('.debt').remove(); run(); } });
  $('aio-add').addEventListener('click', function () { addDebt(); run(); });
  addDebt('Car loan', '28,000', '7.9', '650');
  addDebt('Credit card', '9,000', '20.99', '300');
  $('aio-consol').checked = true; $('aio-debt-box').hidden = false;
  $('aio-consol').addEventListener('change', function () { $('aio-debt-box').hidden = !this.checked; run(); });

  function debts() {
    if (!$('aio-consol').checked) return [];
    return Array.prototype.map.call(debtsEl.querySelectorAll('.debt'), function (r) {
      var g = function (c) { var v = parseFloat(r.querySelector(c).value.replace(/[^0-9.]/g, '')); return isFinite(v) ? v : 0; };
      return { name: r.querySelector('.d-name').value || 'Debt', bal: g('.d-bal'), rate: g('.d-rate'), pay: g('.d-pay') };
    }).filter(function (d) { return d.bal > 0; });
  }

  /* ---------- expenses helper ---------- */
  var helper = document.querySelectorAll('.exp-h');
  function sumHelper() {
    var t = 0; helper.forEach(function (el) { var v = parseFloat(el.value.replace(/[^0-9.]/g, '')); if (isFinite(v)) t += v; });
    if (t > 0) { $('aio-exp').value = Math.round(t).toLocaleString('en-CA'); }
    $('exp-total').textContent = money(t);
    run();
  }
  helper.forEach(function (el) { el.addEventListener('input', sumHelper); });

  /* ---------- simulations ---------- */
  function mortRate(r) { return Math.pow(1 + r / 200, 1 / 6) - 1; } // semi-annual compounding
  function paymentFor(bal, r, years) { var i = mortRate(r), n = years * 12; return i ? bal * i / (1 - Math.pow(1 + i, -n)) : bal / n; }

  // A and B: traditional mortgage, debts on their own schedules.
  function traditional(o, prepay) {
    var i = mortRate(o.rate), bal = o.bal, interest = 0, series = [], mortDone = null;
    var ds = o.debts.map(function (d) { return { bal: d.bal, r: d.rate / 1200, pay: d.pay, done: false }; });
    var cap = o.bal * PREPAY_CAP, usedThisYear = 0, stuck = false;
    for (var m = 1; m <= MAX_M; m++) {
      if ((m - 1) % 12 === 0) usedThisYear = 0;
      var freed = 0;
      ds.forEach(function (d) {
        if (d.done) { freed += d.pay; return; }
        var it = d.bal * d.r; interest += it; d.bal += it - d.pay;
        if (d.pay <= it + 0.005) stuck = true;
        if (d.bal <= 0) { d.done = true; freed += -d.bal; d.bal = 0; }
      });
      if (mortDone === null) {
        var it = bal * i; interest += it; bal += it - o.pay;
        if (o.pay <= it + 0.005) stuck = true;
        if (prepay) {
          var extra = Math.max(0, o.surplus) + freed + (m % 12 === 0 ? o.lump : 0);
          extra = Math.min(extra, Math.max(0, cap - usedThisYear));
          usedThisYear += extra; bal -= extra;
        }
        if (bal <= 0) { mortDone = m; bal = 0; }
      }
      var tot = bal + ds.reduce(function (s, d) { return s + d.bal; }, 0);
      series.push(tot);
      if (mortDone !== null && ds.every(function (d) { return d.done; })) {
        return { months: m, mortMonths: mortDone, interest: interest, series: series, stuck: stuck };
      }
      if (stuck && m > 24) break;
    }
    return { months: null, mortMonths: mortDone, interest: interest, series: series, stuck: stuck };
  }

  // C: all-in-one account, daily interest posted monthly.
  function allInOne(o) {
    var per = { w: 52, bw: 26, sm: 24, m: 12 }[o.freq];
    var payAmt = o.income * 12 / per, spendDay = o.expenses * 12 / 365, rd = o.arate / 100 / 365;
    var bal = o.bal + o.debts.reduce(function (s, d) { return s + d.bal; }, 0);
    var interest = 0, fees = 0, series = [], day = 0, accr = 0;
    for (var m = 1; m <= MAX_M; m++) {
      var len = DIM[(m - 1) % 12];
      for (var d = 1; d <= len; d++, day++) {
        var payday = o.freq === 'w' ? day % 7 === 0 : o.freq === 'bw' ? day % 14 === 0 : o.freq === 'sm' ? (d === 1 || d === 15) : d === 1;
        if (payday) bal -= payAmt;
        bal += spendDay;
        if (bal > 0) accr += bal * rd;
      }
      bal += accr + o.fee; interest += accr; fees += o.fee; accr = 0;
      if (m % 12 === 0) bal -= o.lump;
      series.push(Math.max(0, bal));
      if (bal <= 0) return { months: m, interest: interest, fees: fees, series: series };
    }
    return { months: null, interest: interest, fees: fees, series: series };
  }

  /* ---------- chart ---------- */
  function chart(sets) {
    var W = 640, H = 260, L = 56, R = 12, T = 12, B = 30;
    var maxM = Math.max.apply(null, sets.map(function (s) { return s.data.length; }));
    var maxV = Math.max.apply(null, sets.map(function (s) { return Math.max.apply(null, s.data.concat([1])); }));
    var x = function (m) { return L + (W - L - R) * m / Math.max(maxM, 1); };
    var y = function (v) { return T + (H - T - B) * (1 - v / maxV); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Balance over time for each scenario">';
    for (var k = 0; k <= 4; k++) {
      var v = maxV * k / 4, yy = y(v);
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#2a2a2e"/>' +
        '<text x="' + (L - 8) + '" y="' + (yy + 4) + '" fill="#8b8b92" font-size="11" text-anchor="end" font-family="JetBrains Mono,monospace">$' + Math.round(v / 1000) + 'K</text>';
    }
    var years = Math.ceil(maxM / 12), step = years > 30 ? 10 : 5;
    for (var yr = 0; yr <= years; yr += step) {
      svg += '<text x="' + x(yr * 12) + '" y="' + (H - 8) + '" fill="#8b8b92" font-size="11" text-anchor="middle" font-family="JetBrains Mono,monospace">' + yr + 'y</text>';
    }
    sets.forEach(function (s) {
      var pts = [[0, s.start]].concat(s.data.map(function (v, i) { return [i + 1, v]; }));
      svg += '<polyline fill="none" stroke="' + s.color + '" stroke-width="' + (s.bold ? 3.5 : 2.2) + '"' + (s.dash ? ' stroke-dasharray="6 5"' : '') +
        ' points="' + pts.map(function (p) { return x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1); }).join(' ') + '"/>';
    });
    return svg + '</svg>';
  }

  /* ---------- run ---------- */
  function run() {
    var o = {
      bal: num('aio-bal'), rate: num('aio-rate'), years: num('aio-amort'), pay: num('aio-pay'),
      income: num('aio-inc'), expenses: num('aio-exp'), freq: $('aio-freq').value, lump: num('aio-lump'),
      arate: num('aio-arate'), fee: num('aio-fee'), debts: debts()
    };
    var warn = [];
    if (!o.bal || !o.rate || !o.income) { $('aio-out').classList.add('dim'); return; }
    $('aio-out').classList.remove('dim');
    if (!o.pay) { o.pay = paymentFor(o.bal, o.rate, o.years || 25); $('aio-pay-hint').textContent = 'Estimated at ' + money(o.pay) + '/month from your balance, rate and amortization.'; }
    else $('aio-pay-hint').textContent = 'Leave blank and I\'ll estimate it.';
    var debtPay = o.debts.reduce(function (s, d) { return s + d.pay; }, 0);
    o.surplus = o.income - o.expenses - o.pay - debtPay;
    $('aio-surplus').textContent = money(o.surplus) + '/mo';

    if (o.surplus < 0) warn.push('Your expenses and payments add up to more than your income. An all-in-one only works when more comes in than goes out each month.');
    var A = traditional(o, false), B = traditional(o, true), C = allInOne(o);
    if (A.stuck) warn.push('One of your payments doesn\'t cover its interest, so that balance never goes down. Check the payment amounts.');
    if (C.months === null) warn.push('At these numbers, the all-in-one balance doesn\'t get paid off within 50 years: your monthly spare cash is less than the interest. This strategy would not work for you without spending less.');

    var start = o.bal + o.debts.reduce(function (s, d) { return s + d.bal; }, 0);
    $('aio-free').textContent = C.months === null ? 'Not paid off' : dur(C.months);
    $('aio-free-sub').textContent = 'vs ' + dur(A.months) + ' on your current plan' + (o.debts.length ? ' (mortgage and debts)' : '');
    $('a-time').textContent = dur(A.months); $('a-int').textContent = money(A.interest);
    $('b-time').textContent = dur(B.months); $('b-int').textContent = money(B.interest);
    $('c-time').textContent = C.months === null ? '50+ yrs' : dur(C.months); $('c-int').textContent = money(C.interest);
    $('c-fees').textContent = money(C.fees) + ' in account fees';

    var saved = A.interest - (C.interest + C.fees), vsB = B.interest - (C.interest + C.fees);
    var timeSaved = (A.months != null && C.months != null) ? A.months - C.months : null;
    $('aio-saved').textContent = C.months === null ? '—' : money(saved);
    $('aio-time-saved').textContent = timeSaved == null ? '—' : dur(Math.max(0, timeSaved)) + ' sooner';
    var close = Math.abs(vsB) < Math.max(5000, A.interest * 0.03);
    $('aio-vsb').innerHTML = C.months === null ? '' : close
      ? 'Compared with putting the same spare cash into prepayments on your current mortgage every month, the result is about the same. The difference is that the all-in-one does it automatically: every dollar you don\'t spend goes against your mortgage the day it lands, with no prepayment limits, and stays available if you need it.'
      : (vsB >= 0
      ? 'Compared with putting the same spare cash into prepayments on your current mortgage, the all-in-one saves about <b>' + money(vsB) + '</b> more interest, from deposits working against the balance every day' + (o.debts.length ? ' and paying your other debts at a mortgage rate' : '') + '.'
      : 'Honest result: at these numbers, prepaying your current mortgage comes out about <b>' + money(-vsB) + '</b> ahead, mostly because of the rate difference. An all-in-one may still make sense for flexibility, but let\'s talk through it.');
    $('aio-warn').hidden = !warn.length; $('aio-warn').innerHTML = warn.join('<br><br>');

    $('aio-chart').innerHTML = chart([
      { data: A.series, start: start, color: '#8b8b92' },
      { data: B.series, start: start, color: '#cfcfd3', dash: true },
      { data: C.series, start: start, color: '#ff211a', bold: true }
    ]);

    // carry a summary into the lead form
    $('x-aio').value = 'Balance ' + money(o.bal) + ' at ' + o.rate + '%, payment ' + money(o.pay) + '/mo; income ' + money(o.income) + '/mo, expenses ' + money(o.expenses) + '/mo (' + $('aio-freq').selectedOptions[0].text + ' pay); lump ' + money(o.lump) + '/yr; debts ' +
      (o.debts.length ? o.debts.map(function (d) { return d.name + ' ' + money(d.bal) + ' @' + d.rate + '%'; }).join(', ') : 'none') +
      '. Results: as-is ' + dur(A.months) + ' / ' + money(A.interest) + '; prepay ' + dur(B.months) + ' / ' + money(B.interest) + '; all-in-one at ' + o.arate + '% ' + dur(C.months) + ' / ' + money(C.interest) + ' + ' + money(C.fees) + ' fees.';
  }

  form.addEventListener('input', function (e) { if (e.target.classList.contains('m') && !e.target.classList.contains('exp-h')) fmtInput(e.target); run(); });
  form.addEventListener('change', run);
  form.addEventListener('submit', function (e) { e.preventDefault(); run(); });
  run();
})();
