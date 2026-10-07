// audit.bins.save-*: the audit of the bins wave. What a bin leaves on a machine must survive a real save, a load and a late joiner's copy: the mech's line cache is runtime
// only, and a loaded mech must keep feeding its line. Run: `await __selftest('audit.bins.save')`
import { kit } from './bins_lib.js';
import * as BINS from '../bins.js';

export default async function (ctx) {
  const { g, S, L, toI, toK, cellX } = ctx;
  const K = kit(ctx);
  const G = K.guard;
  const east = (i0, i1, k) => { const out = []; for (let i = i0; i <= i1; i++) out.push(K.rawTile('belt', i, k, { dir: 0 })); return out; };
  const flush = (secs = 3) => { for (let n = 0; n < secs / 0.1; n++) { for (const t of ctx.tiles()) t.pw = 1; g.time += 0.1; L().update(0.1); } };

  await G('audit.bins.save-a-mech-with-a-bin-keeps-feeding-its-line-after-a-real-save-and-load', async () => {
    const bad = [], b = K.bin(), ie = toI(b.x) - 2, k = toK(b.z);
    K.rawTile('belt', ie - 5, k - 1, { dir: 1 }); const main = east(ie - 5, ie, k); const m = K.rawTile('mech', ie - 4, k - 1, { dir: 0, buf: [], out: 0, adv: 0, state: 'dig' }); m.timer = 1e9;
    K.run(0.2); g.setCfg(m, { dest: BINS.HALL }); m.buf = K.mix(3); flush(6);
    if (m.buf.length) bad.push('the line did not take the plush before the save: ' + m.buf.length);
    // the line cache now lives on the mech: what the real save writes must not break it
    const json = JSON.parse(JSON.stringify({ entities: S().entities })); const saved = json.entities.find((e) => e.id === m.id);
    if (saved && saved._lc !== undefined && typeof saved._lc.get !== 'function' && Object.keys(saved).includes('_lc')) bad.push('the save carries the mech\'s runtime cache as ' + JSON.stringify(saved._lc));
    const before = g.errCount || 0;
    for (const t of [...ctx.tiles()]) if (t.id === m.id || main.includes(t)) L().remove(t);
    S().entities = json.entities.filter((e) => e.id !== undefined); for (const e of json.entities) if (e.type === 'belt' || e.type === 'mech') g.addEntity(e);
    const m2 = L().byId.get(m.id); if (!m2) return 'the mech did not come back';
    m2.buf = K.mix(3); m2.timer = 1e9; flush(6);
    if ((g.errCount || 0) > before) bad.push('frame errors after the load: ' + (g.errLog || []).slice(-1)[0]);
    if (m2.buf.length) bad.push('the loaded mech did not hand its plush to the line: ' + m2.buf.length);
    return bad.length === 0 || bad.join(' || ');
  });
}
