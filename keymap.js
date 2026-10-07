/* wasdmod key map: an interactive keyboard and mouse showing what every key does in the
   mod's layouts. Drag a lit key to move its action (or edit the list below), then export
   the result as a real wasdmod settings file. The layout logic is the key layout editor's
   own (keybinder-core.js, loaded first), so what the map shows is exactly what it exports.
   Builds everything inside #keymap (does nothing without it). Styles live in keymap.css. */
(() => {
  'use strict';
  const host = document.getElementById('keymap'), K = window.Keybinder;
  if (!host) return;
  if (!K) { // keybinder-core.js belongs before this file; if the page left it out, load it and start again
    const me = document.currentScript && document.currentScript.src;
    if (!me) return console.warn('keymap.js: load keybinder-core.js before it');
    const core = Object.assign(document.createElement('script'), { src: new URL('keybinder-core.js', me).href });
    core.onload = () => { if (window.Keybinder) document.head.append(Object.assign(document.createElement('script'), { src: me })); };
    core.onerror = () => console.warn('keymap.js: keybinder-core.js is missing');
    return document.head.append(core);
  }

  /* ---- Keyboard: rows of key[:width] in key units, 15 wide; keys go by the editor's names */
  const FN_H = 0.62; // the function row is shorter
  const ROWS = [
    'Escape:1.5 ' + Array.from({ length: 12 }, (_, i) => `F${i + 1}:1.125`).join(' '),
    'Backtick 1 2 3 4 5 6 7 8 9 0 - = Backspace:2',
    'Tab:1.5 Q W E R T Y U I O P [ ] \\:1.5',
    "CapsLock:1.75 A S D F G H J K L ; ' Enter:2.25",
    'Shift:2.25 Z X C V B N M , . / Shift:2.75',
  ];
  const BOTTOM = { // followed by the arrow keys
    win: 'Ctrl:1.5 Win:1.25 Alt:1.25 Space:5.5 Alt:1.25 Ctrl:1.25',
    mac: 'Ctrl:1.25 Alt:1.25 Win:1.5 Space:5.25 Win:1.5 Alt:1.25',
  };
  // The mouse as if it sat right of the keyboard, for the arrow keys: [x, y, w, h] in key units.
  const MOUSE_GEO = { Mouse3: [16.85, 0, 0.5, FN_H], Mouse1: [15.6, FN_H, 1.5, 2], Mouse2: [17.1, FN_H, 1.5, 2],
    Mouse5: [15.6, FN_H + 2.2, 0.6, 1], Mouse4: [15.6, FN_H + 3.2, 0.6, 1] };
  const SHIFTED = { Backtick: '~', 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')',
    '-': '_', '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?' };
  const PUNCT = { Backtick: 'backtick', '-': 'minus', '=': 'equals', '[': 'left bracket', ']': 'right bracket',
    '\\': 'backslash', ';': 'semicolon', "'": 'quote', ',': 'comma', '.': 'period', '/': 'slash' };
  const WIN_LOGO = '<svg class="km-logo" viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M0 0h7.4v7.4H0zm8.6 0H16v7.4H8.6zM0 8.6h7.4V16H0zm8.6 0H16V16H8.6z"/></svg>';
  const DL_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.75v8.5m-3.5-3.5L8 10.25l3.5-3.5M2.75 13.25h10.5"/></svg>';
  // win / mac: the legend on the cap (sym: the Mac symbol); short: legend on small screens;
  // name / macName: what the tooltip and the list call the key.
  const NAMED = {
    Escape: { win: 'Esc', mac: 'esc', name: 'Esc' },
    Backspace: { win: 'Backspace', short: '⌫', mac: 'delete', sym: '⌫', name: 'Backspace', macName: '⌫ Delete' },
    Tab: { win: 'Tab', mac: 'tab', sym: '⇥', name: 'Tab' },
    CapsLock: { win: 'Caps Lock', short: 'Caps', mac: 'caps lock', sym: '⇪', name: 'Caps Lock' },
    Enter: { win: 'Enter', mac: 'return', sym: '⏎', name: 'Enter', macName: 'Return' },
    Shift: { win: 'Shift', mac: 'shift', sym: '⇧', name: 'Shift', macName: '⇧ Shift' },
    Ctrl: { win: 'Ctrl', mac: 'control', sym: '⌃', name: 'Ctrl', macName: '⌃ Control' },
    Alt: { win: 'Alt', mac: 'option', sym: '⌥', name: 'Alt', macName: '⌥ Option' },
    Win: { win: WIN_LOGO, mac: 'command', sym: '⌘', name: 'Windows key', macName: '⌘ Command' },
    Space: { win: '', mac: '', name: 'Space' },
    Left: { win: '←', mac: '◀︎', name: 'Left arrow' },
    Up: { win: '↑', mac: '▲︎', name: 'Up arrow' },
    Down: { win: '↓', mac: '▼︎', name: 'Down arrow' },
    Right: { win: '→', mac: '▶︎', name: 'Right arrow' },
  };
  const MOUSE = { Mouse1: 'Left click', Mouse2: 'Right click', Mouse3: 'Middle click', Mouse4: 'Side button 4 (back)', Mouse5: 'Side button 5 (front)' };
  const MOUSE_CHIP = { Mouse4: 'Side 4 (back)', Mouse5: 'Side 5 (front)' };
  const MOUSE_ORDER = ['Mouse1', 'Mouse3', 'Mouse2', 'Mouse5', 'Mouse4'];
  const MOUSE_BTN = ['Mouse1', 'Mouse3', 'Mouse2', 'Mouse4', 'Mouse5']; // by MouseEvent.button, as in the editor
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || '');
  const ALL_KEYS = new Set([...ROWS, BOTTOM.win, BOTTOM.mac].join(' ').split(' ').map(t => t.split(':')[0])
    .concat('Left', 'Up', 'Down', 'Right', Object.keys(MOUSE)));
  const BINDABLE = new Set([...ALL_KEYS].filter(k => k !== 'Win' && k !== '\\')); // the editor can't take these two

  /* ---- Rows that own keys: the editor's actions and the mod's own keys --------------------- */
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
  const uniq = a => [...new Set(a)];
  const CATS = { move: 'Movement', action: 'Actions', menu: 'Menus', mod: 'Mod keys' };
  const OWNERS = {};
  for (const a of K.ACTIONS) if (!a.hidden) OWNERS[a.id] = { id: a.id, name: a.label, a };
  for (const m of K.MOD_ROWS) if (['TypeKey', 'Cursor', 'Toggle', 'Legend'].includes(m.id)) OWNERS[m.id] = { id: m.id, name: m.label, m };
  const NOTES = {}; // row name -> note (usage() reports rows by name)
  for (const r of [...K.ACTIONS, ...K.MOD_ROWS]) if (r.label && r.sub) NOTES[r.label] = cap1(r.sub);
  // The text list: a row per action, a few grouped as in the README.
  const GROUPS = { up: ['Move up / left / down / right', 'left', 'down', 'right'], art1: ['Artifact 1 / 2 / 3', 'art2', 'art3'],
    tp1: ['Teleport to player 1–4', 'tp2', 'tp3', 'tp4'] };
  const inGroup = new Set(Object.values(GROUPS).flatMap(g => g.slice(1)));
  const LIST = Object.values(OWNERS).filter(o => !inGroup.has(o.id)).map(o => {
    const g = GROUPS[o.id];
    return { cat: o.a ? o.a.cat : 'mod', name: g ? g[0] : o.name, owners: g ? [o.id, ...g.slice(1)] : [o.id] };
  });
  const keysOf = (st, o) => (o.a ? st.keys[o.id] : o.m.get(st)) || [];
  const setKeys = (st, o, v) => (o.a ? (st.keys[o.id] = uniq(v)) : o.m.set(st, uniq(v)));
  const ownersOf = (st, key) => Object.values(OWNERS).filter(o => keysOf(st, o).includes(key));
  const kbOnly = (st, o) => !!o.a && K.route(o.a, st) === 'kb'; // sent to the game as its keyboard shortcut
  // The settings file always keeps Esc as the game menu / back key (BackKeys=Escape), so it can't leave that row.
  const locked = (o, k) => o.id === 'esc' && k === 'Escape';
  const names = os => os.map(o => o.name).join(' · ');
  // The editor's rules for giving a row a key: '' when it can, else why not.
  function refusal(st, o, key) {
    if (key === 'Win') return 'win';
    if (!BINDABLE.has(key)) return 'nokey';
    if (kbOnly(st, o) && K.isMouse(key)) return 'mouse';
    if (kbOnly(st, o) && (key === '=' || key === ';')) return 'send';
    return '';
  }
  function whyText(r, long) {
    if (r.code === 'win') return !long ? 'Can’t be bound' : (r.mac ? '⌘ Command is kept for system shortcuts and can’t be bound.'
      : 'The Windows key is kept for system shortcuts and can’t be bound.');
    if (r.code === 'esc') return long ? 'Esc always stays the game menu key. You can add more keys for it in the list.' : 'Esc stays the game menu key';
    if (r.code === 'nokey') return long ? `The mod can’t use ${keyName(r.key)}.` : 'The mod can’t use this key';
    if (r.code === 'mouse') return long ? `${r.o.name} needs a key: a mouse button can’t send its keyboard shortcut.` : `${r.o.name} needs a key`;
    return long ? `${keyName(r.key)} can’t be sent to the game.` : 'Can’t be sent to the game';
  }
  // Moving the action(s) on key S to key T: whatever was on T goes to S (a swap).
  function plan(st, S, T) {
    const from = ownersOf(st, S), to = ownersOf(st, T).filter(o => !from.includes(o));
    if (T === 'Win') return { code: 'win', mac: view.os === 'mac' };
    for (const [os, key, old] of [[from, T, S], [to, S, T]]) for (const o of os) {
      const code = locked(o, old) ? 'esc' : refusal(st, o, key);
      if (code) return { code, o, key };
    }
    return { from, to };
  }
  const swapIn = (st, rows, S, T) => rows.forEach(o => setKeys(st, o, keysOf(st, o).map(k => (k === S ? T : k === T ? S : k))));

  /* ---- State: the Official layout, Recommended or yours (an editor state, kept in this browser) */
  // d is the Official layout: the editor's Default (the game's own keys, played as a controller).
  const BASE = { d: K.DEFAULT_INI, r: K.AUTHOR_INI };
  const FROM = { d: 'the Official layout', r: 'Recommended' }; // "made from …", "back to …"
  const LAYOUT = { d: 'Official layout', r: 'Recommended layout', y: 'Your layout' };
  const store = (k, v) => { // get with one argument, remove with null
    try {
      if (v === undefined) return localStorage.getItem('wasdmod-keymap-' + k);
      if (v === null) localStorage.removeItem('wasdmod-keymap-' + k); else localStorage.setItem('wasdmod-keymap-' + k, v);
    } catch (e) { /* private mode: this visit only */ }
    return null;
  };
  let yours = null; // { base, keys: {action: [...]}, mod: {row: [...]} }
  try { const y = JSON.parse(store('yours')); if (y && BASE[y.base] && y.keys && y.mod) yours = y; } catch (e) { /* none yet */ }
  const pick = (v, ok, first = ok[0]) => (ok.includes(v) ? v : first);
  // A first visit starts on Recommended (a saved pick wins), on a Windows keyboard.
  const view = { layout: pick(store('layout'), yours ? ['d', 'r', 'y'] : ['d', 'r'], 'r'), os: pick(store('os'), ['win', 'mac']) };
  const baseState = l => K.stateFromIni(BASE[l]); // exactly the editor's built-in layout
  function stateFor(l) {
    if (l !== 'y') return baseState(l);
    const st = baseState(yours.base);
    for (const o of Object.values(OWNERS)) {
      const v = (o.a ? yours.keys : yours.mod)[o.id];
      if (Array.isArray(v)) setKeys(st, o, v.map(String).filter(k => BINDABLE.has(k)).slice(0, 3));
    }
    return st;
  }
  let state = stateFor(view.layout), binds = new Map();
  // Every change goes through here; the first one makes the layout yours.
  function edit(change) {
    let note = '';
    if (view.layout !== 'y') {
      if (yours) note = `Started a new layout from ${FROM[view.layout]}`;
      yours = { base: view.layout };
      view.layout = 'y';
      store('layout', 'y');
    }
    change(state);
    const keys = {}, mod = {};
    for (const o of Object.values(OWNERS)) (o.a ? keys : mod)[o.id] = keysOf(state, o);
    yours = { v: 1, base: yours.base, keys, mod };
    store('yours', JSON.stringify(yours));
    apply();
    renderList(true);
    syncControls();
    return note;
  }

  /* ---- Markup ------------------------------------------------------------------------------ */
  const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  const mq = q => !!(window.matchMedia && matchMedia(q).matches);
  const reduceMotion = mq('(prefers-reduced-motion: reduce)'), touchFirst = mq('(hover: none)');
  const ABOUT = {
    d: 'The game’s own keys, played as a controller. Only the menu wheel moves, from S to Tab.',
    r: 'The author’s layout. Dodge with right click or Shift; the bow moves to side button 4.',
    y: base => `Your layout, made from ${FROM[base]}. Export it below to play with it in the game.`,
  };
  const seg = (key, label, opts) => `
    <div class="km-seg" role="radiogroup" aria-label="${label}" data-key="${key}">
      <span class="km-pill" aria-hidden="true"></span>
      ${opts.map(([v, t]) => `<button type="button" role="radio" data-v="${v}">${t}</button>`).join('')}
    </div>`;
  const mb = (id, cls, label = '') => `<button type="button" class="km-key km-mb ${cls}" data-k="${id}" tabindex="-1">${label}</button>`;
  const reveal = !reduceMotion && 'IntersectionObserver' in window; // light the keys when scrolled to
  // is-static: no transitions until the first frames are drawn, so nothing animates from a half-built state
  host.innerHTML = `<div class="km is-static${reveal ? ' is-pre' : ''}">
    <div class="km-bar">
      <div class="km-lay">${seg('layout', 'Layout', [['d', 'Official layout'], ['r', 'Recommended'], ['y', 'Yours']])}<button type="button" class="km-reset" hidden>Reset</button></div>
      ${seg('os', 'Keyboard', [['win', 'Windows'], ['mac', 'Mac']])}
    </div>
    <p class="km-about"><span class="km-about-s">${['d', 'r', 'y'].map(l => `<span data-l="${l}"></span>`).join('')}</span>
      <span class="km-hint">${touchFirst ? 'Tap a key to see what it does. Touch and hold a lit key to move it.'
        : 'Hover over a key to see what it does. Drag a lit key to move it.'}</span></p>
    <div class="km-stage">
      <div class="km-kbwrap"><div class="km-deck"><div class="km-kb" role="group"></div></div></div>
      <div class="km-mouse" role="group" aria-label="Mouse">
        <div class="km-mouse-body">${mb('Mouse1', 'km-mb-l')}${mb('Mouse2', 'km-mb-r')}</div>
        ${mb('Mouse3', 'km-mb-m')}${mb('Mouse5', 'km-mb-s km-mb-5', '5')}${mb('Mouse4', 'km-mb-s km-mb-4', '4')}
      </div>
      <div class="km-legend" role="group" aria-label="Highlight keys by group">${Object.entries(CATS).map(([c, t]) =>
        `<button type="button" class="km-leg" data-cat="${c}" aria-pressed="false"><span class="km-sw"></span>${t}</button>`).join('')}</div>
    </div>
    <div class="km-export">
      <button type="button" class="km-exp">${DL_ICON}<span>Export layout</span></button>
      <p class="km-exp-note"><span>Windows: the setup’s Load layout file…</span> · <span>Mac: the app’s layout menu → Import…</span> · <span>Linux / Steam Deck: put it in Dungeons/Binaries/Win64.</span></p>
    </div>
    <div class="km-list">
      <button type="button" class="km-more" aria-expanded="false">All controls<span class="km-chev" aria-hidden="true"></span></button>
      <div class="km-list-body"><div class="km-list-in">
        <p class="km-list-hint">${touchFirst ? 'With a keyboard attached, tap a key here and press the new one.' : 'Click a key to change it, or + key to add one.'}</p>
        <div class="km-cols"></div></div></div>
    </div>
    <div class="km-tip" aria-hidden="true"><div><b class="km-tip-k"></b> — <span class="km-tip-a"></span></div><div class="km-tip-d"></div></div>
    <div class="km-ghost" aria-hidden="true"><b></b><span></span><i></i></div>
    <div class="km-sr" aria-live="polite"></div>
  </div>`;
  const km = host.firstElementChild;
  const $ = sel => km.querySelector(sel);
  const kb = $('.km-kb'), tip = $('.km-tip'), deck = $('.km-deck'), ghost = $('.km-ghost');
  const mouseKeys = [...km.querySelectorAll('.km-mb')];
  mouseKeys.forEach(el => {
    const [x, y, w, h] = MOUSE_GEO[el.dataset.k];
    el.g = { x, y, w, h };
    el.style.setProperty('--d', 13 + MOUSE_ORDER.indexOf(el.dataset.k) * 0.6);
  });
  mouseKeys[0].tabIndex = 0;
  let keys = []; // keyboard keys; el.g = geometry in key units
  const allKeys = () => [...keys, ...mouseKeys];
  const keyEls = id => allKeys().filter(el => el.dataset.k === id);
  const announce = text => { const s = $('.km-sr'); s.textContent = ''; setTimeout(() => { s.textContent = text; }, 40); };

  // Cap legend, tooltip name and list chip for a key, on the current keyboard.
  function keyInfo(id) {
    if (MOUSE[id]) return { name: MOUSE[id], chip: MOUSE_CHIP[id] || MOUSE[id] };
    const n = NAMED[id], mac = view.os === 'mac';
    if (!n) {
      const top = SHIFTED[id], face = id === 'Backtick' ? '`' : id;
      return { cap: top ? `<span class="km-two"><span class="km-alt">${esc(top)}</span><span>${esc(face)}</span></span>` : esc(face),
        name: PUNCT[id] ? `${face} (${PUNCT[id]})` : face, chip: id === 'Backtick' ? '` (backtick)' : face };
    }
    const name = (mac && n.macName) || n.name;
    const word = t => (t.length > 2 && t[0] !== '<' ? `<span class="km-word">${t}</span>` : t);
    if (!mac) return { cap: word(n.win), short: n.short, name, chip: name };
    return { cap: n.sym ? `<span class="km-mm"><span class="km-sym">${n.sym}</span>${word(n.mac)}</span>` : word(n.mac), short: n.sym, name, chip: name };
  }
  const keyName = id => keyInfo(id).chip;

  function buildBoard() {
    const geo = [];
    let y = 0;
    [...ROWS, BOTTOM[view.os]].forEach((row, r) => {
      const h = r ? 1 : FN_H, seen = new Set();
      let x = 0;
      for (const t of row.split(' ')) {
        const [id, w = 1] = t.split(':');
        geo.push({ id, x, y, w: +w, h, fn: !r, side: seen.has(id) ? 'R' : 'L' }); // side: which of a doubled key
        seen.add(id);
        x += +w;
      }
      y += h;
    });
    const b = y - 1; // arrow keys, half height, at the end of the bottom row
    geo.push({ id: 'Left', x: 12, y: b + 0.5, w: 1, h: 0.5 }, { id: 'Up', x: 13, y: b, w: 1, h: 0.5 },
      { id: 'Down', x: 13, y: b + 0.5, w: 1, h: 0.5 }, { id: 'Right', x: 14, y: b + 0.5, w: 1, h: 0.5 });
    kb.style.setProperty('--rows', y);
    kb.innerHTML = geo.map(g => {
      const k = keyInfo(g.id);
      const d = Math.hypot(g.x + g.w / 2 - 3.25, (g.y + g.h / 2 - FN_H - 2.2) * 1.3).toFixed(2); // distance from WASD
      const cap = k.short ? `<span class="km-full">${k.cap}</span><span class="km-short">${k.short}</span>` : k.cap;
      return `<button type="button" class="km-key${g.fn ? ' km-f' : ''}" data-k="${esc(g.id)}" data-side="${g.side || 'L'}" tabindex="-1" ` +
        `style="--x:${g.x};--y:${g.y};--w:${g.w};--h:${g.h};--d:${d}">${cap}</button>`;
    }).join('');
    keys = [...kb.children];
    keys.forEach((el, i) => { el.g = geo[i]; if (el.dataset.k === 'W') el.tabIndex = 0; });
  }

  /* ---- What each key does, from the editor's own usage() of the state ----------------------- */
  const noteFor = name => (name === OWNERS.Cursor.name
    ? (state.opt.CursorMode ? 'Press to show or hide the mouse cursor' : 'Hold for the mouse cursor') : NOTES[name] || '');
  function apply() {
    binds = K.usage(state);
    for (const el of allKeys()) {
      const rows = binds.get(el.dataset.k) || [];
      el.classList.toggle('is-on', rows.length > 0);
      el.classList.toggle('is-fixed', ownersOf(state, el.dataset.k).some(o => locked(o, el.dataset.k)));
      if (rows.length) el.dataset.cat = rows[0].cat; // kept when a key turns off, so it fades out in its colour
      el.dataset.cats = uniq(rows.map(r => r.cat)).join(' ');
      const t = describe(el);
      el.setAttribute('aria-label', `${t.name}: ${t.text}${t.cat && t.note ? `. ${t.note}` : ''}`);
    }
    kb.setAttribute('aria-label', `${view.os === 'mac' ? 'Mac' : 'Windows'} keyboard, ${LAYOUT[view.layout]}`);
  }
  function describe(el) {
    const id = el.dataset.k, name = keyInfo(id).name, rows = binds.get(id) || [], mac = view.os === 'mac';
    if (id === 'Win') return { name, text: 'while held, no key registers; it can’t be bound' };
    if (!rows.length) return { name, text: 'not used', note: !MOUSE[id] && state.opt.BlockOtherKeys ? 'Blocked while you play, so the game can’t flip into keyboard mode' : '' };
    const notes = rows.map(r => noteFor(r.name)).filter(Boolean);
    if (mac && /^F\d/.test(id)) notes.push(`On a Mac keyboard: fn + ${id}, unless the F-keys are set as standard function keys`);
    if (mac && id === 'Alt') notes.push('The mod’s Alt key is Option on a Mac');
    if (el.classList.contains('is-fixed')) notes.push('Always on Esc; you can add more keys for it in the list');
    return { name, cat: rows[0].cat, text: rows.map(r => r.name).join(' · '), note: notes.join(' · ') };
  }

  /* ---- The list: every row's keys, editable like the editor's ----------------------------- */
  const prevSig = [];
  let rowMsg = null, rowMsgTimer = 0; // { i, text, warn }: a line under one row
  const chipHtml = (o, k, label) => `<span class="km-cw"><button type="button" class="km-chip" data-o="${o.id}" data-key="${esc(k)}" ` +
    `aria-label="${esc(label)}: ${esc(keyName(k))}. ${locked(o, k) ? 'Always on this key' : 'Change it, or press Delete to remove it'}">${esc(keyName(k))}</button>` +
    (locked(o, k) ? '' : `<button type="button" class="km-x" data-o="${o.id}" data-key="${esc(k)}" tabindex="-1" aria-label="Remove ${esc(keyName(k))} from ${esc(label)}">×</button>`) + '</span>';
  function rowHtml(r, i, flash) {
    const single = r.owners.length === 1;
    const keysHtml = r.owners.map(id => {
      const o = OWNERS[id], ks = keysOf(state, o), label = single ? r.name : o.name;
      return ks.map(k => chipHtml(o, k, label)).join('') + (ks.length < 3 && (single || !ks.length)
        ? `<button type="button" class="km-add${ks.length ? '' : ' is-empty'}" data-o="${id}" aria-label="Add a key for ${esc(label)}">${single ? '+ key' : '+'}</button>` : '');
    }).join('');
    const sig = r.owners.map(id => keysOf(state, OWNERS[id]).join('+')).join(' ');
    const changed = flash && prevSig[i] !== undefined && prevSig[i] !== sig;
    prevSig[i] = sig;
    const note = single ? noteFor(r.name) : '';
    const msg = rowMsg && rowMsg.i === i ? `<dd class="km-rowmsg${rowMsg.warn ? ' is-warn' : ''}" role="status">${esc(rowMsg.text)}</dd>` : '';
    return `<div class="km-row${changed ? ' is-new' : ''}" data-i="${i}"><dt>${esc(r.name)}${note ? `<span class="km-note">${esc(note)}</span>` : ''}</dt>` +
      `<dd class="km-keys">${keysHtml}</dd>${msg}</div>`;
  }
  function renderList(flash) {
    const group = cat => `<div class="km-group" data-cat="${cat}"><h3 class="km-gh"><span class="km-sw"></span>${CATS[cat]}</h3><dl>${
      LIST.map((r, i) => (r.cat === cat ? rowHtml(r, i, flash) : '')).join('')}</dl></div>`;
    $('.km-cols').innerHTML = `<div class="km-col">${group('move')}${group('action')}</div><div class="km-col">${group('menu')}${group('mod')}</div>`;
  }
  const findChip = (o, k) => [...km.querySelectorAll('.km-chip')].find(c => c.dataset.o === o && c.dataset.key === k);
  function clearRowMsg() {
    clearTimeout(rowMsgTimer);
    rowMsg = null;
    km.querySelectorAll('.km-rowmsg').forEach(d => d.remove());
  }
  function sayRow(i, text, warn, ms = 4500) { // a short line under a row (ms 0: until replaced), also read out
    clearRowMsg();
    rowMsg = { i, text, warn };
    const row = km.querySelector(`.km-row[data-i="${i}"]`);
    if (row) row.insertAdjacentHTML('beforeend', `<dd class="km-rowmsg${warn ? ' is-warn' : ''}">${esc(text)}</dd>`);
    if (ms) rowMsgTimer = setTimeout(clearRowMsg, ms);
    announce(text);
  }
  function removeKey(oid, k) {
    const o = OWNERS[oid], i = LIST.findIndex(r => r.owners.includes(oid));
    if (locked(o, k)) return sayRow(i, whyText({ code: 'esc' }, true), true);
    edit(st => setKeys(st, o, keysOf(st, o).filter(x => x !== k)));
    sayRow(i, `${keyName(k)} removed from ${o.name}.`);
    const next = km.querySelector(`.km-row[data-i="${i}"] .km-chip, .km-row[data-i="${i}"] .km-add`);
    if (next) next.focus();
  }

  /* ---- Key capture for the list: the next key or mouse button press is assigned ----------- */
  let cap = null, swallow = null, stopped = { el: null, t: 0 }; // cap: { o, key (null: add one), i, el, label, t0 }
  function startCapture(el) {
    stopCapture();
    const o = OWNERS[el.dataset.o], i = +el.closest('.km-row').dataset.i;
    const label = LIST[i].owners.length > 1 ? o.name : LIST[i].name;
    if (locked(o, el.dataset.key)) return sayRow(i, whyText({ code: 'esc' }, true), true);
    cap = { o, key: el.dataset.key || null, i, el, label, text: el.textContent, t0: performance.now() };
    el.classList.add('is-listening');
    el.textContent = 'Press a key';
    el.closest('.km-row').classList.add('is-capturing');
    sayRow(i, `Press a key or mouse button for ${label}… Esc to cancel`, false, 0);
  }
  function stopCapture() {
    if (!cap) return;
    const { el, i, text } = cap;
    cap = null;
    stopped = { el, t: performance.now() };
    if (el.isConnected) {
      el.classList.remove('is-listening');
      el.textContent = text;
      el.closest('.km-row').classList.remove('is-capturing');
    }
    if (rowMsg && rowMsg.i === i) clearRowMsg();
  }
  function take(N) {
    const { o, key, i, label } = cap;
    if (N === key) return stopCapture();
    if (keysOf(state, o).includes(N)) return sayRow(i, `${keyName(N)} is already on this row. Press another key, or Esc.`, true, 0);
    const others = ownersOf(state, N).filter(x => x !== o);
    let code = key && locked(o, key) ? 'esc' : refusal(state, o, N), bad = { code, o, key: N };
    if (!code) for (const x of others) { code = locked(x, N) ? 'esc' : key ? refusal(state, x, key) : ''; if (code) { bad = { code, o: x, key }; break; } }
    if (code) return sayRow(i, `${whyText(bad, true)} Press another key, or Esc.`, true, 0);
    stopCapture();
    const note = edit(st => {
      if (key) swapIn(st, [o, ...others], key, N);
      else { for (const x of others) setKeys(st, x, keysOf(st, x).filter(k => k !== N)); setKeys(st, o, [...keysOf(st, o), N]); }
    });
    const what = !others.length ? `${label}: ${keyName(N)}.` : key
      ? `Swapped: ${names(others)} ${others.length > 1 ? 'are' : 'is'} now on ${keyName(key)}.` : `${keyName(N)} moved here from ${names(others)}.`;
    sayRow(i, note ? `${what} ${note}.` : what);
    const c = findChip(o.id, N);
    if (c) c.focus();
  }
  // Keys during a capture: everything is the answer (Esc cancels), nothing reaches the page.
  addEventListener('keydown', e => {
    if (!cap) {
      if (drag && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelDrag(); }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (e.key === 'Escape') return stopCapture();
    if (e.key === 'Meta' || /^(Meta|OS)/.test(e.code)) return sayRow(cap.i, `${whyText({ code: 'win', mac: MAC }, true)} Press another key, or Esc.`, true, 0);
    const k = codeKey(e.code);
    if (!k) return sayRow(cap.i, `The mod can’t use ${e.key && e.key.length < 12 ? e.key : e.code}. Try another key, or Esc.`, true, 0);
    take(k);
  }, true);
  // Mouse buttons: the button pressed (a plain click elsewhere cancels). Its mouseup, click and
  // context menu are swallowed, so side buttons don't send the browser back or forward.
  addEventListener('pointerdown', e => { if (cap && e.pointerType !== 'mouse') stopCapture(); }, true);
  addEventListener('mousedown', e => {
    swallow = null;
    if (!cap || performance.now() - cap.t0 < 350) return; // the second click of a double-click isn't an answer
    if (e.button === 0 && !cap.el.closest('.km-row').contains(e.target)) return stopCapture();
    e.preventDefault();
    e.stopPropagation();
    swallow = { b: e.button, up: 0 };
    if (MOUSE_BTN[e.button]) take(MOUSE_BTN[e.button]);
  }, true);
  for (const type of ['pointerup', 'mouseup', 'click', 'auxclick', 'contextmenu']) {
    addEventListener(type, e => {
      if (!swallow || (swallow.up && performance.now() - swallow.up > 150)) { swallow = null; return; }
      if (type !== 'contextmenu' && e.button !== swallow.b) return;
      e.preventDefault();
      e.stopPropagation();
      if (type === 'mouseup') swallow.up = performance.now();
    }, true);
  }
  // A key event's code -> the editor's key name (as its own key capture does).
  function codeKey(code) {
    if (K.CODE_NAMES[code]) return K.CODE_NAMES[code];
    const m = /^(?:Key|Digit)(.)$/.exec(code) || /^Numpad(\d)$/.exec(code);
    if (m) return m[1];
    const f = /^F(\d{1,2})$/.exec(code);
    return f && +f[1] >= 1 && +f[1] <= 12 ? 'F' + f[1] : null;
  }

  /* ---- Tooltip ------------------------------------------------------------------------------- */
  const tipK = $('.km-tip-k'), tipA = $('.km-tip-a'), tipD = $('.km-tip-d');
  let tipFor = null, hideTimer = 0;
  function showTip(el, t = describe(el), hideAfter = 0) {
    clearTimeout(hideTimer);
    const open = tip.classList.contains('is-on');
    tipK.textContent = t.name;
    tipA.textContent = t.text;
    tipD.textContent = t.note || '';
    if (t.cat) tip.dataset.cat = t.cat;
    tip.classList.toggle('is-muted', !t.cat);
    tip.classList.toggle('is-glide', open && tipFor !== el);
    if (tipFor) tipFor.classList.remove('is-tip');
    (tipFor = el).classList.add('is-tip');
    place(el);
    tip.classList.add('is-on');
    markRows(el.dataset.k);
    if (hideAfter) hideTip(hideAfter);
  }
  function hideTip(delay = 0) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      tip.classList.remove('is-on', 'is-glide');
      if (tipFor) tipFor.classList.remove('is-tip');
      tipFor = null;
      markRows(null);
    }, delay);
  }
  // Above the key, arrow pointing at it; below if there's no room; kept inside the viewport and the component.
  function place(el) {
    const kr = el.getBoundingClientRect(), rr = km.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 10, edge = 8;
    const vw = document.documentElement.clientWidth || innerWidth;
    const lo = Math.max(edge, rr.left), hi = Math.min(vw - edge, rr.right);
    const cx = kr.left + kr.width / 2;
    const x = Math.max(lo, Math.min(cx - tw / 2, hi - tw));
    const below = kr.top - th - gap < 64 && kr.bottom + th + gap < innerHeight - edge; // 64: room for a sticky nav bar
    tip.classList.toggle('is-below', below);
    tip.style.setProperty('--ax', `${Math.max(14, Math.min(tw - 14, cx - x))}px`);
    tip.style.left = `${x - rr.left}px`;
    tip.style.top = `${(below ? kr.bottom + gap : kr.top - th - gap) - rr.top}px`;
  }
  const rowKeys = i => LIST[i].owners.flatMap(id => keysOf(state, OWNERS[id]));
  function markRows(id) {
    km.querySelectorAll('.km-row').forEach(r => r.classList.toggle('is-key', !!id && rowKeys(r.dataset.i).includes(id)));
  }

  /* ---- Highlighting (legend, list rows) ---------------------------------------------------- */
  let pinned = null;
  function hl(test) {
    km.classList.toggle('km-hl', !!test);
    for (const el of allKeys()) el.classList.toggle('is-hl', !!test && test(el));
  }
  const hlCat = cat => hl(el => el.dataset.cats.split(' ').includes(cat));
  const hlRow = row => { const ids = rowKeys(row.dataset.i); hl(el => ids.includes(el.dataset.k)); };
  const restore = () => (pinned ? hlCat(pinned) : hl(null));

  /* ---- Controls: layout, keyboard, reset, export ---------------------------------------------- */
  function placePill(s) { // the pill slides under the chosen segment
    const b = s.querySelector('[aria-checked="true"]');
    if (!b || !b.offsetWidth) return;
    s.style.setProperty('--px', `${b.offsetLeft}px`);
    s.style.setProperty('--pw', `${b.offsetWidth}px`);
  }
  function syncControls() {
    km.querySelector('.km-seg [data-v="y"]').hidden = !yours;
    const reset = $('.km-reset');
    reset.hidden = !yours;
    if (yours) reset.setAttribute('aria-label', `Reset to ${FROM[yours.base]}`);
    km.querySelectorAll('.km-seg').forEach(s => {
      for (const b of s.querySelectorAll('button')) {
        const on = b.dataset.v === view[s.dataset.key];
        b.setAttribute('aria-checked', on);
        b.tabIndex = on ? 0 : -1;
      }
      placePill(s);
    });
    km.querySelectorAll('.km-leg').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === pinned));
    km.querySelectorAll('.km-about-s [data-l]').forEach(s => {
      s.textContent = s.dataset.l === 'y' ? ABOUT.y(yours ? yours.base : 'r') : ABOUT[s.dataset.l];
      s.classList.toggle('is-on', s.dataset.l === view.layout);
    });
  }
  function motion(cls, ms) { // a class that staggers the key transitions for a moment
    if (reduceMotion) return;
    km.classList.add(cls);
    clearTimeout(motion[cls]);
    motion[cls] = setTimeout(() => km.classList.remove(cls), ms);
  }
  function fadeAbout() {
    const t = $('.km-about-s .is-on');
    if (!t) return;
    t.classList.remove('is-in');
    void t.offsetWidth; // restart the fade
    t.classList.add('is-in');
  }
  function choose(key, v) {
    if (view[key] === v) return;
    stopCapture();
    view[key] = v;
    store(key, v);
    hideTip();
    if (key === 'layout') {
      state = stateFor(v);
      syncControls();
      fadeAbout();
      motion('is-switching', 1200);
      apply();
      restore();
      renderList(true);
      announce(LAYOUT[v]);
      return;
    }
    syncControls();
    const swap = () => { buildBoard(); apply(); restore(); renderList(false); };
    if (reduceMotion) return swap();
    deck.classList.add('is-swap'); // fade the legends out and back in
    clearTimeout(choose.t);
    choose.t = setTimeout(() => { swap(); requestAnimationFrame(() => deck.classList.remove('is-swap')); }, 160);
  }
  function resetLayout() {
    const base = yours.base;
    yours = null;
    store('yours', null);
    view.layout = '';
    choose('layout', base);
    announce(`Back to ${FROM[base]}. Your changes were cleared.`);
  }
  function exportFile() { // the settings file the editor would save for this layout
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([K.iniText(state)], { type: 'text/plain' }));
    a.download = 'wasdmod-layout.txt';
    km.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const b = $('.km-exp');
    b.classList.add('is-done');
    b.lastChild.textContent = 'Downloaded';
    clearTimeout(exportFile.t);
    exportFile.t = setTimeout(() => { b.classList.remove('is-done'); b.lastChild.textContent = 'Export layout'; }, 2400);
    announce(`Downloaded wasdmod-layout.txt (${LAYOUT[view.layout]}).`);
  }

  /* ---- Moving keys: drag with a pointer, or Enter / arrows / Enter on the keyboard --------- */
  let drag = null, pd = null, suppressClick = false; // drag: { src, key, over, kbd }; pd: the pointer
  const draggable = el => el.classList.contains('is-on') && !el.classList.contains('is-fixed') && BINDABLE.has(el.dataset.k);
  const keyAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest ? el.closest('#keymap .km-key') : null; };
  function startDrag(src, kbd) {
    hideTip();
    hl(null);
    drag = { src, key: src.dataset.k, over: null, kbd, verdict: new Map() };
    for (const el of allKeys()) {
      if (el === src) continue;
      const p = plan(state, drag.key, el.dataset.k);
      drag.verdict.set(el, p);
      el.classList.toggle('is-nodrop', !!p.code);
    }
    km.classList.add('is-dragging');
    km.dataset.dragcat = src.dataset.cat;
    src.classList.add('is-lifted');
    const rows = binds.get(drag.key) || [];
    ghost.dataset.cat = src.dataset.cat;
    ghost.children[0].textContent = keyName(drag.key);
    ghost.children[1].textContent = rows.map(r => r.name).join(' · ');
    ghost.children[2].textContent = '';
    announce(`Picked up ${rows.map(r => r.name).join(' and ')}${kbd ? '. Arrow keys choose a key, Enter drops it there, Escape cancels.' : ''}`);
  }
  function setOver(t) {
    if (!drag || drag.over === t) return;
    if (drag.over) drag.over.classList.remove('is-drop');
    drag.over = t;
    let hint = '';
    if (t) {
      const p = drag.verdict.get(t), there = binds.get(t.dataset.k);
      if (!p.code) t.classList.add('is-drop');
      hint = p.code ? whyText(p, false) : there ? `Swap with ${there.map(r => r.name).join(' · ')}` : `Move to ${keyName(t.dataset.k)}`;
      if (drag.kbd) showTip(t, { name: keyInfo(t.dataset.k).name, text: hint, cat: p.code ? '' : drag.src.dataset.cat });
    }
    ghost.children[2].textContent = hint;
  }
  function endDrag() {
    if (!drag) return;
    for (const el of allKeys()) el.classList.remove('is-nodrop', 'is-drop', 'is-lifted');
    km.classList.remove('is-dragging');
    ghost.classList.remove('is-on');
    drag = null;
  }
  function cancelDrag() {
    if (!drag) return;
    const { src, kbd } = drag;
    endDrag();
    endPointer();
    if (kbd) { src.focus(); showTip(src); }
    announce('Move cancelled.');
  }
  function dropDrag() {
    const t = drag.over, p = t && drag.verdict.get(t), S = drag.key, kbd = drag.kbd;
    endDrag();
    if (!t) return;
    if (p.code) { showTip(t, { name: keyInfo(t.dataset.k).name, text: 'can’t go here', note: whyText(p, true) }, kbd ? 0 : 2600); announce(whyText(p, true)); return; }
    const T = t.dataset.k, from = p.from, to = p.to;
    const note = edit(st => swapIn(st, uniq([...from, ...to]), S, T));
    const what = to.length ? `Swapped with ${names(to)}, now on ${keyName(S)}` : `Moved from ${keyName(S)}`;
    showTip(t, { ...describe(t), note: note ? `${what} · ${note}` : what }, kbd ? 0 : 2600);
    t.classList.remove('is-landed');
    void t.offsetWidth;
    t.classList.add('is-landed');
    announce(`${names(from)} ${to.length ? `swapped with ${names(to)}` : 'moved'}: now on ${keyName(T)}.`);
  }
  // Pointer: mouse and pen drag at once; touch picks the key up after a 250 ms hold, so a
  // swipe still scrolls the page.
  function moveGhost(x, y) { // just above the pointer (higher for a finger), so the key underneath stays in sight
    const r = km.getBoundingClientRect();
    ghost.style.transform = `translate(${x - r.left}px, ${y - r.top}px) translate(-50%, calc(-100% - ${pd && pd.touch ? 44 : 18}px))`;
  }
  function lift() {
    if (!pd || drag) return;
    pd.on = true;
    startDrag(pd.el, false);
    ghost.classList.add('is-on');
    moveGhost(pd.lx, pd.ly);
    try { pd.el.setPointerCapture(pd.id); } catch (e) { /* the pointer is gone */ }
  }
  function onMove(e) {
    if (!pd || e.pointerId !== pd.id) return;
    pd.lx = e.clientX;
    pd.ly = e.clientY;
    if (!pd.on) {
      const d = Math.hypot(e.clientX - pd.x, e.clientY - pd.y);
      if (pd.touch) { if (d > 10) endPointer(); } else if (d > 4) lift();
      return;
    }
    moveGhost(e.clientX, e.clientY);
    const t = keyAt(e.clientX, e.clientY);
    setOver(t && t !== drag.src ? t : null);
  }
  function onUp(e) {
    if (!pd || e.pointerId !== pd.id) return;
    if (pd.on && drag) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      dropDrag();
    }
    endPointer();
  }
  function endPointer() {
    if (!pd) return;
    clearTimeout(pd.timer);
    try { pd.el.releasePointerCapture(pd.id); } catch (e) { /* not captured */ }
    removeEventListener('pointermove', onMove, true);
    removeEventListener('pointerup', onUp, true);
    removeEventListener('pointercancel', onCancel, true);
    pd = null;
  }
  function onCancel(e) { if (pd && e.pointerId === pd.id) { if (pd.on) endDrag(); endPointer(); } }
  km.addEventListener('pointerdown', e => {
    if (cap || pd || drag || e.button !== 0) return;
    const k = closest(e.target, '.km-key');
    if (!k || !draggable(k)) return;
    pd = { el: k, id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, touch: e.pointerType === 'touch', on: false };
    if (pd.touch) pd.timer = setTimeout(lift, 250);
    addEventListener('pointermove', onMove, true);
    addEventListener('pointerup', onUp, true);
    addEventListener('pointercancel', onCancel, true);
  });
  km.addEventListener('touchmove', e => { if (pd && pd.on) e.preventDefault(); }, { passive: false }); // no scrolling mid-drag
  km.addEventListener('contextmenu', e => { if (pd || drag) e.preventDefault(); });

  /* ---- Keyboard navigation: one tab stop for the keyboard, one for the mouse -------------- */
  function neighbour(el, key) {
    const a = el.g, ax = a.x + a.w / 2, ay = a.y + a.h / 2;
    const horiz = key === 'ArrowLeft' || key === 'ArrowRight', sign = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
    let best = null, bestScore = Infinity;
    for (const o of allKeys()) {
      if (o === el) continue;
      const b = o.g, dx = b.x + b.w / 2 - ax, dy = b.y + b.h / 2 - ay;
      const along = horiz ? dx : dy;
      // how far the other key's span is from this key's centre across the move, so wide keys are easy to reach
      const across = horiz ? Math.max(0, Math.abs(dy) - b.h / 2) : Math.max(0, Math.abs(dx) - b.w / 2);
      if (along * sign <= 0.05 || (horiz && across > 0.3)) continue;
      const score = Math.abs(along) * (horiz ? 1 : 3) + across + Math.abs(horiz ? dy : dx) * 0.01;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best;
  }
  const rove = el => { for (const o of el.classList.contains('km-mb') ? mouseKeys : keys) o.tabIndex = o === el ? 0 : -1; };
  const focusVisible = el => { try { return el.matches(':focus-visible'); } catch (e) { return true; } };

  /* ---- Events -------------------------------------------------------------------------------- */
  const closest = (node, sel) => (node instanceof Element ? node.closest(sel) : null);
  let touch = false, pointerIn = false;
  km.addEventListener('pointerdown', e => { touch = e.pointerType === 'touch'; });
  km.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') pointerIn = true; });
  km.addEventListener('pointerleave', () => { pointerIn = false; });
  km.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch' || drag || pd) return;
    const k = closest(e.target, '.km-key'), leg = closest(e.target, '.km-leg'), row = closest(e.target, '.km-row');
    if (k) { if (k === tipFor) clearTimeout(hideTimer); else showTip(k); }
    else if (leg) hlCat(leg.dataset.cat);
    else if (row) hlRow(row);
  });
  km.addEventListener('pointerout', e => {
    if (e.pointerType === 'touch' || drag) return;
    const from = closest(e.target, '.km-key, .km-leg, .km-row'), to = e.relatedTarget;
    if (!from || (to instanceof Node && from.contains(to))) return;
    if (from.classList.contains('km-key')) hideTip(120); else restore();
  });
  km.addEventListener('click', e => {
    if (suppressClick) return;
    const k = closest(e.target, '.km-key');
    if (k) { if (touch) (k === tipFor ? hideTip() : showTip(k)); return; }
    const opt = closest(e.target, '.km-seg button');
    if (opt) return choose(opt.parentElement.dataset.key, opt.dataset.v);
    if (closest(e.target, '.km-reset')) return resetLayout();
    if (closest(e.target, '.km-exp')) return exportFile();
    const x = closest(e.target, '.km-x');
    if (x) return removeKey(x.dataset.o, x.dataset.key);
    const ed = closest(e.target, '.km-chip, .km-add');
    if (ed) {
      if (cap && cap.el === ed) return stopCapture();
      if (stopped.el === ed && performance.now() - stopped.t < 600) return; // the tap that just cancelled it
      return startCapture(ed);
    }
    const leg = closest(e.target, '.km-leg');
    if (leg) {
      pinned = pinned === leg.dataset.cat ? null : leg.dataset.cat;
      syncControls();
      return touch ? restore() : hlCat(leg.dataset.cat); // a mouse is still hovering it
    }
    if (closest(e.target, '.km-more')) {
      const list = $('.km-list'), open = !list.classList.contains('is-open');
      list.classList.toggle('is-open', open);
      $('.km-more').setAttribute('aria-expanded', open);
    }
  });
  document.addEventListener('pointerdown', e => { if (tipFor && !closest(e.target, '#keymap .km-key')) hideTip(); });
  km.addEventListener('focusin', e => {
    const k = closest(e.target, '.km-key'), leg = closest(e.target, '.km-leg');
    if (k) { rove(k); if (drag && drag.kbd) setOver(k === drag.src ? null : k); else if (focusVisible(k)) showTip(k); }
    else if (leg && focusVisible(leg)) hlCat(leg.dataset.cat);
  });
  km.addEventListener('focusout', e => {
    if (drag && drag.kbd && !closest(e.relatedTarget, '#keymap .km-key')) cancelDrag(); // tabbed away
    if (closest(e.target, '.km-key') && !closest(e.relatedTarget, '.km-key')) hideTip();
    if (closest(e.target, '.km-leg') && !closest(e.relatedTarget, '.km-leg')) restore();
  });
  km.addEventListener('keydown', e => {
    const opt = closest(e.target, '.km-seg button'), k = closest(e.target, '.km-key'), chip = closest(e.target, '.km-chip');
    if (drag && drag.kbd) {
      if (/^Arrow/.test(e.key)) { e.preventDefault(); const n = neighbour(k || drag.src, e.key); if (n) n.focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (drag.over) dropDrag(); else cancelDrag(); }
      return;
    }
    if (e.key === 'Escape' && tipFor && !pressed.size) { e.preventDefault(); return hideTip(); } // not a press of Esc
    if (chip && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); return removeKey(chip.dataset.o, chip.dataset.key); }
    if (opt && /^Arrow/.test(e.key)) {
      const all = [...opt.parentElement.querySelectorAll('button')].filter(b => !b.hidden);
      const next = all[(all.indexOf(opt) + (/Left|Up/.test(e.key) ? all.length - 1 : 1)) % all.length];
      e.preventDefault();
      next.focus();
      choose(opt.parentElement.dataset.key, next.dataset.v);
    } else if (k && /^Arrow/.test(e.key)) {
      e.preventDefault();
      const next = neighbour(k, e.key);
      if (next) next.focus();
    } else if (k && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      if (draggable(k)) startDrag(k, true); else showTip(k);
    }
  });
  let lastW = innerWidth; // phones fire resize as their toolbars slide while scrolling; only a new width moves keys
  addEventListener('resize', () => {
    if (innerWidth === lastW) return;
    lastW = innerWidth;
    hideTip();
    km.querySelectorAll('.km-seg').forEach(placePill);
  });
  $('.km-kbwrap').addEventListener('scroll', () => hideTip(), { passive: true }); // tiny screens scroll the keyboard
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(() => km.querySelectorAll('.km-seg').forEach(placePill)); km.querySelectorAll('.km-seg').forEach(s => ro.observe(s)); }

  /* ---- Your keyboard: while the map is on screen, a key you press lights up on it -------- */
  const pressed = new Map(); // event code -> key on the map
  const SCROLLERS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const typing = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  let live = false;
  function liveKey(code) { // the key on the map for a key event (both left and right modifiers)
    const id = code === 'Backslash' ? '\\' : /^(Meta|OS)/.test(code) ? 'Win' : codeKey(code);
    const els = id ? keyEls(id) : [];
    return els.find(el => el.dataset.side === (/Right$/.test(code) ? 'R' : 'L')) || els[0] || null;
  }
  document.addEventListener('keydown', e => {
    if (!live || cap || drag || e.defaultPrevented || typing(e.target) || typing(document.activeElement)) return;
    if ((e.ctrlKey || e.metaKey) && !/^(Control|Meta|OS)/.test(e.code)) return; // a shortcut: leave it to the browser
    const el = liveKey(e.code);
    if (!el) return;
    const ae = document.activeElement, inside = km.contains(ae);
    if (inside && (e.key === ' ' || e.key === 'Enter') && !ae.classList.contains('km-key')) return; // a focused button uses these
    if (SCROLLERS.has(e.code) && (pointerIn || inside)) e.preventDefault(); // no scrolling while you're at the map
    if (e.repeat || pressed.has(e.code)) return;
    pressed.set(e.code, el);
    el.classList.add('is-down');
    showTip(el);
  });
  function unpress(code) {
    const el = pressed.get(code);
    if (!el) return;
    pressed.delete(code);
    if (![...pressed.values()].includes(el)) el.classList.remove('is-down');
    const last = [...pressed.values()].pop();
    if (last) showTip(last); else if (tipFor === el) hideTip(400);
  }
  document.addEventListener('keyup', e => unpress(e.code));
  addEventListener('blur', () => [...pressed.keys()].forEach(unpress));

  /* ---- Start: draw, then light the keys in a wave from WASD when scrolled into view ------- */
  buildBoard();
  apply();
  renderList(false);
  syncControls();
  const settle = () => km.classList.remove('is-static');
  requestAnimationFrame(() => requestAnimationFrame(settle));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      live = es[es.length - 1].intersectionRatio >= 0.4; // the latest, when a fast scroll queues several
      if (!live) [...pressed.keys()].forEach(unpress);
    }, { threshold: [0, 0.4] }).observe($('.km-stage'));
  } else live = true;
  if (reveal) {
    const io = new IntersectionObserver(entries => {
      if (!entries.some(en => en.isIntersecting)) return;
      io.disconnect();
      settle();
      void km.offsetWidth; // commit the unlit state first
      motion('is-revealing', 2000);
      km.classList.remove('is-pre');
    }, { threshold: 0.35 });
    io.observe(deck);
  }
})();
