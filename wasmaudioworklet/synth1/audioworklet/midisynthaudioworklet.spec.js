import { waitForAppReady } from '../../app.js';
import { songsourceeditor, synthsourceeditor } from '../../editorcontroller.js';

const synthsource = `
import { midichannels, MidiChannel, MidiVoice , SineOscillator, Envelope, notefreq } from './globalimports';

let signal: f32 = 0;

class SimpleSine extends MidiVoice {
    osc: SineOscillator = new SineOscillator();
    env: Envelope = new Envelope(0.0, 0.0, 1.0, 0.1);

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
        signal = this.osc.next() * this.env.next() * this.velocity / 256;        
    }
}

midichannels[0] = new MidiChannel([
    new SimpleSine()
]);

@inline
export function fillFrame(leftSampleBufferPtr: usize, rightSampleBufferPtr: usize): void {
    store<f32>(leftSampleBufferPtr, signal);
    store<f32>(rightSampleBufferPtr, signal);
}
`;

const songsource = `
setBPM(100);
`;

describe('midisynth audio worklet', async function() {
    this.timeout(20000);

    let appElement;
    let analyser;
    let audioCtx;
    let dataArray;

    this.beforeAll(async () => {
        document.documentElement.appendChild(document.createElement('app-javascriptmusic'));
        await waitForAppReady();
        appElement = document.getElementsByTagName('app-javascriptmusic')[0].shadowRoot;
    });
    this.afterAll(async () => {
        window.stopaudio();
        window.audioworkletnode = undefined;
        document.documentElement.removeChild(document.querySelector('app-javascriptmusic'));
    });
    it('should create the midisynth and play a note', async () => {
        songsourceeditor.doc.setValue(songsource);
        synthsourceeditor.doc.setValue(synthsource);

        appElement.querySelector('#startaudiobutton').click();
        while (!window.audioworkletnode) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.isDefined(window.audioworkletnode);
        assert.isNotNull(window.audioworkletnode);
        
        window.audioworkletnode.port.postMessage({
            midishortmsg: [0x90, 69, 100]
        });
        
        audioCtx = window.audioworkletnode.context;
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 32768;
        dataArray = new Float32Array(analyser.frequencyBinCount);
        window.audioworkletnode.connect(analyser);

        let loudestfrequency = 0;
        let level = -100;
        while (loudestfrequency < 400 || level < -30) {
            await new Promise(resolve => setTimeout(resolve, 200));
            analyser.getFloatFrequencyData(dataArray);
            const loudestfrequencyindex = dataArray.reduce((prev, level, ndx) => level > dataArray[prev] ? ndx: prev,0);
            loudestfrequency = (audioCtx.sampleRate / 2) * ( (1 + loudestfrequencyindex) / dataArray.length);
            level = dataArray[loudestfrequencyindex];
        }
        console.log(loudestfrequency);
        assert.closeTo(loudestfrequency, 440, 0.1);
    });
    it('should hotswap the midisynth wasm binary', async () => {
        synthsourceeditor.doc.setValue(synthsource.replace('notefreq(note)','notefreq(note+12)'));
        appElement.querySelector('#savesongbutton').click();

        let level = 0;
        console.log('waiting for audio to stop after WASM hotswap');
        while (level > -30) {
            await new Promise(resolve => setTimeout(resolve, 200));
            analyser.getFloatFrequencyData(dataArray);
            const loudestfrequencyindex = dataArray.reduce((prev, level, ndx) => level > dataArray[prev] ? ndx: prev,0);
            level = dataArray[loudestfrequencyindex];
        }
        assert.isBelow(level, -30, 'note should be stopped on WASM hotswap');
        
        window.audioworkletnode.port.postMessage({
            midishortmsg: [0x90, 69, 100]
        });
        let loudestfrequency = 440;

        console.log('waiting for audio to start after WASM hotswap')
        while (loudestfrequency < 500) {
            await new Promise(resolve => setTimeout(resolve, 200));
            analyser.getFloatFrequencyData(dataArray);
            const loudestfrequencyindex = dataArray.reduce((prev, level, ndx) => level > dataArray[prev] ? ndx: prev,0);
            loudestfrequency = (audioCtx.sampleRate / 2) * ( (1 + loudestfrequencyindex) / dataArray.length);
        }
        console.log(loudestfrequency);
        assert.closeTo(loudestfrequency,
            880, 0.2,
            'Note frequency should be one octave up after WASM hotswap');

        analyser.disconnect();
    });
})