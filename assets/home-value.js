/* Home value ballpark tool: instant range, then exact-value request */
(function(){
  var D = window.MARKET_DATA || {regions: []};
  var $ = function(id){ return document.getElementById(id); };
  var TYPE_NAMES = {detached:'detached homes', semi:'semi-detached homes', town:'freehold townhouses', condoTown:'condo townhouses', condoApt:'condo apartments'};
  var TYPICAL_BEDS = {detached:3, semi:3, town:3, condoTown:3, condoApt:2};
  var SPREAD = 0.08;          // +/- 8% around the point estimate
  var PER_BED = 0.05;         // 5% per bedroom above or below typical
  var MAX_BED_ADJ = 0.10;     // capped at 10% either way

  // Area list: Simcoe-area regions first (the local market), then the rest
  var area = $('hv-area');
  var regions = D.regions.slice().sort(function(a, b){
    var la = a.group === 'GTA' ? 1 : 0, lb = b.group === 'GTA' ? 1 : 0;
    return la - lb || a.name.localeCompare(b.name);
  });
  regions.forEach(function(r){
    var o = document.createElement('option');
    o.value = r.id; o.textContent = r.name;
    if (r.id === 'barrie') o.selected = true;
    area.appendChild(o);
  });
  var other = document.createElement('option'); other.value = 'other'; other.textContent = 'Somewhere else'; area.appendChild(other);

  function money(v){ return '$' + (Math.round(v / 5000) * 5000).toLocaleString('en-CA'); }
  function short(v){ var k = Math.round(v / 5000) * 5; return k >= 1000 ? '$' + (k / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'M' : '$' + k + 'K'; }

  function estimate(){
    var r = D.regions.filter(function(x){ return x.id === area.value; })[0];
    var type = $('hv-type').value, beds = +$('hv-beds').value, cond = +$('hv-cond').value;
    if (!r || r.status !== 'live') return null;
    var base = null, basis = '';
    var t = r.types && r.types[type];
    var month = r.month || D.month;
    if (t && t[1] && (t[0] === null || t[0] === -1 || t[0] >= (D.minSales || 5))){
      base = t[1];
      basis = 'Based on the average price of ' + TYPE_NAMES[type] + ' in ' + r.name + ' (' + month + '): ' + money(base) + '.';
    } else if (r.avg){
      base = r.avg;
      basis = 'Based on the average price of all homes sold in ' + r.name + ' (' + month + '): ' + money(base) + '. There weren\'t enough ' + TYPE_NAMES[type] + ' sales to use on their own.';
    }
    if (!base) return null;
    var bedAdj = Math.max(-MAX_BED_ADJ, Math.min(MAX_BED_ADJ, (beds - TYPICAL_BEDS[type]) * PER_BED));
    var point = base * (1 + bedAdj) * (1 + cond);
    return {lo: point * (1 - SPREAD), hi: point * (1 + SPREAD), basis: basis + ' Adjusted for bedrooms and condition.', region: r.name};
  }

  $('est').addEventListener('submit', function(e){
    e.preventDefault();
    var est = estimate();
    $('hv-empty').hidden = true;
    var rng = $('hv-range');
    if (est){
      $('hv-range-l').textContent = 'Ballpark value';
      $('hv-range-v').textContent = short(est.lo) + ' to ' + short(est.hi);
      $('hv-basis').textContent = est.basis;
      $('x-ballpark').value = money(est.lo) + ' to ' + money(est.hi);
    } else {
      $('hv-range-l').textContent = 'Ballpark value';
      $('hv-range-v').textContent = 'Let me run it';
      $('hv-basis').textContent = 'I don\'t have enough published sales data for that area to give an instant ballpark. Request your exact value below and I\'ll prepare it personally.';
      $('x-ballpark').value = 'Not available for this area';
    }
    rng.hidden = false;
    $('x-address').value = $('hv-address').value;
    $('x-area').value = area.options[area.selectedIndex].text;
    $('x-type').value = $('hv-type').options[$('hv-type').selectedIndex].text;
    $('x-beds').value = $('hv-beds').options[$('hv-beds').selectedIndex].text;
    $('x-cond').value = $('hv-cond').options[$('hv-cond').selectedIndex].text;
    $('hv-exact').hidden = false;
    if (window.innerWidth < 860) rng.scrollIntoView({behavior: 'smooth', block: 'start'});
  });
})();
