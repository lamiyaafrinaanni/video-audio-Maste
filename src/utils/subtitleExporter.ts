/**
 * Subtitle and Transcript Export Utility
 * Converts transcript segments into multiple standard subtitle & text formats:
 * - Plain Text (.txt)
 * - JSON (.json)
 * - SubRip Subtitles (.srt)
 * - WebVTT (.vtt)
 * - YouTube Subtitles (.sbv)
 * - SubViewer (.sub)
 * - Lyrics (.lrc)
 */

import { TranscriptSegment, VideoTranscript } from '../types';

function padZero(num: number, length: number = 2): string {
  return String(num).padStart(length, '0');
}

/**
 * Format seconds to HH:MM:SS,mmm (SRT format)
 */
export function formatSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  return `${padZero(hrs)}:${padZero(mins)}:${padZero(secs)},${padZero(millis, 3)}`;
}

/**
 * Format seconds to HH:MM:SS.mmm (WebVTT format)
 */
export function formatVttTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  return `${padZero(hrs)}:${padZero(mins)}:${padZero(secs)}.${padZero(millis, 3)}`;
}

/**
 * Format seconds to H:MM:SS.mmm (YouTube SBV format)
 */
export function formatSbvTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.floor((seconds % 1) * 1000);
  return `${hrs}:${padZero(mins)}:${padZero(secs)}.${padZero(millis, 3)}`;
}

/**
 * Format seconds to HH:MM:SS.mm (SubViewer .sub format)
 */
export function formatSubTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.floor(((seconds % 1) * 100));
  return `${padZero(hrs)}:${padZero(mins)}:${padZero(secs)}.${padZero(centis, 2)}`;
}

/**
 * Format seconds to [MM:SS.xx] (LRC Lyric format)
 */
export function formatLrcTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const centis = Math.floor(((seconds % 1) * 100));
  return `[${padZero(mins)}:${padZero(secs)}.${padZero(centis, 2)}]`;
}

/**
 * Generate SRT Subtitle string
 */
export function generateSrt(segments: TranscriptSegment[]): string {
  let srt = '';
  segments.forEach((seg, index) => {
    const start = formatSrtTime(seg.start);
    const end = formatSrtTime(seg.end ?? seg.start + 3);
    const speaker = seg.speaker ? `[${seg.speaker}] ` : '';
    srt += `${index + 1}\n`;
    srt += `${start} --> ${end}\n`;
    srt += `${speaker}${seg.text.trim()}\n\n`;
  });
  return srt;
}

/**
 * Generate WebVTT (.vtt) Subtitle string
 */
export function generateVtt(segments: TranscriptSegment[]): string {
  let vtt = 'WEBVTT\n\n';
  segments.forEach((seg, index) => {
    const start = formatVttTime(seg.start);
    const end = formatVttTime(seg.end ?? seg.start + 3);
    const speaker = seg.speaker ? `<v ${seg.speaker}>` : '';
    vtt += `${index + 1}\n`;
    vtt += `${start} --> ${end}\n`;
    vtt += `${speaker}${seg.text.trim()}\n\n`;
  });
  return vtt;
}

/**
 * Generate YouTube Subtitle (.sbv) string
 */
export function generateSbv(segments: TranscriptSegment[]): string {
  let sbv = '';
  segments.forEach((seg) => {
    const start = formatSbvTime(seg.start);
    const end = formatSbvTime(seg.end ?? seg.start + 3);
    const speaker = seg.speaker ? `[${seg.speaker}] ` : '';
    sbv += `${start},${end}\n`;
    sbv += `${speaker}${seg.text.trim()}\n\n`;
  });
  return sbv;
}

/**
 * Generate SubViewer (.sub) string
 */
export function generateSub(segments: TranscriptSegment[], title = 'Video Transcript'): string {
  let sub = `[INFORMATION]\n[TITLE]${title}\n[AUTHOR]Video Insight AI\n[SOURCE]Extracted Audio Transcript\n[FORMAT]100\n[VERSION]1.00\n\n`;
  segments.forEach((seg) => {
    const start = formatSubTime(seg.start);
    const end = formatSubTime(seg.end ?? seg.start + 3);
    const speaker = seg.speaker ? `[${seg.speaker}] ` : '';
    sub += `${start},${end}\n`;
    sub += `${speaker}${seg.text.trim()}\n\n`;
  });
  return sub;
}

/**
 * Generate Lyric File (.lrc) string
 */
export function generateLrc(segments: TranscriptSegment[], title = 'Video Transcript'): string {
  let lrc = `[ti:${title}]\n[ar:Video Insight AI]\n[al:Audio Transcript]\n[by:Video Insight AI]\n\n`;
  segments.forEach((seg) => {
    const timestamp = formatLrcTime(seg.start);
    const speaker = seg.speaker ? `${seg.speaker}: ` : '';
    lrc += `${timestamp}${speaker}${seg.text.trim()}\n`;
  });
  return lrc;
}

/**
 * Generate JSON export string
 */
export function generateJson(transcript: VideoTranscript, title = 'Video Transcript'): string {
  const exportObject = {
    title,
    exportedAt: new Date().toISOString(),
    durationSeconds: transcript.durationSeconds || 0,
    languageDetected: transcript.languageDetected || 'auto',
    fullText: transcript.fullText,
    totalSegments: transcript.segments.length,
    segments: transcript.segments.map((seg, i) => ({
      index: i + 1,
      id: seg.id,
      start: seg.start,
      end: seg.end ?? seg.start + 3,
      timestamp: seg.timestamp,
      speaker: seg.speaker || 'Speaker',
      text: seg.text,
    })),
  };
  return JSON.stringify(exportObject, null, 2);
}

/**
 * Helper to download content as a file download prompt
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type SubtitleFormat = 'txt' | 'json' | 'srt' | 'vtt' | 'sbv' | 'sub' | 'lrc';

/**
 * Master download function for any supported subtitle format
 */
export function exportTranscriptFormat(
  transcript: VideoTranscript,
  format: SubtitleFormat,
  title = 'video_transcript'
) {
  const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const timestamp = Date.now();

  switch (format) {
    case 'txt': {
      downloadFile(transcript.fullText, `${cleanTitle}_${timestamp}.txt`, 'text/plain');
      break;
    }
    case 'json': {
      const content = generateJson(transcript, title);
      downloadFile(content, `${cleanTitle}_${timestamp}.json`, 'application/json');
      break;
    }
    case 'srt': {
      const content = generateSrt(transcript.segments);
      downloadFile(content, `${cleanTitle}_${timestamp}.srt`, 'application/x-subrip');
      break;
    }
    case 'vtt': {
      const content = generateVtt(transcript.segments);
      downloadFile(content, `${cleanTitle}_${timestamp}.vtt`, 'text/vtt');
      break;
    }
    case 'sbv': {
      const content = generateSbv(transcript.segments);
      downloadFile(content, `${cleanTitle}_${timestamp}.sbv`, 'text/plain');
      break;
    }
    case 'sub': {
      const content = generateSub(transcript.segments, title);
      downloadFile(content, `${cleanTitle}_${timestamp}.sub`, 'text/plain');
      break;
    }
    case 'lrc': {
      const content = generateLrc(transcript.segments, title);
      downloadFile(content, `${cleanTitle}_${timestamp}.lrc`, 'text/plain');
      break;
    }
  }
}
