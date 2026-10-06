// Wave 0 compatibility: the old behavior still works through the new plumbing (gate scan in detector.js, readouts through the info hook,
// guest commands through runNetCmd, Shift+E copy and E paste on a Sorting Box). Nothing here uses a new item.
import { makeKit, ALL_UP } from './addons_lib.js';
import { infoFor, findInfoRef } from '../info.js';
import * as DETECTOR from '../detector.js';
import { TYPES } from '../catalog.js';
import * as EXT from '../ext.js';
import { NEEDLE } from '../plushdata.js';

export default async function (ctx) {
  const { T, g, S, p, L, V3, fresh, tiles, adv, cellX, cellZ } = ctx;
  const K = makeKit(ctx);
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); };
  const guard = (name, fn) => T(name, async () => { try { return await fn(); } finally { done(); g.stowed = true; g.cfgClip = null; } });
  const walkThrough = (gate, back = 1.5) => { gate._pIn = false; g._gateCd = 0; p().vel.set(0, 0, 0); p().pos.set(cellX(gate.i), gate.j * 0.6, cellZ(gate.k) - back); g.playerGateScan(0.05); p().pos.set(cellX(gate.i), gate.j * 0.6, cellZ(gate.k)); g.playerGateScan(0.05); };

  await T('wave0.gate-scan-lives-in-detector-js-and-the-game-method-forwards-to-it', async () => {
    if (typeof DETECTOR.playerScan !== 'function' || DETECTOR.playerScan.length !== 2) return 'detector.playerScan(g, dt) missing';
    if (typeof g.playerGateScan !== 'function') return 'game.playerGateScan went away (the self test and crew code call it)';
    fresh({ detector: 1 }); const gate = tiles().find((t) => t.type === 'belt' && t.detector); if (!gate) return 'no free gate';
    S().carry = [{ sp: 3, vr: 0 }]; const s0 = S().stats.scans || 0;
    gate._pIn = false; g._gateCd = 0; p().vel.set(0, 0, 0); p().pos.set(cellX(gate.i), gate.j * 0.6, cellZ(gate.k) - 1.5); DETECTOR.playerScan(g, 0.05); p().pos.set(cellX(gate.i), gate.j * 0.6, cellZ(gate.k)); DETECTOR.playerScan(g, 0.05);
    return ((S().stats.scans || 0) - s0 === 1) || 'calling detector.playerScan directly did not scan: ' + ((S().stats.scans || 0) - s0);
  });

  await guard('wave0.gate-scan-clear-flow-counts-the-bag-dings-hints-once-per-crossing', async () => {
    fresh({ detector: 1 }); const gate = tiles().find((t) => t.type === 'belt' && t.detector); const bad = [];
    S().carry = [{ sp: 3, vr: 0 }, { sp: 4, vr: 0 }]; let dings = 0; const gd = g.gateDing; g.gateDing = () => { dings++; };
    try {
      const s0 = S().stats.scans || 0; walkThrough(gate);
      if ((S().stats.scans || 0) - s0 !== 2) bad.push('scanned ' + ((S().stats.scans || 0) - s0) + ' of 2');
      if (dings !== 1) bad.push('dings ' + dings); if (gate.alarm) bad.push('alarm raised without The One');
      if (!/SCAN CLEAR/.test(document.getElementById('hint').textContent)) bad.push('no SCAN CLEAR hint: ' + document.getElementById('hint').textContent);
      // still inside the gate on the next frame, and a second crossing inside 0.6 s: neither scans again
      const s1 = S().stats.scans; g.playerGateScan(0.05); gate._pIn = false; g._gateCd = 0.5; p().pos.set(cellX(gate.i), gate.j * 0.6, cellZ(gate.k)); g.playerGateScan(0.05); if (S().stats.scans !== s1) bad.push('scanned twice in one crossing');
      // with a cart full of plush in range the cart counts too
      S().cart = { tier: 2, x: cellX(gate.i) + 1, y: 0, z: cellZ(gate.k), yaw: 0, mode: 'stay', load: [{ sp: 2, vr: 0 }, { sp: 2, vr: 0 }, { sp: 2, vr: 0 }] }; const s2 = S().stats.scans; walkThrough(gate); if (S().stats.scans - s2 !== 5) bad.push('cart not counted: ' + (S().stats.scans - s2)); S().cart = null;
    } finally { g.gateDing = gd; }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('wave0.gate-scan-the-one-in-your-bag-wins-through-the-gate', async () => {
    fresh({ detector: 1 }); const gate = tiles().find((t) => t.type === 'belt' && t.detector); const bad = [];
    S().carry = [{ sp: NEEDLE, vr: 0 }]; let won = null; const fn = g.foundNeedle; g.foundNeedle = (how) => { won = how; };
    try { walkThrough(gate); } finally { g.foundNeedle = fn; }
    if (won !== 'the gate') bad.push('foundNeedle called with ' + won);
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('wave0.gate-scan-alarm-flow-on-a-belt-stops-the-line-and-the-readout-and-pickup-follow', async () => {
    fresh({ detector: 1, belts: 1 }); const gate = tiles().find((t) => t.type === 'belt' && t.detector); const bad = [];
    const alarms = []; const na = g.needleAlarm, pu = g.pickedUp; g.needleAlarm = (t) => { alarms.push(t.id); }; let got = null; g.pickedUp = (it) => { got = it; };
    try {
      const clear = L().scanItem(gate, { sp: 3, vr: 0 }); if (clear || gate.alarm) bad.push('an ordinary plush raised the alarm');
      const hit = L().scanItem(gate, { sp: NEEDLE, vr: 0 });
      if (!hit || !gate.alarm || !gate.held || gate.held.sp !== NEEDLE || alarms.length !== 1 || !gate.halt) bad.push('alarm state: ' + JSON.stringify({ hit, alarm: gate.alarm, held: !!gate.held, alarms, halt: gate.halt }));
      const info = infoFor(g, { kind: 'tile', id: gate.id }); if (!info || info.title !== 'DETECTOR GATE' || info.lit !== false || !/ALARM/.test(info.lines[0])) bad.push('readout during alarm: ' + JSON.stringify(info));
      g.useTile(gate); if (!got || got.sp !== NEEDLE || gate.alarm || gate.held || gate.halt) bad.push('E did not hand over The One and clear the alarm: ' + JSON.stringify({ got, alarm: gate.alarm, halt: gate.halt }));
      const calm = infoFor(g, { kind: 'tile', id: gate.id }); if (!calm || calm.lit !== true || !/All clear/.test(calm.lines[0])) bad.push('readout after pickup: ' + JSON.stringify(calm));
    } finally { g.needleAlarm = na; g.pickedUp = pu; }
    return bad.length === 0 || bad.join(' || ');
  });

  await T('wave0.belt-sorter-and-generator-readouts-come-through-the-info-hook-unchanged', async () => {
    fresh(ALL_UP); const bad = [];
    for (const [id, re] of [['belt', /^BELT$/], ['sorter', /SORTING BOX/], ['gen', /GENERATOR/], ['splitter', /SPLITTER/], ['pole', /POWER POLE/]]) {
      const sp = { belt: [-6.6, 1.2, 1], sorter: [-8, -6, 0], gen: [-9, -1.2, 0], splitter: [-6.6, 3.6, 0], pole: [-9, -2.4, 0] }[id];
      const r = await K.put(id, { x: sp[0], z: sp[1], dir: sp[2] }); if (!r.ok) { bad.push(`${id}: could not place (${r.why})`); continue; }
      const t = K.tileOf(r.ent), info = infoFor(g, { kind: 'tile', id: t.id });
      if (!info || !re.test(info.title)) { bad.push(`${id}: title ${info && info.title}`); continue; }
      const text = info.lines.join(' | ');
      if (id === 'belt' && !/Carrying 0 plush/.test(text) || id === 'belt' && !/Speed 1\.6 tiles per second/.test(text)) bad.push('belt lines: ' + text);
      if (id === 'sorter' && !/0 plush waiting/.test(text)) bad.push('sorter lines: ' + text);
      if (id === 'gen' && !/Not burning|Burning/.test(text) || id === 'gen' && !/Hopper 0\//.test(text)) bad.push('gen lines: ' + text);
    }
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('wave0.guest-commands-still-run-on-the-host-place-tile-decon-and-an-unknown-command-is-ignored', async () => {
    fresh(ALL_UP); const bad = [];
    const r = await K.put('sorter', { x: -8, z: -6, dir: 0 }); if (!r.ok) return r.why; const t = K.tileOf(r.ent);
    role('host'); cap();
    g.netMessage({ t: 'cmd', c: 'tile', d: { id: t.id, room: 5 } }); if (t.mode !== 1) bad.push('guest E on a sorter did not cycle the mode: ' + t.mode);
    g.netMessage({ t: 'cmd', c: 'nope', d: {} }); g.netMessage({ t: 'cmd', c: 'cfg', d: null }); g.netMessage({ t: 'cmd', c: 'cfg', d: { id: t.id, patch: { evil: 1 } } });
    if (t.mode !== 1 || t.evil !== undefined) bad.push('a refused cfg changed the sorter');
    if (!sent.some((m) => m.t === 'toast')) bad.push('no toast told the guest the cfg was refused');
    g.netMessage({ t: 'cmd', c: 'decon', d: { kind: 'tile', id: t.id } });
    if (g.logi.byId.has(t.id) || S().items.sorter !== 1 || !sent.some((m) => m.t === 'ent-' && m.id === t.id)) bad.push('guest decon: items ' + JSON.stringify(S().items));
    // the guest side only sends: a place command, and E on a tile
    done(); fresh(ALL_UP); const b = await K.put('sorter', { x: -8, z: -6, dir: 0 }); const t2 = K.tileOf(b.ent); role('guest'); cap(); g.useTile(t2); const c = sent.find((m) => m.t === 'cmd' && m.c === 'tile');
    if (!c || c.d.id !== t2.id || t2.mode !== 0) bad.push('guest useTile did not just send the tile command: ' + JSON.stringify(c));
    return bad.length === 0 || bad.join(' || ');
  });

  await guard('wave0.sorter-settings-copy-with-shift-e-and-paste-with-e-and-plain-e-still-cycles', async () => {
    fresh({ ...ALL_UP, optics: 3 }); const bad = [];
    const a = await K.put('sorter', { x: -8, z: -6, dir: 0 }), b = await K.put('sorter', { x: -8, z: -3, dir: 0 }); if (!a.ok || !b.ok) return 'could not place two sorters';
    const ta = K.tileOf(a.ent), tb = K.tileOf(b.ent); if (g.T.sorterTiers < 2) return 'test needs sorterTiers 2, have ' + g.T.sorterTiers;
    const key = (code, shift) => g.onKey({ code, shiftKey: !!shift, preventDefault() {} }, true);
    const aim = (t) => { K.aimDir(cellX(t.i), t.j * 0.6 + 0.3, cellZ(t.k), 0, 1.6); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3())); };
    const r = g.setCfg(ta, { mode: 2 }); if (!r.ok || ta.mode !== 2 || ta.filter !== 2) bad.push('cfg on a sorter: ' + JSON.stringify([r, ta.mode, ta.filter]));
    if (g.setCfg(ta, { mode: 5 }).ok) bad.push('a locked sorter mode was accepted');
    if (g.setCfg(ta, { filter: 3 }).ok) bad.push('filter is derived, not a cfg key');
    // plain E on an uncopied sorter keeps its old behavior (cycle the mode)
    aim(tb); key('KeyE'); if (tb.mode !== 1 || g.cfgClip) bad.push('plain E changed behavior: mode ' + tb.mode);
    // Shift+E on a sorter copies, E on another one pastes and does not cycle
    aim(ta); key('KeyE', true); if (!g.cfgClip || g.cfgClip.vals.mode !== 2) bad.push('shift+E did not copy: ' + JSON.stringify(g.cfgClip));
    aim(tb); key('KeyE'); if (tb.mode !== 2 || tb.filter !== 2) bad.push('E did not paste: mode ' + tb.mode);
    // Shift+E at nothing drops the copy and E goes back to cycling
    K.lookUp(); adv(0.05); g.renderer.camera.position.copy(p().eyePos(new V3())); key('KeyE', true); if (g.cfgClip) bad.push('shift+E at nothing kept the copy');
    aim(tb); key('KeyE'); if (tb.mode !== 3) bad.push('E after dropping the copy did not cycle: ' + tb.mode);
    // a thing with no settings: shift+E falls through to the normal use
    return bad.length === 0 || bad.join(' || ');
  });

  void findInfoRef; void L; void TYPES; void EXT;
}
