export default async function (ctx) {
  const { T, g, S, p, fresh, plushWall, standBeforeWall } = ctx;
  const key = (code, down = true) => g.onKey({ code, preventDefault() {}, repeat: false, target: document.body }, down);
  await T('hands.f-is-the-flashlight-and-no-longer-grabs', async () => {
    fresh({}); plushWall(12); standBeforeWall(); g.lampOn = true; const n0 = S().carry.length;
    key('KeyF', true); key('KeyF', false); const off = g.lampOn === false; key('KeyF', true); key('KeyF', false); const on = g.lampOn === true;
    return (off && on && S().carry.length === n0 && !g.keys.KeyG) || `lamp off ${off}, back on ${on}, carry ${S().carry.length} vs ${n0}, grab flag ${g.keys.KeyG}`;
  });
  await T('hands.o-still-toggles-the-flashlight-and-g-does-nothing', async () => {
    fresh({}); g.lampOn = true; key('KeyO', true); key('KeyO', false); const a = g.lampOn === false; key('KeyO', true); key('KeyO', false); const b = g.lampOn === true; const before = JSON.stringify([g.lampOn, S().carry.length]); key('KeyG', true); key('KeyG', false); const after = JSON.stringify([g.lampOn, S().carry.length]);
    return (a && b && before === after) || `O off ${a}, O on ${b}, G changed ${before} -> ${after}`;
  });
  await T('hands.left-click-still-grabs', async () => {
    fresh({}); plushWall(12); standBeforeWall(); const n0 = S().carry.length; const eye = p().eyePos(new ctx.V3()), dir = p().forward(new ctx.V3()); g.curTargetRef = g.findTarget(eye, dir); g.onMouse({ button: 0, preventDefault() {} }, true); g.onMouse({ button: 0, preventDefault() {} }, false);
    return S().carry.length === n0 + 1 || 'a left click did not grab';
  });
  await T('hands.texts-no-longer-say-F-grabs', async () => {
    const html = document.documentElement.innerHTML; const bad = []; for (const re of [/<kbd>F<\/kbd>\s*(or|\/)\s*(left )?click/i, /Tap F or left click/, /Holding F or left click/]) if (re.test(html)) bad.push(String(re));
    const src = await (await fetch('/src/game.js')).text(); if (/tap <kbd>F<\/kbd> to grab/.test(src)) bad.push('start hint'); return bad.length === 0 || 'still says F grabs: ' + bad.join(', ');
  });
}
