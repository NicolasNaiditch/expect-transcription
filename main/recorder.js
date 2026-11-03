// Écrit l'enregistrement au fil de l'eau : WebM tel que produit par MediaRecorder (image et son, ou son
// seul), et un WAV 16 kHz mono destiné à la transcription. Un arrêt brutal laisse des fichiers relisibles.
// Sans fichier WebM, seul le WAV est écrit : c'est le cas d'un fichier déposé qu'on convertit.
const fs = require('node:fs');

const RATE = 16000;
const sessions = new Map();

function wavHeader(dataBytes) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + dataBytes, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(dataBytes, 40);
  return header;
}

// Retourne le nombre d'échantillons réellement présents, après correction de l'en-tête.
function fixWav(file) {
  if (!fs.existsSync(file)) return 0;
  const bytes = Math.max(0, fs.statSync(file).size - 44) & ~1;
  const handle = fs.openSync(file, 'r+');
  try { fs.writeSync(handle, wavHeader(bytes), 0, 44, 0); } finally { fs.closeSync(handle); }
  return bytes / 2;
}

function start(id, videoFile, audioFile) {
  if (sessions.size) throw new Error('Un enregistrement est déjà en cours.');
  const audio = fs.openSync(audioFile, 'w');
  fs.writeSync(audio, wavHeader(0));
  sessions.set(id, { video: videoFile ? fs.openSync(videoFile, 'w') : null, audio, audioFile, samples: 0, videoBytes: 0 });
}

function session(id) {
  const value = sessions.get(id);
  if (!value) throw new Error('Aucun enregistrement en cours.');
  return value;
}

function appendVideo(id, chunk) {
  const value = session(id), buffer = Buffer.from(chunk);
  if (value.video === null) return;
  fs.writeSync(value.video, buffer);
  value.videoBytes += buffer.length;
}

function appendAudio(id, chunk) {
  const value = session(id), buffer = Buffer.from(chunk);
  fs.writeSync(value.audio, buffer, 0, buffer.length & ~1);
  value.samples += buffer.length >> 1;
}

function finish(id) {
  const value = session(id);
  sessions.delete(id);
  if (value.video !== null) fs.closeSync(value.video);
  fs.closeSync(value.audio);
  const samples = fixWav(value.audioFile);
  return { duree_s: Math.round(samples / RATE), octets_video: value.videoBytes };
}

function active() { return sessions.size > 0; }

module.exports = { start, appendVideo, appendAudio, finish, fixWav, active, RATE };
