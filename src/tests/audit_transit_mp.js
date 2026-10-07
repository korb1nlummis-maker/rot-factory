// mp.transit.audit.*: what a hostile or confused guest can do through the host's command path (place, cfg, decon, bulk) to doors, elevators, jump pads and cushions.
import { kit } from './transit_lib.js';
import * as TR from '../transit.js';
import { BULK } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, w, p, adv, craft, toI, toK } = ctx;
  const X = kit(ctx), K = X.K;
  const json = (m) => JSON.parse(JSON.stringify(m));
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { delete g.netSend; g.net.open = false; g.net.role = null; g.netOut.length = 0; X.clean(); } });
  const host = () => { g.net.open = true; g.net.role = 'host'; g.netSend = () => {}; };
  const I0 = () => toI(-20), K0 = () => toK(4);
  const BAD = [NaN, Infinity, -Infinity, -1, 1.5, 1e9, 2 ** 53, '3', null, undefined, true, [], {}, [1, 2], 'x'];
  const MINE = ['door', 'plift', 'callbtn', 'jump', 'cushion'];
  const mineCount = () => S().entities.filter((e) => MINE.includes(e.type)).length;
  const sane = (e) => {
    for (const k of ['i0', 'k0', 'j', 'i', 'k', 'ang', 'hd', 'cy', 'p', 'buf', 'cool', 'tgt']) if (e[k] !== undefined && !(Number.isFinite(e[k]))) return `${e.type}.${k} = ${e[k]}`;
    if (e.type === 'jump' && !(e.ang >= 0 && e.ang <= 90 && e.ang % 5 === 0 && e.hd >= 0 && e.hd < 360 && e.hd % 15 === 0)) return `jump ang ${e.ang} hd ${e.hd}`;
    if (e.type === 'door' && !(e.blast === !!e.blast && ['none', 'power', 'key'].includes(e.lock) && (e.ax === 'x' || e.ax === 'z'))) return 'door fields ' + JSON.stringify({ blast: e.blast, lock: e.lock, ax: e.ax });
    return null;
  };

  await guard('mp.transit.audit.forged-place-commands-never-make-a-bad-ent-or-a-free-one', async () => {
    X.setup(); host(); const bad = [], i = I0(), k = K0();
    for (const id of ['door', 'door:blast', 'plift', 'jump', 'cushion']) craft(id, 3);
    const base = {
      door: { type: 'door', ax: 'x', i0: i, k0: k, j: 0, blast: false },
      'door:blast': { type: 'door', ax: 'z', i0: i, k0: k, j: 0, blast: true },
      plift: { type: 'plift', i0: i, k0: k, j: 0 },
      jump: { type: 'jump', i0: i, k0: k, j: 0, ang: 45, hd: 90 },
      cushion: { type: 'cushion', i0: i, k0: k, j: 0 },
    };
    const kinds = { door: 'door', 'door:blast': 'door', plift: 'plift', jump: 'jump', cushion: 'cushion' };
    let tried = 0, made = 0;
    const attempt = (tool, ent, label) => {
      const items0 = JSON.stringify(S().items), n0 = mineCount(), ids0 = new Set(S().entities.map((e) => e.id));
      tried++;
      try { g.netCmd('place', { tool: json(tool), ent: json(ent) }); } catch (x) { bad.push(`${label}: threw ${x && x.message}`); return; }
      const fresh = S().entities.filter((e) => !ids0.has(e.id) && MINE.includes(e.type));
      if (fresh.length > 1) bad.push(`${label}: made ${fresh.length} things from one message`);
      for (const e of fresh) { made++; const why = sane(e); if (why) bad.push(`${label}: ${why}`); }
      if (!fresh.length && JSON.stringify(S().items) !== items0 && !/replaces/.test(label)) bad.push(`${label}: nothing was made but the pack changed`);
      for (const e of fresh) { X.decon(e); }   // hand it back so every attempt starts from the same pack
    };
    for (const [id, ent] of Object.entries(base)) {
      const tool = { id, kind: kinds[id] };
      for (const f of Object.keys(ent)) { if (f === 'type') continue; for (const v of BAD) { const e2 = { ...ent, [f]: v }; if (v === undefined) delete e2[f]; attempt(tool, e2, `${id}.${f}=${JSON.stringify(v)}`); } }
      // wrong item for the kind, wrong kind for the item
      for (const [id2, kind2] of [['cushion', kinds[id]], ['door', kinds[id]], [id, 'belt'], [id, 'cushion'], [id, 'frame'], [undefined, kinds[id]], ['__proto__', kinds[id]]]) if (id2 !== id || kind2 !== kinds[id]) attempt({ id: id2, kind: kind2 }, ent, `${id} with item ${id2} kind ${kind2}`);
      attempt(tool, null, `${id} with no ent`); attempt(null, ent, `${id} with no tool`);
    }
    if (made < 5) bad.push(`only ${made} of ${tried} attempts made anything: the valid base placements do not work, the fuzz proves nothing`);
    // after all that every item is still in the pack and nothing is left in the world
    for (const id of ['door', 'door:blast', 'plift', 'jump', 'cushion']) if ((S().items[id] || 0) !== 3) bad.push(`${id}: ${S().items[id]} in the pack, started with 3`);
    return bad.length === 0 || bad.slice(0, 8).join(' || ') + (bad.length > 8 ? ` (+${bad.length - 8} more)` : '');
  });

  await guard('mp.transit.audit.forged-cfg-and-decon-commands', async () => {
    X.setup(); host(); const bad = [], i = I0(), k = K0();
    const D = X.door(i, k, { lock: 'key', auto: false }), Lf = X.lift(i + 12, k, { home: 12, depth: 10, top: 18 }), J = X.jump(i + 24, k, { ang: 55, hd: 120 }), Cu = X.cushion(i + 32, k, 0);
    const snap = () => JSON.stringify([D, Lf, J, Cu].map((e) => { const o = {}; for (const key of Object.keys(e).sort()) if (!['pw', 'draw', 'idle', 'cache', 'vis'].includes(key)) o[key] = e[key]; return o; }));
    const keys = ['tgt', 'lock', 'auto', 'call', 'go', 'press', 'ang', 'hd', 'on', 'p', 'cy', 'buf', 'cool', 'ax', 'i0', 'j', 'blast', 'lid', 'rid', 'id', 'type', '__proto__', 'constructor'];
    let n = 0;
    for (const e of [D, Lf, J, Cu]) for (const key of keys) for (const v of BAD) {
      const before = snap(), items0 = JSON.stringify(S().items);
      try { g.netCmd('cfg', { id: e.id, patch: { [key]: v } }); } catch (x) { bad.push(`cfg ${e.type}.${key}=${JSON.stringify(v)} threw ${x && x.message}`); continue; }
      n++;
      for (const t of [D, Lf, J, Cu]) { const why = sane(t); if (why) bad.push(`cfg ${e.type}.${key}=${JSON.stringify(v)} left ${why}`); }
      if (JSON.stringify(S().items) !== items0) bad.push(`cfg ${e.type}.${key}=${JSON.stringify(v)} changed the pack`);
      if (bad.length > 6) break;
    }
    // patches that are not objects, ids that are not ents
    for (const d of [null, 5, 'x', [], { id: 5 }, { id: NaN, patch: {} }, { id: D.id }, { id: D.id, patch: null }, { id: D.id, patch: [] }, { id: 'door', patch: { tgt: 1 } }]) { try { g.netCmd('cfg', d); } catch (x) { bad.push('cfg ' + JSON.stringify(d) + ' threw ' + x.message); } }
    // decon of ids that are not there, and of ents that are not there
    const items1 = JSON.stringify(S().items); for (const id of [NaN, -1, 0, 1e9, '7', null, undefined, {}]) { try { g.netCmd('decon', { kind: 'mach', id }); } catch (x) { bad.push('decon ' + JSON.stringify(id) + ' threw ' + x.message); } }
    if (JSON.stringify(S().items) !== items1) bad.push('decon of nothing changed the pack');
    for (const e of [D, Lf, J, Cu]) if (!g.machines.items.has(e.id)) bad.push(`${e.type} vanished`);
    if (n < 100) bad.push('too few cfg attempts ran: ' + n);
    return bad.length === 0 || bad.slice(0, 8).join(' || ');
  });
}
