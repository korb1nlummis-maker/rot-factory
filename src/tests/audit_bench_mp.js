// mp.bench.audit.* : the Crafting Table in co-op, adversarially. A guest's window is redrawn by every shared message (every 0.6 s): it must keep its
// nodes, follow an unlock the host made while it is open, and not send commands that cannot work (each refusal beeps on the host's machine).
// Forged commands from a guest must never throw on the host or change anything. Same one-page trick as bench_mp.js: g.net.role switches the part.
import * as B from '../bench.js';
import { BOT_ID } from '../crafting.js';
import { benchKit } from './bench_lib.js';
import * as PIN from '../playerinv.js';

export default async function (ctx) {
  const { T, g, S, fresh } = ctx;
  const K = benchKit(ctx);
  let sent = [];
  const json = (m) => JSON.parse(JSON.stringify(m));
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const guard = (fn) => async () => { try { return await fn(); } finally { done(); g.ui.closeModals(); K.reset(); g.crewViews = new Map(); } };
  const cmds = () => sent.filter((m) => m.t === 'cmd');
  const shared = (over = {}) => ({ t: 'shared', money: S().money, te: 0, up: JSON.parse(JSON.stringify(S().up)), gear: S().gear || {}, items: JSON.parse(JSON.stringify(S().items)), mats: {}, boosts: S().boosts, contracts: [], gameMin: S().gameMin, golden: 0, outage: 0, clues: [], clueLevel: 0, eco: { md: 0, dx: 0, pl: 1e9 }, ...over });
  const kd = (code, target = document.activeElement || document.body) => { const ev = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }); target.dispatchEvent(ev); return ev; };

  await T('mp.bench.audit.forged-craft-commands-never-throw-on-the-host-or-change-anything', guard(async () => {
    fresh({ timber: 1, struts: 1, crew: 1, crewSlots: 3, cart: 2 }); g.crew.sync(); S().money = 5e8; const bad = [];
    role('host'); cap();
    const snap = () => JSON.stringify([S().money, S().items, S().mats, S().crew.length, S().gear, S().hotbar]);
    const s0 = snap();
    const forged = [
      { t: 'cmd', c: 'craft', d: null }, { t: 'cmd', c: 'craft' }, { t: 'cmd', c: 'craft', d: 5 }, { t: 'cmd', c: 'craft', d: 'strut' }, { t: 'cmd', c: 'craft', d: [] },
      { t: 'cmd', c: 'craft', d: { id: 5, n: 0 } }, { t: 'cmd', c: 'craft', d: { id: 5, n: 1 } }, { t: 'cmd', c: 'craft', d: { id: null, n: 1 } }, { t: 'cmd', c: 'craft', d: { id: {}, n: 1 } },
      { t: 'cmd', c: 'craft', d: { id: 'strut', n: 0 } }, { t: 'cmd', c: 'craft', d: { id: 'strut', n: -3 } }, { t: 'cmd', c: 'craft', d: { id: 'strut', n: 'x' } }, { t: 'cmd', c: 'craft', d: { id: 'strut', n: null } },
      { t: 'cmd', c: 'craft', d: { id: 'frame:nope', n: 1 } }, { t: 'cmd', c: 'craft', d: { id: '__proto__', n: 1 } }, { t: 'cmd', c: 'craft', d: { id: 'constructor', n: 1 } }, { t: 'cmd', c: 'craft', d: { id: 'toString', n: 1 } },
      { t: 'cmd', c: 'craft', d: { id: 'gear:gloves', n: 1 } }, { t: 'cmd', c: 'craft', d: { id: 'mat:timber', n: 1e300 } }, { t: 'cmd', c: 'craft', d: { id: 'frame:timber', n: Infinity } },
      { t: 'cmd', c: 'craftGear', d: null }, { t: 'cmd', c: 'craftGear' }, { t: 'cmd', c: 'craftGear', d: { id: 7 } }, { t: 'cmd', c: 'craftGear', d: { id: 'gloves' } }, { t: 'cmd', c: 'craftGear', d: { id: '__proto__' } },
    ];
    for (const m of forged) { try { g.netMessage(json(m)); } catch (e) { bad.push(`${JSON.stringify(m.d)} threw: ${e.message}`); } if (snap() !== s0) { bad.push(`${m.c} ${JSON.stringify(m.d)} changed the world: ${snap().slice(0, 160)}`); break; } }
    // a locked recipe is not made by a guest that names it (steel frames are not unlocked)
    try { g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: 'frame:steel', n: 1 } })); } catch (e) { bad.push('locked recipe threw'); }
    if (snap() !== s0) bad.push('a forged command changed the world: ' + snap().slice(0, 120));
    // one honest command still works afterwards
    g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: 'strut', n: 2 } })); if ((S().items.strut || 0) !== 2) bad.push('an honest craft failed after the forged ones');
    done(); return bad.length === 0 || bad.slice(0, 5).join('; ');
  }));

  await T('mp.bench.audit.a-guest-sends-no-command-it-can-see-will-fail', guard(async () => {
    fresh({ timber: 1, struts: 1, crew: 1, crewSlots: 0, cart: 3 }); g.crew.sync(); S().money = 1e9; g.craftItem('cart:2', 1); const bad = [];
    role('guest'); cap(); K.open(); K.tab('all'); K.pick('strut'); const price = g.ui.bench.rows.find((r) => r.id === 'strut').price;
    // no money: Enter, double click and the buttons send nothing
    S().money = price - 1; g.ui.setMoney(S().money, true); g.ui.renderCraft(); K.cardEl('strut').focus(); sent.length = 0;
    kd('Enter'); K.cardEl('strut').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); for (const b of K.detail().querySelectorAll('button')) b.click();
    if (cmds().length) bad.push(`with no money the guest sent ${cmds().length} command(s)`);
    // an owned cart and a crew with no free bunk: the same
    S().money = 1e9; g.ui.setMoney(S().money, true); K.tab('transit'); K.cardEl('cart:2').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); K.tab('robots'); K.cardEl(BOT_ID).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    if (cmds().length) bad.push(`for an owned cart or a full crew the guest sent ${cmds().map((c) => c.d.id)}`);
    // an honest craft is one command, and the guest does not change the world itself
    K.tab('all'); K.pick('strut'); const m0 = S().money, n0 = S().items.strut || 0; sent.length = 0; kd('Enter', K.cardEl('strut'));
    if (cmds().length !== 1 || cmds()[0].c !== 'craft' || cmds()[0].d.id !== 'strut' || cmds()[0].d.n !== 1) bad.push('an honest Enter sent ' + JSON.stringify(cmds())); if (S().money !== m0 || (S().items.strut || 0) !== n0) bad.push('the guest changed the world itself');
    // the host still decides: money that the guest thinks it has but the host does not
    done(); return bad.length === 0 || bad.slice(0, 5).join('; ');
  }));

  await T('mp.bench.audit.a-guest-window-keeps-its-nodes-through-shared-messages-and-follows-an-unlock', guard(async () => {
    fresh({ timber: 1, struts: 1, markers: 1, crew: 1, crewSlots: 3 }); g.crew.sync(); S().money = 1e9; const bad = [];
    role('guest'); cap(); K.open(); K.tab('supports'); K.pick('strut'); const card = K.cardEl('strut'), tabBtn = document.querySelector('#benchTabs [data-tab="supports"]'), btn = K.detail().querySelector('button[data-n]');
    // the host's heartbeat: the same upgrades and items, the balance moving a little each time
    for (let n = 1; n <= 6; n++) { g.applyShared(shared({ money: S().money + n * 37 })); }
    if (!card.isConnected || !tabBtn.isConnected || !btn.isConnected) bad.push('shared messages that changed only the balance replaced the nodes');
    if (g.ui.bench.sel !== 'strut' || K.detail().dataset.id !== 'strut') bad.push('the selection moved');
    // the host unlocks Steel Frames while the guest has the window open on the Supports tab
    K.tab('supports'); K.pick('frame:steel'); if (!K.cardEl('frame:steel').dataset.locked) bad.push('steel should start locked'); const lockedBefore = K.tabs().locked.total;
    g.applyShared(shared({ up: { ...JSON.parse(JSON.stringify(S().up)), steel: 1 } }));
    const c2 = K.cardEl('frame:steel'); if (!c2 || c2.dataset.locked) bad.push('the guest card is still locked after the host unlocked it'); if (/Buy it at the terminal/.test(K.norm(K.detail().textContent))) bad.push('the guest pane still says locked');
    if (K.tabs().locked.total >= lockedBefore) bad.push('the Locked count did not shrink on the guest'); if (!K.detail().querySelector('button[data-n]:not(:disabled)')) bad.push('no live craft button for the unlocked row');
    // and its items: the host's word on what the guest holds (an `inv` message) shows on the card
    PIN.applyInv(g, { t: 'inv', q: 1, f: 1, pn: 1, i: Object.entries({ ...JSON.parse(JSON.stringify(S().items)), 'frame:steel': 4 }).flat(), m: [] });   // (the guest's own count comes in its `inv` message since Wave 12, not in the shared one)
    const own = (K.cardEl('frame:steel').querySelector('.bc-own') || {}).textContent; if (own !== '×4') bad.push('the card shows "' + own + '" for four held');
    done(); return bad.length === 0 || bad.slice(0, 5).join('; ');
  }));

  await T('mp.bench.audit.the-bench-of-the-host-follows-a-bot-or-a-craft-the-guest-asked-for', guard(async () => {
    fresh({ crew: 1, crewSlots: 3, struts: 1 }); g.crew.sync(); S().money = 1e9; const bad = []; role('host'); cap();
    K.open(); K.tab('robots'); K.pick(BOT_ID); const n0 = S().crew.length;
    g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: BOT_ID, n: 1 } }));
    if (S().crew.length !== n0 + 1) bad.push('the host did not hatch the guest\'s bot');
    if (g.ui.openModal === 'craft' && !new RegExp(`${n0 + 1} of 4 bunks used`).test(K.norm(K.detail().textContent))) bad.push('the host bench still shows the old bunk count: ' + K.norm(K.detail().textContent).slice(0, 180));
    K.tab('supports'); K.pick('strut'); const k0 = S().items.strut || 0; g.netMessage(json({ t: 'cmd', c: 'craft', d: { id: 'strut', n: 3 } }));
    if ((S().items.strut || 0) !== k0 + 3) bad.push('the guest craft was not made');
    const own = (K.cardEl('strut').querySelector('.bc-own') || {}).textContent; if (own !== `×${k0 + 3}`) bad.push(`the host card shows "${own}" after the guest crafted three`);
    done(); return bad.length === 0 || bad.slice(0, 5).join('; ');
  }));
}
