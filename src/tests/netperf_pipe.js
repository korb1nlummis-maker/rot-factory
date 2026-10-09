// netperf.pipe.*: the send pipe and the inbox of src/netperf.js on their own: a fake link with a bytes per second limit and a fake clock, no game involved.
// What must hold: nothing reliable is ever dropped or reordered, only stale visual messages are dropped, the buffer stays bounded, big lists are handled in slices.
import { SendPipe, Inbox, NetStats, classOf, peekType, compactCells, MAX_MSG } from '../netperf.js';

// a link: send() adds to bufferedAmount, step(dt) drains it at `bw` bytes per second (0 = stalled)
function link(bw = Infinity) {
  const L = { buf: 0, bw, sent: [], maxBuf: 0,
    tx: { ready: () => true, send: (s) => { L.buf += s.length; L.sent.push(s); if (L.buf > L.maxBuf) L.maxBuf = L.buf; }, buffered: () => L.buf },
    step(dt) { L.buf = L.bw === Infinity ? 0 : Math.max(0, L.buf - L.bw * dt); } };
  return L;
}
const ofType = (arr, t) => arr.filter((s) => peekType(s) === t);

export default async function (ctx) {
  const { T } = ctx;

  await T('netperf.pipe.classes-reliable-types-are-never-visual', async () => {
    const rel = ['cells', 'sale', 'ent+', 'ent-', 'cmd', 'give', 'toast', 'spawn', 'take', 'diff', 'ents', 'world', 'ready', 'hi', 'say', 'cables', 'boom', 'hit', 'razzo', 'win', 'lost', 'note', 'xrow', 'isl', 'sfail', 'swarn', 'png', 'pog'];
    const bad = rel.filter((t) => classOf({ t }) !== 'rel');
    if (bad.length) return 'reliable types classed as visual: ' + bad;
    const vis = { pos: 'latest', dyn: 'latest', bodies: 'latest', time: 'latest', shared: 'latest', fl: 'fx', creak: 'fx', slide: 'fx', dynb: 'fx' };
    for (const [t, c] of Object.entries(vis)) if (classOf({ t }) !== c) return `${t} is ${classOf({ t })}, not ${c}`;
    if (classOf({ t: 'sale', fb: 1 }) !== 'fx' || classOf({ t: 'sale', sp: 3 }) !== 'rel') return 'a sale is only visual when it is the sound for the friend (fb)';
    if (classOf({ t: 'xrow', k: 'railcar' }) !== 'latest' || classOf({ t: 'xrow', k: 'transit' }) !== 'rel') return 'xrow rows: only the rail car positions are visual';
    return true;
  });

  await T('netperf.pipe.a-stuck-link-drops-only-stale-visuals-and-keeps-every-reliable-message-in-order', async () => {
    const L = link(0), st = new NetStats(), p = new SendPipe(L.tx, { stats: st });
    L.buf = 400 * 1024;   // the link is already behind
    const want = [];
    for (let n = 0; n < 3000; n++) {
      p.send({ t: 'pos', x: n }); p.send({ t: 'bodies', a: [n] }); p.send({ t: 'fl', a: [[n]] }); p.send({ t: 'creak', a: [n] });
      if (n % 3 === 0) { const m = n % 6 === 0 ? { t: 'cells', a: [n, 1, 2, 0, 0] } : n % 9 === 0 ? { t: 'sale', sp: 3, vr: 0, dist: n } : { t: 'ent+', ent: { id: n } }; want.push(JSON.stringify(m)); p.send(m); }
      p.pump(1 / 60);
    }
    const dropped = Object.keys(st.dropped);
    if (dropped.some((t) => !['fl', 'creak', 'slide', 'dynb', 'sale'].includes(t))) return 'dropped ' + dropped;
    if (st.dropped.sale) return 'a reliable sale was dropped';
    // open the link: everything queued must come out, in order
    L.bw = Infinity; L.buf = 0; for (let n = 0; n < 600; n++) { p.pump(1 / 60); L.step(1 / 60); }
    const rel = L.sent.filter((s) => !['pos', 'bodies', 'fl', 'creak'].includes(peekType(s)));
    if (rel.length !== want.length) return `reliable sent ${rel.length} of ${want.length}`;
    for (let q = 0; q < want.length; q++) if (rel[q] !== want[q]) return 'reliable order broken at ' + q;
    const pos = ofType(L.sent, 'pos'); if (!pos.length || JSON.parse(pos[pos.length - 1]).x !== 2999) return 'the newest position was not delivered';
    if (pos.length > 40) return 'stale positions were not coalesced: ' + pos.length;
    return true;
  });

  await T('netperf.pipe.the-newest-visual-message-replaces-older-ones-and-shared-keeps-what-it-merged', async () => {
    const L = link(0), p = new SendPipe(L.tx); L.buf = 500 * 1024;
    for (let n = 0; n < 50; n++) p.send({ t: 'dyn', n });
    p.send({ t: 'shared', money: 1, up: { a: 1 } }); p.send({ t: 'shared', money: 2 }); p.send({ t: 'xrow', k: 'railcar', d: 1 }); p.send({ t: 'xrow', k: 'railcar', d: 2 }); p.send({ t: 'xrow', k: 'transit', d: 3 });
    L.bw = Infinity; L.buf = 0; for (let n = 0; n < 10; n++) { p.pump(0.1); L.step(0.1); }
    const dyn = ofType(L.sent, 'dyn'); if (dyn.length !== 1 || JSON.parse(dyn[0]).n !== 49) return 'dyn: ' + dyn.length + ' sent, last ' + (dyn.length && dyn[dyn.length - 1]);
    const sh = ofType(L.sent, 'shared').map((s) => JSON.parse(s)); if (sh.length !== 1 || sh[0].money !== 2 || !sh[0].up) return 'shared did not merge: ' + JSON.stringify(sh);
    const xr = ofType(L.sent, 'xrow').map((s) => JSON.parse(s)); if (xr.length !== 2 || !xr.some((m) => m.k === 'railcar' && m.d === 2) || !xr.some((m) => m.k === 'transit')) return 'xrow: ' + JSON.stringify(xr);
    return true;
  });

  await T('netperf.pipe.each-visual-type-keeps-to-its-bytes-per-second-budget', async () => {
    const L = link(Infinity), p = new SendPipe(L.tx, { budget: { bodies: 100000, fl: 20000 } });
    const big = { t: 'bodies', a: new Array(2000).fill(12345) };   // about 12 KB
    let sentBodies = 0, sentFl = 0;
    for (let n = 0; n < 600; n++) {   // ten seconds at 60 fps, both types offered every frame
      p.pump(1 / 60); p.send(big); p.send({ t: 'fl', a: new Array(300).fill(1) });
      L.step(1 / 60);
    }
    const kb = (t) => ofType(L.sent, t).reduce((a, s) => a + s.length, 0) / 10;
    sentBodies = kb('bodies'); sentFl = kb('fl');
    if (sentBodies > 100000 * 1.25) return `bodies went out at ${(sentBodies / 1024).toFixed(0)} KB/s, budget 98 KB/s`;
    if (sentFl > 20000 * 1.4) return `fl went out at ${(sentFl / 1024).toFixed(0)} KB/s, budget 20 KB/s`;
    if (sentBodies < 100000 * 0.5) return 'bodies starved: ' + sentBodies;
    return true;
  });

  await T('netperf.pipe.the-buffer-stays-bounded-and-the-level-follows-the-link', async () => {
    const L = link(100 * 1024), p = new SendPipe(L.tx);   // a 100 KB/s link offered about 600 KB/s of visuals plus some reliable data
    let levelMax = 0, q = 1;
    for (let n = 0; n < 60 * 20; n++) {
      p.pump(1 / 60);
      p.send({ t: 'bodies', a: new Array(2500).fill(1234567) }); p.send({ t: 'dyn', rows: new Array(1500).fill(123456) });
      if (n % 6 === 0) p.send({ t: 'cells', a: new Array(800).fill(12345) });
      L.step(1 / 60); levelMax = Math.max(levelMax, p.level);
    }
    if (L.maxBuf > p.hi + 160 * 1024) return `the buffer reached ${(L.maxBuf / 1024).toFixed(0)} KB (high mark ${(p.hi / 1024).toFixed(0)} KB)`;
    if (levelMax < 1) return 'the pipe never noticed it was behind';
    if (p.quality() >= 1) return 'quality was not reduced while behind: ' + p.quality();
    // the load goes away: the level comes back down, but not at once
    let at = -1; for (let n = 0; n < 60 * 20; n++) { p.pump(1 / 60); L.step(1 / 60); if (p.level === 0 && at < 0) at = n / 60; if (n === 30 && p.level === 0) return 'the level fell back within half a second'; }
    return (at > 1.4 && at < 12 && p.quality() === 1) || `the level came back after ${at} s (quality ${p.quality()})`;
  });

  await T('netperf.pipe.a-high-round-trip-time-lowers-the-level-even-with-an-empty-buffer', async () => {
    const L = link(Infinity), p = new SendPipe(L.tx); p.setRtt(1500); p.pump(0.1); const a = p.level; p.setRtt(4000); p.pump(0.1); const b = p.level; p.setRtt(50);
    for (let n = 0; n < 400; n++) p.pump(0.05);
    return (a === 1 && b === 2 && p.level === 0) || `levels ${a} ${b} then ${p.level}`;
  });

  await T('netperf.pipe.a-link-that-is-hopelessly-behind-is-reported-once', async () => {
    const L = link(0); let calls = 0; const p = new SendPipe(L.tx, { maxQueue: 200 * 1024, onOverflow: () => { calls++; } }); L.buf = 1e9;
    for (let n = 0; n < 400; n++) p.send({ t: 'cells', a: new Array(800).fill(12345) });
    return calls === 1 || 'overflow callback ran ' + calls + ' times';
  });

  await T('netperf.pipe.a-send-error-does-not-throw-and-is-not-counted', async () => {
    const p = new SendPipe({ ready: () => true, send: () => { throw new Error('closed'); }, buffered: () => 0 }); const r = p.send({ t: 'pos' }); return r === false || 'send reported ' + r;
  });

  await T('netperf.pipe.inbox-handles-at-once-while-the-budget-lasts-then-queues-and-drains-in-order', async () => {
    let clock = 0; const got = []; const ib = new Inbox((m) => { got.push(m.t + ':' + m.n); clock += 1; }, { now: () => clock, imm: 3 });
    for (let n = 0; n < 10; n++) ib.push(JSON.stringify({ t: 'ent+', n }));
    if (got.length !== 3 || ib.size() !== 7) return `at once ${got.length}, queued ${ib.size()}`;
    ib.frame(); ib.drain(3); if (got.length < 5 || got.length > 7) return 'a 3 ms drain handled ' + (got.length - 3);
    while (ib.size()) { ib.frame(); ib.drain(3); }
    return got.join() === Array.from({ length: 10 }, (_, n) => 'ent+:' + n).join() || 'order: ' + got.join();
  });

  await T('netperf.pipe.inbox-keeps-only-the-newest-position-bodies-and-dyn-of-a-backlog-without-parsing-the-rest', async () => {
    let clock = 0; const got = []; const ib = new Inbox((m) => { got.push(m); clock += 5; }, { now: () => clock, imm: 3 });
    ib.push(JSON.stringify({ t: 'cells', a: [1, 1, 1, 0, 0] })); clock = 100;   // used up the budget
    const parse = JSON.parse; let parsed = 0; JSON.parse = (s) => { parsed++; return parse(s); };
    try {
      for (let n = 0; n < 300; n++) { ib.push(JSON.stringify({ t: 'pos', n })); ib.push(JSON.stringify({ t: 'bodies', a: [n] })); ib.push(JSON.stringify({ t: 'dyn', n })); if (n % 100 === 0) ib.push(JSON.stringify({ t: 'sale', sp: 1, n })); }
      ib.frame(); let guard = 0; while (ib.size() && guard++ < 100) { ib.frame(); ib.drain(50); }
    } finally { JSON.parse = parse; }
    const by = (t) => got.filter((m) => m.t === t);
    if (by('pos').length !== 1 || by('pos')[0].n !== 299) return 'pos: ' + by('pos').length;
    if (by('bodies').length !== 1 || by('dyn').length !== 1) return 'bodies/dyn kept ' + by('bodies').length + '/' + by('dyn').length;
    if (by('sale').length !== 3) return 'sales kept ' + by('sale').length + ' of 3';
    return parsed <= 12 || 'parsed ' + parsed + ' messages for 3 kept ones';
  });

  await T('netperf.pipe.inbox-caps-queued-flights-but-never-reliable-messages', async () => {
    let clock = 0; const got = []; const ib = new Inbox((m) => { got.push(m.t); }, { now: () => clock, imm: 0 });
    for (let n = 0; n < 500; n++) { ib.push(JSON.stringify({ t: 'fl', a: [[n]] })); if (n % 5 === 0) ib.push(JSON.stringify({ t: 'toast', n })); }
    if (ib.size() > 48 + 100) return 'inbox holds ' + ib.size();
    while (ib.size()) { ib.frame(); ib.drain(5); }
    const fl = got.filter((t) => t === 'fl').length, toast = got.filter((t) => t === 'toast').length;
    return (toast === 100 && fl <= 48) || `fl ${fl} toast ${toast}`;
  });

  await T('netperf.pipe.inbox-applies-a-huge-cell-list-in-slices-within-the-time-budget', async () => {
    let clock = 0; const sizes = []; let maxCall = 0;
    const ib = new Inbox((m) => { if (m.t === 'cells') { sizes.push(m.a.length / 5); clock += 0.5 + m.a.length / 5 * 0.01; } }, { now: () => clock, imm: 0 });
    const a = []; for (let n = 0; n < 20000; n++) a.push(n, 1, 2, 0, 0);
    ib.push(JSON.stringify({ t: 'cells', a }));
    let frames = 0; while (ib.size() && frames < 1000) { ib.frame(); const c0 = clock; ib.drain(3); maxCall = Math.max(maxCall, clock - c0); frames++; }
    const total = sizes.reduce((x, y) => x + y, 0);
    if (total !== 20000) return 'applied ' + total + ' of 20000 cells';
    if (Math.max(...sizes) > 200) return 'a slice had ' + Math.max(...sizes) + ' cells';
    return (frames > 5 && maxCall < 3 + 3) || `frames ${frames}, one drain took ${maxCall.toFixed(1)} ms of the 3 ms budget`;
  });

  await T('netperf.pipe.inbox-slices-the-late-join-lists-too-and-keeps-their-order', async () => {
    let clock = 0; const got = []; const ib = new Inbox((m) => { got.push(m.t + (m.list ? ':' + m.list.length : '') + (m.a ? ':' + m.a.length : '')); clock += 1; }, { now: () => clock, imm: 0 });
    ib.push(JSON.stringify({ t: 'world', seed: 1 })); ib.push(JSON.stringify({ t: 'diff', a: new Array(9000).fill(7) })); ib.push(JSON.stringify({ t: 'ents', list: Array.from({ length: 100 }, (_, n) => ({ id: n })) })); ib.push(JSON.stringify({ t: 'ready' }));
    while (ib.size()) { ib.frame(); ib.drain(3); }
    const order = got.map((s) => s.split(':')[0]); const firstReady = order.indexOf('ready');
    if (order[0] !== 'world' || firstReady !== order.length - 1) return 'order ' + order.join();
    const diffN = got.filter((s) => s.startsWith('diff')).reduce((a, s) => a + +s.split(':')[1], 0), entsN = got.filter((s) => s.startsWith('ents')).reduce((a, s) => a + +s.split(':')[1], 0);
    return (diffN === 9000 && entsN === 100 && got.length > 8) || `diff ${diffN} ents ${entsN} in ${got.length} calls`;
  });

  await T('netperf.pipe.identical-edits-of-one-cell-are-merged-and-the-last-one-wins', async () => {
    const a = []; for (let n = 0; n < 1000; n++) a.push(5, 6, 7, n % 4, 0, 1, 2, 3, 9, 9);
    const c = compactCells(a); if (c.length !== 10) return 'compacted to ' + c.length / 5 + ' edits';
    const r = []; for (let q = 0; q < c.length; q += 5) r.push(c.slice(q, q + 5).join());
    const u = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]; return (r.includes('5,6,7,3,0') && r.includes('1,2,3,9,9') && compactCells(u) === u) || r.join('|');
  });

  await T('netperf.pipe.peek-reads-the-type-from-the-first-bytes', async () => {
    return peekType('{"t":"cells","a":[1]}') === 'cells' && peekType('{"t":"ent+","ent":{}}') === 'ent+' && peekType('garbage') === '?' && MAX_MSG === 65536 || 'peek';
  });
}
