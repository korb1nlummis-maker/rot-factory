// Crackly radio chatter from the people who used to work here. Pure flavor, with a few real hints.
const GENERAL = [
  'Bay 07 to anyone: if you can hear this, the lights are not supposed to be on.',
  '...rotation sheet says sorters never go past the first kilometer. Funny, the sheet is wet.',
  'Reminder from facilities: the squeaking is normal. The squeaking from the east wall is not normal.',
  'Hey rookie. Frame every four meters. Every. Four. Meters.',
  'Dispatch: the exit is real. People keep asking. It is real. It is very far.',
  'I found a Mythic and put it in the bin. Management said it was the wrong Mythic. There is a right one?',
  'Overnight crew reports the piles are taller than yesterday. We checked. We are going home.',
  'Nobody has been paid since the third shift. Nobody has left either. Interesting.',
  'Static... three... four... the ones with the crown are fakes. All of them. Probably.',
  'Tip from a veteran: if your lamp flickers, it is not the lamp.',
  'If you hear someone humming in the tunnel, it is the pile. Do not hum back.',
  'Cart racing is banned. Cart racing is banned. Cart racing is banned. Who keeps reporting this?',
  'Sorting is a state of mind. Also a salary.',
  'Calling Bay 07: is anyone still there? ...copy. Keep digging, kid.',
  'Weather advisory: inside the warehouse it is always 18 degrees and slightly regretful.',
  'The real one has a halo. I counted the points on the crown, five. Five. Remember that.',
  'We tried digging up. The ceiling is not the ceiling. We stopped digging up.',
  'Maintenance: the fans do not clear the dust, they only move it somewhere sadder.',
  'Safety bulletin 12: climbing the pile is not a hobby. The pile is not a hill. The pile is a mood.',
  'If the slope under you starts to slide, do not run uphill. Nobody has ever run uphill successfully.',
  'First aid reminder: medkits are on K. Not on K for kitchen. We checked.',
  'Whoever keeps throwing plush at the cart: nice arm. Please stop. Nice arm.',
  'Remember to take a gate scan on the way home. The gate is not judging you. The gate is also not blinking.',
  'Reminder: air canisters are not a snack.',
  'Dynamite is a tool, not a personality. Fuse is four seconds. Count to five anyway.',
  'Your pay stub says lumber. We do not know what that means either.',
  'Efficiency tip: if you are still digging by hand, a bot is digging somewhere you are not.',
  'A splitter is just a belt that cannot make up its mind. Use it.',
  'Frames snap on every side. The tunnel does not care how pretty it is, only how long.',
  'Hammer is on slot one. It is not a toy. It is also a toy.',
  'The Field Guide is correct. It has been correct since the first shift.',
  'Everything that rolls out of the pile goes through a gate. Everything. Even the interns.',
  'Reminder: the pile is well over a thousand kinds of plush. Please stop trying to name the last one.',
  'Wood is for the first hundred meters. Past that the wood starts to talk. You do not want to hear what it says.',
  'Every support has a depth rating stamped on it. The mountain does not read stamps, but it does read depth.',
  'A fan under the top beam, facing the way you came. Fresh air follows you in. Dust follows you out.',
  'If your vision goes brown at the edges, you are not tired. You are breathing the tunnel. Leave.',
  'Veins of rare plush run through the whole pile. The assay can find them. So can luck. Luck is cheaper and less reliable.',
  'One in sixty thousand is a Razzo. You will know it when it ticks. Throw it far. Do not throw it at a frame.',
  'Bend the tunnel when the road ahead is bad. Frames turn. The pile is not a ruler and neither are you.',
  'It is a new day, they say. We cannot tell down here. The clock does, and the clock is never wrong, only late.',
];
const DEEP = [
  'Unit calling from the far corner... static ...it is warm here. It knows you are coming.',
  'This is the last depot on the map. After this the map is blank. Draw your own.',
  'The east door is nearly five kilometers out. The gold one is further. It is not on the way.',
  'Hello? I have been digging for a long time. What shift is it?',
];

export class Radio {
  constructor(game) { this.game = game; this.t = 240 + Math.random() * 240; }
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 420 + Math.random() * 600;
    const g = this.game;
    const deep = (g.S.stats.maxDist || 0) > 1200 && Math.random() < 0.4;
    const pool = deep ? DEEP : GENERAL;
    const line = pool[(Math.random() * pool.length) | 0];
    g.sound.noise(0.5, 3000, 1500, 0.05, 'bandpass', 0, 2);
    g.sound.tone('sine', 900, 900, 0.06, 0.05, 0.1);
    g.ui.toast({ icon: '📻', title: 'Radio', text: line, ms: 9000 });
  }
}
