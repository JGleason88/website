/* Menu toggle + current-page highlight */
(function () {
  var btn = document.getElementById('menuBtn'), links = document.getElementById('links');
  if (btn && links) {
    btn.addEventListener('click', function () { var o = links.classList.toggle('open'); btn.setAttribute('aria-expanded', o); });
    links.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { links.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }); });
  }
  var path = location.pathname.replace(/index\.html$/, '');
  document.querySelectorAll('.site-head .links a[data-sec]').forEach(function (a) {
    if (path.indexOf('/' + a.dataset.sec + '/') === 0) a.setAttribute('aria-current', 'page');
  });
})();
