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
  // The page ships with direct links to the release it was built with. The newest
  // release (GitHub's public API, once per visit) replaces them, matched by file
  // pattern, so a newer release works before the page is updated.
  var os = 'win';
  var DL = {
    win: { re: /^wasdmod-[\d.]+\.exe$|^wasdmod-Windows\.exe$/, ext: 'exe', label: 'Download for Windows' },
    mac: { re: /^wasdmod-[\d.]+\.dmg$|^wasdmod-Mac\.dmg$/, ext: 'dmg', label: 'Download for Mac' },
    linux: { re: /^wasdmod-[\d.]+\.zip$|^wasdmod\.zip$/, ext: 'zip', label: 'Download for Linux' }
  };
  function applyDownloads() {
    $$('[data-dl]').forEach(function (a) {
      var d = DL[a.getAttribute('data-dl') || os];
      if (d.href) a.href = d.href;
      var label = $('[data-dl-label]', a);
      if (label && !a.getAttribute('data-dl')) label.textContent = d.label;
    });
    $$('[data-dl-name]').forEach(function (el) {
      var d = DL[el.getAttribute('data-dl-name')];
      if (d.name) el.textContent = d.name.replace(/-/g, '\u2011');
    });
  }
  run('downloads', function () {
    var ua = navigator.userAgent || '';
    var plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    if (/Android|iPhone|iPad|iPod|CrOS/i.test(ua)) os = 'win';
    else if (/Mac/i.test(plat) || /Macintosh/.test(ua)) os = navigator.maxTouchPoints > 1 ? 'win' : 'mac';
    else if (/Linux|X11|SteamOS/i.test(plat + ' ' + ua)) os = 'linux';
    api.os = os;
    // the links the page was built with
    $$('a[data-dl]').forEach(function (a) {
      var which = a.getAttribute('data-dl');
      if (which && !DL[which].href) DL[which].href = a.href;
    });
    applyDownloads();
  });

  /* ---------- newest release (optional, cached for the session) ---------- */
  run('version', function () {
    function setRelease(rel) {
      $$('[data-version]').forEach(function (el) { el.textContent = 'Version ' + rel.v; });
      Object.keys(DL).forEach(function (k) {
        var f = rel.files && rel.files[k];
        if (f) { DL[k].href = f.url; DL[k].name = f.name; }
      });
      applyDownloads();
    }
    var key = 'wasdmod-release', cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { /* private mode */ }
    if (cached && cached.v) { setRelease(cached); return; }
    if (!window.fetch) return;
    fetch('https://api.github.com/repos/Wanzho/mcd2-wasd/releases/latest', { credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var m = /^v?(\d{1,3}(?:\.\d{1,4}){1,3})$/.exec((j && j.tag_name) || '');
        if (!m) return;
        var rel = { v: m[1], files: {} };
        var pre = 'https://github.com/Wanzho/mcd2-wasd/releases/download/';
        (j.assets || []).forEach(function (as) {
          Object.keys(DL).forEach(function (k) {
            var u = as && as.browser_download_url;
            if (!rel.files[k] && DL[k].re.test(as.name || '') && typeof u === 'string' && u.indexOf(pre) === 0) {
              rel.files[k] = { name: as.name, url: u };
            }
          });
        });
        setRelease(rel);
        try { sessionStorage.setItem(key, JSON.stringify(rel)); } catch (e) { /* ignore */ }
      })
      .catch(function () { /* keep the built-in links */ });
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
      if (i > 0) el.style.setProperty('--rd', Math.min(i, 5) * 0.07 + 's');
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
    // the highlighted phrase: each word gets its own slice of one warm-to-cyan sweep (by letters, so it's even)
    $$('.em', p).forEach(function (em) {
      var STOPS = [[0, 255, 138, 20], [.14, 255, 154, 28], [.29, 255, 217, 59], [.425, 30, 214, 230], [1, 30, 214, 230]];   // cyan from "controller" on
      function at(t) {
        for (var k = 1; k < STOPS.length; k++) if (t <= STOPS[k][0]) {
          var a = STOPS[k - 1], b = STOPS[k], f = (t - a[0]) / (b[0] - a[0] || 1);
          return 'rgb(' + [1, 2, 3].map(function (c) { return Math.round(a[c] + (b[c] - a[c]) * f); }).join(',') + ')';
        }
        return 'rgb(30,214,230)';
      }
      var words = $$('.w', em), len = words.reduce(function (s, w) { return s + w.textContent.length; }, 0) || 1, done = 0;
      words.forEach(function (w) {
        w.style.setProperty('--g0', at(done / len));
        done += w.textContent.length;
        w.style.setProperty('--g1', at(done / len));
      });
      em.classList.add('is-flow');
    });
    // each word starts a little sooner after the last, so the sweep is quick and lands softly
    var ws = $$('.w', p), n = ws.length, total = Math.min(1.5, n * 0.034);
    ws.forEach(function (w, j) { w.style.setProperty('--wd', (total * (1 - Math.pow(1 - j / Math.max(1, n - 1), 1.6))).toFixed(3) + 's'); });
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

  /* ---------- the other looping animations (the pulsing dots, the
     final icon) rest while their section is off screen: .is-away, see style.css ---------- */
  run('loops', function () {
    onView([$('#try'), $('.final')], function (el, on) { el.classList.toggle('is-away', !on); });
  });

  /* ---------- editor: a live copy of the key layout editor, toured as you scroll ----------
     editor-tour.js does it all (it loads after this file and starts on its own, guarded the same way). */

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
