export const midichannels = new StaticArray<MidiChannel>(16);
export const activeVoices = new StaticArray<MidiVoice | null>(32); // up to 32 voices playing simultaneously

export class MidiChannel {
    channel: u8;
    controllerValues: StaticArray<u8> = new StaticArray<u8>(128);
    voices: StaticArray<MidiVoice | null> = new StaticArray<MidiVoice | null>(16); // up to 16 voices per channel

    noteoff(note: u8): void {
        for(let n = 0; this.voices[n] !== null && n < this.voices.length; n++) {
            const voice = this.voices[n] as MidiVoice;
            if (voice.note === note) {
                voice.noteoff();
                break;
            }
        }
    }

    activateVoice(): MidiVoice | null {
        let activeVoiceIndex: i32 = -1;
        for(let n = 0; n<activeVoices.length; n++) {
            const activeVoice = activeVoices[n];
            if (activeVoice === null) {
                activeVoiceIndex = n;
                break;
            }
        }
        if (activeVoiceIndex === -1) {
            return null;
        }

        for(let n = 0; n<this.voices.length; n++) {
            const voice = this.voices[n];
            if (voice != null && voice.activeVoicesIndex === -1) {
                const availableVoice = voice as MidiVoice;
                activeVoices[activeVoiceIndex] = availableVoice;
                availableVoice.activeVoicesIndex = activeVoiceIndex;
                return availableVoice;
            }
        }

        return null;
    }
}

export abstract class MidiVoice {
    channel: MidiChannel;
    note: u8;
    velocity: u8;
    activeVoicesIndex: i32 = -1;

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
     * Override this to trigger releases on envelopes
     */
    noteoff(): void {

    }

    /**
     * This will be called repeatedly as long as the voice is active
     * 
     * Override it to add checks for e.g. envelope to be fully released
     */
    deactivateIfDone(): void {
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
        const activatedVoice = midichannels[channel].activateVoice();
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
    }
}