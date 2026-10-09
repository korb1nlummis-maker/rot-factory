// mp.fliers.*: the host's machine flights (a rig throwing plush into the bin, a bot fueling a machine ...) are sent to the guest so both screens see them.
export default async function (ctx) {
  const { T, g, S, p, fresh, V3 } = ctx;
  const json = (m) => JSON.parse(JSON.stringify(m));
  let sent = [];
  const role = (r) => { g.net.open = !!r; g.net.role = r; g.guestReady = r === 'guest'; };
  const done = () => { delete g.netSend; role(null); g.remote = null; g.netOut.length = 0; };
  await T('mp.fliers.a-rig-flight-reaches-the-guest-and-is-drawn-there', async () => {
    const bad = [];
    try {
      fresh({}); role('host'); sent = []; g.netSend = (m) => { sent.push(json(m)); }; g._flQ = [];
      const bp = g.hall.binPos; g.fliers.length = 0;
      for (let n = 0; n < 3; n++) g.rigPluck({ sp: 5, vr: 0 }, bp.x - 10 - n, 1.2, bp.z, null);
      g.flushFx(1); const msg = sent.find((m) => m.t === 'fl'); if (!msg || msg.a.length !== 3) bad.push('host sent ' + JSON.stringify(msg && msg.a && msg.a.length));
      const hostFl = g.fliers.length; if (hostFl < 3) bad.push('host did not draw its own flights');
      done(); role('guest'); g.mode = 'play'; g.fliers.length = 0; g.netMessage(json(msg || { t: 'fl', a: [] })); if (g.fliers.length !== 3) bad.push('guest drew ' + g.fliers.length + ' of 3 flights');
      // forged and absurd messages
      g.fliers.length = 0; g.netMessage({ t: 'fl', a: [[1, 0, 'x', 0, 0, 1, 1, 1, 1, 1, 0], [1, 0, 1e300, 0, 0, 1, 1, 1, 9e9, 9e9, 0], 'junk', null] }); if (g.fliers.length > 1) bad.push('forged flights were drawn: ' + g.fliers.length);
      g.fliers.length = 0; g.netMessage({ t: 'fl', a: Array.from({ length: 500 }, () => [1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0]) }); if (g.fliers.length > 16) bad.push('a flood drew ' + g.fliers.length);
      // the host never sends more than the cap in a batch
      done(); role('host'); sent = []; g.netSend = (m) => { sent.push(json(m)); }; g._flQ = []; for (let n = 0; n < 200; n++) g.rigPluck({ sp: 5, vr: 0 }, bp.x - 8, 1.2, bp.z, null); g.flushFx(1); const sz = sent.filter((m) => m.t === 'fl').reduce((a, m) => a + m.a.length, 0); if (sz > 48) bad.push('queued ' + sz + ' flights from a flood');
    } finally { done(); g.fliers.length = 0; }
    return bad.length === 0 || bad.join('; ');
  });
}
