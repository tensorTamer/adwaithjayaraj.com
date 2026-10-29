(function () {
  var d = document, root = d.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // theme toggle (localStorage only, no cookies)
  var themeBtn = d.getElementById('theme-btn');
  function syncBtn() {
    themeBtn.setAttribute('aria-label', 'Switch to ' + (root.dataset.theme === 'dark' ? 'light' : 'dark') + ' mode');
    var m = d.querySelector('meta[name=theme-color]');
    if (m) m.content = root.dataset.theme === 'dark' ? '#0a1220' : '#f5f8fc';
  }
  themeBtn.onclick = function () {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch (e) {}
    syncBtn(); drawStatic();
  };
  syncBtn();

  // mobile menu
  var menuBtn = d.getElementById('menu-btn'), links = d.getElementById('nav-links');
  function closeMenu() { links.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.onclick = function () {
    var o = links.classList.toggle('open'); menuBtn.setAttribute('aria-expanded', o);
  };
  links.addEventListener('click', closeMenu);
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  d.getElementById('year').textContent = new Date().getFullYear();

  // scroll reveal
  var rev = d.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    rev.forEach(function (el) { io.observe(el); });
  } else rev.forEach(function (el) { el.classList.add('in'); });

  // hero terminal: types the command, reveals hops, then the name. ~4s total, skippable.
  var term = d.getElementById('term'), typedEl = d.getElementById('typed');
  var lines = [].slice.call(term.querySelectorAll('.ln')), skipBtn = d.getElementById('skip-btn');
  var cmd = typedEl.textContent, timers = [], done = false;

  function finish() {
    if (done) return; done = true;
    timers.forEach(clearTimeout);
    typedEl.textContent = cmd;
    lines.forEach(function (l) { l.style.visibility = ''; });
    root.classList.remove('pre');
    skipBtn.hidden = true;
    term.querySelector('.caret').style.display = 'none';
  }
  function after(ms, fn) { timers.push(setTimeout(fn, ms)); }

  if (reduce) { finish(); }
  else {
    root.classList.add('pre');
    typedEl.textContent = '';
    lines.slice(1).forEach(function (l) { l.style.visibility = 'hidden'; });
    var t = 300;
    for (var i = 1; i <= cmd.length; i++) (function (n) { after(t + n * 28, function () { typedEl.textContent = cmd.slice(0, n); }); })(i);
    t += cmd.length * 28 + 250;
    lines.slice(1).forEach(function (l, k) { after(t + k * 300, function () { l.style.visibility = ''; }); });
    after(t + (lines.length - 1) * 300 + 300, finish);
    skipBtn.onclick = finish;
    d.addEventListener('keydown', function (e) { if (e.key === 'Enter' && d.activeElement === d.body) finish(); });
  }

  // background: nodes, links, travelling packet dots
  var cv = d.getElementById('net'), cx = cv.getContext('2d'), nodes = [], pk = [], W, H, raf, heroOn = true;
  function col(n) { return getComputedStyle(root).getPropertyValue(n).trim(); }
  function size() {
    var r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.round(Math.min(46, W * H / 22000));
    nodes = []; for (var i = 0; i < n; i++) nodes.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .15, vy: (Math.random() - .5) * .15 });
    pk = [];
  }
  function near(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy < 150 * 150; }
  function frame(move) {
    cx.clearRect(0, 0, W, H);
    var c = col('--accent'), l = col('--line');
    cx.lineWidth = 1; cx.strokeStyle = l;
    nodes.forEach(function (a, i) {
      if (move) { a.x += a.vx; a.y += a.vy; if (a.x < 0 || a.x > W) a.vx *= -1; if (a.y < 0 || a.y > H) a.vy *= -1; }
      for (var j = i + 1; j < nodes.length; j++) if (near(a, nodes[j])) { cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(nodes[j].x, nodes[j].y); cx.stroke(); }
    });
    cx.fillStyle = l;
    nodes.forEach(function (a) { cx.beginPath(); cx.arc(a.x, a.y, 2, 0, 6.3); cx.fill(); });
    if (!move) return;
    if (pk.length < 6 && Math.random() < .03) {
      var a = nodes[Math.random() * nodes.length | 0], nb = nodes.filter(function (b) { return b !== a && near(a, b); });
      if (nb.length) pk.push({ a: a, b: nb[Math.random() * nb.length | 0], t: 0 });
    }
    cx.fillStyle = c; cx.shadowColor = c; cx.shadowBlur = 10;
    pk = pk.filter(function (p) {
      p.t += .02; if (p.t >= 1 || !near(p.a, p.b)) return false;
      cx.beginPath(); cx.arc(p.a.x + (p.b.x - p.a.x) * p.t, p.a.y + (p.b.y - p.a.y) * p.t, 2.8, 0, 6.3); cx.fill(); return true;
    });
    cx.shadowBlur = 0;
  }
  function loop() { frame(true); raf = requestAnimationFrame(loop); }
  function drawStatic() { if (reduce) frame(false); }
  size();
  if (reduce) frame(false);
  else {
    loop();
    // stop drawing while the hero is off-screen or the tab is hidden
    new IntersectionObserver(function (es) {
      heroOn = es[0].isIntersecting; cancelAnimationFrame(raf); if (heroOn && !d.hidden) loop();
    }).observe(cv);
    d.addEventListener('visibilitychange', function () { cancelAnimationFrame(raf); if (heroOn && !d.hidden) loop(); });
  }
  var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { size(); drawStatic(); }, 150); });
})();
