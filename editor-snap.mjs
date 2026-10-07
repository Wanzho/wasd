// Makes editor-snap.html (and, with --webp, editor.webp): the key layout editor for the
// "Key layout editor" section, frozen from the real one, wasdmod's configurator.html.
//
//   node editor-snap.mjs [path/to/configurator.html] [--webp]
//
// It opens the editor in Chrome (headless) as the Windows setup's editor window would show it:
// window.wasdmodHost says app "win", English, the Recommended layout, and a game whose own
// keyboard settings already match it, so the checklist says "All set". Then it copies the built
// page without scripts, handlers, titles or aria, keeps the editor's CSS rules that match the copy
// (made to work in a shadow root), and adds two templates made by using the editor itself: a key
// bound twice (the red notice) and three of the game's keys still to change (the checklist).
// --webp also renders that view at 2x and saves it as editor.webp (1200 x 900) for visitors
// without JavaScript; it needs cwebp. Chrome: set CHROME if it isn't in the usual place.
// Needs Node 22 or later (WebSocket and fetch built in).
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const EDITOR = resolve(args.find(a => !a.startsWith("--")) || join(here, "../wasdmod/configurator.html"));
const WEBP = args.includes("--webp");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 1280, H = 960;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- the Windows setup's window.wasdmodHost, stubbed
const STUB = `window.wasdmodHost = (() => {
  const store = { "d2kb-current": "author", "d2kb-lang": "en" };
  const enc = s => { const b = new TextEncoder().encode(s), o = new Uint8Array(b.length + 5); new DataView(o.buffer).setInt32(0, b.length + 1, true); o.set(b, 4); return o; };
  const i32 = n => { const o = new Uint8Array(4); new DataView(o.buffer).setInt32(0, n, true); return o; };
  const cat = parts => { const o = new Uint8Array(parts.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of parts) { o.set(x, i); i += x.length; } return o; };
  const b64 = u => { let s = ""; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
  // the game's settings file: an empty keyboard profile, then the keys the checklist asks for,
  // written the way the editor's "Apply to the game's controls" does
  function controls() {
    const K = globalThis.Keybinder;
    const base = cat([new TextEncoder().encode("GVAS"), new Uint8Array(8), i32(1), enc("/Script/SWCoreGameplay.SWEnhancedPlayerMappableKeyProfile"),
      enc("Keyboard"), i32(0), enc("SW.Input.Profile.InputType.Keyboard"), new Uint8Array(8)]);
    const st = K.stateFromIni(K.AUTHOR_INI), want = {};
    for (const r of K.recommendations(st)) if (K.GAME_ACTIONS[r.a.id]) (want[r.a.id] = want[r.a.id] || (st.game[r.a.id] || []).slice(0, 2))[r.slot] = r.want;
    return b64(K.writeControls(K.parseControls(base), want));
  }
  return { store, lang: "en", app: "win", game: null, set(k, v) { store[k] = String(v); }, async gameControls() { return controls(); },
    async writeGameControls() { return ""; }, setLang() {}, async save(name) { return name; } };
})();`;

// ---- runs in the editor's page
function inPage() {
  const KEEP = new Set(["class", "id", "style", "data-k", "data-kind", "data-cat", "data-action", "data-slot", "data-d", "disabled", "checked", "selected",
    "type", "value", "label", "viewBox", "width", "height", "fill", "d"]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (test, ms = 5000) => { const t0 = Date.now(); while (!test()) { if (Date.now() - t0 > ms) throw new Error("timed out"); await sleep(25); } };
  const press = code => window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code.replace(/^(Key|Digit)/, "").toLowerCase(), bubbles: true }));
  // a copy as the website shows it: no scripts, handlers, hidden parts, titles or aria; the
  // map keys keep what they do (the editor's describe() text) as data-d
  function clean(node, cutY) {
    if (cutY != null) for (const e of node.querySelectorAll("main > section, #sec-act > *")) if (e.getBoundingClientRect().top > cutY) e.setAttribute("data-cut", "");
    const c = node.cloneNode(true);
    for (const e of [...c.querySelectorAll("script, [hidden], [data-cut]")]) e.remove();
    if (cutY != null) for (const e of node.querySelectorAll("[data-cut]")) e.removeAttribute("data-cut");
    const tw = document.createTreeWalker(c, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT), drop = [];
    while (tw.nextNode()) { const n = tw.currentNode; if (n.nodeType === 8) drop.push(n); else if (!n.nodeValue.trim()) n.nodeValue = " "; }
    drop.forEach(n => n.remove());
    for (const e of [c, ...c.querySelectorAll("*")]) {
      if (e.classList.contains("k") && e.hasAttribute("aria-label")) e.setAttribute("data-d", e.getAttribute("aria-label"));
      for (const a of [...e.attributes]) if (!KEEP.has(a.name)) e.removeAttribute(a.name);
    }
    return c;
  }
  // the editor's stylesheet cut down to the rules that match the copy, with :root and body made
  // .ed-html and .ed-body (it lives in a shadow root); no media queries on the page's width or
  // colour scheme, since the copy is always a 1280 px dark window
  function css(test) {
    const sheet = [...document.styleSheets].find(s => s.ownerNode && s.ownerNode.tagName === "STYLE");
    const dyn = /\.(conflict|listening|stray|wave|fresh|show|below|ktip|toast)\b/; // classes the website's tour puts on
    const out = [], frames = [];
    const split = s => { const parts = []; let depth = 0, cur = ""; for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && !depth) { parts.push(cur.trim()); cur = ""; } else cur += ch; } parts.push(cur.trim()); return parts; };
    const rewrite = s => s.replace(/:root/g, ".ed-html").replace(/(^|[\s,>+~(])body\b/g, "$1.ed-body");
    const relax = s => s.replace(/::?(before|after|marker|placeholder|-webkit-[\w-]+)/g, "").replace(/:(hover|active|focus-visible|focus-within|focus)\b/g, "").trim();
    const matches = s => { const r = relax(s); if (!r || /[>+~]$/.test(r)) return false; try { return test.matches(r) || !!test.querySelector(r); } catch (e) { return false; } };
    function walk(rules, into) {
      for (const r of rules) {
        if (r instanceof CSSStyleRule) {
          if (r.selectorText === ":root") continue; // the light theme's colours: the app's own replace them all
          const parts = split(rewrite(r.selectorText)).filter(p => !/::?(selection|-webkit-scrollbar)|:lang\(/.test(p)).filter(p => dyn.test(p) || matches(p));
          if (parts.length) into.push(parts.join(", ") + " { " + r.style.cssText + " }");
        } else if (r instanceof CSSMediaRule) {
          const c = r.conditionText || r.media.mediaText;
          if (/width|prefers-color-scheme/.test(c)) continue;
          const inner = []; walk(r.cssRules, inner);
          if (inner.length) into.push("@media " + c + " { " + inner.join(" ") + " }");
        } else if (r instanceof CSSSupportsRule) {
          const inner = []; walk(r.cssRules, inner);
          if (inner.length) into.push("@supports " + r.conditionText + " { " + inner.join(" ") + " }");
        } else if (r instanceof CSSKeyframesRule) frames.push(r);
      }
    }
    walk(sheet.cssRules, out);
    const text = out.join("\n");
    for (const f of frames) if (new RegExp("\\b" + f.name + "\\b").test(text)) out.push(f.cssText.replace(/\s+/g, " "));
    return out.join("\n");
  }
  return {
    async ready() { await until(() => document.querySelector(".allset") && document.querySelector("#kbd .k")); await sleep(150); },
    async clash() { // Health potion also gets Q, Artifact 1's key: the editor's red notice
      document.querySelector('.row[data-action="potion"] .add').click(); press("KeyQ");
      await until(() => document.querySelector("#conflicts .conflicts"));
      return clean(document.querySelector("#conflicts")).innerHTML;
    },
    async recs() { // three of the game's keys not changed yet: the checklist
      for (const [id, code] of [["art1", "Digit1"], ["potion", "KeyE"], ["wheel", "KeyS"]]) {
        document.querySelector(`.row[data-action="${id}"] .ingame button[data-slot="0"]`).click(); press(code); await sleep(30);
      }
      await until(() => document.querySelectorAll("#recsCard ul.recs li").length === 3);
      return clean(document.querySelector("#recsCard")).innerHTML;
    },
    main(cutY) {
      const wrap = clean(document.querySelector(".wrap"), cutY);
      const first = wrap.querySelector("header > div:first-child"); if (first) first.replaceChildren(); // the web page's title (hidden in the app)
      return { wrap: wrap.outerHTML, toast: clean(document.querySelector("#toast")).outerHTML, ktip: clean(document.querySelector("#ktip")).outerHTML };
    },
    css(html) {
      const t = document.createElement("div"); t.className = "ed-html app win";
      t.innerHTML = '<div class="ed-body">' + html + "</div>";
      return css(t);
    },
  };
}

// ---- a small Chrome driver (DevTools protocol)
async function chrome(width, height, dpr) {
  const dir = mkdtempSync(join(tmpdir(), "edsnap-chrome-")), port = 9300 + Math.floor(Math.random() * 600);
  const proc = spawn(CHROME, ["--headless=new", "--remote-debugging-port=" + port, "--user-data-dir=" + dir, "--no-first-run", "--hide-scrollbars",
    "--allow-file-access-from-files", "--window-size=" + width + "," + height, "about:blank"], { stdio: "ignore" });
  let ver = null;
  for (let i = 0; i < 100 && !ver; i++) { await sleep(100); try { ver = await (await fetch("http://127.0.0.1:" + port + "/json/version")).json(); } catch (e) { /* not up yet */ } }
  if (!ver) throw new Error("Chrome didn't start: " + CHROME);
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), waiters = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
    else if (m.method) waiters.slice().forEach(w => w(m));
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Page.enable"); await s("Runtime.enable");
  await s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
  return {
    async goto(url) {
      const loaded = new Promise(res => { const w = m => { if (m.sessionId === sessionId && m.method === "Page.loadEventFired") { waiters.splice(waiters.indexOf(w), 1); res(); } }; waiters.push(w); });
      await s("Page.navigate", { url }); await loaded;
    },
    async eval(expression) {
      const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
      return r.result.value;
    },
    async shot() { return Buffer.from((await s("Page.captureScreenshot", { format: "png" })).data, "base64"); },
    async close() { try { ws.close(); } catch (e) { /* closed */ } proc.kill(); await sleep(300); rmSync(dir, { recursive: true, force: true }); },
  };
}

// ---- make it
const tmp = mkdtempSync(join(tmpdir(), "edsnap-"));
const page = join(tmp, "editor.html");
writeFileSync(page, "<!doctype html>\n<meta charset=\"utf-8\">\n<script>\n" + STUB + "\n</script>\n" + readFileSync(EDITOR, "utf8"));
const c = await chrome(W, 2400, 1); // tall, so the editor's sticky side column isn't cut short
const load = async () => { await c.goto("file://" + page); await c.eval("window.__snap = (" + inPage.toString() + ")(); __snap.ready()"); };
let main, conflicts, recs, style;
try {
  await load(); main = await c.eval(`__snap.main(${H + 200})`);
  await load(); conflicts = await c.eval("__snap.clash()");
  await load(); recs = await c.eval("__snap.recs()");
  const test = main.wrap + main.toast + main.ktip + '<div id="conflicts">' + conflicts + '</div><section class="card" id="recsCard">' + recs + "</section>";
  style = await c.eval(`__snap.css(${JSON.stringify(test)})`);
} finally { await c.close(); }

style += `
/* ---- the website's copy: a fixed 1280 x ${H} window (not part of the editor) */
.ed-html { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; contain: layout paint; }
.ed-html.app.win { --display: "Segoe UI Variable Text", "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif; --body: var(--display); --mono: "Cascadia Mono", Consolas, ui-monospace, Menlo, monospace; }
.app header { -webkit-backdrop-filter: none; backdrop-filter: none; }
.app .side { position: static; max-height: none; overflow: visible; -webkit-mask-image: none; mask-image: none; }
.app .toast { max-width: 560px; }
.app .ktip { max-width: 280px; }`;

const html = `<!-- The wasdmod key layout editor (configurator.html in wasdmod), frozen for the website's
     editor tour: its dark Windows look at ${W} x ${H}, in English, with the Recommended layout and the
     game's keys matching ("All set"). Built from the running editor; no scripts. The templates
     are the same editor after two changes: a key bound twice, and three of the game's keys to change.
     Made by editor-snap.mjs; make it again whenever the editor's look changes (see README.md). -->
<meta name="robots" content="noindex">
<style>
${style}
</style>
<div class="ed-html app win" lang="en"><div class="ed-body">${main.wrap}${main.ktip}</div>${main.toast}</div>
<template id="ed-conflicts">${conflicts}</template>
<template id="ed-recs">${recs}</template>
`;
writeFileSync(join(here, "editor-snap.html"), html);
console.log("editor-snap.html:", Buffer.byteLength(html), "bytes,", gzipSync(html, { level: 9 }).length, "gzipped");

if (WEBP) {
  // the same view as a picture, at 2x, for visitors without JavaScript
  const view = join(tmp, "view.html");
  writeFileSync(view, `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#0b0b0d}</style><div id="h"></div>
<script>document.getElementById("h").attachShadow({ mode: "open" }).innerHTML = ${JSON.stringify(html)};</script>`);
  const v = await chrome(W, H, 2);
  let png;
  try { await v.goto("file://" + view); await sleep(1200); png = await v.shot(); } finally { await v.close(); }
  writeFileSync(join(tmp, "view.png"), png);
  execFileSync("cwebp", ["-quiet", "-q", "78", "-sharp_yuv", "-m", "6", "-resize", "1200", "900", join(tmp, "view.png"), "-o", join(here, "editor.webp")]);
  console.log("editor.webp:", readFileSync(join(here, "editor.webp")).length, "bytes");
}
rmSync(tmp, { recursive: true, force: true });
