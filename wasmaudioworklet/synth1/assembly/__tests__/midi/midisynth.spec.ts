import { shortmessage, activeVoices, MidiVoice, midichannels, MidiChannel } from '../../midi/midisynth';

describe("midisynth", () => {
    it("should play note", () => {
      const channel = new MidiChannel();
      midichannels[0] = channel;
      const availableVoice = new MidiVoice();
      channel.voices[0] = availableVoice;

      expect<MidiVoice | null>(activeVoices[0]).toBe(null, 'should be no active voices');
      shortmessage(0x90, 64, 100);

      expect<MidiVoice | null>(activeVoices[0]).toBe(availableVoice, 'should be one active voice');

      const activeVoice: MidiVoice = activeVoices[0] as MidiVoice;
      expect<i32>(activeVoice.note).toBe(64, "note is 64");
      expect<i32>(activeVoice.velocity).toBe(100, "velocity is 100");
    });
});  