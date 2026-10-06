// Add-on audit, part 1: crafting every item. One loop over the full recipe list so no item is skipped.
// For each item: the price charged equals the price shown on the bench, the item lands in the pack (S.items, or S.mats for building
// material), shows in the inventory, takes a hotbar slot, can be taken out and put away, and cannot be crafted without its unlock.
import { makeKit, ALL_UP, GATE, RECIPE_IDS, FRAME_KEYS } from './addons_lib.js';

export default async function (ctx) {
  const { T, g, S, fresh, recipes, MATERIALS, CART_CAP, FRAME_TYPES, UPGRADES } = ctx;
  const K = makeKit(ctx);
  const BAD = /undefined|NaN|\[object|null/;
  const rec = (id) => recipes(g).find((r) => r.id === id);
  const card = (r) => [...document.querySelectorAll('#craftGrid .card')].find((c) => (c.querySelector('h3 span') || {}).textContent === `${r.icon} ${r.name}`);

  await T('addons.craft.full-recipe-list-matches-the-item-table', async () => {
    fresh(ALL_UP);
    const have = recipes(g).map((r) => r.id), miss = RECIPE_IDS.filter((id) => !have.includes(id)), extra = have.filter((id) => !RECIPE_IDS.includes(id));
    if (miss.length) return 'recipes missing: ' + miss.join();
    if (extra.length) return 'recipes the audit does not know: ' + extra.join();
    const names = new Set(), icons = [];
    for (const r of recipes(g)) { if (names.has(r.name)) return 'duplicate recipe name ' + r.name; names.add(r.name); if (!r.use || BAD.test(`${r.name}|${r.desc}|${r.use}|${r.status}|${r.icon}`)) return 'bad text on ' + r.id; if (!(r.price > 0) || !Number.isFinite(r.price)) return 'price ' + r.id; icons.push(r.icon); }
    return true;
  });

  await T('addons.craft.hammer-is-always-there-and-equips', async () => {
    fresh({});
    if (S().hotbar[0] !== 'hammer') return 'hammer is not on slot 1';
    if (recipes(g).some((r) => r.id === 'hammer')) return 'the hammer should not be a recipe';
    const inv = g.inventoryList().find((x) => x.id === 'hammer'); if (!inv || !inv.tool || !inv.use || BAD.test(inv.name + inv.desc + inv.use)) return 'hammer missing from inventory';
    K.equip('hammer'); if (g.curTool().kind !== 'hammer') return 'hammer not equipped';
    K.stow(); if (g.curTool().kind !== 'hands') return 'hammer not put away';
    g.selectTool(0, true); const out = g.curTool().kind; g.selectTool(0, true); return (out === 'hammer' && g.curTool().kind === 'hands') || 'toggle by number ' + out;
  });

  // ---------------------------------------------------------------- one test per recipe
  for (const id of RECIPE_IDS) {
    await T('addons.craft.item.' + id, async () => {
      const bad = [];
      fresh(ALL_UP); S().money = 1e12; S().mats = {};
      const r = rec(id); if (!r) return 'no recipe';
      const isMat = r.kind === 'mat', isCart = r.kind === 'cart';
      // ---- the bench card shows the price it will charge
      g.ui.open('craft'); const c0 = card(r); if (!c0) return 'no card on the crafting bench';
      const txt = c0.textContent; if (BAD.test(txt)) bad.push('card text has undefined/NaN');
      if (!txt.includes('How to use') || !txt.includes(r.use.slice(0, 20))) bad.push('card has no use text');
      const btn = c0.querySelector('button'); // the smallest batch (belts and building material only come in tens)
      if (!btn) return 'no craft button';
      const n = +btn.dataset.n, m0 = S().money;
      // ---- craft through the real button
      btn.onclick(); g.ui.closeModals();
      const paid = m0 - S().money;
      if (!btn.textContent.includes(K.fmt(paid))) bad.push(`button says "${btn.textContent}" but charged ${paid}`);
      if (paid !== r.price * n) bad.push(`charged ${paid}, recipe price ${r.price} x${n}`);
      // ---- it landed
      if (isMat) { if (S().mats[r.mk] !== n) bad.push('mats ' + JSON.stringify(S().mats)); if (S().items[id]) bad.push('building material must not be a hotbar item'); }
      else { if (S().items[id] !== (isCart ? 1 : n)) bad.push(`items[${id}] = ${S().items[id]}`); }
      const inv = g.inventoryList().find((x) => x.id === id);
      if (!inv) bad.push('not in inventoryList'); else {
        if (inv.count !== n && !isCart) bad.push('inventory count ' + inv.count); if (BAD.test(`${inv.name}|${inv.desc}|${inv.use}|${inv.icon}`) || !inv.use) bad.push('inventory text');
        if (inv.tool === isMat) bad.push('tool flag wrong for ' + r.kind);
      }
      // ---- hotbar, equip, put away
      if (isMat) { if (S().hotbar.includes(id)) bad.push('material on the hotbar'); }
      else {
        const slot = S().hotbar.indexOf(id); if (slot < 1) bad.push('not auto-placed on the hotbar: ' + JSON.stringify(S().hotbar));
        g.stowed = false; g.selectTool(slot);
        const t = g.curTool(); if (t.id !== id || t.kind !== r.kind) bad.push(`equip gave ${t.id}/${t.kind}`);
        if (g.tools[slot] && (g.tools[slot].label !== r.short)) bad.push('hotbar label ' + (g.tools[slot] || {}).label);
        const slotEl = document.querySelectorAll('#hotbar .slot')[slot]; if (!slotEl || !slotEl.textContent.includes(String(slot + 1)) || !slotEl.classList.contains('sel') || BAD.test(slotEl.textContent)) bad.push('hotbar element ' + (slotEl && slotEl.textContent));
        K.stow(); if (g.curTool().kind !== 'hands') bad.push('Q did not put it away');
        g.stowed = false; g.selectTool(slot); g.selectTool(slot, true); if (g.curTool().kind !== 'hands') bad.push('same number did not put it away');
        g.clearHotbarSlot(slot); if (S().hotbar.includes(id) || g.curTool().kind !== 'hands') bad.push('clearing the slot left the tool');
        if (g.assignHotbar(id, 8) !== 8 || S().hotbar[8] !== id) bad.push('assignHotbar to slot 9');
      }
      return bad.length ? bad.join('; ') : true;
    });

    await T('addons.craft.price-with-stock.' + id, async () => {
      fresh(ALL_UP); S().money = 1e12; const r = rec(id); if (!r) return 'no recipe';
      if (r.kind === 'mat' || r.kind === 'cart') return true; // no stock discount; cart price is checked in the item test
      const bad = [];
      for (const n of [1, 3]) for (const stock of [0, 2, 40]) {
        fresh(ALL_UP); S().money = 1e12; S().mats = stock ? { [r.mat || 'timber']: stock } : {};
        const m0 = S().money; g.craftItem(id, n); const paid = m0 - S().money;
        let want = r.price * n, used = 0;
        if (r.mat) { const need = r.matN * n; used = Math.min(need, stock); want = Math.round((need - used) * (r.price / r.matN)); }
        if (paid !== want) bad.push(`x${n} stock ${stock}: paid ${paid}, expected ${want}`);
        if (r.mat && ((S().mats[r.mat] || 0) !== stock - used)) bad.push(`x${n} stock ${stock}: mats left ${S().mats[r.mat] || 0}, expected ${stock - used}`);
        if (S().items[id] !== n) bad.push('count ' + S().items[id]);
      }
      // not enough money: refused, nothing taken
      fresh(ALL_UP); S().money = r.price - 1; S().mats = {}; const m1 = S().money; const ok = g.craftItem(id, 1);
      if (ok || S().money !== m1 || S().items[id]) bad.push('crafted without enough money');
      return bad.length ? bad.slice(0, 5).join('; ') : true;
    });

    await T('addons.craft.locked-without-unlock.' + id, async () => {
      const gate = GATE[id]; const bad = [];
      // nothing unlocked: no recipe, crafting is refused, money and pack untouched
      fresh({}); S().money = 1e12;
      if (rec(id)) bad.push('recipe visible with no upgrades');
      let m0 = S().money; const ok0 = g.craftItem(id, 1); if (ok0 || S().money !== m0 || S().items[id] || (S().mats && Object.keys(S().mats).length)) bad.push('crafted with no upgrades');
      // everything but the one unlock: still refused
      fresh({ ...ALL_UP, ...gate }); S().money = 1e12; m0 = S().money;
      if (rec(id)) bad.push('recipe visible without ' + Object.keys(gate).join());
      const ok = g.craftItem(id, 1); if (ok || S().money !== m0 || S().items[id] || Object.keys(S().mats || {}).length) bad.push('crafted without ' + Object.keys(gate).join());
      // the cheapest way to get it: buying the upgrade through the shop makes the recipe appear
      const gid = Object.keys(gate)[0], u = UPGRADES.find((x) => x.id === gid);
      if (!u) bad.push('gate upgrade ' + gid + ' does not exist');
      else { const lvl = gate[gid]; fresh({ ...ALL_UP, ...gate }); S().money = 1e13; S().stats.plush = 1e9; if (!g.buy(gid) || (S().up[gid] || 0) !== lvl + 1) bad.push('could not buy ' + gid); else if (!rec(id)) bad.push('buying ' + gid + ' did not unlock the recipe'); }
      return bad.length ? bad.join('; ') : true;
    });
  }

  // ---------------------------------------------------------------- carts: one cart, upgrades keep it, lower tiers are refused
  await T('addons.craft.carts-upgrade-in-place-and-refuse-downgrades', async () => {
    fresh(ALL_UP); S().money = 1e12; const bad = [];
    for (let t = 1; t <= 5; t++) {
      const r = rec('cart:' + t), m0 = S().money; if (!g.craftItem('cart:' + t, 1)) { bad.push('tier ' + t + ' refused'); continue; }
      if (m0 - S().money !== r.price) bad.push(`tier ${t} charged ${m0 - S().money} not ${r.price}`);
      const owned = [1, 2, 3, 4, 5].filter((q) => S().items['cart:' + q]); if (owned.join() !== String(t)) bad.push(`owned carts after tier ${t}: ${owned}`);
      if (S().hotbar.filter((x) => x && x.startsWith('cart:')).join() !== 'cart:' + t) bad.push('hotbar cart slot after tier ' + t);
    }
    const m1 = S().money; if (g.craftItem('cart:2', 1) || S().money !== m1) bad.push('downgrade charged or allowed');
    if (g.craftItem('cart:5', 1) || S().money !== m1) bad.push('crafting the same tier twice charged');
    // rolled out: upgrade keeps the load
    fresh(ALL_UP); S().money = 1e12; g.craftItem('cart:1', 1); g.selectTool && K.equip('cart:1'); g.useCart(); if (!S().cart) bad.push('cart did not roll out'); else { S().cart.load.push({ sp: 2, vr: 0 }); g.craftItem('cart:3', 1); if (S().cart.tier !== 3 || S().cart.load.length !== 1 || S().items['cart:3']) bad.push('rolled out upgrade lost load or left an item'); }
    g.stowCart && S().cart && (S().cart.load = []);
    return bad.length ? bad.join('; ') : true;
  });

  await T('addons.craft.n-must-be-a-positive-whole-number', async () => {
    fresh(ALL_UP); S().money = 1e12; const bad = [];
    for (const n of [0, -3, NaN, undefined, 'x']) { const m0 = S().money; if (g.craftItem('strut', n) || S().money !== m0 || S().items.strut) bad.push('n=' + n + ' crafted'); }
    const m0 = S().money; g.craftItem('strut', 2.9); if (S().items.strut !== 2 || m0 - S().money !== 2 * rec('strut').price) bad.push('fractional n: ' + S().items.strut);
    if (g.craftItem('no-such-thing', 1)) bad.push('unknown id crafted');
    return bad.length ? bad.join('; ') : true;
  });

  // ---------------------------------------------------------------- UI around crafting and the inventory
  await T('addons.ui.crafting-modal-lists-every-item-without-bad-text', async () => {
    fresh(ALL_UP); S().money = 1e12; g.ui.open('craft'); const bad = [];
    for (const r of recipes(g)) { const c = card(r); if (!c) { bad.push('no card ' + r.id); continue; } if (BAD.test(c.textContent)) bad.push('bad text ' + r.id); if (!c.querySelector('button')) bad.push('no button ' + r.id); if (!c.textContent.includes(r.desc.slice(0, 25))) bad.push('desc missing ' + r.id); }
    const all = document.getElementById('craftGrid').textContent; g.ui.closeModals();
    return bad.length ? bad.slice(0, 6).join('; ') : (!BAD.test(all) || 'bad text in the grid');
  });
  await T('addons.ui.inventory-modal-shows-every-item-and-details', async () => {
    fresh(ALL_UP); S().money = 1e12; for (const r of recipes(g)) if (r.kind !== 'cart' && r.kind !== 'mat') g.craftItem(r.id, 1); g.craftItem('cart:2', 1); for (const r of recipes(g)) if (r.kind === 'mat') g.craftItem(r.id, 50);
    const bad = []; g.ui.open('inv'); const list = g.inventoryList();
    const slots = document.querySelectorAll('#invGrid .islot:not(.empty)'); if (slots.length !== list.length) bad.push(`grid shows ${slots.length} of ${list.length}`);
    const need = recipes(g).filter((r) => r.kind !== 'cart' || r.id === 'cart:2').map((r) => r.id);
    for (const id of need) if (!list.some((x) => x.id === id)) bad.push('inventory lacks ' + id);
    list.forEach((it, n) => { slots[n].click(); const info = document.getElementById('invInfo').textContent; if (BAD.test(info)) bad.push('bad info for ' + it.id); if (!info.includes(it.name)) bad.push('info lacks name ' + it.id); if (it.tool && !/hotbar|slot/i.test(info)) bad.push('no hotbar hint for ' + it.id); if (!/How to use/.test(info) && it.id !== 'cart-out') bad.push('no how-to for ' + it.id); });
    // assign to a slot through the inventory UI and read it back from the hotbar bar
    S().hotbar = ['hammer', null, null, null, null, null, null, null, null]; g.rebuildTools(); g.ui.invSel = 'lantern'; g.ui.invAssign(4); if (S().hotbar[4] !== 'lantern') bad.push('invAssign'); g.ui.renderInventory(); const barEl = document.querySelectorAll('#invBar .islot')[4]; if (!barEl || !barEl.textContent.includes('5')) bad.push('inventory hotbar row'); g.ui.invClear(); if (S().hotbar[4]) bad.push('invClear');
    g.ui.closeModals(); return bad.length ? bad.slice(0, 6).join('; ') : true;
  });
  await T('addons.ui.hotbar-full-keeps-item-and-tells-you', async () => {
    fresh(ALL_UP); S().money = 1e12; const bad = [];
    for (const id of ['strut', 'jack', 'lantern', 'flare', 'glow', 'marker', 'dynamite', 'medkit']) g.craftItem(id, 1);
    if (S().hotbar.some((x) => !x)) return 'hotbar not full yet: ' + JSON.stringify(S().hotbar);
    g.craftItem('canister', 1); if (S().items.canister !== 1) bad.push('item lost when the hotbar is full'); if (S().hotbar.includes('canister')) bad.push('canister squeezed in'); if (!/full/i.test(K.hintText())) bad.push('no full-hotbar hint: ' + K.hintText());
    if (!g.inventoryList().some((x) => x.id === 'canister' && x.slot === -1)) bad.push('inventory should show it with no slot');
    g.assignHotbar('canister', 3); if (S().hotbar[3] !== 'canister' || S().hotbar.filter((x) => x === 'canister').length !== 1) bad.push('assign into a full bar'); if (S().hotbar.filter((x) => x === 'jack').length > 1) bad.push('swap duplicated a tool');
    return bad.length ? bad.join('; ') : true;
  });
}
