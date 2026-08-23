// ============================================================
// Звуковой движок: WebAudio-синтез в духе Dota 2
// Глубокие layered-звуки + компрессор для «взрослой» плотности
// ============================================================

type FilterKind = BiquadFilterType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -16;
      this.comp.knee.value = 22;
      this.comp.ratio.value = 7;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  private tone(freq: number, dur: number, type: OscillatorType = "sine", vol = 0.5, slideTo?: number, delay = 0, slideRate = 0.06) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur * (1 + slideRate));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }

  // колоколообразный тон с негармоническими обертонами
  private bell(freq: number, dur: number, vol = 0.4, delay = 0) {
    this.tone(freq, dur, "sine", vol, undefined, delay);
    this.tone(freq * 2.756, dur * 0.6, "sine", vol * 0.3, undefined, delay);
    this.tone(freq * 1.5, dur * 0.45, "triangle", vol * 0.22, undefined, delay);
  }

  private noise(dur: number, vol = 0.5, freq = 1200, q = 0.8, delay = 0, slideTo?: number, kind: FilterKind = "lowpass") {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = kind;
    f.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t0 + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.1);
  }

  click() { this.ensure(); this.tone(720, 0.055, "square", 0.1); this.tone(360, 0.05, "sine", 0.1); }

  buy() { this.ensure(); this.bell(1320, 0.5, 0.22); this.bell(1980, 0.65, 0.16, 0.08); }

  coin() {
    this.ensure();
    for (let i = 0; i < 3; i++) this.bell(1500 + i * 340, 0.3, 0.14, i * 0.055);
  }

  shoot() {
    this.ensure();
    this.noise(0.28, 0.5, 2400, 0.5, 0, 160);
    this.tone(120, 0.3, "sine", 0.55, 42);
    this.tone(2400, 0.05, "square", 0.1, 900);
  }

  explode(big = false) {
    this.ensure();
    this.noise(big ? 0.9 : 0.55, big ? 0.85 : 0.6, big ? 2200 : 1500, 0.5, 0, 70);
    this.tone(big ? 72 : 95, big ? 0.7 : 0.45, "sine", 0.8, 28);
    this.tone(big ? 50 : 62, big ? 0.8 : 0.5, "sine", 0.5, 24, 0.02);
    this.noise(0.12, 0.25, 5200, 0.5, 0, 800, "highpass"); // треск ударной волны
    this.bell(340, 0.7, 0.1, 0.03); // металлический звон
  }

  hurt() { this.ensure(); this.tone(190, 0.16, "sawtooth", 0.16, 90); this.noise(0.09, 0.12, 900); }
  jump() { this.ensure(); this.tone(240, 0.15, "sine", 0.2, 430); }
  land() { this.ensure(); this.noise(0.1, 0.2, 480); this.tone(90, 0.1, "sine", 0.16, 55); }

  tele() {
    this.ensure();
    this.tone(300, 0.24, "sine", 0.3, 1500);
    this.tone(1500, 0.2, "sine", 0.15, 400, 0.12);
    this.noise(0.16, 0.13, 3400, 2, 0.05, 600, "highpass");
  }

  heal() {
    this.ensure();
    this.bell(660, 0.4, 0.18);
    this.bell(880, 0.5, 0.16, 0.1);
    this.bell(1100, 0.6, 0.13, 0.2);
  }

  tick() { this.ensure(); this.tone(950, 0.05, "square", 0.12); }

  banner() {
    this.ensure();
    this.tone(196, 0.4, "sawtooth", 0.14);
    this.tone(294, 0.4, "sawtooth", 0.12);
    this.tone(392, 0.4, "sawtooth", 0.12);
    this.noise(0.35, 0.06, 900, 1, 0, 300);
  }

  win() {
    this.ensure();
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.bell(f, 0.6, 0.2, i * 0.14));
    this.noise(1.2, 0.1, 4200, 1.5, 0.6, 700, "highpass");
  }

  lose() {
    this.ensure();
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.5, "sawtooth", 0.12, f * 0.9, i * 0.22));
    this.tone(65, 1.4, "sine", 0.2, 40, 0.3);
  }

  crate() {
    this.ensure();
    this.noise(0.12, 0.3, 700);
    this.bell(1180, 0.35, 0.16, 0.04);
    this.bell(1560, 0.4, 0.13, 0.1);
  }

  whoosh() { this.ensure(); this.noise(0.24, 0.2, 3200, 0.4, 0, 300, "bandpass"); }
  zap() { this.ensure(); this.noise(0.2, 0.3, 6000, 0.3, 0, 1200, "highpass"); this.tone(2600, 0.14, "sawtooth", 0.1, 300); }

  hookThrow() { this.ensure(); this.noise(0.3, 0.25, 1800, 0.7, 0, 300, "bandpass"); this.tone(500, 0.2, "sine", 0.1, 220); }
  hookHit() { this.ensure(); this.tone(150, 0.25, "sine", 0.5, 60); this.noise(0.12, 0.3, 2600, 0.4, 0, 500, "highpass"); }
  chainDrag() { this.ensure(); for (let i = 0; i < 5; i++) this.tone(700 + i * 90, 0.05, "square", 0.06, 500, i * 0.05); }

  splash() {
    this.ensure();
    this.noise(0.5, 0.45, 1100, 0.6, 0, 150);
    this.tone(320, 0.3, "sine", 0.18, 70, 0.02, 0.004);
    for (let i = 0; i < 5; i++) this.tone(180 + Math.random() * 260, 0.08, "sine", 0.07, 90, 0.08 + Math.random() * 0.25);
  }

  creak() { this.ensure(); this.tone(120, 0.18, "sawtooth", 0.06, 90); this.tone(180, 0.14, "triangle", 0.05, 130, 0.05); }

  // радостный клёкот героя при попадании
  cheer() {
    this.ensure();
    this.tone(700, 0.08, "sine", 0.12, 1060);
    this.tone(830, 0.09, "sine", 0.1, 1190, 0.07);
    this.tone(950, 0.1, "sine", 0.08, 1320, 0.15);
  }

  // короткий восторженный гул трибун
  crowd() { this.ensure(); this.noise(0.55, 0.12, 1000, 0.7, 0, 700, "bandpass"); this.tone(300, 0.4, "sine", 0.045, 345); }

  // овации: гул + хлопки + скандирование
  ovation() {
    this.ensure();
    this.noise(1.15, 0.18, 1100, 0.6, 0, 750, "bandpass");
    this.tone(240, 0.9, "sine", 0.06, 285);
    for (let i = 0; i < 9; i++) this.noise(0.035, 0.08, 2600 + Math.random() * 900, 1.2, 0.12 + i * 0.085 + Math.random() * 0.02, undefined, "highpass");
    this.tone(420, 0.12, "square", 0.05, 560, 0.1);
    this.tone(420, 0.12, "square", 0.05, 560, 0.42);
    this.tone(420, 0.16, "square", 0.05, 640, 0.74);
  }

  gasp() { this.ensure(); this.noise(0.3, 0.06, 460, 0.8, 0, 190, "bandpass"); }

  // ============================================================
  // Фоновая музыка в духе Dota 2: тёмный эмбиент, дроун,
  // минорные пэды, боевые барабаны и редкие валторны
  // ============================================================
  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicNextT = 0;

  startMusic() {
    this.ensure();
    if (!this.ctx || !this.master || this.musicTimer !== null) return;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.17;
    this.musicGain.connect(this.master);

    // вечный низкий дроун
    const dg = this.ctx.createGain();
    dg.gain.value = 0.34;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 210;
    for (const [f, det] of [[55, 0], [82.41, 4], [110, -3]] as [number, number][]) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start();
    }
    lp.connect(dg).connect(this.musicGain);

    this.musicNextT = this.ctx.currentTime + 0.15;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 140);
  }

  private scheduleMusic() {
    if (!this.ctx || !this.musicGain) return;
    while (this.musicNextT < this.ctx.currentTime + 0.7) {
      this.playBar(this.musicNextT, this.musicStep);
      this.musicStep++;
      this.musicNextT += 4.8; // такт
    }
  }

  private mTone(freq: number, dur: number, type: OscillatorType, vol: number, at: number, slideTo?: number, attack = 0.02) {
    if (!this.ctx || !this.musicGain) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), at);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.musicGain);
    o.start(at);
    o.stop(at + dur + 0.1);
  }

  private mNoise(dur: number, vol: number, freq: number, at: number, kind: BiquadFilterType = "lowpass", slideTo?: number) {
    if (!this.ctx || !this.musicGain || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = kind;
    f.frequency.setValueAtTime(freq, at);
    if (slideTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), at + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.musicGain);
    src.start(at);
    src.stop(at + dur + 0.1);
  }

  private playBar(t0: number, step: number) {
    // минорная прогрессия: Am → F → Dm → E
    const chords = [
      [110, 164.81, 220],
      [87.31, 130.81, 174.61],
      [73.42, 110, 146.83],
      [82.41, 123.47, 164.81],
    ];
    const chord = chords[step % 4];
    for (const f of chord) {
      this.mTone(f, 4.6, "triangle", 0.105, t0, undefined, 1.1);
      this.mTone(f * 2.003, 4.4, "sine", 0.035, t0, undefined, 1.4);
    }
    // боевые барабаны: доли 1 и 3
    this.warDrum(t0, 1);
    this.warDrum(t0 + 2.4, 0.72);
    if (step % 4 === 3) {
      // сбивка в конце круга
      this.warDrum(t0 + 3.6, 0.9);
      this.mNoise(0.5, 0.1, 3400, t0 + 3.6, "highpass", 900);
    }
    // редкая валторна
    if (step % 2 === 1 && Math.random() < 0.6) {
      const notes = [220, 246.94, 293.66, 329.63];
      const f = notes[Math.floor(Math.random() * notes.length)];
      const bp = 0.045;
      this.mTone(f, 3.4, "sawtooth", bp, t0 + 0.6, f * 1.01, 0.9);
      this.mTone(f * 0.5, 3.4, "triangle", bp * 0.8, t0 + 0.6, undefined, 0.9);
    }
  }

  private warDrum(at: number, vol: number) {
    this.mTone(96, 0.5, "sine", 0.5 * vol, at, 36);
    this.mTone(190, 0.12, "sine", 0.16 * vol, at, 70);
    this.mNoise(0.16, 0.22 * vol, 900, at, "lowpass", 180);
  }
}

export const sfx = new Sfx();
