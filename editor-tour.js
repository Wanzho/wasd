/* wasdmod site: the key layout editor, toured as you scroll (section 5).
   editor-snap.html is a frozen copy of the real editor (wasdmod's configurator.html in its dark
   Windows look, with the Recommended layout). It's fetched once the section is near, put in a
   shadow root so its styles stay its own, laid out at the editor's own 1280 x 960 and scaled to
   fit, so every key, row and chip is a real element.
   While the section is pinned, the scroll position only picks the step. Each step then plays on
   a timer: the camera moves to that part of the editor (one CSS transform), a spotlight dims the
   rest, a caption slides in, and a short animation runs on the editor's own elements. A step
   starts once the scroll rests on it for 150 ms, so scrolling fast skips steps instead of
   queueing them. Scrolling back plays the earlier step again; the dots jump to a step.
   Reduced motion (or a short screen): no pin, no animation, the editor as it is and the steps
   as a list. Without JavaScript: a picture (editor.webp) and the list. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var api = window.__wasd || (window.__wasd = { errors: [] });
  var fig = doc.querySelector('.ed-fig');
  if (!fig) return;
  function report(name, err) {
    if (api.errors) api.errors.push('editor: ' + name);
    if (window.console && console.error) console.error('wasdmod site: editor tour "' + name + '" failed', err);
  }
  function safe(name, fn) {
    return function () { try { return fn.apply(this, arguments); } catch (err) { report(name, err); } };
  }

  var view = fig.querySelector('.ed-view'), stage = fig.querySelector('.ed-stage'), track = fig.querySelector('.ed-track'),
    pin = fig.querySelector('.ed-pin'), cap = fig.querySelector('.ed-cap'), dotsWrap = fig.querySelector('.ed-dots'),
    items = Array.prototype.slice.call(fig.querySelectorAll('.ed-steps > li'));
  if (!view || !stage || !track || !pin) return;
  var motion = root.classList.contains('motion') && !!window.fetch;
  var mm = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener: null, addListener: null }; };
  var tallMq = mm('(min-height: 520px)'), compactMq = mm('(max-width: 999px)');
  var W = 1280, H = 960;

  /* ---------- state ---------- */
  var sr = null, app = null, cam = null, body = null, spot = null, menu = null, keycap = null, ptr = null, host = null;
  var pristine = null;               // fresh copies of the parts the steps change
  var k = 0.5;                       // the copy's scale on screen
  var camNow = { z: 1, tx: 0, ty: 0 }, frameNow = null;
  var step = -1, tourOn = false, near = false, jumping = 0, settle = 0, jumpTimer = 0;
  var timers = [], anims = [];
  var liveKeys = false, downKeys = {}, touched = false;

  function at(ms, fn) { timers.push(setTimeout(safe('step', fn), ms)); }
  function clearTimers() {
    timers.forEach(clearTimeout); timers = [];
    anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* gone */ } }); anims = [];
  }
  function animate(el, frames, opts) {
    if (!el || !el.animate) return null;
    var a = el.animate(frames, opts); anims.push(a); return a;
  }
  function q(sel) { return sr ? sr.querySelector(sel) : null; }
  function qa(sel) { return sr ? Array.prototype.slice.call(sr.querySelectorAll(sel)) : []; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- the caption list, the dots ---------- */
  var dots = items.map(function (li, i) {
    if (!dotsWrap) return null;
    var b = doc.createElement('button'), t = li.querySelector('b');
    b.type = 'button';
    b.className = 'ed-dot';
    b.textContent = String(i + 1);
    b.setAttribute('aria-label', (t ? t.textContent : li.textContent).replace(/\.$/, ''));
    b.addEventListener('click', safe('dot', function () { jumpTo(i + 1); }));
    dotsWrap.appendChild(b);
    return b;
  });
  function markDot(n) {
    dots.forEach(function (d, i) { if (!d) return; if (i + 1 === n) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
  }

  /* ---------- the copy of the editor ---------- */
  // The tour's own bits inside the shadow root: camera, spotlight, the layout menu, a keycap.
  var CSS = [
    '.ed-html { --cam: cubic-bezier(.6, 0, .2, 1); }',
    '.ed-html :is(#conflicts, #mismatch, .grid section.card) { animation: none; }',
    '.ed-cam { position: absolute; left: 0; top: 0; width: 1280px; height: 960px; transform-origin: 0 0; transition: transform .8s var(--cam); }',
    '.ed-cam > .ed-body { min-height: 960px; }',
    '.ed-now .ed-cam, .ed-now .ed-spot { transition: none !important; }',
    '.ed-spot { position: absolute; z-index: 40; left: 0; top: 0; width: 0; height: 0; border-radius: 12px; pointer-events: none; opacity: 0;',
    '  box-shadow: 0 0 0 2px rgba(255, 150, 80, .95), 0 0 30px 6px rgba(255, 106, 61, .38), 0 0 0 4000px rgba(0, 0, 0, .56);',
    '  transition: opacity .5s, left .8s var(--cam), top .8s var(--cam), width .8s var(--cam), height .8s var(--cam); will-change: transform; }',
    '.ed-spot.on { opacity: 1; }',
    '.ed-html .ktip { z-index: 50; }',
    '.ed-html .ed-body { pointer-events: none; }',
    '.ed-keys #kbd .k, .ed-keys .mouse .k { pointer-events: auto; }',
    /* the layout picker, open: a Windows 11 menu */
    '.ed-menu { position: absolute; z-index: 50; left: 0; top: 0; min-width: 240px; padding: 4px; border-radius: 8px; background: rgba(44, 44, 46, .97);',
    '  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .09), 0 16px 40px rgba(0, 0, 0, .55), 0 2px 8px rgba(0, 0, 0, .35);',
    '  font: 400 14px/1 var(--body); color: var(--fg); opacity: 0; visibility: hidden; transform: translateY(-6px) scale(.98); transform-origin: 50% 0;',
    '  transition: opacity .16s, transform .22s var(--ease), visibility 0s .22s; }',
    '.ed-menu.on { opacity: 1; visibility: visible; transform: none; transition: opacity .16s, transform .22s var(--ease); }',
    '.ed-menu p { position: relative; margin: 0; padding: 0 14px 0 30px; height: 32px; display: flex; align-items: center; border-radius: 4px; white-space: nowrap; }',
    '.ed-menu .g { height: 26px; padding-left: 12px; font-size: 12px; font-weight: 600; color: var(--soft); }',
    '.ed-menu .i { transition: background-color .15s; }',
    '.ed-menu .i.hot { background: rgba(255, 255, 255, .09); }',
    '.ed-menu .i.cur::before { content: ""; position: absolute; left: 11px; top: 50%; width: 9px; height: 5px; margin-top: -4px; border: solid currentColor; border-width: 0 0 1.6px 1.6px; transform: rotate(-45deg); }',
    '.ed-menu .i.pick { background: rgba(10, 132, 255, .3); }',
    '.ed-menu hr { height: 1px; margin: 4px 6px; border: 0; background: rgba(255, 255, 255, .09); }',
    /* a key being pressed, like the editor\'s own "press a key" keycap */
    '.ed-key { position: absolute; z-index: 51; left: 0; top: 0; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 8px;',
    '  font: 600 17px/1 var(--body); color: #fff; opacity: 0; pointer-events: none;',
    '  background: var(--grad) no-repeat 50% calc(100% - 7px) / 16px 3px, linear-gradient(180deg, #34343a, #1d1d20);',
    '  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .16), inset 0 -3px 0 rgba(0, 0, 0, .45), 0 2px 0 #000, 0 12px 28px -8px rgba(255, 106, 61, .8); }',
    '.ed-key.on { animation: ed-key 1.15s var(--ease) both; }',
    '@keyframes ed-key { 0% { opacity: 0; transform: translateY(10px) scale(.7); } 16% { opacity: 1; transform: none; } 30% { transform: translateY(3px) scale(.93); }',
    '  44% { transform: none; } 78% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-12px) scale(.96); } }',
    /* chips that come and go, clashes that shake, buttons that press */
    '.ed-in { animation: ed-in .5s cubic-bezier(.3, 1.45, .5, 1) both; }',
    '@keyframes ed-in { from { opacity: 0; transform: perspective(240px) rotateX(-80deg) scale(.9); } }',
    '.ed-shake { animation: ed-shake .55s ease-in-out; }',
    '@keyframes ed-shake { 0%, 100% { translate: 0; } 15% { translate: -4px 0; } 35% { translate: 4px 0; } 55% { translate: -3px 0; } 75% { translate: 2px 0; } }',
    '.ed-press { transform: scale(.95) !important; filter: brightness(1.25); transition: transform .1s, filter .1s !important; }',
    '.ed-html .add.ed-wait { min-width: 104px; }',
    /* the checklist ticking off */
    '.ed-html ul.recs li { overflow: hidden; }',
    '.ed-html ul.recs li.ed-done { border-color: rgba(48, 209, 88, .45); background: rgba(48, 209, 88, .1); transition: background-color .25s, border-color .25s; }',
    '.ed-html ul.recs li.ed-done button { visibility: hidden; }',
    '.ed-html ul.recs li .ed-tick { position: absolute; right: 14px; top: 50%; width: 20px; height: 20px; margin-top: -10px; border-radius: 50%; background: var(--ok);',
    '  box-shadow: 0 0 12px rgba(48, 209, 88, .7); animation: ed-in .4s cubic-bezier(.3, 1.6, .5, 1) both; }',
    '.ed-html ul.recs li .ed-tick::after { content: ""; position: absolute; left: 6px; top: 5px; width: 8px; height: 4px; border: solid #0b0b0d; border-width: 0 0 2px 2px; transform: rotate(-45deg); }',
    '.ed-html ul.recs li { position: relative; }',
    '.ed-html .allset.ed-in { animation-duration: .6s; }',
    /* the keyboard map: a key you press, the colour being shown */
    '.ed-html .k.ed-down { z-index: 3; filter: brightness(1.6); transform: translateY(1px) scale(.94); }',
    '.ed-html .k.off.ed-down { opacity: 1; color: var(--fg); }',
    '.ed-html .legend-row span.ed-on { color: var(--fg); background: rgba(255, 255, 255, .12); }',
    '@media (prefers-reduced-motion: reduce) { .ed-cam, .ed-spot, .ed-menu { transition: none !important; } .ed-key.on, .ed-in, .ed-shake { animation: none !important; } }'
  ].join('\n');

  var loading = false, mounted = false;
  function load() {
    if (loading) return;
    loading = true;
    fetch('editor-snap.html', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(safe('mount', mount))
      .then(function () { if (!mounted) fallback(); })
      .catch(function (err) { report('load', err); fallback(); });
  }
  // the live copy can't be shown: the picture instead, and the steps as a list
  function fallback() {
    if (mounted || fig.classList.contains('is-picture')) return;
    var img = doc.createElement('img');
    img.src = 'editor.webp';
    img.width = 1200; img.height = 900;
    img.alt = '';
    img.decoding = 'async';
    view.appendChild(img);
    fig.classList.add('is-picture');
    setTour(false);
  }

  function mount(html) {
    if (!/class="ed-html/.test(html)) throw new Error('not the editor copy');
    host = doc.createElement('div');
    host.className = 'ed-host';
    host.setAttribute('aria-hidden', 'true');
    sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = html;
    var st = doc.createElement('style');
    st.textContent = CSS;
    sr.appendChild(st);
    app = q('.ed-html'); body = q('.ed-body');
    if (!app || !body) throw new Error('no editor in the copy');
    cam = doc.createElement('div'); cam.className = 'ed-cam';
    app.insertBefore(cam, body); cam.appendChild(body);
    spot = doc.createElement('div'); spot.className = 'ed-spot'; cam.appendChild(spot);
    menu = doc.createElement('div'); menu.className = 'ed-menu';
    menu.innerHTML = '<p class="g">Built in</p><p class="i" data-v="default">Official layout</p><p class="i" data-v="author">Recommended</p>' +
      '<p class="g">Yours</p><p class="i" data-v="mine">My layout</p><hr><p class="i">Import a file…</p>';
    body.appendChild(menu);
    keycap = doc.createElement('div'); keycap.className = 'ed-key'; body.appendChild(keycap);
    // nothing in the copy takes focus
    qa('button, select, input, [tabindex]').forEach(function (el) { el.setAttribute('tabindex', '-1'); });
    pristine = {
      art1: q('.row[data-action="art1"]').cloneNode(true),
      potion: q('.row[data-action="potion"]').cloneNode(true),
      map: q('#mapCard').cloneNode(true),
      recs: q('#recsCard').innerHTML
    };
    ptr = doc.createElement('i');
    ptr.className = 'ed-ptr';
    ptr.setAttribute('aria-hidden', 'true');
    ptr.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M5 2.5 L 5 19.5 L 9.4 15.4 L 12.4 22 L 15.2 20.8 L 12.3 14.3 L 18.4 14.3 Z" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    view.appendChild(host);
    view.appendChild(ptr);
    mounted = true;
    fit();
    if ('ResizeObserver' in window) new ResizeObserver(safe('fit', fit)).observe(view);
    else window.addEventListener('resize', safe('fit', fit));
    requestAnimationFrame(function () { fig.classList.add('is-live'); });
    if (tourOn) { onScroll(); if (near) go(stepFromScroll(), true); }
  }

  function fit() {
    if (!host) return;
    var w = view.clientWidth;
    if (!w) return;
    k = w / W;
    host.style.setProperty('--ed-k', k.toFixed(5));
    if (tourOn && frameNow) showFrame(frameNow, true);
  }

  /* ---------- geometry: editor px <-> the screen ---------- */
  function textOf(el) {      // the text of a block (its words, not the full-width box)
    if (!el) return null;
    var r = doc.createRange(); r.selectNodeContents(el); return r;
  }
  function rectOf(el) {      // an element's (or a range's) box in the editor's own 1280 x 960 px
    var b = body.getBoundingClientRect(), r = el.getBoundingClientRect(), s = b.width / W || 1;
    return { x: (r.left - b.left) / s, y: (r.top - b.top) / s, w: r.width / s, h: r.height / s };
  }
  function union(list, pad) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach(function (el) {
      if (!el) return;
      var r = el.getBoundingClientRect ? rectOf(el) : el;
      if (!r.w && !r.h) return;
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
    });
    if (x0 === Infinity) return null;
    pad = pad || 0;
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
  }
  function compact() { return compactMq.matches; }
  function zMax() { return Math.min(3.4, Math.max(1.9, 1.25 / k)); }
  // the camera that shows a region: as big as fits (up to zMax), clear of the caption's side
  // (beside the region, or under it for wide ones)
  function camFor(r, side) {
    if (!r) return { z: 1, tx: 0, ty: 0 };
    var pad = compact() ? 12 : 26, ax = pad, ay = pad, aw = W - 2 * pad, ah = H - 2 * pad;
    if (!compact() && cap) {
      if (side === 'below') ah -= (cap.offsetHeight + 36) / k;
      else {
        var capE = (cap.offsetWidth + 40) / k;
        if (capE < W * 0.46) { aw -= capE; if (side === 'left') ax += capE; }
      }
    }
    var z = clamp(Math.min(aw / r.w, ah / r.h), 1, zMax());
    var tx = ax + aw / 2 - z * (r.x + r.w / 2), ty = ay + ah / 2 - z * (r.y + r.h / 2);
    return { z: z, tx: clamp(tx, W - z * W, 0), ty: clamp(ty, H - z * H, 0) };
  }
  function toScreen(r, c) {  // editor px -> px in the view, for a camera
    return { x: k * (c.tx + c.z * r.x), y: k * (c.ty + c.z * r.y), w: k * c.z * r.w, h: k * c.z * r.h };
  }
  function seen() {          // the part of the editor on screen, in editor px
    return { x: -camNow.tx / camNow.z, y: -camNow.ty / camNow.z, w: W / camNow.z, h: H / camNow.z };
  }

  /* ---------- camera, spotlight, caption ---------- */
  function setCam(c, now) {
    camNow = c;
    if (now) app.classList.add('ed-now');
    cam.style.transform = c.z === 1 && !c.tx && !c.ty ? '' : 'translate(' + c.tx.toFixed(2) + 'px,' + c.ty.toFixed(2) + 'px) scale(' + c.z.toFixed(4) + ')';
    if (now) { void cam.offsetWidth; app.classList.remove('ed-now'); }
  }
  function setSpot(r, now) {
    if (now) app.classList.add('ed-now');
    if (r) {
      var fresh = !spot.classList.contains('on');
      if (fresh && !now) { app.classList.add('ed-now'); }
      spot.style.left = r.x.toFixed(1) + 'px'; spot.style.top = r.y.toFixed(1) + 'px';
      spot.style.width = r.w.toFixed(1) + 'px'; spot.style.height = r.h.toFixed(1) + 'px';
      spot.style.borderRadius = Math.min(14, r.h / 2) + 'px';
      if (fresh && !now) { void spot.offsetWidth; app.classList.remove('ed-now'); }
      spot.classList.add('on');
    } else spot.classList.remove('on');
    if (now) { void spot.offsetWidth; app.classList.remove('ed-now'); }
  }
  // a frame: what to light (spot) and what to fit on screen (frame), for wide and narrow screens
  function regions(f) {
    var narrow = compact() && f.ph ? f.ph : f;
    var sp = narrow.spot ? union(narrow.spot(), narrow.pad == null ? 8 : narrow.pad) : null;
    var fr = narrow.frame ? union(narrow.frame(), 8) : sp;
    return { spot: sp, frame: fr };
  }
  function showFrame(f, now, keepCap, keepCam) {
    frameNow = f;
    var rg = regions(f), c = keepCam && !now ? camNow : rg.frame ? camFor(rg.frame, f.side) : { z: 1, tx: 0, ty: 0 };
    setCam(c, now);
    setSpot(rg.spot, now);
    if (!keepCap || now) placeCap(rg.spot ? toScreen(rg.spot, c) : null, f.side, now);
    return c;
  }
  function showCap(n) {
    if (!cap) return;
    cap.classList.remove('on');
    if (!n || !items[n - 1]) return;
    var num = cap.querySelector('.ed-cap-n'), txt = cap.querySelector('.ed-cap-t');
    if (num) num.textContent = String(n);
    if (!txt) return;
    txt.innerHTML = items[n - 1].innerHTML;
    var tryIt = items[n - 1].getAttribute('data-try');   // only in the tour: the map takes your own keys
    if (tryIt) { var s = doc.createElement('span'); s.className = 'ed-try'; s.textContent = tryIt; txt.appendChild(s); }
  }
  function placeCap(sr2, side, now) {
    if (!cap) return;
    if (compact()) { cap.style.removeProperty('--cx'); cap.style.removeProperty('--cy'); return; }
    var vw = view.clientWidth, vh = view.clientHeight, cw = cap.offsetWidth, ch = cap.offsetHeight, m = 18, top = view.offsetTop;
    var x, y, off = '0px', offV = '0px';
    if (!sr2) { x = m; y = vh - ch - m - Math.round(84 * k); }   // the whole editor: bottom left, clear of the editor's toast
    else {
      var spaceL = sr2.x, spaceR = vw - sr2.x - sr2.w, need = cw + 2 * m;
      if (!side) side = spaceR >= spaceL ? 'right' : 'left';
      if (side === 'right' && spaceR < need && spaceL >= need) side = 'left';
      if (side === 'left' && spaceL < need && spaceR >= need) side = 'right';
      if (side !== 'below' && (side === 'right' ? spaceR : spaceL) >= need) {
        x = side === 'right' ? sr2.x + sr2.w + m : sr2.x - m - cw;
        y = sr2.y + sr2.h / 2 - ch / 2;
        off = side === 'right' ? '16px' : '-16px';
      } else {         // under the region (over it when there's no room)
        x = Math.min(sr2.x + 12, sr2.x + sr2.w - cw);
        y = sr2.y + sr2.h + m;
        if (y + ch > vh - m) y = sr2.y - m - ch;
        if (y < m) y = vh - ch - m;
        offV = '12px';
      }
    }
    x = clamp(x, m, vw - cw - m); y = clamp(y, m, vh - ch - m);
    if (now || !cap.classList.contains('on')) cap.style.transition = 'none';
    cap.style.setProperty('--cx', Math.round(x) + 'px');
    cap.style.setProperty('--cy', Math.round(y + top) + 'px');
    cap.style.setProperty('--co', off);
    cap.style.setProperty('--cv', offV);
    if (cap.style.transition) { void cap.offsetWidth; cap.style.transition = ''; }
  }

  /* ---------- the pointer ---------- */
  function ptrPos(el, fx, fy) {
    var v = view.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - v.left + r.width * (fx == null ? 0.5 : fx), y: r.top - v.top + r.height * (fy == null ? 0.5 : fy) };
  }
  function ptrTo(el, fx, fy, ms) {
    if (!ptr || !el) return;
    var p = ptrPos(el, fx, fy);
    ptr.style.transitionDuration = '.3s, ' + (ms == null ? 550 : ms) + 'ms';
    ptr.style.setProperty('--px', p.x.toFixed(1) + 'px');
    ptr.style.setProperty('--py', p.y.toFixed(1) + 'px');
  }
  function ptrShow(el, fx, fy, dx, dy) {     // appears near a target, then glides onto it
    if (!ptr || !el) return;
    var p = ptrPos(el, fx, fy);
    ptr.style.transitionDuration = '0s, 0s';
    ptr.style.setProperty('--px', (p.x + (dx == null ? 70 : dx)).toFixed(1) + 'px');
    ptr.style.setProperty('--py', (p.y + (dy == null ? 46 : dy)).toFixed(1) + 'px');
    void ptr.offsetWidth;
    ptr.classList.add('on');
    ptrTo(el, fx, fy);
  }
  function ptrHide() { if (ptr) ptr.classList.remove('on', 'down', 'click'); }
  function ptrClick(el) {
    if (!ptr) return;
    ptr.classList.remove('click'); void ptr.offsetWidth;
    ptr.classList.add('down', 'click');
    at(150, function () { ptr.classList.remove('down'); });
    if (el) { el.classList.add('ed-press'); at(170, function () { el.classList.remove('ed-press'); }); }
  }

  /* ---------- small helpers on the editor's own elements ---------- */
  function chip(label) {     // a key as the editor draws it: <span class="cap">Q<button>×</button></span>
    var c = doc.createElement('span'), b = doc.createElement('button');
    c.className = 'cap';
    c.appendChild(doc.createTextNode(label));
    b.type = 'button'; b.tabIndex = -1; b.textContent = '×';
    c.appendChild(b);
    return c;
  }
  function addBtn() {
    var b = doc.createElement('button');
    b.className = 'add'; b.type = 'button'; b.tabIndex = -1; b.textContent = '+ key';
    return b;
  }
  function chipText(c, t) { if (c && c.firstChild && c.firstChild.nodeType === 3) c.firstChild.nodeValue = t; }
  function collapse(el, ms, done) {   // a chip leaving: it narrows, and the next one slides into its place
    var w = el.offsetWidth;
    var a = animate(el, [{ width: w + 'px', opacity: 1, marginRight: '0px' }, { width: '0px', opacity: 0, marginRight: '-6px', paddingLeft: '0px', paddingRight: '0px' }],
      { duration: ms, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
    if (a) a.onfinish = function () { el.remove(); if (done) done(); };
    else { el.remove(); if (done) done(); }
  }
  function grow(el, h0, ms) {         // a box changes height: animate from the old height to the new one
    var h1 = el.offsetHeight;
    if (Math.abs(h1 - h0) < 2) return;
    animate(el, [{ height: h0 + 'px', overflow: 'hidden' }, { height: h1 + 'px', overflow: 'hidden' }], { duration: ms, easing: 'cubic-bezier(.4, 0, .2, 1)' });
  }
  function pressKey(label, near, fx) { // the keycap that shows a key being pressed, over a button
    var r = rectOf(near);
    keycap.textContent = label;
    keycap.style.transform = '';
    keycap.style.left = (r.x + r.w * (fx == null ? 0.5 : fx) - 20).toFixed(1) + 'px';
    keycap.style.top = (r.y - 52).toFixed(1) + 'px';
    keycap.classList.remove('on'); void keycap.offsetWidth; keycap.classList.add('on');
  }
  function mapKey(id, last) {
    var list = qa('#mapCard .k[data-k="' + id.replace(/(["\\])/g, '\\$1') + '"]');
    return last ? list[list.length - 1] : list[0];
  }
  function light(el, cat) {           // a key on the map lit in a colour, or unlit (blocked)
    if (!el) return;
    if (cat) { el.classList.remove('off'); el.classList.add('used'); el.style.setProperty('--cat', 'var(--' + cat + ')'); }
    else { el.classList.remove('used', 'fresh', 'conflict'); el.classList.add('off'); el.style.removeProperty('--cat'); }
  }
  function showTip(el) {               // the editor's own bubble over a key, with what it does
    var tip = q('#ktip');
    if (!tip || !el) return;
    var d = el.getAttribute('data-d') || '', i = d.indexOf(': ');
    tip.textContent = '';
    tip.style.setProperty('--cat', el.style.getPropertyValue('--cat') || '#fff');
    if (i > 0 && i < 20) {
      var b = doc.createElement('b');
      b.textContent = d.slice(0, i + 1);
      tip.appendChild(b);
      tip.appendChild(doc.createTextNode(d.slice(i + 1)));
    } else tip.textContent = d;
    var r = rectOf(el), w = tip.offsetWidth, h = tip.offsetHeight, s = seen();
    var x = clamp(r.x + r.w / 2 - w / 2, s.x + 6, s.x + s.w - w - 6), below = r.y - h - 10 < s.y + 6;
    tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(below ? r.y + r.h + 10 : r.y - h - 10) + 'px)';
    tip.style.setProperty('--ax', Math.round(r.x + r.w / 2 - x) + 'px');
    tip.classList.toggle('below', below);
    tip.classList.add('show');
  }
  function hideTip() { var tip = q('#ktip'); if (tip) tip.classList.remove('show'); }
  function toast(text) {
    var t = q('#toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('show');
  }
  // the editor's wave after a save: lit keys flash outwards from S
  function wave(order) {
    var card = q('#mapCard'), from = mapKey('S');
    if (!card || !from) return;
    var o = rectOf(from), unit = o.w || 24;
    qa('#mapCard .k.used').forEach(function (c, i) {
      var r = rectOf(c);
      var d = order ? order(c, r, i) : Math.hypot(r.x + r.w / 2 - (o.x + o.w / 2), (r.y + r.h / 2 - o.y) * 1.3) / unit;
      c.style.setProperty('--d', d.toFixed(2));
    });
    card.classList.remove('wave'); void card.offsetWidth; card.classList.add('wave');
  }

  /* ---------- back to the editor as it was ---------- */
  function restore() {
    clearTimers();
    ptrHide();
    hideTip();
    setLive(false);
    if (!sr) return;
    var sel = q('#layoutSel');
    if (sel) sel.value = 'author';
    menu.classList.remove('on');
    qa('.ed-menu .i').forEach(function (p) { p.classList.remove('hot', 'pick', 'cur'); });
    keycap.classList.remove('on');
    var t = q('#toast'); if (t) t.classList.remove('show');
    qa('.ed-press').forEach(function (el) { el.classList.remove('ed-press'); });
    [['art1', '.row[data-action="art1"]'], ['potion', '.row[data-action="potion"]'], ['map', '#mapCard']].forEach(function (p) {
      var live = q(p[1]);
      if (live) live.replaceWith(pristine[p[0]].cloneNode(true));
    });
    app.classList.remove('ed-keys');
  }
  // boxes whose height a step changed go back smoothly (measured first, animated after the camera is set)
  function restoreBoxes(n) {
    var later = [];
    var cf = q('#conflicts');
    if (cf && cf.style.height) { cf.textContent = ''; cf.style.height = ''; cf.style.overflow = ''; }   // a collapse that was cut short
    if (cf && cf.firstChild) {
      var h0 = cf.offsetHeight;
      cf.style.height = '0px'; cf.style.overflow = 'hidden';
      later.push(function () {
        var a = animate(cf, [{ height: h0 + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 450, easing: 'cubic-bezier(.4, 0, .2, 1)' });
        var end = function () { cf.textContent = ''; cf.style.height = ''; cf.style.overflow = ''; };
        if (a) { a.onfinish = end; a.oncancel = end; } else end();
      });
    }
    var rc = q('#recsCard');
    if (rc && rc.innerHTML !== pristine.recs && n !== 4) {
      var r0 = rc.offsetHeight;
      rc.innerHTML = pristine.recs;
      later.push(function () { grow(rc, r0, 500); });
    }
    return later;
  }

  /* ---------- the steps ---------- */
  var row = function (id) { return q('.row[data-action="' + id + '"]'); };
  var inRow = function (id) {   // a row's content: its name, controller badge, keys and the game's key
    var r = row(id);
    return r ? [r.querySelector('.name'), r.querySelector('.badge'), r.querySelector('.keys .cap'), r.querySelector('.keys .add'), r.querySelector('.ingame')] : [];
  };
  var keysOf = function (id) {
    var r = row(id);
    return r ? [r.querySelector('.badge'), r.querySelector('.keys .cap'), r.querySelector('.keys .add'), r.querySelector('.ingame')] : [];
  };
  var roomForQ = function (list) {   // Health potion's row gets one key wider in step 3: light that room too
    var g = row('potion') && row('potion').querySelector('.ingame');
    if (g) { var r = rectOf(g); list.push({ x: r.x + 56, y: r.y, w: r.w, h: r.h }); }
    return list;
  };
  var OVERVIEW = { spot: null };

  // the open menu's box (its own layout box: the closed menu is drawn a little shifted)
  var menuBox = function () { return { x: menu.offsetLeft, y: menu.offsetTop, w: menu.offsetWidth, h: menu.offsetHeight }; };
  var PICKER = { spot: function () { return [q('#layoutSel')]; }, frame: function () { return [q('.layoutbar .label'), q('#layoutSel'), menuBox(), q('#exportBtn')]; }, side: 'right',
    ph: { spot: function () { return [q('#layoutSel')]; }, frame: function () { return [q('#layoutSel'), menuBox()]; } } };
  var PICKER_OPEN = { spot: function () { return [q('#layoutSel'), menuBox()]; }, frame: PICKER.frame, side: 'right',
    ph: { spot: function () { return [q('#layoutSel'), menuBox()]; }, frame: PICKER.ph.frame } };

  var STEPS = {
    // 1 · the layout picker opens; the highlight goes from the Official layout to Recommended
    1: {
      frame: PICKER,
      before: function () {
        var sel = q('#layoutSel');
        sel.value = 'default';
        placeMenu();
      },
      play: function () {
        var sel = q('#layoutSel'), it = qa('.ed-menu .i');
        at(850, function () { ptrShow(sel, 0.62, 0.55); });
        at(1450, function () {
          ptrClick(sel);
          it.forEach(function (p) { p.classList.toggle('cur', p.getAttribute('data-v') === 'default'); p.classList.toggle('hot', p.getAttribute('data-v') === 'default'); });
          menu.classList.add('on');
          showFrame(PICKER_OPEN, false, true);
        });
        at(1900, function () { ptrTo(it[0], 0.4, 0.5, 380); });
        at(2450, function () { it[0].classList.remove('hot'); it[1].classList.add('hot'); ptrTo(it[1], 0.42, 0.55, 420); });
        at(3150, function () { ptrClick(); it[1].classList.add('pick'); });
        at(3400, function () {
          menu.classList.remove('on'); sel.value = 'author'; ptrTo(sel, 0.62, 0.55, 300);
          showFrame(PICKER, false, true);
        });
        at(4300, ptrHide);
      }
    },
    // 2 · Artifact 1: × takes the 1 off, + key listens, Q is pressed and becomes the key
    2: {
      frame: { spot: function () { return inRow('art1'); }, frame: function () { return inRow('ranged').concat(inRow('art1'), inRow('art2')); }, side: 'below',
        ph: { spot: function () { return keysOf('art1'); } } },
      before: function () {
        var r = row('art1'), c = r.querySelector('.keys .cap'), g = r.querySelector('.ingame button[data-slot="0"]');
        chipText(c, '1');
        if (g) { g.classList.remove('match'); g.classList.add('stray'); }
        light(mapKey('1'), 'action'); light(mapKey('Q'), null);
      },
      play: function () {
        var r = row('art1');
        var c = r.querySelector('.keys .cap'), x = c && c.querySelector('button'), add = r.querySelector('.keys .add');
        at(850, function () { ptrShow(x, 0.5, 0.55); });
        at(1450, function () { ptrClick(x); });
        at(1600, function () { collapse(c, 280); });
        at(1950, function () { ptrTo(add, 0.45, 0.6, 420); });
        at(2450, function () {
          ptrClick(add);
          add.classList.add('listening', 'ed-wait');
          add.textContent = 'Press a key…';
        });
        at(2750, function () { pressKey('Q', add, 0.5); });
        at(3400, function () {
          var q2 = chip('Q');
          q2.classList.add('ed-in');
          add.replaceWith(q2);
          var nb = addBtn(); nb.classList.add('ed-in');
          q2.after(nb);
          var g = r.querySelector('.ingame button[data-slot="0"]');
          if (g) { g.classList.remove('stray'); g.classList.add('match'); }
          light(mapKey('1'), null); light(mapKey('Q'), 'action');
          var mq = mapKey('Q'); if (mq) mq.classList.add('fresh');
          ptrTo(q2, 0.5, 1.6, 400);
        });
        at(4400, ptrHide);
      }
    },
    // 3 · Health potion gets Q too: both keys go red and shake; the notice opens at the top
    3: {
      frame: { spot: function () { return roomForQ(inRow('art1').concat(inRow('potion'))); }, side: 'below',
        ph: { spot: function () { return roomForQ(keysOf('art1').concat(keysOf('potion'))); } } },
      notice: { spot: function () { var n = q('#conflicts .conflicts'); return n ? [n.querySelector('.icon'), textOf(n.querySelector('h2')), textOf(n.querySelector('p')), textOf(n.querySelector('li'))] : []; }, pad: 12, side: 'below',
        ph: { spot: function () { var n = q('#conflicts .conflicts'); return n ? [n.querySelector('.icon'), textOf(n.querySelector('h2')), textOf(n.querySelector('li'))] : []; } } },
      play: function () {
        var r = row('potion'), add = r.querySelector('.keys .add');
        at(850, function () { ptrShow(add, 0.45, 0.6); });
        at(1450, function () {
          ptrClick(add);
          add.classList.add('listening', 'ed-wait');
          add.textContent = 'Press a key…';
        });
        at(1750, function () { pressKey('Q', add, 0.5); });
        at(2400, function () {
          var q2 = chip('Q');
          add.replaceWith(q2);
          q2.after(addBtn());
          var a1 = row('art1').querySelector('.keys .cap');
          [q2, a1].forEach(function (c) { if (!c) return; c.classList.add('conflict', 'ed-shake'); });
          var mq = mapKey('Q'); if (mq) mq.classList.add('conflict');
          ptrHide();
        });
        at(3300, function () {   // the editor's red notice, at the top
          var cf = q('#conflicts'), tpl = q('#ed-conflicts');
          if (!cf || !tpl) return;
          cf.innerHTML = tpl.innerHTML;
          cf.querySelectorAll('button').forEach(function (b) { b.tabIndex = -1; });
          var h1 = cf.offsetHeight;
          showFrame(STEPS[3].notice);
          animate(cf, [{ height: '0px', opacity: 0, overflow: 'hidden' }, { height: h1 + 'px', opacity: 1, overflow: 'hidden' }], { duration: 520, easing: 'cubic-bezier(.4, 0, .2, 1)' });
        });
      }
    },
    // 4 · the checklist: Apply to the game's controls, the items tick off, All set
    4: {
      frame: { spot: function () { return [q('#recsCard')]; }, pad: 4, side: 'left',
        ph: { spot: function () { return [q('#recsCard ul.recs') || q('#recsCard .allset'), q('#recsCard .apply-game .out-actions')]; } } },
      before: function () {
        var rc = q('#recsCard'), tpl = q('#ed-recs');
        if (!rc || !tpl) return;
        var h0 = rc.offsetHeight;
        rc.innerHTML = tpl.innerHTML;
        rc.querySelectorAll('button').forEach(function (b) { b.tabIndex = -1; });
        return [function () { grow(rc, h0, 500); }];
      },
      play: function () {
        var rc = q('#recsCard'), apply = rc.querySelector('.apply-game .primary'), lis = Array.prototype.slice.call(rc.querySelectorAll('ul.recs li'));
        at(850, function () { ptrShow(apply, 0.5, 0.6, 60, 70); });
        at(1450, function () { ptrClick(apply); });
        lis.forEach(function (li, i) {
          at(1750 + i * 380, function () {
            li.classList.add('ed-done');
            var t = doc.createElement('i'); t.className = 'ed-tick'; li.appendChild(t);
          });
          at(2150 + i * 380, function () {
            animate(li, [{ height: li.offsetHeight + 'px', opacity: 1, marginBottom: '0px' }, { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginBottom: '-6px', borderWidth: '0px' }],
              { duration: 340, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
          });
        });
        at(2150 + lis.length * 380 + 120, function () {
          var h0 = rc.offsetHeight;
          rc.innerHTML = pristine.recs;
          rc.querySelectorAll('button').forEach(function (b) { b.tabIndex = -1; });
          var ok = rc.querySelector('.allset'); if (ok) ok.classList.add('ed-in');
          showFrame(STEPS[4].frame, false, true, true);
          grow(rc, h0, 420);
          ptrHide();
        });
      }
    },
    // 5 · the keyboard map lights up colour by colour; then what a key does; then your own keys
    5: {
      frame: { spot: function () { return [q('#mapCard')]; }, pad: 4, side: 'left',
        ph: { spot: function () { return [q('#kbd')]; } } },
      play: function () {
        var CATS = ['move', 'action', 'menu', 'mod'], groups = [[], [], [], []];
        qa('#mapCard .k.used').forEach(function (c) {
          var m = /--(move|action|menu|mod)\b/.exec(c.getAttribute('style') || '');
          if (m) groups[CATS.indexOf(m[1])].push({ el: c, r: rectOf(c) });
        });
        var delay = new Map();
        groups.forEach(function (g, gi) {
          g.sort(function (a, b) { return a.r.x - b.r.x || a.r.y - b.r.y; });
          g.forEach(function (o, i) { delay.set(o.el, gi * 14 + i * 0.85); });
        });
        app.classList.add('ed-keys');
        setLive(true);
        at(450, function () { wave(function (c) { return delay.has(c) ? delay.get(c) : 60; }); });
        var legend = qa('#mapCard .legend-row span');
        CATS.forEach(function (c, i) {
          at(450 + i * 560 + 200, function () { legend.forEach(function (s, j) { s.classList.toggle('ed-on', i === j); }); });
        });
        at(450 + 4 * 560 + 500, function () { legend.forEach(function (s) { s.classList.remove('ed-on'); }); });
        at(3300, function () { var t = mapKey('Tab'); if (t && !touched) ptrShow(t, 0.55, 0.6); });
        at(3900, function () { var t = mapKey('Tab'); if (t && !touched) showTip(t); });
        at(5200, function () { if (!touched) ptrHide(); });
      }
    },
    // 6 · Save to game: the camera pulls back, the map's keys flash outwards, the toast
    6: {
      frame: { spot: function () { return [q('#downloadTop')]; }, frame: function () { return [q('#exportBtn'), q('#downloadTop'), q('.langpick')]; }, side: 'below',
        ph: { spot: function () { return [q('#downloadTop')]; } } },
      play: function () {
        var b = q('#downloadTop');
        at(850, function () { ptrShow(b, 0.5, 0.6, -70, 50); });
        at(1450, function () { ptrClick(b); });
        at(1800, function () { ptrHide(); showFrame(OVERVIEW); });
        at(2500, function () { wave(); });
        at(2700, function () { toast('Saved to the game as author.txt. A running game switches to it within a second.'); });
        at(9000, function () { var t = q('#toast'); if (t) t.classList.remove('show'); });
      }
    }
  };
  function placeMenu() {
    var sel = q('#layoutSel');
    if (!sel) return;
    var r = rectOf(sel);
    menu.style.left = r.x.toFixed(1) + 'px';
    menu.style.top = (r.y + r.h + 4).toFixed(1) + 'px';
    menu.style.minWidth = r.w.toFixed(1) + 'px';
  }

  // go to a step (0: the whole editor). Everything a step changed goes back first.
  var go = safe('go', function (n, now) {
    if (!sr || !tourOn) return;      // mount() starts the right step once the copy is in
    touched = false;
    if (n > 0 && !fig.classList.contains('is-in')) {   // straight into a step (a link, a reload): the window is already in place
      stage.style.transition = 'none';
      fig.classList.add('is-in');
      void stage.offsetWidth;
      stage.style.transition = '';
    }
    restore();
    var later = restoreBoxes(n);
    var s = STEPS[n];
    if (s && s.before) later = later.concat(s.before() || []);
    step = n;
    markDot(n);
    showCap(n);
    var c = showFrame(s ? s.frame : OVERVIEW, now);
    later.forEach(function (fn) { fn(); });
    if (cap && n) at(now ? 0 : 380, function () { cap.classList.add('on'); });
    if (s && s.play) s.play(c);
  });

  /* ---------- the scroll picks the step ---------- */
  function unit() { var d = track.offsetHeight - pin.offsetHeight; return d > 0 ? d / 7 : 0; }
  function stepFromScroll() {
    var u = unit();
    if (!u) return 0;
    var p = -track.getBoundingClientRect().top;
    if (p < u * 0.4) return 0;
    return Math.min(6, 1 + Math.floor((p - u * 0.4) / u));
  }
  var ticking = false;
  function onScroll() {
    if (!tourOn || ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (!near) return;
      var s = stepFromScroll();
      if (jumping) { if (s === jumping) { jumping = 0; clearTimeout(jumpTimer); } return; }
      if (s === step) { clearTimeout(settle); settle = 0; return; }
      clearTimeout(settle);
      settle = setTimeout(function () { settle = 0; var s2 = stepFromScroll(); if (s2 !== step && near && !jumping) go(s2); }, 150);
    });
  }
  function jumpTo(n) {
    var u = unit();
    if (!tourOn || !u) return;
    var top = track.getBoundingClientRect().top + window.pageYOffset + (0.4 + (n - 1) + 0.3) * u;
    jumping = n;
    clearTimeout(jumpTimer);
    jumpTimer = setTimeout(function () { jumping = 0; onScroll(); }, 1400);
    clearTimeout(settle); settle = 0;
    if (n !== step) go(n);
    window.scrollTo({ top: Math.round(top), behavior: 'smooth' });
  }

  /* ---------- your own keys light the map (step 5, while it's on screen) ---------- */
  var CODES = { Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Escape', Tab: 'Tab', ShiftLeft: 'Shift', ShiftRight: 'Shift',
    ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', Backspace: 'Backspace', CapsLock: 'CapsLock', MetaLeft: 'cmd', MetaRight: 'cmd',
    OSLeft: 'cmd', OSRight: 'cmd', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Backquote: 'Backtick', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/' };
  function codeKey(code) {
    if (CODES[code]) return CODES[code];
    var m = /^(?:Key|Digit|Numpad)([A-Z0-9])$/.exec(code) || /^(F(?:[1-9]|1[0-2]))$/.exec(code);
    return m ? m[1] : null;
  }
  function editable(el) { return !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))); }
  function release() { Object.keys(downKeys).forEach(function (c) { if (downKeys[c]) downKeys[c].classList.remove('ed-down'); }); downKeys = {}; }
  function setLive(on) { liveKeys = on; if (!on) release(); }
  doc.addEventListener('keydown', safe('keys', function (e) {
    if (!liveKeys || step !== 5 || !near || e.defaultPrevented || editable(e.target) || editable(doc.activeElement)) return;
    if ((e.ctrlKey || e.metaKey) && !/^(Control|Meta|OS)/.test(e.code)) return;   // a shortcut: not ours
    var id = codeKey(e.code);
    var el = id && mapKey(id, /Right$/.test(e.code));
    if (!el || downKeys[e.code]) return;
    downKeys[e.code] = el;
    touched = true;
    el.classList.add('ed-down');
    ptrHide();
    showTip(el);
  }));
  doc.addEventListener('keyup', safe('keys', function (e) {
    var el = downKeys[e.code];
    if (!el) return;
    delete downKeys[e.code];
    el.classList.remove('ed-down');
  }));
  window.addEventListener('blur', release);
  // pointing at a key on the map shows what it does (step 5)
  view.addEventListener('mouseover', safe('hover', function (e) {
    if (step !== 5 || !sr) return;
    var path = e.composedPath ? e.composedPath() : [];
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (el && el.classList && el.classList.contains('k')) { touched = true; ptrHide(); showTip(el); return; }
      if (el === view) break;
    }
  }));

  /* ---------- modes: the pinned tour, or the editor as it is ---------- */
  function wantTour() { return motion && tallMq.matches && !fig.classList.contains('is-picture'); }
  function setTour(on) {
    on = !!on;
    if (on === tourOn) return;
    tourOn = on;
    fig.classList.toggle('is-tour', on);
    if (!on) {
      clearTimeout(settle); settle = 0;
      if (sr) { restore(); restoreBoxes(0).forEach(function (fn) { fn(); }); setCam({ z: 1, tx: 0, ty: 0 }, true); setSpot(null, true); }
      showCap(0);
      step = -1; frameNow = null;
      markDot(0);
    } else { step = -1; onScroll(); }
  }
  function onMode() { setTour(wantTour()); if (tourOn && sr && near) go(stepFromScroll(), true); }
  [tallMq].forEach(function (m) {
    if (m.addEventListener) m.addEventListener('change', safe('mode', onMode));
    else if (m.addListener) m.addListener(safe('mode', onMode));
  });
  if (compactMq.addEventListener) compactMq.addEventListener('change', safe('mode', function () { if (tourOn && sr && step >= 0) showFrame(frameNow || OVERVIEW, true); }));

  /* ---------- start ---------- */
  setTour(wantTour());
  window.addEventListener('scroll', onScroll, { passive: true });
  if ('IntersectionObserver' in window) {
    // the copy is fetched when the section is about 1000 px away
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); }
    }, { rootMargin: '1000px 0px' });
    io.observe(fig);
    // while the tour is on screen it follows the scroll; off screen it rests
    new IntersectionObserver(safe('near', function (es) {
      es.forEach(function (e) {
        near = e.isIntersecting;
        if (!near && step !== -1) {
          clearTimeout(settle); settle = 0;
          if (sr && tourOn) { restore(); restoreBoxes(0).forEach(function (fn) { fn(); }); setCam({ z: 1, tx: 0, ty: 0 }, true); setSpot(null, true); showCap(0); }
          step = -1; frameNow = null; markDot(0);
        } else if (near) onScroll();
      });
    }), { rootMargin: '0px' }).observe(track);
    // the window rises into place the first time it comes into view
    var rise = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio >= 0.15) { fig.classList.add('is-in'); rise.disconnect(); } });
    }, { threshold: [0, 0.15] });
    rise.observe(stage);
  } else { near = true; fig.classList.add('is-in'); load(); }

  api.editorTour = { go: function (n) { go(n); }, step: function () { return step; }, frame: function () { return camNow; } };
})();
