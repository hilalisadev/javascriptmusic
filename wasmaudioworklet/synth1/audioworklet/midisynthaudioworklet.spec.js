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
    this.beforeAll(async () => {
        document.documentElement.appendChild(document.createElement('app-javascriptmusic'));
        await waitForAppReady();
    });
    this.afterAll(async () => {
        window.stopaudio();
        window.audioworkletnode = undefined;
        document.documentElement.removeChild(document.querySelector('app-javascriptmusic'));
    });
    it('should create the midisynth', async () => {
        songsourceeditor.doc.setValue(songsource);
        synthsourceeditor.doc.setValue(synthsource);
        const appElement = document.getElementsByTagName('app-javascriptmusic')[0].shadowRoot;
        appElement.querySelector('#startaudiobutton').click();
        while (!window.audioworkletnode) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.isDefined(window.audioworkletnode);
        assert.isNotNull(window.audioworkletnode);
        
        window.audioworkletnode.port.postMessage({
            midishortmsg: [0x90, 69, 100]
        });

        
        const audioCtx = window.audioworkletnode.context;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 32768;
        const  dataArray = new Float32Array(analyser.frequencyBinCount);
        window.audioworkletnode.connect(analyser);

        let loudestfrequency = 0;
        while (loudestfrequency < 400) {
            await new Promise(resolve => setTimeout(resolve, 200));
            analyser.getFloatFrequencyData(dataArray);
            const loudestfrequencyindex = dataArray.reduce((prev, level, ndx) => level > dataArray[prev] ? ndx: prev,0);
            loudestfrequency = (audioCtx.sampleRate / 2) * ( (1 + loudestfrequencyindex) / dataArray.length);
        }
        console.log(loudestfrequency);
        assert.closeTo(loudestfrequency, 440, 0.1);        
    });
})