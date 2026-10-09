// audit_notes.perf.*: the audit of the notes expansion (timings and the journal under a full load of paper). The budgets are generous on purpose (this suite runs on a busy
// machine); they catch a journal or a summary that turns into a stall, not a few milliseconds. Run: `await __selftest('audit_notes.perf.')`
import * as NB from '../notebook.js';
import * as N from '../notes.js';

export default async function (ctx) {
  const { T, g, S, w, fresh } = ctx;
  const $ = (id) => document.getElementById(id);
  const reset = () => {
    fresh({}); const s = S(); s.notes = []; s.papers = []; s.heard = []; s.nflags = []; s.clues = []; s.clueLevel = 0; s.ach = {}; s.stats.piece5 = 0;
    g.ui.jtab = 'finds'; g.ui.jfilter = 'all'; g.ui.closeModalsSilently(); g.ui.openModal = null; g._nfLive = null;
  };
  const KINDS = ['shelving', 'memo', 'map', 'manifest', 'ledger', 'photo', 'coded'];
  const fill = (n, offset = 0) => {
    const out = []; let q = offset;
    while (out.length < n && q < offset + n * 40) {
      q++;
      const d = N.makeDoc(S().seed, w().needle, { source: 'cache', key: [q * 7 + 1, 0, q * 13 + 5], dist: 300 + (q * 211) % 6200, p: 1, kind: KINDS[q % 7] });
      const c = d && N.cleanDoc(d); if (c) out.push({ ...c, n: out.length + 1 });
    }
    return out;
  };

  await T('audit_notes.perf.pieces-together-400-papers-without-a-stall-and-the-repeat-is-free', async () => {
    reset(); S().papers = fill(400);
    const n = S().papers.filter((d) => d.clue).length;
    const t0 = performance.now(); const s1 = NB.summary(g); const first = performance.now() - t0;
    const t1 = performance.now(); NB.summary(g); const again = performance.now() - t1;
    if (n < 100) return `only ${n} of 400 papers carry a clue`;
    if (s1.conflict) return 'the summary of true clues conflicts';
    if (first > 1500) return `the first summary took ${Math.round(first)} ms`;
    return again < 40 || `the repeat summary took ${Math.round(again)} ms (it is memoized)`;
  });

  await T('audit_notes.perf.reading-a-note-one-more-time-stays-quick-with-a-full-journal', async () => {
    reset(); S().papers = fill(399);
    const extra = fill(1, 5000)[0], e = NB.entryOf(extra, 'A note');
    const t0 = performance.now(); NB.receive(g, e, false); const dt = performance.now() - t0;
    return dt < 1500 || `receiving one more note took ${Math.round(dt)} ms with 399 already read`;
  });

  await T('audit_notes.perf.the-notes-tab-draws-400-papers-in-a-moment-and-keeps-its-filters', async () => {
    reset(); S().papers = fill(400); g.ui.jtab = 'notes';
    const t0 = performance.now(); g.openModal('journal'); const dt = performance.now() - t0;
    const root = $('journalNotes');
    if (!root || root.classList.contains('hidden')) return 'the Notes tab is not showing';
    const cards = root.querySelectorAll('.ncard').length;
    if (cards < 300) return `${cards} cards for 400 papers`;
    const chip = root.querySelector('[data-nf=coded]'); if (!chip) return 'no filter chip for coded messages';
    chip.click();
    const coded = $('journalNotes').querySelectorAll('.ncard').length, want = S().papers.filter((d) => d.kind === 'coded').length;
    g.ui.closeModalsSilently(); g.ui.openModal = null; g.ui.jtab = 'finds'; g.ui.jfilter = 'all';
    if (coded !== want) return `the coded filter shows ${coded} cards, there are ${want}`;
    return dt < 3000 || `opening the Notes tab took ${Math.round(dt)} ms`;
  });

  await T('audit_notes.perf.a-bot-scan-and-the-compass-marks-are-cheap-with-the-maximum-flags', async () => {
    reset(); const arr = [];
    const t0 = performance.now(); for (let q = 0; q < 200; q++) arr.push(NB.specialsNear(w(), 3000 + q, 2000 + q, 7)); const dt = performance.now() - t0;
    return dt < 2500 || `200 scans of 7 m took ${Math.round(dt)} ms`;
  });
}
