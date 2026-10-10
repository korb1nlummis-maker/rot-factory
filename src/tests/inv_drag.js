// invdrag.*: real DOM drags in the inventory window (a DataTransfer, dragstart, dragover, drop, dragend). Dragging a hotbar item onto the pack (anywhere in the window that is not another
// bar slot) puts it back: the slot empties and the item stays in the grid with its whole count. Dropping outside the window does nothing. Bar to bar swaps. Nothing is ever lost.
export default async function (ctx) {
  const { T, g, S, fresh, recipes } = ctx;
  const $ = (id) => document.getElementById(id);
  const FULL = { timber: 1, steel: 1, firstaid: 1, markers: 1, lantern: 1, struts: 1, jacks: 1, power: 1, belts: 1, crew: 1, claw: 1 };
  const ev = (type, el, dt) => { const e = new Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = dt; el.dispatchEvent(e); return e; };
  // a full drag from `src` to `dst` (null: dropped on nothing); returns false when the browser would not start it (not draggable)
  const drag = (src, dst) => {
    if (!src.draggable) return false;
    const dt = new DataTransfer(); ev('dragstart', src, dt);
    if (dst) { const o = ev('dragover', dst, dt); if (o.defaultPrevented) ev('drop', dst, dt); }
    ev('dragend', src, dt); return true;
  };
  const open = () => { g.stowed = true; g.openModal('inv'); g.ui.invSel = null; g.ui.renderInventory(); };
  const bar = (i) => $('invBar').children[i];
  const cells = () => [...$('invGrid').children];
  const cellOf = (id) => cells().find((c) => c.dataset && c.dataset.id === id);
  const listed = (id) => g.inventoryList().some((x) => x.id === id);
  const total = () => JSON.stringify(Object.entries(S().items).filter(([, n]) => n).sort());
  const targets = () => ({
    grid: () => $('invGrid'), empty: () => cells().find((c) => c.classList.contains('empty')), filled: () => cells().find((c) => !c.classList.contains('empty') && c.dataset.id !== 'hammer') || cells()[0],
    info: () => $('invInfo'), panel: () => $('inv').querySelector('.panel'), title: () => $('inv').querySelector('h2'),
  });
  const give = (id, n) => { S().items[id] = n; g.rebuildTools(); };
  const cases = {
    hammer: () => 'hammer', marker: () => { give('marker', 3); return 'marker'; }, cart: () => { const r = recipes(g).find((x) => x.kind === 'cart'); if (!r) return null; give(r.id, 1); return r.id; },
    medkit: () => { give('medkit', 4); return 'medkit'; }, canister: () => { give('canister', 2); return 'canister'; },
    machine: () => { const r = recipes(g).find((x) => !['mat', 'cart', 'supply', 'marker'].includes(x.kind) && r_ok(x)); if (!r) return null; give(r.id, 2); return r.id; },
  };
  const r_ok = (r) => r.id !== 'marker';
  const prep = (id) => { fresh(FULL); const got = cases[id](); if (!got) return null; const sl = got === 'hammer' ? 0 : 2; S().hotbar = [null, null, null, null, null, null, null, null, null]; S().hotbar[sl] = got; g.rebuildTools(); open(); return { id: got, sl }; };

  for (const name of Object.keys(cases)) for (const tg of ['grid', 'empty', 'filled', 'info', 'panel', 'title']) {
    if (name === 'hammer' && tg === 'filled') { /* the hammer sits at slot 0: same path, still run */ }
    await T('invdrag.' + name + '-to-' + tg + '-returns-to-pack', async () => {
      const c = prep(name); if (!c) return true;
      const before = total(), n0 = S().items[c.id] || 0, dst = targets()[tg]();
      if (!dst) return 'no target ' + tg;
      if (!drag(bar(c.sl), dst)) return 'the bar slot is not draggable';
      const bad = [];
      if (S().hotbar[c.sl] !== null) bad.push('slot kept ' + S().hotbar[c.sl]);
      if (S().hotbar.includes(c.id)) bad.push('still on the bar elsewhere');
      if (!listed(c.id)) bad.push('not in inventoryList');
      const cell = cellOf(c.id); if (!cell) bad.push('no grid cell for ' + c.id); else if (cell.querySelector('.b')) bad.push('grid cell still shows a slot badge');
      if ((S().items[c.id] || 0) !== n0) bad.push('count ' + n0 + ' -> ' + S().items[c.id]);
      if (total() !== before) bad.push('items changed');
      g.ui.closeModals(); return bad.length === 0 || c.id + ': ' + bad.join('; ');
    });
  }
  for (const name of Object.keys(cases)) await T('invdrag.' + name + '-dropped-outside-stays-on-bar', async () => {
    const c = prep(name); if (!c) return true; const before = total();
    if (!drag(bar(c.sl), null)) return 'not draggable';
    const dt = new DataTransfer(); const s = bar(c.sl); ev('dragstart', s, dt); ev('dragover', $('inv'), dt); ev('drop', $('inv'), dt); ev('drop', document.body, dt); ev('dragend', s, dt);
    const ok = S().hotbar[c.sl] === c.id && total() === before; g.ui.closeModals(); return ok || 'slot is ' + S().hotbar[c.sl];
  });
  await T('invdrag.bar-to-bar-swaps-and-moves', async () => {
    const c = prep('marker'); give('medkit', 2); S().hotbar[5] = 'medkit'; g.rebuildTools(); g.ui.renderInventory(); const before = total();
    drag(bar(c.sl), bar(5)); const a = S().hotbar[c.sl] === 'medkit' && S().hotbar[5] === 'marker';
    drag(bar(5), bar(7)); const b = S().hotbar[7] === 'marker' && S().hotbar[5] === null;
    g.ui.closeModals(); return (a && b && total() === before) || 'swap ' + a + ' move ' + b + ' ' + JSON.stringify(S().hotbar);
  });
  await T('invdrag.pack-item-drag-to-bar-works-for-every-hotbar-kind', async () => {
    fresh(FULL); const bad = [];
    for (const r of recipes(g)) if (r.kind !== 'mat') S().items[r.id] = 1;
    g.rebuildTools(); open();
    for (const it of g.inventoryList()) {
      const cell = cellOf(it.id); if (!cell) { bad.push('no cell ' + it.id); continue; }
      if (it.tool !== !!cell.draggable) bad.push(it.id + ' draggable ' + cell.draggable + ' tool ' + it.tool);
      if (it.tool) { S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools(); g.ui.renderInventory(); drag(cellOf(it.id), bar(4)); if (S().hotbar[4] !== it.id) bad.push(it.id + ' did not land on the bar'); }
    }
    g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });
  await T('invdrag.unknown-id-and-spent-item-are-shown-or-refused', async () => {
    fresh(FULL); open(); const bad = [];
    S().hotbar = ['hammer', null, 'ghost-tool', null, 'marker', null, null, null, null]; S().items.marker = 0; g.rebuildTools(); g.ui.renderInventory();
    for (const [sl, id] of [[2, 'ghost-tool'], [4, 'marker']]) {
      const before = S().hotbar[sl]; const ok = drag(bar(sl), $('invGrid'));
      const gone = S().hotbar[sl] === null, shown = !!cellOf(id) || listed(id);
      if (gone && !shown && S().items[id] !== undefined && S().items[id] > 0) bad.push(id + ' vanished'); 
      if (gone && !shown) bad.push(id + ' left the bar and is not in the pack (silent loss) draggable=' + ok);
    }
    g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });
  await T('invdrag.twenty-random-drags-lose-nothing', async () => {
    fresh(FULL); for (const r of recipes(g)) if (r.kind !== 'mat') S().items[r.id] = 2 + (r.id.length % 3); g.rebuildTools(); open();
    const t = targets(); const before = total(); let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let k = 0; k < 20; k++) {
      g.ui.renderInventory(); const full = [...Array(9).keys()].filter((i) => S().hotbar[i]); const empty = [...Array(9).keys()].filter((i) => !S().hotbar[i]);
      const m = rnd(4);
      if (m === 0 && full.length) drag(bar(full[rnd(full.length)]), $('invGrid'));
      else if (m === 1 && full.length) drag(bar(full[rnd(full.length)]), [t.info(), t.panel(), t.title(), t.empty()][rnd(4)]);
      else if (m === 2) { const c = cells().filter((x) => x.draggable); if (c.length) drag(c[rnd(c.length)], bar(rnd(9))); }
      else if (full.length) drag(bar(full[rnd(full.length)]), bar(rnd(9)));
      if (total() !== before) { g.ui.closeModals(); return 'items changed at drag ' + k; }
      for (const id of S().hotbar) if (id && !listed(id)) { g.ui.closeModals(); return id + ' on the bar but not listed at drag ' + k; }
    }
    for (const r of recipes(g)) if (r.kind !== 'mat' && !listed(r.id) && (S().items[r.id] || 0) > 0) { g.ui.closeModals(); return r.id + ' lost from the list'; }
    g.ui.closeModals(); return true;
  });
}
