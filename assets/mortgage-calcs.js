/* Live market, rates sheet, purchase and refinance calculators */

/* ---------- Settings ----------
   RATES_CSV_URL: paste the Google Sheet's "Publish to web" CSV link here.
   Sheet layout (row 1 is the header):
     Term | Insured | Uninsured | Updated
     3-Year Fixed | 4.19% | 4.39% | Nov 10, 2026
     5-Year Fixed | ...
     5-Year Variable | Prime - 0.60% | ...
     HELOC | n/a | Prime + 0.50%
   Only the first row's "Updated" cell is used. Leave a cell blank to show "Ask me". */
var RATES_CSV_URL = '';
var PRIME_SPREAD = 2.20; // big-bank prime = policy rate + 2.20

function fmtDate(iso){
  var d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-CA', {month:'short', day:'numeric', year:'numeric'});
}
function latest(series){
  return fetch('https://www.bankofcanada.ca/valet/observations/' + series + '/json?recent=1')
    .then(function(r){ if(!r.ok) throw 0; return r.json(); })
    .then(function(j){ var o = j.observations[0]; return {d:o.d, v:parseFloat(o[series].v)}; });
}
latest('V39079').then(function(p){
  document.getElementById('ind-policy').textContent = p.v.toFixed(2) + '%';
  document.getElementById('ind-policy-d').textContent = fmtDate(p.d);
  document.getElementById('ind-prime').textContent = (p.v + PRIME_SPREAD).toFixed(2) + '%';
}).catch(function(){});
latest('BD.CDN.5YR.DQ.YLD').then(function(b){
  document.getElementById('ind-bond').textContent = b.v.toFixed(2) + '%';
  document.getElementById('ind-bond-d').textContent = fmtDate(b.d);
}).catch(function(){});

function parseCSV(text){
  var rows = [], row = [], cell = '', q = false;
  for (var i = 0; i < text.length; i++){
    var c = text[i];
    if (q){ if (c === '"' && text[i+1] === '"'){ cell += '"'; i++; } else if (c === '"'){ q = false; } else { cell += c; } }
    else if (c === '"'){ q = true; }
    else if (c === ','){ row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r'){ if (c === '\r' && text[i+1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else { cell += c; }
  }
  if (cell !== '' || row.length){ row.push(cell); rows.push(row); }
  return rows;
}
function td(text){
  var el = document.createElement('td');
  text = (text || '').trim();
  if (!text){ el.className = 'tbd'; el.textContent = 'Ask me'; }
  else { if (/^n\/?a$/i.test(text)) el.className = 'tbd'; el.textContent = text; }
  return el;
}
if (RATES_CSV_URL){
  fetch(RATES_CSV_URL).then(function(r){ return r.text(); }).then(function(t){
    var rows = parseCSV(t).filter(function(r){ return r[0] && r[0].trim(); });
    if (rows.length < 2) return;
    var body = document.getElementById('rate-rows');
    body.textContent = '';
    rows.slice(1).forEach(function(r){
      var tr = document.createElement('tr');
      tr.appendChild(td(r[0])); tr.appendChild(td(r[1])); tr.appendChild(td(r[2]));
      body.appendChild(tr);
    });
    var upd = (rows[1][3] || '').trim();
    var stamp = document.getElementById('rate-stamp');
    stamp.textContent = '';
    if (upd){ stamp.appendChild(document.createTextNode('Updated ')); var b = document.createElement('b'); b.textContent = upd; stamp.appendChild(b); }
  }).catch(function(){});
}

/* ---------- Mortgage calculator ---------- */
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var num = function(id){ return parseFloat(($(id).value || '').replace(/[^0-9.]/g,'')) || 0; };
  var money = function(v){ return '$' + Math.round(v).toLocaleString('en-CA'); };
  var money2 = function(v){ return '$' + v.toLocaleString('en-CA', {minimumFractionDigits:2, maximumFractionDigits:2}); };
  var FREQ = {m:{n:12,l:'Monthly payment'}, bw:{n:26,l:'Bi-weekly payment'}, abw:{n:26,l:'Accelerated bi-weekly payment',acc:2}, w:{n:52,l:'Weekly payment'}, aw:{n:52,l:'Accelerated weekly payment',acc:4}};
  function minDown(price){
    if (price >= 1500000) return price * 0.20;
    if (price <= 500000) return price * 0.05;
    return 25000 + (price - 500000) * 0.10;
  }
  function premiumRate(ltv){
    if (ltv <= 0.80) return 0;
    if (ltv <= 0.85) return 0.028;
    if (ltv <= 0.90) return 0.031;
    return 0.04;
  }
  function periodic(rate, n){ return Math.pow(1 + rate / 200, 2 / n) - 1; }
  function payment(P, rate, n, years){
    var i = periodic(rate, n), N = n * years;
    return i === 0 ? P / N : P * i / (1 - Math.pow(1 + i, -N));
  }
  function balanceAfter(P, rate, n, pay, periods){
    var i = periodic(rate, n), b = P, interest = 0;
    for (var k = 0; k < periods && b > 0; k++){ var it = b * i; interest += it; b = b + it - pay; }
    return {bal: Math.max(b, 0), interest: interest};
  }
  function calc(){
    var price = num('mc-price'), down = num('mc-down'), rate = num('mc-rate');
    var years = +$('mc-amort').value, f = FREQ[$('mc-freq').value];
    var ftb = $('mc-ftb').checked, nb = $('mc-new').checked;
    var warn = [];
    $('mc-down-pct').textContent = price ? (down / price * 100).toFixed(1) + '% down · minimum ' + money(minDown(price)) : '';
    var base = Math.max(price - down, 0), ltv = price ? base / price : 0;
    var insured = ltv > 0.80;
    var pr = 0;
    if (down < minDown(price)) warn.push('Below the minimum down payment of ' + money(minDown(price)) + '.');
    if (insured && price >= 1500000) warn.push('Homes $1.5M and up need at least 20% down.');
    if (insured){
      pr = premiumRate(ltv);
      if (years === 30){
        pr += 0.002;
        if (!ftb && !nb) warn.push('Insured 30-year amortizations are for first-time buyers or new builds. Try 25 years or 20% down.');
      }
    }
    var ins = base * pr, loan = base + ins, pst = ins * 0.08;
    var monthly = payment(loan, rate, 12, years);
    var pay = f.acc ? monthly / f.acc : payment(loan, rate, f.n, years);
    var t = balanceAfter(loan, rate, f.n, pay, f.n * 5);
    var qr = Math.max(5.25, rate + 2);
    $('mc-pay-l').textContent = f.l;
    $('mc-pay').textContent = rate > 0 && loan > 0 ? money2(pay) : '$0';
    $('mc-loan').textContent = money(loan);
    $('mc-ins').textContent = insured ? money(ins) + ' (' + (pr * 100).toFixed(2) + '%)' : 'None (20%+ down)';
    $('mc-pst').textContent = money(pst);
    $('mc-bal').textContent = money(t.bal);
    $('mc-int5').textContent = money(t.interest);
    $('mc-qr').textContent = '(monthly at ' + qr.toFixed(2) + '%)';
    $('mc-stress').textContent = money2(payment(loan, qr, 12, years));
    var w = $('mc-warn');
    if (warn.length){ w.textContent = warn.join(' '); w.hidden = false; } else { w.hidden = true; }
  }
  function fmtInput(e){
    var el = e.target, v = el.value.replace(/[^0-9]/g,'');
    el.value = v ? (+v).toLocaleString('en-CA') : '';
  }
  ['mc-price','mc-down'].forEach(function(id){ $(id).addEventListener('input', fmtInput); });
  $('mc').addEventListener('input', calc);
  $('mc').addEventListener('change', calc);
  $('mc').addEventListener('submit', function(e){ e.preventDefault(); });
  calc();
})();

/* ---------- Refinance / consolidation calculator ---------- */
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var val = function(el){ return parseFloat((el.value || '').replace(/[^0-9.]/g,'')) || 0; };
  var money = function(v){ return (v < 0 ? '-$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-CA'); };
  var semi = function(rate){ return Math.pow(1 + rate / 200, 1 / 6) - 1; };   // monthly rate, semi-annual compounding
  var mon = function(rate){ return rate / 1200; };                            // monthly rate, monthly compounding
  var MAXM = 600;
  // Simulate paying a balance with a fixed monthly payment. Returns months, total interest and 5-year interest.
  function run(bal, i, pay){
    var m = 0, tot = 0, five = 0;
    while (bal > 0.005 && m < MAXM){
      var it = bal * i; if (pay <= it) return {stuck:true, months:MAXM, total:Infinity, five: five + it * (60 - m)};
      tot += it; if (m < 60) five += it;
      bal = bal + it - pay; m++;
    }
    return {months:m, total:tot, five:five};
  }
  function amortPay(P, i, n){ return i === 0 ? P / n : P * i / (1 - Math.pow(1 + i, -n)); }

  var list = $('rf-debts'), n = 0;
  function addDebt(name, bal, rate, pay){
    n++;
    var row = document.createElement('div'); row.className = 'debt';
    row.innerHTML =
      '<div><label for="d' + n + 'n">Debt</label><input id="d' + n + 'n" class="dn"></div>' +
      '<div><label for="d' + n + 'b">Balance $</label><input id="d' + n + 'b" class="db m" inputmode="numeric"></div>' +
      '<div><label for="d' + n + 'r">Rate %</label><input id="d' + n + 'r" class="dr" inputmode="decimal"></div>' +
      '<div><label for="d' + n + 'p">Monthly $</label><input id="d' + n + 'p" class="dp m" inputmode="numeric"></div>' +
      '<button type="button" class="rm" aria-label="Remove this debt">×</button>';
    row.querySelector('.dn').value = name; row.querySelector('.db').value = bal;
    row.querySelector('.dr').value = rate; row.querySelector('.dp').value = pay;
    row.querySelector('.rm').addEventListener('click', function(){ row.remove(); calc(); });
    list.appendChild(row);
  }
  addDebt('Credit card', '18,000', '20.99', '540');
  addDebt('Car loan', '32,000', '8.49', '650');
  addDebt('Line of credit', '25,000', '9.95', '500');
  $('rf-add').addEventListener('click', function(){ addDebt('', '', '', ''); list.lastChild.querySelector('.dn').focus(); calc(); });

  var penEdited = false;
  $('rf-pen').addEventListener('input', function(){ penEdited = $('rf-pen').value !== ''; });

  function calc(){
    var value = val($('rf-value')), bal = val($('rf-bal')), rate = val($('rf-rate')), mpay = val($('rf-pay'));
    var nrate = val($('rf-nrate')), years = +$('rf-namort').value, fees = val($('rf-fees'));
    if (!penEdited) $('rf-pen').value = bal && rate ? Math.round(bal * rate / 100 / 4).toLocaleString('en-CA') : '';
    var pen = val($('rf-pen'));
    var warn = [];

    var nowPay = mpay, debtTot = 0, cur = {five:0, total:0, months:0}, stuck = false;
    var m = run(bal, semi(rate), mpay);
    if (m.stuck) { stuck = true; warn.push('Your mortgage payment doesn\'t cover its interest. Check the numbers.'); }
    cur.five += m.five; cur.total += m.total; cur.months = Math.max(cur.months, m.months);
    Array.prototype.forEach.call(list.querySelectorAll('.debt'), function(r){
      var b = val(r.querySelector('.db')), rr = val(r.querySelector('.dr')), p = val(r.querySelector('.dp'));
      if (!b) return;
      debtTot += b; nowPay += p;
      var d = run(b, mon(rr), p);
      if (d.stuck){ stuck = true; var nm = r.querySelector('.dn').value || 'One debt'; warn.push(nm + ': the payment doesn\'t cover the interest, so it never gets paid off.'); }
      cur.five += d.five; cur.total += d.total; cur.months = Math.max(cur.months, d.months);
    });

    var loan = bal + debtTot + pen + fees;
    var ltv = value ? loan / value : 0;
    if (ltv > 0.80) warn.push('That\'s ' + (ltv * 100).toFixed(1) + '% of your home\'s value. Refinances are capped at 80% (' + money(value * 0.8) + '), so you may not be able to roll in everything.');
    var ni = semi(nrate), N = years * 12;
    var newPay = amortPay(loan, ni, N);
    var nw = run(loan, ni, newPay);

    var save = nowPay - newPay;
    $('rf-save').textContent = money(save);
    $('rf-save').classList.toggle('pos', save > 0);
    $('rf-save-yr').textContent = save > 0 ? money(save * 12) + ' a year back in your pocket' : 'No monthly savings with these numbers';
    $('rf-now').textContent = money(nowPay);
    $('rf-new').textContent = money(newPay);
    $('rf-loan').textContent = money(loan);
    $('rf-ltv').textContent = (ltv * 100).toFixed(1) + '%';
    $('rf-debt-tot').textContent = money(debtTot);
    var d5 = cur.five - nw.five;
    $('rf-i5').innerHTML = money(cur.five) + ' → ' + money(nw.five) + (d5 > 0 ? ' <span class="pos">(save ' + money(d5) + ')</span>' : '');
    if (stuck) { $('rf-life').textContent = 'Today\'s path never pays off'; }
    else {
      var dl = cur.total - nw.total;
      $('rf-life').innerHTML = money(cur.total) + ' → ' + money(nw.total) + (dl > 0 ? ' <span class="pos">(save ' + money(dl) + ')</span>' : ' <span>(' + money(-dl) + ' more)</span>');
    }
    // Best case: put today's total payment toward the new mortgage
    var k = $('rf-keep');
    if (save > 0 && nowPay > 0){
      var fast = run(loan, ni, nowPay);
      var yrs = (N - fast.months) / 12;
      var base = stuck ? null : cur.total - fast.total;
      k.innerHTML = '<b>Keep paying ' + money(nowPay) + ' a month</b> into the new mortgage and it\'s paid off in <b>' + (fast.months / 12).toFixed(1) + ' years</b>, ' + yrs.toFixed(1) + ' years sooner' + (base !== null && base > 0 ? ', saving <b>' + money(base) + '</b> in interest compared with today' : '') + '.';
      k.hidden = false;
    } else { k.hidden = true; }

    var w = $('rf-warn');
    if (warn.length){ w.textContent = warn.join(' '); w.hidden = false; } else { w.hidden = true; }
  }
  $('rf').addEventListener('input', function(e){
    if (e.target.classList.contains('m')){ var v = e.target.value.replace(/[^0-9]/g,''); e.target.value = v ? (+v).toLocaleString('en-CA') : ''; }
    calc();
  });
  $('rf').addEventListener('change', calc);
  $('rf').addEventListener('submit', function(e){ e.preventDefault(); });
  calc();
})();
