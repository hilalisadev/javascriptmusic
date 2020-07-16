const SAMPLE_FRAMES = 128;

class AssemblyScriptMidiSynthAudioWorkletProcessor extends AudioWorkletProcessor {

  constructor() {
    super();
    this.processorActive = true;

    this.port.onmessage = async (msg) => {
        if(msg.data.wasm) {
          this.wasmInstancePromise = WebAssembly.instantiate(msg.data.wasm, {
            environment: { SAMPLERATE: msg.data.samplerate },
            env: {
              abort: () => console.log('webassembly synth abort, should not happen')
            }
          });
          this.wasmInstance = (await this.wasmInstancePromise).instance.exports;
        }
        
        if(msg.data.midishortmsg) {
            (await this.wasmInstancePromise).instance.exports.shortmessage(
                msg.data.midishortmsg[0],
                msg.data.midishortmsg[1],
                msg.data.midishortmsg[2]
            );
        }

        if (msg.data.terminate) {
          this.processorActive = false;
        }
    };
    this.port.start();
  }  

  process(inputs, outputs, parameters) {
    const output = outputs[0];

    if (this.wasmInstance) {
      this.wasmInstance.fillSampleBuffer();
      output[0].set(new Float32Array(this.wasmInstance.memory.buffer,
        this.wasmInstance.samplebuffer,
        SAMPLE_FRAMES));
      output[1].set(new Float32Array(this.wasmInstance.memory.buffer,
        this.wasmInstance.samplebuffer + (SAMPLE_FRAMES * 4),
        SAMPLE_FRAMES));
    }
  
    return this.processorActive;
  }
}

registerProcessor('asc-midisynth-audio-worklet-processor', AssemblyScriptMidiSynthAudioWorkletProcessor);
