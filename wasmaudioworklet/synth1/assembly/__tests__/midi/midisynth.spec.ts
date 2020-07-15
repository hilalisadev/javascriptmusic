import { shortmessage, activeVoices, MidiVoice, midichannels, MidiChannel } from '../../midi/midisynth';
import { SineOscillator } from '../../synth/sineoscillator.class';
import { Envelope, EnvelopeState } from '../../synth/envelope.class';
import { notefreq } from '../../synth/note';
import { SAMPLERATE } from '../../environment';

let signal: f32 = 0;

class TestMidiInstrument extends MidiVoice {
  osc: SineOscillator = new SineOscillator();
  env: Envelope = new Envelope(0.1, 0.0, 1.0, 0.1);

  noteon(note: u8, velocity: u8): void {
    super.noteon(note, velocity);
    this.osc.frequency = notefreq(note);
    this.env.attack();
  }

  noteoff(): void {
    this.env.release();
  }

  deactivateIfDone(): void {
    if (this.env.isDone()) {
      super.deactivateIfDone();
    }
  }

  nextframe(): void {
    signal += this.osc.next() * this.env.next();
  }
}

describe("midisynth", () => {
    it("should activate and deactivate one midivoice", () => {
      const channel = new MidiChannel();
      midichannels[0] = channel;
      
      const availableVoice = new TestMidiInstrument();
      channel.voices[0] = availableVoice;

      expect<MidiVoice | null>(activeVoices[0]).toBe(null, 'should be no active voices');
      shortmessage(0x90, 69, 100);

      expect<MidiVoice | null>(activeVoices[0]).toBe(availableVoice, 'should be one active voice');

      const activeVoice: TestMidiInstrument = activeVoices[0] as TestMidiInstrument;
      expect<i32>(activeVoice.note).toBe(69, "note is 69");
      expect<i32>(activeVoice.velocity).toBe(100, "velocity is 100");
      expect<f32>(activeVoice.osc.frequency).toBe(440, "frequency is 440");

      expect<EnvelopeState>(activeVoice.env.state).toBe(EnvelopeState.ATTACK);
      let attackFrameCount = 0;
      while (activeVoice.env.state === EnvelopeState.ATTACK) {
        activeVoice.nextframe();
        attackFrameCount++;
      }
      expect<f32>(attackFrameCount as f32 / SAMPLERATE).toBeCloseTo(0.1 as f32);
      expect<EnvelopeState>(activeVoice.env.state).toBe(EnvelopeState.DECAY);

      // note off
      shortmessage(0x90, 69, 0);
      expect<EnvelopeState>(activeVoice.env.state).toBe(EnvelopeState.RELEASE);
      let releaseFrameCount = 0;
      while (activeVoice.env.state === EnvelopeState.RELEASE) {
        expect<MidiVoice | null>(activeVoices[0]).toBe(availableVoice, 'voice should be active as long as it is in the release state');
        activeVoice.nextframe();
        activeVoice.deactivateIfDone();
        releaseFrameCount++;
      }
      expect<EnvelopeState>(activeVoice.env.state).toBe(EnvelopeState.DONE);
      expect<f32>(releaseFrameCount as f32 / SAMPLERATE).toBeCloseTo(0.1 as f32);
      expect<i32>(activeVoice.activeVoicesIndex).toBe(-1);
      expect<MidiVoice | null>(activeVoices[0]).toBe(null, 'should be no active voices');
    });
});  