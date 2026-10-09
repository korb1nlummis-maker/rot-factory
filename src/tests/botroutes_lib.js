// Shared helpers for the botroutes_* tests (no default export, so the loader skips it as a test module).
// The botnav kit (a cleared test box with the build shell, platforms, ramps, bots, a frame stepper, a recorder), the stacked base of botnav.perf (three levels, a stair between each),
// and a few readers of the call records (a call is { id, m, b, k, ph, g, f } in S.botCalls; its routes are runtime arrays of cell indices).
import { kit as stackKit } from './stack_lib.js';
import { kit as navKit } from './botnav_lib.js';
import * as RT from '../botroutes.js';
import * as FUEL from '../botfuel.js';

export { RT, FUEL };
export { UP } from './botnav_lib.js';
export const C = 0.6;

export function kit(ctx, o = {}) {
  const { g, S, L } = ctx;
  const X = navKit(ctx, o);
  const callOf = (b) => RT.callOf(g, b);
  const cell = (b) => RT.cellIdx(b.x, b.y, b.z);
  // is the bot's cell on (within 2 cells of) its up route? Counted over a run: `frames` while a route existed, `off` of them were not on it.
  const follower = () => {
    const f = { frames: 0, off: 0, worst: 0, empty: 0 };
    f.each = (b) => {
      const c = callOf(b); if (!c || c.ph !== 'up' || b.state !== 'fwalk' && b.state !== 'chgwalk') return;
      const r = RT.routeOf(c); if (r.up.length < 2) { f.empty++; return; }
      f.frames++;
      const bi = ctx.toI(b.x), bk = ctx.toK(b.z); let near = 99;
      for (const id of r.up) { const d = RT.decode(id); near = Math.min(near, Math.max(Math.abs(d.i - bi), Math.abs(d.k - bk), Math.abs(d.j - Math.floor(b.y / C + 1e-6)) - 1)); }
      if (near > 2) f.off++; f.worst = Math.max(f.worst, near);
    };
    return f;
  };
  const gen = (...a) => X.gen(...a);
  // every call in the world, as one line
  const dump = () => JSON.stringify(S().botCalls || []);
  return { ...X, X, callOf, cell, follower, RT, FUEL, dump };
}

// the three level stacked base: floor, a stair to the second level, another to the third (gens at rows 5 and 9 are 3.0 m and 5.4 m up)
export async function threeLevels(K) {
  const Y = K.yard({ levels: 3, east: true }); const [A, B2] = K.stack(Y, ['steel', 'steel', 'steel']);
  const f = await K.putPlate(A, 'f', 0, 0), l2 = await K.putPlate(A, 'c', 1, 0), l3 = await K.putPlate(B2, 'c', 1, 2);
  if (!f.ok || !l2.ok || !l3.ok) throw new Error('plates ' + [f.why, l2.why, l3.why]);
  const s1 = await K.putStair(A, 0); if (!s1.ok) throw new Error('stair 1: ' + s1.why);
  const s2 = await K.putStair(B2, 2); if (!s2.ok) throw new Error('stair 2: ' + s2.why);
  K.tick(0.3); return { Y, A, B2, s1, s2 };
}
export async function twoLevels(K) {
  const Y = K.yard({ levels: 2, east: true }); const [A, B2] = K.stack(Y, ['steel', 'steel']);
  const a = await K.putPlate(A, 'f', 0, 0), b = await K.putPlate(A, 'c', 1, 0); if (!a.ok || !b.ok) throw new Error('plates ' + [a.why, b.why]);
  const st = await K.putStair(A, 0); if (!st.ok) throw new Error('stair: ' + st.why);
  K.tick(0.2); return { Y, A, B2, stair: st };
}
export { stackKit };
