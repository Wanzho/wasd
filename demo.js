/* wasdmod "Try it" demo: a tiny playable pixel-art dungeon.
   Keys and mouse drive a hooded hero while the HUD shows what you press and the
   controller input the game sees, using the mod's Recommended layout:
   W A S D = left stick, left click = X (in the air: heavy jump attack),
   right click = right-stick flick (dodge; drag to aim), Shift = LB (forward
   dodge), Space = A (jump). Everything is drawn in code: no assets, no network.
   It builds itself inside #demo and does nothing when the page has no #demo. */
(function () {
  'use strict';

  var W = 320, H = 180, WALL = 36;                         // internal resolution, back wall height
  var BX0 = 10, BX1 = W - 10, BY0 = WALL + 10, BY1 = H - 5; // where the hero's feet may go
  var SPEED = 74, ROLL_T = 0.3, ROLL_V = 178, SWING_T = 0.24, JUMP_V = 190, GRAV = 580, BLOB_G = 300;
  var REACH = 23;                                    // sword reach = outer radius of the white swing crescent
  var LEVELS = { easy: [3, 2.2, 3.4], normal: [5, 1, 2.1], hard: [9, 0.4, 0.85] };   // blobs at once, spawn gap s
  var IDLE_MS = 8000, DRAG_PX = 24, TAU = Math.PI * 2, SQ = 0.64;   // SQ: y squash of the 3/4 view
  var CODES = { KeyW: 'w', ArrowUp: 'w', KeyA: 'a', ArrowLeft: 'a', KeyS: 's', ArrowDown: 's', KeyD: 'd', ArrowRight: 'd',
    Space: 'space', KeyF: 'f', ShiftLeft: 'shift', ShiftRight: 'shift', KeyR: 'r', KeyQ: 'q',
    Digit1: '1', Digit2: '2', Digit3: '3', Numpad1: '1', Numpad2: '2', Numpad3: '3' };
  var MBTN = ['ml', 'mm', 'mr', 'm4', 'm5'], MBIT = [1, 4, 2, 8, 16];   // mouse buttons: left, middle, right, side 4, side 5
  var MOVE = { w: 1, a: 1, s: 1, d: 1 }, SKEY = { k1: 0, k2: 1, k3: 2 };
  // The mod's two built-in layouts, as far as the demo goes: the key for each action, plus extra keys.
  // jump = A, attack = X, fwd = LB (forward dodge), roll = right stick (directional dodge), bow = RT, k1-3 = Y B RB.
  var LAYOUTS = {
    rec: { name: 'Recommended', main: { jump: 'space', attack: 'ml', fwd: 'shift', roll: 'mr', bow: 'm4', k1: 'q', k2: '2', k3: '3' },
      also: { f: 'jump', 1: 'k1' } },
    off: { name: 'Official layout', main: { jump: 'space', attack: 'ml', fwd: 'm5', roll: 'r', bow: 'mr', k1: '1', k2: '2', k3: '3' },
      also: { m4: 'roll' } }
  };
  Object.keys(LAYOUTS).forEach(function (id) {       // bind: key or button -> action
    var L = LAYOUTS[id], a;
    L.bind = {};
    for (a in L.main) L.bind[L.main[a]] = a;
    for (a in L.also) L.bind[a] = L.also[a];
  });
  // Skills on 1 2 3 (the mod puts the artifact slots on Y, B and RB). All of them aim themselves.
  var SKILLS = [{ cd: 2.5, pad: 'y', c: '#7fe0ff' }, { cd: 6, pad: 'b', c: '#a9dcff' }, { cd: 10, pad: 'rb', c: '#ff9a2e' }];
  var DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]; // 8 ways, y down

  var root, cv, ctx, ui = {}, reduced = false;
  var T = 0;                                    // game clock in seconds; only runs with the loop
  var mode = 'auto', lastInput = 0, score = 0;
  var held = {}, bot = {}, botUntil = {}, flash = {}, down = {}, tdir = -1;
  var pad = { lx: 0, ly: 0, rx: 0, ry: 0, flick: 0 };
  var hero, blobs = [], parts = [], rings = [], splats = [], ghosts = [], flashes = [], spawnT = 0.4;
  var skReady = [0, 0, 0], skUsed = [-9, -9, -9], bolts = [], frosts = [], meteors = [], level = 'normal';
  var drag = null, touch = null, lastTouch = 0, mbtn = {}, layout = 'rec';
  var bowBy = null, aimPt = { x: 230, y: 100 }, arrows = [];   // who holds the bow, where it aims (game px)
  var visible = true, onscreen = true, raf = 0, last = 0, shake = 0, hitstop = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function octant(dx, dy) { return (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8; }
  function faceOf(x, y) { return Math.abs(x) >= Math.abs(y) * 0.85 ? (x > 0 ? 2 : 3) : (y > 0 ? 0 : 1); }
  function angDiff(a, b) { var d = (a - b) % TAU; return Math.abs(d > Math.PI ? d - TAU : d < -Math.PI ? d + TAU : d); }
  function hash(a, b, c) { var s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s); }
  function seeded(s) {          // mulberry32
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- art: everything is drawn in code ---------- */

  // Hero: an original hooded adventurer, 12x16. Rows 0-12 are the body, then 3 rows of legs.
  var PAL = { K: '#1a1320', O: '#f19a2e', o: '#b35a1c', L: '#ffcf70', F: '#f2c29b', f: '#c98f6e',
    E: '#2a1a24', T: '#3d6f8f', t: '#284a63', B: '#6b4127', Y: '#ffd76a', P: '#4a3a46', p: '#2a2027' };
  var BODY = [
    ['.....KK.....', '....KOOK....', '...KOOOLK...', '..KOOOOOLK..', '.KOOOOOOOOK.', '.KOoKKKKoOK.', '.KoKFFFFKoK.',
      '.KoKEFFEKoK.', 'KOOKfFFfKOOK', 'KOOoTTTToOOK', 'KOTBBYYBBTOK', 'KOTTTTTTTTOK', 'KooTTttTTooK'],
    ['.....KK.....', '....KOLK....', '...KOOLOK...', '..KLOOLOoK..', '.KLOOOLOOoK.', '.KOOOOLOOoK.', '.KoOOOOOooK.',
      '.KooOOOOooK.', 'KOOKooooKOoK', 'KLOOOoOOOOoK', 'KLOOOoOOOooK', 'KOOOOoOOOooK', 'KooooooooooK'],
    ['....KKK.....', '...KOOOKK...', '..KOOOOOLK..', '.KOOOOOOOLK.', '.KOOOOOOOOK.', 'KOOOOOoKKKK.', 'KOOOOoKFFFK.',
      'KoOOOoKFFEK.', 'KooOOOKfFFK.', 'KooOOTTTTK..', '.KoOOBBYBK..', '.KoOOTTTTK..', '.KooOTTttK..']
  ];
  var LEGS = [   // per facing: stand, step A, step B
    [['.KKPPKKPPKK.', '..KPPKKPPK..', '..KppKKppK..'], ['.KKPPKKPPKK.', '..KPPKKppK..', '..KppK......'],
      ['.KKPPKKPPKK.', '..KppKKPPK..', '......KppK..']],
    null,
    [['...KPPKPPK..', '...KPPKPPK..', '...KppKpppK.'], ['...KPPPPK...', '..KPPKKPPK..', '.KppK..KpppK'],
      ['...KPPKPPK..', '...KPPKppK..', '...KppK.....']]
  ];
  LEGS[1] = LEGS[0];
  var BALL = ['...KKKK...', '.KKLOOOKK.', '.KLOOOOOK.', 'KLOOOOOOoK', 'KOOoTToOoK', 'KOoTTttoOK', 'KOOottoOoK',
    '.KoOOOOoK.', '.KKooooKK.', '...KKKK...'];
  var TORCHES = [[48, 17], [160, 17], [272, 17]];
  var BLOB = { K: '#1d0f33', d: '#5a2fb0', m: '#8a55e8', l: '#b48cff', g: '#f4ecff' };
  var ICE = { K: '#1b3550', d: '#5b9bd5', m: '#9fd3f5', l: '#d8f1ff', g: '#ffffff' };   // a frozen blob
  var POPS = {       // how a blob goes: particle colours, puff of light, stain colours
    goo: [[BLOB.l, BLOB.m, BLOB.m, BLOB.d, BLOB.g], [170, 120, 255], [BLOB.m, BLOB.d, '#341a63']],
    zap: [[BLOB.l, BLOB.m, '#bff4ff', '#7fe0ff', BLOB.g], [140, 220, 255], [BLOB.m, BLOB.d, '#341a63']],
    fire: [[BLOB.m, BLOB.d, '#ffd34d', '#ff9a2e', '#e8541e'], [255, 150, 60], ['#2a1a16', '#120d10', BLOB.d]],
    ice: [['#ffffff', '#d8f1ff', '#9fd3f5', '#5b9bd5'], [160, 210, 255], ['#9fd3f5', '#5b9bd5', '#d8f1ff']]
  };
  var METEOR = ['...yyy...', '..yoooy..', '.yoKKKoy.', 'yoKKrKKoy', 'yoKrrrKoy', 'yoKKrKKoy', '.yoKKKoy.', '..yoooy..', '...yyy...'];
  var ICONS = [      // skill icons, 12x12: Spark Bolt, Frost Ring, Ember Fall
    ['......KKKK..', '.....KwccK..', '....KwccK...', '...KwccK....', '..KwccKKKK..', '.KwcccccbK..', '.KKKKccbK...',
      '....KcbK....', '...KcbK.....', '..KcbK......', '..KbK.......', '..KK........'],
    ['.....KK.....', '..K.KwwK.K..', '.KwKKiiKKwK.', '..KiKwwKiK..', '.KKKwiiwKKK.', 'KwiwibbiwiwK', 'KwiwibbiwiwK',
      '.KKKwiiwKKK.', '..KiKwwKiK..', '.KwKKiiKKwK.', '..K.KwwK.K..', '.....KK.....'],
    ['..........yy', '.........yo.', '.......yyor.', '......yoor..', '...KKKoor...', '..KrrrKr....', '.KrwyorK....',
      '.KryyorK....', '.KroordK....', '..KrrdK.....', '...KKK......', '............'],
    ['.K..........', 'KwKK....KKK.', '.KwwK.KKoooK', '.KwyKKorrKiK', '..KKyorKKiK.', '...KoyKKiK..', '..KorKyiK...',   // bow
      '..KrKKiyK...', '.KorKiKKyKK.', '.KoKiK..KyrK', '.KoiK...KrdK', '..KK.....KK.']
  ];
  var IPAL = { K: '#16182a', w: '#ffffff', c: '#7fe0ff', b: '#2f8fd0', i: '#bfe6ff', y: '#ffd34d', o: '#ff9a2e',
    r: '#e8541e', d: '#7a2a14' };
  var art = {}, blobCache = {};

  function paint(rows, pal) {
    var c = mk(rows[0].length, rows.length), g = c.getContext('2d');
    rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) if (row[x] !== '.') { g.fillStyle = pal[row[x]]; g.fillRect(x, y, 1, 1); }
    });
    return c;
  }
  function flipped(src) {
    var c = mk(src.width, src.height), g = c.getContext('2d');
    g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
    return c;
  }
  function tinted(src, col, a) {
    var c = mk(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = col;
    g.fillRect(0, 0, src.width, src.height);
    return c;
  }
  function rot90(rows) {
    var n = rows.length, out = [];
    for (var y = 0; y < n; y++) { var s = ''; for (var x = 0; x < n; x++) s += rows[n - 1 - x][y]; out.push(s); }
    return out;
  }
  function makeSprites() {
    art.hero = []; art.hurt = [];
    for (var f = 0; f < 4; f++) {                     // facings: down, up, right, left (mirrored right)
      art.hero[f] = []; art.hurt[f] = [];
      for (var s = 0; s < 3; s++) {
        var img = paint(BODY[f === 3 ? 2 : f].concat(LEGS[f === 3 ? 2 : f][s]), PAL);
        if (f === 3) img = flipped(img);
        art.hero[f][s] = img;
        art.hurt[f][s] = tinted(img, '#ff3b3b', 0.65);
      }
    }
    art.ball = []; art.ghost = [];
    for (var r = 0, rows = BALL; r < 4; r++, rows = rot90(rows)) {
      art.ball[r] = paint(rows, PAL);
      art.ghost[r] = tinted(art.ball[r], '#9fe3ff', 0.85);
    }
    art.meteor = paint(METEOR, { y: '#ffd34d', o: '#ff8a2e', K: '#3a2418', r: '#ff3d1e' });
    art.icons = ICONS.map(function (rows) { return paint(rows, IPAL); });
  }

  // Blob body for a given squash (w x h, w even): dome on a flat base, outline, three bands, gloss.
  // mode 0 normal, 1 white (hit flash), 2 frozen.
  function blobImg(w, h, mode) {
    var key = w + 'x' + h + 'm' + mode, P = mode === 2 ? ICE : BLOB, white = mode === 1;
    if (blobCache[key]) return blobCache[key];
    var c = mk(w + 2, h + 2), g = c.getContext('2d'), cx = (w + 2) / 2;
    function half(r, ww, hh) {                        // gumdrop: a dome that is widest near its base
      var v = (r + 0.5) / hh;
      var k = v < 0.72 ? Math.sqrt(1 - Math.pow((0.72 - v) / 0.72, 2)) : 1 - Math.pow((v - 0.72) / 0.28, 2) * 0.12;
      return Math.round(ww / 2 * k);
    }
    var r, hw;
    for (r = 0; r < h + 2; r++) { hw = half(r, w + 2, h + 2); g.fillStyle = P.K; g.fillRect(cx - hw, r, hw * 2, 1); }
    for (r = 0; r < h; r++) {
      hw = half(r, w, h);
      g.fillStyle = white ? '#ffffff' : r < h * 0.28 ? P.l : r > h * 0.74 ? P.d : P.m;
      g.fillRect(cx - hw, r + 1, hw * 2, 1);
    }
    if (!white) {
      g.fillStyle = P.g;
      var gx = Math.round(cx - w * 0.24), gy = 1 + Math.round(h * 0.2);
      g.fillRect(gx, gy, 2, 1); g.fillRect(gx - 1, gy + 1, 1, 1);
      if (mode === 2) g.fillRect(Math.round(cx + w * 0.22), 2 + Math.round(h * 0.4), 1, 2);   // ice glint
    }
    return (blobCache[key] = c);
  }

  function makeBackground() {
    var c = mk(W, H), g = c.getContext('2d'), r = seeded(20261006);
    function px(x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
    function rgb(b, k) { return 'rgb(' + Math.round(b[0] * k) + ',' + Math.round(b[1] * k) + ',' + Math.round(b[2] * k) + ')'; }
    // One stone with bevels, grain, chips, maybe a crack or moss. L(y)/R(y) give its edges per pixel row,
    // so the same code draws wall bricks (rectangles) and floor tiles (perspective trapezoids).
    function slab(y, h, L, R, base, mossy) {
      var yy, a, b, i, n;
      for (yy = y; yy < y + h - 1; yy++) {
        a = L(yy); b = R(yy);
        px(a, yy, b - a, 1, rgb(base, yy === y ? 1.2 : yy === y + h - 2 ? 0.78 : 1));
        px(a, yy, 1, 1, rgb(base, 1.1)); px(b - 1, yy, 1, 1, rgb(base, 0.84));
      }
      for (i = 0, n = ((R(y) - L(y)) * h / 7) | 0; i < n; i++) {
        var q = r();
        yy = y + 1 + ((r() * (h - 3)) | 0); a = L(yy); b = R(yy);
        px(a + 1 + ((r() * (b - a - 3)) | 0), yy, q < 0.1 ? 2 : 1, 1, rgb(base, q < 0.12 ? 0.7 : q > 0.93 ? 1.24 : 0.88 + r() * 0.22));
      }
      if (r() < 0.35) px(L(y), y, 1, 1, '#0f0d14');    // chipped corners
      if (r() < 0.35) px(R(y + h - 2) - 1, y + h - 2, 1, 1, '#0f0d14');
      if (r() < 0.22) {                                // crack
        yy = y + 1 + ((r() * (h - 4)) | 0);
        var cx = L(yy) + 2 + ((r() * (R(yy) - L(yy) - 5)) | 0);
        for (i = 0, n = 3 + ((r() * 6) | 0); i < n; i++) {
          px(cx, yy, 1, 1, rgb(base, 0.55)); px(cx + 1, yy, 1, 1, rgb(base, 1.14));
          cx += r() < 0.5 ? 1 : -1; yy += r() < 0.75 ? 1 : 0;
          if (cx <= L(yy) || cx >= R(yy) - 2 || yy >= y + h - 2) break;
        }
      }
      if (r() < mossy) {                               // moss along an edge
        yy = r() < 0.5 ? y : y + h - 3;
        var mx = L(yy) + ((r() * (R(yy) - L(yy) - 4)) | 0);
        for (i = 0, n = 4 + ((r() * 6) | 0); i < n; i++) {
          px(mx + ((r() * 5) | 0), yy + ((r() * 3) | 0), 1, 1, ['#3e5c34', '#4f7341', '#2f4a2a', '#65894a'][(r() * 4) | 0]);
        }
      }
    }
    function stone(x, y, w, h, base, mossy) { slab(y, h, function () { return x; }, function () { return x + w - 1; }, base, mossy); }
    function gx(c, yy) { return Math.round(160 + (c * 22 - 11) * (0.8 + 0.2 * (yy - WALL) / (H - WALL))); }   // grout lines converge
    function tile(c, y, h, base, mossy) {
      slab(y, h, function (yy) { return gx(c, yy); }, function (yy) { return gx(c + 1, yy) - 1; }, base, mossy);
    }
    var x, y, row, w, l, sh, tone, rows = [], TONES = [[66, 68, 84], [66, 68, 84], [74, 70, 80], [56, 58, 72]];
    px(0, 0, W, H, '#0f0d14');
    for (row = 0, y = WALL; y < H; row++, y += sh) {   // floor tiles in perspective; rows grow toward the viewer
      sh = 10 + Math.min(5, (row * 0.6) | 0);
      rows.push([y, sh]);
      for (var col = -9; col <= 9; col++) {
        l = 0.84 + r() * 0.26; tone = TONES[(r() * 4) | 0];
        tile(col, y, sh, [tone[0] * l, tone[1] * l, tone[2] * l], row < 2 ? 0.45 : 0.1);
      }
    }
    for (var d = 0; d < 7; d++) {                       // floor details: drain grates, puddles, rubble by the wall
      x = [-4, 3, 118, 206, 30, 150, 286][d]; y = [9, 3, 160, 128, WALL + 1, WALL + 1, WALL + 1][d];
      if (d < 2) {                                     // a grate set into tile x of row y
        var gy = rows[y][0] + 2, gh = rows[y][1] - 5, ga = gx(x, gy + 3) + 3, gw = gx(x + 1, gy + 3) - 4 - ga;
        px(ga - 1, gy - 1, gw + 2, gh + 2, '#2c2932'); px(ga - 1, gy - 1, gw + 2, 1, '#4d4955'); px(ga, gy, gw, gh, '#060509');
        for (var gb = ga + 2; gb < ga + gw - 1; gb += 3) px(gb, gy, 1, gh, '#3d3a45');
      } else if (d < 4) {
        px(x + 2, y, 9, 1, '#1d2233'); px(x, y + 1, 13, 1, '#1d2233'); px(x + 1, y + 2, 11, 1, '#171b29');
        px(x + 3, y + 1, 3, 1, '#56648a'); px(x + 8, y + 2, 2, 1, '#3a4562');
      } else {
        for (var rb = 0; rb < 6; rb++) {
          var rw = 1 + ((r() * 3) | 0), rx = x + ((r() * 14) | 0), ry = y + ((r() * 3) | 0);
          px(rx, ry, rw, 2, '#4a4552'); px(rx, ry, rw, 1, '#6d6878');
        }
      }
    }
    for (row = 0, y = 0; y < WALL - 5; row++, y += 8) { // wall bricks, warmer than the floor
      for (x = row % 2 ? -9 : -((r() * 6) | 0); x < W; x += w) {
        w = [14, 16, 18, 20][(r() * 4) | 0]; l = 0.82 + r() * 0.3;
        stone(x, y, w, 8, [86 * l, 74 * l, 80 * l], row === 3 ? 0.3 : 0.05);
      }
    }
    for (y = 0; y < 10; y++) px(0, y, W, 1, 'rgba(6,4,12,' + (0.5 - y * 0.05) + ')');   // ceiling shadow
    for (x = -4; x < W; x += w) {                       // plinth with a lit top edge
      w = 24 + ((r() * 10) | 0);
      stone(x, WALL - 5, w, 6, [66, 58, 70], 0.2);
      px(x, WALL - 5, w - 1, 1, '#8c8296');
    }
    for (y = 0; y < 8; y++) px(0, WALL + 1 + y, W, 1, 'rgba(5,3,10,' + (0.62 - y * 0.08) + ')');
    for (var b = 0; b < 2; b++) {                       // two hanging banners between the torches
      x = b ? 211 : 99;
      px(x - 1, 3, 12, 1, '#3a2a20'); px(x - 1, 2, 1, 3, '#2a1d16'); px(x + 10, 2, 1, 3, '#2a1d16');
      px(x, 4, 10, 17, '#6e2638'); px(x, 4, 1, 17, '#86304a'); px(x + 8, 4, 2, 17, '#521b2a');
      for (var t = 0; t < 4; t++) { px(x + t, 21 + t, 5 - t, 1, '#6e2638'); px(x + 5, 21 + t, 5 - t, 1, '#521b2a'); }
      px(x + 4, 9, 2, 1, '#e8b83a'); px(x + 3, 10, 4, 1, '#e8b83a'); px(x + 2, 11, 6, 1, '#ffd76a');
      px(x + 3, 12, 4, 1, '#c99a2a'); px(x + 4, 13, 2, 1, '#c99a2a');
    }
    TORCHES.forEach(function (tp) {                    // iron sconces
      var tx = tp[0], ty = tp[1];
      px(tx - 2, ty, 5, 2, '#3c3843'); px(tx - 2, ty, 5, 1, '#5a5562'); px(tx - 1, ty + 2, 3, 1, '#2a2730');
      px(tx, ty + 3, 1, 4, '#2a2730'); px(tx - 1, ty + 7, 3, 3, '#24212b'); px(tx - 1, ty + 7, 3, 1, '#3c3843');
    });
    for (var p = 0; p < 26; p++) {                      // pebbles
      x = (r() * W) | 0; y = WALL + 2 + ((r() * (H - WALL - 4)) | 0);
      px(x, y, 1 + ((r() * 2) | 0), 1, r() < 0.5 ? '#6d6878' : '#4a4654');
    }
    return c;
  }

  /* ---------- DOM ---------- */

  function item(inner, cap, cls) { return '<div class="wd-item' + (cls || '') + '">' + inner + '<span class="wd-cap">' + cap + '</span></div>'; }
  function key(k, label, cls) { return '<b class="wd-k' + (cls || '') + '" data-k="' + k + '">' + label + '</b>'; }
  function seg(cls, label, opts) {                   // a pill of toggle buttons (layout, difficulty)
    return '<div class="wd-pill wd-seg ' + cls + '" role="group" aria-label="' + label + '">' + opts.map(function (o) {
      return '<button type="button" data-v="' + o[0] + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function pressRow() {                              // "You press" for the chosen layout
    var rec = layout === 'rec';
    return item('<div class="wd-wasd">' + key('w', 'W', ' wd-w') + key('a', 'A') + key('s', 'S') + key('d', 'D') + '</div>', 'Move', ' wd-move') +
      (rec ? item(key('shift', 'Shift', ' wd-act wd-shift'), 'Dodge') : item(key('r', 'R', ' wd-act'), 'Roll')) +
      item(key('space', 'Space', ' wd-act wd-space'), 'Jump') + '<i class="wd-br"></i>' +
      item('<div class="wd-three">' + key(rec ? 'q' : '1', rec ? 'Q' : '1', ' wd-act') + key('2', '2', ' wd-act') +
        key('3', '3', ' wd-act') + '</div>', 'Skills') +
      item('<div class="wd-mouse"><i data-k="ml"></i><i data-k="mr"></i><i class="wd-side wd-s5" data-k="m5"></i>' +
        '<i class="wd-side wd-s4" data-k="m4"></i></div>', rec ? 'Attack · Roll<br>Side 4: Bow' : 'Attack · Bow<br>Side 4 Roll · 5 Dodge', ' wd-mitem');
  }
  function build() {
    root.innerHTML =
      '<div class="wd-frame"><div class="wd-stage">' +
      '<canvas class="wd-canvas" width="' + W + '" height="' + H + '" role="img"></canvas>' +
      '<div class="wd-pill wd-badge" aria-hidden="true"><i class="wd-dot"></i><span>Demo</span></div>' +
      '<div class="wd-pill wd-score" aria-hidden="true"><span>Blobs:</span><b>0</b></div>' +
      '<div class="wd-pill wd-cta" aria-hidden="true"><span class="wd-desk">Press <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd>' +
      '<kbd>D</kbd> or click to play</span><span class="wd-touch">Tap to play, drag to move</span></div>' +
      '<div class="wd-skills" aria-hidden="true">' + SKILLS.map(function (s, i) {
        return '<div class="wd-sk" style="--c:' + s.c + '"><canvas width="12" height="12"></canvas><b>' + (i + 1) + '</b></div>';
      }).join('') + '<div class="wd-sk wd-bowsk" style="--c:#ffd34d"><canvas width="12" height="12"></canvas></div></div>' +
      '<div class="wd-opts">' + seg('wd-layout', 'Key layout', [['rec', 'Recommended'], ['off', 'Official<span class="wd-long"> layout</span>']]) +
      seg('wd-level', 'How many blobs', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]) + '</div>' +
      '</div><div class="wd-hud" aria-hidden="true">' +
      '<div class="wd-group"><div class="wd-title">You press</div><div class="wd-row wd-press"></div></div><div class="wd-arrow"></div>' +
      '<div class="wd-group"><div class="wd-title">Game sees</div><div class="wd-row">' +
      item('<div class="wd-stick" data-p="ls"><i class="wd-knob"></i></div>', 'Move') +
      item('<b class="wd-pb wd-lb" data-p="lb">LB</b>', 'Dodge') +
      item('<b class="wd-pb" data-p="a">A</b>', 'Jump') + '<i class="wd-br"></i>' +
      item('<div class="wd-three"><b class="wd-pb wd-y" data-p="y">Y</b><b class="wd-pb wd-b" data-p="b">B</b>' +
        '<b class="wd-pb wd-lb" data-p="rb">RB</b></div>', 'Skills') +
      item('<b class="wd-pb wd-x" data-p="x">X</b>', 'Attack') +
      item('<b class="wd-pb wd-lb wd-rt" data-p="rt">RT</b>', 'Bow') +
      item('<div class="wd-stick wd-rs" data-p="rs"><i class="wd-knob"></i></div>', 'Roll') +
      '</div></div></div></div>';
    cv = root.querySelector('canvas');
    ctx = cv.getContext('2d');
    ui.badge = root.querySelector('.wd-badge span');
    ui.score = root.querySelector('.wd-score b');
    ui.arrow = root.querySelector('.wd-arrow');
    ui.press = root.querySelector('.wd-press');
    ui.hud = root.querySelector('.wd-hud');
    ui.opts = root.querySelector('.wd-opts');
    ui.sk = Array.prototype.slice.call(root.querySelectorAll('.wd-sk'));
    ui.sk.forEach(function (el, i) {                 // pixel icons; on touch screens the slots can be tapped
      el.firstChild.getContext('2d').drawImage(art.icons[i], 0, 0);
      el.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'mouse') return;
        takeOver();
        if (i === 3) {
          try { el.setPointerCapture(e.pointerId); } catch (err) { /* lifting outside the slot still fires below */ }
          bowStart('touch'); return;
        }
        flash[LAYOUTS[layout].main['k' + (i + 1)]] = T + 0.15; skill(i);
      });
    });
    ['pointerup', 'pointercancel'].forEach(function (t) {   // the touch bow fires when the finger lifts
      ui.sk[3].addEventListener(t, function () { if (bowBy === 'touch') bowRelease(); });
    });
    ui.segs = {};
    [['wd-layout', setLayout], ['wd-level', setLevel]].forEach(function (s) {
      var bs = ui.segs[s[0]] = Array.prototype.slice.call(root.querySelectorAll('.' + s[0] + ' button'));
      bs.forEach(function (b) {
        b.addEventListener('click', function (e) { s[1](b.getAttribute('data-v'), true); if (e.detail) b.blur(); });
      });
    });
  }
  function collect() {                               // find the lights after (re)building "You press"
    ui.keys = {}; ui.pad = {}; ui.items = [];
    Array.prototype.forEach.call(root.querySelectorAll('[data-k]'), function (el) { ui.keys[el.getAttribute('data-k')] = el; });
    Array.prototype.forEach.call(root.querySelectorAll('[data-p]'), function (el) { ui.pad[el.getAttribute('data-p')] = el; });
    Array.prototype.forEach.call(root.querySelectorAll('.wd-item'), function (el) {
      ui.items.push({ el: el, lights: el.querySelectorAll('[data-k],[data-p]') });
    });
    ui.lknob = ui.pad.ls.firstChild;
    ui.rknob = ui.pad.rs.firstChild;
    ui.rscap = ui.pad.rs.parentNode.querySelector('.wd-cap');
  }
  function pick(cls, v) {
    ui.segs[cls].forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === v)); });
  }
  function remember(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } }
  function setLevel(l, save) {                       // Easy / Normal / Hard: how many blobs, how fast they come
    if (!LEVELS[l]) return;
    level = l; pick('wd-level', l);
    if (save) remember('wasdmod-demo-level', l);
  }
  function setLayout(l, save) {                      // Recommended / Official layout: which keys do what
    if (!LAYOUTS[l]) return;
    layout = l; pick('wd-layout', l);
    ui.press.innerHTML = pressRow();
    collect();
    SKILLS.forEach(function (s, i) { ui.sk[i].lastChild.textContent = K('k' + (i + 1)).toUpperCase(); });
    releaseAll(); bot = {}; botUntil = {}; ai.drag = null;
    cv.setAttribute('aria-label', 'Playable demo: a hooded hero fights purple blobs in a torch-lit dungeon, using wasdmod’s ' +
      LAYOUTS[l].name + (l === 'rec' ? '. W A S D move, Space jumps, left click attacks, right click rolls (drag to roll ' +
      'that way), Shift dodges forward, side button 4 draws the bow, Q 2 3 use skills.' : '. W A S D move, Space jumps, left ' +
      'click attacks, right click draws the bow and aims at the cursor, R or side button 4 rolls, side button 5 dodges ' +
      'forward, 1 2 3 use skills.') + ' The panel below shows the keys you press turning into the controller input the game sees.');
    if (save) remember('wasdmod-demo-layout', l);
    sized.w = 0; sized();
  }

  /* ---------- HUD ---------- */

  function lit(el, v) { if (el._on !== v) { el._on = v; el.classList.toggle('on', v); } }
  function pressed(k) { return !!(mode === 'player' ? held[k] : bot[k]) || flash[k] > T; }
  function act(a) {                                  // is a key or button for action a down (visitor or autopilot)?
    var b = LAYOUTS[layout].bind;
    for (var k in b) if (b[k] === a && pressed(k)) return true;
    return false;
  }
  function dragStick() {                             // while a roll button is dragged, the right stick follows it
    if (drag && mode === 'player') {                 // grows with the distance; full past the threshold, then
      if (drag.on) return [drag.dx, drag.dy];        // points where the roll will go (the last way past it)
      var k = Math.min(1, (drag.l || 0) / DRAG_PX);
      return k > 0.08 ? [drag.vx * k, drag.vy * k] : null;
    }
    var g = ai.drag;
    if (g && mode === 'auto') { var p = Math.min(1, (T - g.t0) / (g.dur * 0.8)); return [g.ux * p, g.uy * p]; }
    return null;
  }
  function aimDir() {                                // unit vector from the hero's bow to the crosshair
    var h = hero, dx = aimPt.x - h.x, dy = aimPt.y - (h.y - 8 - h.z), l = Math.hypot(dx, dy);
    return l > 1 ? [dx / l, dy / l] : [h.fx, h.fy];
  }
  function knob(el, x, y) {                          // travel radius is measured once per layout change
    var r = el._r || (el._r = (el.parentNode.clientWidth - el.offsetWidth) / 2) || 13;
    var s = 'translate(' + (x * r).toFixed(1) + 'px,' + (y * r).toFixed(1) + 'px)';
    if (el._t !== s) { el._t = s; el.style.transform = s; }
  }
  function hud() {
    var k, any = false, mag = Math.hypot(pad.lx, pad.ly), fl = T < pad.flick, bow = !!hero.bow, ad = bow ? aimDir() : null;
    var ds = bow || fl ? null : dragStick();
    if (ds) ad = ds;                                 // the knob follows the drag (lighter), then flicks on release
    if (ui.pad.rs._drag !== !!ds) { ui.pad.rs._drag = !!ds; ui.pad.rs.classList.toggle('drag', !!ds); }
    for (k in ui.keys) lit(ui.keys[k], pressed(k));
    lit(ui.pad.ls, mag > 0.12);
    lit(ui.pad.rs, fl || bow || !!ds);
    lit(ui.pad.a, act('jump'));
    lit(ui.pad.x, act('attack'));
    lit(ui.pad.lb, act('fwd'));
    lit(ui.pad.rt, bow || act('bow'));
    knob(ui.lknob, pad.lx, pad.ly);
    knob(ui.rknob, bow || ds ? ad[0] : fl ? pad.rx : 0, bow || ds ? ad[1] : fl ? pad.ry : 0);
    if (ui._bow !== bow) {                           // drawing the bow: WASD can't move you, the right stick aims
      ui._bow = bow;
      root.classList.toggle('wd-aiming', bow);
      root.classList.toggle('wd-cursor', bow && bowBy === 'mouse');
      ui.rscap.textContent = bow ? 'Aim' : 'Roll';
    }
    SKILLS.forEach(function (s, i) {                 // Y B RB, and the skill bar's cooldown sweep
      lit(ui.pad[s.pad], act('k' + (i + 1)));
      var el = ui.sk[i], cd = Math.max(0, skReady[i] - T) / s.cd, v = cd.toFixed(2);
      if (el._cd !== v) {
        if (+el._cd > 0 && !cd && !reduced && el.animate) {   // ready again: a little flash
          el.animate([{ transform: 'scale(1.2)', boxShadow: '0 0 0 0 ' + s.c }, { transform: 'none', boxShadow: '0 0 0 9px transparent' }], 450);
        }
        el._cd = v; el.style.setProperty('--cd', v);
      }
      lit(el, T - skUsed[i] < 0.3);
    });
    lit(ui.sk[3], bow && bowBy === 'touch');
    ui.items.forEach(function (it) {
      var v = false;
      for (var i = 0; i < it.lights.length; i++) v = v || !!it.lights[i]._on;
      lit(it.el, v);
      any = any || v;
    });
    lit(ui.arrow, any);
  }
  function setScore() {
    ui.score.textContent = String(score);
    if (score && !reduced && ui.score.animate) ui.score.animate([{ transform: 'scale(1.35)' }, { transform: 'none' }], 220);
  }
  function sized() {                                 // layout follows the demo's own width: measure what fits
    var w = root.clientWidth, cl = root.classList, hud = ui.hud;
    if (w === sized.w) return;
    sized.w = w;
    cl.toggle('wd-small', w < 500);
    cl.toggle('wd-tiny', w < 330);
    cl.add('wd-fit'); cl.remove('wd-narrow', 'wd-stack', 'wd-two', 'wd-optrow');   // full size, else compact,
    if (hud.scrollWidth > hud.clientWidth) cl.add('wd-narrow');          // else stacked, else two lines per group
    if (hud.scrollWidth > hud.clientWidth) cl.add('wd-stack');
    if (hud.scrollWidth > hud.clientWidth) cl.add('wd-two');
    cl.remove('wd-fit');
    if (ui.opts.offsetWidth + 300 > w) cl.add('wd-optrow');   // no room between badge and score: a row below
    ui.lknob._r = ui.rknob._r = 0;
  }

  /* ---------- modes ---------- */

  function takeOver() {
    lastInput = performance.now();
    if (mode === 'player') return;
    mode = 'player';
    bot = {}; botUntil = {}; ai.slam = false; ai.drag = null; skReady = [T, T, T];   // all three skills ready to try
    if (bowBy === 'bot') { hero.bow = null; bowBy = null; }
    score = 0; setScore();
    root.classList.add('wd-playing');
    ui.badge.textContent = 'You’re playing';
    schedule();
  }
  function giveBack() {
    mode = 'auto';
    releaseAll(); flash = {};
    root.classList.remove('wd-playing');
    ui.badge.textContent = 'Demo';
    if (reduced) { render(); hud(); }
    schedule();
  }
  function releaseAll() {
    down = {}; tdir = -1; drag = null; touch = null; held = {}; mbtn = {};
    if (hero && hero.bow) { hero.bow = null; bowBy = null; }
  }

  /* ---------- actions (what the game does with the controller input) ---------- */

  function jump() {
    var h = hero;
    if (h.z > 0 || h.roll > 0) return;
    h.vz = JUMP_V; h.z = 0.01; h.slam = false; h.bow = null; bowBy = null;   // jumping lowers the bow
  }
  function charge(t) { return clamp((t - 0.08) / 0.62, 0, 1); }   // bow: full after about 0.7 s
  function bowStart(by) {                            // RT held: draw the bow; it aims wherever the crosshair is
    var h = hero;
    if (h.roll > 0 || h.slam || h.bow) return;
    h.bow = { t: 0 }; h.swing = 0; bowBy = by;
    if (by !== 'mouse') { aimPt.x = h.x + h.fx * 34; aimPt.y = h.y - 8 + h.fy * 24; }
  }
  function bowRelease() {                            // RT released: loose the arrow toward the crosshair
    var h = hero, b = h.bow;
    if (!b) return;
    var c = charge(b.t), d = aimDir();
    h.bow = null; bowBy = null;
    arrows.push({ x: h.x + d[0] * 6, y: h.y - 8 - h.z + d[1] * 6, ux: d[0], uy: d[1], v: 230 + 240 * c, full: c >= 1, hit: [], stuck: 0 });
    if (arrows.length > 12) arrows.shift();
    burst(h.x + d[0] * 7, h.y, 8 + h.z, c >= 1 ? 6 : 3, c >= 1 ? ['#ffffff', '#ffe9a8'] : ['#e8e0d0'], 15, 40, 0.25, true);
  }
  function attack() {
    var h = hero;
    if (h.bow) return;                               // no sword while the bow is drawn
    if (h.roll > 0) { h.buffer = T + 0.2; return; }
    if (h.z > 2) {                                   // heavy jump attack: hang, then slam down
      if (!h.slam) { h.slam = true; h.vz = 45; h.swing = 0; }
      return;
    }
    if (h.swing > 0) { h.buffer = T + 0.25; return; }
    h.swing = SWING_T; h.swingA = Math.atan2(h.fy / SQ, h.fx); h.side = -(h.side || 1); h.hits = [];
  }
  function dodge(dx, dy, viaLB) {
    if (!viaLB) { pad.rx = dx; pad.ry = dy; pad.flick = T + 0.22; }   // right stick flick
    var h = hero;
    if (h.z > 0 || h.roll > 0 || T < h.rollReady) return;
    h.bow = null; bowBy = null;                      // a dodge lowers the bow
    h.roll = ROLL_T; h.rollReady = T + ROLL_T + 0.1;
    h.rdx = dx; h.rdy = dy; h.fx = dx; h.fy = dy; h.face = faceOf(dx, dy);
    h.swing = 0; h.ghostT = 0;
    dust(h.x, h.y, 5);
  }
  function dodgeMove() {                             // right click without a drag: the way you move/face
    var l = Math.hypot(pad.lx, pad.ly);
    if (l > 0.2) dodge(pad.lx / l, pad.ly / l); else dodge(hero.fx, hero.fy);
  }

  /* ---------- input ---------- */

  function editable(t) { return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  function syncHeld() {                              // held keys from the keyboard and the touch "stick"
    var t = tdir >= 0 ? DIRS[tdir] : [0, 0];
    for (var k in held) if (k.charAt(0) !== 'm') held[k] = false;   // mouse buttons keep their own state
    held.w = t[1] < 0; held.a = t[0] < 0; held.s = t[1] > 0; held.d = t[0] > 0;
    for (var c in down) if (down[c]) held[CODES[c]] = true;
  }
  function anyHeld() { for (var k in held) if (held[k]) return true; return false; }
  function press1(a) {                               // a key or button went down: what the game does with it
    if (a === 'jump') jump();
    else if (a === 'fwd') dodge(hero.fx, hero.fy, true);
    else if (a === 'roll') dodgeMove();
    else if (a in SKEY) skill(SKEY[a]);
  }
  function keydown(e) {
    if (e.code === 'Escape' && mode === 'player') { giveBack(); return; }
    var k = CODES[e.code], tg = e.target, a = k && (MOVE[k] ? 'move' : LAYOUTS[layout].bind[k]);
    if (!a || e.ctrlKey || e.metaKey || e.altKey || editable(tg) || !onscreen || document.hidden) return;
    if (tg && tg.closest && tg.closest('.wd-seg')) return;   // the layout/difficulty buttons keep Space/Enter
    if (mode !== 'player') { if (a !== 'move' && !(a in SKEY)) return; takeOver(); }
    e.preventDefault();                              // only while playing and on screen: no page scroll
    lastInput = performance.now();
    if (down[e.code]) return;
    down[e.code] = 1; syncHeld();
    if (e.repeat) return;                            // a key already held when play began: hold it, no action
    flash[k] = T + 0.12;
    press1(a);
  }
  function keyup(e) { if (down[e.code]) { delete down[e.code]; syncHeld(); } }
  function toAim(e) {                                // the crosshair follows the mouse over the game
    var r = cv.getBoundingClientRect();
    if (!r.width) return;
    aimPt.x = clamp((e.clientX - r.left) / r.width * W, 2, W - 2);
    aimPt.y = clamp((e.clientY - r.top) / r.height * H, 2, H - 2);
  }
  function mousedown(e) {
    if (e.button > 2) e.preventDefault();            // side buttons on the game: never back/forward
    if (Date.now() - lastTouch < 900) return;
    var k = e.button === 0 && e.ctrlKey ? 'mr' : MBTN[e.button], a = LAYOUTS[layout].bind[k];   // Ctrl-click = right
    if (!a) return;
    e.preventDefault();
    takeOver(); toAim(e);
    mbtn[e.button] = k; held[k] = 1; flash[k] = T + 0.12;
    if (a === 'attack') attack();
    else if (a === 'roll') drag = { k: k, x: e.clientX, y: e.clientY, on: false, dx: 0, dy: 0 };   // click or drag
    else if (a === 'bow') bowStart('mouse');
    else press1(a);
  }
  function letGo(b) {                                // a mouse button that went down on the game came up
    var k = mbtn[b], a = LAYOUTS[layout].bind[k];
    delete mbtn[b]; held[k] = 0;
    lastInput = performance.now();
    if (a === 'roll' && drag && drag.k === k) { var d = drag; drag = null; if (d.on) dodge(d.dx, d.dy); else dodgeMove(); }
    if (a === 'bow' && bowBy === 'mouse') bowRelease();
  }
  function mousemove(e) {
    if (bowBy === 'mouse' || e.target === cv) toAim(e);
    for (var b in mbtn) if (!(e.buttons & MBIT[b])) letGo(b);   // released outside the window
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y, l = Math.hypot(dx, dy);
    drag.l = l; if (l) { drag.vx = dx / l; drag.vy = dy / l; }   // for the live right stick in the HUD
    if (l >= DRAG_PX) { drag.on = true; drag.dx = dx / l; drag.dy = dy / l; }
    lastInput = performance.now();
  }
  function mouseup(e) {
    if (!(e.button in mbtn)) return;
    if (e.button > 2) e.preventDefault();            // a side button pressed on the game: no back/forward
    letGo(e.button);
  }
  function pdown(e) {
    if (e.pointerType === 'mouse') return;
    lastTouch = Date.now();
    if (touch) { takeOver(); flash.ml = T + 0.15; attack(); return; }  // second finger taps attack
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
  }
  function pmove(e) {
    if (!touch || e.pointerId !== touch.id) return;
    lastTouch = Date.now();
    var dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    if (Math.hypot(dx, dy) < 12) { if (tdir >= 0) { tdir = -1; syncHeld(); } return; }
    touch.moved = true;
    takeOver();
    var i = octant(dx, dy);
    if (i !== tdir) { tdir = i; syncHeld(); }
  }
  function pup(e) {
    if (!touch || e.pointerId !== touch.id) return;
    lastTouch = Date.now();
    if (!touch.moved && e.type === 'pointerup' && performance.now() - touch.t < 350) {
      takeOver(); flash.ml = T + 0.15; attack();
    }
    touch = null; tdir = -1; syncHeld();
  }

  /* ---------- simulation ---------- */

  function newHero() {
    return { x: 160, y: 112, z: 0, vz: 0, fx: 0, fy: 1, face: 0, anim: 0, swing: 0, swingA: 0, side: 1, hits: [],
      buffer: 0, roll: 0, rollReady: 0, rdx: 0, rdy: 1, ghostT: 0, kx: 0, ky: 0, hurt: 0, inv: 0, slam: false };
  }
  function stick(dt) {
    var src = mode === 'player' ? held : bot;
    var tx = (src.d ? 1 : 0) - (src.a ? 1 : 0), ty = (src.s ? 1 : 0) - (src.w ? 1 : 0);
    if (hero.bow) tx = ty = 0;                       // bow drawn: the mod lets the game aim at the cursor, WASD don't move
    if (tx && ty) { tx *= Math.SQRT1_2; ty *= Math.SQRT1_2; }
    var k = 1 - Math.exp(-dt / (tx || ty ? 0.03 : 0.025));
    pad.lx += (tx - pad.lx) * k; pad.ly += (ty - pad.ly) * k;
    if (Math.abs(pad.lx) < 0.01) pad.lx = 0;
    if (Math.abs(pad.ly) < 0.01) pad.ly = 0;
  }
  function stepHero(dt) {
    var h = hero, mx = pad.lx, my = pad.ly, ml = Math.hypot(mx, my), vx, vy;
    if (h.bow) {                                     // drawing the bow: stand still, turn to the crosshair
      if (bowBy !== 'mouse') aimAt(bowBy === 'touch' ? aim(0) : ai.tgt, dt);   // touch and autopilot aim themselves
      var d = aimDir();
      h.bow.t += dt; h.fx = d[0]; h.fy = d[1]; h.face = faceOf(d[0], d[1]);
    } else if (ml > 0.3 && h.roll <= 0 && !h.slam) {
      h.fx = mx / ml; h.fy = my / ml;
      if (h.swing <= 0) h.face = faceOf(mx, my);
    }
    if (h.roll > 0) {
      h.roll -= dt; vx = h.rdx * ROLL_V; vy = h.rdy * ROLL_V;
      if ((h.ghostT -= dt) <= 0) { h.ghostT = 0.03; ghosts.push({ x: h.x, y: h.y, t: 0.2, f: (T * 22) | 0 }); }
    } else if (h.slam || h.bow) { vx = vy = 0; }
    else { var sp = SPEED * (h.swing > 0 && h.z <= 0 ? 0.45 : 1); vx = mx * sp; vy = my * sp; }
    vx += h.kx; vy += h.ky;
    var damp = Math.exp(-dt * 9); h.kx *= damp; h.ky *= damp;
    h.x = clamp(h.x + vx * dt, BX0, BX1);
    h.y = clamp(h.y + vy * dt, BY0, BY1);
    if (h.z > 0 || h.vz > 0) {
      h.vz -= GRAV * dt * (h.slam ? (h.vz < 30 ? 3.4 : 1) : Math.abs(h.vz) < 30 ? 0.55 : 1);   // brief float at the top
      h.z += h.vz * dt;
      if (h.z <= 0) { h.z = 0; h.vz = 0; land(); }
    }
    if (h.swing > 0) { h.swing -= dt; swingHits(); }
    else if (h.buffer > T || (mode === 'player' && held.ml && h.z <= 0 && h.roll <= 0)) { h.buffer = 0; attack(); }
    if (ml > 0.3 && h.roll <= 0 && h.z <= 0 && !h.bow) h.anim += dt; else h.anim = 0;
    if (h.hurt > 0) h.hurt -= dt;
    if (h.inv > 0) h.inv -= dt;
  }
  function land() {
    var h = hero;
    if (!h.slam) { dust(h.x, h.y, 5); return; }
    h.slam = false; hitstop = 0.08;                  // heavy jump attack: shockwave, flash, debris, a crater
    if (!reduced) shake = 0.34;
    rings.push({ x: h.x, y: h.y, t: 0, max: 0.5, r: 56, c: ['#fff4d6', '#ffb35c', '#ff8a3d'] });
    flashes.push({ x: h.x, y: h.y - 4, r: 100, t: 0.4, max: 0.4, rgb: [255, 186, 110] });
    dust(h.x, h.y, 22);
    burst(h.x, h.y, 2, 10, ['#8f8478', '#6c635c', '#a39a8e', '#5d5866'], 40, 90, 0.7, false);
    stain(h.x, h.y, 22, 12, ['#141118', '#1e1a24', '#2a2531'], 4);
    blobs.forEach(function (b) {
      var dx = b.x - h.x, dy = (b.y - h.y) / SQ;
      if (!b.dead && dx * dx + dy * dy < 54 * 54) kill(b, dx, dy);
    });
  }
  function swingHits() {
    var h = hero, p = 1 - h.swing / SWING_T;
    if (p < 0.08 || p > 0.9) return;
    blobs.forEach(function (b) {
      if (b.dead || b.z > 10 || h.hits.indexOf(b) >= 0) return;
      var dx = b.x - h.x, dy = (b.y - h.y) / SQ, d = Math.hypot(dx, dy);   // hit where the crescent touches the blob
      if (d < 10 || (d - b.base * 0.45 < REACH + 1.5 && angDiff(Math.atan2(dy, dx), h.swingA) < 1.6)) { h.hits.push(b); kill(b, dx, dy); }
    });
  }
  function kill(b, dx, dy, how) {
    var d = Math.hypot(dx, dy) || 1;
    b.dead = 0.1; b.kx = dx / d * 90; b.ky = dy / d * 60; b.how = b.frozen > 0 ? 'ice' : how || 'goo';
    score++; setScore(); hitstop = Math.max(hitstop, 0.04);
    burst(b.x, b.y, b.h * 0.6, 5, ['#ffffff', '#e6dcff'], 30, 70, 0.25, true);
  }
  function pop(b) {                                   // after the white hit flash: bits, a puff of light, a stain
    var fx = POPS[b.how] || POPS.goo;
    burst(b.x, b.y, b.h * 0.5, 12, fx[0], 20, 60, 0.6, false);
    burst(b.x, b.y, b.h * 0.5, 4, fx[0].slice(2), 25, 70, 0.4, true);
    stain(b.x, b.y, 13, 7, fx[2], b.how === 'ice' ? 2 : 5);
    flashes.push({ x: b.x, y: b.y - 4, r: 34, t: 0.3, max: 0.3, rgb: fx[1] });
  }
  function stain(x, y, n, rad, cols, life) {          // a few pixels left on the floor, fading
    for (var pts = [], i = 0; i < n; i++) {
      var a = Math.random() * TAU, r = Math.sqrt(Math.random()) * rad;
      pts.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r * SQ), cols[i % cols.length]]);
    }
    splats.push({ x: Math.round(x), y: Math.round(y), pts: pts, t: life, max: life });
    if (splats.length > 16) splats.shift();
  }
  function freeze(b) {                                // Frost Ring: no hopping for 2 s, and no bumping into the hero
    b.frozen = 2; b.vx = b.vy = 0; b.w = b.base; b.h = b.base - 2;
    if (b.vz > 0) b.vz = 0;
    burst(b.x, b.y, b.h * 0.6, 6, ['#ffffff', '#cdeeff', '#7fc8f0'], 15, 45, 0.4, true);
  }
  function burst(x, y, z, n, cols, s0, s1, life, em) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, s = rnd(s0, s1);
      parts.push({ x: x, y: y, z: z, vx: Math.cos(a) * s, vy: Math.sin(a) * s * SQ, vz: rnd(15, 55), g: em ? 40 : 170,
        t: rnd(life * 0.5, life), c: cols[(Math.random() * cols.length) | 0], s: !em && Math.random() < 0.3 ? 2 : 1, e: em });
    }
  }
  function dust(x, y, n) { burst(x, y, 1, n, ['#8f8478', '#6c635c', '#a39a8e'], 10, 40, 0.5, false); }
  function hurt(b, dx, dy, d) {                       // a blob bumped the hero: knockback and a red flash, nothing else
    var h = hero;
    h.kx = dx / d * 160; h.ky = dy / d * 160; h.hurt = 0.4; h.inv = 0.9;
    b.kx = -dx / d * 70; b.ky = -dy / d * 70;
    dust(h.x, h.y, 5);
  }

  function spawnBlob() {                              // from a side or the front edge, the farthest of three tries
    var best = null, bd = -1, base = [10, 12, 12, 14][(Math.random() * 4) | 0];
    for (var i = 0; i < 3; i++) {
      var s = Math.random(), x = s < 0.36 ? -8 : s < 0.72 ? W + 8 : rnd(24, W - 24), y = s < 0.72 ? rnd(BY0 + 8, BY1 - 4) : H + 12;
      var d = Math.hypot(x - hero.x, y - hero.y);
      if (d > bd) { bd = d; best = [x, y]; }
    }
    blobs.push(newBlob(best[0], best[1], base));
  }
  function newBlob(x, y, base) {
    return { x: x, y: y, z: 0, vz: 0, vx: 0, vy: 0, st: 'rest', t: rnd(0.1, 0.5), base: base, w: base, h: base - 2,
      dead: 0, kx: 0, ky: 0, look: 0, ly: 0, blink: rnd(1, 4), ph: rnd(0, 6), inside: false };
  }
  function staticScene() {                            // the opening frame, and the still shown with reduced motion
    T = 2.2;
    hero = newHero();
    hero.x = 140; hero.y = 114; hero.face = 2; hero.fx = 1; hero.fy = 0;
    hero.swing = SWING_T * 0.585; hero.swingA = 0; hero.side = 1;   // the crescent centred on the blob it hits
    blobs = [[163, 115, 12, 'hit'], [92, 90, 10, 'rest'], [212, 150, 14, 'air'], [244, 82, 12, 'rest'], [62, 146, 12, 'crouch']]
      .map(function (s) {
        var b = newBlob(s[0], s[1], s[2]), k = s[2];
        b.inside = true; b.st = s[3]; b.look = s[0] < 140 ? 1 : -1;
        if (s[3] === 'air') { b.w = k - 2; b.h = k + 1; b.z = 6; }
        if (s[3] === 'crouch') { b.w = k + 4; b.h = k - 5; }
        if (s[3] === 'hit') b.dead = 0.08;
        return b;
      });
    parts = []; burst(163, 115, 6, 7, ['#ffffff', '#e6dcff'], 30, 70, 0.3, true);
    for (var i = 0; i < 3; i++) stepFx(0.03);
  }
  function stepBlobs(dt) {
    var h = hero, i, j, b, alive = 0, damp = Math.exp(-dt * 8), lv = LEVELS[level];
    for (i = 0; i < blobs.length; i++) if (!blobs[i].dead) alive++;
    if ((spawnT -= dt) <= 0 && alive < lv[0]) { spawnBlob(); spawnT = rnd(lv[1], lv[2]) * (alive < lv[0] / 2 ? 0.35 : 1); }
    for (i = blobs.length - 1; i >= 0; i--) {
      b = blobs[i];
      b.x += b.kx * dt; b.y += b.ky * dt; b.kx *= damp; b.ky *= damp;
      if (b.dead) { if ((b.dead -= dt) <= 0) { pop(b); blobs.splice(i, 1); } continue; }
      var dx = h.x - b.x, dy = h.y - b.y, d = Math.hypot(dx, dy) || 1, k = b.base;
      b.look = dx > 6 ? 1 : dx < -6 ? -1 : 0; b.ly = dy < -12 ? -1 : 0;
      if ((b.blink -= dt) < -0.12) b.blink = rnd(1.5, 4.5);
      b.t -= dt;
      if (b.frozen > 0) {                             // frozen: settle to the floor, then thaw with a crackle
        b.frozen -= dt; b.vz -= BLOB_G * dt; b.z = Math.max(0, b.z + b.vz * dt);
        if (b.frozen <= 0) { b.st = 'rest'; b.t = 0.3; burst(b.x, b.y, b.h * 0.6, 6, ['#ffffff', '#cdeeff'], 15, 40, 0.35, true); }
      } else if (b.st === 'rest') {                   // breathe, then crouch, hop (stretch), land (squash)
        var br = Math.sin(T * 5 + b.ph) > 0.2 ? 1 : 0;
        b.w = k + br * 2; b.h = k - 2 - br;
        if (b.t <= 0) { b.st = 'crouch'; b.t = 0.13; }
      } else if (b.st === 'crouch') {
        b.w = k + 4; b.h = k - 5;
        if (b.t <= 0) {
          var a = Math.atan2(dy, dx) + rnd(-0.6, 0.6), hop = Math.min(d + 6, rnd(15, 25)) * (b.inside ? 1 : 1.4), air = 0.34 + k * 0.007;
          b.st = 'air'; b.t = air; b.vx = Math.cos(a) * hop / air; b.vy = Math.sin(a) * hop / air; b.vz = BLOB_G * air / 2;
        }
      } else if (b.st === 'air') {
        b.vz -= BLOB_G * dt; b.z = Math.max(0, b.z + b.vz * dt);
        b.w = k - 2; b.h = k + (b.vz > 0 ? 1 : -1);
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.t <= 0) { b.z = 0; b.st = 'land'; b.t = 0.12; }
      } else {
        b.w = k + 4; b.h = k - 5;
        if (b.t <= 0) { b.st = 'rest'; b.t = rnd(0.2, 0.75); }
      }
      if (!b.inside && b.x > BX0 && b.x < BX1 && b.y < BY1) b.inside = true;
      if (b.inside) { b.x = clamp(b.x, BX0, BX1); b.y = clamp(b.y, BY0, BY1); }
      if (b.z < 4 && h.z < 5 && h.roll <= 0 && h.inv <= 0 && !(b.frozen > 0) && Math.abs(dx) < k / 2 + 4 && Math.abs(dy) < 5) {
        hurt(b, dx, dy, d);
      }
    }
    for (i = 0; i < blobs.length; i++) for (j = i + 1; j < blobs.length; j++) {   // keep blobs from stacking
      var p = blobs[i], q = blobs[j], sx = q.x - p.x, sy = (q.y - p.y) / SQ, sd = Math.hypot(sx, sy), min = (p.base + q.base) * 0.45;
      if (sd < min && !p.dead && !q.dead) {
        if (!sd) { sx = 1; sd = 1; }
        var push = (min - sd) / 2 / sd;
        p.x -= sx * push; q.x += sx * push; p.y -= sy * SQ * push; q.y += sy * SQ * push;
      }
    }
  }
  function stepFx(dt) {
    var i, p;
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i];
      p.t -= dt;
      if (p.t <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vz -= p.g * dt; p.z += p.vz * dt;
      if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; }
      p.vx *= Math.exp(-dt * 2); p.vy *= Math.exp(-dt * 2);
    }
    for (i = rings.length - 1; i >= 0; i--) if ((rings[i].t += dt) > rings[i].max) rings.splice(i, 1);
    for (i = ghosts.length - 1; i >= 0; i--) if ((ghosts[i].t -= dt) <= 0) ghosts.splice(i, 1);
    for (i = splats.length - 1; i >= 0; i--) if ((splats[i].t -= dt) <= 0) splats.splice(i, 1);
    for (i = flashes.length - 1; i >= 0; i--) if ((flashes[i].t -= dt) <= 0) flashes.splice(i, 1);
    TORCHES.forEach(function (tp) {                  // embers drifting up from the flames
      if (Math.random() < dt * 2.2) {
        parts.push({ x: tp[0] + rnd(-1.5, 1.5), y: tp[1], z: 8, vx: rnd(-5, 5), vy: 0, vz: rnd(10, 18), g: -6,
          t: rnd(0.7, 1.4), c: Math.random() < 0.5 ? '#ffd34d' : '#ff9a2e', s: 1, e: true });
      }
    });
    if (shake > 0) shake -= dt;
  }

  /* ---------- skills on 1 2 3: Spark Bolt, Frost Ring, Ember Fall ---------- */

  // Auto-aim: the best blob inside a ±55° cone around where the hero faces, else the best anywhere, else null
  // (then the skill goes straight ahead). A bolt (kind 0) likes blobs lined up behind each other, a meteor
  // (kind 1) likes a crowd and lands on its middle.
  function aim(kind) {
    var h = hero, fa = Math.atan2(h.fy, h.fx), best = null, bs = -1e9;
    var live = blobs.filter(function (b) { return !b.dead && b.inside; });
    for (var pass = 0; pass < 2 && !best; pass++) live.forEach(function (b) {
      var dx = b.x - h.x, dy = b.y - h.y, l = Math.hypot(dx, dy) || 1, n = 0, sx = 0, sy = 0;
      if (!pass && angDiff(Math.atan2(dy, dx), fa) > 0.96) return;
      live.forEach(function (o) {
        var ox = o.x - h.x, oy = o.y - h.y;
        if (kind ? Math.hypot(o.x - b.x, (o.y - b.y) / SQ) < 34 : ox * dx + oy * dy > 0 && Math.abs(ox * dy - oy * dx) / l < 9) {
          n++; sx += o.x; sy += o.y;
        }
      });
      var s = n * 50 - Math.hypot(dx, dy / SQ);
      if (s > bs) { bs = s; best = kind ? { x: sx / n, y: sy / n, n: n } : { x: b.x, y: b.y, n: n, b: b }; }
    });
    return best;
  }
  function skill(i) {
    if (T < skReady[i]) return;
    var h = hero, t = i === 1 ? null : aim(i >> 1);
    skReady[i] = T + SKILLS[i].cd; skUsed[i] = T;
    if (i === 0) {                                   // Spark Bolt: a fast bolt that zaps every blob in its line
      var dx = t ? t.x - h.x : h.fx, dy = t ? t.y - h.y : h.fy, l = Math.hypot(dx, dy) || 1;
      h.fx = dx / l; h.fy = dy / l;
      if (h.swing <= 0 && h.roll <= 0) h.face = faceOf(dx, dy);
      bolts.push({ x: h.x, y: h.y, z: 7 + h.z, ux: dx / l, uy: dy / l, d: 6, hit: [], end: 0 });
      burst(h.x + h.fx * 6, h.y, 8, 5, ['#ffffff', '#7fe0ff'], 20, 50, 0.25, true);
    } else if (i === 1) {                            // Frost Ring: an icy burst around the hero freezes blobs
      frosts.push({ x: h.x, y: h.y, r: 4, t: 0 });
      flashes.push({ x: h.x, y: h.y - 4, r: 76, t: 0.4, max: 0.4, rgb: [140, 200, 255] });
      stain(h.x, h.y, 30, 30, ['#9fd3f5', '#d8f1ff', '#5b9bd5'], 2.2);
    } else {                                         // Ember Fall: a meteor on the crowd (or a few tiles ahead)
      meteors.push({ x: clamp(t ? t.x : h.x + h.fx * 44, BX0 + 6, BX1 - 6), y: clamp(t ? t.y : h.y + h.fy * 30, BY0 + 6, BY1 - 4), t: 0 });
    }
  }
  function aimAt(t, dt) {                            // touch/autopilot bow: glide the crosshair onto a blob's body
    var b = t && t.b, k = 1 - Math.exp(-dt * 9), x = hero.x + hero.fx * 40, y = hero.y - 8 + hero.fy * 28;
    if (b && !b.dead) { x = b.x; y = b.y - b.z - b.h * 0.5 - 1; }
    aimPt.x += (x - aimPt.x) * k; aimPt.y += (y - aimPt.y) * k;
  }
  function stepArrows(dt) {                          // arrows fly where the crosshair was; a full draw pierces
    for (var i = arrows.length - 1; i >= 0; i--) {
      var o = arrows[i], x0 = o.x, y0 = o.y;
      if (o.stuck) { if ((o.stuck -= dt) <= 0) arrows.splice(i, 1); continue; }
      o.x += o.ux * o.v * dt; o.y += o.uy * o.v * dt;
      for (var j = 0; j < blobs.length; j++) {
        var b = blobs[j], cx = b.x - x0, cy = b.y - b.z - b.h * 0.5 - 1 - y0, sx = o.x - x0, sy = o.y - y0;
        var u = clamp((cx * sx + cy * sy) / (sx * sx + sy * sy || 1), 0, 1);   // nearest point on this frame's path
        if (b.dead || o.hit.indexOf(b) >= 0 || Math.hypot(cx - sx * u, cy - sy * u) > b.base * 0.5 + 1.5) continue;
        o.hit.push(b); kill(b, o.ux, o.uy);
        if (!o.full) { o.x = x0 + sx * u; o.y = y0 + sy * u; o.stuck = 0.01; break; }
      }
      if (o.stuck) continue;
      if (o.y < WALL - 6) { o.y = WALL - 6; o.stuck = 1.2; burst(o.x, o.y + 8, 8, 3, ['#8f8478', '#a39a8e'], 10, 30, 0.3, false); }
      else if (o.x < -12 || o.x > W + 12 || o.y > H + 12) arrows.splice(i, 1);
    }
  }
  function meteorAt(m) { var u = Math.pow(Math.min(1, m.t / 0.6), 1.7); return [m.x + 46 * (1 - u), 150 * (1 - u)]; }   // x, height
  function stepSkills(dt) {
    var i;
    for (i = bolts.length - 1; i >= 0; i--) {
      var o = bolts[i], d0 = o.d;
      if (o.end) { if (T - o.end > 0.18) bolts.splice(i, 1); continue; }
      o.d += 560 * dt;
      blobs.forEach(function (b) {
        var bx = b.x - o.x, by = b.y - o.y, along = bx * o.ux + by * o.uy;
        if (b.dead || b.z > 12 || o.hit.indexOf(b) >= 0 || along < d0 - 8 || along > o.d + 4) return;
        if (Math.abs(bx * o.uy - by * o.ux) < 5 + b.base * 0.35) { o.hit.push(b); kill(b, o.ux, o.uy, 'zap'); }
      });
      var hx = o.x + o.ux * o.d, hy = o.y + o.uy * o.d;
      if (hx < 2 || hx > W - 2 || hy < WALL + 2 || hy > H + 4) {   // fizzles out at the wall
        o.end = T;
        burst(clamp(hx, 2, W - 2), clamp(hy, WALL + 2, H), 7, 8, ['#ffffff', '#bff4ff', '#7fe0ff'], 20, 60, 0.3, true);
      }
    }
    for (i = frosts.length - 1; i >= 0; i--) {
      var f = frosts[i], r0 = f.r;
      f.t += dt; f.r = 4 + 60 * (1 - Math.pow(1 - Math.min(1, f.t / 0.45), 2));
      blobs.forEach(function (b) {
        var d = Math.hypot(b.x - f.x, (b.y - f.y) / SQ);
        if (!b.dead && !(b.frozen > 1.8) && d < f.r + b.base * 0.4 && d > r0 - 10) freeze(b);
      });
      if (f.t > 0.6) frosts.splice(i, 1);
    }
    for (i = meteors.length - 1; i >= 0; i--) {
      var m = meteors[i], p = meteorAt(m);
      m.t += dt;
      if (m.t < 0.6) {                               // falling: a trail of fire
        if (Math.random() < dt * 100) {
          parts.push({ x: p[0] + rnd(-3, 3), y: m.y, z: p[1] + rnd(-3, 3), vx: rnd(10, 30), vy: 0, vz: rnd(10, 30), g: -20,
            t: rnd(0.2, 0.5), c: ['#fff3c4', '#ffd34d', '#ff9a2e', '#e8541e'][(Math.random() * 4) | 0], s: Math.random() < 0.3 ? 2 : 1, e: true });
        }
      } else { explode(m); meteors.splice(i, 1); }
    }
  }
  function explode(m) {                              // Ember Fall lands: fire, smoke, light, a scorch mark
    hitstop = Math.max(hitstop, 0.05);
    if (!reduced) shake = Math.max(shake, 0.22);
    rings.push({ x: m.x, y: m.y, t: 0, max: 0.4, r: 42, c: ['#fff3c4', '#ff9a2e', '#e8541e'] });
    flashes.push({ x: m.x, y: m.y - 6, r: 110, t: 0.5, max: 0.5, rgb: [255, 140, 50] });
    burst(m.x, m.y, 4, 24, ['#fff3c4', '#ffd34d', '#ff9a2e', '#e8541e'], 30, 110, 0.7, true);
    for (var i = 0; i < 9; i++) {
      parts.push({ x: m.x + rnd(-8, 8), y: m.y + rnd(-3, 3), z: rnd(2, 8), vx: rnd(-14, 14), vy: rnd(-4, 4), vz: rnd(6, 16), g: -8,
        t: rnd(0.8, 1.5), c: ['#2a2530', '#3a3440', '#4a4450'][i % 3], s: 2 });
    }
    stain(m.x, m.y, 26, 15, ['#120d10', '#2a1a16', '#3a2418'], 5);
    blobs.forEach(function (b) {
      var dx = b.x - m.x, dy = (b.y - m.y) / SQ;
      if (!b.dead && dx * dx + dy * dy < 36 * 36) kill(b, dx, dy, 'fire');
    });
  }

  /* ---------- autopilot: plays until the visitor does, pressing real keys so the HUD lights up ---------- */

  var ai = { next: 0, slam: false, slamAt: 3, rollAt: 2, lbAt: 5, dir: -1, skillAt: 3.5, bowAt: 4, bowDur: 1, tgt: null };
  function press(k, dur) { bot[k] = 1; botUntil[k] = T + dur; }
  function steer(i) { var d = i >= 0 ? DIRS[i] : [0, 0]; bot.w = d[1] < 0; bot.s = d[1] > 0; bot.a = d[0] < 0; bot.d = d[0] > 0; }
  function unit(i) { var d = DIRS[i], l = Math.hypot(d[0], d[1]); return [d[0] / l, d[1] / l]; }
  function inRoom(x, y) { return x > BX0 + 6 && x < BX1 - 6 && y > BY0 + 4 && y < BY1 - 4; }
  function K(a) { return LAYOUTS[layout].main[a]; }  // the key or button the active layout uses for an action
  function autopilot() {
    var h = hero, tgt = null, td = 1e9, near = 0, bk = K('bow');
    if (bot[bk] && !h.bow) bot[bk] = 0;              // the draw was cut short (a dodge, a jump): let go
    if (h.bow && bowBy === 'bot') {                  // aiming: the crosshair glides onto the target, then loose
      if (!ai.tgt || ai.tgt.b.dead) ai.tgt = aim(0);
      if (h.bow.t >= ai.bowDur) { bot[bk] = 0; bowRelease(); ai.bowAt = T + rnd(4, 8); ai.next = T + 0.2; }
      return;
    }
    if (ai.drag) {                                   // a roll: the button is held and dragged; let go to roll that way
      if (T - ai.drag.t0 >= ai.drag.dur) { var g = ai.drag; ai.drag = null; bot[g.k] = 0; dodge(g.ux, g.uy); ai.next = T + 0.15; }
      return;
    }
    if (h.z > 0) {                                   // mid-jump: click near the top for the heavy jump attack
      if (ai.slam && h.vz < 30 && !h.slam) { ai.slam = false; press('ml', 0.14); attack(); }
      return;
    }
    if (T < ai.next || h.roll > 0) return;
    ai.next = T + rnd(0.08, 0.16);
    blobs.forEach(function (b) {
      if (b.dead || !b.inside) return;
      var d = Math.hypot(b.x - h.x, (b.y - h.y) / SQ);
      if (d < td) { td = d; tgt = b; }
      if (d < 42) near++;
    });
    if (!tgt) { var cx = 160 - h.x, cy = 112 - h.y; steer(Math.hypot(cx, cy) > 20 ? octant(cx, cy) : -1); return; }
    var dx = tgt.x - h.x, dy = tgt.y - h.y, want = octant(dx, dy);
    if (ai.dir >= 0 && angDiff(Math.atan2(dy, dx), ai.dir * Math.PI / 4) < 0.6) want = ai.dir;   // no flicker at octant edges
    ai.dir = want;
    if (T > ai.skillAt && Math.random() < 0.5) {     // skills now and then, aimed the same way as for the visitor
      var use = -1, t;
      if (T >= skReady[1] && (near >= 2 || (td < 16 && Math.random() < 0.4))) use = 1;
      else if (T >= skReady[2] && (t = aim(1)) && (t.n >= 2 || Math.random() < 0.3)) use = 2;
      else if (T >= skReady[0] && (t = aim(0)) && (t.n >= 2 || (td > 60 && Math.random() < 0.5))) use = 0;
      if (use >= 0) { press(K('k' + (use + 1)), 0.16); skill(use); ai.skillAt = T + rnd(1.2, 2.6); return; }
    }
    if (T > ai.bowAt && td > 70 && !near && Math.random() < 0.5) {   // a blob far off: the bow
      steer(-1); bot[bk] = 1; delete botUntil[bk];
      bowStart('bot'); ai.tgt = { b: tgt }; ai.bowDur = rnd(0.5, 1.05);
      return;
    }
    if (T > ai.slamAt && td < 30 && (near >= 2 || Math.random() < 0.1)) {
      steer(-1); press(K('jump'), 0.16); jump(); ai.slam = true; ai.slamAt = T + rnd(5, 9);
      return;
    }
    if (td < 26 && T > ai.rollAt && (tgt.st === 'crouch' || Math.random() < 0.3)) {   // roll aside, the way it walks
      var side = (want + (Math.random() < 0.5 ? 2 : 6)) % 8, u = unit(side);
      if (!inRoom(h.x + u[0] * 50, h.y + u[1] * 50)) { side = (side + 4) % 8; u = unit(side); }
      var rk = layout === 'rec' ? 'mr' : 'm4';       // the roll's mouse button: right click, or side 4
      steer(side); bot[rk] = 1; delete botUntil[rk];
      ai.drag = { k: rk, ux: u[0], uy: u[1], t0: T, dur: rnd(0.16, 0.26) }; ai.rollAt = T + rnd(2.5, 5);
      return;
    }
    if (td > 75 && T > ai.lbAt && octant(h.fx, h.fy) === want) {   // far away: forward dodge (LB) to close in
      steer(want); press(K('fwd'), 0.14); dodge(h.fx, h.fy, true); ai.lbAt = T + rnd(5, 9);
      return;
    }
    if (td < 25) {                                   // inside sword reach
      if (octant(h.fx, h.fy) !== want && h.swing <= 0) { steer(want); ai.next = T + 0.06; return; }   // turn to face it
      steer(-1);
      if (h.swing <= 0) { press('ml', 0.12); attack(); }
      return;
    }
    steer(want);
  }
  function step(dt) {
    if (hitstop > 0) { hitstop -= dt; return; }       // a few frames of freeze make hits land
    T += dt;
    if (mode === 'player' && performance.now() - lastInput > IDLE_MS && !anyHeld()) {
      giveBack();
      if (!shouldRun()) return;                      // reduced motion: freeze right here, before the autopilot moves
    }
    for (var k in botUntil) if (T >= botUntil[k]) { bot[k] = 0; delete botUntil[k]; }
    if (mode === 'auto') autopilot(dt);
    stick(dt);
    stepHero(dt);
    stepBlobs(dt);
    stepSkills(dt);
    stepArrows(dt);
    stepFx(dt);
  }

  /* ---------- drawing ---------- */

  var LS = 2, LW = W / LS, LH = H / LS, bg, lc, lg, gc, gg, limg, gimg;   // light maps: one cell = LS x LS pixels
  var FLAME = ['#9c2a14', '#e8541e', '#ff9a2e', '#ffd34d', '#fffbe6'];
  var DARK_STEPS = 12;

  function torchFlick(i) {
    var t = Math.floor(T * 14) / 14;
    return 0.93 + 0.04 * Math.sin(t * 6.1 + i * 2.3) + 0.03 * Math.sin(t * 15.7 + i * 4.1) + 0.04 * hash(i, 1, t);
  }
  // Low-res light map: darkness everywhere, carved out by lights and posterised into steps so it reads as
  // pixel art; a second map adds coloured glow. Light = [x, y, radius, strength, ysquash, r, g, b, glow].
  function lighting() {
    var h = hero, L = [], d = limg.data, g = gimg.data, p = 0, cx, cy, k;
    TORCHES.forEach(function (tp, i) { var f = torchFlick(i); L.push([tp[0], tp[1] - 4, 100 * f, 1, 0.8, 255, 140, 50, 0.28 * f]); });
    L.push([h.x, h.y - 6 - h.z * 0.25, 60, 0.9, 0.72, 255, 196, 130, 0.07]);
    blobs.forEach(function (b) { L.push([b.x, b.y - 4, 22, 0.5, 0.72, 150, 90, 255, 0.16]); });
    flashes.forEach(function (f) { var q = f.t / f.max; L.push([f.x, f.y, f.r * (1.3 - q * 0.3), q, 0.7, f.rgb[0], f.rgb[1], f.rgb[2], q * 0.36]); });
    bolts.forEach(function (o) { if (!o.end) L.push([o.x + o.ux * o.d, o.y + o.uy * o.d - o.z, 32, 0.85, 0.8, 140, 220, 255, 0.4]); });
    arrows.forEach(function (o) { if (o.full && !o.stuck) L.push([o.x, o.y + 6, 20, 0.6, 0.8, 190, 235, 255, 0.22]); });
    meteors.forEach(function (m) {                   // the fireball, and the spot it will hit glowing red
      var p = meteorAt(m), u = m.t / 0.6;
      L.push([p[0], m.y - p[1], 18 + 30 * u, 0.5 + 0.4 * u, 0.8, 255, 150, 60, 0.3]);
      L.push([m.x, m.y, 26 + 14 * u, 0.25 + 0.4 * u, 0.62, 255, 70, 40, 0.18 + 0.25 * u]);
    });
    for (cy = 0; cy < LH; cy++) {
      var y = (cy + 0.5) * LS, vy = y / H - 0.5;
      for (cx = 0; cx < LW; cx++, p += 4) {
        var x = (cx + 0.5) * LS, vx = x / W - 0.5, lit = 0, r = 0, gr = 0, bl = 0;
        for (k = 0; k < L.length; k++) {
          var l = L[k], dx = x - l[0], dy = (y - l[1]) / l[4], q = dx * dx + dy * dy;
          if (q >= l[2] * l[2]) continue;
          var f = 1 - Math.sqrt(q) / l[2];
          f = f * f * (3 - 2 * f);
          lit = 1 - (1 - lit) * (1 - f * l[3]);
          r += l[5] * f * l[8]; gr += l[6] * f * l[8]; bl += l[7] * f * l[8];
        }
        var dark = Math.min(0.96, 0.8 + (vx * vx + vy * vy) * 0.5) * (1 - lit);
        d[p + 3] = Math.round(dark * DARK_STEPS) / DARK_STEPS * 255;
        g[p] = Math.min(255, Math.round(r / 12) * 12);
        g[p + 1] = Math.min(255, Math.round(gr / 12) * 12);
        g[p + 2] = Math.min(255, Math.round(bl / 12) * 12);
      }
    }
    lg.putImageData(limg, 0, 0);
    gg.putImageData(gimg, 0, 0);
  }
  function drawFlame(tx, ty, i) {                     // procedural flame, a few pixels of heat
    var t = Math.floor(T * 12) / 12, ph = i * 1.9;
    for (var j = 0; j < 11; j++) {
      var v = j / 10, cx = (Math.sin(t * 8 + v * 2.6 + ph) * 1.2 + Math.sin(t * 19 + ph) * 0.4) * v;
      var w = 2.6 * Math.pow(1 - v, 0.7) + 0.3;
      for (var x = -3; x <= 3; x++) {
        var heat = (1 - Math.abs(x - cx) / w) * (1.08 - v * 0.82) + (hash(x, j, t + i) - 0.5) * 0.18;
        if (heat < 0.1) continue;
        ctx.fillStyle = FLAME[heat > 0.8 ? 4 : heat > 0.6 ? 3 : heat > 0.38 ? 2 : heat > 0.2 ? 1 : 0];
        ctx.fillRect(tx + x, ty - 1 - j, 1, 1);
      }
    }
  }
  function shadow(x, y, hw, z, a) {                   // shrinks and fades as whatever casts it rises
    var k = 1 - Math.min(z, 40) / 60;
    hw = Math.max(2, Math.round(hw * (0.45 + 0.55 * k)));
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = 'rgba(4,2,10,' + (a || 0.46 * (0.55 + 0.45 * k)).toFixed(2) + ')';
    ctx.fillRect(x - hw + 1, y - 1, hw * 2 - 2, 1); ctx.fillRect(x - hw, y, hw * 2, 1); ctx.fillRect(x - hw + 1, y + 1, hw * 2 - 2, 1);
  }
  function blade(x, y, ang, r0, r1, sq) {              // grip, guard, steel, a bright tip
    var c = Math.cos(ang), s = Math.sin(ang) * sq;
    for (var r = r0; r <= r1; r++) {
      ctx.fillStyle = r < r0 + 2 ? '#6b4127' : r < r0 + 3 ? '#e8b83a' : r > r1 - 1 ? '#ffffff' : '#c9d3e0';
      ctx.fillRect(Math.round(x + c * r), Math.round(y + s * r), 1, 1);
    }
    var l = Math.hypot(c, s) || 1, gx = x + c * (r0 + 2), gy = y + s * (r0 + 2);   // crossguard
    ctx.fillStyle = '#e8b83a';
    ctx.fillRect(Math.round(gx - s / l * 1.4), Math.round(gy + c / l * 1.4), 1, 1);
    ctx.fillRect(Math.round(gx + s / l * 1.4), Math.round(gy - c / l * 1.4), 1, 1);
  }
  var IDLE_SWORD = [[5, -6, 1.25, 0], [-6, -6, 1.9, 1], [3, -5, 0.5, 0], [-4, -5, Math.PI - 0.5, 0]];  // hand x, y, angle, behind
  function drawHero() {
    var h = hero, x = Math.round(h.x), y = Math.round(h.y), z = Math.round(h.z), sw = null, behind = false;
    if (h.roll > 0) {
      var k = Math.floor((ROLL_T - h.roll) * 26);
      ctx.drawImage(art.ball[(h.rdx < 0 || (!h.rdx && h.rdy < 0) ? -k : k) & 3], x - 5, y - 10 - z);
      return;
    }
    var fr = h.anim > 0 ? 1 + (Math.floor(h.anim * 8) & 1) : 0, bob = h.anim > 0 && (h.anim * 16 & 1) ? -1 : 0;
    if (h.bow) {                                     // the bow in front (or behind, aiming up), no sword
      var d = aimDir(), bw = [x + d[0] * 5, y - 8 - z + d[1] * 4, d[0], d[1], charge(h.bow.t)];
      if (d[1] < -0.35) drawBow.apply(null, bw);
      ctx.drawImage(art.hero[h.face][0], x - 6, y - 16 - z);
      if (d[1] >= -0.35) drawBow.apply(null, bw);
      return;
    }
    if (h.slam) sw = h.vz > 0 ? [x + 2, y - 13 - z, -Math.PI / 2, 0, 9, 1] : [x + 1, y - 9 - z, Math.PI / 2, 0, 11, 1];
    else if (h.swing > 0) {
      var p = 1 - h.swing / SWING_T, e = 1 - Math.pow(1 - p, 3), a = h.swingA - h.side * 1.5 + h.side * 3 * e;
      sw = [x, y - 7 - z, a, 2, 16, SQ]; behind = Math.sin(a) < -0.25;
    } else {
      var i = IDLE_SWORD[h.face];
      sw = [x + i[0], y + i[1] - z + bob, i[2], 0, 6, 1]; behind = !!i[3];
    }
    if (behind) blade.apply(null, sw);
    ctx.drawImage((h.hurt > 0 && (T * 20 & 1) ? art.hurt : art.hero)[h.face][fr], x - 6, y - 16 - z + bob);
    if (!behind) blade.apply(null, sw);
  }
  function drawBow(cx, cy, ux, uy, c) {              // limb, string pulled back by the charge, the nocked arrow
    var px = -uy, py = ux, pull = 1 + c * 3, i;
    for (i = -5; i <= 5; i++) {
      var bend = 2.4 * (1 - i * i / 25);             // a shallow arc bulging toward the aim
      ctx.fillStyle = Math.abs(i) > 3 ? '#6b4127' : '#b07a3e';
      ctx.fillRect(Math.round(cx + px * i + ux * bend), Math.round(cy + py * i + uy * bend), 1, 1);
    }
    var nx = cx - ux * pull, ny = cy - uy * pull;
    ctx.fillStyle = '#e8e0d0';
    line(cx + px * 5, cy + py * 5, nx, ny); line(cx - px * 5, cy - py * 5, nx, ny);
    ctx.fillStyle = '#c9a26a'; line(nx, ny, nx + ux * 8, ny + uy * 8);
    ctx.fillStyle = c >= 1 ? '#fff4c2' : '#eef3f8'; ctx.fillRect(Math.round(nx + ux * 9), Math.round(ny + uy * 9), 1, 1);
  }
  function drawArrows() {                            // shaft, steel tip, red fletching; a full draw leaves a streak
    arrows.forEach(function (o) {
      var a = o.stuck > 0.02 ? Math.min(1, o.stuck / 0.4) : 1, x = o.x, y = o.y, bx = x - o.ux * 7, by = y - o.uy * 7;
      if (o.full && !o.stuck) {
        ctx.globalAlpha = 0.55; ctx.fillStyle = '#bff4ff';
        line(x - o.ux * 18, y - o.uy * 18, x - o.ux * 7, y - o.uy * 7);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = '#c9a26a'; line(bx, by, x - o.ux, y - o.uy);
      ctx.fillStyle = '#eef3f8'; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      ctx.fillStyle = '#e0584f';
      ctx.fillRect(Math.round(bx - o.uy * 1.4), Math.round(by + o.ux * 1.4), 1, 1);
      ctx.fillRect(Math.round(bx + o.uy * 1.4), Math.round(by - o.ux * 1.4), 1, 1);
    });
    ctx.globalAlpha = 1;
  }
  function drawAim() {                               // crosshair at the cursor, a faint aim line, the charge ring
    var h = hero;
    if (!h.bow) return;
    var c = charge(h.bow.t), d = aimDir(), sx = h.x + d[0] * 6, sy = h.y - 8 - h.z + d[1] * 6, i;
    var x = Math.round(aimPt.x), y = Math.round(aimPt.y), len = Math.hypot(aimPt.x - sx, aimPt.y - sy), col = c >= 1 ? '#ffd34d' : '#ffffff';
    ctx.fillStyle = '#ffffff';
    for (i = 5; i < len - 8; i += 4) {
      ctx.globalAlpha = 0.2 + 0.25 * c;
      ctx.fillRect(Math.round(sx + d[0] * i), Math.round(sy + d[1] * i), 1, 1);
    }
    [[1, 'rgba(0,0,0,0.55)'], [0, col]].forEach(function (s) {   // dark shadow first, so it reads on light floor too
      ctx.globalAlpha = 1; ctx.fillStyle = s[1];
      var o = s[0];
      ctx.fillRect(x + o, y + o, 1, 1);
      ctx.fillRect(x - 5 + o, y + o, 3, 1); ctx.fillRect(x + 3 + o, y + o, 3, 1);
      ctx.fillRect(x + o, y - 5 + o, 1, 3); ctx.fillRect(x + o, y + 3 + o, 1, 3);
    });
    for (i = 0; i < 32; i++) {                       // fills clockwise from the top; gold when fully drawn
      var a = -Math.PI / 2 + i / 32 * TAU, on = i / 32 < c;
      ctx.globalAlpha = on ? 1 : 0.25;
      ctx.fillStyle = on ? (c >= 1 ? '#ffd34d' : '#9fe3ff') : '#ffffff';
      ctx.fillRect(Math.round(x + Math.cos(a) * 8), Math.round(y + Math.sin(a) * 8), 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  function drawSwing() {                               // the white crescent the blade leaves behind
    var h = hero;
    if (h.swing <= 0 || h.roll > 0 || h.slam) return;
    var p = 1 - h.swing / SWING_T, e = 1 - Math.pow(1 - p, 3), tail = Math.max(0, e - 0.6), a0 = h.swingA - h.side * 1.5;
    var cx = h.x, cy = h.y - 7 - h.z;
    for (var s = tail; s <= e; s += 0.03) {
      var ang = a0 + h.side * 3 * s, k = (s - tail) / (e - tail + 1e-6), c = Math.cos(ang), sn = Math.sin(ang) * SQ;
      ctx.globalAlpha = 0.25 + 0.75 * k;
      ctx.fillStyle = k > 0.7 ? '#ffffff' : k > 0.35 ? '#d6f0ff' : '#86c4f0';
      for (var r = Math.round(REACH - 1 - k * 7); r <= REACH; r++) ctx.fillRect(Math.round(cx + c * r), Math.round(cy + sn * r), 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  function drawBlob(b) {
    var fr = b.frozen > 0, x = Math.round(b.x) - (b.w + 2) / 2, y = Math.round(b.y - b.z) - b.h - 1;
    ctx.drawImage(blobImg(b.w, b.h, b.dead > 0 ? 1 : fr ? 2 : 0), x, y);
    if (b.dead > 0) return;
    var cx = Math.round(b.x) + b.look, ey = y + 1 + Math.round(b.h * 0.4) + b.ly, eh = b.blink < 0 && !fr ? 1 : 2, gap = b.w > 11 ? 3 : 2;
    ctx.fillStyle = fr ? ICE.K : BLOB.K;
    ctx.fillRect(cx - gap, ey + 2 - eh, 1, eh); ctx.fillRect(cx + gap - 1, ey + 2 - eh, 1, eh);
  }
  function plotRing(x, y, r, col, dash) {
    ctx.fillStyle = col;
    for (var i = 0, n = Math.ceil(r * 6.5); i < n; i++) {
      var a = i / n * TAU;
      if (!dash || (i + ((T * 40) | 0)) % 12 < 6) ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r * SQ), 1, 1);
    }
  }
  function line(x0, y0, x1, y1) {                    // 1-pixel line in the current colour
    for (var i = 0, n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); i <= n; i++) {
      ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1);
    }
  }
  function drawSkills() {                            // bolts, frost rings, falling meteors (all glow: drawn over the dark)
    bolts.forEach(function (o) {                     // a jagged, crackling trail behind a bright head
      var fade = o.end ? 1 - (T - o.end) / 0.18 : 1, s0 = Math.max(0, o.d - 120), n = Math.max(1, Math.ceil((o.d - s0) / 7));
      var px = o.x + o.ux * s0, py = o.y - o.z + o.uy * s0;
      for (var k = 1; k <= n; k++) {
        var s = s0 + (o.d - s0) * k / n, j = k < n ? rnd(-2.5, 2.5) : 0, qx = o.x + o.ux * s - o.uy * j, qy = o.y - o.z + o.uy * s + o.ux * j;
        ctx.globalAlpha = Math.max(0, fade) * (0.3 + 0.7 * k / n);
        ctx.fillStyle = k > n * 0.6 ? '#ffffff' : '#7fe0ff';
        line(px, py, qx, qy);
        if (k > n * 0.6) { var vx = Math.abs(o.uy) > 0.7 ? 1 : 0; line(px + vx, py + 1 - vx, qx + vx, qy + 1 - vx); }   // thicker near the head
        px = qx; py = qy;
      }
      if (!o.end) {
        ctx.globalAlpha = 1; ctx.fillStyle = '#bff4ff';
        ctx.fillRect(Math.round(px) - 2, Math.round(py), 5, 1); ctx.fillRect(Math.round(px), Math.round(py) - 2, 1, 5);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
      }
    });
    frosts.forEach(function (f) {                    // a ring of frost with glinting crystals
      ctx.globalAlpha = Math.max(0, 1 - f.t / 0.6);
      plotRing(f.x, f.y, f.r, '#e8f8ff'); plotRing(f.x, f.y, f.r - 2, '#7fc8f0');
      ctx.fillStyle = '#ffffff';
      for (var i = 0; i < 16; i++) {
        var a = hash(i, 3, Math.floor(T * 20)) * TAU;
        ctx.fillRect(Math.round(f.x + Math.cos(a) * (f.r + 1)), Math.round(f.y + Math.sin(a) * (f.r + 1) * SQ) - 1, 1, 1);
      }
    });
    meteors.forEach(function (m) {                   // a dashed ring marks where it lands, then the fireball
      var p = meteorAt(m);
      ctx.globalAlpha = 0.65 + 0.35 * Math.sin(T * 25);
      plotRing(m.x, m.y, 36, '#ffb35c', true); plotRing(m.x, m.y, 35, '#ff6a3d', true);
      ctx.globalAlpha = 1;
      ctx.drawImage(art.meteor, Math.round(p[0]) - 4, Math.round(m.y - p[1]) - 4);
    });
    ctx.globalAlpha = 1;
  }
  function drawParts(em) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!!p.e !== em) continue;
      ctx.globalAlpha = Math.min(1, p.t * 4);
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x), Math.round(p.y - p.z), p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }
  function render() {
    var h = hero, ox = 0, oy = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (shake > 0) {
      var s = Math.min(1, shake / 0.18) * 3;
      ox = Math.round(rnd(-s, s)); oy = Math.round(rnd(-s, s));
      ctx.fillStyle = '#07060b'; ctx.fillRect(0, 0, W, H);
    }
    ctx.setTransform(1, 0, 0, 1, ox, oy);
    ctx.drawImage(bg, 0, 0);
    splats.forEach(function (sp) {
      ctx.globalAlpha = Math.min(1, sp.t / sp.max * 2.5) * 0.85;
      sp.pts.forEach(function (p) { ctx.fillStyle = p[2]; ctx.fillRect(sp.x + p[0], sp.y + p[1], 1, 1); });
    });
    ctx.globalAlpha = 1;
    shadow(h.x, h.y, 5, h.z);
    blobs.forEach(function (b) { shadow(b.x, b.y, b.w / 2, b.z); });
    meteors.forEach(function (m) { var u = Math.min(1, m.t / 0.6); shadow(m.x, m.y, 3 + 10 * u, 0, 0.2 + 0.45 * u); });   // warning
    ghosts.forEach(function (g) {
      ctx.globalAlpha = g.t / 0.2 * 0.6;
      ctx.drawImage(art.ghost[g.f & 3], Math.round(g.x) - 5, Math.round(g.y) - 10);
    });
    ctx.globalAlpha = 1;
    blobs.concat([h]).sort(function (a, b) { return a.y - b.y; }).forEach(function (o) { if (o === h) drawHero(); else drawBlob(o); });
    drawParts(false);
    ctx.fillStyle = '#ffe2b0';                         // dust motes: drawn under the light map, so they show only in light
    for (var i = 0; i < 18; i++) {
      ctx.globalAlpha = 0.35 + 0.3 * Math.sin(T * 1.3 + i * 2.1);
      ctx.fillRect(Math.round((i * 97.3 + T * (2 + i % 4)) % (W + 20) - 10),
        Math.round(4 + (i * 53.7) % (H - 20) + Math.sin(T * 0.6 + i) * 5), 1, 1);
    }
    ctx.globalAlpha = 1;
    lighting();
    ctx.drawImage(lc, 0, 0, W, H);
    TORCHES.forEach(function (tp, i) { drawFlame(tp[0], tp[1], i); });
    drawParts(true);
    drawSkills();
    drawArrows();
    drawSwing();
    rings.forEach(function (r) {                     // shockwaves: slam and meteor
      var p = r.t / r.max, e = 1 - (1 - p) * (1 - p);
      ctx.globalAlpha = 1 - p;
      plotRing(r.x, r.y, 5 + r.r * e, p < 0.4 ? r.c[0] : r.c[1]);
      if (p > 0.12) plotRing(r.x, r.y, 3 + r.r * 0.7 * e, r.c[2]);
    });
    if (h.slam && h.vz < 0) {                          // speed lines on the way down
      ctx.globalAlpha = 0.7; ctx.fillStyle = '#fff4d6';
      ctx.fillRect(Math.round(h.x) - 5, Math.round(h.y - h.z) - 26, 1, 7);
      ctx.fillRect(Math.round(h.x) + 5, Math.round(h.y - h.z) - 24, 1, 6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(gc, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    drawAim();                                       // the crosshair stays crisp on top of everything
  }

  /* ---------- loop ---------- */

  function shouldRun() { return visible && !document.hidden && (!reduced || mode === 'player'); }
  function schedule() { if (!raf && shouldRun()) raf = requestAnimationFrame(frame); }
  function frame(ts) {
    raf = 0;
    if (!shouldRun()) { last = 0; return; }
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
    last = ts;
    step(dt);
    render();
    hud();
    schedule();
  }

  function boot() {
    root = document.getElementById('demo');
    if (!root || root.getAttribute('data-wd')) return;
    root.setAttribute('data-wd', '1');
    makeSprites();
    build();
    var saved = null;
    try { saved = localStorage.getItem('wasdmod-demo-level'); } catch (e) { /* storage blocked: use the default */ }
    setLevel(LEVELS[saved] ? saved : 'normal');
    saved = null;
    try { saved = localStorage.getItem('wasdmod-demo-layout'); } catch (e) { /* storage blocked: use the default */ }
    setLayout(LAYOUTS[saved] ? saved : 'rec');
    bg = makeBackground();
    lc = mk(LW, LH); lg = lc.getContext('2d'); limg = lg.createImageData(LW, LH);
    gc = mk(LW, LH); gg = gc.getContext('2d'); gimg = gg.createImageData(LW, LH);
    for (var i = 0; i < LW * LH * 4; i += 4) {
      limg.data[i] = 8; limg.data[i + 1] = 5; limg.data[i + 2] = 18; gimg.data[i + 3] = 255;
    }
    staticScene();
    var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    reduced = !!(mq && mq.matches);
    if (mq) {
      var onMq = function () { reduced = mq.matches; if (reduced && mode !== 'player') { render(); hud(); } schedule(); };
      if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    }
    if (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) root.classList.add('wd-coarse');
    sized();
    if (window.ResizeObserver) new ResizeObserver(sized).observe(root); else window.addEventListener('resize', sized);

    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    window.addEventListener('blur', function () { releaseAll(); syncHeld(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { releaseAll(); syncHeld(); } schedule(); });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('auxclick', function (e) { if (e.button > 2) e.preventDefault(); });   // side buttons: no back/forward
    cv.addEventListener('mousedown', mousedown);
    window.addEventListener('mousemove', mousemove);
    window.addEventListener('mouseup', mouseup);
    cv.addEventListener('pointerdown', pdown);
    cv.addEventListener('pointermove', pmove);
    cv.addEventListener('pointerup', pup);
    cv.addEventListener('pointercancel', pup);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        visible = e.isIntersecting;
        onscreen = visible && (e.intersectionRatio >= 0.5 || e.intersectionRect.height >= 0.5 * (window.innerHeight || 1));
        schedule();
      }, { threshold: [0, 0.25, 0.5, 0.75, 1] }).observe(cv);
    }
    render();
    hud();
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
