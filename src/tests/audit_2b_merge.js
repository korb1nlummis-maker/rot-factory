// audit_2b_* (wave 2B audit): attacks on the merger's turn logic, found by reading logistics.mergeLane. A lane whose first plush is parked at the end of its
// tile but will never go into this merger (a ruled splitter that routes it elsewhere) must not hold the turn.
import { makeSplitKit, UPB, RAR } from './split_lib.js';
import * as SP from '../splitparts.js';

export default async function (ctx) {
  const { g, L } = ctx;
  const X = makeSplitKit(ctx), T = X.T;
  const R = (min, max) => (max === undefined ? { k: 'rarity', v: min } : { k: 'rarity', v: min, w: max });
  const NONE = { k: 'none' };

  // back lane = a Smart Splitter facing the merger (forward output = the merger). Its right output is a full vault that takes Commons, so a Common parked in
  // the splitter is claimed by an output that is full and can never go forward. The left lane is a plain busy line.
  const rig = (id) => {
    const i = X.i0(), k = X.k0();
    const feed = X.lay(0, 3, i, k, 0);
    const s = X.part('ssplit', i + 3, k, 0);
    const m = X.part(id, i + 4, k, 0);
    const right = X.vaultAt(i + 3, k + 1);
    const left = X.lay(0, 3, i + 4, k - 3, 1);
    const out = X.lay(0, 4, i + 5, k, 0), vault = X.vaultAt(i + 9, k);
    L().dirty = true;
    for (let n = 0; n < 120; n++) right.stored.push({ sp: RAR(0, 0), vr: 0 });
    return { feed, s, m, left, out, vault, right };
  };

  await T('audit.2b.merger-lane-with-a-stuck-splitter-plush-does-not-hold-the-turn', async () => {
    X.setup(UPB); const r = rig('merger');
    if (g.setCfg(r.s, { rules: [[R(4)], [R(0, 3)], [NONE]] }).ok !== true) return 'rules refused';
    // a Common parks at the end of the splitter: only the (full) right vault claims it
    r.s.items = [{ sp: RAR(0, 0), vr: 0, t: 1 }]; r.m.mrr = 0;
    X.run(10, () => X.feedAll(r.left[0], RAR(0, 1)));
    const got = X.tally(r.vault)[RAR(0, 1)] || 0;
    return got > 20 || `the left lane delivered only ${got} plush in 10 s: the stuck back lane holds the merger`;
  });

  await T('audit.2b.priority-merger-high-lane-with-a-stuck-splitter-plush-does-not-block-lower-lanes', async () => {
    X.setup(UPB); const r = rig('pmerger');
    if (g.setCfg(r.s, { rules: [[R(4)], [R(0, 3)], [NONE]] }).ok !== true) return 'rules refused';
    r.s.items = [{ sp: RAR(0, 0), vr: 0, t: 1 }];
    X.run(10, () => X.feedAll(r.left[0], RAR(0, 1)));
    const got = X.tally(r.vault)[RAR(0, 1)] || 0;
    return got > 20 || `the low lane delivered only ${got} plush in 10 s behind a high lane that cannot send`;
  });

  await T('audit.2b.a-stuck-plush-that-can-go-forward-still-takes-its-turn', async () => {
    // the control: a Rare in the splitter goes forward into the merger and comes out the other end
    X.setup(UPB); const r = rig('merger');
    if (g.setCfg(r.s, { rules: [[R(4)], [R(0, 3)], [NONE]] }).ok !== true) return 'rules refused';
    r.s.items = [{ sp: RAR(4, 0), vr: 0, t: 1 }];
    X.run(8, () => X.feedAll(r.left[0], RAR(0, 1)));
    return (X.tally(r.vault)[RAR(4, 0)] || 0) === 1 || 'the Rare never crossed the merger';
  });
}
