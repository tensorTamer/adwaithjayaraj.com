/* Network Maps: interactive topology viewer. The lab data lives in topology-data.js. */
(function () {
  'use strict';
  var root = document.getElementById('topo');
  if (!root || !window.TOPO) return;
  var NS = 'http://www.w3.org/2000/svg', W = 176, H = 60;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var D = window.TOPO, ICON = D.ICON, TYPE = D.TYPE, STATUS = D.STATUS, MAPS = D.MAPS;

  // data check: warns in the console when a map refers to a device that is not there, or a flow jumps between unlinked devices
  MAPS.forEach(function (m) {
    var ids = {};
    m.nodes.forEach(function (n) { ids[n.id] = 1; });
    var linked = function (a, b) { return m.links.some(function (l) { return (l.a === a && l.b === b) || (l.a === b && l.b === a); }); };
    m.links.forEach(function (l) { [l.a, l.b].forEach(function (id) { if (!ids[id]) console.warn('[maps] ' + m.id + ': link uses unknown device "' + id + '"'); }); });
    m.flows.forEach(function (f) {
      f.steps.forEach(function (st, i) {
        var ns = [i ? f.steps[i - 1].n : st.n].concat(st.via || [], st.n), where = '[maps] ' + m.id + ' / ' + f.name + ': step ' + (i + 1);
        ns.forEach(function (id) { if (!ids[id]) console.warn(where + ' uses unknown device "' + id + '"'); });
        ns.forEach(function (id, j) { if (j && ns[j - 1] !== id && ids[id] && ids[ns[j - 1]] && !linked(ns[j - 1], id)) console.warn(where + ': no link between "' + ns[j - 1] + '" and "' + id + '"'); });
      });
    });
  });

  // ---------- DOM ----------
  var svg = root.querySelector('.topo-svg'), side = root.querySelector('.topo-side'), tip = root.querySelector('.topo-tip'),
    legend = root.querySelector('.topo-legend'), live = root.querySelector('.topo-live'), body = root.querySelector('.topo-body'),
    fullBtn = root.querySelector('[data-act=full]'), tabs = [].slice.call(root.querySelectorAll('[role=tab]'));
  svg.innerHTML = '<title id="t-title"></title><desc id="t-desc"></desc><defs><pattern id="t-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle class="t-dot" cx="2" cy="2" r="1"/></pattern>' +
    '<filter id="t-glow" x="-3" y="-3" width="7" height="7"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
    '<rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#t-grid)"/><g class="t-world"></g><g class="t-packets"></g>';
  var world = svg.querySelector('.t-world'), packets = svg.querySelector('.t-packets');
  var S = { m: null, N: {}, vb: null, layers: {}, flow: null, step: -1, playing: false, timer: 0, tok: 0, movers: [], pk: null, x: null, sel: null, on: false, inView: false, t: 0, raf: 0, lastAmb: 0, moved: false };

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- geometry ----------
  function seg(p, i) { return Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); }
  function plen(p) { for (var s = 0, i = 1; i < p.length; i++) s += seg(p, i); return s; }
  function at(p, d) {
    for (var i = 1; i < p.length; i++) {
      var s = seg(p, i);
      if (d <= s || i === p.length - 1) { var f = s ? Math.max(0, Math.min(d / s, 1)) : 0; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f]; }
      d -= s;
    }
    return p[0];
  }
  function sub(p, d0, d1) {
    var out = [at(p, d0)], acc = 0;
    for (var i = 1; i < p.length - 1; i++) { acc += seg(p, i); if (acc > d0 && acc < d1) out.push(p[i]); }
    out.push(at(p, d1));
    return out;
  }
  function inside(q, n) { return Math.abs(q[0] - n.x) <= W / 2 && Math.abs(q[1] - n.y) <= H / 2; }
  // cut the parts of a path hidden under its two end cards, so packets travel only on visible line
  function trim(p, a, b) {
    var L = plen(p), d0 = 0, d1 = L;
    while (d0 < L && inside(at(p, d0), a)) d0 += 2;
    while (d1 > d0 && inside(at(p, d1), b)) d1 -= 2;
    return sub(p, d0, d1);
  }
  function route(l) {
    var a = S.N[l.a], b = S.N[l.b], pa = l.pa || [0, 0], pb = l.pb || [0, 0],
      A = [a.x + pa[0], a.y + pa[1]], B = [b.x + pb[0], b.y + pb[1]], v = l.via;
    if (!v) {
      if (A[0] === B[0] || A[1] === B[1]) v = [];
      else { var my = l.my != null ? l.my : (A[1] + B[1]) / 2; v = [[A[0], my], [B[0], my]]; }
    }
    return [A].concat(v, [B]);
  }
  function linkOf(a, b) { for (var i = 0; i < S.m.links.length; i++) { var l = S.m.links[i]; if ((l.a === a && l.b === b) || (l.a === b && l.b === a)) return l; } }
  function pathBetween(a, b) {
    var l = linkOf(a, b), p = l ? (l.a === a ? l.pts : l.pts.slice().reverse()) : [[S.N[a].x, S.N[a].y], [S.N[b].x, S.N[b].y]];
    return trim(p, S.N[a], S.N[b]);
  }

  // ---------- drawing ----------
  function tag(parent, x, y, text, cls, anchor) {
    var g = el('g', { 'class': 't-tag ' + cls }, parent), bg = el('rect', { rx: cls === 't-pill' ? 8 : 3 }, g),
      t = el('text', { x: x, y: y, 'text-anchor': anchor || 'start' }, g);
    String(text).split('\n').forEach(function (line, i) { var s = el('tspan', { x: x, dy: i ? 12 : 0 }, t); s.textContent = line; });
    try { var b = t.getBBox(); bg.setAttribute('x', b.x - 4); bg.setAttribute('y', b.y - 2); bg.setAttribute('width', b.width + 8); bg.setAttribute('height', b.height + 4); } catch (e) {}
    return g;
  }
  function txt(p, x, y, s, cls, max) {
    var t = el('text', { 'class': cls, x: x, y: y }, p), str = s;
    t.textContent = s;
    try { while (str.length > 3 && t.getComputedTextLength() > max) { str = str.slice(0, -1); t.textContent = str + '…'; } } catch (e) {}
    return t;
  }
  function longest(p) {
    for (var best = -1, bi = 1, i = 1; i < p.length; i++) { var d = seg(p, i); if (d > best) { best = d; bi = i; } }
    return [p[bi - 1], p[bi]];
  }
  function linkLabel(l, gt) {
    if (l.lp) return tag(gt, l.lp[0], l.lp[1], l.label, 't-label', l.la || 'start');
    var s = longest(l.pts), mx = (s[0][0] + s[1][0]) / 2, my = (s[0][1] + s[1][1]) / 2, side = l.side || 1;
    if (s[0][0] === s[1][0]) return tag(gt, mx + 8 * side, my + 4, l.label, 't-label', side > 0 ? 'start' : 'end');
    return tag(gt, mx, my + (side > 0 ? -8 : 16), l.label, 't-label', 'middle');
  }
  function badge(gt, l, start) {
    var p = l.pts, a = start ? p[0] : p[p.length - 1], b = start ? p[1] : p[p.length - 2], vert = a[0] === b[0];
    if (start && l.my != null && vert) { // each switch link has its own row, so its badge sits on that row
      var left = S.N[l.b].x < a[0];
      return tag(gt, a[0] + (left ? -6 : 6), l.my - 5, l.ifA, 't-badge', left ? 'end' : 'start');
    }
    var f = Math.min(((vert ? H : W) / 2 + 14) / Math.hypot(b[0] - a[0], b[1] - a[1]), 0.65),
      x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, s = start ? l.ifA : l.ifB;
    return vert ? tag(gt, x + 6, y + 4, s, 't-badge', 'start') : tag(gt, x, y - 6, s, 't-badge', 'middle');
  }
  function pill(gt, l) { // sits beside the line, never on it
    var p = l.pts, d = plen(p) * (l.vp != null ? l.vp : 0.5), P = at(p, d), i = 1, acc = 0;
    for (; i < p.length - 1 && acc + seg(p, i) < d; i++) acc += seg(p, i); // segment that holds P
    return p[i - 1][0] === p[i][0] ? tag(gt, P[0] + 8, P[1] + 3.5, l.vlan, 't-pill', 'start') : tag(gt, P[0], P[1] - 6, l.vlan, 't-pill', 'middle');
  }

  function render() {
    var m = S.m, L = S.layers;
    world.textContent = '';
    var gz = el('g', {}, world), gl = el('g', {}, world), gh = el('g', {}, world), gt = el('g', {}, world), gn = el('g', {}, world);
    m.zones.forEach(function (z) {
      el('rect', { 'class': 't-zone', x: z.x, y: z.y, width: z.w, height: z.h, rx: 14 }, gz);
      // header strip sits above the links, so lines pass "under" the zone name
      el('path', { 'class': 't-zhead', d: 'M' + z.x + ' ' + (z.y + 36) + 'V' + (z.y + 14) + 'Q' + z.x + ' ' + z.y + ' ' + (z.x + 14) + ' ' + z.y + 'H' + (z.x + z.w - 14) + 'Q' + (z.x + z.w) + ' ' + z.y + ' ' + (z.x + z.w) + ' ' + (z.y + 14) + 'V' + (z.y + 36) + 'Z' }, gh);
      el('rect', { 'class': 't-zborder', x: z.x, y: z.y, width: z.w, height: z.h, rx: 14 }, gh);
      txt(gh, z.x + 14, z.y + (L.vlan ? 16 : 23), z.name, 't-zname', z.w - 24);
      if (L.vlan) txt(gh, z.x + 14, z.y + 30, z.meta, 't-zmeta', z.w - 24);
    });
    m.links.forEach(function (l, i) {
      var pts = l.pts = route(l), d = 'M' + pts.map(function (q) { return q[0] + ',' + q[1]; }).join('L');
      l.el = el('path', { 'class': 't-link' + (l.dash ? ' dash' : '') + (l.thick ? ' thick' : ''), d: d }, gl);
      el('path', { 'class': 't-hit', d: d, 'data-l': i }, gl);
      l.tags = [];
      if (L.ports && l.label) l.tags.push(linkLabel(l, gt));
      if (L.vlan && l.vlan) l.tags.push(pill(gt, l));
      if (L.ifn && l.ifA) l.tags.push(badge(gt, l, true));
      if (L.ifn && l.ifB) l.tags.push(badge(gt, l, false));
    });
    (m.pills || []).forEach(function (p) { tag(gt, p.x, p.y + 3.5, p.text, 't-pill', 'middle'); });
    m.nodes.forEach(function (n) {
      var g = el('g', { 'class': 't-node' + (n.planned ? ' planned' : ''), transform: 'translate(' + n.x + ',' + n.y + ')', tabindex: 0, role: 'button', 'data-n': n.id, 'aria-label': n.host + ', ' + n.role + '. Show details' }, gn),
        lift = el('g', { 'class': 't-lift' }, g), ip = L.ip && n.ip, x0 = -W / 2 + 44, ys = ip ? [-9, 5, 19] : [-3, 12];
      el('rect', { 'class': 't-ring', x: -W / 2, y: -H / 2, width: W, height: H, rx: 10 }, lift);
      el('rect', { 'class': 't-card', x: -W / 2, y: -H / 2, width: W, height: H, rx: 10 }, lift);
      el('g', { 'class': 't-ico', transform: 'translate(' + (-W / 2 + 12) + ',-11) scale(.92)' }, lift).innerHTML = ICON[n.t];
      if (n.st) el('circle', { 'class': 't-led led-' + n.st, cx: -W / 2 + 9, cy: -H / 2 + 9, r: 3.5 }, lift);
      txt(lift, x0, ys[0], n.host, 't-host', W - 52);
      txt(lift, x0, ys[1], n.role, 't-role', W - 52);
      if (ip) txt(lift, x0, ys[2], n.ip, 't-ip', W - 52);
      n.el = g;
    });
    if (S.sel) S.N[S.sel].el.classList.add('sel');
    paintFlow();
  }

  function renderLegend() {
    var seen = {}, types = [], sts = [];
    S.m.nodes.forEach(function (n) {
      if (!seen[n.t]) { seen[n.t] = 1; types.push(n.t); }
      if (n.st && sts.indexOf(n.st) < 0) sts.push(n.st);
    });
    var ico = function (t) { return '<li><svg class="lg-ico" viewBox="0 0 24 24" aria-hidden="true">' + ICON[t] + '</svg>' + TYPE[t] + '</li>'; },
      line = function (c, t) { return '<li><svg width="30" height="10" aria-hidden="true"><line class="lg-line ' + c + '" x1="1" y1="5" x2="29" y2="5"/></svg>' + t + '</li>'; };
    legend.innerHTML = '<ul aria-label="Device types">' + types.map(ico).join('') + '</ul>' +
      '<ul aria-label="Links and status">' + line('', 'Active') + line('lg-dash', 'Planned / in progress') + line('lg-thick', 'Trunk / 10 GbE') + line('lg-bad', 'Blocked') +
      sts.map(function (s) { return '<li><span class="lg-led led-' + s + '" aria-hidden="true"></span>' + STATUS[s] + '</li>'; }).join('') + '</ul>';
  }

  // ---------- view: pan & zoom ----------
  function setVB() { var v = S.vb; svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h); }
  function fit() { S.vb = { x: -20, y: -20, w: S.m.w + 40, h: S.m.h + 40 }; S.vb0 = S.vb.w; setVB(); }
  // phones: the whole map is far too small to read, so start zoomed on the main devices; Fit shows everything
  function start() {
    fit();
    if (!S.m.focus || !matchMedia('(max-width: 640px)').matches) return;
    var r = svg.getBoundingClientRect(), w = 640, h = w * r.height / r.width;
    S.vb = { x: S.m.focus[0] - w / 2, y: S.m.focus[1] - h / 2, w: w, h: h }; setVB();
  }
  function clampVB() {
    var v = S.vb, cx = Math.min(Math.max(v.x + v.w / 2, 0), S.m.w), cy = Math.min(Math.max(v.y + v.h / 2, 0), S.m.h);
    v.x = cx - v.w / 2; v.y = cy - v.h / 2;
  }
  function zoomAt(px, py, f) {
    var v = S.vb, nw = Math.min(Math.max(v.w / f, S.vb0 / 4), S.vb0 * 1.25), r = nw / v.w;
    v.x = px - (px - v.x) * r; v.y = py - (py - v.y) * r; v.w = nw; v.h *= r;
    clampVB(); setVB();
  }
  function toSvg(x, y) { var p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  function zoomCenter(f) { zoomAt(S.vb.x + S.vb.w / 2, S.vb.y + S.vb.h / 2, f); }

  var ptrs = {}, pinch = null;
  svg.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    S.moved = false; pinch = null;
  });
  svg.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId], ids = Object.keys(ptrs);
    if (!p) return;
    if (ids.length === 1) {
      if (e.pointerType === 'touch') return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!S.moved && Math.hypot(dx, dy) < 5) return;
      if (!S.moved) { S.moved = true; svg.setPointerCapture(e.pointerId); svg.classList.add('grabbing'); hideTip(); }
      var k = svg.getScreenCTM().a;
      S.vb.x -= dx / k; S.vb.y -= dy / k; clampVB(); setVB();
      p.x = e.clientX; p.y = e.clientY;
    } else if (ids.length === 2) {
      p.x = e.clientX; p.y = e.clientY; S.moved = true;
      var a = ptrs[ids[0]], b = ptrs[ids[1]], dist = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (pinch) {
        var k2 = svg.getScreenCTM().a;
        S.vb.x -= (cx - pinch.cx) / k2; S.vb.y -= (cy - pinch.cy) / k2; // two fingers also pan
        var c = toSvg(cx, cy); zoomAt(c.x, c.y, dist / pinch.d);
      }
      pinch = { d: dist, cx: cx, cy: cy };
    }
  });
  function up(e) { delete ptrs[e.pointerId]; pinch = null; svg.classList.remove('grabbing'); }
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  // the page must stay scrollable: wheel zooms only with Ctrl/⌘ (a trackpad pinch also sends ctrlKey), one finger scrolls
  var hintEl = root.querySelector('.topo-hint'), hintTimer;
  function hint(msg) {
    hintEl.textContent = msg; hintEl.classList.add('show');
    clearTimeout(hintTimer); hintTimer = setTimeout(function () { hintEl.classList.remove('show'); }, 1600);
  }
  svg.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey) { hint('Ctrl/⌘ + scroll to zoom'); return; }
    e.preventDefault();
    var c = toSvg(e.clientX, e.clientY);
    zoomAt(c.x, c.y, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)));
  }, { passive: false });
  svg.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1) { if (e.cancelable) e.preventDefault(); } // two fingers belong to the map
    else hint('Use two fingers to move the map');
  }, { passive: false });
  svg.addEventListener('dblclick', function (e) { if (!e.target.closest('.t-node')) fit(); });

  // ---------- hover, tooltip, selection ----------
  function mark(l) { l.el.classList.add('hl'); l.tags.forEach(function (t) { t.classList.add('hl'); }); S.N[l.a].el.classList.add('hl'); S.N[l.b].el.classList.add('hl'); }
  function clearHl() { svg.classList.remove('dim'); [].forEach.call(svg.querySelectorAll('.hl'), function (x) { x.classList.remove('hl'); }); }
  function hlNode(id) {
    clearHl(); svg.classList.add('dim'); S.N[id].el.classList.add('hl');
    S.m.links.forEach(function (l) { if (l.a === id || l.b === id) mark(l); });
  }
  function showTip(l, e) {
    var lines = [S.N[l.a].host + ' ↔ ' + S.N[l.b].host, (l.label || l.tip || '').replace('\n', ' · '), l.speed, l.proto].filter(Boolean);
    tip.innerHTML = lines.map(function (s, i) { return i ? esc(s) : '<strong>' + esc(s) + '</strong>'; }).join('<br>');
    tip.hidden = false; placeTip(e);
  }
  function placeTip(e) {
    var r = svg.getBoundingClientRect(), x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    tip.style.left = Math.min(x, r.width - tip.offsetWidth - 8) + 'px';
    tip.style.top = Math.min(y, r.height - tip.offsetHeight - 8) + 'px';
  }
  function hideTip() { tip.hidden = true; }

  svg.addEventListener('mouseover', function (e) {
    if (svg.classList.contains('grabbing')) return;
    var n = e.target.closest('.t-node'), h = e.target.closest('.t-hit');
    if (n) { hlNode(n.dataset.n); hideTip(); }
    else if (h) { var l = S.m.links[+h.dataset.l]; clearHl(); svg.classList.add('dim'); mark(l); showTip(l, e); }
  });
  svg.addEventListener('mouseout', function (e) {
    var from = e.target.closest('.t-node, .t-hit');
    if (!from || (e.relatedTarget && from.contains(e.relatedTarget))) return;
    clearHl(); hideTip();
  });
  svg.addEventListener('mousemove', function (e) { if (!tip.hidden) placeTip(e); });
  svg.addEventListener('focusin', function (e) { var n = e.target.closest('.t-node'); if (n) hlNode(n.dataset.n); });
  svg.addEventListener('focusout', clearHl);
  svg.addEventListener('click', function (e) {
    if (S.moved) return;
    var n = e.target.closest('.t-node');
    if (n) details(n.dataset.n);
  });
  svg.addEventListener('keydown', function (e) {
    var n = e.target.closest('.t-node');
    if (n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); details(n.dataset.n); return; }
    if (e.target !== svg) return;
    // keyboard pan / zoom while the map itself has focus
    var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d) { e.preventDefault(); S.vb.x += d[0] * S.vb.w * 0.1; S.vb.y += d[1] * S.vb.h * 0.1; clampVB(); setVB(); }
    else if (e.key === '+' || e.key === '=') zoomCenter(1.3);
    else if (e.key === '-') zoomCenter(1 / 1.3);
  });

  // ---------- side panel ----------
  function back() { return '<button type="button" class="tp-back" data-act="overview">← Overview</button>'; }
  function list(t, arr) { return arr && arr.length ? '<h4>' + t + '</h4><ul class="tp-list">' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  function setSel(id) {
    if (S.sel && S.N[S.sel].el) S.N[S.sel].el.classList.remove('sel');
    S.sel = id;
    if (id) S.N[id].el.classList.add('sel');
  }
  function textAlt() {
    var m = S.m, name = function (x) { return S.N[x].host; };
    return '<details class="tp-text"><summary>Text version of this map</summary>' +
      list('Zones', m.zones.map(function (z) { return z.name + ' · ' + z.meta; })) +
      list('Devices', m.nodes.map(function (n) { return n.host + ' (' + n.role + ')' + (n.ips ? ': ' + n.ips.join(', ') : ''); })) +
      list('Connections', m.links.map(function (l) { var t = l.label || l.tip; return name(l.a) + ' ↔ ' + name(l.b) + (t ? ': ' + t.replace('\n', ' · ') : ''); })) + '</details>';
  }
  function overview() {
    var m = S.m;
    setSel(null);
    side.innerHTML = '<p class="tp-kicker">Overview</p><h3>' + esc(m.name) + '</h3>' +
      '<p class="tp-meta"><span class="tp-badge s-' + m.status + '">' + esc(m.badge) + '</span><span>' + esc(m.note) + '</span></p>' +
      '<p>' + esc(m.summary) + '</p><p class="tp-count">Devices on map: <strong>' + m.nodes.length + '</strong></p>' +
      (m.flows.length ? '<h4>Traffic flows</h4><ul class="tp-flows">' + m.flows.map(function (f, i) { return '<li><button type="button" data-flow="' + i + '">▶ ' + esc(f.name) + '</button></li>'; }).join('') + '</ul>' : '') +
      '<p class="tp-hint">Select a device on the map to see its details.</p>' + textAlt();
  }
  function details(id) {
    stopFlow();
    var n = S.N[id], conns = S.m.links.filter(function (l) { return l.a === id || l.b === id; }).map(function (l) {
      var o = S.N[l.a === id ? l.b : l.a], t = (l.label || l.tip || '').replace('\n', ' · ');
      return o.host + (t ? ' · ' + t : '');
    });
    setSel(id);
    side.innerHTML = back() +
      '<div class="tp-dev"><svg class="tp-ico" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n.t] + '</svg><div><h3>' + esc(n.host) + '</h3><p>' + esc(n.role) + '</p></div></div>' +
      '<p class="tp-meta"><span class="tp-badge s-' + (n.st || 'ext') + '">' + STATUS[n.st || 'ext'] + '</span><span>' + TYPE[n.t] + '</span></p>' +
      list('IP addresses', n.ips) + list('Interfaces', n.ifs) + list('Services & ports', n.svc) + list('Connections', conns) +
      (n.why ? '<p class="tp-why"><strong>Why it’s designed this way:</strong> ' + esc(n.why) + '</p>' : '');
    live.textContent = 'Details: ' + n.host;
  }
  function flowPanel() {
    var f = S.flow, k = S.step, last = f.steps.length - 1, I = Object.assign({}, f.insp, f.steps[k].insp), rows = [],
      fa = side.contains(document.activeElement) && document.activeElement, // the panel is rebuilt each step: keep keyboard focus on the same control
      keep = fa && (fa.dataset.act ? '[data-act=' + fa.dataset.act + ']' : fa.dataset.step != null ? '[data-step="' + fa.dataset.step + '"]' : '');
    if (I.proto) rows.push(['Protocol', I.proto]);
    if (I.src && I.dst) rows.push(['Source → destination', I.src + ' → ' + I.dst]);
    else if (I.src || I.dst) rows.push([I.src ? 'Source' : 'Destination', I.src || I.dst]);
    if (I.vlan) rows.push(['VLAN tag', I.vlan]);
    if (I.gw) rows.push(['Gateway', I.gw]);
    if (I.nat) rows.push(['NAT', I.nat]);
    if (I.policy) rows.push(['Firewall policy', I.policy]);
    side.innerHTML = back() + '<p class="tp-kicker">Traffic flow</p><h3>' + esc(f.name) + '</h3>' +
      '<div class="tp-ctrl"><button type="button" data-act="prev"' + (k ? '' : ' disabled') + '>◀ Prev</button>' +
      (reduce ? '' : '<button type="button" data-act="play">' + (S.playing ? 'Pause' : k === last ? 'Replay' : 'Play') + '</button>') +
      '<button type="button" data-act="next"' + (k < last ? '' : ' disabled') + '>Next ▶</button></div>' +
      '<ol class="tp-steps">' + f.steps.map(function (s, i) {
        return '<li' + (i === k ? ' class="cur" aria-current="step"' : i < k ? ' class="done"' : '') + '><button type="button" data-step="' + i + '">' + esc(s.t) + '</button></li>';
      }).join('') + '</ol>' +
      '<div class="tp-insp"><p class="tp-kicker">Packet inspector · step ' + (k + 1) + ' of ' + f.steps.length + '</p>' +
      (rows.length ? '<dl>' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' : '<p class="tp-hint">No packet details documented for this hop.</p>') + '</div>';
    var again = keep && side.querySelector(keep);
    if (again && !again.disabled) again.focus({ preventScroll: true });
  }
  side.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || !S.m) return;
    var a = b.dataset.act, focus = '[data-act=play]';
    if (b.dataset.flow != null) startFlow(+b.dataset.flow);
    else if (b.dataset.step != null) { S.playing = false; goStep(+b.dataset.step, false); focus = '[data-step="' + b.dataset.step + '"]'; }
    else if (a === 'overview') { stopFlow(); overview(); focus = '[data-flow]'; }
    else if (a === 'prev') { S.playing = false; goStep(S.step - 1, false); focus = '[data-act=prev]:not(:disabled)'; }
    else if (a === 'next') { S.playing = false; goStep(S.step + 1, true); focus = '[data-act=next]:not(:disabled)'; }
    else if (a === 'play') {
      if (S.playing) { S.playing = false; clearTimeout(S.timer); flowPanel(); }
      else { S.playing = true; if (S.step >= S.flow.steps.length - 1) goStep(0, false); else goStep(S.step + 1, true); }
    }
    var f = side.querySelector(focus) || side.querySelector('[data-act=play], .tp-steps .cur button');
    if (f) f.focus({ preventScroll: true }); // on phones the panel sits below the map; keep the animation in view
  });

  // ---------- flows & packets ----------
  function loop() { if (!S.raf && S.on) S.raf = requestAnimationFrame(tick); }
  function tick(now) {
    S.raf = 0;
    S.movers = S.movers.filter(function (mv) {
      var p = Math.min((now - mv.t0) / mv.dur, 1), q = at(mv.pts, mv.len * p);
      mv.el.setAttribute('cx', q[0]); mv.el.setAttribute('cy', q[1]);
      if (p < 1) return true;
      if (mv.amb) mv.el.remove();
      if (mv.done) mv.done();
      return false;
    });
    var amb = !S.flow && !reduce;
    if (amb && now - S.lastAmb > 900) { S.lastAmb = now; ambient(); }
    if (amb || S.movers.length) loop(); // otherwise move() or stopFlow() restarts it
  }
  function move(c, pts, dur, extra) {
    var mv = { el: c, pts: pts, len: plen(pts), t0: performance.now(), dur: dur };
    for (var k in extra) mv[k] = extra[k];
    S.movers.push(mv); loop();
  }
  function ambient() {
    var ls = S.m.links.filter(function (l) { return !l.dash; }), n = S.movers.filter(function (m) { return m.amb; }).length;
    if (n >= 3 || !ls.length) return;
    var l = ls[Math.random() * ls.length | 0], pts = trim(l.pts, S.N[l.a], S.N[l.b]);
    if (Math.random() < 0.5) pts.reverse();
    move(el('circle', { 'class': 't-amb', r: 2.5 }, packets), pts, plen(pts) / 0.11, { amb: 1 });
  }
  function clearMovers(amb) {
    S.movers = S.movers.filter(function (m) {
      if (!!m.amb !== amb) return true;
      if (amb) m.el.remove();
      return false;
    });
  }
  function removeX() { if (S.x) { S.x.remove(); S.x = null; } }
  function startFlow(i) {
    stopFlow(); clearMovers(true); setSel(null);
    S.flow = S.m.flows[i]; S.playing = !reduce;
    if (!reduce) S.pk = el('circle', { 'class': 't-pk', r: 6, filter: 'url(#t-glow)' }, packets);
    goStep(0, false);
  }
  function stopFlow() {
    clearTimeout(S.timer); S.tok++; clearMovers(false);
    if (S.pk) S.pk.remove();
    removeX();
    S.pk = null; S.flow = null; S.step = -1; S.playing = false;
    paintFlow(); loop();
  }
  function chain(k) { var st = S.flow.steps; return [st[k - 1].n].concat(st[k].via || [], st[k].n); } // devices a step passes through
  function hops(ns) { return ns.slice(1).reduce(function (p, id, i) { return p.concat(pathBetween(ns[i], id)); }, []); }
  function markBlock(n) {
    S.x = el('g', { 'class': 't-x', transform: 'translate(' + (n.x + W / 2 - 4) + ',' + (n.y - H / 2 + 4) + ')' }, packets);
    el('circle', { r: 11 }, S.x); el('path', { d: 'M-4.5-4.5L4.5 4.5M4.5-4.5L-4.5 4.5' }, S.x);
  }
  function goStep(k, animate) {
    var f = S.flow, st = f.steps[k], prev = S.step, tok = ++S.tok, n = S.N[st.n];
    clearTimeout(S.timer); clearMovers(false); removeX();
    S.step = k; paintFlow(); flowPanel();
    live.textContent = 'Step ' + (k + 1) + ' of ' + f.steps.length + ': ' + st.t;
    if (reduce) { f.steps.forEach(function (s) { if (s.block) markBlock(S.N[s.n]); }); return; } // all steps and the path show at once
    S.pk.classList.remove('bad');
    function arrived() {
      if (tok !== S.tok) return;
      pulse(n);
      if (st.block) { S.pk.classList.add('bad'); markBlock(n); }
      if (S.playing) S.timer = setTimeout(function () {
        if (tok !== S.tok) return;
        if (k < f.steps.length - 1) goStep(k + 1, true); else { S.playing = false; flowPanel(); }
      }, 550);
    }
    var ns = k ? chain(k) : [st.n], moves = ns[0] !== st.n;
    if (animate && moves && prev === k - 1) move(S.pk, hops(ns), 700 * (ns.length - 1), { done: arrived });
    else {
      var q = moves ? hops(ns).pop() : [n.x, n.y - H / 2];
      S.pk.setAttribute('cx', q[0]); S.pk.setAttribute('cy', q[1]);
      arrived();
    }
  }
  function pulse(n) {
    if (reduce || !n.el) return;
    n.el.classList.remove('pulse');
    void n.el.getBBox();
    n.el.classList.add('pulse');
    setTimeout(function () { n.el.classList.remove('pulse'); }, 700);
  }
  function paintFlow() {
    var m = S.m;
    if (!m) return;
    m.links.forEach(function (l) { if (l.el) l.el.classList.remove('flow', 'blocked'); });
    m.nodes.forEach(function (n) { if (n.el) n.el.classList.remove('cur'); });
    svg.classList.toggle('flowing', !!S.flow);
    if (!S.flow || S.step < 0) return;
    var st = S.flow.steps, upto = reduce ? st.length - 1 : S.step;
    for (var k = 1; k <= upto; k++) chain(k).forEach(function (id, j, ns) {
      var l = j && ns[j - 1] !== id && linkOf(ns[j - 1], id);
      if (l && l.el) l.el.classList.add(st[k].block ? 'blocked' : 'flow');
    });
    (reduce ? st : [st[S.step]]).forEach(function (x) { if (S.N[x.n].el) S.N[x.n].el.classList.add('cur'); });
  }

  // ---------- maps, tabs, toolbar ----------
  function selectMap(id) {
    stopFlow(); clearMovers(true); hideTip();
    S.m = MAPS.filter(function (m) { return m.id === id; })[0] || MAPS[0];
    S.N = {}; S.sel = null;
    S.m.nodes.forEach(function (n) { S.N[n.id] = n; });
    tabs.forEach(function (t) {
      var on = t.dataset.map === S.m.id;
      t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1;
      if (on) body.setAttribute('aria-labelledby', t.id);
    });
    svg.querySelector('title').textContent = 'Network map: ' + S.m.name;
    svg.querySelector('desc').textContent = S.m.summary + ' Arrow keys pan, plus and minus zoom, Tab moves through the devices.';
    svg.setAttribute('aria-labelledby', 't-title'); svg.setAttribute('aria-describedby', 't-desc');
    render(); start(); overview(); renderLegend();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectMap(t.dataset.map); });
    t.addEventListener('keydown', function (e) {
      var k = { ArrowRight: 1, ArrowLeft: -1, Home: 'h', End: 'e' }[e.key];
      if (k == null) return;
      e.preventDefault();
      var j = k === 'h' ? 0 : k === 'e' ? tabs.length - 1 : (i + k + tabs.length) % tabs.length;
      tabs[j].focus(); selectMap(tabs[j].dataset.map);
    });
  });
  [].forEach.call(document.querySelectorAll('.map-link'), function (a) {
    a.addEventListener('click', function () { selectMap(a.dataset.map); });
  });

  function syncFull() {
    var on = document.fullscreenElement === root || root.classList.contains('is-full');
    fullBtn.setAttribute('aria-pressed', on);
    fullBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (root.classList.contains('is-full')) root.classList.remove('is-full');
    else if (root.requestFullscreen) root.requestFullscreen().catch(function () { root.classList.add('is-full'); syncFull(); });
    else root.classList.add('is-full'); // shortcut: iPhone Safari has no element fullscreen, so fill the viewport instead
    syncFull();
  }
  document.addEventListener('fullscreenchange', syncFull);
  root.querySelector('.tb-group').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    ({ zoomin: function () { zoomCenter(1.3); }, zoomout: function () { zoomCenter(1 / 1.3); }, fit: fit, full: toggleFull })[b.dataset.act]();
  });
  root.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (root.classList.contains('is-full')) { root.classList.remove('is-full'); syncFull(); }
    else if (S.flow || S.sel) { stopFlow(); overview(); }
  });

  var phone = matchMedia('(max-width: 640px)').matches;
  [].forEach.call(root.querySelectorAll('[data-layer]'), function (c) {
    var k = c.dataset.layer;
    c.checked = !phone || k === 'ip' || k === 'vlan';
    S.layers[k] = c.checked;
    c.addEventListener('change', function () { S.layers[k] = c.checked; render(); });
  });

  selectMap('msp');
  if (document.fonts) document.fonts.ready.then(render);
  // pause everything while the section is off-screen or the tab is hidden; a playing flow stops and waits for Play
  function vis() {
    var on = S.inView && !document.hidden;
    if (on === S.on) return;
    S.on = on;
    if (on) { var d = performance.now() - S.t; S.movers.forEach(function (m) { m.t0 += d; }); loop(); }
    else { cancelAnimationFrame(S.raf); S.raf = 0; S.t = performance.now(); clearTimeout(S.timer); if (S.playing) { S.playing = false; flowPanel(); } }
  }
  new IntersectionObserver(function (es) { S.inView = es[0].isIntersecting; vis(); }).observe(root);
  document.addEventListener('visibilitychange', vis);
})();
