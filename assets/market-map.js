/* Market map component: needs #map and #panel; #rows table is optional */
(function(){
  var D = window.MARKET_DATA, MIN = D.minSales || 5;
  var TYPES = [["detached","Detached"],["semi","Semi-detached"],["town","Townhouse"],["condoTown","Condo townhouse"],["condoApt","Condo apartment"]];
  var money = function(n){ return "$" + Math.round(n).toLocaleString("en-CA"); };
  var short = function(n){ return n >= 1e6 ? "$" + (n/1e6).toFixed(2).replace(/0$/,"") + "M" : "$" + Math.round(n/1e3) + "K"; };
  var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); };

  if (!document.getElementById("map")) return;
  var map = L.map("map", { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 13, minZoom: 6,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  map.on("click", function(){ map.scrollWheelZoom.enable(); });
  var mapEl = document.getElementById("map");
  map.on("zoomend", function(){ mapEl.classList.toggle("show-labels", map.getZoom() >= 9); });

  var markers = {}, activeId = null;
  D.regions.forEach(function(r){
    var live = r.status === "live";
    var label = live ? short(r.avg) : "Coming soon";
    var html = '<div class="pin ' + (live ? "" : "pending") + '" data-id="' + r.id + '"><span class="dot"></span><span class="lbl"><small>' + esc(r.name) + '</small>' + label + '</span></div>';
    var icon = L.divIcon({ className: "", html: html, iconSize: [0,0] });
    var m = L.marker([r.lat, r.lng], { icon: icon, keyboard: true, title: r.name, riseOnHover: true }).addTo(map);
    m.on("click", function(){ select(r.id, false); });
    markers[r.id] = m;
  });
  map.fitBounds(L.latLngBounds(D.regions.map(function(r){ return [r.lat, r.lng]; })).pad(0.18));

  function select(id, pan){
    var r = D.regions.filter(function(x){ return x.id === id; })[0];
    if (!r) return;
    activeId = id;
    document.querySelectorAll(".pin").forEach(function(p){ p.classList.toggle("active", p.getAttribute("data-id") === id); });
    if (pan) map.panTo([r.lat, r.lng]);
    if (markers[id]) markers[id].setZIndexOffset(1000);
    Object.keys(markers).forEach(function(k){ if (k !== id) markers[k].setZIndexOffset(0); });
    var mo = r.month || D.month;
    var h = '<div class="grp">' + esc(r.group) + ' · ' + esc(mo) + '</div><h2>' + esc(r.name) + '</h2>';
    if (r.status !== "live") {
      h += '<p class="pending-note">' + esc(mo) + ' numbers for ' + esc(r.name) + ' are on the way. Want them now? I can pull the latest sales for you.</p>';
    } else {
      h += '<div class="big"><div><div class="l">Avg. sold price</div><div class="v red">' + money(r.avg) + '</div></div>' +
           '<div><div class="l">Avg. days on market</div><div class="v">' + r.dom + ' days</div></div>' +
           (r.median ? '<div><div class="l">Median price</div><div class="v">' + money(r.median) + '</div></div>' : '') +
           (r.benchmark ? '<div><div class="l">Benchmark price</div><div class="v">' + short(r.benchmark) + ' <span style="font-size:.6em;color:var(--ember-soft)">' + r.benchmarkChg + '%</span></div></div>' : '') +
           '</div>';
      if (!r.types) {
        h += '<p class="pending-note">Breakdown by home type for ' + esc(r.name) + ' is coming soon.' + (r.spLp ? ' Homes sold for ' + r.spLp + '% of asking on average.' : '') + '</p>';
        h += '<div class="src">' + r.sales.toLocaleString("en-CA") + ' total sales · Source: ' + esc(r.source) + '</div>';
        h += '<a class="btn" href="/sell/#value">Get my numbers for ' + esc(r.name) + ' →</a>';
        document.getElementById("panel").innerHTML = h;
        return;
      }
      h += '<ul class="types">';
      TYPES.forEach(function(t){
        var v = r.types[t[0]];
        if (v && v[0] === -1) { h += '<li><span class="t">' + t[1] + '</span><span class="p">' + money(v[1]) + '</span></li>'; return; }
        if (v && v[0] === null) { h += '<li><span class="t">' + t[1] + '</span><span class="p">~' + money(v[1]) + '</span><span class="n">Approximate</span></li>'; return; }
        if (!v || !v[0]) { h += '<li class="none"><span class="t">' + t[1] + '</span><span class="p">' + (r.typesNote ? 'Not available' : 'No sales') + '</span></li>'; return; }
        var thin = v[0] < MIN;
        h += '<li class="' + (thin ? "thin" : "") + '"><span class="t">' + t[1] + '</span><span class="p">' + money(v[1]) + '</span>' +
             '<span class="n">' + v[0] + (v[0] === 1 ? " sale" : " sales") + (thin ? " · limited sales, read with caution" : "") + '</span></li>';
      });
      h += '</ul><div class="src">' + r.sales.toLocaleString("en-CA") + ' total sales · Source: ' + esc(r.source) + (r.typesNote ? '<br>' + esc(r.typesNote) : '') + '</div>';
    }
    h += '<a class="btn" href="/sell/#value">Get my numbers for ' + esc(r.name) + ' →</a>';
    document.getElementById("panel").innerHTML = h;
  }

  var rows = "";
  D.regions.forEach(function(r){
    if (r.status !== "live") {
      rows += '<tr data-id="' + r.id + '"><td>' + esc(r.name) + '</td><td class="mut" colspan="7" style="text-align:left">Coming soon</td></tr>';
      return;
    }
    if (!r.types) {
      rows += '<tr data-id="' + r.id + '" tabindex="0"><td>' + esc(r.name) + '</td><td>' + short(r.avg) + '</td><td class="mut" colspan="5" style="text-align:left">Home-type breakdown coming soon</td><td>' + r.dom + '</td></tr>';
      return;
    }
    var cells = TYPES.map(function(t){
      var v = r.types[t[0]];
      if (v && v[0] === -1) return '<td>' + short(v[1]) + '</td>';
      if (v && v[0] === null) return '<td>~' + short(v[1]) + '</td>';
      if (!v || !v[0]) return '<td class="mut">—</td>';
      return '<td class="' + (v[0] < MIN ? "mut" : "") + '">' + short(v[1]) + '</td>';
    }).join("");
    rows += '<tr data-id="' + r.id + '" tabindex="0"><td>' + esc(r.name) + '</td><td>' + short(r.avg) + '</td>' + cells + '<td>' + r.dom + '</td></tr>';
  });
  var tb = document.getElementById("rows");
  if (!tb) { select("barrie", false); return; }
  tb.innerHTML = rows;
  tb.addEventListener("click", function(e){
    var tr = e.target.closest("tr"); if (!tr) return;
    select(tr.getAttribute("data-id"), true);
    document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  tb.addEventListener("keydown", function(e){
    if (e.key === "Enter") { var tr = e.target.closest("tr"); if (tr) select(tr.getAttribute("data-id"), true); }
  });

  select("barrie", false);
})();
