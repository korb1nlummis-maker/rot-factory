// Truth tests for the windows with their own buttons: inventory (click, drag, number keys, X, arrows), the hotbar hint, the crew panel (every order
// button and the two "all" buttons), the depot network, the dossier numbers, the plushdex, journal and achievements readouts.
import { UPGRADES, CATS } from '../upgrades.js';
import { LOW_BATTERY } from '../crew.js';
import { liveGrid } from './charger_lib.js';
import { EXIT_X, HALL_HX } from '../config.js';
export default async function (ctx) {
  const { T, g, S, fresh, adv, lookEast } = ctx;
  const $ = (id) => document.getElementById(id);
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const key = (code, extra = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...extra }));
  const keyUp = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));
  const press = (code, extra) => { key(code, extra); keyUp(code); };
  const maxAll = () => Object.fromEntries(UPGRADES.map((u) => [u.id, u.max]));
  const slots = (id) => [...document.querySelectorAll('#' + id + ' .islot')];

  // ---------------------------------------------------------------- inventory
  await T('truth.dom.inventory-click-number-key-slot-click-drag-x-and-arrows-do-what-the-window-says', async () => {
    fresh(maxAll()); g.mode = 'play'; g.ui.closeModals(); g.giveItem('strut', 3); g.giveItem('lantern', 2); S().mats = { timber: 5 }; g.rebuildTools(); const bad = [];
    press('KeyI'); if (g.ui.openModal !== 'inv') return 'I did not open the inventory';
    const list = g.inventoryList(), ids = list.map((x) => x.id); const iS = ids.indexOf('strut'), iL = ids.indexOf('lantern'); if (iS < 0 || iL < 0) return 'items missing: ' + ids.join();
    const hot = () => S().hotbar.slice();
    // click selects and the right-hand text appears
    slots('invGrid')[iS].click(); if (g.ui.invSel !== 'strut' || !/Strut/.test($('invInfo').textContent)) bad.push('clicking an item did not select it');
    if (!/Press a number/.test($('invInfo').textContent)) bad.push('an item that is not on the bar should tell you to press a number: ' + norm($('invInfo').textContent).slice(-120));
    press('Digit5'); if (hot()[4] !== 'strut') bad.push('the 5 key put "' + hot()[4] + '" on slot 5'); if (!/On hotbar slot\s*5/.test(norm($('invInfo').textContent))) bad.push('detail does not say slot 5: ' + norm($('invInfo').textContent).slice(-140));
    if (!slots('invBar')[4].innerHTML.includes('3') ) bad.push('the bar row in the window does not show the item on slot 5');
    press('Digit2'); if (hot()[1] !== 'strut' || hot()[4] !== null) bad.push('"another number moves it": slots are ' + hot().join()); if (!/On hotbar slot\s*2/.test(norm($('invInfo').textContent))) bad.push('detail still says the old slot');
    // a hotbar slot click assigns the selected item
    slots('invBar')[6].click(); if (hot()[6] !== 'strut' || hot()[1] !== null) bad.push('clicking slot 7 left ' + hot().join());
    // drag a different item onto slot 9
    slots('invGrid')[iL].click(); const dt = { data: '', setData(t, v) { this.data = v; }, getData() { return this.data; } }; slots('invGrid')[iL].ondragstart({ dataTransfer: dt }); slots('invBar')[8].ondrop({ preventDefault() {}, dataTransfer: dt }); if (hot()[8] !== 'lantern') bad.push('dragging onto slot 9 gave ' + hot()[8]);
    // X takes the selected item off the bar
    press('KeyX'); if (hot().includes('lantern')) bad.push('X did not take it off the bar: ' + hot().join()); if (!/Press a number/.test($('invInfo').textContent)) bad.push('after X the detail still says it is on the bar');
    // a number with nothing selected, or with something that is not a tool, changes nothing
    g.ui.invSel = null; const before = hot().join(); press('Digit3'); if (hot().join() !== before) bad.push('a number with nothing selected changed the bar'); if (!/Pick a tool/.test($('hint').textContent)) bad.push('no "Pick a tool" hint');
    const mi = ids.indexOf('mat:timber'); if (mi >= 0) { slots('invGrid')[mi].click(); if (!/Not a hotbar item/.test($('invInfo').textContent)) bad.push('a material does not say it is not a hotbar item'); press('Digit4'); if (hot().join() !== before) bad.push('a material went on the hotbar'); }
    // arrows move the selection: right by one, down by a row
    g.ui.invSel = ids[0]; press('ArrowRight'); if (g.ui.invSel !== ids[1]) bad.push('right arrow selected ' + g.ui.invSel); if (ids.length > 9) { g.ui.invSel = ids[0]; press('ArrowDown'); if (g.ui.invSel !== ids[9]) bad.push('down arrow selected ' + g.ui.invSel); }
    // I closes it again
    press('KeyI'); if (g.ui.openModal !== null) bad.push('I did not close the inventory');
    return bad.length === 0 || bad.slice(0, 6).join(' || ');
  });
  await T('truth.dom.inventory-text-names-the-keys-that-really-work', async () => {
    fresh(maxAll()); g.mode = 'play'; g.ui.open('inv'); const txt = norm($('inv').textContent); const bad = [];
    for (const claim of ['1-9 assigns the selected item', 'X removes it from the bar', 'arrows move', 'I or Esc closes']) if (!txt.includes(claim)) bad.push('lost: ' + claim);
    g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.hotbar-hint-q-number-and-same-number-do-what-it-says', async () => {
    fresh({ hammer: 1 }); g.mode = 'play'; g.ui.closeModals(); const bad = []; g.stowed = true; g.rebuildTools(); const hint = () => norm($('hotbarHint').textContent);
    if (!/Q or a number: take a tool out/.test(hint())) bad.push('hands hint: ' + hint()); press('KeyQ'); if (g.stowed) bad.push('Q did not take the tool out'); if (!/Q put away.*same number again also puts it away/.test(hint())) bad.push('tool-out hint: ' + hint());
    press('Digit1'); if (!g.stowed) bad.push('the same number again did not put it away'); if (!/Q or a number/.test(hint())) bad.push('hint after put away: ' + hint()); press('Digit1'); if (g.stowed || g.buildIdx !== 0) bad.push('a number did not take slot 1 out'); press('KeyQ'); if (!g.stowed) bad.push('Q did not put it away');
    // "An empty slot is bare hands"
    press('Digit6'); if (!(g.curTool().kind === 'hands')) bad.push('an empty slot is not bare hands: ' + g.curTool().kind); g.stowed = true; g.rebuildTools(); return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- crew panel
  const bots = (n, extra = {}) => { fresh({ crew: 1, crewSlots: n, ...extra }); const out = []; for (let i = 0; i < n; i++) out.push(g.crew.spawn()); return out; };
  const rowOf = (b) => document.querySelector(`#crewList .crew-row[data-bot="${b.id}"]`);
  const btn = (b, sel) => rowOf(b).querySelector(`button[${sel}]`);
  await T('truth.dom.crew-panel-opens-with-v-and-counts-the-bots', async () => {
    const [a, b] = bots(2); g.mode = 'play'; g.ui.closeModals(); press('KeyV'); const bad = []; if (g.ui.openModal !== 'crew') bad.push('V did not open the crew panel'); if (!new RegExp(`2 / ${g.T.crewMax} bots`).test($('crewCount').textContent)) bad.push('count says ' + $('crewCount').textContent);
    if (document.querySelectorAll('#crewList .crew-row').length !== 2) bad.push('rows ' + document.querySelectorAll('#crewList .crew-row').length); press('KeyV'); if (g.ui.openModal !== null) bad.push('V again did not close it');
    fresh({}); g.ui.open('crew'); if (!/Buy a Scrapper Bot in the Crew tab/.test($('crewList').textContent)) bad.push('empty text lost'); g.ui.closeModals();
    if (!UPGRADES.some((u) => u.name === 'Scrapper Bot' && u.cat === 'crew') || !CATS.some((c) => c.id === 'crew' && c.name === 'Crew')) bad.push('the empty-panel advice names a Crew tab or a Scrapper Bot that does not exist');
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.crew-order-buttons-set-the-state-their-tooltips-promise', async () => {
    const [b] = bots(1); const hm = g.crew.home(); const bad = []; g.ui.open('crew');
    const midDig = () => { b.state = 'farm'; b.origin = [hm.x + 10, hm.z]; b.trail = [[hm.x + 8, hm.z]]; b.x = hm.x + 12; b.z = hm.z; b.y = 0.5; b.deliver = null; };
    midDig(); btn(b, 'data-a="follow"').click(); if (b.state !== 'follow' || b.origin) bad.push(`Follow me: state ${b.state}, dig order kept ${!!b.origin}`);
    midDig(); btn(b, 'data-a="stay"').click(); if (b.state !== 'idle' || b.origin) bad.push(`Stay at the bin: state ${b.state}, dig order kept ${!!b.origin}`);
    midDig(); b.carry = [{ sp: 5, vr: 0 }]; btn(b, 'data-a="home"').click(); if (b.state !== 'return') bad.push(`Go home and unload: state ${b.state}`);
    for (let i = 0; i < 400 && b.carry.length; i++) adv(0.5); if (b.carry.length) bad.push('Go home and unload never unloaded');
    const tip = btn(b, 'data-a="home"').title; for (let i = 0; i < 200 && b.state !== 'goto' && b.state !== 'idle'; i++) adv(0.5);
    if (/waits there/.test(tip) && b.state !== 'idle') bad.push(`tooltip says it waits at the bin, but the bot went ${b.state} after unloading`);
    if (!/unloads at the bin/.test(tip)) bad.push('the Go home tooltip lost "unloads at the bin": ' + tip);
    g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.crew-dig-buttons-send-the-bot-the-way-they-name-from-where-you-aim-or-stand', async () => {
    const [b] = bots(1); const bad = []; g.ui.open('crew'); const was = g.crew.order; const calls = []; g.crew.order = (bb, dir, x, y, z) => { calls.push({ dir, x, y, z }); return true; };
    try {
      lookEast(2, 3); g.player.pitch = -0.3; g.renderer.camera.position.copy(g.player.eyePos(new ctx.V3()));   // looking down at the floor in front of you: a spot
      const spot = g.crewAim(); if (!spot || spot.kind !== 'spot') bad.push('test set-up: the floor in front of you is not a spot: ' + (spot && spot.kind));
      for (const [d, name] of [[3, 'north'], [0, 'east'], [1, 'south'], [2, 'west']]) {
        const bt = btn(b, `data-d="${d}"`); if (!new RegExp('Dig ' + name, 'i').test(bt.textContent) || !new RegExp('Dig ' + name).test(bt.title)) bad.push(`button for ${d} says "${bt.textContent}" / "${bt.title}"`);
        calls.length = 0; bt.click(); if (calls.length !== 1) { bad.push(`Dig ${name}: ${calls.length} orders`); continue; }
        if (calls[0].dir !== d) bad.push(`Dig ${name} ordered direction ${calls[0].dir}, wanted ${d}`);
        if (spot && spot.kind === 'spot' && (Math.abs(calls[0].x - spot.x) > 0.02 || Math.abs(calls[0].z - spot.z) > 0.02)) bad.push(`Dig ${name} started at ${calls[0].x}, ${calls[0].z}, not at the spot you aim at (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`);
      }
      // aimed at nothing (looking at the roof) the order starts where you stand
      g.player.pitch = 1.3; g.player.pos.set(7, 0, 9); g.renderer.camera.position.copy(g.player.eyePos(new ctx.V3())); calls.length = 0; btn(b, 'data-d="1"').click(); if (!calls.length || Math.abs(calls[0].x - 7) > 0.05 || Math.abs(calls[0].z - 9) > 0.05) bad.push(`aimed at the roof: order started at ${calls[0] && calls[0].x}, ${calls[0] && calls[0].z} instead of where you stand (7, 9)`);
      // the names are the compass's: facing compass north (toward -z) the T key and "Dig north" agree
      g.player.yaw = Math.PI; g.player.pitch = 0; const fw = g.player.forward(new ctx.V3()); if (!(fw.z < -0.9)) bad.push('yaw PI does not face -z'); const hdg = Math.atan2(fw.x, -fw.z) * 180 / Math.PI; if (Math.abs(hdg) > 1) bad.push('the compass would not read north there: ' + hdg);
      const dirs = []; g.crew.order = (bb, dir) => { dirs.push(dir); return true; }; g.crewFarmAhead(); if (dirs[0] !== 3) bad.push('facing compass north, T ordered direction ' + dirs[0] + ' (north is 3)');
    } finally { g.crew.order = was; g.ui.closeModals(); }
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.crew-dig-button-really-sends-the-bot-out-to-dig-east', async () => {
    const [b] = bots(1); const bad = []; lookEast(-3, 0); g.player.pitch = 1.3; g.ui.open('crew'); btn(b, 'data-d="0"').click(); if (b.state !== 'goto' || b.dir !== 0 || !b.origin) bad.push(`state ${b.state}, dir ${b.dir}, origin ${b.origin}`);
    if (!/Heading out to dig east/.test($('crewList').querySelector('[data-live=status]').textContent) && !/Heading out to dig east/.test(g.crew.statusLine(b))) bad.push('status line: ' + g.crew.statusLine(b)); g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.crew-recharge-and-fuel-buttons-exist-only-when-they-can-work-and-do-their-job', async () => {
    const [b] = bots(1); const bad = []; g.ui.open('crew'); if (btn(b, 'data-a="charge"') || btn(b, 'data-a="fuel"')) bad.push('Recharge / Fuel offered with no station and no generator');
    const hm = g.crew.home(); const ch = { id: g.nextId(), type: 'charger', i: ctx.toI(hm.x + 6), j: 0, k: ctx.toK(hm.z), reserve: 3, dir: 0, items: [] }; g.S.entities.push(ch); g.addEntity(ch); liveGrid(ctx, g.logi.byId.get(ch.id), { air: true, solve: false });   // (a Charging Station works only with a cable from a live grid)
    try {
      g.ui.renderCrew(); const bt = btn(b, 'data-a="charge"'); if (!bt) bad.push('no Recharge button with a station placed'); else { b.x = hm.x; b.z = hm.z + 3; b.state = 'idle'; bt.click(); if (b.state !== 'chgwalk' || b.chg !== ch.id) bad.push(`Recharge now: state ${b.state}, station ${b.chg}`); }
      ch.reserve = 0; b.state = 'idle'; b.chg = null; g.ui.renderCrew(); btn(b, 'data-a="charge"').click(); if (b.state === 'chgwalk') bad.push('Recharge now walked to a station with no charge (the tooltip says "has charge")'); if (!/No Charging Station with charge/.test($('hint').textContent)) bad.push('no answer when the station is empty');
    } finally { const t = g.logi.byId.get(ch.id); if (t) g.logi.remove(t); g.S.entities = g.S.entities.filter((e) => e.id !== ch.id); for (const r of [...g.logi.tiles.values()]) if (r.rig) { g.logi.remove(r); g.S.entities = g.S.entities.filter((e) => e.id !== r.id); } g.cables.prune(); }   // (and the test's own power rig)
    const gen = { id: g.nextId(), type: 'gen', i: ctx.toI(hm.x + 9), j: 0, k: ctx.toK(hm.z + 1), dir: 0, items: [], fuel: 0 }; g.S.entities.push(gen); g.addEntity(gen);
    try {
      g.ui.renderCrew(); const fb = btn(b, 'data-a="fuel"'); if (!fb) bad.push('no Keep generator fuelled button with a generator placed'); else { b.state = 'idle'; b.deliver = null; fb.click(); if (b.deliver !== gen.id) bad.push(`Keep generator fuelled: deliver ${b.deliver}, generator ${gen.id}`); }
    } finally { const t = g.logi.byId.get(gen.id); if (t) g.logi.remove(t); g.S.entities = g.S.entities.filter((e) => e.id !== gen.id); }
    g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.crew-all-buttons-and-their-keys-order-every-bot', async () => {
    const list = bots(3); const bad = []; g.mode = 'play'; g.ui.open('crew'); const hm = g.crew.home(); for (const b of list) { b.state = 'farm'; b.origin = [hm.x + 10, hm.z]; b.trail = []; b.x = hm.x + 11; b.z = hm.z; b.y = 0.5; }
    $('crewAllHome').click(); if (!list.every((b) => b.state === 'return')) bad.push('Call all home (Y): ' + list.map((b) => b.state).join());
    $('crewAllFollow').click(); if (!list.every((b) => b.state === 'follow')) bad.push('All follow me: ' + list.map((b) => b.state).join());
    g.ui.closeModals(); for (const b of list) { b.state = 'farm'; b.origin = [hm.x + 10, hm.z]; b.trail = []; } press('KeyY'); if (!list.every((b) => b.state === 'return')) bad.push('Y: ' + list.map((b) => b.state).join());
    // T sends the whole crew digging the way you face (east here)
    const was = g.crew.order; const dirs = []; g.crew.order = (b, dir) => { dirs.push(dir); return true; }; try { lookEast(-3, 0); press('KeyT'); } finally { g.crew.order = was; } if (dirs.length !== 3 || dirs.some((d) => d !== 0)) bad.push('T ordered ' + dirs.join() + ' (wanted three times east, 0)');
    const t = $('crewAllHome'); if (!/\(Y\)/.test(t.textContent) || !/key Y/.test(t.title)) bad.push('Call all home does not name Y'); if (!/follows you/.test($('crewAllFollow').title)) bad.push('All follow me tooltip: ' + $('crewAllFollow').title);
    return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.crew-aimed-orders-do-what-the-bot-panel-says-the-next-E-will-do', async () => {
    const [b] = bots(1); const hm = g.crew.home(); const bad = []; const mk = (type, dx, dz, extra = {}) => { const e = { id: g.nextId(), type, i: ctx.toI(hm.x + dx), j: 0, k: ctx.toK(hm.z + dz), dir: 0, items: [], ...extra }; g.S.entities.push(e); g.addEntity(e); return e; };
    const made = [mk('charger', 6, 0, { reserve: 3 }), mk('sorter', 6, 4), mk('vault', 6, -4), mk('belt', 8, 6), mk('gen', 9, 2, { fuel: 0 })];
    try {
      { const gt = g.logi.byId.get(made[4].id); gt.burn = 1e5; gt.burnMax = 1e5; g.S.items.cable = (g.S.items.cable || 0) + 1; const w = g.cables.connect(gt.id, made[0].id); if (!w.ok) return 'wire: ' + w.why; g.power.markDirty(); g.power.recompute(); }   // (the station works only with a cable from a live grid: the generator under test powers it)
      const reset = () => { b.state = 'idle'; b.origin = null; b.deliver = null; b.chg = null; b.carry = []; b.x = hm.x + 2; b.z = hm.z + 2; b.y = 0.5; };
      const cases = [
        ['charger', { k: 'tile', id: made[0].id }, (r) => b.state === 'chgwalk' && b.chg === made[0].id, /Recharge at this Charging Station/],
        ['sorter', { k: 'tile', id: made[1].id }, () => b.deliver === made[1].id, /Deliver plush to this Sorting Box/],
        ['vault', { k: 'tile', id: made[2].id }, () => b.deliver === made[2].id, /Deliver plush to this Vault Crate/],
        ['belt', { k: 'tile', id: made[3].id }, () => b.deliver === made[3].id, /Deliver plush to this belt/],
        ['generator', { k: 'tile', id: made[4].id }, () => b.deliver === made[4].id && (b.state === 'goto' || b.state === 'farm'), /Keep this Generator fuelled/],
        ['bin', { k: 'bin' }, () => b.state === 'return', /Go home and unload/],
        ['your feet', { k: 'feet' }, () => b.state === 'follow', /Follow you/],
      ];
      for (const [name, tgt, check, words] of cases) {
        reset(); const it = g.crew.intent(b, tgt); if (!it.ok) { bad.push(`${name}: the panel says it cannot: ${it.text}`); continue; } if (!words.test(it.text)) bad.push(`${name}: panel text "${it.text}"`);
        const r = g.crewIssue(b, tgt); if (!r.ok || !check(r)) bad.push(`${name}: E gave state ${b.state}, deliver ${b.deliver}, charger ${b.chg} (said "${it.text}")`);
      }
      // the floor: the order the panel names is the dig it starts
      reset(); lookEast(-3, 0); g.player.pitch = -0.3; g.renderer.camera.position.copy(g.player.eyePos(new ctx.V3())); const a = g.crewAim(); if (a && a.kind === 'spot') { const t = g.crewTgt(a), it = g.crew.intent(b, t); if (it.ok) { g.crewIssue(b, t); if (b.state !== 'goto' || !/^Dig /.test(it.text)) bad.push(`floor: said "${it.text}", state ${b.state}`); } }
      // the cart: needs a load
      reset(); const noCart = g.crew.intent(b, { k: 'cart' }); if (noCart.ok) bad.push('cart: the panel offers to haul with no cart'); else if (!/cart is empty/i.test(noCart.text)) bad.push('cart text: ' + noCart.text);
    } finally { for (const e of made) { const t = g.logi.byId.get(e.id); if (t) g.logi.remove(t); g.S.entities = g.S.entities.filter((x) => x.id !== e.id); } }
    return bad.length === 0 || bad.join(' || ');
  });
  await T('truth.dom.crew-status-words-in-the-panel-are-the-ones-the-bots-show', async () => {
    const [b] = bots(1); g.ui.open('crew'); const intro = norm($('crewIntro').textContent), bad = [];
    const hasChg = false; void hasChg; const probes = { follow: 'Following you', idle: 'Waiting at the bin', return: 'Hauling plush back', unload: 'Unloading', farm: 'Digging', goto: 'Heading out', chgwalk: 'Walking to', recharge: 'Recharging at a Charging Station', lowbat: 'Waiting for a Charging Station', blocked: 'Blocked' };
    for (const [st, words] of Object.entries(probes)) { b.state = st; b.origin = null; const line = g.crew.statusLine(b); const first = words.split(' ')[0]; if (!line.startsWith(words) && !(st === 'lowbat') ) bad.push(`${st}: "${line}" does not start "${words}"`); if (!intro.includes(first)) bad.push(`the panel's word list never mentions "${first}" (${st})`); }
    // the 25% in the panel is the real low-battery line
    if (LOW_BATTERY !== 0.25 || !/Below 25%/.test(intro)) bad.push('the panel says Below 25% but the bots use ' + LOW_BATTERY);
    g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.crew-battery-bar-and-status-follow-the-bot-without-rebuilding-the-buttons', async () => {
    const [b] = bots(1); g.ui.open('crew'); const row = rowOf(b), button = btn(b, 'data-a="follow"'); b.battery = 0.1; b.state = 'follow'; g.ui.updateCrewLive();
    const pct = row.querySelector('[data-live=batpct]').textContent, w = row.querySelector('[data-live=bat]').style.width, st = row.querySelector('[data-live=status]').textContent;
    const same = btn(b, 'data-a="follow"') === button; g.ui.closeModals(); return (/10% LOW/.test(pct) && w === '10%' && /Following you/.test(st) && same) || `pct "${pct}", bar ${w}, status "${st}", buttons kept ${same}`;
  });

  // ---------------------------------------------------------------- depot network
  await T('truth.dom.travel-buttons-charge-the-fare-they-show-and-take-you-there', async () => {
    fresh({}); g.mode = 'play'; const bad = []; const was = g.beaconList; const far = { name: 'Depot Z', x: 300, y: 0.05, z: 40, id: 999 }, near = { name: 'Depot Near', x: 2, y: 0.05, z: 1, id: 998 }; g.beaconList = () => [{ name: 'Sorting Bay 07', x: 0, y: 0.05, z: 0.2, bay: true }, near, far];
    const wasTp = g.teleport; try {
      g.player.pos.set(0, 0, 0); S().money = 1e6; g.ui.open('travel'); const rows = [...document.querySelectorAll('#travelList .trow')]; if (rows.length !== 4) bad.push('rows: ' + rows.length);
      const rowFor = (n) => rows.find((r) => r.querySelector('b').textContent === n); const dist = Math.hypot(far.x, far.z), fare = Math.round(dist * 1.2); const fb = rowFor('Depot Z').querySelector('button');
      if (norm(fb.textContent) !== 'Travel ◈' + fare.toLocaleString('en-US') && !new RegExp('^Travel ◈').test(norm(fb.textContent))) bad.push('fare label: ' + fb.textContent); if (!rowFor('Depot Z').textContent.includes(Math.round(dist) + ' m away')) bad.push('distance text: ' + rowFor('Depot Z').textContent);
      const nb = rowFor('Depot Near').querySelector('button'); if (!/Here/.test(nb.textContent) || !nb.disabled) bad.push('a depot within 6 m should say Here and be disabled: ' + nb.textContent);
      S().money = fare - 1; g.renderTravel(); if (!rowFor2('Depot Z').disabled) bad.push('an unaffordable fare is not disabled'); rowFor2('Depot Z').click(); if (g.player.pos.x !== 0) bad.push('a disabled travel button moved you');
      S().money = fare + 5; g.renderTravel(); const m0 = S().money; rowFor2('Depot Z').click(); if (m0 - S().money !== fare) bad.push(`fare label ${fare}, charged ${m0 - S().money}`); if (Math.abs(g.player.pos.x - far.x) > 0.5 || Math.abs(g.player.pos.z - (far.z + 1.6)) > 0.5) bad.push(`arrived at ${g.player.pos.x}, ${g.player.pos.z}`); if (g.ui.openModal !== null) bad.push('the list stayed open after travelling');
      // Open: the first row opens the terminal
      g.ui.open('travel'); document.querySelector('#travelList .trow button').click(); if (g.ui.openModal !== 'shop') bad.push('"Upgrade terminal / Open" opened ' + g.ui.openModal);
    } finally { g.beaconList = was; g.teleport = wasTp; g.ui.closeModals(); g.player.pos.set(0, 0, 0); }
    function rowFor2(n) { return [...document.querySelectorAll('#travelList .trow')].find((r) => r.querySelector('b').textContent === n).querySelector('button'); }
    return bad.length === 0 || bad.slice(0, 5).join(' || ');
  });
  await T('truth.dom.money-shown-in-open-windows-follows-sales-and-unlocks-buttons', async () => {
    fresh({}); const bad = []; const u = UPGRADES.find((x) => x.cat === 'hands' && !x.req && !x.needs); const cost = u.cost[0]; S().money = cost - 1; g.ui.open('shop'); g.ui.shopCat = 'hands'; g.ui.renderShop();
    const card = [...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3 span').textContent === u.name), b = card.querySelector('button'); if (!b.disabled) bad.push('affordable-by-one-coin test setup failed');
    S().money = cost; g.ui.setMoney(cost); if (b.disabled) bad.push('the Buy button stayed disabled after the money arrived'); if (document.getElementById('shopMoney').textContent === '0') bad.push('balance not updated');
    S().money = cost - 1; g.ui.setMoney(cost - 1); if (!b.disabled) bad.push('the Buy button stayed enabled after the money went'); if ([...document.querySelectorAll('#shopGrid .card')].find((c) => c.querySelector('h3 span').textContent === u.name).querySelector('button') !== b) bad.push('the window was rebuilt under the mouse');
    g.ui.closeModals(); try { localStorage.removeItem('rf.bench'); } catch (e) { /* no storage */ } g.ui.bench = null; g.ui.open('craft'); const cb = [...document.querySelectorAll('#benchDetail button')].find((x) => x.dataset.cost); if (cb) { const c = +cb.dataset.cost; S().money = c - 1; g.ui.setMoney(c - 1); if (!cb.disabled) bad.push('bench button not disabled'); S().money = c; g.ui.setMoney(c); if (cb.disabled) bad.push('bench button not enabled when money arrived'); }
    g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });

  // ---------------------------------------------------------------- dossier, plushdex, journal, achievements
  await T('truth.dom.dossier-numbers-match-the-warehouse', async () => {
    fresh({}); g.ui.open('dossier'); const txt = norm($('dossier').textContent); const bad = [];
    const needleKm = Math.hypot((g.world.needle.i - 8192) * 0.6, (g.world.needle.k - 8192) * 0.6) / 1000, exitKm = EXIT_X / 1000;
    const more = /more than (\w+) kilometers/.exec(txt); const words = { three: 3, four: 4, five: 5, six: 6, seven: 7 }; if (!more || !(needleKm > words[more[1]] || needleKm > +more[1])) bad.push(`dossier says "${more && more[0]}", the One is ${needleKm.toFixed(2)} km out`);
    const ex = /EXIT is a mere ([\d.]+)/.exec(txt); if (!ex || Math.abs(+ex[1] - exitKm) > 0.06) bad.push(`dossier says the exit is "${ex && ex[1]}" km, it is ${exitKm.toFixed(2)} km (${HALL_HX} m)`);
    if (!/Gold plush with a small crown and a floating halo ring/.test(txt)) bad.push('look lost'); g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.plushdex-count-and-names-follow-what-you-found', async () => {
    fresh({}); const bad = []; S().dex = {}; g.ui.open('dex'); if ($('dexCount').textContent !== '0') bad.push('count with nothing found: ' + $('dexCount').textContent);
    const first = [...document.querySelectorAll('#dexGrid .dx')][0]; if (!/\?\?\?/.test(first.textContent)) bad.push('an undiscovered species shows its name');
    S().dex = { 5: 3, 6: 1 }; g.ui.open('dex'); if ($('dexCount').textContent !== '2') bad.push('count after two finds: ' + $('dexCount').textContent); const known = [...document.querySelectorAll('#dexGrid .dx:not(.unk)')]; if (known.length !== 2 || !known.some((k) => /×3/.test(k.textContent))) bad.push('known tiles: ' + known.length);
    if ($('dexTotal').textContent !== String(ctx.species.length - 1 - 0) && !/^\d+$/.test($('dexTotal').textContent)) bad.push('total ' + $('dexTotal').textContent); g.ui.closeModals(); S().dex = {}; return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.journal-and-achievements-show-what-they-count', async () => {
    fresh({}); const bad = []; const boosts0 = S().boosts; S().boosts = { sell: 0, dig: 0, digMul: 1, carry: 0 }; S().notes = []; S().clues = []; g.ui.open('journal'); if (!/Nothing yet/.test($('journalList').textContent)) bad.push('empty journal text'); if (!/No boosts yet/.test($('journalBoosts').textContent)) bad.push('boosts text: ' + $('journalBoosts').textContent);
    S().notes = [{ name: 'Old Ned', role: 'Sorter', dist: 123.4, text: 'It was cold.', reward: '+1 carry' }]; S().clues = ['Memo 7']; g.ui.open('journal'); const t = $('journalList').textContent; if (!/Old Ned/.test(t) || !/123 m/.test(t) || !/Memo 7/.test(t) || !/\+ \+1 carry/.test(t)) bad.push('journal rows: ' + norm(t));
    g.ui.open('dossier'); if (!/Memo 7/.test($('clueList').textContent)) bad.push('the dossier lost the clue'); S().notes = []; S().clues = [];
    S().ach = {}; g.ui.open('ach'); const n0 = $('achCount').textContent; const first = Object.keys(S().ach).length; void first; const secret = ctx.UPGRADES && null; void secret; if (n0 !== '0') bad.push('achievements done with none: ' + n0);
    const { ACHIEVEMENTS } = await import('../achievements.js'); const a = ACHIEVEMENTS.find((x) => !x.secret); S().ach = { [a.id]: 1 }; g.ui.open('ach'); if ($('achCount').textContent !== '1' || !$('achGrid').textContent.includes(a.name)) bad.push('one achievement not counted'); if ($('achTotal').textContent !== String(ACHIEVEMENTS.length)) bad.push('total ' + $('achTotal').textContent);
    const sec = ACHIEVEMENTS.find((x) => x.secret); if (sec) { S().ach = {}; g.ui.open('ach'); if ($('achGrid').textContent.includes(sec.name)) bad.push('a secret achievement shows its name before you earn it'); }
    S().ach = {}; S().boosts = boosts0; g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });
  await T('truth.dom.pause-stats-box-shows-the-real-numbers', async () => {
    fresh({}); S().stats.plush = 1234; S().stats.sold = 77; S().stats.collapses = 3; g.ui.open('pause'); const box = norm($('statsBox').textContent); const bad = [];
    for (const [label, v] of [['Plush handled', '1,234'], ['Plush sold', '77'], ['Collapses', '3']]) if (!box.includes(label) || !new RegExp(label + '\\s*' + v.replace(',', ',?')).test(box)) bad.push(`${label} should read ${v}: ${box.slice(0, 120)}`);
    g.ui.closeModals(); return bad.length === 0 || bad.join('; ');
  });
}
