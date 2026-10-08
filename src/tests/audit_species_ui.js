// Audit of the species expansion, part 2: the Plushdex at phone width. 6,700 cards only work if the grid keeps a useful share of the screen: the toolbar (search, rarity,
// pattern, found/missing, six region counts) must not eat it. The real markup and the real stylesheet are laid out in an iframe of the phone's size.
import * as pd from '../plushdata.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const cssText = () => { const out = []; for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) out.push(r.cssText); } catch (e) { /* a sheet from another site */ } } return out.join('\n'); };

export default async function (ctx) {
  const { T, g, S, fresh } = ctx;
  const { speciesCount } = pd;

  await T('species.audit.plushdex-toolbar-leaves-the-grid-room-at-phone-width', async () => {
    fresh({}); const dex = {}; for (let id = 1; id <= speciesCount; id++) if (id % 3) dex[id] = 1 + (id % 9); S().dex = dex;
    g.ui.open('dex'); await wait(120);
    const root = document.getElementById('dex'); const html = root.outerHTML;
    g.ui.closeModals(); S().dex = {};
    const bad = [];
    for (const [W, H, minGrid, maxBar] of [[375, 812, 0.5, 0.22], [360, 640, 0.42, 0.28], [412, 915, 0.55, 0.2], [812, 375, 0.4, 0.3], [667, 375, 0.4, 0.3], [768, 1024, 0.5, 0.17]]) {
      const f = document.createElement('iframe'); f.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;border:0;visibility:hidden;pointer-events:none;z-index:-1`;
      f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${cssText()}</style></head><body>${html}</body></html>`;
      await new Promise((res, rej) => { f.onload = res; f.onerror = rej; document.body.appendChild(f); });
      try {
        const doc = f.contentDocument, win = f.contentWindow; const modal = doc.getElementById('dex'); modal.classList.remove('hidden');
        await wait(30);
        const bar = doc.getElementById('dexBar').getBoundingClientRect(), grid = doc.getElementById('dexGrid').getBoundingClientRect(), panel = doc.querySelector('#dex .panel').getBoundingClientRect();
        const tag = `${W}x${H}`;
        if (win.innerWidth !== W) bad.push(`${tag}: the probe is ${win.innerWidth} wide`);
        if (doc.documentElement.scrollWidth > W + 1) bad.push(`${tag}: the page scrolls sideways (${doc.documentElement.scrollWidth})`);
        if (panel.right > W + 0.5 || panel.left < -0.5) bad.push(`${tag}: the panel leaves the screen`);
        if (bar.right > panel.right + 0.5) bad.push(`${tag}: the toolbar is wider than the panel`);
        if (bar.height > H * maxBar) bad.push(`${tag}: the toolbar is ${Math.round(bar.height)} px of ${H} (more than ${Math.round(maxBar * 100)}%)`);
        if (grid.height < H * minGrid) bad.push(`${tag}: the card grid is only ${Math.round(grid.height)} px of ${H} (less than ${Math.round(minGrid * 100)}%)`);
        for (const b of doc.querySelectorAll('#dexBar button, #dexBar select, #dexBar input')) { const r = b.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && r.height < 26) bad.push(`${tag}: a toolbar control is ${Math.round(r.height)} px tall`); }
      } finally { f.remove(); }
    }
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });
}
