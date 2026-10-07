/* wasdmod site: page interactions and reveals. No libraries.
   Nothing is tied to the scroll position: each scene plays by itself, on a timer,
   once it comes into view, so it looks the same however smoothly someone scrolls.
   Every feature starts on its own (see run()), so one missing element can't stop
   the rest. The only network request is an optional one to GitHub's public API for
   the newest version number (see privacy.html). demo.js and keymap.js build their
   own sections; this file never touches #demo or #keymap. */
(function () {
  'use strict';
  window.__wasdSite = true;

  var doc = document, root = doc.documentElement;
  var motion = root.classList.contains('motion');
  var hasIO = 'IntersectionObserver' in window;
  var api = window.__wasd = { motion: motion, os: 'win', errors: [] };
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };

  function run(name, fn) {
    try { fn(); } catch (err) {
      api.errors.push(name);
      if (window.console && console.error) console.error('wasdmod site: "' + name + '" did not start', err);
    }
  }
  function editable(el) {
    return !!(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
  }
  function onView(els, cb, opts) {
    els = els.filter(Boolean);
    if (!els.length) return null;
    if (!hasIO) { els.forEach(function (el) { cb(el, true, { unobserve: function () {}, disconnect: function () {} }, { intersectionRatio: 1 }); }); return null; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { cb(e.target, e.isIntersecting, io, e); });
    }, opts || {});
    els.forEach(function (el) { io.observe(el); });
    return io;
  }
  function inViewNow(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.top < window.innerHeight && r.bottom > 0;
  }
  // add a class with no transition (for things already on screen at load)
  function setNow(els, cls) {
    els = els.filter(Boolean);
    if (!els.length) return;
    els.forEach(function (el) { el.style.transition = 'none'; el.classList.add(cls); });
    void doc.body.offsetHeight;
    requestAnimationFrame(function () { els.forEach(function (el) { el.style.transition = ''; }); });
  }

  /* ---------- live region for small announcements ---------- */
  var live = null;
  function announce(t) {
    if (!live) return;
    live.textContent = '';
    setTimeout(function () { live.textContent = t; }, 30);
  }
  run('live region', function () {
    live = doc.createElement('p');
    live.className = 'sr';
    live.setAttribute('aria-live', 'polite');
    doc.body.appendChild(live);
  });

  /* ---------- downloads that match the visitor's system (Windows first) ---------- */
  var os = 'win';
  run('downloads', function () {
    var BASE = 'https://github.com/Wanzho/mcd2-wasd/releases/latest/download/';
    var DL = {
      win: { href: BASE + 'wasdmod-Windows.exe', label: 'Download for Windows' },
      mac: { href: BASE + 'wasdmod-Mac.dmg', label: 'Download for Mac' },
      linux: { href: BASE + 'wasdmod.zip', label: 'Download for Linux' }
    };
    var ua = navigator.userAgent || '';
    var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/Android|iPhone|iPad|iPod|CrOS/i.test(ua)) os = 'win';
    else if (/Mac/i.test(plat) || /Macintosh/.test(ua)) os = navigator.maxTouchPoints > 1 ? 'win' : 'mac';
    else if (/Linux|X11|SteamOS/i.test(plat + ' ' + ua)) os = 'linux';
    api.os = os;
    $$('[data-dl]').forEach(function (a) {
      a.href = DL[os].href;
      var label = $('[data-dl-label]', a);
      if (label) label.textContent = DL[os].label;
    });
  });

  /* ---------- newest version (optional, cached for the session) ---------- */
  run('version', function () {
    function setVersion(v) { $$('[data-version]').forEach(function (el) { el.textContent = 'Version ' + v; }); }
    var key = 'wasdmod-version', cached = null;
    try { cached = sessionStorage.getItem(key); } catch (e) { /* private mode */ }
    if (cached) { setVersion(cached); return; }
    if (!window.fetch) return;
    setTimeout(function () {
      fetch('https://api.github.com/repos/Wanzho/mcd2-wasd/releases/latest', { credentials: 'omit', referrerPolicy: 'no-referrer' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var m = /^v?(\d{1,3}(?:\.\d{1,4}){1,3})$/.exec((j && j.tag_name) || '');
          if (!m) return;
          setVersion(m[1]);
          try { sessionStorage.setItem(key, m[1]); } catch (e) { /* ignore */ }
        })
        .catch(function () { /* keep the built-in version */ });
    }, 1200);
  });

  /* ---------- local nav ---------- */
  run('nav', function () {
    var nav = $('#localnav');
    if (!nav) return;
    var toggle = $('.ln-toggle', nav);
    function setMenu(open) {
      nav.classList.toggle('is-open', open);
      if (!toggle) return;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Hide sections' : 'Show sections');
    }
    if (toggle) toggle.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
    $$('.ln-links a', nav).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); if (toggle) toggle.focus(); }
    });
    doc.addEventListener('click', function (e) { if (nav.classList.contains('is-open') && !nav.contains(e.target)) setMenu(false); });

    // the section in view
    var links = {}, current = null;
    $$('.ln-links a', nav).forEach(function (a) { links[(a.getAttribute('href') || '').slice(1)] = a; });
    onView($$('main > section'), function (el, on) {
      if (!on) return;
      var link = links[el.id] || null;
      if (link === current) return;
      if (current) current.removeAttribute('aria-current');
      if (link) link.setAttribute('aria-current', 'true');
      current = link;
    }, { rootMargin: '-50% 0px -50% 0px' });

    // a darker bar once the page moves
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; nav.classList.toggle('is-scrolled', window.pageYOffset > 10); });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  });

  /* ---------- reveals ---------- */
  var reveals = [];
  function revealNow() {
    setNow(reveals.filter(function (el) { return !el.classList.contains('in') && inViewNow(el); }), 'in');
  }
  run('reveals', function () {
    reveals = $$('.reveal');
    reveals.forEach(function (el) {
      var sibs = $$(':scope > .reveal', el.parentElement);
      var i = sibs.indexOf(el);
      if (i > 0) el.style.setProperty('--rd', Math.min(i, 5) * 0.09 + 's');
    });
    if (!motion) return;
    revealNow();   // anything already on screen shows at once, so the first paint is never blank
    onView(reveals, function (el, on, io) {
      if (on) { el.classList.add('in'); io.unobserve(el); }
    }, { rootMargin: '0px 0px -7% 0px', threshold: 0.1 });
  });

  /* ---------- install tabs ---------- */
  var selectTab = function () {};
  run('install tabs', function () {
    var tabs = $$('.seg-btn'), seg = $('.seg'), panelsWrap = $('.panels');
    if (!tabs.length || !seg) return;
    var panels = tabs.map(function (t) { return doc.getElementById(t.getAttribute('aria-controls')); });
    if (panels.some(function (p) { return !p; })) return;
    var seen = !motion || inViewNow(panelsWrap);
    panels.forEach(function (p) {
      $$('.steps li', p).forEach(function (li, i) { li.style.setProperty('--si', i); });
    });
    function placeThumb() {
      var b = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0];
      if (!b) return;
      seg.classList.add('is-measured');          // may change the column sizing, so measure after
      if (!b.offsetWidth) return;
      seg.style.setProperty('--seg-x', b.offsetLeft + 'px');
      seg.style.setProperty('--seg-w', b.offsetWidth + 'px');
    }
    window.addEventListener('resize', placeThumb);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(placeThumb);
    selectTab = function (i, focus) {
      tabs.forEach(function (t, j) {
        var on = j === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[j].hidden = !on;
        if (!on) panels[j].classList.remove('is-in');
      });
      seg.style.setProperty('--seg-i', i);
      placeThumb();
      if (focus) tabs[i].focus();
      if (seen) {
        var p = panels[i];
        p.classList.remove('is-in');
        requestAnimationFrame(function () { requestAnimationFrame(function () { p.classList.add('is-in'); }); });
      }
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { selectTab(i); });
      t.addEventListener('keydown', function (e) {
        var n = tabs.length, to = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (i + 1) % n;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (i - 1 + n) % n;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = n - 1;
        if (to !== null) { e.preventDefault(); selectTab(to, true); }
      });
    });
    selectTab(os === 'mac' ? 1 : os === 'linux' ? 2 : 0);
    if (seen) panels.forEach(function (p) { p.classList.add('is-in'); });
    else onView([panelsWrap], function (el, on, io) {
      if (!on) return;
      seen = true;
      io.disconnect();
      panels.forEach(function (p) { if (!p.hidden) p.classList.add('is-in'); });
    }, { threshold: 0.15 });
    // "Other platforms": if the visitor isn't on Windows, show Windows first there
    $$('a[href="#install"]').forEach(function (a) {
      a.addEventListener('click', function () { if (os !== 'win') selectTab(0); });
    });
  });

  /* ---------- copy button ---------- */
  run('copy', function () {
    $$('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var src = $(btn.getAttribute('data-copy'));
        if (!src) return;
        var text = src.textContent.trim();
        function done() {
          btn.classList.add('is-done');
          announce('Copied to the clipboard');
          clearTimeout(btn._t);
          btn._t = setTimeout(function () { btn.classList.remove('is-done'); }, 2200);
        }
        function fallback() {
          var r = doc.createRange(), sel = window.getSelection();
          r.selectNodeContents(src);
          sel.removeAllRanges();
          sel.addRange(r);
          try { if (doc.execCommand('copy')) { done(); sel.removeAllRanges(); } } catch (e) { /* the text stays selected */ }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
        else fallback();
      });
    });
  });

  /* ---------- FAQ: smooth open and close ---------- */
  run('faq', function () {
    $$('.faq-item').forEach(function (d) {
      var sum = $('summary', d), body = $('.faq-a', d), anim = null;
      if (!sum || !body) return;
      var state = d.open ? 'open' : 'closed';
      sum.addEventListener('click', function (e) {
        if (!motion || !body.animate) return;
        e.preventDefault();
        var from = body.offsetHeight;
        if (anim) anim.cancel();
        if (state === 'closed' || state === 'closing') {
          if (state === 'closed') from = 0;
          d.open = true;
          state = 'opening';
          var to = body.scrollHeight;
          anim = body.animate([{ height: from + 'px', opacity: from ? 1 : 0 }, { height: to + 'px', opacity: 1 }],
            { duration: 460, easing: 'cubic-bezier(.22,.8,.24,1)' });
          anim.onfinish = function () { state = 'open'; anim = null; };
        } else {
          state = 'closing';
          anim = body.animate([{ height: from + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
            { duration: 340, easing: 'cubic-bezier(.4,0,.2,1)' });
          anim.onfinish = function () { d.open = false; state = 'closed'; anim = null; };
        }
      });
    });
  });

  /* ---------- F9 key list ---------- */
  run('key list', function () {
    var scene = $('.kl-scene'), key = $('.kl-f9');
    if (!scene || !key) return;
    function show(on) {
      scene.classList.toggle('is-shown', on);
      key.setAttribute('aria-pressed', String(on));
    }
    key.addEventListener('click', function () { show(!scene.classList.contains('is-shown')); });
    if (!motion || inViewNow(scene)) { show(true); return; }
    show(false);
    onView([scene], function (el, on, io) {
      if (!on) return;
      io.disconnect();
      setTimeout(function () {
        key.classList.add('is-press');
        setTimeout(function () { key.classList.remove('is-press'); }, 170);
      }, 250);
      setTimeout(function () { show(true); }, 330);
    }, { threshold: 0.45 });
  });

  /* ---------- numbers: odometer roll ---------- */
  run('numbers', function () {
    var nums = $$('.num'), grid = $('.num-grid');
    if (!motion || !nums.length || !grid) return;
    nums.forEach(function (n, ni) {
      n.style.setProperty('--ni', ni);
      var b = $('.num-big[data-roll]', n);
      if (!b) return;
      var raw = b.getAttribute('data-roll'), unit = $('small', b);
      var sr = doc.createElement('span'); sr.className = 'sr'; sr.textContent = b.getAttribute('data-sr') || b.textContent;
      var odo = doc.createElement('span'); odo.className = 'odo'; odo.setAttribute('aria-hidden', 'true');
      var ci = 0;
      raw.split('').forEach(function (ch) {
        if (/\d/.test(ch)) {
          var col = doc.createElement('span');
          col.className = 'odo-col';
          col.style.setProperty('--to', 10 + Number(ch));
          col.style.setProperty('--ci', ci++);
          for (var k = 0; k < 20; k++) { var d = doc.createElement('span'); d.textContent = k % 10; col.appendChild(d); }
          odo.appendChild(col);
        } else {
          var st = doc.createElement('span'); st.className = 'odo-static'; st.textContent = ch; odo.appendChild(st);
        }
      });
      b.textContent = '';
      b.appendChild(sr);
      b.appendChild(odo);
      if (unit) { unit.setAttribute('aria-hidden', 'true'); b.appendChild(unit); }
    });
    onView([grid], function (el, on, io) {
      if (!on) return;
      io.disconnect();
      nums.forEach(function (n) { n.classList.add('is-rolled'); });
    }, { threshold: 0.35 });
  });

  /* ---------- statement: the words light up in turn once it's in view ---------- */
  run('statement', function () {
    var p = $('.statement-text');
    if (!p) return;
    var i = 0;
    (function split(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = doc.createDocumentFragment();
          n.nodeValue.split(/(\s+)/).forEach(function (t) {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.appendChild(doc.createTextNode(t)); return; }
            var w = doc.createElement('span');
            w.className = 'w';
            w.style.setProperty('--wi', i++);
            w.textContent = t;
            frag.appendChild(w);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) split(n);
      });
    })(p);
    if (!motion) { p.classList.add('is-lit'); return; }
    onView([p], function (el, on, io) {
      if (!on) return;
      io.disconnect();
      p.classList.add('is-lit');
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.3 });
  });

  /* ---------- try it: the demo frame grows into place ---------- */
  run('demo frame', function () {
    var f = $('.demo-frame');
    if (!f || !motion) return;
    if (inViewNow(f)) { setNow([f], 'is-in'); return; }
    onView([f], function (el, on, io) {
      if (!on) return;
      io.disconnect();
      f.classList.add('is-in');
    }, { threshold: 0.12 });
  });

  /* ======================================================================
     Hero show: keys and stick appear together when they come into view,
     play one short demo (W, then once around the circle), spring back,
     then it's the visitor's turn. Real W A S D keys (or taps on the keycaps)
     push the stick at any time; trying it early stops the demo.
     ====================================================================== */
  run('hero show', function () {
    var show = $('.show'), stage = $('.show-stage'), stick = $('.show .stick');
    if (!show || !stage || !stick) return;
    var pin = $('.show-pin') || show;     // pinned (sticky) on most screens; plain flow otherwise
    var keys = {}, promptKeys = {};
    $$('.key', show).forEach(function (k) { keys[k.getAttribute('data-key')] = k; });
    $$('.sp-keys kbd', show).forEach(function (k) { promptKeys[k.getAttribute('data-k')] = k; });

    var state = 'idle';                 // idle → shown → demo → live
    var autoK = '', userK = {}, sig = null, visible = false;
    var cur = { x: 0, y: 0 }, vel = { x: 0, y: 0 }, tgt = { x: 0, y: 0 }, raf = 0, last = 0, ang = 0;

    function render() {
      var mag = Math.min(1, Math.sqrt(cur.x * cur.x + cur.y * cur.y));
      if (mag > .04) ang = Math.atan2(cur.x, -cur.y) * 180 / Math.PI;
      var st = stick.style;
      st.setProperty('--px', cur.x.toFixed(4));
      st.setProperty('--py', cur.y.toFixed(4));
      st.setProperty('--mag', mag.toFixed(3));
      st.setProperty('--ang', ang.toFixed(1) + 'deg');
    }
    function tick(t) {
      var dt = Math.min(.034, Math.max(0, (t - last) / 1000));
      last = t;
      if (!motion) { cur.x = tgt.x; cur.y = tgt.y; vel.x = vel.y = 0; }
      else {
        // a spring: snappy when pushed, a little bounce when let go
        var K = 300, C = 19, h = dt / 2;
        for (var i = 0; i < 2; i++) {
          vel.x += (K * (tgt.x - cur.x) - C * vel.x) * h;
          vel.y += (K * (tgt.y - cur.y) - C * vel.y) * h;
          cur.x += vel.x * h;
          cur.y += vel.y * h;
        }
      }
      var done = Math.abs(tgt.x - cur.x) < .001 && Math.abs(tgt.y - cur.y) < .001 && Math.abs(vel.x) < .01 && Math.abs(vel.y) < .01;
      if (done) { cur.x = tgt.x; cur.y = tgt.y; vel.x = vel.y = 0; raf = 0; }
      else raf = requestAnimationFrame(tick);
      render();
    }
    function apply() {
      var on = {}, i;
      for (i = 0; i < autoK.length; i++) on[autoK.charAt(i)] = true;
      for (i in userK) if (userK[i]) on[i] = true;
      var s = ['w', 'a', 's', 'd'].map(function (c) { return (on[c] ? 1 : 0) + '' + (userK[c] ? 1 : 0); }).join('');
      if (s === sig) return;
      sig = s;
      ['w', 'a', 's', 'd'].forEach(function (c) {
        if (keys[c]) keys[c].classList.toggle('is-down', !!on[c]);
        if (promptKeys[c]) promptKeys[c].classList.toggle('on', !!userK[c]);
      });
      var x = (on.d ? 1 : 0) - (on.a ? 1 : 0), y = (on.s ? 1 : 0) - (on.w ? 1 : 0);
      var m = Math.sqrt(x * x + y * y) || 1;
      tgt.x = x / m;
      tgt.y = y / m;
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }

    // the one-time demo: W, let go, then once around the circle
    var STEPS = [[0, 'w'], [560, ''], [840, 'w'], [1100, 'wd'], [1360, 'd'], [1620, 'sd'], [1880, 's'],
      [2140, 'sa'], [2400, 'a'], [2660, 'wa'], [2920, 'w'], [3180, '']];
    var PROMPT_AT = 3650, demoT = 0, demoLast = 0, demoRaf = 0, startTimer = 0, revealedAt = 0;
    function demoTick(t) {
      var dt = Math.min(50, Math.max(0, t - demoLast));
      demoLast = t;
      if (visible) demoT += dt;          // waits while the stage is off screen
      var k = '';
      for (var i = 0; i < STEPS.length; i++) if (demoT >= STEPS[i][0]) k = STEPS[i][1];
      if (k !== autoK) { autoK = k; apply(); }
      if (demoT >= PROMPT_AT) { demoRaf = 0; yourTurn(); return; }
      demoRaf = requestAnimationFrame(demoTick);
    }
    function startDemo() {
      startTimer = 0;
      if (state !== 'shown' || !visible) return;   // scrolled away before it began: wait for the next time
      state = 'demo';
      demoT = 0;
      demoLast = performance.now();
      demoRaf = requestAnimationFrame(demoTick);
    }
    function reveal() {
      if (show.classList.contains('is-in')) return;
      show.classList.add('is-in');
      revealedAt = performance.now();
      if (state === 'idle') state = 'shown';
    }
    // the demo starts once the block fills the screen (pinned), after the keys have arrived
    function maybeStart() {
      if (state !== 'shown' || startTimer) return;
      startTimer = setTimeout(startDemo, Math.max(150, 800 - (performance.now() - revealedAt)));
    }
    function yourTurn() {
      if (demoRaf) { cancelAnimationFrame(demoRaf); demoRaf = 0; }
      if (startTimer) { clearTimeout(startTimer); startTimer = 0; }
      if (autoK) { autoK = ''; apply(); }
      if (!show.classList.contains('is-in')) show.classList.add('is-in');
      state = 'live';
      show.classList.add('is-prompt');
    }
    function touched() {
      if (state !== 'live') yourTurn();
      show.classList.add('is-touched');
    }

    var CODES = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };
    doc.addEventListener('keydown', function (e) {
      var c = CODES[e.code];
      if (!c || e.ctrlKey || e.metaKey || e.altKey || editable(e.target) || !visible) return;
      touched();
      if (!userK[c]) { userK[c] = true; apply(); }
    });
    doc.addEventListener('keyup', function (e) {
      var c = CODES[e.code];
      if (c && userK[c]) { userK[c] = false; apply(); }
    });
    window.addEventListener('blur', function () { userK = {}; apply(); });
    Object.keys(keys).forEach(function (c) {
      var el = keys[c];
      function up() { if (userK[c]) { userK[c] = false; apply(); } }
      el.addEventListener('pointerdown', function (e) {
        touched();
        userK[c] = true;
        apply();
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    });

    render();
    if (!motion) { state = 'live'; show.classList.add('is-in', 'is-prompt'); }
    if (hasIO) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          // how much of the screen it fills (the pinned block is one screen tall)
          var fill = e.isIntersecting ? Math.max(e.intersectionRatio, e.intersectionRect.height / (window.innerHeight || 1)) : 0;
          visible = fill >= .3;
          if (state === 'idle' && fill >= .35) reveal();
          if (state === 'shown') {
            if (fill >= .85) maybeStart();
            else if (startTimer && fill < .5) { clearTimeout(startTimer); startTimer = 0; }
          }
        });
      }, { threshold: [0, .2, .3, .35, .5, .7, .85, .95, 1] }).observe(pin);
    } else { visible = true; reveal(); maybeStart(); }
    api.show = { state: function () { return state; } };
  });

  /* ---------- highlights: a carousel (swipe or scroll sideways, arrows, dots) ---------- */
  run('highlights', function () {
    var view = $('.hl-viewport'), track = $('.hl-track');
    if (!view || !track) return;
    var cards = $$('.hl-card', track), dotsWrap = $('.hl-dots'), arrows = $$('.hl-arrow');
    if (!cards.length) return;
    var targets = [], dots = [], active = -1;
    function measure() {
      var max = Math.max(0, view.scrollWidth - view.clientWidth), base = cards[0].offsetLeft, list = [];
      cards.forEach(function (c, i) {
        var t = Math.max(0, Math.min(c.offsetLeft - base, max));
        if (!list.length || t - list[list.length - 1].t > 4) list.push({ t: t, i: i });
      });
      targets = list;
      if (dotsWrap && dots.length !== targets.length) {
        dotsWrap.textContent = '';
        dots = targets.map(function (tg, k) {
          var b = doc.createElement('button');
          var h = $('h3', cards[tg.i]);
          b.type = 'button';
          b.className = 'hl-dot';
          b.setAttribute('aria-label', h ? h.textContent : 'Highlight ' + (k + 1));
          b.addEventListener('click', function () { go(k); });
          dotsWrap.appendChild(b);
          return b;
        });
        active = -1;
      }
      update();
    }
    function nearest() {
      var x = view.scrollLeft, best = 0, bd = Infinity;
      targets.forEach(function (tg, k) { var d = Math.abs(tg.t - x); if (d < bd) { bd = d; best = k; } });
      return best;
    }
    function update() {
      var k = nearest(), max = view.scrollWidth - view.clientWidth;
      if (k !== active) {
        active = k;
        dots.forEach(function (d, j) { if (j === k) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
      }
      arrows.forEach(function (a) {
        var dir = +a.getAttribute('data-dir');
        a.disabled = dir < 0 ? view.scrollLeft <= 2 : view.scrollLeft >= max - 2;
      });
    }
    function go(k) {
      if (!targets.length) return;
      k = Math.max(0, Math.min(targets.length - 1, k));
      view.scrollTo({ left: targets[k].t, behavior: motion ? 'smooth' : 'auto' });
    }
    arrows.forEach(function (a) {
      a.addEventListener('click', function () { go(nearest() + (+a.getAttribute('data-dir') || 0)); });
    });
    var ticking = false;
    view.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; update(); });
    }, { passive: true });
    window.addEventListener('resize', measure);
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(view);
    measure();
    // each card runs its little loop only while it's on screen
    onView(cards, function (el, on) { el.classList.toggle('is-inview', on); }, { threshold: 0.2 });
  });

  /* ---------- editor: the screenshot zooms in, then the callouts take turns ---------- */
  run('editor', function () {
    var fig = $('.editor-figure');
    if (!fig) return;
    var img = $('.editor-shot img', fig), rings = $('.rings', fig), items = $$('.callouts li', fig), dotsWrap = $('.callout-dots', fig);
    if (!img || !items.length) return;
    var boxes = items.map(function (li) { return (li.getAttribute('data-box') || '0 0 0 0').split(/\s+/).map(Number); });
    // one spotlight per callout: four dim panels around the box and a glowing outline
    var ringEls = !rings ? [] : boxes.map(function (b) {
      var x = b[0], y = b[1], w = b[2], h = b[3];
      var ring = doc.createElement('div');
      ring.className = 'ring';
      [[0, 0, 100, y], [0, y + h, 100, 100 - y - h], [0, y, x, h], [x + w, y, 100 - x - w, h]].forEach(function (r) {
        var d = doc.createElement('i');
        d.style.left = r[0] + '%'; d.style.top = r[1] + '%'; d.style.width = r[2] + '%'; d.style.height = r[3] + '%';
        ring.appendChild(d);
      });
      var o = doc.createElement('b');
      o.style.left = x + '%'; o.style.top = y + '%'; o.style.width = w + '%'; o.style.height = h + '%';
      ring.appendChild(o);
      rings.appendChild(ring);
      return ring;
    });
    var active = -2, auto = motion, timer = 0, idx = -1, visible = false, started = false;
    var dots = !dotsWrap ? [] : items.map(function (li, i) {
      var b = doc.createElement('button');
      var text = li.textContent.replace(/^\s*\d+\s*/, '');
      b.type = 'button';
      b.className = 'callout-dot';
      b.textContent = String(i + 1);
      b.setAttribute('aria-label', text);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', function () {
        auto = false;
        clearTimeout(timer);
        timer = 0;
        setActive(active === i ? -1 : i);
      });
      dotsWrap.appendChild(b);
      return b;
    });
    function setActive(i) {
      if (i === active) return;
      active = i;
      items.forEach(function (li, j) { li.classList.toggle('on', j === i); });
      ringEls.forEach(function (r, j) { r.classList.toggle('on', j === i); });
      dots.forEach(function (d, j) { d.setAttribute('aria-pressed', String(j === i)); });
      // phones: zoom into the part being described
      var t = '';
      if (root.clientWidth <= 734 && i >= 0) {
        var b = boxes[i];
        var z = Math.min(2.6, Math.max(1, Math.min(90 / b[2], 80 / b[3])));
        var tx = Math.min(0, Math.max(100 - 100 * z, 50 - (b[0] + b[2] / 2) * z));
        var ty = Math.min(0, Math.max(100 - 100 * z, 50 - (b[1] + b[3] / 2) * z));
        t = 'translate(' + tx.toFixed(2) + '%,' + ty.toFixed(2) + '%) scale(' + z.toFixed(3) + ')';
      }
      img.style.transform = t;
    }
    // one pass through the callouts, then the whole screenshot again (the dots revisit any of them)
    function next() {
      timer = 0;
      if (!auto || !visible) return;
      idx += 1;
      if (idx >= items.length) { auto = false; setActive(-1); return; }
      setActive(idx);
      timer = setTimeout(next, 2800);
    }
    if (!motion) return;   // reduced motion: the callouts are a plain list under the picture
    if (inViewNow(fig)) setNow([fig], 'is-in');
    if (hasIO) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          visible = e.isIntersecting && e.intersectionRatio >= .2;
          if (!started && e.intersectionRatio >= .35) {
            started = true;
            fig.classList.add('is-in');
            timer = setTimeout(next, 1300);       // after the zoom
          } else if (started && visible && auto && !timer) {
            timer = setTimeout(next, 700);
          }
          if (!visible && timer) { clearTimeout(timer); timer = 0; }
        });
      }, { threshold: [0, .2, .35] }).observe(fig);
    } else { visible = true; started = true; fig.classList.add('is-in'); next(); }
  });

  /* ---------- debug: ?y=1234 scrolls there on load; anchors line up after the components build ---------- */
  run('jump', function () {
    var qy = /[?&]y=(\d+)/.exec(location.search);
    var moved = false;
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (t) {
      window.addEventListener(t, function () { moved = true; }, { passive: true, once: true });
    });
    function jump(y) {
      var prev = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, y);
      root.style.scrollBehavior = prev;
    }
    function align() {
      if (qy) { jump(+qy[1]); revealNow(); return; }
      if (moved || !location.hash || location.hash.length < 2) return;
      var t = null;
      try { t = doc.getElementById(decodeURIComponent(location.hash.slice(1))); } catch (e) { /* bad hash */ }
      if (!t) return;
      var pad = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
      jump(Math.max(0, t.getBoundingClientRect().top + window.pageYOffset - pad));
    }
    if (qy && 'scrollRestoration' in history) history.scrollRestoration = 'manual';
    align();
    window.addEventListener('load', function () { align(); revealNow(); });
  });
})();
