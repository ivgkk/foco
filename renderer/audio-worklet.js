class PcmLoopbackPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blocks = [];
    this.blockOffset = 0;
    this.port.onmessage = ({ data }) => {
      if (data instanceof Int16Array && data.length) this.blocks.push(data);
    };
  }
  process(_inputs, outputs) {
    const channels = outputs[0];
    if (!channels || !channels.length) return true;
    const left = channels[0];
    const right = channels[1] || left;
    for (let i = 0; i < left.length; i++) {
      const block = this.blocks[0];
      if (!block) { left[i] = 0; if (right !== left) right[i] = 0; continue; }
      const sampleL = block[this.blockOffset] / 32768;
      const sampleR = block[this.blockOffset + 1] / 32768;
      left[i] = sampleL;
      if (right !== left) right[i] = sampleR;
      this.blockOffset += 2;
      if (this.blockOffset >= block.length) { this.blocks.shift(); this.blockOffset = 0; }
    }
    return true;
  }
}
registerProcessor('pcm-loopback-player', PcmLoopbackPlayer);
