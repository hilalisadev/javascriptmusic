import { Instrument } from '../instruments/instrument.class';

export const midichannels = new StaticArray<MidiChannel>(16);
export const activeVoices = new StaticArray<MidiVoice | null>(32); // up to 32 voices playing simultaneously

export class MidiChannel {
    channel: u8;
    controllerValues: StaticArray<u8> = new StaticArray<u8>(128);
    voices: StaticArray<MidiVoice | null> = new StaticArray<MidiVoice | null>(16); // up to 16 voices per channel

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

export class MidiVoice {
    channel: MidiChannel;
    note: u8;
    velocity: u8;
    activeVoicesIndex: i32 = -1;
    instrument: Instrument;
}

export function shortmessage(val1: u8, val2: u8, val3: u8): void {
    const channel = val1 & 0xf;
    const command = val1 & 0xf0;

    if(command === 0x90 && val3 > 0) {
        const activatedVoice = midichannels[channel].activateVoice();
        if(activatedVoice!==null) {
            const voice = activatedVoice as MidiVoice;
            voice.note = val2;
            voice.velocity = val3;
        }
    } else if(
        (command === 0x80 ||
        (command === 0x90 && val3 === 0)) // 
    ) {
        // note off
        
    } else if(command === 0xb0) {
        // control change
    }
}