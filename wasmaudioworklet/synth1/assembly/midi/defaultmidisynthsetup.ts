import { midichannels, MidiChannel, MidiVoice } from './midisynth';
import { StereoSignal, Freeverb, SineOscillator, Envelope, notefreq } from '../mixes/globalimports';

const reverb = new Freeverb();

const mainline = new StereoSignal();
const reverbline = new StereoSignal();

class SimpleSine extends MidiVoice {
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
        const signal = this.osc.next() * this.env.next() * this.velocity / 256;
        reverbline.addMonoSignal(signal, 0.2, 0.7);
        mainline.addMonoSignal(signal, 0.5, 0.5);
    }
}

midichannels[0] = new MidiChannel([
    new SimpleSine(),
    new SimpleSine(),
    new SimpleSine(),
    new SimpleSine(),
    new SimpleSine()
]);

@inline
export function fillFrame(leftSampleBufferPtr: usize, rightSampleBufferPtr: usize): void {
    reverb.tick(reverbline);
    store<f32>(leftSampleBufferPtr, mainline.left + reverbline.left);
    store<f32>(rightSampleBufferPtr, mainline.right + reverbline.right);
    mainline.clear();
    reverbline.clear();
}