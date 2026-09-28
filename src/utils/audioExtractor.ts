/**
 * Audio Track Extractor & Processor for Web Applications
 * Uses standard Web Audio API (AudioContext & OfflineAudioContext)
 * to extract, resample to 16kHz mono speech format, and encode into WAV.
 */

export interface ExtractedAudioResult {
  audioBlob: Blob;
  audioBase64: string;
  audioUrl: string;
  durationSeconds: number;
  sampleRate: number;
  fileSizeBytes: number;
  formattedSize: string;
}

/**
 * Format bytes into human readable KB/MB
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Encodes Float32 mono audio samples into a standard 16-bit PCM RIFF WAV Blob.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // Write WAV RIFF header
  // "RIFF"
  writeString(view, 0, 'RIFF');
  // file length - 8
  view.setUint32(4, 36 + samples.length * 2, true);
  // "WAVE"
  writeString(view, 8, 'WAVE');
  // "fmt " chunk
  writeString(view, 12, 'fmt ');
  // Subchunk1Size (16 for PCM)
  view.setUint32(16, 16, true);
  // AudioFormat (1 for PCM)
  view.setUint16(20, 1, true);
  // NumChannels (1 = Mono)
  view.setUint16(22, 1, true);
  // SampleRate (e.g. 16000)
  view.setUint32(24, sampleRate, true);
  // ByteRate (SampleRate * NumChannels * BitsPerSample/8) = sampleRate * 1 * 2
  view.setUint32(28, sampleRate * 2, true);
  // BlockAlign (NumChannels * BitsPerSample/8) = 1 * 2 = 2
  view.setUint16(32, 2, true);
  // BitsPerSample (16 bits)
  view.setUint16(34, 16, true);
  // "data" chunk header
  writeString(view, 36, 'data');
  // Subchunk2Size (data bytes)
  view.setUint32(40, samples.length * 2, true);

  // Write 16-bit PCM audio samples (clamped between -1 and +1)
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Converts a Blob to a base64 encoded string (without the data URL prefix)
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1] || '';
        resolve(base64);
      } else {
        reject(new Error('Failed to convert blob to base64'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Extracts audio track from a video File or Blob in the browser using Web Audio API,
 * downmixes to 16kHz mono (speech-optimized), and packages into WAV.
 */
export async function extractAudioFromVideoFile(
  videoFile: Blob | File,
  onProgress?: (status: string) => void
): Promise<ExtractedAudioResult> {
  onProgress?.('ভিডিও ফাইল বা লিঙ্ক থেকে অডিও ডেটা রিড করা হচ্ছে... (Reading video data...)');

  // 1. Read file as ArrayBuffer
  const arrayBuffer = await videoFile.arrayBuffer();

  onProgress?.('অডিও ট্র্যাক ডিকোড করা হচ্ছে... (Decoding audio stream...)');

  // 2. Decode using native AudioContext
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('Web Audio API is not supported in this browser.');
  }

  const audioCtx = new AudioContextClass();
  let decodedAudio: AudioBuffer;

  try {
    decodedAudio = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (err: any) {
    audioCtx.close();
    throw new Error(
      'ভিডিওটিতে কোনো অডিও ট্র্যাক পাওয়া যায়নি অথবা অডিও ফরম্যাটটি সমর্থিত নয়। (No valid audio track found in this video).'
    );
  } finally {
    if (audioCtx.state !== 'closed') {
      audioCtx.close();
    }
  }

  if (decodedAudio.numberOfChannels === 0 || decodedAudio.duration === 0) {
    throw new Error('ভিডিওটির অডিও ট্র্যাক খালি। (The audio track in this video is empty).');
  }

  const duration = decodedAudio.duration;
  const targetSampleRate = 16000; // 16kHz speech recognition standard

  onProgress?.('১৬kHz স্পিচ-অপ্টিমাইজেশন ও নয়েজ ফিল্টারিং হচ্ছে... (Resampling 16kHz mono...)');

  // 3. Resample & downmix to 16kHz Mono using OfflineAudioContext (hardware accelerated)
  const targetLength = Math.ceil(duration * targetSampleRate);
  const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);

  const bufferSource = offlineCtx.createBufferSource();
  bufferSource.buffer = decodedAudio;
  bufferSource.connect(offlineCtx.destination);
  bufferSource.start(0);

  const resampledBuffer = await offlineCtx.startRendering();
  const monoSamples = resampledBuffer.getChannelData(0);

  onProgress?.('WAV অডিও ট্র্যাক ও স্পিচ প্যাকেজিং তৈরি হচ্ছে... (Encoding WAV audio...)');

  // 4. Encode to standard WAV
  const wavBlob = encodeWav(monoSamples, targetSampleRate);
  const audioUrl = URL.createObjectURL(wavBlob);
  const audioBase64 = await blobToBase64(wavBlob);

  return {
    audioBlob: wavBlob,
    audioBase64,
    audioUrl,
    durationSeconds: duration,
    sampleRate: targetSampleRate,
    fileSizeBytes: wavBlob.size,
    formattedSize: formatBytes(wavBlob.size),
  };
}

/**
 * Generate standard SRT format subtitles from transcript segments
 */
export function generateSrt(segments: Array<{ start: number; end?: number; text: string; speaker?: string }>): string {
  let srt = '';
  segments.forEach((seg, index) => {
    const startTime = formatSrtTime(seg.start);
    const endTime = formatSrtTime(seg.end ?? seg.start + 3);
    const speakerPrefix = seg.speaker ? `[${seg.speaker}] ` : '';
    srt += `${index + 1}\n`;
    srt += `${startTime} --> ${endTime}\n`;
    srt += `${speakerPrefix}${seg.text.trim()}\n\n`;
  });
  return srt;
}

/**
 * Format seconds into SRT timestamp HH:MM:SS,mmm
 */
function formatSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(millis, 3)}`;
}
