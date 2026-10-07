// audit.bins.soak-*: seeded random edits on a yard with every kind of subject (bots, a cart, a belt line with a mech, a truck and a digger) and a handful of Depot Beacons that come and
// go, lose power, get renamed, and are assigned and unassigned, with a real save and load and forged guest commands in the middle. After every step: nothing throws, every `dest`
// is a whole number, a beacon taken down through the hammer leaves nothing assigned to it, beacon numbers stay unique, the money only goes up and never by less than the
// tallies of the bins, and the tallies only count real sales. Run: `await __selftest('audit.bins.soak')`
import { kit } from './bins_lib.js';
import * as BINS from '../bins.js';

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export default async function (ctx) {
  const { g, S, L, toI, toK, craft } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const SEEDS = globalThis.__binsSoakSeeds || [3, 11, 29];

  for (const seed of SEEDS) {
    await G(`audit.bins.soak-seed-${seed}-bins-come-and-go-under-every-kind-of-subject-with-saves-and-forged-commands`, async () => {
      const R = rng(seed), bad = [], did = { add: 0, hammer: 0, assign: 0, power: 0, rename: 0, save: 0, forged: 0, refill: 0, run: 0 };
      const bp = K.bin(), spots = [[-2, 9], [6, 12], [-10, 6], [10, 4], [-6, 11], [3, 7]], used = new Set();
      craft('cart:1'); g.useCart(); S().cart.mode = 'stay'; S().cart.x = bp.x - 3; S().cart.z = bp.z + 3; S().cart.y = 0;
      const ie = toI(bp.x) - 2, kk = toK(bp.z);
      for (let i = ie - 5; i <= ie; i++) K.rawTile('belt', i, kk, { dir: 0 });
      K.rawTile('belt', ie - 5, kk - 1, { dir: 1 }); K.rawTile('mech', ie - 4, kk - 1, { dir: 0, buf: [], out: 0, adv: 0, state: 'dig', timer: 1e9 });
      const bots = [K.mkBot(-4, 5), K.mkBot(4, 5)];
      const { tk, dg } = K.site();
      const beacons = () => S().entities.filter((e) => e.type === 'beacon');
      const addBeacon = () => { const free = spots.map((s, n) => n).filter((n) => !used.has(n)); if (!free.length) return; const n = free[Math.floor(R() * free.length)]; used.add(n); const e = K.beacon(spots[n][0], spots[n][1], { num: BINS.nextNum(g) }); e._spot = n; did.add++; };
      addBeacon(); addBeacon(); K.run(0.3);
      const ids = () => [BINS.AUTO, BINS.HALL, ...beacons().map((e) => e.id)];
      const pick = (a) => a[Math.floor(R() * a.length)];
      const live = () => BINS.subjects(g);
      const topUp = () => {
        for (const b of S().crew) { b.battery = 1; if (!b.carry.length && ['idle', 'follow'].includes(b.state)) { b.carry = K.mix(4); g.crew.goHome(b); } }
        const c = S().cart; if (c && c.load.length < 4) for (let q = 0; q < 4; q++) c.load.push({ sp: 2, vr: 0 });
        const d = g.machines.items.get(dg.id); if (d && d.ent.hop.length < 40) { const h = []; for (let q = 0; q < 60; q++) h.push(3, 0); d.ent.hop = h; d.ent.hn = 60; }
        for (const t of ctx.tiles()) { if (t.type === 'mech' && t.buf.length < 2) t.buf.push(...K.mix(3)); if (t.type === 'belt' && !t.detector && t.items.length < 2 && !L().nextOf(t) === false) t.items.push({ sp: 3, vr: 0, t: 0.1 }); }
      };
      const m0 = K.money(), errs0 = g.errCount || 0; let moneyPrev = m0;
      const check = (step, what) => {
        if ((g.errCount || 0) > errs0) bad.push(`step ${step} (${what}): frame errors ${(g.errLog || []).slice(-1)[0]}`);
        for (const s of live()) { const d = s.o.dest; if (d !== undefined && !Number.isInteger(d)) bad.push(`step ${step} (${what}): ${BINS.subjectLabel(s)} has dest ${JSON.stringify(d)}`); }
        const nums = beacons().map((e) => e.num).filter((n) => n !== undefined); if (new Set(nums).size !== nums.length) bad.push(`step ${step} (${what}): beacon numbers repeat ${nums}`);
        const money = K.money(); if (money < moneyPrev) bad.push(`step ${step} (${what}): money went down ${moneyPrev} -> ${money}`); moneyPrev = money;
        let tv = 0, tn = 0; for (const [id, r] of Object.entries(S().binStats || {})) { if (!Number.isInteger(+id) || !(r.tn >= r.n) || !(r.tv >= r.v) || !(r.tn >= 0)) bad.push(`step ${step} (${what}): bad tally ${id} ${JSON.stringify(r)}`); tv += r.tv; tn += r.tn; }
        if (tv > money - m0 + 1) bad.push(`step ${step} (${what}): the bins sold ${tv} but the money only went up by ${money - m0}`);
        for (const b of BINS.listBins(g)) { if (!b.name || /[<>]/.test(b.name)) bad.push(`step ${step} (${what}): bin name ${JSON.stringify(b.name)}`); }
        void tn;
      };
      for (let step = 0; step < 50 && bad.length < 4; step++) {
        const raw = Math.floor(R() * 12); let what = '';
        if (raw === 0) { what = 'add a beacon'; addBeacon(); }
        else if (raw === 1) { const bs = beacons(); if (bs.length) { what = 'hammer a beacon'; const e = pick(bs); const id = e.id; used.delete(e._spot); g.doDecon({ kind: 'mach', id }); did.hammer++; for (const s of live()) if ((s.o.dest | 0) === id) bad.push(`step ${step}: ${BINS.subjectLabel(s)} still assigned to the beacon taken down`); } }
        else if (raw <= 4) { what = 'assign'; const subs = live(); if (subs.length) { const s = pick(subs), d = pick([...ids(), ids()[ids().length - 1] + 1000]); const r = s.k === 'ent' ? g.setCfg(s.o, { dest: d }) : BINS.assign(g, s, d); did.assign++; if (r.ok && d > 0 && !BINS.binById(g, d)) bad.push(`step ${step}: a bin that is not there was taken for ${BINS.subjectLabel(s)}`); if (!r.ok && ids().includes(d)) bad.push(`step ${step}: a real bin was refused for ${BINS.subjectLabel(s)} (${s.k}/${s.o.type}): ${r.why}`); } }
        else if (raw === 5) { what = 'power'; const bs = beacons(); if (bs.length) { const e = pick(bs); if (K.off.has(e.id)) K.off.delete(e.id); else K.off.add(e.id); did.power++; } }
        else if (raw === 6) { what = 'rename'; const bs = beacons(); if (bs.length) { const e = pick(bs); g.setCfg(e, { name: pick(['', 'Deep Dig', 'A & B', 'x'.repeat(30), '  ', '\u0007hi']) }); did.rename++; } }
        else if (raw === 7) { what = 'refill'; topUp(); did.refill++; }
        else if (raw === 8) {
          what = 'save and load'; const key = 'rotfactory.save.v1', kept = localStorage.getItem(key), noSave0 = g.noSave;
          try { g.noSave = false; g.mode = 'play'; if (g.save()) { const { loadSaved } = await import('../state.js'); const sv = loadSaved(); g.loadWorld(sv.S, sv); did.save++; } } finally { g.noSave = noSave0; if (kept === null) localStorage.removeItem(key); else localStorage.setItem(key, kept); g.mode = 'play'; }
        }
        else if (raw === 9) {
          what = 'forged guest commands'; K.role('host'); K.cap(); const subs = live(), b = S().crew[0];
          const junk = [{ k: 'bot', id: b ? b.id : 1, dest: pick([1.5, '3', 99999, -2, null, ids()[1], ids()[ids().length - 1]]) }, { k: 'cart', dest: pick([0, -1, 99999]) }, { k: 'ent', id: subs.length ? subs[0].o.id : 1, dest: 5 }, null, 7, 'x', [], { k: 'bot' }];
          for (const d of junk) g.netMessage({ t: 'cmd', c: 'bindest', d: K.json(d) });
          for (const s of subs.filter((q) => q.k === 'ent').slice(0, 3)) g.netMessage({ t: 'cmd', c: 'cfg', d: K.json({ id: s.o.id, patch: pick([{ dest: pick(ids()) }, { dest: 1e12 }, { dest: 2.5 }, { bogus: 1 }, { dest: -1, name: 'x' }]) }) });
          K.done(); did.forged++;
        }
        else { what = 'run'; K.run(4 + R() * 12); did.run++; }
        topUp(); if (what !== 'run') K.run(2);
        check(step, what);
      }
      K.run(8); check(99, 'final run');
      if (Object.values(did).reduce((a, b) => a + b, 0) < 24) bad.push('the soak did too little: ' + JSON.stringify(did));
      (globalThis.__binsSoakLog || (globalThis.__binsSoakLog = {}))[seed] = { did, sold: K.money() - m0, stats: JSON.stringify(S().binStats) };
      return bad.length === 0 || `${bad.join(' || ')} :: ${JSON.stringify(did)}`;
    });
  }
}
