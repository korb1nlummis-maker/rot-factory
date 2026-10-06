import { volatilePool } from '../plushdata.js';
export default async function (ctx) {
  const { T, g, S, w, p, fresh, spot, dig, newWorld, cellX, cellZ, adv } = ctx;
  await T('mp.razzo.guest-sees-the-countdown-of-a-thrown-razzo', async () => {
    fresh({}); const was = g.isGuest, cmd = g.cmd; const sent = []; g.isGuest = () => true; g.cmd = (t, d) => { sent.push([t, d]); };
    try {
      g.fuses = []; g.guestFuses = []; S().carry = []; const item = { sp: volatilePool[0], vr: 0 }; g.fuses.push({ item, t: 3.0, bid: undefined, lost: 0 }); // lit, then thrown: no longer in the hands
      g.updateFuses(0.05); g.updateFuses(0.0); const t1 = g._fuseTxt; g.time += 1.0; g.updateFuses(0.05); const t2 = g._fuseTxt; g.time += 5; g.updateFuses(0.05); const t3 = g._fuseTxt;
      const handed = sent.some((m) => m[0] === 'fuse'); const a = parseFloat(t1.replace('FUSE ', '')), b = parseFloat(t2.replace('FUSE ', ''));
      return (handed && /^FUSE /.test(t1) && b < a - 0.5 && t3 === '') || `handed ${handed}, texts "${t1}" "${t2}" "${t3}"`;
    } finally { g.isGuest = was; g.cmd = cmd; g.guestFuses = []; }
  });
  await T('mp.razzo.the-host-tells-guests-about-the-forced-roof-release', async () => {
    await newWorld(); fresh({}); let sp = spot(); for (const lane of [20, 28, 6, -6]) { if (w().topAt(sp.i + 14, sp.k) >= 10) break; try { sp = spot(lane); } catch (e) { /* none */ } } const { i, k } = sp;
    dig(i, k - 1, 40, 4, 4, false); const out = []; const old = w().onCreakCell; w().onCreakCell = (a, b, c) => { out.push([a, b, c]); }; g.razzoBlast(cellX(i + 20), 1.2, cellZ(k + 1)); w().onCreakCell = old;
    return out.length >= 20 || 'only ' + out.length + ' creaking cells were announced';
  });
}
