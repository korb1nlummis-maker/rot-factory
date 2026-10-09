// audit_notes.soak.*: the audit of the notes expansion (a seeded random soak). A long run of random reads, finds, saves, loads, role swaps, forged commands and journal clicks;
// after every step the journal must still be well formed and every clue in it true against the real needle. Run: `await __selftest('audit_notes.soak.')`
import * as NB from '../notebook.js';
import * as N from '../notes.js';
import { REMAINS, CACHE, pools } from '../plushdata.js';
import { mulberry32 } from '../util.js';
import { saveGame, loadSaved } from '../state.js';
import { SAVE_KEY } from '../config.js';

export default async function (ctx) {
  const { T, g, S, w, sim, fresh, toI, toK, cellX, cellZ, THREE } = ctx;
  const $ = (id) => document.getElementById(id);
  const json = (m) => JSON.parse(JSON.stringify(m));
  const canon = (v) => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v));   // (key order is not part of a paper)
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const cap = () => { sent = []; g.netSend = (m) => { sent.push(json(m)); }; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.ui.closeModalsSilently(); g.ui.openModal = null; };
  const placed = [];
  const clean = () => { for (const [i, j, k] of placed.splice(0)) if ([REMAINS, CACHE].includes(w().get(i, j, k))) w().setCell(i, j, k, 0, 0); };
  const reset = () => {
    clean(); fresh({}); const s = S(); s.notes = []; s.papers = []; s.heard = []; s.nflags = []; s.clues = []; s.clueLevel = 0; s.ach = {}; s.stats.remains = 0; s.stats.caches = 0; s.stats.piece5 = 0;
    s.entities = (s.entities || []).filter((e) => e.type !== 'beacon'); g.ui.jtab = 'finds'; g.ui.jfilter = 'all'; g.ui.closeModalsSilently(); g.ui.openModal = null; g._nfLive = null;
    const box = $('toasts'); if (box) box.innerHTML = '';
  };

  // what must hold after every step
  const invariants = (label) => {
    const s = S(), truth = N.truthOf(w().needle), bad = [];
    const ids = new Set(); for (const d of [...s.papers, ...s.heard]) { if (ids.has(d.id)) bad.push('duplicate paper ' + d.id); ids.add(d.id); if (!N.cleanDoc(d)) bad.push('malformed paper ' + d.id); if (d.clue && !N.clueHolds(d.clue, truth)) bad.push('FALSE clue in ' + d.id); }
    const nid = new Set(); for (const n of s.notes) { if (nid.has(n.id)) bad.push('duplicate note ' + n.id); nid.add(n.id); }
    const fl = new Set(); for (const f of s.nflags) { const k = `${f.i}.${f.j}.${f.k}`; if (fl.has(k)) bad.push('duplicate flag ' + k); fl.add(k); if (!NB.validFlag(f)) bad.push('bad flag'); }
    const sm = NB.summary(g);
    if (sm.conflict) bad.push('the summary of true clues conflicts');
    if (sm.bearing) { const a = (((N.bearingOf(truth.x, truth.z) - sm.bearing.lo) % 360) + 360) % 360; if (a > sm.bearing.w + 1e-6) bad.push('the needle left the summary bearing'); }
    if (sm.dist) { const r = Math.hypot(truth.x, truth.z); if (r < sm.dist.lo - 1e-6 || r > sm.dist.hi + 1e-6) bad.push('the needle left the summary distance'); }
    if (sm.height && (truth.y < sm.height.lo - 1e-9 || truth.y > sm.height.hi + 1e-9)) bad.push('the needle left the summary height');
    return bad.map((b) => `${label}: ${b}`);
  };

  await T('audit_notes.soak.450-random-steps-in-three-passes-keep-the-journal-well-formed-and-every-clue-true', async () => {
    reset(); let kept = null; try { kept = localStorage.getItem(SAVE_KEY); } catch (e) { kept = undefined; }
    let rnd = mulberry32(0x5eed ^ (S().seed | 0)); const R = (n) => (rnd() * n) | 0, bad = [], errs0 = g.errCount || 0;
    const pick = () => { const x = 900 + R(5000), z = (R(2) ? 1 : -1) * (100 + R(4500)); return { i: toI(x), k: toK(z), x, z }; };
    const put = (sp) => { const c = pick(); w().setCell(c.i, 0, c.k, sp, 9); placed.push([c.i, 0, c.k]); return c; };
    const log = [];
    try {
      for (let step = 0; step < 450 && bad.length < 6; step++) {
        if (step % 150 === 0) { clean(); rnd = mulberry32((0x5eed ^ (S().seed | 0)) + step * 7919); }   // three passes of 150 steps, each from its own seed
        const a = R(12); log.push(a);
        try {
          switch (a) {
            case 0: { const c = put(REMAINS); g.openRemains(c.i, 0, c.k); break; }
            case 1: { const c = put(CACHE); g.openCache(c.i, 0, c.k); break; }
            case 2: { const x = 700 + R(5000) * (R(2) ? 1 : -1), z = R(5000) * (R(2) ? 1 : -1), e = { id: g.nextId(), type: 'beacon', x, y: 0, z }; S().entities.push(e); g.onBeaconPlaced(e); if (R(2)) S().entities = S().entities.filter((o) => o.id !== e.id); break; }
            case 3: g.pickedUp({ sp: pools[R(2) ? 5 : 4][0], vr: 0 }, new THREE.Vector3(500 + R(5500), 4, R(5000) - 2500), true); break;
            case 4: g.contracts.complete({ id: 1 + R(2000), kind: 'shiny', need: 1, have: 1, reward: 10 }); break;
            case 5: { const d = N.makeDoc(S().seed, w().needle, { source: 'contract', key: [R(1e5), R(9), R(9)], dist: R(6500), kind: ['memo', 'ledger', 'map', 'photo'][R(4)], p: 1 }); if (d) NB.heard(g, d, 'Dev', true); break; }
            case 6: {   // a save and a load: what is read back must be exactly what was saved
              if (kept === undefined) break;
              const before = json({ p: S().papers, h: S().heard, f: S().nflags, n: S().notes });
              if (!saveGame(S(), w(), sim())) { bad.push('save failed'); break; }
              const p = loadSaved(); if (!p) { bad.push('load failed'); break; }
              const ok = NB.ensure(json(p.S));
              if (canon(ok.papers) !== canon(before.p) || canon(ok.heard) !== canon(before.h) || ok.notes.length !== before.n.length) bad.push(`a save and load changed the journal: ${canon(ok.papers) !== canon(before.p) ? 'papers ' + ok.papers.length + ' of ' + before.p.length : canon(ok.heard) !== canon(before.h) ? 'heard ' + ok.heard.length + ' of ' + before.h.length : 'notes'}`);
              break;
            }
            case 7: { const c = put(R(2) ? REMAINS : CACHE); NB.scan(g, 'Scrapper', cellX(c.i) + 1, cellZ(c.k), 4); break; }
            case 8: { g.ui.jtab = R(2) ? 'notes' : 'finds'; g.ui.jfilter = ['all', 'memo', 'coded', 'photo', 'worker', 'paperwork'][R(6)]; g.openModal('journal'); g.ui.closeModalsSilently(); g.ui.openModal = null; break; }
            case 9: {   // a forged open from the guest: a plain cell, a far cell, the needle's cell
              role('host'); cap(); const n = w().needle, c = pick(), cells = [[c.i, 0, c.k], [n.i, n.j, n.k], [toI(10), 0, toK(10)]], t = cells[R(3)];
              const before = w().get(t[0], t[1], t[2]); g.remote = { pos: new THREE.Vector3(cellX(t[0]), 0.2, cellZ(t[2])), name: 'Dev' };
              g.netCmd('open', { k: R(2) ? 'remains' : 'cache', i: t[0], j: t[1], kk: t[2] });
              if (w().get(t[0], t[1], t[2]) !== before && before !== REMAINS && before !== CACHE) bad.push(`a forged open emptied a cell holding ${before}`);
              done(); break;
            }
            case 10: { role('host'); cap(); const c = put(R(2) ? REMAINS : CACHE); g.remote = { pos: new THREE.Vector3(cellX(c.i) - 1, 0.2, cellZ(c.k)), name: 'Dev' }; g.netCmd('open', { k: w().get(c.i, 0, c.k) === REMAINS ? 'remains' : 'cache', i: c.i, j: 0, kk: c.k }); done(); break; }
            case 11: { role('guest'); cap(); g.pickedUp({ sp: pools[5][0], vr: 0 }, new THREE.Vector3(500 + R(5500), 4, R(5000) - 2500), true); done(); break; }
            default: break;
          }
        } catch (e) { bad.push(`step ${step} (action ${a}) threw: ${e && e.message}`); }
        g.ui.closeModalsSilently(); g.ui.openModal = null; done();
        bad.push(...invariants(`step ${step} action ${a}`));
      }
    } finally {
      done(); try { if (kept === null) localStorage.removeItem(SAVE_KEY); else if (kept) localStorage.setItem(SAVE_KEY, kept); } catch (e) { /* ignore */ }
      clean();
    }
    if ((g.errCount || 0) > errs0) bad.push('frame errors: ' + (g.errLog || []).slice(-1)[0]);
    return bad.length === 0 || bad.slice(0, 5).join(' || ') + ' [actions ' + log.join(',') + ']';
  });

  await T('audit_notes.soak.the-soak-takes-its-finds-out-of-the-world-again', async () => {
    reset(); const s = S();
    return (s.papers.length === 0 && s.nflags.length === 0 && s.heard.length === 0) || 'dirty after reset';
  });
}
