import { fillFrame } from '../mixes/midi.mix';

const MAX_ACTIVE_VOICES_SHIFT = 5; // up to 32 voices playing simultaneously
const MAX_ACTIVE_VOICES = 1 << MAX_ACTIVE_VOICES_SHIFT;

export const midichannels = new StaticArray<MidiChannel>(16);
export const activeVoices = new StaticArray<MidiVoice | null>(MAX_ACTIVE_VOICES);
export let numActiveVoices = 0;
export let voiceActivationCount = 0;
export const sampleBufferFrames = 128;
export const sampleBufferBytesPerChannel = sampleBufferFrames * 4;
export const samplebuffer = new StaticArray<f32>(sampleBufferFrames * 2);
const bufferposstart = changetype<usize>(samplebuffer);
const bufferposend = changetype<usize>(samplebuffer) + sampleBufferBytesPerChannel;

const CONTROL_SUSTAIN: u8 = 64;

export class MidiChannel {
    controllerValues: StaticArray<u8> = new StaticArray<u8>(128);
    voices: MidiVoice[]; // provide an array of initialized voices
    sustainedVoices: StaticArray<MidiVoice | null> = new StaticArray<MidiVoice | null>(MAX_ACTIVE_VOICES);
    sustainedVoicesIndex: i32 = 0;

    constructor(voices: MidiVoice[]) {
        this.voices = voices;
    }

    controlchange(controller: u8, value: u8): void {
        this.controllerValues[controller] = value;

        switch (controller) {
            case CONTROL_SUSTAIN:
                // sustain
                if (value < 64) {
                    for (let n = 0; n<MAX_ACTIVE_VOICES; n++) {
                        if (this.sustainedVoices[n] != null) {
                            (this.sustainedVoices[n] as MidiVoice).noteoff();
                            this.sustainedVoices[n] = null;
                        }
                    }
                }
                break;
        }
    }

    noteoff(note: u8): void {
        for(let n = 0; n < this.voices.length; n++) {
            const voice = this.voices[n];
            if (voice.note === note) {
                if (this.controllerValues[CONTROL_SUSTAIN] >= 64 ) {
                    this.sustainedVoices[this.sustainedVoicesIndex++] = voice;
                    this.sustainedVoicesIndex &= ((1 << MAX_ACTIVE_VOICES_SHIFT) - 1);
                } else {
                    voice.noteoff();
                }
                break;
            }
        }
    }

    activateVoice(note: u8): MidiVoice | null {
        for(let n = 0; n<this.voices.length; n++) {
            const voice = this.voices[n];
            if(voice.activeVoicesIndex > -1 && voice.note === note) {
                // Found already active voice for the given note
                voice.activationCount = voiceActivationCount++;
                return voice;
            }
        }

        if (numActiveVoices === activeVoices.length) {
            return null;
        }

        let activeVoiceIndex: i32 = numActiveVoices;
        
        for(let n = 0; n<this.voices.length; n++) {
            const voice = this.voices[n];
            if (voice.activeVoicesIndex === -1) {
                const availableVoice = voice as MidiVoice;
                activeVoices[activeVoiceIndex] = availableVoice;
                availableVoice.activeVoicesIndex = activeVoiceIndex;
                numActiveVoices++;
                return availableVoice;
            }
        }

        // no available voices for the current channel, we'll pick the oldest
        let oldestVoice = this.voices[0];
        for(let n = 1; n<this.voices.length; n++) {
            const voice = this.voices[n];
            if (voice.activationCount < oldestVoice.activationCount) {
                oldestVoice = voice;
            }
        }
        oldestVoice.activationCount = voiceActivationCount++;
        return oldestVoice;
    }
}

export abstract class MidiVoice {
    channel: MidiChannel;
    note: u8;
    velocity: u8;
    activeVoicesIndex: i32 = -1;
    activationCount: i32 = (voiceActivationCount++);

    /**
     * If you override this (e.g. to trigger attacks on envelopes), make sure you call super.noteon
     * @param note 
     * @param velocity 
     */
    noteon(note: u8, velocity: u8): void {
        this.note = note;
        this.velocity = velocity;
    }

    /**
     * Override this to e.g. trigger releases on envelopes
     */
    noteoff(): void {
        this.velocity = 0;
    }

    /**
     * This will be called repeatedly as long as the voice is active
     * 
     * Override it to add checks for e.g. envelope to be fully released
     */
    isDone(): boolean {
        return this.velocity === 0;
    }

    deactivate(): void {
        activeVoices[this.activeVoicesIndex] = null;
        this.activeVoicesIndex = -1;
    }

    /**
     * Will be called for rendering an audio frame
     */
    abstract nextframe(): void;
}

export function shortmessage(val1: u8, val2: u8, val3: u8): void {
    const channel = val1 & 0xf;
    const command = val1 & 0xf0;

    if(command === 0x90 && val3 > 0) {
        const activatedVoice = midichannels[channel].activateVoice(val2);
        if(activatedVoice!==null) {
            const voice = activatedVoice as MidiVoice;
            voice.noteon(val2, val3);
        }
    } else if(
        (command === 0x80 ||
        (command === 0x90 && val3 === 0)) // 
    ) {
        // note off
        midichannels[channel].noteoff(val2);
    } else if(command === 0xb0) {
        // control change
        midichannels[channel].controlchange(val2, val3);
    }
}

export function allNotesOff(): void {
    for (let n=0; n<numActiveVoices; n++) {
        const voice = activeVoices[n] as MidiVoice;
        voice.noteoff();
    }
}

export function cleanupInactiveVoices(): void {
    for (let n=0; n<numActiveVoices; n++) {
        const voice = activeVoices[n] as MidiVoice;
        if (voice.isDone()) {
            voice.deactivate();
            for (let r = n+1; r < numActiveVoices; r++) {
                const nextVoice = activeVoices[r] as MidiVoice;
                nextVoice.activeVoicesIndex--;
                activeVoices[r-1] = nextVoice;
                activeVoices[r] = null;
            }
            numActiveVoices--;
            n--;
        }
    }
}

export function playActiveVoices(): void {
    for (let n=0; n<numActiveVoices; n++) {
        (activeVoices[n] as MidiVoice).nextframe();
    }
}

export function fillSampleBuffer(): void {      
    cleanupInactiveVoices();
    
    for(let bufferpos = bufferposstart; bufferpos<bufferposend; bufferpos+=4) {   
        playActiveVoices();
        fillFrame(bufferpos, bufferpos + sampleBufferBytesPerChannel);
    }
}
  