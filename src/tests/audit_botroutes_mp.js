// mp.botroutes.audit.*: what a guest sees across a whole call: the same heights as the host, the host's words (first clause) in every frame, no word left over once the call is gone,
// and nothing of the routes or the calls in the messages or in the guest's view. Run: `await __selftest('mp.botroutes.audit')`
import { kit, RT } from './botroutes_lib.js';

export default async function (ctx) {
  const { g, S } = ctx;
  const X = kit(ctx), C = 0.6, NAV = X.NAV;
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(JSON.parse(JSON.stringify(m))); }; };
  const done = () => { delete g.netSend; role(null); };
  const json = (m) => JSON.parse(JSON.stringify(m));
  const G = (name, fn) => X.guard(name, async (t) => { try { return await fn(t); } finally { done(); g.crewViews = new Map(); } });
  const I0 = () => ctx.toI(-9), K0 = () => ctx.toK(2);
  const arena = (P) => { X.clearAbove(P.i0 - 9, P.k0 - 3, 16, 12, 6); X.fence(P.pad, undefined, P.ramp); };

  await G('mp.botroutes.audit.a-guest-replaying-a-whole-call-sees-the-heights-and-the-words-of-the-host-in-every-frame', async () => {
    const P = await X.platform(I0(), K0()); arena(P);
    const t = X.gen(P.i0 + 2, P.k0 + 2, 1);
    const b = X.mkBot(X.cellX(P.i0 - 7), X.cellZ(P.k0 + 2)); b.carry = X.mix(6); g.crew.goHome(b);
    const rows = [], hostText = [], hostHead = [];
    X.watch(b, 80, () => !X.callOf(b) && b.state === 'idle' && b.carry.length === 0 && rows.length > 20, { each: () => { role('host'); cap(); g.sendDyn(); const d = sent.find((m) => m.t === 'dyn'); const types = sent.map((m) => m.t); done(); if (d) { rows.push(json(d)); hostText.push(g.crew.statusLine(b)); hostHead.push(g.crew.headStatus(b)); } if (types.some((q) => /call|route|nav|path/i.test(q))) rows.bad = types.join(); } });
    if (rows.bad) return 'a new message type: ' + rows.bad;
    if (rows.length < 20) return 'rows ' + rows.length;
    const raw = JSON.stringify(rows); if (/botCalls|"routes"|"up":\[|"back":\[/.test(raw)) return 'a route or a call went over the net';
    S().crew = []; role('guest'); g.crewViews = new Map(); let worst = 0, wrong = [], stale = 0, sawDown = false, sawCalled = false;
    rows.forEach((d, n) => {
      g.applyDyn(d); const v = S().crew.find((x) => x.id === b.id), r = d.crew.find((x) => x[0] === b.id); if (!v || !r) return;
      worst = Math.max(worst, Math.abs(v.gy - r[9]));
      const gt = g.crew.statusLine(v), ht = hostText[n];
      const first = (s) => s.split(',')[0].toLowerCase();
      if (/^heading back down/i.test(ht)) { sawDown = true; if (!/^heading back down/i.test(gt)) wrong.push(`${n}: host '${ht}' guest '${gt}'`); }
      else if (/^called to/i.test(ht)) { sawCalled = true; if (!/^called to/i.test(gt)) wrong.push(`${n}: host '${ht}' guest '${gt}'`); }
      else if (/heading back down|called to|going to charge/i.test(gt)) { stale++; wrong.push(`${n}: a word the host does not say any more: host '${ht}' guest '${gt}'`); }
    });
    done();
    if (!sawDown || !sawCalled) return `the replay never showed both words (down ${sawDown}, called ${sawCalled})`;
    if (worst > 0.012) return 'the guest height is off by ' + worst.toFixed(3);
    if (wrong.length) return wrong.slice(0, 3).join(' | ');
    const v = S().crew.find((x) => x.id === b.id); const keys = Object.keys(v || {}).join(); if (/call|route|steps/.test(keys)) return 'call state on the guest view: ' + keys;
    return true;
  });

  await G('mp.botroutes.audit.a-guest-that-gets-a-nonsense-nav-number-shows-no-words-and-does-not-throw', async () => {
    const b = X.mkBot(X.cellX(-4), X.cellZ(4)); b.state = 'idle';
    role('host'); cap(); g.sendDyn(); const dyn = json(sent.find((m) => m.t === 'dyn')); done();
    for (const bad of [-3, 12, 99, 1e9, null, 'x', NaN]) {
      const d = json(dyn); const row = d.crew.find((r) => r[0] === b.id); if (!row) return 'no row'; row[21] = bad;
      S().crew = []; role('guest'); g.crewViews = new Map();
      try { g.applyDyn(d); const v = S().crew.find((x) => x.id === b.id); const txt = g.crew.statusLine(v), head = g.crew.headStatus(v); if (/undefined|NaN|null/.test(txt + head)) return `nav number ${bad}: '${txt}' / '${head}'`; }
      catch (e) { return `nav number ${bad} threw: ${e.message}`; } finally { done(); }
    }
    return true;
  });
}
