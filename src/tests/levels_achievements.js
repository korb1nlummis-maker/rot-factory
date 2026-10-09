// Levels audit: Achievements. Every achievement added after the original set is reachable, unlocks exactly at its number, is described
// with that number, shows up in the achievements screen with the right count, and comes through the real unlock path.
import { ACHIEVEMENTS, ACH_TABLE, MAXED, MASTERS } from '../achievements.js';
import { UPGRADES, CATS } from '../upgrades.js';

export default async function (ctx) {
  const { T, g, S, fresh } = ctx;
  const OLD = ACHIEVEMENTS.findIndex((a) => a.id === 'speed') + 1;          // the original set ends with the speedrun achievement
  const NEW = ACHIEVEMENTS.slice(OLD);
  // a bare player state: the checks only read these fields
  const bare = () => ({ stats: { rar: [0, 0, 0, 0, 0, 0, 0] }, totalEarned: 0, gameMin: 0, crew: [], entities: [], up: {}, dex: {}, gear: {}, mats: {}, ending: null, ach: {} });
  const fmtN = (n) => n.toLocaleString('en-US');

  await T('levels.achievements.the-catalog-is-sound-and-the-screen-counts-it', async () => {
    const bad = []; const ids = new Set();
    for (const a of ACHIEVEMENTS) {
      if (ids.has(a.id)) bad.push('duplicate id ' + a.id); ids.add(a.id);
      if (!a.name || !a.desc || typeof a.check !== 'function' || !a.icon) bad.push(a.id + ' has a missing field');
      if (/[—–]|undefined|NaN|\{n\}|\[object/.test(a.name + a.desc)) bad.push(a.id + ' has bad text: ' + a.desc);
    }
    if (OLD < 100 || NEW.length < 150) bad.push(`${OLD} original and ${NEW.length} added`);
    const names = new Map(); for (const a of NEW) { if (names.has(a.name)) bad.push(`name "${a.name}" used by ${names.get(a.name)} and ${a.id}`); names.set(a.name, a.id); }
    fresh({}); S().ach = {}; g.ui.renderAch(); const total = document.getElementById('achTotal').textContent, cards = document.querySelectorAll('#achGrid .ac:not([data-care])').length;
    if (+total !== ACHIEVEMENTS.length || cards !== ACHIEVEMENTS.length) bad.push(`screen shows ${cards} cards and says ${total}, the catalog has ${ACHIEVEMENTS.length}`);
    return bad.length === 0 || bad.slice(0, 6).join('; ');
  });

  await T('levels.achievements.every-added-achievement-has-a-way-to-earn-it-in-this-table', async () => {
    const covered = new Set([...ACH_TABLE.map((r) => r.id), ...MAXED.map((m) => m.id), ...MASTERS.map((m) => m.id), 'upall']); const miss = NEW.filter((a) => !covered.has(a.id)).map((a) => a.id);
    const extra = [...covered].filter((id) => !ACHIEVEMENTS.some((a) => a.id === id));
    return (miss.length === 0 && extra.length === 0) || `no way listed to earn ${miss.join()}; table names unknown ${extra.join()}`;
  });

  await T('levels.achievements.each-counter-tier-unlocks-exactly-at-its-number-and-says-so', async () => {
    const bad = [];
    for (const row of ACH_TABLE) {
      const a = ACHIEVEMENTS.find((x) => x.id === row.id); if (!a) { bad.push('unknown ' + row.id); continue; }
      const set = (S2, v) => { if (row.kind === 'stat') S2.stats[row.key] = v; else if (row.kind === 'rar') S2.stats.rar[row.tier] = v; else row.set(S2, v); };
      const below = bare(); set(below, row.n - 1); if (a.check(below)) bad.push(`${row.id} unlocked at ${row.n - 1}`);
      const at = bare(); set(at, row.n); if (!a.check(at)) bad.push(`${row.id} not unlocked at ${row.n}`);
      const over = bare(); set(over, row.n * 10); if (!a.check(over)) bad.push(`${row.id} lost at ${row.n * 10}`);
      if (a.check(bare())) bad.push(`${row.id} is unlocked from nothing`);
      if (row.n >= 10 && !a.desc.includes(fmtN(row.n)) && !(row.id === 'dig10k' || row.id === 'dig100k' || row.id === 'dig1m')) bad.push(`${row.id} does not say ${fmtN(row.n)}: ${a.desc}`);
    }
    // the tiers of one counter climb in order
    const by = new Map(); for (const row of ACH_TABLE) { const k = row.kind + ':' + (row.key || row.tier || row.id.replace(/\d.*$/, '')); if (!by.has(k)) by.set(k, []); by.get(k).push(row); }
    for (const [k, rows] of by) if (k.startsWith('stat:') || k.startsWith('rar:')) for (let q = 1; q < rows.length; q++) if (!(rows[q].n > rows[q - 1].n)) bad.push(`${k}: ${rows[q].id} (${rows[q].n}) is not above ${rows[q - 1].id}`);
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('levels.achievements.tiers-of-10-100-1000-and-up-exist-for-the-things-you-do-all-game', async () => {
    const need = { plush: 4, sold: 7, thrown: 4, walked: 3, props: 4, collapses: 3, built: 4, earthDug: 7, hauled: 6, hauls: 5, upgrades: 4, shiny: 3, contracts: 3, scans: 3, blasts: 3 };
    const bad = []; for (const [key, n] of Object.entries(need)) { const have = ACH_TABLE.filter((r) => r.key === key).length; if (have < n) bad.push(`${key}: ${have} added tiers, expected ${n}`); }
    return bad.length === 0 || bad.join('; ');
  });

  await T('levels.achievements.every-new-upgrade-line-and-every-category-has-a-top-level-achievement', async () => {
    const bad = []; const fresh_ = UPGRADES.filter((u) => u.fresh);
    if (MAXED.length !== fresh_.length) bad.push(`${MAXED.length} maxed achievements for ${fresh_.length} added lines`);
    for (const m of MAXED) {
      const a = ACHIEVEMENTS.find((x) => x.id === m.id), u = UPGRADES.find((x) => x.id === m.upgrade); if (!a || !u) { bad.push('missing ' + m.id); continue; }
      const s0 = bare(); if (a.check(s0)) bad.push(m.id + ' from nothing'); if (u.max > 1) { s0.up[u.id] = u.max - 1; if (a.check(s0)) bad.push(m.id + ' one level short'); } s0.up[u.id] = u.max; if (!a.check(s0)) bad.push(m.id + ' at the top');
      if (!a.desc.includes(u.name)) bad.push(m.id + ' does not name ' + u.name);
    }
    for (const m of MASTERS) {
      const a = ACHIEVEMENTS.find((x) => x.id === m.id); const list = UPGRADES.filter((u) => u.cat === m.cat); const s0 = bare();
      for (const u of list) s0.up[u.id] = u.max; if (!a.check(s0)) bad.push(m.id + ' with the whole category at the top'); const last = list[list.length - 1]; s0.up[last.id] = last.max - 1; if (a.check(s0)) bad.push(m.id + ' with one line short');
    }
    if (MASTERS.length !== CATS.filter((c) => !c.special).length) bad.push('a master for every category: ' + MASTERS.length);
    const all = bare(); for (const u of UPGRADES) all.up[u.id] = u.max; const up = ACHIEVEMENTS.find((a) => a.id === 'upall'); if (!up.check(all)) bad.push('upall with everything'); all.up.truck = 0; if (up.check(all)) bad.push('upall without the truck');
    // the level-count tiers can all be reached by buying every level there is
    const levels = UPGRADES.reduce((a, u) => a + u.max, 0); const top = Math.max(...ACH_TABLE.filter((r) => r.key === 'upgrades').map((r) => r.n)); if (top > levels) bad.push(`'buy ${top} upgrade levels' but the whole tree is ${levels}`);
    return bad.length === 0 || bad.slice(0, 8).join('; ');
  });

  await T('levels.achievements.the-game-loop-unlocks-toasts-and-saves-them', async () => {
    fresh({}); S().ach = {}; const ids = ['sold10', 'ed10', 'trip1', 'press1', 'exc1']; const set = { sold10: () => { S().stats.sold = 10; }, ed10: () => { S().stats.earthDug = 10; }, trip1: () => { S().stats.hauls = 1; }, press1: () => { S().stats.earthPress = 1; }, exc1: () => { S().stats.excavators = 1; } };
    for (const id of ids) { S().stats.sold = 0; S().stats.earthDug = 0; S().stats.hauls = 0; S().stats.earthPress = 0; S().stats.excavators = 0; set[id](); const before = Object.keys(S().ach).length; g.checkAchievements(); if (!S().ach[id]) return id + ' did not unlock through checkAchievements'; if (Object.keys(S().ach).length < before + 1) return 'not counted'; }
    // the screen counts the earned ones and marks them done
    g.ui.renderAch(); const done = document.querySelectorAll('#achGrid .ac.done').length, shown = +document.getElementById('achCount').textContent; if (done !== Object.keys(S().ach).length || shown !== done) return `screen: ${done} done, header ${shown}, earned ${Object.keys(S().ach).length}`;
    // a secret one stays hidden until earned
    const sec = ACHIEVEMENTS.filter((a) => a.secret); if (!sec.length) return 'no secret achievements left';
    S().noSaveFlag = undefined; g.noSave = false; g.save(); g.noSave = true; const raw = JSON.parse(localStorage.getItem('rotfactory.save.v1')).S; return (raw.ach.sold10 && raw.ach.exc1) || 'the unlocks were not saved';
  });
}
