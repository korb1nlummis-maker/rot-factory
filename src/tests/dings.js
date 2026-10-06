export default async function (ctx) {
  const { T, g, S, p, fresh, adv } = ctx;
  const count = (fn) => { const orig = g.sound.tone; let n = 0; g.sound.tone = (...a) => { n++; }; try { fn(); } finally { g.sound.tone = orig; } return n; };
  await T('audio.locator-ping-is-slow-not-a-machine-gun', async () => {
    fresh({ compass: 1, locator: 1, scan: 0 }); S().up.locator = 1; g.T = g.tune(); let calls = 0;
    // a dig site right next to the player for 10 seconds of 60 fps frames
    const w = g.world, orig = w.remainsNear.bind(w); w.remainsNear = (x, z) => ({ x: x + 3, z, d: 3, i: 0, k: 0 }); g._locNext = 0; g.locT = 0;
    const n = count(() => { for (let f = 0; f < 600; f++) { g.time += 1 / 60; g.updateHud ? g.updateHud(1 / 60) : adv(1 / 60, 1 / 60); } }); w.remainsNear = orig;
    return (n >= 5 && n <= 20) || `${n} pings in 10 s next to a dig site (want a slow ping, at most about 2 a second)`;
  });
  await T('audio.gate-dings-share-a-limiter', async () => {
    fresh({}); g._dingNext = 0; g.time = 100; const n = count(() => { for (let k = 0; k < 50; k++) g.gateDing(); }); g.time = 100.4; const n2 = count(() => { g.gateDing(); });
    return (n === 1 && n2 === 1) || `first burst ${n}, after the pause ${n2}`;
  });
}
