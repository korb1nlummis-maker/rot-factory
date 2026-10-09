import { rigKit, SB } from './supportborer_lib.js';
import * as PIN from '../playerinv.js';
// mp.supportborer.*: the Support Borer when a friend plays (src/supportborer.js). One page plays both roles by switching g.net.role and capturing g.netSend (like mp_pinv.js).
// The host simulates the rig; a friend loads and starts it with the `sborer` command (E and crouch + E). The command carries no count: the host takes from the friend's OWN bag,
// after checking that the friend stands at the rig, so a forged load of supports the friend does not have loads nothing.
export default async function (ctx) {
  const { T, g, S, V3 } = ctx;
  const R = rigKit(ctx);
  let sent = [];
  const json = (m) => JSON.parse(JSON.stringify(m));
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g._actor = null; };
  const fake = (x, y, z) => ({ pos: new V3(x, y, z), vel: new V3(), update() {}, dispose() {}, set() {}, setHeld() {}, spheres() { return []; } });
  const GB = () => PIN.invFor(g, 'g');
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); await ctx.newWorld(); } });
  const near = (s) => { g.remote = fake(s.e.x - 3, s.e.y, s.e.z); };

  await guard('mp.supportborer.a-guests-load-and-unload-come-from-and-go-to-the-guests-own-bag', async () => {
    const s = await R.scene({ dist: 0, cls: 0 }); role('host'); cap(); near(s); const bad = [];
    const gb = GB(); gb[s.kind] = 20; const host0 = S().items[s.kind] | 0;
    const msg = { id: s.e.id, op: 'use', h: s.kind }; if (JSON.stringify({ t: 'cmd', c: 'sborer', d: msg }).length > 90) bad.push('the command is large: ' + JSON.stringify(msg).length);
    g.netCmd('sborer', msg);
    if (s.e.sn !== 12 || GB()[s.kind] !== 8) bad.push(`load: rig ${s.e.sn}, guest bag ${GB()[s.kind]}`);
    if ((S().items[s.kind] | 0) !== host0) bad.push('the host bag changed');
    if (!sent.some((m) => m.t === 'ent+' && m.ent && m.ent.id === s.e.id && m.ent.sn === 12)) bad.push('the guest was not told the new load');
    g.netCmd('sborer', { id: s.e.id, op: 'use', h: '' }); if (!s.e.on) bad.push('E from a guest with a full load must start it');
    g.netCmd('sborer', { id: s.e.id, op: 'alt', h: '' }); if (s.e.sn !== 0 || GB()[s.kind] !== 20 || (S().items[s.kind] | 0) !== host0 || s.e.on) bad.push(`unload: rig ${s.e.sn}, guest bag ${GB()[s.kind]}, host bag ${S().items[s.kind]}, on ${s.e.on}`);
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.supportborer.forged-commands-load-nothing', async () => {
    const s = await R.scene({ dist: 0, cls: 0 }); role('host'); cap(); near(s); const bad = [], gb = GB(); gb['frame:timber'] = 1;
    const tries = [{ id: s.e.id, op: 'use', h: 'frame:neutron', n: 999, sn: 12 }, { id: s.e.id, op: 'use', h: 'garch:12:neutron' }, { id: s.e.id, op: 'load', h: s.kind }, { id: String(s.e.id), op: 'use' }, { id: s.e.id + 9999, op: 'use' }, null, 'x', 5, { id: s.e.id, op: 'use', h: { a: 1 } }, { id: s.e.id, op: 'use', h: 'x'.repeat(5000) }];
    for (const m of tries) { try { g.netCmd('sborer', m); } catch (e) { bad.push('threw on ' + JSON.stringify(m)); } }
    if (s.e.sn > 1 || (s.e.sn === 1 && s.e.sk !== 'frame:timber')) bad.push(`loaded ${s.e.sn} of ${s.e.sk}`);   // (the one timber frame the guest really has may load)
    if (GB()['frame:neutron'] || GB()['garch:12:neutron']) bad.push('items made out of nothing: ' + JSON.stringify(GB()));
    s.e.sn = 0; s.e.sk = ''; gb['frame:timber'] = 0; delete gb['frame:timber'];
    g.netCmd('sborer', { id: s.e.id, op: 'use', h: 'frame:neutron', n: 12 }); if (s.e.sn !== 0 || s.e.sk) bad.push('forged load: ' + s.e.sn + ' ' + s.e.sk);
    // a friend who is far from the rig cannot touch it, even with real supports in the bag
    gb[s.kind] = 12; g.remote = fake(s.e.x + 200, s.e.y, s.e.z); g.netCmd('sborer', { id: s.e.id, op: 'use', h: s.kind }); if (s.e.sn !== 0 || GB()[s.kind] !== 12) bad.push('a far friend loaded it');
    g.remote = fake(s.e.x, s.e.y + 40, s.e.z); g.netCmd('sborer', { id: s.e.id, op: 'use', h: s.kind }); if (s.e.sn !== 0) bad.push('a friend 40 m up loaded it');
    g.remote = null; g.netCmd('sborer', { id: s.e.id, op: 'use', h: s.kind }); if (s.e.sn !== 0) bad.push('no remote at all loaded it');
    // a guest page never runs the rig or answers a command
    role('guest'); g.netCmd('sborer', { id: s.e.id, op: 'use', h: s.kind }); role('host'); if (s.e.sn !== 0) bad.push('a guest page ran a command');
    return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.supportborer.the-host-runs-the-rig-and-the-guest-is-told-its-state-in-a-small-row', async () => {
    const s = await R.scene({ dist: 0, cls: 0 }); role('host'); cap(); near(s); const bad = [];
    s.e.own = 1; GB()[s.kind] = 12; g.netCmd('sborer', { id: s.e.id, op: 'use', h: s.kind }); g.netCmd('sborer', { id: s.e.id, op: 'use', h: '' });
    const r = R.run(s, 60, { until: () => s.e.placed >= 2 }); if (s.e.placed < 2) bad.push('it set no supports: ' + s.e.bs);
    for (const f of R.frames().filter((q) => q.gm > s.i0 + 3 || (s.pre === 3 && q.gm >= s.i0))) if (f.own !== 1) bad.push('a support it set is owned by ' + f.own);
    if (!sent.some((m) => m.t === 'ent+' && m.ent && (m.ent.type === 'frame'))) bad.push('the guest never heard of the supports');
    const row = SB.row(g); const text = JSON.stringify(row); if (!row || text.length > 160) bad.push('row: ' + text);
    // the guest applies it
    const fa = s.e.fa, sn = s.e.sn; role('guest'); s.e.fa = 0; s.e.sn = 0; s.e.bs = 'off'; SB.guestRow(g, json(row)); role('host');
    if (s.e.fa !== fa || s.e.sn !== sn || s.e.bs !== 'dig' && s.e.bs !== 'set' && s.e.bs !== 'out') bad.push(`guest row: fa ${s.e.fa} sn ${s.e.sn} bs ${s.e.bs}`);
    // a host never takes a row, and a bad row changes nothing
    SB.guestRow(g, json({ [s.e.id]: [1, 1, 1, 1, 1, 1] })); if (s.e.fa !== fa) bad.push('the host took a row');
    role('guest'); SB.guestRow(g, { [s.e.id]: ['x', null, {}, 1, 1, 1] }); SB.guestRow(g, null); SB.guestRow(g, 'x'); role('host'); if (s.e.fa !== fa) bad.push('a bad row changed it');
    void r; return bad.length === 0 || bad.join('; ');
  });

  await guard('mp.supportborer.a-guest-places-it-through-the-place-command-and-a-forged-spot-is-refused', async () => {
    const s = await R.scene({ dist: 0, cls: 0 }); role('host'); cap(); const bad = [];
    const e = s.e, why = (m) => g.placeConflict({ id: 'sborer', kind: 'sborer' }, m);
    if (why({ i: e.i + 10, j: 0, k: e.k, dx: 1, dz: 0 }) === null) bad.push('a spot with no pile wall ahead was accepted');
    if (why({ i: e.i, j: 0, k: e.k, dx: 1, dz: 0 }) === null) bad.push('a spot too close to another rig was accepted');
    if (why({ i: 'x', j: 0, k: 3, dx: 1, dz: 0 }) === null || why({ i: e.i, j: 0, k: e.k, dx: 1, dz: 1 }) === null || why(null) === null) bad.push('garbage was accepted');
    if (why({ i: -5, j: 0, k: e.k, dx: 1, dz: 0 }) === null) bad.push('outside the hall accepted');
    return bad.length === 0 || bad.join('; ');
  });
}
