// Ouvre les sons choisis (et l'image si on la garde), mélange le micro et l'ordinateur, écrit le WebM
// (image et son, ou son seul) et le WAV 16 kHz. Les mesures décrivent un signal, jamais une parole reconnue.
const SILENCE_DB = -55;

function dbfs(analyser, data) {
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (const value of data) sum += value * value;
  return 10 * Math.log10(sum / data.length + 1e-12);
}

function pickMime() {
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
}

export async function openCapture({ image, systemAudio, micro, microId }) {
  // La source a été choisie avant, dans l'app ; Chromium ne propose pas d'autre choix. Sans image gardée,
  // le son de l'ordinateur passe quand même par l'écran, ouvert en très basse définition et jamais écrit.
  const video = image ? { frameRate: { ideal: 15, max: 30 } } : { frameRate: { max: 1 }, width: { max: 320 }, height: { max: 200 } };
  const display = image || systemAudio ? await navigator.mediaDevices.getDisplayMedia({ video, audio: systemAudio }) : null;
  let mic = null;
  if (micro) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: microId ? { exact: microId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (error) {
      display?.getTracks().forEach(track => track.stop());
      throw new Error(error.name === 'NotAllowedError' ? 'Le micro n’est pas autorisé pour Expect Transcription.' : 'Le micro choisi ne répond pas. Branchez-le ou choisissez-en un autre.');
    }
  }
  return { display, mic };
}

export function systemAudioState(display, requested) {
  if (!requested) return 'non-demande';
  const track = display?.getAudioTracks()[0];
  if (!track) return 'refuse';
  // macOS sans autorisation « Audio du système » : la piste naît terminée et muette, sans erreur.
  if (track.readyState === 'ended') return 'muet';
  return 'ok';
}

export class Session {
  constructor({ display, mic, id, image, onVideo, onAudio, onEvent }) {
    Object.assign(this, { display, mic, id, image, onVideo, onAudio, onEvent });
    // Niveau du mélange tous les dixièmes de seconde : le ruban du studio.
    this.history = [];
    this.queue = Promise.resolve();
    this.levels = {};
    this.lastSound = {};
    this.started = 0;
    this.pausedAt = 0;
    this.pausedTotal = 0;
  }

  async start() {
    const context = new AudioContext({ sampleRate: 48000 });
    const speech = new AudioContext({ sampleRate: 16000 });
    await speech.audioWorklet.addModule('pcm-worklet.js');
    const mixed = context.createMediaStreamDestination();
    const worklet = new AudioWorkletNode(speech, 'pcm-16k', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1, channelCountMode: 'explicit' });
    worklet.port.onmessage = event => {
      if (event.data) this.onAudio(event.data);
      else this.flushed?.();
    };
    const inputs = [['ordinateur', this.display?.getAudioTracks()[0]], ['micro', this.mic?.getAudioTracks()[0]]];
    for (const [name, track] of inputs) {
      if (!track || track.readyState === 'ended') continue;
      const stream = new MediaStream([track]);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(stream).connect(analyser);
      analyser.connect(mixed);
      speech.createMediaStreamSource(stream).connect(worklet);
      this.levels[name] = { analyser, data: new Float32Array(analyser.fftSize), db: -100 };
      this.lastSound[name] = performance.now();
      track.addEventListener('ended', () => this.onEvent({ type: 'source-arretee', source: name }));
    }
    const video = this.display?.getVideoTracks()[0];
    video?.addEventListener('ended', () => this.onEvent({ type: 'image-arretee' }));
    this.mix = context.createAnalyser();
    this.mix.fftSize = 2048;
    context.createMediaStreamSource(mixed.stream).connect(this.mix);
    this.mixData = new Float32Array(this.mix.fftSize);
    const tracks = [...(this.image ? this.display.getVideoTracks() : []), ...mixed.stream.getAudioTracks()];
    this.recorder = new MediaRecorder(new MediaStream(tracks), this.image
      ? { mimeType: pickMime(), videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 128_000 }
      : { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 96_000 });
    this.recorder.ondataavailable = event => {
      if (!event.data.size) return;
      this.queue = this.queue.then(() => event.data.arrayBuffer()).then(buffer => this.onVideo(buffer));
    };
    Object.assign(this, { context, speech, worklet });
    this.recorder.start(1000);
    this.started = performance.now();
    this.sampler = setInterval(() => {
      if (this.pausedAt) return;
      this.history.push(Math.max(0, Math.min(1, (dbfs(this.mix, this.mixData) + 60) / 60)));
      if (this.history.length > 600) this.history.splice(0, this.history.length - 600);
    }, 100);
  }

  elapsed() {
    const now = this.pausedAt || performance.now();
    return this.started ? (now - this.started - this.pausedTotal) / 1000 : 0;
  }

  measure() {
    const now = performance.now(), result = {};
    for (const [name, level] of Object.entries(this.levels)) {
      level.db = dbfs(level.analyser, level.data);
      if (level.db > SILENCE_DB) this.lastSound[name] = now;
      result[name] = { db: level.db, silence_s: this.pausedAt ? 0 : (now - this.lastSound[name]) / 1000 };
    }
    return result;
  }

  pause() {
    if (this.pausedAt) return;
    this.recorder.pause();
    this.worklet.port.postMessage('pause');
    this.pausedAt = performance.now();
  }

  resume() {
    if (!this.pausedAt) return;
    this.pausedTotal += performance.now() - this.pausedAt;
    this.pausedAt = 0;
    for (const name of Object.keys(this.lastSound)) this.lastSound[name] = performance.now();
    this.worklet.port.postMessage('reprendre');
    this.recorder.resume();
  }

  // Attend le dernier morceau vidéo et le dernier paquet audio avant de rendre la main.
  async stop() {
    const stopped = new Promise(resolve => { this.recorder.onstop = resolve; });
    const flushed = new Promise(resolve => { this.flushed = resolve; });
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    this.worklet.port.postMessage('vider');
    await Promise.race([Promise.all([stopped, flushed]), new Promise(resolve => setTimeout(resolve, 3000))]);
    await this.queue;
    this.release();
  }

  release() {
    clearInterval(this.sampler);
    for (const stream of [this.display, this.mic]) stream?.getTracks().forEach(track => track.stop());
    this.context?.close();
    this.speech?.close();
  }
}

export async function microphones() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audioinput').map((device, index) => ({ id: device.deviceId, nom: device.label || `Micro ${index + 1}` }));
  } catch {
    return [];
  }
}
