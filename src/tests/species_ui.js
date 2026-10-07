// The Plushdex with 6,000+ entries: a virtual grid that opens fast, search, rarity, region, pattern and found/missing filters, counts per region.
import * as pd from '../plushdata.js';
import * as DX from '../dexui.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => document.getElementById(id);

export default async function (ctx) {
  const { T, g, S, fresh } = ctx;
  const { species, speciesCount, REGIONS, regionTotals } = pd;
  const reset = () => { DX.dexState.q = ''; DX.dexState.rarity = -1; DX.dexState.region = -1; DX.dexState.pat = -1; DX.dexState.show = 'all'; if ($('dexSearch')) $('dexSearch').value = ''; if ($('dexRarity')) $('dexRarity').value = '-1'; if ($('dexPat')) $('dexPat').value = '-1'; };
  const everyThird = () => { const d = {}; for (let id = 1; id <= speciesCount; id++) if (id % 3 === 0) d[id] = 1 + (id % 9); return d; };
  const cards = () => [...document.querySelectorAll('#dexGrid .dx')];
  const done = () => { g.ui.closeModals(); reset(); S().dex = {}; };

  await T('species.plushdex-opens-fast-with-the-whole-dex-found', async () => {
    fresh({}); const full = {}; for (let id = 1; id <= speciesCount; id++) full[id] = 1 + (id % 40); S().dex = full; reset();
    g.ui.open('dex'); await wait(80); g.ui.closeModals();   // the first open builds the two orders and the picture context
    const times = []; for (let k = 0; k < 3; k++) { const t0 = performance.now(); g.ui.open('dex'); times.push(performance.now() - t0); await wait(60); g.ui.closeModals(); }
    g.ui.open('dex'); await wait(80);
    const n = cards().length, count = $('dexCount').textContent, total = $('dexTotal').textContent, shown = DX.dexState.list.length; done();
    const best = Math.min(...times);
    if (best > 90) return 'opening the Plushdex took ' + times.map((t) => t.toFixed(0)).join('/') + ' ms';
    if (n < 8 || n > 400) return n + ' cards in the DOM (the grid should be virtual)';
    if (count !== String(speciesCount) || total !== String(speciesCount)) return `header ${count} / ${total}`;
    return shown === speciesCount + pd.DECOYS.length || 'listed ' + shown;
  });

  await T('species.plushdex-scroll-draws-the-cards-in-view-and-reaches-the-end', async () => {
    fresh({}); S().dex = everyThird(); reset(); g.ui.open('dex'); await wait(80);
    const grid = $('dexGrid'), first = cards()[0].textContent; const rows = Math.ceil(DX.dexState.list.length / DX.dexState.cols);
    if (grid.scrollHeight < rows * DX.ROW_H * 0.9) { done(); return `scroll height ${grid.scrollHeight} for ${rows} rows`; }
    grid.scrollTop = grid.scrollHeight * 0.5; grid.dispatchEvent(new Event('scroll')); await wait(120);
    const mid = cards(); const midFirst = mid[0] && mid[0].textContent;
    grid.scrollTop = grid.scrollHeight; grid.dispatchEvent(new Event('scroll')); await wait(120);
    const end = cards(); const lastId = DX.dexState.list[DX.dexState.list.length - 1]; const endText = end.map((c) => c.getAttribute('title') || '').join('|') + end.map((c) => c.textContent).join('|');
    const imgs = end.filter((c) => c.querySelector('img') && c.querySelector('img').dataset.id == lastId).length;
    done();
    if (!mid.length || midFirst === first) return 'the middle of the list shows the same cards as the top';
    if (end.length > 400) return end.length + ' cards drawn at the end';
    return imgs === 1 || `the last species (${species[lastId].name}) is not drawn at the end of the list: ${endText.length}`;
  });

  await T('species.plushdex-search-finds-only-what-you-have-found', async () => {
    fresh({}); const dex = everyThird(); S().dex = dex; reset(); g.ui.open('dex'); await wait(60);
    const hid = species.findIndex((s, id) => id > 0 && s && !dex[id] && /Gatto/.test(s.name)), seenId = species.findIndex((s, id) => id > 0 && s && dex[id] && /Gatto/.test(s.name));
    $('dexSearch').value = 'gatto'; $('dexSearch').dispatchEvent(new Event('input')); await wait(220);
    const list = DX.dexState.list; const bad = [];
    if (!list.length) bad.push('no Gatto found'); if (list.some((id) => !dex[id])) bad.push('a species you have not found matched a search');
    if (list.some((id) => !/gatto/i.test(species[id].name))) bad.push('a result without Gatto in its name'); if (!list.includes(seenId)) bad.push('a found Gatto is missing');
    if (list.includes(hid)) bad.push('an unfound Gatto matched');
    const t0 = performance.now(); const two = DX.filterList(dex, { q: 'bicolore gatto', rarity: -1, region: -1, pat: -1, show: 'all' }); const ms = performance.now() - t0;
    if (two.some((id) => species[id].pat !== 3 || !dex[id])) bad.push('two words did not narrow the search'); if (ms > 40) bad.push('a search took ' + ms.toFixed(0) + ' ms');
    // the exact name of something you have not found leaks nothing
    $('dexSearch').value = species[hid].name.toLowerCase(); $('dexSearch').dispatchEvent(new Event('input')); await wait(220); if (DX.dexState.list.length) bad.push('the name of an unfound species found it'); const msg = $('dexShown').textContent;
    $('dexSearch').value = ''; $('dexSearch').dispatchEvent(new Event('input')); await wait(220); if (DX.dexState.list.length < speciesCount) bad.push('clearing the search did not bring the list back');
    done(); return (bad.length === 0 && /only finds what you have discovered/.test(msg)) || bad.join('; ') + ' | ' + msg;
  });

  await T('species.plushdex-filters-rarity-region-pattern-and-found-missing', async () => {
    fresh({}); const dex = everyThird(); S().dex = dex; reset(); g.ui.open('dex'); await wait(60); const bad = [];
    const F = (o) => DX.filterList(dex, { q: '', rarity: -1, region: -1, pat: -1, show: 'all', ...o });
    const found = F({ show: 'found' }), missing = F({ show: 'missing' }), all = F({});
    if (found.some((id) => !dex[id]) || missing.some((id) => dex[id])) bad.push('found/missing leak');
    if (all.length !== speciesCount + pd.DECOYS.length) bad.push('all lists ' + all.length);
    if (found.length + missing.length !== all.length) bad.push(`found ${found.length} + missing ${missing.length} != all ${all.length}`);
    for (let r = 0; r <= 5; r++) { const l = F({ rarity: r }); if (!l.length || l.some((id) => species[id].rarity !== r)) bad.push('rarity ' + r); }
    for (let r = 0; r < 6; r++) { const l = F({ region: r, show: 'all' }); if (l.some((id) => species[id].lo !== r)) bad.push('region ' + r); const exp = regionTotals[r] + (r === 0 ? pd.DECOYS.length : 0); if (l.length !== exp) bad.push(`region ${r} lists ${l.length} of ${exp}`); }
    for (let pt = 0; pt < 4; pt++) { const l = F({ pat: pt }); if (!l.length || l.some((id) => (species[id].pat || 0) !== pt)) bad.push('pattern ' + pt); }
    const m = F({ show: 'missing', region: 5, rarity: 3 }); if (m.some((id) => dex[id] || species[id].lo !== 5 || species[id].rarity !== 3)) bad.push('combined filter');
    // the missing ones read nearest region first
    for (let q = 1; q < missing.length; q++) if (species[missing[q]].lo < species[missing[q - 1]].lo) { bad.push('missing species are not ordered by region'); break; }
    // and through the buttons
    document.querySelector('#dexShow [data-show="missing"]').click(); await wait(40); const nMiss = DX.dexState.list.length; document.querySelector('#dexRegions [data-r="5"]').click(); await wait(40); const n5 = DX.dexState.list.length;
    $('dexRarity').value = '4'; $('dexRarity').dispatchEvent(new Event('change')); await wait(40); const n54 = DX.dexState.list.length;
    document.querySelector('#dexShow [data-show="all"]').click(); await wait(20); document.querySelector('#dexRegions [data-r="-1"]').click(); $('dexRarity').value = '-1'; $('dexRarity').dispatchEvent(new Event('change')); await wait(40);
    if (!(nMiss === missing.length && n5 < nMiss && n54 < n5 && n54 > 0)) bad.push(`buttons: ${nMiss} ${n5} ${n54}`);
    if (DX.dexState.list.length !== all.length) bad.push('reset did not show everything');
    done(); return bad.length === 0 || bad.slice(0, 5).join('; ');
  });

  await T('species.plushdex-shows-found-and-total-per-region', async () => {
    fresh({}); const dex = everyThird(); S().dex = dex; reset(); g.ui.open('dex'); await wait(60);
    const t = pd.dexTally(dex, true); const chips = [...document.querySelectorAll('#dexRegions button')]; const bad = [];
    if (chips.length !== REGIONS.length + 1) bad.push(chips.length + ' region buttons');
    REGIONS.forEach((r, i) => { const txt = chips[i + 1] ? chips[i + 1].textContent.replace(/,/g, '') : ''; if (!txt.includes(r.name) || !txt.includes(`${t.byRegion[r.id]}/${regionTotals[r.id]}`)) bad.push(`chip ${r.name}: "${txt}"`); });
    if (t.byRegion.reduce((a, b) => a + b, 0) !== t.n || regionTotals.reduce((a, b) => a + b, 0) !== speciesCount) bad.push('region counts do not add up');
    if (!chips[0].textContent.replace(/,/g, '').includes(`${t.n}/${speciesCount}`)) bad.push('all chip ' + chips[0].textContent);
    done(); return bad.length === 0 || bad.join('; ');
  });

  await T('species.plushdex-unfound-cards-hide-the-name-but-name-their-region', async () => {
    fresh({}); S().dex = { 5: 3, 6: 1 }; reset(); g.ui.open('dex'); await wait(60);
    const known = cards().filter((c) => !c.classList.contains('unk')), unk = cards().filter((c) => c.classList.contains('unk')); const bad = [];
    if (known.length !== 2 || !known.some((k) => /×3/.test(k.textContent))) bad.push('known tiles ' + known.length);
    if (!unk.length || unk.some((c) => !/\?\?\?/.test(c.textContent) || /[a-z]{4,} [A-Z]/.test(c.querySelector('.n').textContent))) bad.push('an unfound card shows a name');
    if (unk.some((c) => !/Bay Floor|The Stacks|Midden Hills|Deep Pile|Far Reaches|Exit Road/.test(c.textContent))) bad.push('an unfound card does not say where it lives');
    const imgs = [...document.querySelectorAll('#dexGrid img')]; await wait(900); if (imgs.length && imgs.some((i) => !i.src)) bad.push('pictures not drawn');
    if ($('dexCount').textContent !== '2') bad.push('count ' + $('dexCount').textContent);
    done(); return bad.length === 0 || bad.join('; ');
  });
}
