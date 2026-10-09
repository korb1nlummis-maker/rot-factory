// What a grid says about itself on a generator, a pole, a battery or a breaker: how many generators are wired together, the supply, the demand and each
// generator's share. Reads only g.power.nets (the solver on the host, the 0.5 s row on a guest) and the shared cable list, so both screens say the same.
import { genKindOf, kwText, maxPorts } from './powerparts.js';

const f1 = (v) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : (+v).toFixed(1));
const kw = (v) => (v >= 1000 ? kwText(v) : `${f1(v)} kW`);
const pct = (v) => `${Math.round((v ?? 0) * 100)}%`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// the grid a node stands in (null before the first solve)
export const gridOfNode = (g, e) => { const P = g.power; if (!P || !P.nets) return null; for (const n of P.nets) if (n.nodes.includes(e)) return n; return null; };

// why a grid has no power, in a few words ('' when it has some)
export function deadReason(net) {
  if (!net) return 'no grid yet';
  if (net.tripped) return 'the grid is tripped (press E on its Breaker Box)';
  if (net.supply > 0.0005) return '';
  const gens = net.gens || [];
  if (!gens.length) return net.batts && net.batts.length ? 'its storage is flat and no generator is wired in' : 'no generator is wired to it: run a cable from a generator';
  return gens.length === 1 ? 'its generator is out of fuel' : 'every generator wired to it is out of fuel';
}
export const isLive = (net) => !!net && !net.tripped && net.supply > 0.0005;

// the lines every node readout shares: the grid in one line, and what each generator contributes
export function gridLines(g, e) {
  const net = gridOfNode(g, e); if (!net) return [];
  const gens = net.gens || [], n = gens.length, out = [];
  const sat = net.sat ?? 1;
  out.push(`Grid: ${n ? plural(n, 'generator') + (n > 1 ? ' wired together' : '') : 'no generator'}, ${kw(net.supply)} supplied, ${kw(net.demand)} wanted${net.supply > 0 && sat < 0.99 ? ` (brownout, ${pct(sat)})` : ''}`);
  const why = deadReason(net); if (why) out.push(`No power: ${why}`);
  if (e.type === 'gen') {
    const me = gens.find((q) => q.e === e), total = net.gen || 0;
    if (me) out.push(n > 1 ? `This generator puts out ${kw(me.out)} of the grid's ${kw(total)} (${total > 0 ? pct(me.out / total) : '0%'}) and carries ${kw(me.carry)} of the load` : `Carries ${kw(me.carry)} of the ${kw(net.demand)} the grid wants`);
    if (n > 1) { const others = gens.filter((q) => q !== me).slice(0, 5).map((q) => `${genKindOf(q.e).short} ${kw(q.out)}`); out.push(`Wired with: ${others.join(', ')}${n - 1 > others.length ? ` and ${n - 1 - others.length} more` : ''}`); }
  } else if (n > 0) {
    const list = gens.slice(0, 6).map((q) => `${genKindOf(q.e).short} ${kw(q.out)} (carrying ${kw(q.carry)})`);
    out.push(`Generators: ${list.join(', ')}${n > list.length ? ` and ${n - list.length} more` : ''}`);
  }
  return out;
}

// the readout of a Power Pole: a hub with no power of its own, lit only while its grid has supply
export function poleInfo(g, t, T) {
  const net = gridOfNode(g, t), live = isLive(net), used = g.cables ? g.cables.of(t.id).length : 0, lim = maxPorts(t, g);
  const lines = [];
  if (!used) lines.push('Not wired: a pole is only a hub. Run a cable from a generator to it (cables are the only way power travels).');
  else if (!live) lines.push(`DEAD: ${deadReason(net) || 'no power'}`);
  else lines.push(`LIVE: ${kw(net.supply)} on this grid. Run more wire from this pole to machines or to other poles.`);
  for (const l of gridLines(g, t)) if (!/^No power:/.test(l)) lines.push(l);
  lines.push(`Sockets ${used} of ${lim} used · a cable reaches ${((T && T.cableLen) || 14).toFixed(0)} m · a machine needs its own cable (a belt line needs one)`);
  return { title: 'POWER POLE' + (live ? ' · LIVE' : ' · DEAD'), lit: live, lines };
}
