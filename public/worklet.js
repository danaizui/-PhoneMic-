/**
 * 把麦克风的浮点采样攒成固定长度的 Int16 帧，发回主线程。
 * 放在 AudioWorklet 里跑，不占主线程，采样不会因为界面卡顿而丢。
 */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    const frameMs = opts.frameMs || 20;
    this.frame = Math.max(128, Math.round((sampleRate * frameMs) / 1000));
    this.acc = new Float32Array(this.frame);
    this.n = 0;
    this.gain = 1;
    this.muted = false;

    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (typeof d.gain === 'number') this.gain = d.gain;
      if (typeof d.muted === 'boolean') this.muted = d.muted;
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const ch = input[0];
    if (!ch) return true;

    let i = 0;
    while (i < ch.length) {
      const take = Math.min(this.frame - this.n, ch.length - i);
      this.acc.set(ch.subarray(i, i + take), this.n);
      this.n += take;
      i += take;

      if (this.n === this.frame) {
        const out = new Int16Array(this.frame);
        if (!this.muted) {
          const g = this.gain;
          for (let k = 0; k < this.frame; k++) {
            let v = this.acc[k] * g;
            if (v > 1) v = 1;
            else if (v < -1) v = -1;
            out[k] = v < 0 ? v * 0x8000 : v * 0x7fff;
          }
        }
        this.port.postMessage(out.buffer, [out.buffer]);
        this.n = 0;
      }
    }
    return true;
  }
}

registerProcessor('capture', CaptureProcessor);
