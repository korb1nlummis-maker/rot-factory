// ---------------------------------------------------------------------------------------------
// Co-op traffic control: counting, sending and receiving. No DOM and no game imports, so tests can drive every piece with a fake link and a fake clock.
//
//  NetStats  per message type: messages and bytes in the last second (sent and received), the biggest message, timings of the net tick.
//  SendPipe  everything the game sends goes through it. It watches how much the data channel still has buffered (RTCDataChannel.bufferedAmount):
//            while that is high, visual messages are not sent (positions, bodies, dyn: the newest one waits in a slot and replaces older ones,
//            flights and creaks are dropped) and reliable ones (cells, sales, crafts, entities ...) wait in order in a queue. Nothing reliable is ever dropped.
//            Each visual type also has a bytes per second budget. `level` (0 fine, 1 slow, 2 bad) tells the game to send less (see quality()).
//  Inbox     everything received goes through it. Messages are handled at once while the frame's time budget lasts; after that they queue, newer
//            positions/bodies/dyn replace older ones that were never parsed, and big cell lists are applied a slice per frame (drain()).
// ---------------------------------------------------------------------------------------------

// a newer message of one of these replaces an older one that was not sent (or not handled) yet
export const LATEST = new Set(['pos', 'dyn', 'bodies', 'time', 'shared']);
// visual extras: when the link is behind they are dropped
export const FX = new Set(['fl', 'creak', 'slide', 'dynb']);
// bytes per second each visual type may use (a token bucket; the burst is half a second of it)
export const BUDGET = { pos: 6000, dyn: 60000, dynb: 60000, bodies: 90000, time: 500, shared: 12000, fl: 24000, creak: 8000, slide: 2000, sale: 4000, xrow: 40000 };
export const MAX_MSG = 64 * 1024;

export function slotOf(m) { return m.t === 'xrow' ? 'xrow:' + m.k : m.t === 'dynb' ? 'dynb:' + (m.p | 0) : m.t; }
export function classOf(m) {
  const t = m.t;
  if (LATEST.has(t)) return 'latest';
  if (FX.has(t)) return 'fx';
  if (t === 'sale' && m.fb) return 'fx';
  if (t === 'xrow' && m.k === 'railcar') return 'latest';
  return 'rel';
}
// what the receiver can tell from the first bytes of a message (every sender writes "t" first)
const PEEK = /^\{"t":"([^"]*)"/;
export function peekType(raw) { const m = PEEK.exec(raw.length > 48 ? raw.slice(0, 48) : raw); return m ? m[1] : '?'; }
const rxClass = (t) => (t === 'pos' || t === 'dyn' || t === 'bodies' || t === 'time' ? 'latest' : t === 'fl' || t === 'creak' || t === 'slide' || t === 'dynb' ? 'fx' : 'rel');
// merging two messages of one slot (the pipe keeps the union, not just the newest, for these)
const MERGE = { shared: (a, b) => ({ ...a, ...b }) };

// ---------------------------------------------------------------------------------------------
export class NetStats {
  constructor(now = () => performance.now()) {
    this.now = now; this.t0 = now();
    this.cur = { tx: {}, rx: {} }; this.prev = { tx: {}, rx: {} };
    this.big = { tx: { bytes: 0, type: '' }, rx: { bytes: 0, type: '' } };   // the biggest message of the last 30 s
    this._big = { tx: { bytes: 0, type: '' }, rx: { bytes: 0, type: '' } }; this.bigT = this.t0;
    this.tm = {};            // name -> { avg, max (this window), lastMax }
    this.lastBytes = {};
    this.total = { tx: 0, rx: 0 }; this.peak = { tx: 0, rx: 0 };   // bytes in the busiest second so far
    this.dropped = {}; this.coalesced = {}; this.queued = 0; this.oversize = 0;
    this.rtt = 0; this.rttMax = 0; this.windows = 0;
  }
  _add(dir, type, bytes) {
    const o = this.cur[dir][type] || (this.cur[dir][type] = { n: 0, b: 0 });
    o.n++; o.b += bytes; this.total[dir] += bytes;
    if (bytes > this._big[dir].bytes) this._big[dir] = { bytes, type };
    if (dir === 'tx') this.lastBytes[type] = bytes;
  }
  tx(type, bytes) { this._add('tx', type, bytes); }
  rx(type, bytes) { this._add('rx', type, bytes); }
  drop(type) { this.dropped[type] = (this.dropped[type] || 0) + 1; }
  merge(type) { this.coalesced[type] = (this.coalesced[type] || 0) + 1; }
  time(name, ms) { const o = this.tm[name] || (this.tm[name] = { avg: 0, max: 0, lastMax: 0 }); o.avg = o.avg ? o.avg * 0.9 + ms * 0.1 : ms; if (ms > o.max) o.max = ms; }
  // call once per frame (cheap): flips the one second windows
  roll(force) {
    const t = this.now();
    if (!force && t - this.t0 < 1000) return false;
    const span = Math.max(0.2, (t - this.t0) / 1000);
    for (const d of ['tx', 'rx']) {
      let sum = 0; const p = {};
      for (const k in this.cur[d]) { const o = this.cur[d][k]; p[k] = { n: o.n / span, b: o.b / span }; sum += o.b; }
      this.prev[d] = p; this.cur[d] = {};
      const rate = sum / span; if (rate > this.peak[d]) this.peak[d] = rate;
      this.rate = this.rate || {}; this.rate[d] = rate;
    }
    for (const k in this.tm) { this.tm[k].lastMax = this.tm[k].max; this.tm[k].max = 0; }
    this.t0 = t; this.windows++;
    if (t - this.bigT > 30000) { this.big = this._big; this._big = { tx: { bytes: 0, type: '' }, rx: { bytes: 0, type: '' } }; this.bigT = t; }
    else for (const d of ['tx', 'rx']) if (this._big[d].bytes > this.big[d].bytes) this.big[d] = this._big[d];
    return true;
  }
  // KB per second and messages per second of a type in the last full window
  rate_(dir, type) { const o = this.prev[dir][type]; return o ? o : { n: 0, b: 0 }; }
  report(extra = {}) {
    const rows = [];
    const line = (d) => Object.entries(this.prev[d]).sort((a, b) => b[1].b - a[1].b).slice(0, 5).map(([k, o]) => `${k} ${(o.b / 1024).toFixed(1)}K/${o.n.toFixed(0)}`).join(' ');
    const sum = (d) => Object.values(this.prev[d]).reduce((a, o) => a + o.b, 0) / 1024;
    const nsum = (d) => Object.values(this.prev[d]).reduce((a, o) => a + o.n, 0);
    rows.push(`net out ${sum('tx').toFixed(1)} KB/s ${nsum('tx').toFixed(0)} msg/s (peak ${(this.peak.tx / 1024).toFixed(0)}) biggest ${(this.big.tx.bytes / 1024).toFixed(1)}K ${this.big.tx.type}`);
    rows.push('  ' + (line('tx') || '(nothing sent)'));
    rows.push(`net in  ${sum('rx').toFixed(1)} KB/s ${nsum('rx').toFixed(0)} msg/s (peak ${(this.peak.rx / 1024).toFixed(0)}) biggest ${(this.big.rx.bytes / 1024).toFixed(1)}K ${this.big.rx.type}`);
    rows.push('  ' + (line('rx') || '(nothing received)'));
    const tm = (n) => { const o = this.tm[n]; return o ? `${o.avg.toFixed(2)}/${o.lastMax.toFixed(1)}` : '-'; };
    rows.push(`tick ms avg/max: net ${tm('tick')} recv ${tm('recv')} dyn ${tm('dyn')} bodies ${tm('bodies')}`);
    const dr = Object.entries(this.dropped).map(([k, v]) => `${k} ${v}`).join(' ');
    rows.push(`buffered ${(extra.buffered / 1024 || 0).toFixed(0)}K queued ${extra.queued || 0} inbox ${extra.inbox || 0} level ${extra.level || 0} rtt ${this.rtt.toFixed(0)}ms${dr ? ' dropped ' + dr : ''}`);
    return rows;
  }
}

// ---------------------------------------------------------------------------------------------
export class SendPipe {
  // tx: { ready(): boolean, send(str), buffered(): number }
  constructor(tx, o = {}) {
    this.tx = tx; this.stats = o.stats || new NetStats();
    this.hi = o.hi ?? 128 * 1024;      // above this much buffered, visual messages wait or are dropped
    this.lo = o.lo ?? 32 * 1024;       // below this, the reliable queue is let out again
    this.maxQueue = o.maxQueue ?? 16 * 1024 * 1024;   // a link that has this much reliable data waiting is dead
    this.onOverflow = o.onOverflow || null;
    this.budget = { ...BUDGET, ...(o.budget || {}) };
    this.reset();
  }
  reset() {
    this.queue = []; this.qBytes = 0; this.slots = new Map(); this.tokens = {}; this.clock = 0;
    this.level = 0; this.levelT = 0; this.rtt = 0; this.overflowed = false; this.sentBytes = 0; this.sentMsgs = 0;
  }
  buffered() { return this.tx.buffered ? this.tx.buffered() : 0; }
  // 1 fine, 0.5 slow, 0.25 bad: the game scales its optional traffic by this
  quality() { return this.level === 0 ? 1 : this.level === 1 ? 0.5 : 0.25; }
  setRtt(ms) { this.rtt = ms; }

  send(m) {
    if (!this.tx.ready()) return false;
    const cls = classOf(m), buf = this.buffered();
    if (!this.queue.length && buf < this.hi) {
      if (cls === 'rel') return this._emit(m);
      if (this._canSpend(m.t)) { if (this.slots.size) this.slots.delete(slotOf(m)); return this._emit(m); }
      // over its budget: the newest waits (latest) or is let go (fx)
    } else if (cls === 'rel') {
      let s; try { s = JSON.stringify(m); } catch (e) { return false; }
      this.queue.push({ s, t: m.t }); this.qBytes += s.length; this.stats.queued = this.queue.length;
      if (this.qBytes > this.maxQueue && !this.overflowed) { this.overflowed = true; if (this.onOverflow) this.onOverflow(this.qBytes); }
      return true;
    }
    if (cls === 'latest') {
      const key = slotOf(m), old = this.slots.get(key);
      if (old) { this.stats.merge(m.t); this.slots.set(key, MERGE[m.t] ? MERGE[m.t](old, m) : m); } else this.slots.set(key, m);
      return true;
    }
    this.stats.drop(m.t.length ? m.t : '?');
    return true;
  }
  _canSpend(type) { const b = this.budget[type]; if (!b) return true; const t = this.tokens[type]; return t === undefined || t > 0; }
  _spend(type, bytes) { const b = this.budget[type]; if (!b) return; this.tokens[type] = (this.tokens[type] === undefined ? b * 0.5 : this.tokens[type]) - bytes; }
  _emit(m) {
    let s; try { s = JSON.stringify(m); } catch (e) { return false; }
    return this._raw(s, m.t, m);
  }
  _raw(s, type, m) {
    const n = s.length;
    if (n > MAX_MSG) this.stats.oversize++;
    try { this.tx.send(s); } catch (e) { return false; }
    this.stats.tx(m && m.t === 'xrow' ? 'xrow' : type, n); this.sentBytes += n; this.sentMsgs++;
    this._spend(type === 'sale' ? 'sale' : type, n);
    return true;
  }
  // once per frame with the frame time: refill the budgets, let queued messages out, pick the level
  pump(dt) {
    this.clock += dt;
    for (const k in this.budget) { const b = this.budget[k]; const t = this.tokens[k]; if (t !== undefined) this.tokens[k] = Math.min(b * 0.5, t + b * dt); }
    const live = this.tx.ready();
    let buf = live ? this.buffered() : 0;
    while (live && this.queue.length && buf < this.lo) {
      const e = this.queue.shift(); this.qBytes -= e.s.length; this._raw(e.s, e.t, null); buf = this.buffered();
    }
    if (!this.queue.length) this.qBytes = 0;
    this.stats.queued = this.queue.length;
    if (live && !this.queue.length && buf < this.hi && this.slots.size) {
      for (const [key, m] of [...this.slots]) {
        if (buf >= this.hi) break;
        if (!this._canSpend(m.t)) continue;
        this.slots.delete(key); this._emit(m); buf = this.buffered();
      }
    }
    // the level: it goes up at once and comes down only after the link has been clear for a while
    const rtt = this.rtt;
    const want = buf > this.hi * 4 || this.qBytes > 512 * 1024 || rtt > 3000 ? 2 : buf > this.hi * 0.5 || this.queue.length || this.slots.size > 2 || rtt > 1200 ? 1 : 0;
    if (want > this.level) { this.level = want; this.levelT = this.clock; }
    else if (want < this.level && this.clock - this.levelT > 1.5 && buf < this.lo && !this.queue.length) { this.level--; this.levelT = this.clock; }
    else if (want === this.level) this.levelT = this.clock;
  }
  pending() { return { queued: this.queue.length, qBytes: this.qBytes, slots: this.slots.size, buffered: this.buffered(), level: this.level }; }
}

// ---------------------------------------------------------------------------------------------
// big lists are handled a slice at a time: [type, array field, numbers per item, items per slice]
const SLICE = { cells: ['a', 5, 160], diff: ['a', 3, 600], ents: ['list', 1, 10] };   // (an entity builds meshes: a few ms for ten)
export class Inbox {
  constructor(handle, o = {}) {
    this.handle = handle; this.stats = o.stats || new NetStats(); this.now = o.now || (() => performance.now());
    this.imm = o.imm ?? 3;           // ms per frame of messages handled the moment they arrive
    this.maxFx = o.maxFx ?? 48;      // queued visual extras beyond this: the oldest are dropped
    this.maxBytes = o.maxBytes ?? 96 * 1024 * 1024;   // unhandled text waiting here: a peer that makes more than this is not playing (a real host sends a few MB a second, and this side handles that); the link is closed
    this.onOverflow = o.onOverflow || null;
    this.reset();
  }
  reset() { this.q = []; this.head = 0; this.latest = new Map(); this.fx = 0; this.dead = 0; this.spent = 0; this.dropped = 0; this.lastDrain = this.now(); this.bytes = 0; this.overflowed = false; }
  size() { return this.q.length - this.head - this.dead; }
  frame() { this.spent = 0; }
  _run(m) { try { this.handle(m); } catch (err) { console.warn('bad net message', err); } }
  _parse(raw) { try { return JSON.parse(raw); } catch (err) { console.warn('bad net message', err); return null; } }
  push(raw) {
    if (typeof raw !== 'string') return;
    const t = peekType(raw);
    this.stats.rx(t, raw.length);
    if (this.size() === 0 && this.spent < this.imm) {
      const t0 = this.now(); const m = this._parse(raw); if (m) this._run(m);
      const ms = this.now() - t0; this.spent += ms; this.stats.time('recv', ms);
      return;
    }
    if (this.overflowed) return;
    if (this.bytes + raw.length > this.maxBytes) { this.overflowed = true; this.q = []; this.head = 0; this.dead = 0; this.latest.clear(); this.bytes = 0; if (this.onOverflow) this.onOverflow(); return; }
    const c = rxClass(t), e = { t, raw, obj: null, c };
    this.bytes += raw.length;
    if (c === 'latest') {
      const o = this.latest.get(t);
      if (o && !o.done) { if (o.raw) this.bytes -= o.raw.length; o.raw = null; o.obj = null; o.done = true; this.dead++; this.dropped++; this.stats.merge(t); }
      this.latest.set(t, e);
    } else if (c === 'fx') {
      this.fx++;
      if (this.fx > this.maxFx) { for (let i = this.head; i < this.q.length; i++) { const o = this.q[i]; if (o.c === 'fx' && !o.done) { if (o.raw) this.bytes -= o.raw.length; o.raw = null; o.obj = null; o.done = true; this.dead++; this.fx--; this.dropped++; this.stats.drop(o.t); break; } } }
    }
    this.q.push(e);
    if (this.dead > 256 && this.dead * 2 > this.q.length - this.head) this._compact();
  }
  // messages already parsed (what a guest held while its world loaded) go in front of everything else
  prepend(msgs) { const es = msgs.map((m) => ({ t: m.t, raw: null, obj: m, c: 'rel' })); this._compact(); this.q = es.concat(this.q); }
  _compact() { this.q = this.q.slice(this.head).filter((e) => !e.done); this.head = 0; this.dead = 0; }
  // handle queued messages for up to `ms` milliseconds
  drain(ms) {
    const t0 = this.lastDrain = this.now(); let n = 0;
    while (this.head < this.q.length) {
      const e = this.q[this.head];
      if (e.done) { this.head++; this.dead--; continue; }
      let m = e.obj;
      if (!m) { this.bytes -= e.raw.length; m = this._parse(e.raw); e.raw = null; if (!m) { e.done = true; this.head++; continue; } }
      const sl = SLICE[m.t];
      if (sl && Array.isArray(m[sl[0]]) && m[sl[0]].length > sl[1] * sl[2]) {
        const f = sl[0], per = sl[1] * sl[2], arr = m[f];
        this._run({ ...m, [f]: arr.slice(0, per) });
        e.obj = { ...m, [f]: arr.slice(per) }; e.raw = null;
      } else {
        e.done = true; this.head++; if (e.c === 'fx') this.fx--; if (this.latest.get(e.t) === e) this.latest.delete(e.t);
        this._run(m);
      }
      n++;
      if (this.now() - t0 >= ms) break;
    }
    if (this.head >= this.q.length) { this.q = []; this.head = 0; this.dead = 0; }
    else if (this.head > 512) this._compact();
    const used = this.now() - t0; if (n) this.stats.time('recv', used);
    return n;
  }
}

// ---------------------------------------------------------------------------------------------
// cell edits the host has not sent yet: the same cell edited again and again keeps only its last value (a plush that freezes, is dug and freezes again)
export function compactCells(a) {
  compactCells.calls = (compactCells.calls | 0) + 1;   // (the audit counts how often a long queue is looked through)
  const seen = new Map(); const n = a.length;
  for (let q = 0; q + 4 < n; q += 5) seen.set((a[q + 1] * 16384 + a[q + 2]) * 16384 + a[q], q);
  if (seen.size * 5 >= n) return a;
  const out = []; for (let q = 0; q + 4 < n; q += 5) if (seen.get((a[q + 1] * 16384 + a[q + 2]) * 16384 + a[q]) === q) out.push(a[q], a[q + 1], a[q + 2], a[q + 3], a[q + 4]);
  return out;
}
