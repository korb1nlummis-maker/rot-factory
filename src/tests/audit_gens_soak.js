// audit gens: a seeded random soak over the generator ladder and the hanging lanterns. Places rungs, frames and lanterns, wires, feeds, switches,
// hammers and advances time with odd frame lengths, then checks that nothing went NaN, every cord has two live ends within its ports, hoppers never
// overflow, no side of a frame holds two lanterns, and a save and reload in the middle brings the same set back.
import { makeKit, UP } from './power_lib.js';
import * as PP from '../powerparts.js';
import * as HL from '../hanglamp.js';
import { pools } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, L, adv, toI, toK } = ctx;
  const K = makeKit(ctx);
  const FULL = { ...UP, genOutput: 2, genBuffer: 1, genTurbine: 1, genPlant: 1, genStation: 1, genTitan: 1 };

  const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const check = (step, bad) => {
    const ents = new Map(); for (const t of L().tiles.values()) ents.set(t.id, t); for (const it of g.machines.items.values()) ents.set(it.ent.id, it.ent);
    for (const t of L().tiles.values()) {
      if (t.type !== 'gen') continue;
      if (!Number.isFinite(t.burn)) bad.push(`${step}: gen ${t.id} burn ${t.burn}`);
      if (t.q.length > PP.genHopper(g.T, t)) bad.push(`${step}: gen ${t.id} hopper ${t.q.length}`);
      if (t.lit && !(t.burn > 0)) bad.push(`${step}: gen ${t.id} lit with burn ${t.burn}`);
    }
    const seen = new Set(), per = new Map();
    for (const l of HL.lampsOf(g)) {
      if (!Number.isFinite(l.pw ?? 0) || (l.pw ?? 0) < -1e-9 || (l.pw ?? 0) > 1 + 1e-9) bad.push(`${step}: lantern ${l.id} pw ${l.pw}`);
      const key = l.frameId + ':' + l.slot; if (seen.has(key)) bad.push(`${step}: two lanterns on ${key}`); seen.add(key);
    }
    for (const c of g.cables.list()) { per.set(c.a, (per.get(c.a) || 0) + 1); per.set(c.b, (per.get(c.b) || 0) + 1); if (!ents.has(c.a) || !ents.has(c.b)) bad.push(`${step}: cable ${c.id} has a dead end`); }
    for (const [id, n] of per) { const e = ents.get(id); if (e && n > PP.maxPorts(e, g)) bad.push(`${step}: ${e.type} ${id} has ${n} cords for ${PP.maxPorts(e, g)} ports`); }
    for (const n of g.power.nets) { for (const k of ['supply', 'demand', 'cap']) if (!Number.isFinite(n[k]) || n[k] < 0) bad.push(`${step}: net ${k} ${n[k]}`); }
  };

  await T('gens.audit.soak.random-edits-keep-every-invariant-and-a-reload-brings-it-back', async () => {
    const bad = [], act = { gens: 0, lamps: 0, cords: 0, burning: 0 };
    for (const seed of [11, 4242]) {
      K.reset(FULL); g.T.genBuffer = 4; const R = rng(seed), pick = (a) => a[Math.floor(R() * a.length)];
      S().items.cable = 400; S().items.hlamp = 400;
      const kinds = PP.GEN_KINDS.map((k) => k.key), frames = [];
      const live = () => [...L().tiles.values(), ...[...g.machines.items.values()].map((i) => i.ent)];
      const wireable = () => live().filter((e) => e.type === 'gen' || e.type === 'hlamp' || e.type === 'pole' || e.type === 'fan');
      for (let step = 0; step < 450 && bad.length < 6; step++) {
        const r = R();
        try {
          if (r < 0.16) {
            const x = -12 + Math.floor(R() * 22) * 1.0, z = Math.floor(R() * 9), k = pick(kinds);
            if (!g.logi.canPlace(toI(x), 0, toK(z))) K.tile('gen', x, z, k === 'std' ? {} : { gk: k });
          } else if (r < 0.26) { const f = { id: g.nextId(), type: 'frame', kind: 'timber', axis: 'z', cx: -12 + R() * 22, cz: 11 + R() * 3, y0: 0, w: 2.38, h: 2.38, yaw: 0 }; S().entities.push(f); g.addEntity(f); frames.push(f); }
          else if (r < 0.40) { const f = pick(frames.filter((q) => g.machines.items.has(q.id))); if (f) { const slot = Math.floor(R() * 4); if (!HL.conflict(g, { frameId: f.id, slot })) g.placeEntity('hlamp', HL.lampFields(f, slot), { quiet: true }); } }
          else if (r < 0.58) { const w = wireable(); const a = pick(w), b = pick(w); if (a && b && a !== b) g.cables.connect(a.id, b.id); }
          else if (r < 0.70) { const gs = [...L().tiles.values()].filter((t) => t.type === 'gen'); const t = pick(gs); if (t) for (let n = 0; n < 1 + R() * 30; n++) g.logi.accept(t, { sp: pick(pools.slice(0, 4))[0], vr: 0 }, null); }
          else if (r < 0.76) { const l = pick(HL.lampsOf(g)); if (l) g.setCfg(l, { on: R() < 0.5 }); }
          else if (r < 0.84) { const e = pick(live().filter((q) => q.type === 'gen' || q.type === 'hlamp' || q.type === 'frame' || q.type === 'pole')); if (e) g.doDecon({ kind: g.logi.byId.get(e.id) ? 'tile' : 'mach', id: e.id }); }
          else if (r < 0.90) { const t = pick([...L().tiles.values()].filter((q) => q.type === 'gen')); if (t) { t.burn = 0; t.lit = false; } }
          else { const dt = pick([0.016, 0.033, 0.05, 0.2, 0.9]); for (let n = 0; n < 1 + Math.floor(R() * 8); n++) { g.time += dt; g.power.update(dt); } g.power.markDirty(); }
          if (step % 5 === 0) adv(0.1);
        } catch (e) { bad.push(`seed ${seed} step ${step} threw ${e && e.message}`); break; }
        act.gens = Math.max(act.gens, [...L().tiles.values()].filter((t) => t.type === 'gen').length); act.lamps = Math.max(act.lamps, HL.lampsOf(g).length); act.cords = Math.max(act.cords, g.cables.list().length); if ([...L().tiles.values()].some((t) => t.type === 'gen' && t.burn > 0)) act.burning++;
        check(`seed ${seed} step ${step}`, bad);
        if (step === 220) {   // save and reload everything in the middle
          adv(1.5);
          const ents = JSON.parse(JSON.stringify(S().entities)), cab = JSON.parse(JSON.stringify(S().cables || g.cables.list().map((c) => ({ id: c.id, a: c.a, b: c.b }))));
          const before = ents.filter((e) => e.type === 'gen' || e.type === 'hlamp').map((e) => `${e.type}:${e.id}:${e.gk || ''}:${e.frameId ?? ''}${e.slot ?? ''}`).sort().join();
          const nCab = g.cables.list().length;
          for (const e of live()) { if (g.logi.byId.get(e.id)) g.logi.remove(e); }
          for (const it of [...g.machines.items.values()]) { g.machines.disposeObj(it.obj); g.machines.root.remove(it.obj); g.machines.items.delete(it.ent.id); }
          S().entities = []; S().cables = cab; g.cables.reset();
          for (const e of ents) { S().entities.push(e); g.addEntity(e); }
          adv(2);
          const after = S().entities.filter((e) => e.type === 'gen' || e.type === 'hlamp').map((e) => `${e.type}:${e.id}:${e.gk || ''}:${e.frameId ?? ''}${e.slot ?? ''}`).sort().join();
          const gone = HL.lampsOf(g).filter((l) => !g.machines.items.has(l.frameId)).length;   // the host drops a lantern whose frame is not there: not an error
          if (before !== after && gone === 0) bad.push(`seed ${seed}: reload changed the generators and lanterns`);
          if (g.cables.list().length !== nCab) bad.push(`seed ${seed}: cables ${nCab} became ${g.cables.list().length}`);
          check(`seed ${seed} after reload`, bad);
        }
      }
    }
    if (act.gens < 6 || act.lamps < 3 || act.cords < 4 || act.burning < 20) bad.push('the soak did too little: ' + JSON.stringify(act));
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });
}
