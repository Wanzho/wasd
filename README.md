# wasdmod website

The page at https://wasdmod.com/ for [wasdmod](https://github.com/Wanzho/mcd2-wasd), WASD controls for Minecraft Dungeons II.

Plain HTML, CSS and JavaScript, served by GitHub Pages from `main`, with no build step and no outside requests except one to GitHub's API for the newest version number:

- `index.html`, `style.css`, `site.js`: the page and its scroll animations (`?y=1234` in the URL jumps to that scroll position, for screenshots).
- `demo.js`, `demo.css`: the playable demo in "Try it", drawn in code.
- `keymap.js`, `keymap.css`: the interactive key map in "Controls" (move keys, export the layout).
- `keybinder-core.js`: the key layout editor's own logic, which the key map shows and exports. It is copied from wasdmod's `configurator.html` (its second `<script>`, from the start to the line that sets `globalThis.Keybinder`) and must be refreshed whenever the settings format changes.
- `editor-snap.html`, `editor-tour.js`, `editor.webp`: the live key layout editor in "Key layout editor". `editor-snap.html` is a frozen copy of wasdmod's `configurator.html` in its dark Windows look (English, Recommended, the game's keys matching), shown in a shadow root and toured step by step as you scroll; `editor.webp` is the same view for visitors without JavaScript. Make both again whenever the editor's look changes: `node editor-snap.mjs ../wasdmod/configurator.html --webp` (needs Chrome, Node 22 or later and `cwebp`).
- `privacy.html`: the privacy page.

The "wasdmod" wordmark uses "Mojang" by b.tenthousand (CC0), `pixel.ttf`; everything else uses the system font. All art is original.
