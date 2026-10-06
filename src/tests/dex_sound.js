export default async function (ctx) {
  const { T, g, S, fresh, adv } = ctx;
  const spy = () => { const calls = { tone: 0, toast: [] }; const ot = g.sound.tone, oa = g.ui.toast; g.sound.tone = () => { calls.tone++; }; g.ui.toast = (t) => { calls.toast.push(t.title); }; return { calls, off: () => { g.sound.tone = ot; g.ui.toast = oa; } }; };
  await T('audio.machines-finding-new-species-make-no-chime-and-report-in-one-batch', async () => {
    fresh({}); S().dex = {}; g._autoNewDex = 0; g._autoDexT = 0; const s = spy();
    try { for (let sp = 1; sp <= 40; sp++) g.registerDex(sp, true); const quiet = s.calls.tone === 0 && s.calls.toast.length === 0;
      g.flushAutoDex(10); const early = s.calls.toast.length; g.flushAutoDex(25); const batch = s.calls.toast.filter((t) => /new species logged/.test(t)).length;
      return (quiet && early === 0 && batch === 1 && s.calls.tone === 0 && g._autoNewDex === 0) || `quiet ${quiet}, toasts before 30 s ${early}, batch toasts ${batch}, tones ${s.calls.tone}`;
    } finally { s.off(); }
  });
  await T('audio.a-new-species-you-handle-chimes-once-and-never-in-a-menu', async () => {
    fresh({}); S().dex = {}; g.mode = 'play'; g.time += 10; const s = spy();
    try { g.registerDex(101); g.registerDex(102); const afterTwo = s.calls.tone; g.time += 0.6; g.registerDex(103); const afterThird = s.calls.tone;
      g.ui.openModal = 'pause'; g.time += 1; g.registerDex(104); const inMenu = s.calls.tone; g.ui.openModal = null; const counted = g._autoNewDex >= 2;
      return (afterTwo === 1 && afterThird === 2 && inMenu === 2 && counted) || `tones after two at once ${afterTwo}, after the third ${afterThird}, with the menu open ${inMenu}, silently counted ${counted}`;
    } finally { s.off(); g.ui.openModal = null; g._autoNewDex = 0; }
  });
  await T('audio.the-title-screen-is-silent', async () => {
    fresh({}); const was = g.mode; g.mode = 'title'; const s = spy(); try { g.registerDex(777); const n = s.calls.tone + s.calls.toast.length; return n === 0 || `${s.calls.tone} tones and ${s.calls.toast.length} toasts on the title screen`; } finally { s.off(); g.mode = was; g._autoNewDex = 0; }
  });
}
