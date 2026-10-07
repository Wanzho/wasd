/* Keybinder core: the wasdmod key layout editor's own logic (actions, the built-in
   layouts, settings file in and out), so the website shows and exports exactly what
   the editor would. COPIED from wasdmod's configurator.html: its second <script>, from
   "use strict"; down to the line that sets globalThis.Keybinder. Refresh the block
   between the two COPY lines whenever the settings format changes. Only English is
   built in (no other LANGS), so all text stays English. Wrapped in a function so its
   names stay private; only globalThis.Keybinder is shared. */
(() => {
// ---- COPY START (configurator.html) ------------------------------------------------
"use strict";
// =================================================================== languages
// The page in every language the game has. English is the key: t("Move up") is the
// current language's text for it, or the English when it has none. The other
// languages are the "editor" part of lang/<code>.json, built in here by build.sh.
const LANGS = { en: { name: "English", t: {} } }; // build.sh puts the languages here
const _ = s => s; // marks text that t() translates where it's shown
let lang = "en";
function matchLang(tag) {
  const s = String(tag || "").toLowerCase().replace(/_/g, "-"), pick = code => LANGS[code] ? code : null;
  if (!s) return null;
  if (/^zh-(hant|tw|hk|mo)\b/.test(s)) return pick("zh-Hant");
  if (/^zh\b/.test(s)) return pick("zh-Hans");
  return Object.keys(LANGS).find(c => c.toLowerCase() === s.split("-")[0]) || null;
}
const tr = s => { const v = LANGS[lang] && LANGS[lang].t[s]; return typeof v === "string" && v ? v : s; };
const fill = (s, vars) => vars ? s.replace(/\{(\w+)\}/g, (m, k) => k in vars ? String(vars[k]) : m) : s;
const t = (s, vars) => fill(tr(s), vars);
// Text with a number in it: English has a "one" and an "other" form, other languages their
// own (Intl.PluralRules), and "=1" where one item reads differently.
function tn(one, other, n, vars) {
  const v = LANGS[lang] && LANGS[lang].t[other];
  let s = n === 1 ? one : other;
  if (typeof v === "string" && v) s = v;
  else if (v && typeof v === "object") { let c = "other"; try { c = new Intl.PluralRules(lang).select(n); } catch (e) {} s = v["=" + n] || v[c] || v.other || s; }
  return fill(s, { ...vars, n });
}
const andList = items => { try { return new Intl.ListFormat(lang, { type: "conjunction" }).format(items); } catch (e) { return items.join(", "); } };

// =================================================================== the game's actions
// Every row is one of the game's actions. Movement and fights always go through the
// virtual controller (pad). Menus the game has both ways (kb + pad) are switchable; a
// keyboard route sends the game's own keyboard shortcut ("game key"):
//   menu: opens a screen, so the mod switches to mouse mode
//   pass: an instant action (teleports), no mode change
//   back: Esc, the game menu / back
// `game` is the action's name in the game's Settings › Controls › Keyboard.
const PAD_NAMES = { A: "A", B: "B", X: "X", Y: "Y", LB: "LB", RB: "RB", LT: "LT", RT: "RT", LS: _("L-stick click"), RS: _("R-stick click"),
  DUp: _("D-pad ↑"), DDown: _("D-pad ↓"), DLeft: _("D-pad ←"), DRight: _("D-pad →"), Back: _("View"), Start: _("Menu") };
const padName = b => t(PAD_NAMES[b]);
const ACTIONS = [
  { id: "up", sec: "act", cat: "move", label: _("Move up"), move: "Up", badge: _("L-stick") },
  { id: "left", sec: "act", cat: "move", label: _("Move left"), move: "Left", badge: _("L-stick") },
  { id: "down", sec: "act", cat: "move", label: _("Move down"), move: "Down", badge: _("L-stick") },
  { id: "right", sec: "act", cat: "move", label: _("Move right"), move: "Right", badge: _("L-stick") },
  { id: "dodge", sec: "act", cat: "move", label: _("Directional dodge"), sub: _("click: dodge the way you're moving · click, drag, release: roll that way"), move: "DodgeMouse", badge: _("R-stick"), game: _("Directional Dodge") },
  { id: "fdodge", sec: "act", cat: "move", label: _("Forward dodge"), sub: _("quick dodge the way you face"), pad: "LB", game: _("Forward Dodge") },
  { id: "jump", sec: "act", cat: "action", label: _("Jump / interact"), pad: "A", game: _("Jump") },
  { id: "melee", sec: "act", cat: "action", label: _("Melee"), sub: _("in the air: heavy jump attack"), pad: "X", game: _("Interact, Melee Attack") },
  { id: "ranged", sec: "act", cat: "action", label: _("Ranged (bow)"), sub: _("hold a mouse button to aim with the mouse"), pad: "RT", game: _("Ranged Attack") },
  { id: "art1", sec: "act", cat: "action", label: _("Artifact 1"), pad: "Y", game: _("Artifact 1") },
  { id: "art2", sec: "act", cat: "action", label: _("Artifact 2"), pad: "B", game: _("Artifact 2") },
  { id: "art3", sec: "act", cat: "action", label: _("Artifact 3"), pad: "RB", game: _("Artifact 3") },
  { id: "potion", sec: "act", cat: "action", label: _("Health potion"), pad: "LT", game: _("Health Potion") },
  { id: "trail", sec: "act", cat: "action", label: _("Guidance trail"), pad: "LS", game: _("Guidance Trail") },
  { id: "tpplayer", sec: "act", cat: "action", label: _("Teleport to player"), pad: "DLeft", kb: "pass", game: _("Teleport To Player"), group: _("Teleports") },
  { id: "statue", sec: "act", cat: "action", label: _("Teleport statue"), kb: "pass", game: _("Teleport Statue") },
  { id: "tp1", sec: "act", cat: "action", label: _("Teleport to player 1"), kb: "pass", game: _("Teleport To Player 1") },
  { id: "tp2", sec: "act", cat: "action", label: _("Teleport to player 2"), kb: "pass", game: _("Teleport To Player 2") },
  { id: "tp3", sec: "act", cat: "action", label: _("Teleport to player 3"), kb: "pass", game: _("Teleport To Player 3") },
  { id: "tp4", sec: "act", cat: "action", label: _("Teleport to player 4"), kb: "pass", game: _("Teleport To Player 4") },
  { id: "inventory", sec: "menu", cat: "menu", label: _("Inventory"), sub: _("tap: full inventory · hold: mini inventory"), pad: "DUp", kb: "menu", opens: true, game: _("Inventory, Mini Inventory") },
  { id: "map", sec: "menu", cat: "menu", label: _("World map"), pad: "Back", kb: "menu", opens: true, game: _("World Map") },
  { id: "wheel", sec: "menu", cat: "menu", label: _("Menu wheel"), pad: "Start", kb: "menu", opens: true, game: _("Menu Wheel") },
  { id: "quest", sec: "menu", cat: "menu", label: _("Quest log / track quest"), sub: _("tap: track · hold: quest log"), pad: "DRight", kb: "menu", game: _("Quest Log, Track Quest") },
  { id: "social", sec: "menu", cat: "menu", label: _("Social menu"), pad: "DDown", kb: "menu", opens: true, game: _("Social Menu") },
  { id: "emotes", sec: "menu", cat: "menu", label: _("Emotes"), sub: _("hold for the wheel"), pad: "RS", kb: "menu", game: _("Emotes") },
  { id: "collect", sec: "menu", cat: "menu", label: _("Collectibles"), sub: _("capes, pets, books"), kb: "menu", game: _("Collectibles"), group: _("Keyboard only") },
  { id: "events", sec: "menu", cat: "menu", label: _("Event log"), kb: "menu", game: _("Event Log") },
  { id: "esc", sec: "menu", cat: "menu", label: _("Game menu / back"), sub: _("in a menu: back to the controller"), kb: "back", fixedGame: "Escape" },
  // In the game's keyboard settings only: no row, no keys of yours.
  { id: "heavy", hidden: true, game: _("Heavy Jump Attack"), note: _("the mod does it with jump, then melee in the air") },
  { id: "root", hidden: true, game: _("Root"), note: _("no controller equivalent") },
];
const ACT = Object.fromEntries(ACTIONS.map(a => [a.id, a]));
const both = a => !!(a.pad && a.kb);
// Keyboard or controller is a choice for the inventory (on the controller it shows the
// mini inventory while you keep moving); the other menus and Teleport to player only
// get it with "Allow controller input for menus" on.
const padAllowed = (a, st) => a.id === "inventory" || !!st.opt.ControllerMenus;
// The game's keys for an action: up to two (its two columns); null = empty column.
const knownGame = arr => (arr || []).filter(k => k && k !== "?");
const firstGame = (a, st) => a.fixedGame || knownGame(st.game[a.id])[0] || null;
const gameSlots = (a, st) => a.fixedGame ? [a.fixedGame] : knownGame(st.game[a.id]);
// The mod's row labels for the on-screen key list, per controller button.
const PAD_LABEL = { A: "Jump / interact", X: "Melee (in the air: heavy jump attack)", RT: "Ranged (bow)", Y: "Artifact 1", B: "Artifact 2", RB: "Artifact 3",
  LT: "Health potion", LB: "Forward dodge", LS: "Guidance trail", RS: "Emotes", DUp: "Inventory (tap: full, hold: mini)", DDown: "Social menu",
  DLeft: "Teleport to player", DRight: "Track quest / quest log", Back: "World map", Start: "Menu wheel" };
const PAD_ORDER = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Back", "Start", "LS", "RS", "DUp", "DDown", "DLeft", "DRight"];

// =================================================================== layouts
// The game's own keyboard defaults (Settings › Controls › Keyboard): both columns,
// first and second key. Heavy jump attack and root have no key of their own in
// the mod, but their game keys count for disabling and the checklist.
const GAME_DEFAULTS = { dodge: ["R", "Mouse4"], fdodge: ["Mouse5"], jump: ["Space"], melee: ["Mouse1"], ranged: ["Mouse2"], art1: ["1"], art2: ["2"], art3: ["3"],
  potion: ["E"], trail: ["Mouse3"], statue: ["Z"], tp1: ["F1"], tp2: ["F2"], tp3: ["F3"], tp4: ["F4"], inventory: ["I", "Tab"], map: ["M"], wheel: ["S"], quest: ["J"],
  social: ["F"], tpplayer: ["X"], emotes: ["G"], collect: ["U"], events: ["K"], heavy: ["Q", "Mouse4"], root: ["Shift"] };
// Default layout: the game's own keyboard keys, as a controller. The menu wheel
// moves from S (a movement key here) to Tab, so the inventory is I only.
const DEFAULT_INI = `[Move]
Up=W
Left=A
Down=S
Right=D
DodgeMouse=R, Mouse4
DodgeDragPx=40
DodgeFlickMs=80
[Movement]
AccelMs=45
DecelMs=35
TurnMs=110
[Buttons]
A=Space
B=2
X=Mouse1
Y=1
LB=Mouse5
RB=3
LT=E
RT=Mouse2
Back=None
Start=None
LS=Mouse3
RS=None
DUp=None
DDown=None
DLeft=None
DRight=None
[Mouse]
KeepCursorInWindow=1
MouseModeOnMovePx=40
MouseMoveSwitches=1
CursorFromMiddle=0
BumpNudgePct=30
BowAimsWithMouse=1
[Keys]
MenuKeys=I, M, J, F, G, U, K, Escape
BackKeys=Escape
MouseAfter=None
MenuTapMs=300
TypeKey=T
PassKeys=Z, F1, F2, F3, F4, X
Cursor=Alt
CursorMode=Hold
Toggle=Backtick
Legend=F9
[Remap]
Tab=S
[Modes]
inventory=Keyboard
map=Keyboard
wheel=Keyboard
quest=Keyboard
social=Keyboard
tpplayer=Keyboard
emotes=Keyboard
[Options]
HideMouse=1
BlockOtherKeys=1
DetectTextBoxes=1
TypedCharacters=0
Legend=1
LegendSeconds=15
Language=Auto
RequireFocus=1
AlwaysConnected=1
Log=1`;
// The Recommended layout: bow on side button 5, inventory (E), quests (V), social
// (/) and teleport (X) on the controller so you can keep moving, Tab for the menu wheel,
// everything else on the game's own keys. It assumes the game's default keyboard
// keys ("in game"), and the mod converts your keys onto them.
const AUTHOR_INI = `[Move]
Up=W
Left=A
Down=S
Right=D
DodgeMouse=Mouse2
DodgeDragPx=40
DodgeFlickMs=80
[Movement]
AccelMs=45
DecelMs=35
TurnMs=110
[Buttons]
A=Space, F
B=2
X=Mouse1
Y=Q
LB=Shift
RB=3
LT=R
RT=Mouse4
Back=None
Start=None
LS=Mouse3
RS=None
DUp=E
DDown=None
DLeft=None
DRight=None

[Mouse]
KeepCursorInWindow=1
MouseModeOnMovePx=50
MouseMoveSwitches=1
CursorFromMiddle=1
BumpNudgePct=30
BowAimsWithMouse=1
[Keys]
MenuKeys=M, G, K, Escape
BackKeys=Escape
MouseAfter=DUp
MenuTapMs=300
TypeKey=T
PassKeys=X, Z, F1, F2, F3, F4
DisabledKeys=1, I, J, U
InstantKeys=
Cursor=Alt
CursorMode=Hold
Toggle=Backtick
Legend=F9
[Remap]
Tab=S
B=U
Mouse4=Mouse2
V=J
/=F
[Modes]
inventory=Controller
map=Keyboard
wheel=Keyboard
quest=Keyboard
social=Keyboard
tpplayer=Keyboard
emotes=Keyboard
[Options]
HideMouse=1
BlockOtherKeys=1
DetectTextBoxes=1
TypedCharacters=0
Legend=1
LegendSeconds=15
Language=Auto
RequireFocus=1
AlwaysConnected=1
Log=1`;
const BUILTIN = { default: { name: _("Default"), text: DEFAULT_INI, file: "default.txt" }, author: { name: _("Recommended"), text: AUTHOR_INI, file: "author.txt" } };

// =================================================================== key names
const CODE_NAMES = { Space: "Space", Enter: "Enter", NumpadEnter: "Enter", Escape: "Escape", Tab: "Tab", ShiftLeft: "Shift", ShiftRight: "Shift",
  ControlLeft: "Ctrl", ControlRight: "Ctrl", AltLeft: "Alt", AltRight: "Alt", Backspace: "Backspace", CapsLock: "CapsLock",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Backquote: "Backtick", Minus: "-", Equal: "=",
  BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/" };
const ALIASES = { esc: "Escape", escape: "Escape", return: "Enter", enter: "Enter", control: "Ctrl", ctrl: "Ctrl", grave: "Backtick", tilde: "Backtick",
  backtick: "Backtick", space: "Space", tab: "Tab", shift: "Shift", lshift: "Shift", leftshift: "Shift", alt: "Alt", backspace: "Backspace", capslock: "CapsLock",
  up: "Up", down: "Down", left: "Left", right: "Right", mouse1: "Mouse1", mouse2: "Mouse2", mouse3: "Mouse3", mouse4: "Mouse4", mouse5: "Mouse5" };
const VK_NAMES = { 0x20: "Space", 0x0D: "Enter", 0x1B: "Escape", 0x09: "Tab", 0x10: "Shift", 0x11: "Ctrl", 0x12: "Alt", 0x08: "Backspace", 0x14: "CapsLock",
  0x26: "Up", 0x28: "Down", 0x25: "Left", 0x27: "Right", 0x01: "Mouse1", 0x02: "Mouse2", 0x04: "Mouse3", 0x05: "Mouse4", 0x06: "Mouse5", 0xC0: "Backtick" };
const PRETTY = { Up: "↑", Down: "↓", Left: "←", Right: "→", Escape: "Esc", Backtick: "`", Mouse1: _("Left click"), Mouse2: _("Right click"),
  Mouse3: _("Middle click"), Mouse4: _("Side 4 (back)"), Mouse5: _("Side 5 (front)"), CapsLock: "Caps Lock", "?": "?" };
const pretty = k => PRETTY[k] ? t(PRETTY[k]) : k;
const isMouse = k => /^Mouse[1-5]$/.test(k);
const isArrow = k => ["Up", "Down", "Left", "Right"].includes(k);

function normKey(raw) {
  let v = String(raw || "").trim();
  if (!v || /^none$/i.test(v)) return null;
  if (v === "?") return "?";
  if (v.length === 1) return /[a-z]/.test(v) ? v.toUpperCase() : v;
  const lower = v.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  const f = /^f(\d{1,2})$/i.exec(v); if (f && +f[1] >= 1 && +f[1] <= 12) return "F" + (+f[1]);
  const n = /^0x[0-9a-f]+$/i.test(v) ? parseInt(v, 16) : /^\d{2,3}$/.test(v) ? parseInt(v, 10) : NaN;
  if (!isNaN(n)) {
    if (VK_NAMES[n]) return VK_NAMES[n];
    if ((n >= 0x41 && n <= 0x5A) || (n >= 0x30 && n <= 0x39)) return String.fromCharCode(n);
    if (n >= 0x70 && n <= 0x7B) return "F" + (n - 0x6F);
  }
  return v;
}
const splitKeys = s => [...new Set(String(s || "").split(",").map(normKey).filter(k => k && k !== "?"))];
const uniq = a => [...new Set(a)];

// =================================================================== ini
function parseIni(text) {
  const out = {}; let sec = null;
  for (const lineRaw of String(text).split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line[0] === ";" || line[0] === "#") continue;
    const s = /^\[(.+)\]$/.exec(line);
    if (s) { sec = s[1].trim(); out[sec] = out[sec] || []; continue; }
    const i = line.indexOf("=");
    if (i < 0 || !sec) continue;
    out[sec].push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return out;
}
const get = (ini, sec, key) => { const e = (ini[sec] || []).filter(([k]) => k.toLowerCase() === key.toLowerCase()); return e.length ? e[e.length - 1][1] : undefined; };

const TUNE = [
  { sec: "Movement", key: "AccelMs", label: _("Speed-up time"), sub: _("time to reach full speed"), min: 0, max: 200, step: 5, unit: "ms" },
  { sec: "Movement", key: "DecelMs", label: _("Stopping time"), sub: _("time to come to a stop"), min: 0, max: 200, step: 5, unit: "ms" },
  { sec: "Movement", key: "TurnMs", label: _("Turn time"), sub: _("a full 180° turn; 90° takes half"), min: 0, max: 300, step: 10, unit: "ms" },
  { sec: "Move", key: "DodgeDragPx", label: _("Drag to roll"), sub: _("mouse travel that turns a dodge click into a roll"), min: 10, max: 150, step: 5, unit: "px" },
  { sec: "Move", key: "DodgeFlickMs", label: _("Dodge flick"), sub: _("how long each dodge holds the stick"), min: 30, max: 200, step: 10, unit: "ms" },
  { sec: "Mouse", key: "MouseModeOnMovePx", label: _("Mouse wakes the cursor"), sub: _("mouse travel (after letting go of WASD) that switches to mouse mode"), min: 0, max: 150, step: 5, unit: "px" },
  { sec: "Mouse", key: "BumpNudgePct", label: _("Bump correction"), sub: _("light right-stick nudge that undoes a small mouse bump; lower it if it ever makes you dodge, 0 = off"), min: 0, max: 60, step: 5, unit: "%" },
  { sec: "Keys", key: "MenuTapMs", label: _("Tap vs hold"), sub: _("shorter = tap (full menu), longer = hold (quick overlay)"), min: 100, max: 600, step: 25, unit: "ms" },
  { sec: "Options", key: "LegendSeconds", label: _("Key list at start"), sub: _("seconds the on-screen list shows when the game starts (0 = only on its key)"), min: 0, max: 60, step: 5, unit: "s" },
];
const flag = { read: v => v === "1", write: b => b ? "1" : "0" };
const TOGGLES = [
  { sec: "Mouse", key: "MouseMoveSwitches", label: _("Moving the mouse switches to mouse mode"), sub: _("off: only the cursor key (Alt), menus or the toggle key give you the mouse"), read: v => v !== "0", write: flag.write },
  { sec: "Keys", key: "CursorMode", label: _("Cursor key toggles the cursor"), sub: _("on: press once to show the cursor, again to hide it; off: shows only while held, like Genshin"), read: v => /^toggle$/i.test(String(v).trim()), write: b => b ? "Toggle" : "Hold" },
  { sec: "Mouse", key: "CursorFromMiddle", label: _("Cursor comes back in the middle"), sub: _("when moving the mouse brings the cursor back, it starts from the middle of the window; off: where the mouse moved it"), ...flag },
  { sec: "Mouse", key: "BowAimsWithMouse", label: _("Aim the bow with the mouse"), sub: _("holding a mouse button bound to the bow switches to keyboard mode until you let go"), ...flag },
  { sec: "Mouse", key: "KeepCursorInWindow", label: _("Keep the mouse inside the game window while playing"), sub: _("so a click can't land in another app"), ...flag },
  { sec: "Options", key: "BlockOtherKeys", label: _("Block keys that aren't used"), sub: _("a stray key can't flip the game into keyboard mode"), ...flag },
  { sec: "Options", key: "HideMouse", label: _("Hide mouse movement from the game while playing"), sub: _("keeps the game in controller mode"), ...flag },
  { sec: "Options", key: "Legend", label: _("On-screen key list"), ...flag },
];
const TG = key => TOGGLES.find(o => o.key === key);

// =================================================================== state from a settings file
// state = { keys: {id: [...]}, mode: {id: "kb"|"pad"}, game: {id: key|"?"}, mod: {...}, ... }
function stateFromIni(text) {
  const ini = parseIni(text), def = parseIni(DEFAULT_INI);
  const val = (sec, key) => { const v = get(ini, sec, key); return v !== undefined ? v : get(def, sec, key); };
  const st = { keys: {}, mode: {}, game: {}, mod: {}, num: {}, opt: {}, extraRemaps: [], extraMenuKeys: [], extraPass: [] };
  // The game's own keys: from the file, else the game's defaults.
  const parseGame = v => v === undefined ? null : String(v).split(",").slice(0, 2).map(x => x.trim()).map(x => !x || x === "-" || /^none$/i.test(x) ? null : x === "?" ? "?" : normKey(x));
  for (const a of ACTIONS) if (a.game) st.game[a.id] = parseGame(get(ini, "GameKeys", a.id)) || [...(GAME_DEFAULTS[a.id] || ["?"])];
  const buttons = Object.fromEntries(PAD_ORDER.map(b => [b, splitKeys(val("Buttons", b))]));
  const menuKeys = splitKeys(val("Keys", "MenuKeys")), passKeys = splitKeys(val("Keys", "PassKeys")), backKeys = splitKeys(val("Keys", "BackKeys"));
  const usedDirect = new Set();
  let remaps = (ini.Remap ? ini.Remap : def.Remap || []).map(([f, t]) => [normKey(f), normKey(t)]).filter(([f, t]) => f && t);
  const takeRemaps = test => { const hit = remaps.filter(test); remaps = remaps.filter(r => !test(r)); return hit.map(([f]) => f); };


  // Bow: its game key can also be told by a side-button remap (Mouse5=Mouse4).
  if (!get(ini, "GameKeys", "ranged")) {
    const r = remaps.find(([f, t]) => buttons.RT.includes(f) && isMouse(f) && isMouse(t));
    if (r) st.game.ranged = [r[1]];
  }
  for (const a of ACTIONS) {
    if (a.hidden) { st.keys[a.id] = []; continue; }
    if (a.move) { st.keys[a.id] = splitKeys(val("Move", a.move)); continue; }
    const padKeys = a.pad ? buttons[a.pad] : [];
    if (!a.kb) {
      st.keys[a.id] = a.id === "fdodge" ? uniq([...padKeys, ...splitKeys(val("Move", "Dodge"))]) : padKeys; // the old "quick dodge" is the forward dodge
      continue;
    }
    const slots = gameSlots(a, st);
    let kbKeys = [];
    if (slots.length) {
      const direct = [...menuKeys, ...passKeys, ...backKeys].filter(k => slots.includes(k));
      for (const k of direct) usedDirect.add(k);
      kbKeys = uniq([...direct, ...takeRemaps(([, t]) => slots.includes(t))]);
    }
    const saved = get(ini, "Modes", a.id);
    const mode = !both(a) ? (a.pad ? "pad" : "kb") : saved ? (/^c/i.test(saved) ? "pad" : "kb") : padKeys.length ? "pad" : "kb";
    if (both(a)) st.mode[a.id] = mode;
    st.keys[a.id] = uniq(mode === "pad" ? [...padKeys, ...kbKeys] : [...kbKeys, ...padKeys]);
  }
  // The bow's side-button remap is written from the bow row; drop it from the leftovers.
  takeRemaps(([f, t]) => st.keys.ranged.includes(f) && isMouse(f) && t === firstGame(ACT.ranged, st));
  st.extraMenuKeys = menuKeys.filter(k => !usedDirect.has(k));
  st.extraPass = passKeys.filter(k => !usedDirect.has(k));
  st.extraRemaps = remaps;
  st.mod.TypeKey = splitKeys(val("Keys", "TypeKey"));
  st.mod.Cursor = splitKeys(val("Keys", "Cursor"));
  st.mod.Toggle = splitKeys(val("Keys", "Toggle"));
  st.mod.Legend = splitKeys(val("Keys", "Legend"));
  for (const tu of TUNE) st.num[tu.key] = Number(val(tu.sec, tu.key));
  for (const o of TOGGLES) st.opt[o.key] = o.read(val(o.sec, o.key));
  st.optionsRaw = def.Options.map(([k]) => [k, val("Options", k)]);
  // Files from before the switch existed: on when another menu already uses the controller.
  const cm = get(ini, "Modes", "ControllerMenus");
  st.opt.ControllerMenus = cm !== undefined ? cm === "1" : ACTIONS.some(a => both(a) && a.id !== "inventory" && st.mode[a.id] === "pad");
  return st;
}

// How a row reaches the game right now: "move", "pad" or "kb".
function route(a, st) { return a.hidden ? "none" : a.move ? "move" : both(a) ? st.mode[a.id] : a.pad ? "pad" : "kb"; }

// =================================================================== settings file from state
function iniText(st) {
  const j = a => a.length ? a.join(", ") : "None";
  const L = [];
  L.push("; Keyboard & mouse as a controller for Minecraft Dungeons II.",
    "; Made with Dungeons II Keybinder. Put this file in the game's Win64 folder and",
    "; restart the game. The mod uses the newest of default.txt, author.txt and wasdmod*.txt.", "");
  const moveKeys = m => st.keys[ACTIONS.find(a => a.move === m).id];
  L.push("[Move]", ...["Up", "Left", "Down", "Right"].map(k => k + "=" + j(moveKeys(k))), "DodgeMouse=" + j(moveKeys("DodgeMouse")),
    "DodgeDragPx=" + st.num.DodgeDragPx, "DodgeFlickMs=" + st.num.DodgeFlickMs, "");
  L.push("[Movement]", "AccelMs=" + st.num.AccelMs, "DecelMs=" + st.num.DecelMs, "TurnMs=" + st.num.TurnMs, "");
  const padKeys = b => { const a = ACTIONS.find(x => x.pad === b); return a && route(a, st) === "pad" ? st.keys[a.id] : []; };
  L.push("[Buttons]", ...PAD_ORDER.map(b => b + "=" + j(padKeys(b))), "");
  L.push("[Labels]", ...PAD_ORDER.map(b => b + "=" + PAD_LABEL[b]), "");
  // Keyboard routes: a key that is the game's own key goes straight to the game;
  // any other key is remapped onto it.
  const menuKeys = [], passKeys = [], remaps = [], instant = [];
  // Every key you press for something (the game's own key for an action you moved
  // elsewhere is disabled unless it's one of these).
  const inputKeys = new Set([...ACTIONS.flatMap(a => st.keys[a.id]), ...MOD_ROWS.flatMap(r => r.get(st)), ...st.extraRemaps.map(([f]) => f)]);
  for (const a of ACTIONS) {
    if (route(a, st) !== "kb") continue;
    const g = firstGame(a, st);
    if (!g) continue; // unknown game key: nothing to send
    for (const k of st.keys[a.id]) {
      if (k === g) (a.kb === "pass" ? passKeys : menuKeys).push(k);
      else remaps.push([k, g]);
    }
    // A key remapped onto an instant action's game key (a teleport) doesn't open mouse mode.
    if (a.kb === "pass" && st.keys[a.id].some(k => k !== g)) instant.push(g);
  }
  // The bow in keyboard mode: a side button the game doesn't use for it is sent as the
  // mouse button it does use (e.g. side 4 as right click).
  const bowGame = firstGame(ACT.ranged, st);
  if (st.opt.BowAimsWithMouse && isMouse(bowGame) && bowGame !== "Mouse3")
    for (const k of st.keys.ranged) if ((k === "Mouse4" || k === "Mouse5") && k !== bowGame) remaps.push([k, bowGame]);
  const mouseAfter = ACTIONS.filter(a => a.opens && route(a, st) === "pad" && st.keys[a.id].length).map(a => a.pad);
  // The game's own key for an action you put on other keys stays off, in every mode.
  // Left click stays: it clicks in menus.
  const disabled = uniq(ACTIONS.flatMap(a => gameSlots(a, st)).filter(g => g !== "Mouse1" && !inputKeys.has(g)));
  L.push("[Mouse]", "KeepCursorInWindow=" + TG("KeepCursorInWindow").write(st.opt.KeepCursorInWindow),
    "MouseModeOnMovePx=" + st.num.MouseModeOnMovePx, "MouseMoveSwitches=" + TG("MouseMoveSwitches").write(st.opt.MouseMoveSwitches),
    "CursorFromMiddle=" + TG("CursorFromMiddle").write(st.opt.CursorFromMiddle),
    "BumpNudgePct=" + st.num.BumpNudgePct, "BowAimsWithMouse=" + TG("BowAimsWithMouse").write(st.opt.BowAimsWithMouse), "");
  L.push("[Keys]", "MenuKeys=" + j(uniq([...menuKeys, ...st.extraMenuKeys])), "BackKeys=Escape", "MouseAfter=" + j(mouseAfter),
    "MenuTapMs=" + st.num.MenuTapMs, "TypeKey=" + j(st.mod.TypeKey), "PassKeys=" + uniq([...passKeys, ...st.extraPass]).join(", "),
    "DisabledKeys=" + disabled.join(", "), "InstantKeys=" + uniq(instant).join(", "),
    "Cursor=" + j(st.mod.Cursor), "CursorMode=" + TG("CursorMode").write(st.opt.CursorMode), "Toggle=" + j(st.mod.Toggle), "Legend=" + j(st.mod.Legend), "");
  const remapLines = [...remaps, ...st.extraRemaps].map(([f, t]) => f + "=" + t);
  // An empty section would bring back the mod's built-in remaps; "None=None" keeps it empty.
  L.push("[Remap]", ...(remapLines.length ? remapLines : ["None=None"]), "");
  L.push("; Keyboard or controller for each menu (for the key layout editor), and the game's",
    "; own keyboard keys (Settings > Controls > Keyboard); the key list names converted keys from them.",
    "[Modes]", "ControllerMenus=" + (st.opt.ControllerMenus ? "1" : "0"), ...ACTIONS.filter(both).map(a => a.id + "=" + (st.mode[a.id] === "pad" ? "Controller" : "Keyboard")), "");
  const slotText = arr => { const a = (arr || []).slice(0, 2); while (a.length && !a[a.length - 1]) a.pop(); return a.length ? a.map(k => k || "-").join(", ") : "None"; };
  L.push("[GameKeys]", ...ACTIONS.filter(a => a.game).map(a => a.id + "=" + slotText(st.game[a.id])), "");
  L.push("[Options]", ...st.optionsRaw.map(([k, v]) => {
    if (k === "HideMouse") return k + "=" + TG("HideMouse").write(st.opt.HideMouse);
    if (k === "BlockOtherKeys") return k + "=" + TG("BlockOtherKeys").write(st.opt.BlockOtherKeys);
    if (k === "Legend") return k + "=" + TG("Legend").write(st.opt.Legend);
    if (k === "LegendSeconds") return k + "=" + st.num.LegendSeconds;
    return k + "=" + v;
  }));
  return L.join("\n") + "\n";
}

// =================================================================== the game's keyboard settings to change
// For keyboard mode to match your layout, each action's keys in the game's keyboard
// settings should be yours: the first column one of your keys, and anything else
// cleared (an action you have no key for loses its game keys too). Keyboard only;
// the controller layout stays the game's default, which the mod relies on.
// Each item: { a, slot (0 first column, 1 second), want (key, or null = clear it), was }.
function recommendations(st) {
  const out = [];
  for (const a of ACTIONS) {
    if (!a.game) continue;
    const keys = st.keys[a.id], g = st.game[a.id] || [];
    if (!keys.length) { g.forEach((k, i) => { if (k && k !== "?") out.push({ a, slot: i, want: null, was: k }); }); continue; }
    if (!keys.includes(g[0])) out.push({ a, slot: 0, want: keys.find(k => !isArrow(k)) || keys[0], was: g[0] || null });
    if (g[1] && g[1] !== "?" && !keys.includes(g[1])) out.push({ a, slot: 1, want: null, was: g[1] });
  }
  return out;
}

// Every key -> the rows that use it (for conflicts and the keyboard map).
function usage(st) {
  const map = new Map();
  const add = (k, row) => { if (!map.has(k)) map.set(k, []); map.get(k).push(row); };
  for (const a of ACTIONS) for (const k of st.keys[a.id]) add(k, { cat: a.cat, name: t(a.label) });
  for (const r of MOD_ROWS) for (const k of r.get(st)) add(k, { cat: "mod", name: t(r.label) });
  for (const [f] of st.extraRemaps) add(f, { cat: "menu", name: t("Custom remap") });
  return map;
}
const MOD_ROWS = [
  { id: "TypeKey", label: _("Typing mode"), sub: _("every key goes to the game until Esc"), max: 3, get: st => st.mod.TypeKey, set: (st, v) => st.mod.TypeKey = v },
  { id: "Cursor", label: _("Cursor key"), sub: _("shows the normal mouse (hold or toggle: see options)"), max: 3, get: st => st.mod.Cursor, set: (st, v) => st.mod.Cursor = v },
  { id: "Toggle", label: _("Mod on / off"), max: 3, get: st => st.mod.Toggle, set: (st, v) => st.mod.Toggle = v },
  { id: "Legend", label: _("On-screen key list"), max: 3, get: st => st.mod.Legend, set: (st, v) => st.mod.Legend = v },
  { id: "PassKeys", label: _("Always send to the game"), sub: _("these keys reach the game as they are"), max: 8, get: st => st.extraPass, set: (st, v) => st.extraPass = v },
  { id: "OtherMenus", label: _("Other menu shortcuts"), sub: _("sent to the game; switch to mouse mode"), max: 8, get: st => st.extraMenuKeys, set: (st, v) => st.extraMenuKeys = v },
];

// =================================================================== the game's own keyboard settings file
// The game keeps Settings › Controls › Keyboard in SaveGames\EnhancedInputUserSettings.sav,
// an Unreal save (GVAS). Only the keys you changed are in it, in the keyboard profile:
// per change the action's name, the key, two device fields ("None") and 6 bytes whose
// last is the column (0 first, 1 second). Nothing else in the file counts its length,
// so changes can be written in place. The apps read it to show the game's real keys,
// and can write it while the game is closed. Anything unexpected: not touched.
const CONTROLS_PROFILE = "/Script/SWCoreGameplay.SWEnhancedPlayerMappableKeyProfile", CONTROLS_KEYBOARD = "SW.Input.Profile.InputType.Keyboard";
// The game's names for the actions (one row in its settings can be two of them). Rows
// not listed here keep the keys typed into the editor; the checklist asks for them.
const GAME_ACTIONS = { melee: ["PrimaryAction"], ranged: ["RangedAttack"], heavy: ["HeavyJumpAttack"], art1: ["Artifact1"], potion: ["HealthPotion"],
  root: ["Root"], dodge: ["DirectionalDodge"], fdodge: ["ForwardDodge"], inventory: ["Inventory", "MiniInventory"], quest: ["QuestLog", "TrackQuest"],
  wheel: ["MenuWheel"], collect: ["IA_OpenUI_Collectibles"], social: ["SocialMenu"] };
const UE_KEYS = { Space: "SpaceBar", Shift: "LeftShift", Ctrl: "LeftControl", Alt: "LeftAlt", Tab: "Tab", Escape: "Escape", Enter: "Enter",
  Backspace: "BackSpace", CapsLock: "CapsLock", Backtick: "Tilde", Up: "Up", Down: "Down", Left: "Left", Right: "Right", "-": "Hyphen", "=": "Equals",
  "[": "LeftBracket", "]": "RightBracket", ";": "Semicolon", "'": "Apostrophe", ",": "Comma", ".": "Period", "/": "Slash", "\\": "Backslash",
  Mouse1: "LeftMouseButton", Mouse2: "RightMouseButton", Mouse3: "MiddleMouseButton", Mouse4: "ThumbMouseButton", Mouse5: "ThumbMouseButton2" };
["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"].forEach((n, i) => { UE_KEYS[String(i)] = n; });
const FROM_UE = Object.fromEntries(Object.entries(UE_KEYS).map(([k, v]) => [v, k]));
Object.assign(FROM_UE, { RightShift: "Shift", RightControl: "Ctrl", RightAlt: "Alt" });
["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"].forEach((n, i) => { FROM_UE["NumPad" + n] = String(i); });
const ueKey = k => !k ? "None" : UE_KEYS[k] || (/^([A-Z]|F([1-9]|1[0-2]))$/.test(k) ? k : null);
const fromUe = u => u === "None" ? null : FROM_UE[u] || (/^([A-Z]|F([1-9]|1[0-2]))$/.test(u) ? u : undefined); // undefined: a key the editor has no name for

function parseControls(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), bad = () => { throw new Error("format"); };
  let p = 0;
  const i32 = () => { if (p + 4 > bytes.length) bad(); const x = v.getInt32(p, true); p += 4; return x; };
  const str = () => {
    const n = i32(); if (n <= 0 || n > 512 || p + n > bytes.length || bytes[p + n - 1] !== 0) bad();
    let s = ""; for (let i = 0; i < n - 1; i++) { const c = bytes[p + i]; if (c < 32 || c > 126) bad(); s += String.fromCharCode(c); }
    p += n; return s;
  };
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "GVAS") bad();
  const enc = new TextEncoder().encode(CONTROLS_PROFILE), find = from => { outer: for (let i = from; i + enc.length < bytes.length; i++) { for (let j = 0; j < enc.length; j++) if (bytes[i + j] !== enc[j]) continue outer; return i - 4; } return -1; };
  const first = find(0); if (first < 8) bad();
  p = first - 4; const count = i32(); if (count < 1 || count > 64) bad();
  const profiles = [];
  for (let e = 0; e < count; e++) {
    if (str() !== CONTROLS_PROFILE) bad();
    str(); const at = p, n = i32(); if (n < 0 || n > 2000) bad();
    const records = [];
    for (let r = 0; r < n; r++) {
      const name = str(), key = str(), dev1 = str(), dev2 = str();
      if (p + 6 > bytes.length) bad();
      const tail = bytes.slice(p, p + 6); p += 6; if (tail[5] > 1) bad();
      records.push({ name, key, dev1, dev2, tail, slot: tail[5] });
    }
    profiles.push({ at, end: p, records, id: str() });
  }
  const keyboard = profiles.find(x => x.id === CONTROLS_KEYBOARD); if (!keyboard) bad();
  return { bytes, keyboard };
}
// The game's keys per editor row, from the file (a row without changes has its defaults).
function controlsKeys(ctl) {
  const out = {};
  for (const [id, names] of Object.entries(GAME_ACTIONS)) {
    const g = [...(GAME_DEFAULTS[id] || [])]; while (g.length < 2) g.push(null);
    for (const r of ctl.keyboard.records) if (r.name === names[0]) { const k = fromUe(r.key); g[r.slot] = k === undefined ? null : k; }
    out[id] = g.slice(0, 2);
  }
  return out;
}
// The file with these rows set ({id: [first, second]}); other changes in it stay as they are.
function writeControls(ctl, want) {
  const recs = ctl.keyboard.records.map(r => ({ ...r })), tail5 = recs.length ? recs[0].tail.slice(0, 5) : new Uint8Array(5);
  for (const [id, keys] of Object.entries(want)) for (const name of GAME_ACTIONS[id] || []) for (const slot of [0, 1]) {
    const k = keys[slot] || null, ue = ueKey(k); if (ue === null) continue; // a key the game can't take: left alone
    const have = recs.find(r => r.name === name && r.slot === slot);
    const now = have ? (fromUe(have.key) === undefined ? null : fromUe(have.key)) : (GAME_DEFAULTS[id] || [])[slot] || null;
    if (now === k) continue;
    if (have) have.key = ue;
    else { const tail = new Uint8Array(6); tail.set(tail5); tail[5] = slot; recs.push({ name, key: ue, dev1: "None", dev2: "None", tail, slot }); }
  }
  const parts = [], put = s => { const b = new TextEncoder().encode(s); const n = new Uint8Array(4 + b.length + 1); new DataView(n.buffer).setInt32(0, b.length + 1, true); n.set(b, 4); parts.push(n); };
  const count = new Uint8Array(4); new DataView(count.buffer).setInt32(0, recs.length, true); parts.push(count);
  for (const r of recs) { put(r.name); put(r.key); put(r.dev1); put(r.dev2); parts.push(r.tail); }
  const mid = parts.reduce((a, b) => a + b.length, 0), out = new Uint8Array(ctl.keyboard.at + mid + ctl.bytes.length - ctl.keyboard.end);
  out.set(ctl.bytes.subarray(0, ctl.keyboard.at), 0); let o = ctl.keyboard.at;
  for (const b of parts) { out.set(b, o); o += b.length; }
  out.set(ctl.bytes.subarray(ctl.keyboard.end), o);
  return out;
}

if (typeof globalThis !== "undefined") globalThis.Keybinder = { ACTIONS, DEFAULT_INI, AUTHOR_INI, GAME_DEFAULTS, stateFromIni, iniText, recommendations, usage, route, parseIni, parseControls, controlsKeys, writeControls, GAME_ACTIONS };
// ---- COPY END ------------------------------------------------------------------------
// Website additions: a few more of the editor's helpers for the key map (keymap.js).
Object.assign(globalThis.Keybinder, { MOD_ROWS, CODE_NAMES, normKey, isMouse });
})();
