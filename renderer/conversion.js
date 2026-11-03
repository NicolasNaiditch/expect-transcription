// Prépare le son d'un fichier déposé pour le moteur : WAV 16 kHz mono, écrit par paquets. Tout fichier
// passe par ici, dans l'interface isolée de Chromium : le moteur ne lit jamais que le WAV écrit par l'app.
// WAV, MP3 (WebCodecs, trame par trame), M4A / MP4 / MOV en AAC (WebCodecs, tables d'échantillons) sont
// lus morceau par morceau : la mémoire reste bornée, même pour trois heures. Les autres formats (WEBM,
// Opus, OGG, FLAC, AAC brut) sont décodés d'un bloc, environ 1 Go de mémoire par heure : au-delà de deux
// heures, ou de 600 Mo de fichier, refus clair.
const RATE = 16000;
const BLOCK = 1 << 20;
const extension = name => (name.split('.').pop() || '').toLowerCase();
const stop = signal => { if (signal?.aborted) throw new DOMException('Arrêté', 'AbortError'); };

// Durée lue par Chromium dans les métadonnées, ou 0 si elle est inconnue.
function duree(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file), media = document.createElement(/^video\//.test(file.type) ? 'video' : 'audio');
    const done = value => { URL.revokeObjectURL(url); media.removeAttribute('src'); resolve(Number.isFinite(value) ? value : 0); };
    media.preload = 'metadata';
    media.onloadedmetadata = () => done(media.duration);
    media.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    media.src = url;
  });
}

// Rééchantillonnage vers 16 kHz : filtre passe-bas en sinus cardinal fenêtré (Blackman), au fil de l'eau.
// Les coefficients sont précalculés pour 256 positions entre deux échantillons.
const PHASES = 256, HALF = 16;
class Reechantillonneur {
  constructor(rate, onPcm) {
    this.step = rate / RATE;
    const cutoff = Math.min(1, RATE / rate) * 0.9;
    this.table = new Float32Array(PHASES * 2 * HALF);
    for (let phase = 0; phase < PHASES; phase += 1) {
      let total = 0;
      for (let k = -HALF + 1; k <= HALF; k += 1) {
        const x = k - phase / PHASES, sinc = x === 0 ? 1 : Math.sin(Math.PI * cutoff * x) / (Math.PI * cutoff * x);
        const value = sinc * (0.42 + 0.5 * Math.cos(Math.PI * x / HALF) + 0.08 * Math.cos(2 * Math.PI * x / HALF));
        this.table[phase * 2 * HALF + k + HALF - 1] = value; total += value;
      }
      for (let k = 0; k < 2 * HALF; k += 1) this.table[phase * 2 * HALF + k] /= total;
    }
    this.buffer = new Float32Array(0);
    this.position = HALF;
    this.onPcm = onPcm;
  }

  push(samples) {
    const merged = new Float32Array(this.buffer.length + samples.length);
    merged.set(this.buffer); merged.set(samples, this.buffer.length);
    const room = Math.max(0, Math.ceil((merged.length - HALF - 1 - this.position) / this.step));
    const pcm = new Int16Array(room);
    let written = 0;
    while (this.position + HALF + 1 < merged.length && written < room) {
      const center = Math.floor(this.position), row = Math.floor((this.position - center) * PHASES) * 2 * HALF, base = center - HALF + 1;
      let sum = 0;
      for (let k = 0; k < 2 * HALF; k += 1) sum += merged[base + k] * this.table[row + k];
      const v = Math.max(-1, Math.min(1, sum));
      pcm[written++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      this.position += this.step;
    }
    const keep = Math.max(0, Math.floor(this.position) - HALF);
    this.buffer = merged.slice(keep);
    this.position -= keep;
    if (written) this.onPcm(pcm.slice(0, written).buffer);
  }
}

function mono(channels) {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const channel of channels) for (let i = 0; i < out.length; i += 1) out[i] += channel[i] / channels.length;
  return out;
}

async function bytes(file, start, length) {
  return new DataView(await file.slice(start, start + length).arrayBuffer());
}

/* ---------- WebCodecs : décodage par paquets, avec contre-pression ---------- */

// `chunks` est un itérateur asynchrone de { data, progress } ; chaque paquet est une trame complète.
async function decoder(config, chunks, { onPcm, onProgress, signal }) {
  if (!window.AudioDecoder || !(await AudioDecoder.isConfigSupported(config)).supported) throw new Error('décodeur indisponible');
  let resampler = null, failure = null, index = 0;
  const audio = new AudioDecoder({
    output: data => {
      try {
        resampler ||= new Reechantillonneur(data.sampleRate, onPcm);
        const planes = [];
        for (let c = 0; c < data.numberOfChannels; c += 1) {
          const plane = new Float32Array(data.numberOfFrames);
          data.copyTo(plane, { planeIndex: c, format: 'f32-planar' });
          planes.push(plane);
        }
        resampler.push(mono(planes));
      } finally { data.close(); }
    },
    error: error => { failure = error; }
  });
  audio.configure(config);
  const per = 1e6 * 1024 / config.sampleRate;
  try {
    for await (const chunk of chunks) {
      stop(signal);
      if (failure) throw failure;
      audio.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(index++ * per), data: chunk.data }));
      while (audio.decodeQueueSize > 64) await new Promise(resolve => audio.addEventListener('dequeue', resolve, { once: true }));
      if (chunk.progress !== undefined) onProgress(chunk.progress);
    }
    await audio.flush();
    if (failure) throw failure;
  } finally {
    if (audio.state !== 'closed') audio.close();
  }
}

/* ---------- MP4, M4A, MOV : tables d'échantillons, bornées ---------- */

// Parcourt les boîtes d'un niveau : [type, début des données, fin].
function* boxes(view, start, end) {
  let at = start;
  while (at + 8 <= end) {
    let size = view.getUint32(at), header = 8;
    const type = String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5), view.getUint8(at + 6), view.getUint8(at + 7));
    if (size === 1) { size = Number(view.getBigUint64(at + 8)); header = 16; }
    if (size === 0) size = end - at;
    if (size < header) return;
    yield [type, at + header, Math.min(end, at + size)];
    at += size;
  }
}

function child(view, start, end, path) {
  let range = [start, end];
  for (const name of path) {
    const found = [...boxes(view, range[0], range[1])].find(([type]) => type === name);
    if (!found) return null;
    range = [found[1], found[2]];
  }
  return range;
}

// Descripteur MPEG-4 de l'esds : la configuration AAC (AudioSpecificConfig) est sous l'étiquette 5.
function audioSpecificConfig(view, start, end) {
  let at = start + 4;
  const length = () => { let value = 0; for (let i = 0; i < 4; i += 1) { const b = view.getUint8(at++); value = (value << 7) | (b & 0x7f); if (!(b & 0x80)) break; } return value; };
  while (at < end) {
    const tag = view.getUint8(at++), size = length();
    if (tag === 3) { at += 3; continue; }
    if (tag === 4) { at += 13; continue; }
    if (tag === 5) return new Uint8Array(view.buffer, view.byteOffset + at, Math.min(size, end - at)).slice();
    at += size;
  }
  return null;
}

// Plafonds contre un fichier piégé : table de 64 Mo, 5 millions d'échantillons, 1 Mo par échantillon.
const MOOV_MAX = 64 << 20, SAMPLES_MAX = 5e6, SAMPLE_MAX = 1 << 20;
const capped = (count, box, header, entry) => Math.min(count, Math.floor((box[1] - box[0] - header) / entry));

async function lireMp4(file) {
  let moov = null;
  for (let at = 0; at + 8 <= file.size;) {
    const head = await bytes(file, at, 16);
    let size = head.getUint32(0);
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
    if (size === 1) size = Number(head.getBigUint64(8));
    if (size === 0) size = file.size - at;
    if (size < 8) break;
    if (type === 'moov') {
      if (size > MOOV_MAX) throw new Error('table MP4 trop grande');
      moov = await bytes(file, at, size);
      break;
    }
    at += size;
  }
  if (!moov) throw new Error('fichier MP4 sans table');
  for (const [type, start, end] of boxes(moov, 8, moov.byteLength)) {
    if (type !== 'trak') continue;
    const hdlr = child(moov, start, end, ['mdia', 'hdlr']);
    if (!hdlr || hdlr[1] - hdlr[0] < 12 || String.fromCharCode(...new Uint8Array(moov.buffer, moov.byteOffset + hdlr[0] + 8, 4)) !== 'soun') continue;
    const stbl = child(moov, start, end, ['mdia', 'minf', 'stbl']);
    const stsd = stbl && child(moov, stbl[0], stbl[1], ['stsd']);
    const first = stsd && [...boxes(moov, stsd[0] + 8, stsd[1])][0];
    if (!first || first[0] !== 'mp4a') throw new Error('piste son non AAC');
    const [, entryStart, entryEnd] = first;
    const channels = moov.getUint16(entryStart + 16), sampleRate = moov.getUint32(entryStart + 24) >>> 16;
    const esds = child(moov, entryStart + 28, entryEnd, ['esds']);
    const config = esds && audioSpecificConfig(moov, esds[0], esds[1]);
    if (!config?.length) throw new Error('configuration AAC absente');
    const stsz = child(moov, stbl[0], stbl[1], ['stsz']), stsc = child(moov, stbl[0], stbl[1], ['stsc']);
    const stco = child(moov, stbl[0], stbl[1], ['stco']), co64 = child(moov, stbl[0], stbl[1], ['co64']), offsetsBox = stco || co64;
    if (!stsz || !stsc || !offsetsBox) throw new Error('tables MP4 incomplètes');
    const fixed = moov.getUint32(stsz[0] + 4);
    const count = Math.min(SAMPLES_MAX, fixed ? moov.getUint32(stsz[0] + 8) : capped(moov.getUint32(stsz[0] + 8), stsz, 12, 4));
    const chunks = capped(moov.getUint32(offsetsBox[0] + 4), offsetsBox, 8, co64 && !stco ? 8 : 4);
    const runs = Array.from({ length: capped(moov.getUint32(stsc[0] + 4), stsc, 8, 12) }, (_, i) => ({ first: moov.getUint32(stsc[0] + 8 + i * 12), per: moov.getUint32(stsc[0] + 12 + i * 12) }));
    if (!runs.length) throw new Error('tables MP4 incomplètes');
    const samples = [];
    let sample = 0, run = 0;
    for (let c = 0; c < chunks && sample < count; c += 1) {
      while (run + 1 < runs.length && runs[run + 1].first <= c + 1) run += 1;
      let offset = co64 && !stco ? Number(moov.getBigUint64(offsetsBox[0] + 8 + c * 8)) : moov.getUint32(offsetsBox[0] + 8 + c * 4);
      for (let s = 0; s < runs[run].per && sample < count; s += 1) {
        const size = fixed || moov.getUint32(stsz[0] + 12 + sample * 4);
        if (size > SAMPLE_MAX || offset + size > file.size) throw new Error('échantillon hors du fichier');
        samples.push({ offset, size }); offset += size; sample += 1;
      }
    }
    return { config: { codec: `mp4a.40.${(config[0] >> 3) || 2}`, sampleRate, numberOfChannels: channels, description: config }, samples };
  }
  throw new Error('aucune piste son');
}

async function* echantillonsMp4(file, samples) {
  for (let index = 0; index < samples.length;) {
    // Un bloc d'environ 1 Mo lu d'un coup, quand les échantillons se suivent dans le fichier.
    let last = index;
    while (last + 1 < samples.length && samples[last + 1].offset === samples[last].offset + samples[last].size
      && samples[last + 1].offset + samples[last + 1].size - samples[index].offset < BLOCK) last += 1;
    const start = samples[index].offset, block = new Uint8Array(await file.slice(start, samples[last].offset + samples[last].size).arrayBuffer());
    for (let i = index; i <= last; i += 1) {
      yield { data: block.subarray(samples[i].offset - start, samples[i].offset - start + samples[i].size), progress: i === last ? (last + 1) / samples.length : undefined };
    }
    index = last + 1;
  }
}

async function convertirMp4(file, options) {
  const track = await lireMp4(file);
  await decoder(track.config, echantillonsMp4(file, track.samples), options);
}

/* ---------- MP3 : trames MPEG Layer III ---------- */

const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
const MP3_BITRATES = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };

// En-tête d'une trame Layer III : longueur, fréquence et voies, ou null.
function trameMp3(b, at) {
  if (b[at] !== 0xff || (b[at + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[at + 1] >> 3) & 3, layer = (b[at + 1] >> 1) & 3, bitrate = b[at + 2] >> 4, rate = (b[at + 2] >> 2) & 3;
  if (version === 1 || layer !== 1 || bitrate === 0 || bitrate === 15 || rate === 3) return null;
  const kbps = MP3_BITRATES[version === 3 ? 1 : 2][bitrate], sampleRate = MP3_RATES[version][rate], padding = (b[at + 2] >> 1) & 1;
  return { length: Math.floor((version === 3 ? 144000 : 72000) * kbps / sampleRate) + padding, sampleRate, channels: (b[at + 3] >> 6) === 3 ? 1 : 2 };
}

async function* tramesMp3(file, start) {
  let carry = new Uint8Array(0), position = start;
  while (position < file.size || carry.length) {
    const fresh = position < file.size ? new Uint8Array(await file.slice(position, position + BLOCK).arrayBuffer()) : new Uint8Array(0);
    position += fresh.length;
    const b = new Uint8Array(carry.length + fresh.length);
    b.set(carry); b.set(fresh, carry.length);
    let at = 0;
    while (at + 4 <= b.length) {
      const frame = trameMp3(b, at);
      if (!frame) { at += 1; continue; }
      if (at + frame.length > b.length) break;
      yield { data: b.subarray(at, at + frame.length), progress: Math.min(1, (position - b.length + at) / file.size) };
      at += frame.length;
    }
    carry = b.slice(at);
    if (!fresh.length) break;
  }
}

async function convertirMp3(file, options) {
  const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  // Étiquette ID3v2 en tête : sa taille est codée sur 4 × 7 bits.
  const start = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33 ? 10 + ((head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]) : 0;
  let first = null;
  const probe = new Uint8Array(await file.slice(start, start + 64 * 1024).arrayBuffer());
  for (let at = 0; at + 4 <= probe.length && !first; at += 1) first = trameMp3(probe, at);
  if (!first) throw new Error('aucune trame MP3 lisible');
  await decoder({ codec: 'mp3', sampleRate: first.sampleRate, numberOfChannels: first.channels }, tramesMp3(file, start), options);
}

/* ---------- WAV : lu tel quel, converti au fil de l'eau ---------- */

async function convertirWav(file, { onPcm, onProgress, signal }) {
  const view = await bytes(file, 0, Math.min(file.size, 1 << 16));
  const tag = at => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));
  if (view.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('en-tête WAV absent');
  let format = null, data = null;
  for (let at = 12; at + 8 <= view.byteLength && !data;) {
    const id = tag(at), size = view.getUint32(at + 4, true);
    if (id === 'fmt ' && at + 24 <= view.byteLength) {
      let code = view.getUint16(at + 8, true);
      if (code === 0xfffe && at + 34 <= view.byteLength) code = view.getUint16(at + 32, true);
      format = { code, channels: view.getUint16(at + 10, true), rate: view.getUint32(at + 12, true), align: view.getUint16(at + 20, true), bits: view.getUint16(at + 22, true) };
    }
    if (id === 'data') data = { start: at + 8, size: Math.min(size, file.size - at - 8) };
    at += 8 + size + (size & 1);
  }
  if (!format || !data || !format.channels || !format.rate || !format.align || ![1, 3].includes(format.code) || ![8, 16, 24, 32].includes(format.bits)) throw new Error('format WAV non pris en charge');
  const width = format.bits / 8, resampler = new Reechantillonneur(format.rate, onPcm);
  const step = Math.floor(BLOCK / format.align) * format.align;
  for (let offset = 0; offset < data.size; offset += step) {
    stop(signal);
    const block = await bytes(file, data.start + offset, Math.min(step, data.size - offset));
    const frames = Math.floor(block.byteLength / format.align), out = new Float32Array(frames);
    for (let f = 0; f < frames; f += 1) {
      let sum = 0;
      for (let c = 0; c < format.channels; c += 1) {
        const at = f * format.align + c * width;
        sum += format.code === 3 ? (width === 4 ? block.getFloat32(at, true) : 0)
          : width === 1 ? (block.getUint8(at) - 128) / 128
          : width === 2 ? block.getInt16(at, true) / 32768
          : width === 3 ? ((block.getUint8(at) | (block.getUint8(at + 1) << 8) | (block.getInt8(at + 2) << 16)) / 8388608)
          : block.getInt32(at, true) / 2147483648;
      }
      out[f] = sum / format.channels;
    }
    resampler.push(out);
    onProgress(Math.min(1, (offset + block.byteLength) / data.size));
  }
}

/* ---------- Autres formats : décodage d'un bloc, borné ---------- */

async function convertirBloc(file, { onPcm, onProgress, signal }) {
  const seconds = await duree(file);
  if (seconds > 2 * 3600 || file.size > 600e6 || (!seconds && file.size > 200e6)) {
    throw new Error('Ce fichier est trop long pour être lu d’un bloc dans ce format. Enregistrez-le en MP3, M4A ou WAV, puis déposez-le de nouveau.');
  }
  onProgress(0.05);
  const context = new OfflineAudioContext(1, RATE, RATE);
  const buffer = await context.decodeAudioData(await file.arrayBuffer());
  stop(signal);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const step = RATE * 30;
  for (let at = 0; at < buffer.length; at += step) {
    const pcm = new Int16Array(Math.min(step, buffer.length - at));
    for (let i = 0; i < pcm.length; i += 1) {
      let v = 0;
      for (const channel of channels) v += channel[at + i];
      v = Math.max(-1, Math.min(1, v / channels.length));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    onPcm(pcm.buffer);
    onProgress(0.05 + 0.95 * (at + pcm.length) / buffer.length);
  }
}

const PAR_MORCEAUX = { wav: convertirWav, mp3: convertirMp3, m4a: convertirMp4, mp4: convertirMp4, mov: convertirMp4 };

/** Convertit un fichier en WAV 16 kHz : `onPcm` reçoit des paquets PCM 16 bits, `onProgress` une fraction. */
export async function convertir(file, options) {
  const direct = PAR_MORCEAUX[extension(file.name)];
  if (direct) {
    let sent = false;
    try { return await direct(file, { ...options, onPcm: buffer => { sent = true; options.onPcm(buffer); } }); }
    catch (error) {
      // Variante non prise en charge (MP3 Layer II, MP4 sans AAC…) : repli sur le décodage d'un bloc.
      // Un échec en cours de route ne se rattrape pas : le début serait écrit deux fois.
      if (error.name === 'AbortError') throw error;
      if (sent) throw new Error('Le son de ce fichier n’a pas pu être lu jusqu’au bout. Essayez de l’enregistrer en MP3, puis déposez-le de nouveau.');
    }
  }
  try {
    return await convertirBloc(file, options);
  } catch (error) {
    if (error.name === 'AbortError' || /trop long/.test(error.message)) throw error;
    throw new Error('Le son de ce fichier n’a pas pu être lu. Essayez de l’enregistrer en MP3 ou en WAV, puis déposez-le de nouveau.');
  }
}
