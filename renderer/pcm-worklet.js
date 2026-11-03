// Reçoit le son déjà mélangé, dans un contexte audio à 16 kHz : convertit en PCM 16 bits
// par paquets d'une demi-seconde. Pendant la pause, rien n'est écrit : texte et vidéo restent alignés.
class Pcm16k extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(8000);
    this.length = 0;
    this.paused = false;
    this.port.onmessage = event => {
      if (event.data === 'pause') this.paused = true;
      if (event.data === 'reprendre') this.paused = false;
      if (event.data === 'vider') this.flush();
    };
  }

  flush() {
    if (!this.length) { this.port.postMessage(null); return; }
    const chunk = this.buffer.slice(0, this.length);
    this.length = 0;
    this.port.postMessage(chunk.buffer, [chunk.buffer]);
  }

  process(inputs) {
    const channels = inputs[0];
    if (this.paused || !channels || !channels.length) return true;
    const frames = channels[0].length;
    for (let i = 0; i < frames; i += 1) {
      let value = 0;
      for (const channel of channels) value += channel[i];
      value = Math.max(-1, Math.min(1, value / channels.length));
      this.buffer[this.length++] = value < 0 ? value * 0x8000 : value * 0x7fff;
      if (this.length === this.buffer.length) this.flush();
    }
    return true;
  }
}

registerProcessor('pcm-16k', Pcm16k);
