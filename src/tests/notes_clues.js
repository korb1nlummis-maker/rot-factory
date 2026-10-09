// Notes: the clue engine (src/notes.js). Every clue is true against the real needle position, a clue gets narrower the further out its note is found,
// nothing narrows the search below the finest lattice cell, the pieced-together summary never excludes the needle, and what arrives from outside is checked.
import { World } from '../world.js';
import * as N from '../notes.js';

const SEEDS = Array.from({ length: 200 }, (_, q) => (q * 7919 + 13 + (q % 7) * 100003) >>> 0);
const SOURCES = ['remains', 'cache', 'working', 'beacon', 'plush', 'contract'];
const ROLES = ['intern', 'sorter', 'forklift', 'surveyor', 'foreman', 'engineer', 'director'];
const DISTS = [60, 220, 450, 800, 1300, 2100, 3000, 4500, 5800];
const needleOf = (seed) => { const w = new World(seed); return { needle: w.needle, seed: w.seed, truth: N.truthOf(w.needle) }; };

export default async function (ctx) {
  const { T } = ctx;

  await T('notes.clues.every-clue-is-true-against-the-real-needle-over-200-seeds', async () => {
    const bad = [], seen = new Set(); let docs = 0, clues = 0;
    for (const seed of SEEDS) {
      const { needle, truth, seed: sd } = needleOf(seed);
      for (let q = 0; q < 54; q++) {
        const source = SOURCES[q % 6], d = N.makeDoc(sd, needle, { source, key: [seed % 9000 + q * 13, q % 4, seed % 500 + q * 7], dist: DISTS[q % DISTS.length], role: ROLES[q % 7], p: 1 });
        if (!d) { bad.push(`no doc for ${source} at p=1`); continue; }
        docs++;
        if (!d.clue) continue;
        clues++; seen.add(d.kind + ':' + d.clue.t);
        if (!N.clueHolds(d.clue, truth)) bad.push(`seed ${seed} ${source} ${d.kind} ${JSON.stringify(d.clue)} is false (needle ${truth.x | 0},${truth.z | 0},${truth.y.toFixed(1)})`);
        if (!d.text.toLowerCase().includes(N.clause(d.clue).toLowerCase())) bad.push(`${d.id} text does not say its clue: ${d.text}`);
        if (d.clue.t === 'w' && d.clue.s !== (truth.z < 0 ? 'N' : 'S') && d.clue.s !== (truth.x < 0 ? 'W' : 'E')) bad.push(`${d.id} measures from the ${d.clue.s} wall, which is not one of the needle's two nearest`);
      }
      // the old paperwork, every level
      for (let l = 1; l <= 4; l++) for (const c of N.paperwork(sd, needle, l).clues) if (!N.clueHolds(c, truth)) bad.push(`seed ${seed} paperwork ${l} is false`);
      // every clue type at every level, and the compass hint and wording variants
      for (let l = 1; l <= 4; l++) for (const [t, v] of [['b'], ['b', 'c'], ['d'], ['d', 'load'], ['x'], ['w'], ['h'], ['h', 'pile'], ['q']]) {
        const c = N.clueOfType(t, l, truth, (() => { let n = seed; return () => { n = (n * 1103515245 + 12345) >>> 0; return n / 4294967296; }; })(), v);
        if (!c || !N.clueHolds(c, truth)) bad.push(`seed ${seed} level ${l} ${t}${v || ''} is false`);
      }
    }
    if (docs < 10000 || clues < 5000) bad.push(`only ${docs} docs and ${clues} clues sampled`);
    return bad.length === 0 || `${bad.length} problems: ${bad.slice(0, 4).join(' | ')}`;
  });

  await T('notes.clues.the-same-seed-and-place-always-make-the-same-paper', async () => {
    const { needle, seed } = needleOf(4242);
    const src = { source: 'cache', key: [1234, 0, 5678], dist: 1500, p: 1 };
    const a = JSON.stringify(N.makeDoc(seed, needle, src)), b = JSON.stringify(N.makeDoc(seed, needle, src));
    if (a !== b) return 'two calls differ';
    const other = JSON.stringify(N.makeDoc(seed, needle, { ...src, key: [1235, 0, 5678] }));
    if (other === a) return 'a different place made the same paper';
    // the chance is a roll of the place: the same place always says yes or always no
    const yes = N.makeDoc(seed, needle, { source: 'remains', key: [77, 0, 88], dist: 900, role: 'sorter' });
    for (let n = 0; n < 5; n++) if (!!N.makeDoc(seed, needle, { source: 'remains', key: [77, 0, 88], dist: 900, role: 'sorter' }) !== !!yes) return 'a place changed its mind';
    // and the paper depends on the seed: some seeds put the clue somewhere else
    const buckets = new Set(); for (let s = 1; s <= 30; s++) { const n2 = needleOf(s * 977); const d = N.makeDoc(n2.seed, n2.needle, { source: 'contract', key: [5, 5, 5], dist: 3000, kind: 'manifest', p: 1 }); if (d && d.clue) buckets.add(JSON.stringify(d.clue)); }
    return buckets.size > 3 || `30 seeds made only ${buckets.size} different clues`;
  });

  await T('notes.clues.every-kind-turns-up-somewhere-and-a-good-share-carry-a-real-clue', async () => {
    const byKind = {}, bySource = {}; let withClue = 0, total = 0;
    const { needle, seed } = needleOf(31337);
    for (let q = 0; q < 6000; q++) {
      const source = SOURCES[q % 6], d = N.makeDoc(seed, needle, { source, key: [q * 3, q % 3, q * 5 + 1], dist: DISTS[q % DISTS.length], role: ROLES[q % 7] });
      if (!d) continue; total++;
      const k = (byKind[d.kind] = byKind[d.kind] || { n: 0, clue: 0 }); k.n++; if (d.clue) { k.clue++; withClue++; }
      (bySource[source] = bySource[source] || new Set()).add(d.kind);
    }
    const missing = N.DOC_KINDS.filter((k) => !byKind[k]);
    if (missing.length) return 'never made: ' + missing.join();
    const flavorOnly = N.DOC_KINDS.filter((k) => byKind[k].clue === byKind[k].n), allClue = N.DOC_KINDS.filter((k) => byKind[k].clue === 0);
    if (flavorOnly.length || allClue.length) return `kinds with no flavor ${flavorOnly} or no clue ${allClue}`;
    const share = withClue / total; if (share < 0.4 || share > 0.9) return `${(share * 100).toFixed(0)} percent of papers carry a clue`;
    for (const s of SOURCES) if (!bySource[s] || !bySource[s].size) return 'a source made nothing: ' + s;
    // the kinds are spread over the places: no source makes all of them, every kind has at least one place of its own
    const placesOf = (k) => SOURCES.filter((s) => bySource[s] && bySource[s].has(k));
    for (const k of N.DOC_KINDS) if (!placesOf(k).length) return 'no place makes ' + k;
    if (placesOf('photo').join() !== 'remains,cache,plush' && !placesOf('photo').includes('plush')) return 'photographs come from ' + placesOf('photo');
    if (!placesOf('coded').includes('beacon')) return 'coded messages do not come from depot beacon sets';
    return true;
  });

  await T('notes.clues.a-clue-is-narrower-the-further-out-the-note-is-found', async () => {
    const bad = [];
    for (const t of ['b', 'd', 'x', 'w', 'h', 'q']) { const ws = N.WIDTH[t]; for (let l = 1; l < 4; l++) if (!(ws[l] < ws[l - 1])) bad.push(`${t}: level ${l + 1} (${ws[l]}) is not narrower than level ${l} (${ws[l - 1]})`); }
    if (!(N.levelFor(10) === 1 && N.levelFor(299) === 1 && N.levelFor(300) === 2 && N.levelFor(1000) === 3 && N.levelFor(2200) === 4 && N.levelFor(6000) === 4)) bad.push('level thresholds');
    for (const seed of SEEDS.slice(0, 120)) {
      const { truth } = needleOf(seed); const rng = () => 0.3;
      for (const [t, v] of [['b'], ['d'], ['x'], ['h'], ['q'], ['w']]) {
        let prev = null;
        for (let l = 1; l <= 4; l++) {
          const c = N.clueOfType(t, l, truth, rng, v), w = N.widthOf(c);
          if (prev) { if (!(w < N.widthOf(prev))) bad.push(`seed ${seed} ${t} level ${l} not narrower`); const lo = c.t === 'q' ? c.x0 : c.lo, plo = prev.t === 'q' ? prev.x0 : prev.lo, hi = c.t === 'q' ? c.x0 + c.s : c.t === 'b' ? c.lo + c.w : c.hi, phi = prev.t === 'q' ? prev.x0 + prev.s : prev.t === 'b' ? prev.lo + prev.w : prev.hi; if (lo < plo - 1e-9 || hi > phi + 1e-9) bad.push(`seed ${seed} ${t} level ${l} is not inside level ${l - 1}`); }
          prev = c;
        }
      }
    }
    // papers found far out are tighter than the same kind of paper found near the bay
    let nearW = 0, farW = 0, n = 0;
    for (const seed of SEEDS.slice(0, 80)) {
      const { needle, seed: sd } = needleOf(seed);
      for (let q = 0; q < 20; q++) {
        const a = N.makeDoc(sd, needle, { source: 'contract', key: [q, 0, 0], dist: 100, kind: 'map', p: 1 }), b = N.makeDoc(sd, needle, { source: 'contract', key: [q, 0, 0], dist: 4000, kind: 'map', p: 1 });
        if (a && b && a.clue && b.clue && a.clue.t === b.clue.t) { nearW += N.widthOf(a.clue) / N.WIDTH[a.clue.t][0]; farW += N.widthOf(b.clue) / N.WIDTH[b.clue.t][0]; n++; }
      }
    }
    if (n < 100 || !(farW < nearW * 0.3)) bad.push(`far notes are ${(farW / nearW * 100).toFixed(0)} percent of the near ones' relative width over ${n} pairs`);
    return bad.length === 0 || bad.slice(0, 4).join(' | ');
  });

  await T('notes.clues.no-pile-of-notes-narrows-the-search-below-the-finest-cell', async () => {
    const bad = []; let minBox = 1e9, minBear = 1e9;
    for (const seed of SEEDS.slice(0, 30)) {
      const { truth } = needleOf(seed), rng = (() => { let s = 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
      // the finest note of every kind of clue there is, with every wall: the most any player could ever learn from paper
      const all = [N.clueOfType('b', 4, truth, rng), N.clueOfType('d', 4, truth, rng), N.clueOfType('x', 4, truth, rng), N.clueOfType('h', 4, truth, rng), N.clueOfType('q', 4, truth, rng)];
      for (const s of 'NSEW') { const c = N.clueOfType('w', 4, truth, () => 'NSEW'.indexOf(s) / 4 + 0.01); all.push(c); }
      const s = N.summarize(all);
      if (s.conflict || !s.box) { bad.push(`seed ${seed}: no region`); continue; }
      const bw = s.box.x1 - s.box.x0, bh = s.box.z1 - s.box.z0; minBox = Math.min(minBox, Math.max(bw, bh)); minBear = Math.min(minBear, s.bearing.w);
      // even then the range keeps a real size: nothing gets to a point
      if (Math.max(bw, bh) < 40) bad.push(`seed ${seed}: the whole search is ${bw | 0} by ${bh | 0} m`);
      if (!(s.bearing && s.bearing.w >= 0.5)) bad.push('bearing collapsed');
      if (s.height && s.height.hi - s.height.lo < 2.4) bad.push('height finer than a lattice cell');
    }
    // and a single note of any kind is never narrower than its lattice cell
    for (const t of ['d', 'x', 'w']) if (N.MIN_WIDTH[t] < 150) bad.push('lattice too fine for ' + t);
    return bad.length === 0 || `${bad.slice(0, 3).join(' | ')} (smallest box ${minBox | 0} m, bearing ${minBear.toFixed(1)})`;
  });

  await T('notes.clues.the-summary-of-any-set-of-clues-never-excludes-the-needle', async () => {
    const bad = []; let ms = 0, runs = 0, tight = 0;
    for (const seed of SEEDS) {
      const { needle, truth, seed: sd } = needleOf(seed);
      const rnd = (() => { let s = seed + 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
      const list = [];
      const n = 1 + Math.floor(rnd() * 34);
      for (let q = 0; q < n; q++) { const d = N.makeDoc(sd, needle, { source: SOURCES[(rnd() * 6) | 0], key: [Math.floor(rnd() * 16000), Math.floor(rnd() * 40), Math.floor(rnd() * 16000)], dist: DISTS[(rnd() * DISTS.length) | 0], role: ROLES[(rnd() * 7) | 0], p: 1 }); if (d && d.clue) list.push(d.clue); }
      if (rnd() < 0.5) for (let l = 1; l <= 1 + Math.floor(rnd() * 4); l++) list.push(...N.paperwork(sd, needle, l).clues);
      const t0 = performance.now(); const s = N.summarize(list); ms += performance.now() - t0; runs++;
      if (s.conflict) { bad.push(`seed ${seed}: the summary says the clues disagree`); continue; }
      const bear = N.bearingOf(truth.x, truth.z), dist = Math.hypot(truth.x, truth.z);
      if (s.bearing) { const off = ((bear - s.bearing.lo) % 360 + 360) % 360; if (off > s.bearing.w + 1e-6) bad.push(`seed ${seed}: bearing ${bear.toFixed(2)} outside ${s.bearing.lo.toFixed(2)} + ${s.bearing.w.toFixed(2)}`); }
      if (s.dist && (dist < s.dist.lo - 1e-6 || dist > s.dist.hi + 1e-6)) bad.push(`seed ${seed}: distance ${dist.toFixed(0)} outside ${s.dist.lo.toFixed(0)} to ${s.dist.hi.toFixed(0)}`);
      if (s.height && (truth.y < s.height.lo - 1e-6 || truth.y > s.height.hi + 1e-6)) bad.push(`seed ${seed}: height outside`);
      // the sample cloud reaches the needle's neighbourhood
      if (s.pts.length && Math.min(...s.pts.map(([x, z]) => Math.hypot(x - truth.x, z - truth.z))) > 400) bad.push(`seed ${seed}: the cloud is far from the needle`);
      if (s.bearing && s.bearing.w < 360) tight++;
    }
    if (tight < 150) bad.push(`only ${tight} of 200 summaries had a bearing at all`);
    if (ms / runs > 250) bad.push(`a summary takes ${(ms / runs).toFixed(0)} ms`);
    return bad.length === 0 || `${bad.length} problems: ${bad.slice(0, 4).join(' | ')}`;
  });

  await T('notes.clues.one-clue-alone-gives-its-own-range-and-no-more', async () => {
    const bad = [], one = (c) => N.summarize([c]);
    // a bearing wedge: the range is the wedge (a grid step wider at most), and says nothing about how far
    for (const [lo, w] of [[15, 15], [0, 90], [300, 120], [345, 15]]) {
      const s = one({ t: 'b', lo, w }); if (!s.bearing) { bad.push(`wedge ${lo}+${w}: no bearing`); continue; }
      const off = ((lo - s.bearing.lo) % 360 + 360) % 360, within = (off > 359 ? off - 360 : off);
      if (!(within >= -0.01 && within <= 1.01) || s.bearing.w < w - 0.01 || s.bearing.w > w + 2.1) bad.push(`wedge ${lo}+${w}: ${s.bearing.lo.toFixed(2)} + ${s.bearing.w.toFixed(2)}`);
      if (s.dist && s.dist.lo > 30) bad.push(`wedge ${lo}+${w}: invented a nearest distance ${s.dist.lo}`);
    }
    // a ring around the bay: the band, and no bearing it cannot give (the hall is a square, so a ring of 2 km allows every bearing)
    const r = one({ t: 'd', lo: 2400, hi: 3600 }); if (!r.dist || r.dist.lo > 2400 || r.dist.lo < 2340 || r.dist.hi < 3600 || r.dist.hi > 3660) bad.push('ring ' + JSON.stringify(r.dist)); if (r.bearing) bad.push('a 2 km ring gave a bearing ' + JSON.stringify(r.bearing));
    // a ring past the walls cannot reach the east: part of the compass is ruled out, honestly
    const far = one({ t: 'd', lo: 6000, hi: 6200 }); if (!far.bearing || far.bearing.w > 330 || far.bearing.w < 200) bad.push('a 6 km ring: ' + JSON.stringify(far.bearing));
    const h = one({ t: 'h', lo: 10, hi: 12.5 }); if (!h.height || h.height.lo !== 10 || h.height.hi !== 12.5 || h.bearing || h.dist) bad.push('height ' + JSON.stringify(h));
    const q = one({ t: 'q', x0: 4000, z0: -4400, s: 200 }); if (!q.bearing || q.bearing.w > 6 || !q.dist || q.dist.hi - q.dist.lo > 420) bad.push('square ' + JSON.stringify([q.bearing, q.dist]));
    const none = N.summarize([]); if (none.n || none.bearing || none.dist || none.height || none.conflict) bad.push('no clues said something');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('notes.clues.more-clues-never-widen-the-picture', async () => {
    const bad = [];
    for (const seed of SEEDS.slice(0, 40)) {
      const { needle, seed: sd } = needleOf(seed);
      const rnd = (() => { let s = seed + 99; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
      const list = []; let pb = 360, pd = 1e9, ph = 1e9;
      for (let q = 0; q < 14; q++) {
        const d = N.makeDoc(sd, needle, { source: 'contract', key: [q + seed, 1, 2], dist: DISTS[(rnd() * 9) | 0], p: 1 }); if (!d || !d.clue) continue;
        list.push(d.clue); const s = N.summarize(list);
        const b = s.bearing ? s.bearing.w : 360, dd = s.dist ? s.dist.hi - s.dist.lo : 1e9, hh = s.height ? s.height.hi - s.height.lo : 1e9;
        if (b > pb + 0.6 || dd > pd + 60 || hh > ph + 1e-6) bad.push(`seed ${seed} step ${q}: ${pb.toFixed(1)} to ${b.toFixed(1)}, ${pd | 0} to ${dd | 0}`);
        pb = Math.min(pb, b); pd = Math.min(pd, dd); ph = Math.min(ph, hh);
      }
    }
    return bad.length === 0 || bad.slice(0, 3).join(' | ');
  });

  await T('notes.clues.a-forged-paper-is-refused', async () => {
    const { needle, seed } = needleOf(99);
    const good = N.makeDoc(seed, needle, { source: 'cache', key: [1, 2, 3], dist: 3000, kind: 'ledger', p: 1 });
    const goodClue = { t: 'd', lo: 6000, hi: 6200 };
    const bad = [];
    const refuse = (what, d) => { if (N.cleanDoc(d)) bad.push('accepted ' + what); };
    refuse('a null', null); refuse('a string', 'x'); refuse('an unknown kind', { ...good, kind: 'treasure' }); refuse('the worker kind', { ...good, kind: 'worker' }); refuse('a bad id', { ...good, id: '<script>' });
    refuse('no text', { ...good, text: '' });
    for (const [what, c] of [['a clue narrower than the lattice', { t: 'd', lo: 6000, hi: 6010 }], ['an off-lattice start', { t: 'd', lo: 6001, hi: 6201 }], ['a NaN', { t: 'd', lo: NaN, hi: 6200 }], ['an infinite range', { t: 'd', lo: 0, hi: Infinity }],
      ['a point', { t: 'q', x0: 4000, z0: 4000, s: 1 }], ['a 1 degree bearing', { t: 'b', lo: 45, w: 1 }], ['a bearing off the 15 degree lattice', { t: 'b', lo: 47, w: 15 }], ['an unknown type', { t: 'z', lo: 0, hi: 1 }], ['a 0.1 m height', { t: 'h', lo: 10, hi: 10.1 }],
      ['a wall that is not a wall', { t: 'w', s: 'Q', lo: 0, hi: 200 }], ['a free clue that is a point', { t: 'b', lo: 10, w: 0.2, f: 1 }], ['a free distance of 1 m', { t: 'd', lo: 6000, hi: 6001, f: 1 }]]) refuse(what, { ...good, clue: c });
    // the clue field of a real paper survives; markup in the text does not
    const ok = N.cleanDoc({ ...good, clue: goodClue, text: 'Hello <img src=x onerror=alert(1)> there' });
    if (!ok || /[<>]/.test(ok.text)) bad.push('markup stayed in the text: ' + (ok && ok.text));
    if (!ok || ok.clue.lo !== 6000) bad.push('a real clue was refused');
    const long = N.cleanDoc({ ...good, text: 'x'.repeat(5000) }); if (!long || long.text.length > 600) bad.push('a long text was not cut');
    N.cleanDoc(JSON.parse('{"id":"re:1.2.3","kind":"memo","text":"a","__proto__":{"polluted":1},"clue":{"t":"d","lo":6000,"hi":6200,"__proto__":{"x":1}}}')); if (({}).polluted) bad.push('prototype pollution');
    // the false clue that is on the lattice passes the shape check; the guest checks it against the needle (clueHolds)
    const wrong = N.cleanDoc({ ...good, clue: { t: 'd', lo: 200, hi: 400 } }); if (!wrong) bad.push('shape check refused a well formed clue'); else if (N.clueHolds(wrong.clue, N.truthOf(needle))) bad.push('a false clue held');
    return bad.length === 0 || bad.join(' | ');
  });

  await T('notes.clues.the-old-beacon-paperwork-no-longer-prints-the-exact-spot', async () => {
    const bad = [];
    for (const seed of SEEDS.slice(0, 60)) {
      const { needle, truth, seed: sd } = needleOf(seed);
      const t4 = N.paperwork(sd, needle, 4), m = /E (-?\d+), S (-?\d+) \(give or take (\d+) m\)/.exec(t4.text);
      if (!m) { bad.push('level 4 text changed shape: ' + t4.text); continue; }
      const ex = +m[1], ez = +m[2], r = +m[3];
      if (Math.abs(ex - truth.x) > r || Math.abs(ez - truth.z) > r) bad.push(`seed ${seed}: the text is wrong by more than it says`);
      if (Math.abs(ex - truth.x) < 0.5 && Math.abs(ez - truth.z) < 0.5) bad.push(`seed ${seed}: prints the exact spot`);
      for (let l = 1; l <= 3; l++) { const p = N.paperwork(sd, needle, l); if (!/^(Row ledger|Forklift log|Shift memo)/.test(p.text) || N.paperworkLevel(p.text) !== l) bad.push('level ' + l + ' wording'); }
    }
    let exact = 0; for (const seed of SEEDS.slice(0, 200)) { const { needle, truth, seed: sd } = needleOf(seed); const m = /E (-?\d+), S (-?\d+)/.exec(N.paperwork(sd, needle, 4).text); if (m && Math.abs(+m[1] - truth.x) < 1 && Math.abs(+m[2] - truth.z) < 1) exact++; }
    if (exact > 1) bad.push(`${exact} of 200 print the spot to the metre`);
    return bad.length === 0 || bad.slice(0, 3).join(' | ');
  });

  await T('notes.clues.texts-are-clean-english-with-no-dashes-or-holes', async () => {
    const { needle, seed } = needleOf(2024); const bad = new Set();
    for (let q = 0; q < 4000; q++) {
      const d = N.makeDoc(seed, needle, { source: SOURCES[q % 6], key: [q, q % 5, q * 3], dist: DISTS[q % 9], role: ROLES[q % 7], p: 1 });
      const all = d.text + (d.cipher || '') + (d.clue ? N.clueLine(d.clue) : '');
      if (/[\u2014\u2013]|undefined|NaN|null|\[object|\bInfinity\b/.test(all)) bad.add(all.slice(0, 80));
      if (d.kind === 'coded' && N.caesar(d.cipher, -d.key) !== d.text) bad.add('cipher does not decode: ' + d.id);
      if (d.cipher === d.text) bad.add('cipher is the plain text');
    }
    return bad.size === 0 || [...bad].slice(0, 3).join(' | ');
  });
}
