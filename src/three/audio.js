import * as Tone from 'tone';

export function buildAudio() {
  const master = new Tone.Volume(-8).toDestination();
  const verb = new Tone.Reverb({ decay: 9, wet: 0.55 }).connect(master);
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 3.5, decay: 2, sustain: 0.55, release: 7 },
    volume: -25,
  }).connect(verb);
  const notes = ["C3", "D3", "E3", "G3", "A3", "C4", "D4", "E4", "G4"];
  const padLoop = new Tone.Loop((time) => {
    try {
      const n = notes[Math.floor(Math.random() * notes.length)];
      pad.triggerAttackRelease(n, 6, time);
      if (Math.random() > 0.55) {
        const m = notes[Math.floor(Math.random() * notes.length)];
        if (m !== n) pad.triggerAttackRelease(m, 8, time + 1.7);
      }
    } catch (e) {}
  }, 9);
  padLoop.humanize = 2;
  padLoop.start(0.4);
  const airFilt = new Tone.Filter(300, "lowpass").connect(master);
  const air = new Tone.Noise("pink");
  air.volume.value = -38;
  air.connect(airFilt);
  air.start();
  const stepFilt = new Tone.Filter(900, "lowpass").connect(master);
  const stepSynth = new Tone.NoiseSynth({
    noise: { type: "brown" },
    envelope: { attack: 0.002, decay: 0.07, sustain: 0 },
    volume: -24,
  }).connect(stepFilt);
  const bell = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.004, decay: 0.6, sustain: 0, release: 1.4 },
    volume: -16,
  }).connect(verb);
  // hand study: stone on skin, rubbing, water, and the stone's own voice when tapped
  const rubFilt = new Tone.Filter(520, "lowpass").connect(master);
  const rub = new Tone.Noise("brown");
  const rubVol = new Tone.Volume(-60).connect(rubFilt);
  rub.connect(rubVol); rub.start();
  const drop = new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 3, envelope: { attack: 0.001, decay: 0.09, sustain: 0 }, volume: -22 }).connect(verb);
  const ring = new Tone.FMSynth({
    harmonicity: 3.01, modulationIndex: 9,
    envelope: { attack: 0.001, decay: 2.6, sustain: 0, release: 2.4 },
    modulationEnvelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.4 }, volume: -14,
  }).connect(verb);
  const knock = new Tone.MembraneSynth({ pitchDecay: 0.012, octaves: 2, envelope: { attack: 0.001, decay: 0.06, sustain: 0 }, volume: -12 }).connect(master);
  const clickF = new Tone.Filter(3200, "bandpass").connect(master);
  const click = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.025, sustain: 0 }, volume: -18 }).connect(clickF);
  Tone.Transport.start();
  return {
    on: true,
    step(strength) {
      try {
        stepSynth.volume.value = -27 + strength * 7;
        stepSynth.triggerAttackRelease(0.05);
      } catch (e) {}
    },
    chime() {
      try {
        const now = Tone.now();
        bell.triggerAttackRelease("E5", 0.4, now);
        bell.triggerAttackRelease("A5", 0.7, now + 0.22);
      } catch (e) {}
    },
    place() {
      try {
        const now = Tone.now();
        stepSynth.triggerAttackRelease(0.08, now);
        bell.triggerAttackRelease("A4", 0.5, now + 0.06);
      } catch (e) {}
    },
    /** the vitrine glass lifts */
    glass() {
      try { const now = Tone.now(); bell.triggerAttackRelease("B5", 0.25, now); bell.triggerAttackRelease("E6", 0.4, now + 0.05); } catch (e) {}
    },
    /** the stone settles into the palm */
    inHand() {
      try { const now = Tone.now(); stepSynth.volume.value = -22; stepSynth.triggerAttackRelease(0.06, now); knock.triggerAttackRelease("C2", 0.08, now + 0.01); } catch (e) {}
    },
    /** turning the stone against the skin: speed in rad/s (called every frame) */
    rub(speed) {
      try { rubVol.volume.rampTo(speed > 0.05 ? -46 + Math.min(14, speed * 4) : -70, 0.08); } catch (e) {}
    },
    /** a water drop lands on stone */
    drip(i) {
      try { drop.triggerAttackRelease(["A5", "C6", "E6", "G5", "D6"][i % 5], 0.05, Tone.now() + 0.001); } catch (e) {}
    },
    /** a fingertip tap: the stone's voice by rock type (illustrative, not a recording) */
    tap(voice) {
      try {
        const now = Tone.now();
        if (voice === "ring") { ring.triggerAttackRelease("D5", 0.05, now); knock.triggerAttackRelease("G3", 0.04, now); }
        else if (voice === "glass") { click.triggerAttackRelease(0.02, now); bell.triggerAttackRelease("C7", 0.08, now + 0.004); }
        else if (voice === "click") { click.triggerAttackRelease(0.02, now); knock.triggerAttackRelease("A2", 0.05, now); }
        else { knock.triggerAttackRelease("E2", 0.06, now); }
      } catch (e) {}
    },
    setOn(v) {
      this.on = v;
      Tone.Destination.mute = !v;
    },
  };
}
