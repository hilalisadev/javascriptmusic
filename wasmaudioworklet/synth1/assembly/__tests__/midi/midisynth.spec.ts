import { samplebuffer, playActiveVoices, cleanupInactiveVoices, shortmessage, activeVoices, MidiVoice, midichannels, MidiChannel, numActiveVoices, fillSampleBuffer } from '../../midi/midisynth';
import { SineOscillator } from '../../synth/sineoscillator.class';
import { Envelope, EnvelopeState } from '../../synth/envelope.class';
import { notefreq } from '../../synth/note';
import { SAMPLERATE } from '../../environment';

let signal: f32 = 0;

midichannels[1] = midichannels[0];

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

  isDone(): boolean {
    return this.env.isDone();
  }

  nextframe(): void {
    signal += this.osc.next() * this.env.next();
  }
}

describe("midisynth", () => {
    it("should activate and deactivate one midivoice", () => {
      const availableVoice = new TestMidiInstrument();
      const channel = new MidiChannel([availableVoice]);

      midichannels[0] = channel;

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
        playActiveVoices();
        attackFrameCount++;
      }
      cleanupInactiveVoices();
      expect<f32>(attackFrameCount as f32 / SAMPLERATE).toBeCloseTo(0.1 as f32);
      expect<EnvelopeState>(activeVoice.env.state).toBe(EnvelopeState.DECAY);

      // note off
      shortmessage(0x90, 69, 0);
      expect<EnvelopeState>(activeVoice.env.state).toBe(EnvelopeState.RELEASE);
      let releaseFrameCount = 0;
      while (activeVoice.env.state === EnvelopeState.RELEASE) {
        expect<MidiVoice | null>(activeVoices[0]).toBe(availableVoice, 'voice should be active as long as it is in the release state');
        playActiveVoices();
        releaseFrameCount++;
      }

      cleanupInactiveVoices();
      expect<EnvelopeState>(activeVoice.env.state).toBe(EnvelopeState.DONE);
      expect<f32>(releaseFrameCount as f32 / SAMPLERATE).toBeCloseTo(0.1 as f32);
      expect<i32>(activeVoice.activeVoicesIndex).toBe(-1);
      expect<MidiVoice | null>(activeVoices[0]).toBe(null, 'should be no active voices');
    });
    it("should keep a list of active voices without holes when adding/removing multiple voices", () => {
      const channel = new MidiChannel([
        new TestMidiInstrument(),
        new TestMidiInstrument(),
        new TestMidiInstrument()
      ]);
      midichannels[0] = channel;
      
      expect<i32>(numActiveVoices).toBe(0);

      shortmessage(0x90, 69, 100);
      shortmessage(0x90, 72, 100);
      shortmessage(0x90, 76, 100);

      expect<i32>(numActiveVoices).toBe(3);
      expect<MidiVoice | null>(activeVoices[0]).toBe(channel.voices[0], 'voice 1 should be active');
      expect<MidiVoice | null>(activeVoices[1]).toBe(channel.voices[1], 'voice 2 should be active');
      expect<MidiVoice | null>(activeVoices[2]).toBe(channel.voices[2], 'voice 3 should be active');

      shortmessage(0x90, 72, 0);
      while ((activeVoices[1] as TestMidiInstrument).env.state !== EnvelopeState.DONE) {
        playActiveVoices();
        expect<MidiVoice | null>(activeVoices[1]).toBe(channel.voices[1], 'voice 2 should be active');
      }

      cleanupInactiveVoices();
      expect<i32>(numActiveVoices).toBe(2);
      expect<MidiVoice | null>(activeVoices[0]).toBe(channel.voices[0], 'voice 1 should be active');      
      expect<MidiVoice | null>(activeVoices[1]).toBe(channel.voices[2], 'voice 3 should be active');
      
      shortmessage(0x90, 73, 100);
      cleanupInactiveVoices();

      expect<i32>(numActiveVoices).toBe(3);
      expect<MidiVoice | null>(activeVoices[0]).toBe(channel.voices[0], 'voice 1 should be active');      
      expect<MidiVoice | null>(activeVoices[1]).toBe(channel.voices[2], 'voice 3 should be active');
      expect<MidiVoice | null>(activeVoices[2]).toBe(channel.voices[1], 'voice 2 should be active');

      shortmessage(0x90, 69, 0);
      cleanupInactiveVoices();

      while ((activeVoices[0] as TestMidiInstrument).env.state !== EnvelopeState.DONE) {
        playActiveVoices();
      }
      cleanupInactiveVoices();
      expect<i32>(numActiveVoices).toBe(2);   
      expect<MidiVoice | null>(activeVoices[0]).toBe(channel.voices[2], 'voice 3 should be active');
      expect<MidiVoice | null>(activeVoices[1]).toBe(channel.voices[1], 'voice 2 should be active');

      shortmessage(0x90, 73, 0);
      shortmessage(0x90, 76, 0);
      while (
        (activeVoices[0] as TestMidiInstrument).env.state !== EnvelopeState.DONE ||
        (activeVoices[1] as TestMidiInstrument).env.state !== EnvelopeState.DONE) {
        playActiveVoices();
      }
      cleanupInactiveVoices();

      expect<i32>(numActiveVoices).toBe(0, 'should be no active voices');
      expect<MidiVoice | null>(activeVoices[0]).toBe(null, 'voice 1 should be inactive');
      expect<MidiVoice | null>(activeVoices[1]).toBe(null, 'voice 2 should be inactive');
      expect<MidiVoice | null>(activeVoices[2]).toBe(null, 'voice 3 should be inactive');

    });
    it("should not activate more than one voice for a note (per channel)", () => {
      const channel = new MidiChannel([
        new TestMidiInstrument(),
        new TestMidiInstrument(),
        new TestMidiInstrument()
      ]);
      
      midichannels[0] = channel;
      
      expect<i32>(numActiveVoices).toBe(0);

      shortmessage(0x90, 69, 100);
      shortmessage(0x90, 69, 100);
      shortmessage(0x90, 69, 100);

      expect<i32>(numActiveVoices).toBe(1, 'should be only one active voice');
      expect<MidiVoice | null>(activeVoices[0]).toBe(channel.voices[0], 'voice 1 should be active');
      expect<MidiVoice | null>(activeVoices[1]).toBe(null, 'voice 2 should be inactive');
      expect<MidiVoice | null>(activeVoices[2]).toBe(null, 'voice 3 should be inactive');

      while (
        (activeVoices[0] as TestMidiInstrument).env.state !== EnvelopeState.DECAY) {
        playActiveVoices();
      }
      shortmessage(0x80, 69, 0);
      expect<EnvelopeState>((activeVoices[0] as TestMidiInstrument).env.state).toBe(EnvelopeState.RELEASE);
      expect<i32>(numActiveVoices).toBe(1, 'should be one active voice');
      shortmessage(0x90, 69, 80);
      expect<EnvelopeState>((activeVoices[0] as TestMidiInstrument).env.state).toBe(EnvelopeState.ATTACK);
      while (
        (activeVoices[0] as TestMidiInstrument).env.state !== EnvelopeState.DECAY) {
        playActiveVoices();
      }
      expect<EnvelopeState>((activeVoices[0] as TestMidiInstrument).env.state).toBe(EnvelopeState.DECAY);
      shortmessage(0x80, 69, 0);
      while (
        (activeVoices[0] as TestMidiInstrument).env.state !== EnvelopeState.DONE) {
        playActiveVoices();
      }
      cleanupInactiveVoices();
      expect<i32>(numActiveVoices).toBe(0, 'should be no active voices');
    });
    it("should produce sound", () => {
      fillSampleBuffer();
      for (let n=0; n<samplebuffer.length; n++) {
        expect<f32>(samplebuffer[n]).toBe(0);
      }
      shortmessage(0x91, 69, 100);
      
      expect<i32>(numActiveVoices).toBe(1, 'should be one active voice');

      fillSampleBuffer();
      for (let n=1; n<samplebuffer.length; n++) {
        expect<f32>(samplebuffer[n]).not.toBe(samplebuffer[n-1], 'signal should be changing');
      }

      shortmessage(0x91, 69, 0);

      while (
        numActiveVoices > 0) {
          fillSampleBuffer();
      }
      
      for (let n=0; n<samplebuffer.length; n++) {
        expect<f32>(samplebuffer[n]).toBe(0, 'signal should be quiet');
      }
    });
    it("should be able to turn voices on and off without waiting for release when there is only one available voice", () => {
      const channel = new MidiChannel([
        new TestMidiInstrument()
      ]);
      
      midichannels[0] = channel;
      shortmessage(0x90, 69, 100);
      
      expect<i32>(numActiveVoices).toBe(1, 'should be one active voice');
      fillSampleBuffer();
      fillSampleBuffer();
      
      shortmessage(0x90, 69, 0);
      shortmessage(0x90, 71, 100);
      expect<u8>((activeVoices[0] as MidiVoice).note).toBe(69, 'should be the first note, since we did not wait for release');
      fillSampleBuffer();
      fillSampleBuffer();
      
      shortmessage(0x90, 71, 0);
      shortmessage(0x90, 73, 100);
      expect<u8>((activeVoices[0] as MidiVoice).note).toBe(69, 'should still be the first note, since we did not wait for release');
      fillSampleBuffer();
      while (
        (activeVoices[0] as TestMidiInstrument).env.state !== EnvelopeState.DONE) {
        fillSampleBuffer();
      }
      fillSampleBuffer();
      expect<i32>(numActiveVoices).toBe(0, 'should be no active voices after release');
    });
});  