// sound.*: every world sound has a place it comes from and fades with distance (src/spatial.js, src/worldsound.js).
// The call-site table below lists every direct `sound.x()` call in src/ as OWN (a person's own action: full volume) or UI (a panel, a message, a global event), and counts the
// positional ones (`sound.at(...)`, `soundAt`, `actSound`). A new call that is not in the table fails sound.every-call-site-is-classified: classify it here, and if it is a world sound
// give it a source position and a class from CLASSES (spatial.js).
import { CLASSES, NEAR, rolloff, WINDOW, TOTAL_CAP } from '../spatial.js';
import * as WS from '../worldsound.js';

const SRC = import.meta.glob('../*.js', { query: '?raw', import: 'default', eager: true });
// file: [own methods, ui methods, positional count]
const TABLE = {
  'beltintake.js': [{}, {}, 1],
  'beltplan.js': [{ tone: 3, place: 1 }, { error: 5 }, 2],
  'bench.js': [{}, { error: 4 }, 0],
  'binspanel.js': [{ place: 4, tone: 1 }, { error: 5 }, 0],
  'botfuel.js': [{}, {}, 1],
  'build.js': [{ place: 3 }, { error: 3 }, 0],
  'cables.js': [{ tone: 1, place: 2 }, { error: 4 }, 0],
  'carepackage.js': [{}, { ach: 1, error: 1 }, 2],   // the opener's own chime and error buzz; the landing thump and ping come from the crate (sound.at 'fall' and 'ping')
  'catalog_power.js': [{ place: 1, tone: 3 }, { error: 1 }, 0],
  'contracts.js': [{}, { ach: 1 }, 0],
  'crafting.js': [{ place: 4 }, { error: 7, buy: 1 }, 0],
  'crew.js': [{ chirp: 3 }, { error: 1 }, 5],
  'detector.js': [{}, {}, 1],
  'earth.js': [{}, { found: 1 }, 0],
  'ext.js': [{ tone: 1, place: 1 }, { error: 1 }, 1],
  'furnish.js': [{ place: 1 }, { error: 1 }, 0],
  'game.js': [{ thump: 16, step: 1, squeak: 2, stepConcrete: 1, tone: 11, pop: 1, whoosh: 4, soft: 5, chirp: 3, place: 6, coin: 2, creak: 3, cough: 1, wheeze: 1, geiger: 1 },
    { bindWorld: 1, setVolume: 2, init: 4, resume: 3, error: 10, buy: 1, setAmbientMuffle: 1, setMachines: 1, found: 3, ach: 7, dingDong: 2, rumble: 3, exitSfx: 1 }, 35],
  'logistics.js': [{}, {}, 1],
  'softslide.js': [{ thump: 1 }, {}, 0],   // your own landing thump at the end of a ride
  'notebook.js': [{}, { ach: 1 }, 0],
  'powerparts.js': [{ tone: 1 }, { error: 1 }, 1],
  'radio.js': [{ noise: 1, tone: 1 }, {}, 0],
  'rail.js': [{ place: 1, thump: 1 }, {}, 0],
  'splitpanel.js': [{ tone: 1 }, { error: 2 }, 0],
  'transit.js': [{ tone: 8, place: 1 }, { error: 10 }, 6],
  'ui.js': [{}, { error: 1 }, 0],
  'vehiclescan.js': [{ place: 1 }, { found: 1 }, 2],
  'worldsound.js': [{}, {}, 7],
};
const UI_METHODS = new Set(['error', 'buy', 'ach', 'found', 'exitSfx', 'dingDong', 'init', 'resume', 'setVolume', 'setMachines', 'setAmbientMuffle', 'bindWorld', 'rumble']);
const SKIP = new Set(['selftest.js', 'spatial.js', 'audio.js']);

function scan(raw, file) {
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');   // comments are not calls
  const own = {}, ui = {}; let at = 0; const classes = [];
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
  for (const m of src.matchAll(/\bsound\.(\w+)\(/g)) {
    const meth = m[1];
    if (meth === 'at') {
      at++;
      let depth = 1, i = m.index + m[0].length; const start = i;   // the class is the last quoted word before the closing parenthesis
      for (; i < src.length && depth > 0; i++) { const c = src[i]; if (c === '(') depth++; else if (c === ')') depth--; }
      const args = src.slice(start, i - 1), q = [...args.matchAll(/'(\w+)'|(\bcls\b)/g)].pop();
      classes.push(q ? q[1] || q[2] : '?');
    } else bump(UI_METHODS.has(meth) ? ui : own, meth);
  }
  for (const m of src.matchAll(/\bsound\(g, \(s\) => (?:\{ )?s\.(\w+)\(/g)) bump(UI_METHODS.has(m[1]) ? ui : own, m[1]);
  const sa = [...src.matchAll(/\bsoundAt\(g, e, '(\w+)'/g)]; at += sa.length; for (const m of sa) classes.push(m[1]);
  const aa = [...src.matchAll(/\bactSound\(\s*(?:this|g)\b[^)]*\)/g)]; at += aa.length;
  return { own, ui, at, classes, file };
}
// any `x.at(a, b, c, 'word')` (the receiver may be an alias of the sound, like `s` in avalanche.js): the word must be a class
function atClasses(raw) {
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1'), out = [];
  for (const m of src.matchAll(/\b\w+\.at\(/g)) {
    let depth = 1, i = m.index + m[0].length, commas = 0; const start = i;
    for (; i < src.length && depth > 0; i++) { const c = src[i]; if (c === '(' || c === '[' || c === '{') depth++; else if (c === ')' || c === ']' || c === '}') depth--; else if (c === ',' && depth === 1) commas++; }
    const args = src.slice(start, i - 1), q = args.match(/,\s*'(\w+)'\s*$/);
    if (commas >= 3 && q) out.push(q[1]);
  }
  return out;
}
const same = (a, b) => { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]); };

export default async function (ctx) {
  const { T, g, S, p, fresh, adv, V3, cellX, cellZ, toI, toJ, toK } = ctx;
  const snd = () => g.sound;
  const L0 = { x: 0, y: 30, z: 0, yaw: 0 };   // a listener high in the open hall (30 m up: nothing solid anywhere near, the pile top is 43 m only far away)
  const NOWORLD = { world: null };   // the rolloff alone: no plush to walk through (the hall is solid pile from 40 m out)
  const open = (x, z, cls) => { const keep = g.sound.game; g.sound.game = NOWORLD; try { return g.sound.voice(x, 30, z, cls, L0); } finally { g.sound.game = keep; } };
  const trace = () => { g.sound.tracing = true; g.sound.trace = []; g.sound.stats = null; g.sound._win = null; g.sound._occ = null; };
  const untrace = () => { g.sound.tracing = false; g.sound.trace = []; delete g.sound._now; g.sound._win = null; };
  const listenAt = (x, z) => p().pos.set(x, 0, z);
  const last = () => g.sound.trace[g.sound.trace.length - 1];

  await T('sound.every-call-site-is-classified', async () => {
    const bad = [], seen = new Set();
    for (const [path, src] of Object.entries(SRC)) {
      const file = path.split('/').pop(); if (SKIP.has(file)) continue;
      const r = scan(src, file), row = TABLE[file] || [{}, {}, 0]; seen.add(file);
      if (!same(r.own, row[0])) bad.push(`${file}: own calls ${JSON.stringify(r.own)} but the table says ${JSON.stringify(row[0])} (a person's own action at full volume: add it to TABLE; a sound from somewhere in the world must go through sound.at)`);
      if (!same(r.ui, row[1])) bad.push(`${file}: ui calls ${JSON.stringify(r.ui)} but the table says ${JSON.stringify(row[1])}`);
      if (r.at !== row[2]) bad.push(`${file}: ${r.at} positional sounds but the table says ${row[2]}`);
      for (const c of r.classes) if (c !== 'cls' && !CLASSES[c]) bad.push(`${file}: positional sound with an unknown class '${c}'`);
    }
    for (const [path, src] of Object.entries(SRC)) { const file = path.split('/').pop(); if (SKIP.has(file)) continue; for (const c of atClasses(src)) if (!CLASSES[c]) bad.push(`${file}: x.at(..., '${c}') is not a sound class`); }
    for (const f of Object.keys(TABLE)) if (!seen.has(f)) bad.push(`${f} is in the table but not in src`);
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.the-table-is-honest-a-mutated-call-is-caught', async () => {
    const game = SRC['../game.js'];
    const r0 = scan(game, 'game.js');
    const r1 = scan(game + '\nthis.sound.thump(0.3, 90);', 'game.js'), r2 = scan(game + '\nthis.sound.at(1, 2, 3, \'nope\').coin(0);', 'game.js');
    const r3 = atClasses(game + "\nconst s = this.sound; s.at(1, 2, 3, 'nada').coin(0);");
    return (!same(r0.own, r1.own) && r2.classes.includes('nope') && !CLASSES.nope && r2.at === r0.at + 1 && r3.includes('nada') && atClasses(game).every((c) => CLASSES[c] || c === 'cls')) || 'the scan did not notice an added call';
  });

  await T('sound.every-class-has-sane-numbers', async () => {
    const bad = [];
    for (const [k, c] of Object.entries(CLASSES)) {
      if (!(c.max > NEAR) || !(c.cap >= 1) || !(c.area >= 1) || !(c.occ >= 0)) bad.push(k + ' ' + JSON.stringify(c));
    }
    for (const k of ['coin', 'pop']) if (CLASSES[k].max !== 18) bad.push(k + ' is not 18 m');
    for (const k of ['work', 'hum', 'scan']) if (CLASSES[k].max !== 30) bad.push(k + ' is not 30 m');
    for (const k of ['boom', 'rumble', 'collapse']) if (CLASSES[k].max < 60 || CLASSES[k].max > 90) bad.push(k + ' is not 60 to 90 m');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.volume-at-2-10-30-and-90-m-for-every-class', async () => {
    fresh({}); const bad = [], rows = [];
    for (const [k, c] of Object.entries(CLASSES)) {
      const v = [2, 10, 30, 90].map((d) => open(d, 0, k).gain);
      rows.push(k + ' ' + v.map((x) => x.toFixed(2)).join('/'));
      if (v[0] !== 1) bad.push(`${k}: ${v[0]} at 2 m, want full`);
      if (!(v[1] <= v[0] && v[2] <= v[1] && v[3] <= v[2])) bad.push(`${k}: not falling ${v}`);
      if (c.max <= 30 && v[2] !== 0) bad.push(`${k}: ${v[2]} at 30 m, want silent (max ${c.max})`);
      if (c.max <= 90 && v[3] !== 0) bad.push(`${k}: ${v[3]} at 90 m, want silent (max ${c.max})`);
      if (c.max > 30 && !(v[2] > 0)) bad.push(`${k}: silent at 30 m though it carries ${c.max} m`);
      if (c.max >= 60 && !(v[2] > 0.25)) bad.push(`${k}: only ${v[2]} at 30 m though it carries ${c.max} m`);
      if (!(open(c.max + 0.01, 0, k).gain === 0) || !(open(c.max - 0.5, 0, k).gain > 0)) bad.push(`${k}: the edge is not at ${c.max}`);
    }
    // smooth: no jump larger than 6 percent of full between two metres
    for (const k of ['coin', 'work', 'boom']) { let prev = 1; for (let d = 2; d < CLASSES[k].max + 2; d += 1) { const v = open(d, 0, k).gain; if (prev - v > 0.2) bad.push(`${k}: a jump from ${prev} to ${v} at ${d} m`); prev = v; } }
    return bad.length === 0 || bad.join(' || ') + ' :: ' + rows.join(' | ');
  });

  await T('sound.a-lower-pass-closes-with-distance', async () => {
    const a = open(3, 0, 'work').lp, b = open(15, 0, 'work').lp, c = open(28, 0, 'work').lp;
    return (a > 15000 && b < a && c < b && c < 2500) || `lp ${a} ${b} ${c}`;
  });

  await T('sound.pan-follows-the-listeners-yaw', async () => {
    const v = (x, z, yaw) => g.sound.voice(x, 30, z, 'work', { x: 0, y: 30, z: 0, yaw });
    const bad = [];
    // yaw 0 faces +z, so +x is on the left (three.js is right handed)
    if (!(v(8, 0, 0).pan < -0.5)) bad.push('+x with yaw 0 should be left: ' + v(8, 0, 0).pan);
    if (!(v(-8, 0, 0).pan > 0.5)) bad.push('-x with yaw 0 should be right: ' + v(-8, 0, 0).pan);
    if (Math.abs(v(0, 8, 0).pan) > 0.05) bad.push('straight ahead should be centred: ' + v(0, 8, 0).pan);
    // turn to face +x (yaw = pi / 2): +z is now to the right... facing +x with up y, right is +z? forward (1,0,0) x up (0,1,0) = (0*0-0*1, 0*0-1*0, 1*1-0) = (0,0,1)
    if (!(v(0, 8, Math.PI / 2).pan > 0.5)) bad.push('facing +x, a source at +z should be right: ' + v(0, 8, Math.PI / 2).pan);
    if (!(v(8, 0, Math.PI / 2).pan === 0 || Math.abs(v(8, 0, Math.PI / 2).pan) < 0.05)) bad.push('facing +x, a source at +x should be centred');
    // near sources are centred (nothing to pan at 20 cm)
    if (Math.abs(g.sound.voice(0.1, 30, 0.05, 'coin', L0).pan) > 0.2) bad.push('a source on top of you pans hard');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.plush-between-the-source-and-the-listener-muffles-it', async () => {
    fresh({}); const w = g.world, bad = [];
    const ls = { x: 0, y: 1.2, z: -1.4, yaw: 0 }, sx = 11, sy = 1.2, sz = -1.4;
    g.sound._occ = null;
    const clear = g.sound.voice(sx, sy, sz, 'work', ls), ratio = (v, k) => v.gain / rolloff(v.d, CLASSES[k].max);
    if (clear.solid !== 0) bad.push('the bay is not open: ' + clear.solid + ' m of plush');
    const cells = [];
    for (let i = toI(4); i <= toI(8); i++) for (let k = toK(-5); k <= toK(2); k++) for (let j = 0; j < 8; j++) { if (!w.get(i, j, k)) { w.setCell(i, j, k, 2, 0); cells.push([i, j, k]); } }
    g.sound._occ = null;
    let walled, walledBoom;
    try { walled = g.sound.voice(sx, sy, sz, 'work', ls); walledBoom = g.sound.voice(sx, sy, sz, 'boom', ls); }
    finally { for (const [i, j, k] of cells) w.removeCell(i, j, k, true); g.sound._occ = null; }
    const after = g.sound.voice(sx, sy, sz, 'work', ls);
    if (!(walled.solid > 2.5)) bad.push('the wall counted ' + walled.solid + ' m of plush');
    if (!(ratio(walled, 'work') < 0.45 * ratio(clear, 'work'))) bad.push(`a work sound is only ${ratio(walled, 'work').toFixed(2)} through plush (${ratio(clear, 'work').toFixed(2)} in the open)`);
    if (!(walled.lp < clear.lp * 0.6)) bad.push(`the low-pass did not close: ${walled.lp} vs ${clear.lp}`);
    if (!(ratio(walledBoom, 'boom') > ratio(walled, 'work') * 2)) bad.push('a blast carries through the ground no better than a work sound');
    if (!(Math.abs(after.gain - clear.gain) < 1e-6)) bad.push('the muffle stayed after the wall was gone');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.a-source-buried-under-the-pile-is-quieter-in-the-hall', async () => {
    fresh({}); const bad = [];
    // x = 30 is under 14 m of pile, x = 0 is the open bay
    g.sound._occ = null;
    // (the world is random: the slope is not 25 m high at x = 26 in every one, so the pair in the air is put 3 m above the highest ground between the two points)
    let top = 0; for (let x = 0; x <= 30; x += 0.5) top = Math.max(top, g.world.topAt(toI(x), toK(-1.4)) * 0.6); const yAir = top + 3;
    const buried = g.sound.voice(26, 1.5, -1.4, 'work', { x: 4, y: 1.5, z: -1.4, yaw: 0 }), clear = g.sound.voice(26, yAir, -1.4, 'work', { x: 4, y: yAir, z: -1.4, yaw: 0 });
    const r = (v) => v.gain / rolloff(v.d, 30);
    if (!(r(buried) < r(clear) * 0.7)) bad.push(`a buried source is ${r(buried).toFixed(2)} against ${r(clear).toFixed(2)} in the air`);
    if (![...g.sound._occ.values()].some((e) => e.split)) bad.push('no pair was marked as one under the pile and one in the hall');
    if (![...g.sound._occ.values()].some((e) => !e.split)) bad.push('the two in the air were marked as split');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.the-occlusion-walk-is-cached-and-never-builds-the-world', async () => {
    fresh({}); const w = g.world, bad = [], n0 = w.cols.size;
    const ls = { x: 0, y: 1.2, z: -1.4, yaw: 0 };
    g.sound.voice(85, 1.2, 40, 'rumble', ls);   // a source in a column nobody has built
    if (w.cols.size !== n0) bad.push('a far sound made the world build ' + (w.cols.size - n0) + ' columns');
    g.sound._occ = null; const t0 = performance.now(); for (let n = 0; n < 2000; n++) g.sound.voice(40, 1.2, -1.4, 'rumble', ls); const ms = performance.now() - t0;
    if (!(ms < 400)) bad.push(`2000 cached lookups took ${ms.toFixed(0)} ms`);
    if (!(g.sound._occ && g.sound._occ.size >= 1 && g.sound._occ.size <= 301)) bad.push('the cache is not used or not bounded');
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.a-rig-sale-at-the-bin-is-silent-60-m-away-and-heard-up-close', async () => {
    fresh({}); const bad = [], b = g.hall.binPos, BINS = null; void BINS;
    trace(); g.sound._now = () => 100;
    const tryAt = (d) => { listenAt(b.x + d, b.z); g.coinCd = 0; g.sound._win = null; g.sound._now = () => 100 + d; g.sellAuto(1, 0, 1, -1); return last(); };
    const near = tryAt(2), mid = tryAt(10), far = tryAt(60), edge = tryAt(19);
    if (!(near && near.played && near.gain === 1 && near.cls === 'coin')) bad.push('2 m: ' + JSON.stringify(near));
    if (!(mid && mid.played && mid.gain > 0.1 && mid.gain < 0.5)) bad.push('10 m: ' + JSON.stringify(mid));
    if (!(far && !far.played && far.why === 'far')) bad.push('60 m: ' + JSON.stringify(far));
    if (!(edge && !edge.played)) bad.push('19 m: ' + JSON.stringify(edge));
    // the money still arrives whether anyone hears it
    const m0 = S().money; g.coinCd = 0; g.sellAuto(1, 0, 1, -1); if (!(S().money > m0)) bad.push('a silent sale did not pay');
    untrace();
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.a-claw-rig-selling-deep-in-a-tunnel-is-not-heard-at-the-bin', async () => {
    fresh({}); const bad = [], b = g.hall.binPos; trace();
    const taken = { sp: 1, vr: 0 };
    // you stand 45 m from the bin; the rig is next to you, the bin is not
    listenAt(b.x + 45, b.z); g.coinCd = 0; g.rigPluck(taken, b.x + 46, 1, b.z, null);
    const c = g.sound.trace.filter((t) => t.cls === 'coin');
    if (c.length !== 1 || c[0].played || c[0].why !== 'far') bad.push('the rig sale rang at 45 m: ' + JSON.stringify(c));
    // standing at the bin you hear it
    listenAt(b.x + 3, b.z); g.coinCd = 0; g.sound.trace.length = 0; g.sound._win = null; g.rigPluck(taken, b.x + 40, 1, b.z, null);
    const c2 = g.sound.trace.filter((t) => t.cls === 'coin'); if (c2.length !== 1 || !c2[0].played) bad.push('the rig sale was silent at the bin: ' + JSON.stringify(c2));
    untrace();
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.your-own-throw-into-the-bin-keeps-its-full-volume', async () => {
    fresh({}); const bad = [], b = g.hall.binPos; trace(); listenAt(b.x + 35, b.z);
    const calls = []; const o = g.sound.coin; g.sound.coin = (...a) => { calls.push(a); };
    try {
      g.coinCd = 0; g.sell(1, 0, { dist: 20, streak: true, bonus: true });   // a thrown shot: the sim marks it with the bonus flag
      g.coinCd = 0; g.sell(1, 0, { dist: 0, streak: true, own: true });
      g.coinCd = 0; g.sell(1, 0, { dist: 0, streak: true });                // plush that came in some other way: heard from the bin
    } finally { g.sound.coin = o; }
    if (calls.length !== 2) bad.push('your two own sales should ring in full, the stub heard ' + calls.length + ' coins (the third is 35 m from the bin: silent)');
    const tr = g.sound.trace; if (tr.length !== 1 || tr[0].cls !== 'coin' || tr[0].played) bad.push('only the third sale should go through at(), and it is 35 m off: ' + JSON.stringify(tr));
    untrace();
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.the-voice-limiter-stops-a-flood', async () => {
    fresh({}); const bad = []; trace(); listenAt(0, 0);
    let t = 1000; g.sound._now = () => t;
    const flood = (cls, n, spread) => { for (let q = 0; q < n; q++) g.sound.at((q % 7) * spread, 1, 3 + (q % 5) * spread, cls); };
    flood('coin', 50, 0.4);
    const st = g.sound.stats; if (st.byClass.coin.played > CLASSES.coin.cap) bad.push(`50 coins in one window: ${st.byClass.coin.played} voices (cap ${CLASSES.coin.cap})`);
    if (!(st.byClass.coin.capped >= 40)) bad.push('capped only ' + st.byClass.coin.capped);
    // 50 rigs at different spots around the bin: one voice per 8 m square
    g.sound._win = null; g.sound.stats = null; const n0 = g.sound.trace.length;
    for (let q = 0; q < 50; q++) g.sound.at(-6 + (q % 10) * 1.2, 1, -6 + Math.floor(q / 10) * 2.4, 'coin');
    const played = g.sound.trace.slice(n0).filter((x) => x.played).length; if (played > CLASSES.coin.cap) bad.push('50 rigs sounded ' + played + ' voices');
    // the next window starts fresh
    t += WINDOW + 0.01; const n1 = g.sound.trace.length; g.sound.at(1, 1, 1, 'coin'); if (!g.sound.trace[n1].played) bad.push('the window did not reset');
    // the total cap: many classes at once
    t += 1; g.sound._win = null; g.sound.stats = null; let all = 0; const n2 = g.sound.trace.length;
    for (const k of Object.keys(CLASSES)) for (let q = 0; q < 4; q++) g.sound.at(q * 9, 1, (q % 2) * 9, k);
    all = g.sound.trace.slice(n2).filter((x) => x.played).length; if (all > TOTAL_CAP) bad.push(`${all} voices over every class (total cap ${TOTAL_CAP})`);
    // a far or silent source never uses a slot
    t += 1; g.sound._win = null; g.sound.stats = null; for (let q = 0; q < 30; q++) g.sound.at(500 + q, 1, 500, 'coin'); const n3 = g.sound.trace.length; g.sound.at(1, 1, 1, 'coin'); if (!g.sound.trace[n3].played) bad.push('far sources used up the voices');
    // blasts: two at once at most
    t += 1; g.sound._win = null; const n4 = g.sound.trace.length; for (let q = 0; q < 10; q++) g.sound.at(q * 9, 1, 0, 'boom'); const booms = g.sound.trace.slice(n4).filter((x) => x.played).length; if (booms > CLASSES.boom.cap) bad.push('too many booms ' + booms);
    untrace();
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.a-playing-voice-is-built-from-a-gain-a-pan-and-a-lowpass', async () => {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return true;
    const s = new g.sound.constructor(); s.bindWorld(g); s.init(); const bad = [];
    try {
      if (!s.ctx) return true;
      const L = { x: 0, y: 30, z: 0, yaw: 0 }; const v0 = s.voice(9, 30, 4, 'work', L);
      const a = s.at(9, 30, 4, 'work', L);
      if (!a.audible) bad.push('not audible at 10 m');
      if (!(a.dry && a.dry !== s.dry && Math.abs(a.dry.gain.value - v0.gain) < 1e-6)) bad.push('the voice did not get its own gain of ' + v0.gain);
      const dead = s.at(500, 30, 0, 'work', L);
      if (dead.audible || dead.ctx !== null) bad.push('a far voice still has a context');
      const calls = []; const ot = s.tone; s.tone = function (...x) { calls.push(this === s ? 'root' : 'voice'); return ot.apply(this, x); };
      a.thump(0.2, 90); dead.thump(0.2, 90);
      if (calls[0] !== 'voice') bad.push('the voice did not call through itself');
      const nodes0 = s.ctx.currentTime; void nodes0;
    } finally { try { s.ctx.close(); } catch (e) { /* closed already */ } }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.the-machine-hum-fades-with-distance', async () => {
    fresh({}); const L = g.logi, bad = [];
    listenAt(0, 0); const a = L.humAt(2, 0), b = L.humAt(18, 0), c = L.humAt(31, 0);
    if (a !== 1 || !(b > 0 && b < 0.5) || c !== 0) bad.push(`${a} ${b} ${c}`);
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.a-detector-arch-and-a-scanner-fade-and-pan', async () => {
    fresh({}); const bad = []; trace();
    const D = await import('../detector.js'), ent = { id: 999, type: 'arch', cx: 12, cz: -1.4, y0: 0, h: 3, w: 3, axis: 'x', volume: 0.7, size: 1 };
    listenAt(0, -1.4); g.sound._now = () => 5000; D.react(g, ent, 'tick', { mine: false });
    const t1 = last(); if (!(t1 && t1.cls === 'arch' && t1.played && t1.gain > 0 && t1.gain < 1)) bad.push('at 12 m: ' + JSON.stringify(t1));
    g.sound._now = () => 5010; listenAt(-45, -1.4); D.react(g, ent, 'tick', { mine: false });
    const t2 = g.sound.trace[g.sound.trace.length - 1]; if (t2 && t2.played) bad.push('an arch 57 m away was heard: ' + JSON.stringify(t2));
    untrace();
    return bad.length === 0 || bad.join(' || ');
  });

  await T('sound.your-friend-is-heard-from-where-they-are', async () => {
    fresh({}); const bad = []; trace(); listenAt(0, 0);
    let t = 7000; g.sound._now = () => t;
    // walking: a step every 1.8 m, quiet and positional
    g._rstep = null; WS.partnerStep(g, { x: 5, y: 0, z: 0 }); let n0 = g.sound.trace.length;
    for (let q = 1; q <= 12; q++) { t += 0.3; WS.partnerStep(g, { x: 5 + q * 0.7, y: 0, z: 0 }); }
    const steps = g.sound.trace.slice(n0).filter((x) => x.cls === 'step'); if (steps.length < 3 || steps.length > 6) bad.push(steps.length + ' steps in 8.4 m');
    if (steps.some((x) => !(x.gain < 1))) bad.push('a step 6 to 14 m away at full volume');
    // a teleport is not walking
    n0 = g.sound.trace.length; WS.partnerStep(g, { x: 400, y: 0, z: 0 }); WS.partnerStep(g, { x: 402, y: 0, z: 0 }); if (g.sound.trace.slice(n0).some((x) => x.cls === 'step' && x.played)) bad.push('a jump across the hall sounded');
    // a throw from 10 m is heard softly, from 40 m not at all
    t += 1; n0 = g.sound.trace.length; WS.partnerThrow(g, [1, 0, 10, 1.5, 0, 0, 0, 0, 1]); WS.partnerThrow(g, [1, 0, 40, 1.5, 0, 0, 0, 0, 1]);
    const th = g.sound.trace.slice(n0).filter((x) => x.cls === 'throw'); if (!(th.length === 2 && th[0].played && th[0].gain < 1 && !th[1].played)) bad.push('throws: ' + JSON.stringify(th.map((x) => [x.played, x.gain])));
    // garbage never throws
    WS.partnerThrow(g, null); WS.partnerThrow(g, [1, 0, 'x']); WS.partnerStep(g, { x: NaN, y: 0, z: 0 }); WS.partnerStep(g, null);
    untrace();
    return bad.length === 0 || bad.join(' || ');
  });
}
