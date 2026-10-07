// Shared helpers for the Crafting Table browser tests (src/bench.js). No default export: other bench_*.js files and the older bench readers import it.
// The bench has a grid of cards (#craftGrid .bcard, one per row) and a detail pane (#benchDetail) with the text and the craft buttons of the selected card.
export function benchKit(ctx) {
  const { g } = ctx;
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  // forget the remembered tab and search so the window opens on ALL (what every reader of the old flat grid expects)
  const reset = () => { try { localStorage.removeItem('rf.bench'); } catch (e) { /* no storage: nothing to forget */ } g.ui.bench = null; };
  const open = () => { g.ui.closeModals(); reset(); g.ui.open('craft'); };
  const cards = () => [...document.querySelectorAll('#craftGrid .bcard')];
  const cardEl = (id) => cards().find((c) => c.dataset.id === id) || null;
  // select a row and hand back the detail pane (its text, its craft buttons); null when the row has no card in the current tab
  const pick = (id) => { const c = cardEl(id); if (!c) return null; c.click(); return document.getElementById('benchDetail'); };
  const detail = () => document.getElementById('benchDetail');
  const tab = (id) => { const b = document.querySelector(`#benchTabs [data-tab="${id}"]`); if (b) b.click(); return b; };
  const search = (q) => { const s = document.getElementById('benchSearch'); s.value = q; s.dispatchEvent(new Event('input', { bubbles: true })); };
  const tabs = () => Object.fromEntries([...document.querySelectorAll('#benchTabs [data-tab]')].map((b) => [b.dataset.tab, { total: +b.dataset.total, have: +b.dataset.have }]));
  // a key pressed on the page the way the browser sends it (the bench listens in the capture phase on window)
  const key = (code, opts = {}, target = document.activeElement || document.body) => { const ev = new KeyboardEvent('keydown', { code, key: opts.key || code, bubbles: true, cancelable: true, shiftKey: !!opts.shift }); target.dispatchEvent(ev); return ev; };
  return { norm, reset, open, cards, cardEl, pick, detail, tab, search, tabs, key };
}
