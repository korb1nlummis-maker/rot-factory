// Notes and the diggers: bots and machines that dig beside remains or a supply cache flag it (a mark on the compass, a toast, a line in the crew panel) and stop short of it,
// so nothing is destroyed. Borers and the Portal report it like other blockers. A Bot Scholar carries a note home, and it lands in the journal once.
// Run: `await __selftest('notes.bots.')`
import { kit } from './charger_lib.js';
import { makeKit, UP, PORTAL } from './portal_lib.js';
import * as NB from '../notebook.js';
import { REMAINS, CACHE } from '../plushdata.js';
import { saveGame, loadSaved } from '../state.js';
import { UPGRADES, isUnlocked } from '../upgrades.js';
import { SAVE_KEY } from '../config.js';

export default async function (ctx) {
  const { T, g, S, w, sim, fresh, toI, toK, cellX, cellZ, newWorld } = ctx;
  const $ = (id) => document.getElementById(id);
  const { rawTile, run, tunnel, digging, mkBot } = kit(ctx);
  const placed = [];   // special cells this file put in the world: cleared at the start of the next test (a world edit outlives fresh())
  const put = (i, j, k, sp) => { w().setCell(i, j, k, sp, 3); placed.push([i, j, k]); };
  const reset = (up = {}) => {
    for (const [i, j, k] of placed.splice(0)) if ([REMAINS, CACHE].includes(w().get(i, j, k))) w().setCell(i, j, k, 0, 0);
    fresh({ crew: 1, ...up }); const s = S(); s.notes = []; s.papers = []; s.heard = []; s.nflags = []; s.clues = []; s.ach = {}; s.stats.remains = 0; s.stats.caches = 0;
    g.ui.closeModalsSilently(); g.ui.openModal = null; g._nfLive = null; const box = $('toasts'); if (box) box.innerHTML = '';
  };
  const toasts = () => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent);
  const states = (b, sec) => { const seen = []; run(sec, 0.05, () => { if (seen[seen.length - 1] !== b.state) seen.push(b.state); }); return seen; };

  await T('notes.bots.a-bot-flags-remains-ahead-of-it-and-stops-short-without-cutting-them', async () => {
    reset(); const tun = tunnel(40), ci = tun.i + 34; put(ci, 0, tun.k, REMAINS);
    const b = digging(tun, 30, 1), seen = states(b, 70);
    if (w().get(ci, 0, tun.k) !== REMAINS) return 'the remains were cut: the cell is ' + w().get(ci, 0, tun.k);
    const f = S().nflags[0]; if (!f || f.what !== 'remains' || f.i !== ci || f.by !== b.name) return 'flags ' + JSON.stringify(S().nflags);
    if (S().nflags.length !== 1) return 'flagged ' + S().nflags.length + ' times';
    if (!toasts().some((t) => new RegExp(`${b.name} found remains at \\d+ m [a-z-]+`).test(t))) return 'no toast: ' + toasts().join(' || ');
    if (!seen.includes('blocked')) return 'states ' + seen;
    if (!seen.includes('return') && !seen.includes('unload')) return 'it did not head home: ' + seen;
    if (!toasts().some((t) => /stopped short/i.test(t))) return 'no stop-short message: ' + toasts().join(' || ');
    return S().notes.length === 0 || 'a bot without the upgrade took the note';
  });

  await T('notes.bots.a-supply-cache-is-flagged-and-left-alone-even-by-a-scholar', async () => {
    reset({ scholar: 3 }); const tun = tunnel(40), ci = tun.i + 34; put(ci, 0, tun.k, CACHE);
    const b = digging(tun, 30, 1); states(b, 70);
    if (w().get(ci, 0, tun.k) !== CACHE) return 'the cache was taken: ' + w().get(ci, 0, tun.k);
    if (!S().nflags.some((f) => f.what === 'cache' && f.i === ci)) return 'no cache flag';
    if ((b.notes || []).length || S().papers.length || S().stats.caches) return 'a bot opened a cache';
    return toasts().some((t) => /supply cache at/.test(t)) || 'no toast: ' + toasts().join(' || ');
  });

  await T('notes.bots.bot-scholar-carries-the-note-home-and-it-lands-in-the-journal-once', async () => {
    reset({ scholar: 1 }); if (g.T.scholar !== 1) return 'the upgrade did not set the tuning: ' + g.T.scholar;
    const tun = tunnel(40), ci = tun.i + 34; put(ci, 0, tun.k, REMAINS);
    const b = digging(tun, 30, 1); let carried = 0, said = ''; run(80, 0.05, () => { carried = Math.max(carried, (b.notes || []).length); if (!said && (b.notes || []).length) said = g.crew.statusLine(b); });
    if (carried !== 1) return 'the bot never carried a note (' + carried + ')';
    if (!/carrying \d+ plush and 1 note/.test(said)) return 'the crew panel line does not say it holds a note: ' + said;
    if (w().get(ci, 0, tun.k) !== 0) return 'the cell is still ' + w().get(ci, 0, tun.k);
    if (S().notes.length !== 1 || S().notes[0].id !== `wk:${ci}.0.${tun.k}`) return 'journal ' + JSON.stringify(S().notes.map((n) => n.id));
    if (S().stats.remains !== 1) return 'remains counted ' + S().stats.remains;
    if ((b.notes || []).length) return 'the bot still holds it';
    if (g.ui.openModal === 'note') return 'a bot delivery opened the note window';
    if (!toasts().some((t) => /brought a note home/.test(t))) return 'no delivery toast: ' + toasts().join(' || ');
    // once: a second hand-over, a second bot at the same place, and the player opening the same cell change nothing
    const m1 = S().money, bo1 = JSON.stringify(S().boosts), up1 = JSON.stringify(S().up);
    b.notes = [[ci, 0, tun.k]]; NB.deliver(g, b); if (S().notes.length !== 1) return 'a second delivery added a note';
    if (S().money !== m1 || JSON.stringify(S().boosts) !== bo1 || JSON.stringify(S().up) !== up1) return 'a second delivery paid its reward again';
    return (S().stats.remains === 1 && S().notes.length === 1) || `a second delivery counted: remains ${S().stats.remains}, notes ${S().notes.length}`;
  });

  await T('notes.bots.a-note-in-a-bots-hands-survives-a-save-and-is-delivered-after-the-load', async () => {
    reset({ scholar: 1 }); const tun = tunnel(40), ci = tun.i + 34; put(ci, 0, tun.k, REMAINS);
    const b = digging(tun, 30, 1); run(60, 0.05, () => (b.notes || []).length === 1);
    if ((b.notes || []).length !== 1) return 'the bot never picked the note up';
    let kept = null; try { kept = localStorage.getItem(SAVE_KEY); } catch (e) { return 'no storage'; }
    try {
      if (!saveGame(S(), w(), sim())) return 'save failed'; const p = loadSaved(), bot = p && p.S.crew.find((x) => x.id === b.id);
      if (!bot || !bot.notes || bot.notes.length !== 1 || bot.notes[0][0] !== ci) return 'the note did not survive the save: ' + JSON.stringify(bot && bot.notes);
      if (p.S.notes.length) return 'the note was in the journal before the bot arrived';
      b.notes = JSON.parse(JSON.stringify(bot.notes)); NB.deliver(g, b);
      return (S().notes.length === 1 && S().notes[0].id === `wk:${ci}.0.${tun.k}`) || 'after the load ' + JSON.stringify(S().notes.map((n) => n.id));
    } finally { try { if (kept === null) localStorage.removeItem(SAVE_KEY); else localStorage.setItem(SAVE_KEY, kept); } catch (e) { /* ignore */ } }
  });

  await T('notes.bots.two-scholars-beside-the-same-remains-bring-one-note', async () => {
    reset({ scholar: 2 }); const tun = tunnel(40), ci = tun.i + 34; put(ci, 0, tun.k, REMAINS);
    const a = digging(tun, 30, 1), b2 = digging(tun, 31, 1); b2.name = 'Second'; run(90);
    return (S().notes.length === 1 && S().stats.remains === 1 && w().get(ci, 0, tun.k) === 0 && !(a.notes || []).length && !(b2.notes || []).length) || `notes ${S().notes.length} remains ${S().stats.remains} a ${(a.notes || []).length} b ${(b2.notes || []).length}`;
  });

  await T('notes.bots.a-delivered-note-brings-the-same-reward-and-paper-as-opening-it-yourself', async () => {
    const snap = () => ({ money: S().money, boosts: { ...S().boosts }, up: JSON.stringify(S().up) });
    const diff = (a, b) => JSON.stringify([b.money - a.money, ...Object.keys(a.boosts).map((k) => +(b.boosts[k] - a.boosts[k]).toFixed(6)), a.up === b.up]);
    const tun = (reset({ scholar: 1 }), tunnel(40)), ci = tun.i + 34, kk = tun.k;
    put(ci, 0, kk, REMAINS); const a0 = snap(); g.openRemains(ci, 0, kk);
    const mine = { d: diff(a0, snap()), notes: S().notes.map(({ n, ...r }) => r), papers: S().papers.map((d) => d.id), clues: S().clues.length };
    g.ui.closeModalsSilently(); g.ui.openModal = null;
    reset({ scholar: 1 }); const b0 = snap(), b = mkBot(cellX(ci), cellZ(kk)); b.notes = [[ci, 0, kk]]; NB.deliver(g, b);
    const bots = { d: diff(b0, snap()), notes: S().notes.map(({ n, ...r }) => r), papers: S().papers.map((d) => d.id), clues: S().clues.length };
    return JSON.stringify(mine) === JSON.stringify(bots) || JSON.stringify({ mine, bots });
  });

  await T('notes.bots.bot-scholar-is-a-three-level-crew-upgrade-priced-for-the-mid-game-and-buying-it-sets-the-tuning', async () => {
    const u = UPGRADES.find((x) => x.id === 'scholar'); if (!u) return 'no Bot Scholar upgrade';
    if (u.cat !== 'crew' || u.max !== 3 || u.cost.length !== 3 || !(u.cost[0] < u.cost[1] && u.cost[1] < u.cost[2])) return 'shape ' + JSON.stringify([u.cat, u.max, u.cost]);
    if (u.cost[0] < 2e5 || u.cost[0] > 2e6 || u.cost[2] > 2e7) return 'not mid-game money: ' + u.cost;
    if (!u.needs || u.needs > 3e4 || !u.req || u.req.id !== 'crew') return 'gate ' + JSON.stringify([u.needs, u.req]);
    fresh({}); S().stats.plush = 1e9; if (isUnlocked(u, S().up, S())) return 'unlocked without a bot line';
    reset({}); S().money = 1e12; const out = [];
    for (let lv = 1; lv <= 3; lv++) { const m0 = S().money; if (!g.buy('scholar')) return 'could not buy level ' + lv; if (m0 - S().money !== u.cost[lv - 1] || g.T.scholar !== lv) out.push(`level ${lv}: paid ${m0 - S().money}, tuning ${g.T.scholar}`); }
    if (g.buy('scholar')) out.push('bought a fourth level');
    return out.length === 0 || out.join('; ');
  });

  await T('notes.bots.scholar-levels-carry-more-and-reach-further', async () => {
    const s = NB.SCHOLAR; if (s[0] !== null) return 'level 0 is not nothing';
    for (let l = 2; l <= 3; l++) if (!(s[l].carry > s[l - 1].carry && s[l].reach > s[l - 1].reach)) return `level ${l} is not better than ${l - 1}`;
    reset({ scholar: 3 }); const t3 = g.T.scholar; reset({}); return (t3 === 3 && g.T.scholar === 0) || `tuning ${t3} then ${g.T.scholar}`;
  });

  await T('notes.bots.a-mech-flags-remains-beside-it-and-says-so-when-one-is-dead-ahead', async () => {
    reset({ power: 1, belts: 1, mech: 1 }); const tun = tunnel(40), i0 = tun.i + 10, ci = i0 + 3;
    put(ci, 0, tun.k, REMAINS);
    const m = rawTile('mech', i0, 0, tun.k, { dir: 0, buf: [], out: 0, adv: 0, state: 'dig' }); m.timer = 0.1;
    for (let n = 0; n < 400; n++) { m.pw = 1; g.time += 0.1; g.logi.update(0.1); }
    if (w().get(ci, 0, tun.k) !== REMAINS) return 'the mech cut the remains';
    if (!S().nflags.some((f) => f.what === 'remains' && f.by === 'Mech Scooper')) return 'no flag: ' + JSON.stringify(S().nflags);
    if (!m.hold || !/remains ahead/i.test(m.hold)) return 'the mech does not say what stops it: ' + m.hold;
    w().setCell(ci, 0, tun.k, 0, 0); for (let n = 0; n < 200; n++) { m.pw = 1; g.time += 0.1; g.logi.update(0.1); }
    return (!m.hold && m.i > i0 + 3) || `after the remains went: hold ${m.hold} at ${m.i - i0}`;
  });

  await T('notes.bots.a-borer-stops-short-of-a-supply-cache-reports-it-and-goes-on-once-it-is-opened', async () => {
    reset({ power: 1, belts: 1, borer: 1, borerSize: 2, steel: 1, timber: 1, concrete: 1 }); S().money = 1e12; g.T.borerRate = 0.05;
    const tun = tunnel(40), i0 = tun.i + 5, ci = i0 + 9;
    const e = { id: g.nextId(), type: 'borer', i: i0, j: 0, k: tun.k, dx: 1, dz: 0, w: 2, h: 3, x: cellX(i0), y: 0, z: cellZ(tun.k) }; S().entities.push(e); g.addEntity(e);
    put(ci, 0, tun.k, CACHE);
    const step = (n) => { for (let q = 0; q < n; q++) { for (const x of g.machines.items.values()) x.ent.pw = 1; g.time += 0.5; g.machines.update(0.5, g.time); } };
    step(300);
    if (w().get(ci, 0, tun.k) !== CACHE) return 'the borer ate the cache';
    if (e.done) return 'the borer gave up instead of waiting: it is done';
    if (!e.hold || !/supply cache ahead/i.test(e.hold)) return 'hold: ' + e.hold;
    if (e.i >= ci) return 'the borer drove past the cache: at ' + (e.i - i0);
    if (!toasts().some((t) => /Borer stopped short/.test(t))) return 'no report: ' + toasts().join(' || ');
    if (!S().nflags.some((f) => f.what === 'cache' && f.i === ci)) return 'no flag';
    const stopped = e.i; step(60); if (e.i !== stopped) return 'it moved while the cache stood';
    g.openCache(ci, 0, tun.k); step(300);
    return (!e.hold && e.i > ci) || `after opening: hold ${e.hold}, at ${e.i - i0} (cache at ${ci - i0})`;
  });

  await T('notes.bots.the-portal-stops-short-of-remains-in-its-slab-reports-it-and-goes-on-when-opened', async () => {
    await newWorld(); fresh(UP); S().money = 1e12; g.surgeT = 1e9;
    const s0 = S(); s0.notes = []; s0.papers = []; s0.heard = []; s0.nflags = []; s0.clues = []; g._nfLive = null;
    const K = makeKit(ctx); K.fast(); const st = K.site({ span: 6 }), e = K.mouth(st, 'steel');
    // remains in the floor row of the third slab
    const cell = PORTAL.slabCells(e, PORTAL.slabA(e, 2)).find(([, j]) => j === 0); const [ci, cj, ck] = cell; put(ci, cj, ck, REMAINS);
    const ok = K.until(() => e.ps === 'stuck', 400); if (!ok) return `the portal never stopped (${e.ps} ${e.pwhy}, ${e.adv} slabs)`;
    if (w().get(ci, cj, ck) !== REMAINS) return 'the portal cut the remains';
    if (!/Stopped short.*remains ahead/i.test(e.pwhy)) return 'the portal says: ' + e.pwhy;
    if (!S().nflags.some((f) => f.what === 'remains' && f.by === 'Portal')) return 'no flag';
    const stuckAt = e.adv; K.run(20); if (e.adv !== stuckAt) return 'it went on past the remains';
    g.openRemains(ci, cj, ck); g.ui.closeModalsSilently(); g.ui.openModal = null;
    const went = K.until(() => e.adv > stuckAt + 1, 400), why = `after opening it is ${e.ps} at ${e.adv}: ${e.pwhy}`;
    await newWorld(); fresh({});   // the pile face and the tunnel this built stay in the world: hand the next test a clean one
    return went || why;
  });

  await T('notes.bots.flags-show-on-the-compass-and-in-the-crew-panel-and-go-when-the-find-is-opened', async () => {
    reset({ compass: 1 }); const tun = tunnel(40), ci = tun.i + 34; put(ci, 0, tun.k, REMAINS);
    const b = mkBot(cellX(tun.i + 30), cellZ(tun.k)); NB.scan(g, b.name, b.x, b.z, 4.2);
    const p = { x: cellX(tun.i + 10), z: cellZ(tun.k) }, m = NB.markers(g, p);
    if (m.length !== 1 || m[0].label !== 'NOTE') return 'markers ' + JSON.stringify(m);
    const want = ((Math.atan2(cellX(ci) - p.x, -(cellZ(tun.k) - p.z)) * 180 / Math.PI) % 360 + 360) % 360; if (Math.abs(m[0].b - want) > 0.5) return `bearing ${m[0].b} wanted ${want}`;
    g.ui.open('crew'); const panel = $('crewList').textContent; g.ui.closeModals();
    if (!/Found by the crew/.test(panel) || !/Remains at \d+ m/.test(panel) || !panel.includes(b.name)) return 'crew panel: ' + panel.slice(0, 300);
    if (!/open one yourself/i.test(panel)) return 'the panel does not say what to do';
    // the compass strip itself takes the marks
    // the compass strip itself gets the mark, next to the Remains Locator's
    let got = null; const orig = g.ui.setCompass; g.ui.setCompass = (on, h, mk, r) => { got = mk; return orig.call(g.ui, on, h, mk, r); };
    try { g.player.pos.set(p.x, 0, p.z); g.hudT = 0; g.locT = 0; for (let n = 0; n < 8 && !got; n++) { g.time += 0.05; g.updatePlay(0.05); } } finally { g.ui.setCompass = orig; }
    if (!got || !got.some((q) => q.label === 'NOTE')) return 'the compass strip got ' + JSON.stringify(got);
    g.openRemains(ci, 0, tun.k); g.ui.closeModalsSilently(); g.ui.openModal = null; g._nfLive = null;
    return (NB.markers(g, p).length === 0 && NB.crewFinds(g).length === 0 && !S().nflags.length) || `after opening: markers ${NB.markers(g, p).length} finds ${NB.crewFinds(g).length} flags ${S().nflags.length} `;
  });

  await T('notes.bots.a-bot-in-a-guest-session-does-not-flag-and-a-flag-from-the-host-lands-once', async () => {
    reset(); const tun = tunnel(40), ci = tun.i + 34; put(ci, 0, tun.k, REMAINS);
    g.net.open = true; g.net.role = 'guest'; g.guestReady = true;
    try {
      if (NB.scan(g, 'Bot', cellX(ci), cellZ(tun.k), 4) !== 0 || S().nflags.length) return 'a guest flagged';
      const f = { what: 'remains', i: ci, j: 0, k: tun.k, by: '<img src=x onerror=alert(1)>', t: 5 };
      g.netMessage({ t: 'nflag', f }); g.netMessage({ t: 'nflag', f });
      if (S().nflags.length !== 1 || /</.test(S().nflags[0].by)) return 'guest flags ' + JSON.stringify(S().nflags);
      if (document.querySelector('#toasts img')) return 'markup got into a toast';
      g.net.role = 'host'; g.netMessage({ t: 'nflag', f: { ...f, i: ci + 1 } });
      return S().nflags.length === 1 || 'the host took a flag from a friend';
    } finally { g.net.open = false; g.net.role = null; g.guestReady = false; }
  });

  await T('notes.bots.the-bot-tests-take-their-remains-and-caches-out-of-the-world-again', async () => {
    reset({}); return placed.length === 0 && S().nflags.length === 0 && S().notes.length === 0;
  });
}
