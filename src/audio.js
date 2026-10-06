// Procedural audio. Everything is synthesized; no asset files.
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.vol = 0.7;
    this.geigerT = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    // warehouse reverb
    const len = c.sampleRate * 2.6;
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb = c.createConvolver(); this.verb.buffer = buf;
    this.verbGain = c.createGain(); this.verbGain.gain.value = 0.28;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    this.dry = c.createGain(); this.dry.connect(this.master); this.dry.connect(this.verb);
    // noise buffer
    const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this.startAmbient();
  }

  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }

  startAmbient() {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = 0.05; g.connect(this.dry);
    for (const [f, a] of [[100, 0.5], [200, 0.25], [300, 0.12], [50, 0.5]]) {
      const o = c.createOscillator(); o.type = f === 50 ? 'sine' : 'sawtooth'; o.frequency.value = f + (Math.random() - 0.5) * 0.4;
      const og = c.createGain(); og.gain.value = a; o.connect(og); og.connect(g); o.start();
    }
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const ng = c.createGain(); ng.gain.value = 0.05;
    n.connect(lp); lp.connect(ng); ng.connect(this.dry); n.start();
    this.ambient = g;
    // machinery hum: detuned saws through a low-pass, volume follows nearby belts and mechs
    const mg = c.createGain(); mg.gain.value = 0; mg.connect(this.dry);
    const lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 420; lp2.connect(mg);
    for (const f of [58, 87, 116.5]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const og = c.createGain(); og.gain.value = 0.35; o.connect(og); og.connect(lp2); o.start(); }
    this.machGain = mg;
  }

  setMachines(level) { if (this.machGain) this.machGain.gain.setTargetAtTime(level * 0.06, this.ctx.currentTime, 0.4); }

  setAmbientMuffle(m) { if (this.ambient) this.ambient.gain.setTargetAtTime(0.05 * (1 - m * 0.7), this.ctx.currentTime, 0.2); }

  _env(g, t, a, d, peak) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }

  tone(type, f0, f1, dur, vol, delay = 0, dest = null) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); this._env(g, t, 0.008, dur, vol);
    o.connect(g); g.connect(dest || this.dry); o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, f0, f1, vol, type = 'lowpass', delay = 0, q = 0.7) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    s.playbackRate.value = 0.6 + Math.random() * 0.8;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain(); this._env(g, t, Math.min(0.02, dur * 0.2), dur, vol);
    s.connect(f); f.connect(g); g.connect(this.dry); s.start(t); s.stop(t + dur + 0.1);
  }

  chirp(p = 1) {
    if (!this.ctx) return;
    const f = 520 * p;
    this.tone('square', f, f * 1.6, 0.07, 0.05);
    this.tone('triangle', f * 1.6, f * 1.1, 0.12, 0.07, 0.07);
  }
  stepConcrete(v = 0.08) { this.noise(0.05, 2400, 900, v, 'bandpass', 0, 2.5); this.tone('sine', 150, 80, 0.06, v * 0.7); }
  cough() { if (!this.ctx) return; this.noise(0.12, 900, 300, 0.22, 'bandpass', 0, 1.2); this.noise(0.14, 800, 250, 0.2, 'bandpass', 0.16, 1.2); this.tone('sawtooth', 160, 110, 0.12, 0.07); }
  squeak(pitch = 1, vol = 0.18) {
    if (!this.ctx) return;
    const f = (700 + Math.random() * 500) * pitch;
    this.tone('triangle', f * 0.8, f * 1.5, 0.09, vol);
    this.tone('triangle', f * 1.5, f * 0.9, 0.12, vol * 0.8, 0.07);
    this.tone('sine', f * 3, f * 2, 0.06, vol * 0.2);
  }
  pop(vol = 0.2) { this.tone('sine', 520, 140, 0.11, vol); this.noise(0.05, 3000, 900, vol * 0.4, 'highpass'); }
  thump(vol = 0.3, low = 90) { this.tone('sine', low * 1.6, low * 0.5, 0.18, vol); this.noise(0.14, 700, 120, vol * 0.7, 'lowpass'); }
  soft(vol = 0.1) { this.noise(0.12, 900, 200, vol, 'lowpass'); }
  step(v = 0.07) { this.noise(0.1, 500 + Math.random() * 300, 160, v, 'lowpass'); }
  coin(n = 0) { const b = 880 * Math.pow(1.0595, Math.min(n, 18)); this.tone('sine', b, b, 0.18, 0.12); this.tone('sine', b * 1.5, b * 1.5, 0.22, 0.07, 0.04); }
  swish() { this.noise(0.28, 2500, 5200, 0.12, 'bandpass', 0, 1.2); }
  whoosh(v = 0.1) { this.noise(0.22, 600, 2400, v, 'bandpass', 0, 0.9); }
  error() { this.tone('square', 160, 110, 0.18, 0.12); }
  buy() { [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f, 0.2, 0.1, i * 0.06)); }
  ach() { [659, 784, 988, 1319].forEach((f, i) => this.tone('sine', f, f, 0.5, 0.1, i * 0.09)); this.tone('sine', 1319 * 2, 1319 * 2, 0.7, 0.04, 0.4); }
  place() { this.thump(0.25, 140); this.tone('square', 220, 120, 0.06, 0.06); }
  creak(vol = 0.22) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f = 70 + Math.random() * 60;
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (1.2 + Math.random() * 0.5), t + 0.9);
    const lf = c.createOscillator(); lf.frequency.value = 9 + Math.random() * 12;
    const lg = c.createGain(); lg.gain.value = f * 0.4; lf.connect(lg); lg.connect(o.frequency);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 7;
    const g = c.createGain(); this._env(g, t, 0.15, 0.9, vol);
    o.connect(bp); bp.connect(g); g.connect(this.dry);
    o.start(t); lf.start(t); o.stop(t + 1.2); lf.stop(t + 1.2);
    this.noise(0.8, 300, 120, vol * 0.5, 'bandpass', 0, 3);
  }
  rumble(power = 1) {
    if (!this.ctx) return;
    this.noise(1.6 + power, 260, 40, 0.5 * Math.min(1.5, power), 'lowpass');
    this.tone('sine', 62, 28, 1.4 + power * 0.6, 0.35 * Math.min(1.4, power));
  }
  debris(vol = 0.2) { this.noise(0.25, 1500, 300, vol, 'lowpass'); this.tone('sine', 140 + Math.random() * 60, 60, 0.15, vol * 0.8); }
  found() { [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { this.tone('triangle', f, f, 1.6, 0.12, i * 0.12); this.tone('sine', f * 2, f * 2, 1.2, 0.04, i * 0.12); }); }
  exitSfx() { this.found(); this.noise(2.5, 200, 3000, 0.3, 'bandpass', 0, 0.6); }
  ping() { this.tone('sine', 1500, 1500, 0.7, 0.07); this.tone('sine', 2250, 2250, 0.5, 0.03, 0.01); }

  // geiger-style tick, call each frame with proximity 0..1
  geiger(dt, prox) {
    if (!this.ctx || prox <= 0) return;
    this.geigerT -= dt;
    const rate = 1.2 + prox * prox * 16;
    if (this.geigerT <= 0) {
      this.geigerT = (1 / rate) * (0.7 + Math.random() * 0.6);
      this.tone('square', 2400 + prox * 2200, 900, 0.025, 0.05 + prox * 0.08);
      if (prox > 0.35) this.squeak(1.5 + prox, 0.03 + prox * 0.07);
    }
  }
}
