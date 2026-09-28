import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  X,
  Play,
  Pause,
  Download,
  Copy,
  Check,
  FileText,
  Volume2,
  Clock,
  Subtitles,
  RotateCcw,
  Sparkles,
  Layers,
  FileCode,
  ArrowRight,
  Mic,
  MicOff,
  VolumeX
} from 'lucide-react';
import { VideoTranscript, Language } from '../types';
import { exportTranscriptFormat, generateSrt, SubtitleFormat } from '../utils/subtitleExporter';

interface TranscriptViewerProps {
  transcript: VideoTranscript;
  lang: Language;
  onSeekVideo?: (seconds: number) => void;
  videoCurrentTime?: number;
  onRetranscribe?: () => void;
  isTranscribing?: boolean;
}

export const TranscriptViewer: React.FC<TranscriptViewerProps> = ({
  transcript,
  lang,
  onSeekVideo,
  videoCurrentTime = 0,
  onRetranscribe,
  isTranscribing = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'segments' | 'fulltext'>('segments');
  const [copied, setCopied] = useState(false);
  const [copiedSegmentId, setCopiedSegmentId] = useState<string | null>(null);

  // Audio preview playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioPlaybackRate, setAudioPlaybackRate] = useState(1.0);

  // Text-To-Speech (TTS Read Aloud) State
  const [isTtsSpeaking, setIsTtsSpeaking] = useState(false);
  const [isTtsPaused, setIsTtsPaused] = useState(false);
  const [activeTtsSegmentId, setActiveTtsSegmentId] = useState<string | null>(null);
  const [ttsRate, setTtsRate] = useState<number>(1.0);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState<number>(0);

  // Dictation (Voice-to-Text / Speech-to-Text mic input) State
  const [isDictating, setIsDictating] = useState(false);
  const [dictationInterim, setDictationInterim] = useState('');
  const recognitionRef = useRef<any>(null);

  // Load available speech synthesis voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (voices.length > 0) {
        const prefLang = lang === 'bn' ? 'bn' : 'en';
        const matchIdx = voices.findIndex(v => v.lang.toLowerCase().includes(prefLang));
        if (matchIdx !== -1) {
          setSelectedVoiceIndex(matchIdx);
        }
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [lang]);

  // Handle TTS Read Aloud for All Segments
  const handleStartTts = (startSegmentIndex = 0) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    if (transcript.segments.length === 0) return;

    setIsTtsSpeaking(true);
    setIsTtsPaused(false);

    let currentIndex = startSegmentIndex;

    const speakNext = () => {
      if (currentIndex >= transcript.segments.length) {
        setIsTtsSpeaking(false);
        setIsTtsPaused(false);
        setActiveTtsSegmentId(null);
        return;
      }

      const seg = transcript.segments[currentIndex];
      setActiveTtsSegmentId(seg.id);

      const el = segmentRefs.current.get(seg.id);
      if (el && viewMode === 'segments') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      const utterance = new SpeechSynthesisUtterance(seg.text);
      utterance.rate = ttsRate;

      if (availableVoices[selectedVoiceIndex]) {
        utterance.voice = availableVoices[selectedVoiceIndex];
      } else {
        utterance.lang = lang === 'bn' ? 'bn-BD' : 'en-US';
      }

      utterance.onend = () => {
        currentIndex++;
        speakNext();
      };

      utterance.onerror = (e) => {
        console.warn('TTS utterance error:', e);
        currentIndex++;
        speakNext();
      };

      window.speechSynthesis.speak(utterance);
    };

    speakNext();
  };

  const handlePauseTts = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setIsTtsPaused(true);
    }
  };

  const handleResumeTts = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
      setIsTtsPaused(false);
    }
  };

  const handleStopTts = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsTtsSpeaking(false);
      setIsTtsPaused(false);
      setActiveTtsSegmentId(null);
    }
  };

  const handleSpeakSingleSegment = (segId: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    setIsTtsSpeaking(true);
    setIsTtsPaused(false);
    setActiveTtsSegmentId(segId);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = ttsRate;

    if (availableVoices[selectedVoiceIndex]) {
      utterance.voice = availableVoices[selectedVoiceIndex];
    } else {
      utterance.lang = lang === 'bn' ? 'bn-BD' : 'en-US';
    }

    utterance.onend = () => {
      setIsTtsSpeaking(false);
      setActiveTtsSegmentId(null);
    };

    utterance.onerror = () => {
      setIsTtsSpeaking(false);
      setActiveTtsSegmentId(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Voice Dictation (Voice-to-Text mic input)
  const toggleVoiceDictation = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert(lang === 'bn' ? 'আপনার ব্রাউজারে ডিক্টেশন ফিচার সাপোর্ট করে না।' : 'Speech Recognition is not supported in this browser.');
      return;
    }

    if (isDictating) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsDictating(false);
      setDictationInterim('');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang === 'bn' ? 'bn-BD' : 'en-US';

      recognition.onstart = () => {
        setIsDictating(true);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const finalSpeech = event.results[i][0].transcript;
            if (finalSpeech.trim()) {
              const newSeg = {
                id: `voice_${Date.now()}`,
                start: videoCurrentTime || 0,
                end: (videoCurrentTime || 0) + 3,
                timestamp: formatSeconds(videoCurrentTime || 0),
                text: `[🎙️ Voice dictation]: ${finalSpeech.trim()}`,
              };
              transcript.segments.push(newSeg);
              transcript.fullText += `\n[🎙️ Voice dictation]: ${finalSpeech.trim()}`;
            }
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        setDictationInterim(interim);
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
        setIsDictating(false);
        setDictationInterim('');
      };

      recognition.onend = () => {
        setIsDictating(false);
        setDictationInterim('');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Dictation error:', err);
      setIsDictating(false);
    }
  };

  // Refs for scrolling to matching segments
  const segmentRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Search match computation
  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const found: Array<{ segmentId: string; segmentIndex: number; text: string; start: number }> = [];
    transcript.segments.forEach((seg, idx) => {
      if (seg.text.toLowerCase().includes(q)) {
        found.push({
          segmentId: seg.id,
          segmentIndex: idx,
          text: seg.text,
          start: seg.start,
        });
      }
    });
    return found;
  }, [searchQuery, transcript.segments]);

  // Reset match index when query changes
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  // Scroll to current active match
  useEffect(() => {
    if (matches.length > 0 && currentMatchIndex < matches.length) {
      const activeMatch = matches[currentMatchIndex];
      const el = segmentRefs.current.get(activeMatch.segmentId);
      if (el && viewMode === 'segments') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMatchIndex, matches, viewMode]);

  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIdx);
    const target = matches[nextIdx];
    if (onSeekVideo && target) {
      onSeekVideo(target.start);
    }
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIdx);
    const target = matches[prevIdx];
    if (onSeekVideo && target) {
      onSeekVideo(target.start);
    }
  };

  const handleCopyFullText = async () => {
    try {
      await navigator.clipboard.writeText(transcript.fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopySegment = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSegmentId(id);
      setTimeout(() => setCopiedSegmentId(null), 1500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([transcript.fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `video_transcript_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSrt = () => {
    const srtContent = generateSrt(transcript.segments);
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subtitles_${Date.now()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleAudioPlay = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  const changePlaybackRate = (rate: number) => {
    setAudioPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  // Safe keyword highlighter
  const renderHighlightedText = (text: string, query: string, isCurrentMatch = false) => {
    if (!query.trim()) return <span>{text}</span>;

    const trimmed = query.trim();
    // Escape regex special chars
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);

    return (
      <span>
        {parts.map((part, i) => {
          if (part.toLowerCase() === trimmed.toLowerCase()) {
            return (
              <mark
                key={i}
                className={`px-1 py-0.5 rounded font-semibold transition-all ${
                  isCurrentMatch
                    ? 'bg-amber-400 text-black shadow-sm ring-2 ring-amber-500'
                    : 'bg-yellow-200 text-neutral-900'
                }`}
              >
                {part}
              </mark>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  // Format seconds to mm:ss
  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const t = {
    audioTrackTitle: lang === 'bn' ? 'এক্সট্রাক্ট করা অডিও ট্র্যাক' : 'Extracted Audio Track',
    searchPlaceholder: lang === 'bn' ? 'ট্রান্সক্রিপ্টে শব্দ বা বাক্য খুঁজুন...' : 'Search keywords or phrases in transcript...',
    matchesFound: lang === 'bn' ? 'মিল পাওয়া গেছে' : 'matches found',
    noMatches: lang === 'bn' ? 'কোনো মিল পাওয়া যায়নি' : 'No matches found',
    prev: lang === 'bn' ? 'পূর্ববর্তী' : 'Previous',
    next: lang === 'bn' ? 'পরবর্তী' : 'Next',
    timestampView: lang === 'bn' ? 'টাইমকোড কিউ' : 'Timestamp Cues',
    fulltextView: lang === 'bn' ? 'পূর্ণ অনুচ্ছেদ' : 'Full Continuous',
    copyText: lang === 'bn' ? 'কপি করুন' : 'Copy All',
    copiedText: lang === 'bn' ? 'কপি হয়েছে!' : 'Copied!',
    downloadTxt: lang === 'bn' ? 'TXT ডাউনলোড' : 'Download TXT',
    downloadSrt: lang === 'bn' ? 'SRT সাবটাইটেল' : 'Download SRT',
    downloadWav: lang === 'bn' ? 'WAV অডিও' : 'Download WAV',
    retranscribe: lang === 'bn' ? 'পুনরায় ট্রান্সক্রাইব' : 'Re-transcribe',
    seekTooltip: lang === 'bn' ? 'ভিডিও এই মুহূর্তে নিয়ে যান' : 'Click to jump video to this moment',
    audioSpeechTag: lang === 'bn' ? '১৬kHz মনো • স্পিচ অপ্টিমাইজড' : '16kHz Mono • Speech-Optimized',
    totalDuration: lang === 'bn' ? 'মোট দৈর্ঘ্য' : 'Total Duration',
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* 1. Audio Track Player Bar */}
      {transcript.audioUrl && (
        <div className="bg-[#141414]/5 border border-[#141414]/15 p-3.5 rounded-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <audio
            ref={audioRef}
            src={transcript.audioUrl}
            onTimeUpdate={(e) => setAudioCurrentTime(e.currentTarget.currentTime)}
            onEnded={() => setIsPlayingAudio(false)}
            onPause={() => setIsPlayingAudio(false)}
            onPlay={() => setIsPlayingAudio(true)}
          />

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={toggleAudioPlay}
              className="w-9 h-9 rounded-full bg-[#141414] text-[#E4E3E0] flex items-center justify-center hover:bg-[#333] transition-colors shrink-0 shadow-sm"
              title={isPlayingAudio ? 'Pause Audio' : 'Play Audio'}
            >
              {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>

            <div>
              <div className="flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-neutral-700" />
                <span className="text-xs font-bold font-mono tracking-tight">{t.audioTrackTitle}</span>
                <span className="text-[10px] font-mono bg-neutral-200 text-neutral-700 px-1.5 py-0.2 rounded">
                  {transcript.audioSizeFormatted || 'WAV'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono opacity-60 mt-0.5">
                <span>
                  {formatSeconds(audioCurrentTime)} / {formatSeconds(transcript.durationSeconds || 0)}
                </span>
                <span>•</span>
                <span>{t.audioSpeechTag}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            {/* Speed selection */}
            <div className="flex bg-white border border-[#141414]/15 rounded text-[10px] font-mono overflow-hidden">
              {[1.0, 1.25, 1.5].map((rate) => (
                <button
                  key={rate}
                  onClick={() => changePlaybackRate(rate)}
                  className={`px-2 py-1 transition-colors ${
                    audioPlaybackRate === rate ? 'bg-[#141414] text-white font-bold' : 'hover:bg-neutral-100 text-neutral-700'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Download WAV button */}
            <a
              href={transcript.audioUrl}
              download={`audio_track_${Date.now()}.wav`}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono uppercase bg-white border border-[#141414] hover:bg-[#141414] hover:text-white transition-colors rounded shadow-xs"
              title={t.downloadWav}
            >
              <Download className="w-3 h-3" />
              <span>WAV</span>
            </a>
          </div>
        </div>
      )}

      {/* Subtitle & Transcript Multi-Format Export Bar (.txt, .json, .srt, .vtt, .sbv, .sub, .lrc) */}
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-2.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Subtitles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-bold text-[var(--text-primary)]">
              {lang === 'bn' ? "সাবটাইটেল ও ট্রান্সক্রিপ্ট এক্সপোর্ট ফরম্যাট (৭টি ফরম্যাট)" : "Export Audio Transcript (7 Subtitle Formats)"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              const formats: SubtitleFormat[] = ['txt', 'json', 'srt', 'vtt', 'sbv', 'sub', 'lrc'];
              formats.forEach((fmt) => exportTranscriptFormat(transcript, fmt, 'video_transcript'));
            }}
            className="px-2.5 py-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95"
            title={lang === 'bn' ? "সবগুলো ৭টি ফরম্যাটে একই সাথে ডাউনলোড করুন" : "Download transcript in all 7 formats simultaneously"}
          >
            <Download className="w-3 h-3" />
            <span>{lang === 'bn' ? "সব ফরম্যাট একসাথে ডাউনলোড" : "Download All 7 Formats"}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5 pt-1">
          {[
            { format: 'txt' as const, label: '.TXT', desc: lang === 'bn' ? 'প্লেন টেক্সট' : 'Plain Text', color: 'bg-slate-100 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200' },
            { format: 'json' as const, label: '.JSON', desc: lang === 'bn' ? 'ডেটা জেসন' : 'Data JSON', color: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' },
            { format: 'srt' as const, label: '.SRT', desc: lang === 'bn' ? 'সবচেয়ে প্রচলিত' : 'SubRip Subtitles', color: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300' },
            { format: 'vtt' as const, label: '.VTT', desc: lang === 'bn' ? 'ওয়েবভিটিটি' : 'WebVTT Subtitles', color: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300' },
            { format: 'sbv' as const, label: '.SBV', desc: lang === 'bn' ? 'ইউটিউব সাব' : 'YouTube SBV', color: 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300' },
            { format: 'sub' as const, label: '.SUB', desc: lang === 'bn' ? 'সাবভিউয়ার' : 'SubViewer .SUB', color: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300' },
            { format: 'lrc' as const, label: '.LRC', desc: lang === 'bn' ? 'লিরিক কিউ' : 'Lyrics .LRC', color: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300' },
          ].map((item) => (
            <button
              key={item.format}
              type="button"
              onClick={() => exportTranscriptFormat(transcript, item.format, 'video_transcript')}
              className={`p-2 rounded-lg border border-[var(--border-subtle)] hover:border-indigo-500 hover:shadow-xs transition-all flex flex-col items-center justify-center text-center cursor-pointer group active:scale-95 ${item.color}`}
              title={`${lang === 'bn' ? 'ডাউনলোড করুন' : 'Download'} ${item.label}`}
            >
              <span className="text-xs font-extrabold font-mono flex items-center gap-1 group-hover:scale-105 transition-transform">
                <Download className="w-2.5 h-2.5 opacity-70 group-hover:opacity-100" />
                {item.label}
              </span>
              <span className="text-[9px] font-medium opacity-80 mt-0.5 truncate max-w-full">{item.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Text-to-Speech (TTS) Voice Read-Aloud & Voice Dictation Control Bar */}
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-3 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* TTS Read Aloud Control Group */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <span>{lang === 'bn' ? "টেক্সট-টু-স্পিচ (TTS) পড়া শুনুন" : "Text-to-Speech (TTS) Voice Read Aloud"}</span>
                {isTtsSpeaking && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-300 dark:border-emerald-800 animate-pulse">
                    🔊 {isTtsPaused ? (lang === 'bn' ? 'পজ করা আছে' : 'Paused') : (lang === 'bn' ? 'পড়া হচ্ছে...' : 'Speaking...')}
                  </span>
                )}
              </h4>
              <p className="text-[11px] text-[var(--text-muted)]">
                {lang === 'bn' ? "ট্রান্সক্রিপ্টের প্রতিটি বাক্য স্পষ্ট ভয়েসে শুনুন" : "Listen to the verbatim transcript read aloud with natural speech synthesis"}
              </p>
            </div>
          </div>

          {/* TTS Playback Controls */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {/* Speed Selector */}
            <div className="flex bg-[var(--surface-muted)] border border-[var(--border-subtle)] rounded-lg p-0.5 text-[10px] font-mono">
              {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setTtsRate(rate)}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    ttsRate === rate
                      ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Voice Dropdown Selector if voices loaded */}
            {availableVoices.length > 0 && (
              <select
                value={selectedVoiceIndex}
                onChange={(e) => setSelectedVoiceIndex(Number(e.target.value))}
                className="px-2 py-1 bg-[var(--surface-muted)] text-[var(--text-primary)] text-[11px] font-semibold rounded-lg border border-[var(--border-subtle)] cursor-pointer focus:outline-none max-w-[140px] truncate"
                title={lang === 'bn' ? "TTS কণ্ঠ নির্বাচন করুন" : "Select TTS Voice"}
              >
                {availableVoices.map((v, i) => (
                  <option key={i} value={i}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            )}

            {/* Play / Pause / Stop TTS Buttons */}
            {!isTtsSpeaking ? (
              <button
                type="button"
                onClick={() => handleStartTts(0)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
                title={lang === 'bn' ? "সম্পূর্ণ ট্রান্সক্রিপ্ট পড়া শুনুন" : "Read aloud entire transcript"}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{lang === 'bn' ? "পড়া শুনুন (TTS)" : "Read Aloud"}</span>
              </button>
            ) : isTtsPaused ? (
              <button
                type="button"
                onClick={handleResumeTts}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{lang === 'bn' ? "পুনরায় চালু" : "Resume"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePauseTts}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>{lang === 'bn' ? "পজ" : "Pause"}</span>
              </button>
            )}

            {isTtsSpeaking && (
              <button
                type="button"
                onClick={handleStopTts}
                className="p-1.5 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 hover:bg-red-200 rounded-lg cursor-pointer transition-all active:scale-95"
                title={lang === 'bn' ? "থামুন" : "Stop TTS"}
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Voice Dictation (Mic Speech-to-Text Input) Button */}
            <button
              type="button"
              onClick={toggleVoiceDictation}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 border ${
                isDictating
                  ? 'bg-red-600 text-white border-red-600 animate-pulse'
                  : 'bg-[var(--surface-muted)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border-[var(--border-subtle)]'
              }`}
              title={lang === 'bn' ? "মাইক্রোফোনে কথা বলে ট্রান্সক্রিপ্টে যুক্ত করুন" : "Dictate with microphone to transcribe text"}
            >
              {isDictating ? (
                <>
                  <Mic className="w-3.5 h-3.5 text-white animate-bounce" />
                  <span>{lang === 'bn' ? "শুনছি..." : "Listening..."}</span>
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>{lang === 'bn' ? "ভয়েস ডিক্টেশন" : "Dictate"}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Live Interim Dictation Feedback */}
        {isDictating && (
          <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs font-medium text-[var(--text-primary)] flex items-center gap-2">
            <Mic className="w-4 h-4 text-red-500 animate-ping shrink-0" />
            <span className="italic text-[var(--text-secondary)]">
              {dictationInterim || (lang === 'bn' ? "কথা বলুন... মাইক্রোফোন শুনছে" : "Speak now... listening to microphone")}
            </span>
          </div>
        )}
      </div>

      {/* 2. Search & Toolbar Header */}
      <div className="bg-white border border-[#141414]/15 p-3 rounded-lg space-y-3 shadow-xs">
        {/* Search Input Bar */}
        <div className="relative flex items-center">
          <Search className="w-4 h-4 absolute left-3 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.shiftKey ? handlePrevMatch() : handleNextMatch();
              }
            }}
            placeholder={t.searchPlaceholder}
            className="w-full pl-9 pr-24 py-2 text-xs border border-[#141414]/20 rounded focus:border-[#141414] focus:outline-none transition-all placeholder:text-neutral-400"
          />

          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-20 text-neutral-400 hover:text-neutral-700 p-1"
              title="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Search match navigation buttons */}
          <div className="absolute right-2 flex items-center gap-1 border-l border-neutral-200 pl-2">
            <button
              onClick={handlePrevMatch}
              disabled={matches.length === 0}
              className="p-1 hover:bg-neutral-100 rounded text-neutral-600 disabled:opacity-30"
              title={t.prev}
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleNextMatch}
              disabled={matches.length === 0}
              className="p-1 hover:bg-neutral-100 rounded text-neutral-600 disabled:opacity-30"
              title={t.next}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search match stats & Mode toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-100 text-[11px] font-mono">
          <div className="flex items-center gap-2">
            {searchQuery ? (
              matches.length > 0 ? (
                <span className="bg-amber-100 text-amber-900 font-semibold px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1 text-[10px]">
                  <span>
                    {currentMatchIndex + 1} / {matches.length} {t.matchesFound}
                  </span>
                </span>
              ) : (
                <span className="text-red-500 font-medium text-[10px]">{t.noMatches}</span>
              )
            ) : (
              <span className="text-neutral-500 text-[10px] flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                <span>{transcript.segments.length} segments • {transcript.languageDetected?.toUpperCase()}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-neutral-100 p-0.5 rounded border border-neutral-200 text-[10px]">
              <button
                onClick={() => setViewMode('segments')}
                className={`px-2.5 py-1 rounded transition-all flex items-center gap-1 ${
                  viewMode === 'segments' ? 'bg-white shadow-xs font-bold text-black' : 'text-neutral-600 hover:text-black'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>{t.timestampView}</span>
              </button>
              <button
                onClick={() => setViewMode('fulltext')}
                className={`px-2.5 py-1 rounded transition-all flex items-center gap-1 ${
                  viewMode === 'fulltext' ? 'bg-white shadow-xs font-bold text-black' : 'text-neutral-600 hover:text-black'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>{t.fulltextView}</span>
              </button>
            </div>

            {/* Export options */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopyFullText}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono bg-white border border-neutral-200 hover:border-black rounded transition-all"
                title={t.copyText}
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? t.copiedText : t.copyText}</span>
              </button>

              <button
                onClick={handleDownloadTxt}
                className="p-1 hover:bg-neutral-100 rounded text-neutral-600 transition-colors"
                title={t.downloadTxt}
              >
                <FileCode className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleDownloadSrt}
                className="p-1 hover:bg-neutral-100 rounded text-neutral-600 transition-colors"
                title={t.downloadSrt}
              >
                <Subtitles className="w-3.5 h-3.5" />
              </button>

              {onRetranscribe && (
                <button
                  onClick={onRetranscribe}
                  disabled={isTranscribing}
                  className="p-1 hover:bg-neutral-100 rounded text-neutral-600 transition-colors disabled:opacity-40"
                  title={t.retranscribe}
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Transcript Body Content */}
      <div className="bg-white border border-[#141414]/15 rounded-lg p-4 max-h-[500px] overflow-y-auto custom-scrollbar">
        {transcript.segments.length === 0 ? (
          <div className="py-8 px-4 text-center space-y-4">
            <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto border border-amber-200">
              <Sparkles className="w-6 h-6 text-amber-600" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                {lang === 'bn' ? 'অডিও ট্র্যাক প্রস্তুত' : 'Audio Track Ready'}
              </h4>
              <p className="text-[11px] text-neutral-600 leading-relaxed">
                {transcript.isApiKeyError
                  ? (lang === 'bn'
                      ? 'ভিডিওর অডিও ট্র্যাকটি সফলভাবে আলাদা করা হয়েছে। আপনি উপরের প্লেয়ার দিয়ে এটি শুনতে এবং ডাউনলোড করতে পারবেন। তবে AI দিয়ে স্বয়ংক্রিয় টেক্সট ট্রান্সক্রিপ্ট পেতে Settings > Secrets থেকে একটি কার্যকর GEMINI_API_KEY সেট করুন।'
                      : 'Audio track extracted successfully. You can play or download it using the player above. Generating an AI verbatim transcript requires a valid GEMINI_API_KEY in Settings > Secrets.')
                  : (lang === 'bn'
                      ? 'এই অডিওর জন্য কোনো টেক্সট সেগমেন্ট তৈরি হয়নি।'
                      : 'No text segments generated for this audio yet.')}
              </p>
            </div>
            {onRetranscribe && (
              <button
                type="button"
                onClick={onRetranscribe}
                disabled={isTranscribing}
                className="px-4 py-2 bg-[#141414] text-[#E4E3E0] text-xs font-bold uppercase tracking-wider rounded inline-flex items-center gap-2 hover:bg-neutral-800 transition-all disabled:opacity-40 cursor-pointer shadow-xs"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin' : ''}`} />
                <span>{lang === 'bn' ? 'পুনরায় ট্রান্সক্রিপ্ট করার চেষ্টা করুন' : 'Retry Transcription'}</span>
              </button>
            )}
          </div>
        ) : viewMode === 'segments' ? (
          <div className="space-y-2.5">
            {transcript.segments.map((seg, idx) => {
              const isCurrentPlaying =
                videoCurrentTime >= seg.start && videoCurrentTime <= (seg.end ?? seg.start + 4);
              const isMatched = matches.some((m) => m.segmentId === seg.id);
              const isActiveMatch =
                matches.length > 0 && matches[currentMatchIndex]?.segmentId === seg.id;

              return (
                <div
                  key={seg.id || idx}
                  ref={(el) => {
                    if (el) segmentRefs.current.set(seg.id, el);
                    else segmentRefs.current.delete(seg.id);
                  }}
                  className={`group p-3 rounded-md border transition-all text-xs flex flex-col md:flex-row items-start gap-3 ${
                    isActiveMatch
                      ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-300 shadow-sm'
                      : isCurrentPlaying
                      ? 'bg-emerald-50/60 border-emerald-300 shadow-xs'
                      : isMatched
                      ? 'bg-yellow-50/40 border-yellow-200'
                      : 'bg-white hover:bg-neutral-50 border-neutral-100 hover:border-neutral-300'
                  }`}
                >
                  {/* Timestamp & Speaker Pill */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onSeekVideo?.(seg.start)}
                      className="px-2 py-1 bg-neutral-900 text-[#E4E3E0] hover:bg-black rounded text-[10px] font-mono flex items-center gap-1 transition-all group-hover:scale-105 shadow-xs"
                      title={t.seekTooltip}
                    >
                      <Play className="w-2.5 h-2.5 fill-current opacity-80" />
                      <span>{seg.timestamp}</span>
                    </button>

                    {seg.speaker && (
                      <span className="text-[10px] font-mono text-neutral-500 font-semibold uppercase">
                        {seg.speaker}:
                      </span>
                    )}
                  </div>

                  {/* Segment Dialogue Text */}
                  <div className="flex-1 leading-relaxed text-neutral-800">
                    {renderHighlightedText(seg.text, searchQuery, isActiveMatch)}
                  </div>

                  {/* Quick actions for segment */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 self-end md:self-auto shrink-0">
                    <button
                      onClick={() => handleCopySegment(seg.id, seg.text)}
                      className="p-1 text-neutral-400 hover:text-black rounded"
                      title="Copy segment text"
                    >
                      {copiedSegmentId === seg.id ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    {onSeekVideo && (
                      <button
                        onClick={() => onSeekVideo(seg.start)}
                        className="p-1 text-neutral-400 hover:text-black rounded"
                        title={t.seekTooltip}
                      >
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Full Continuous Paragraph View */
          <div className="prose prose-sm max-w-none text-neutral-800 leading-relaxed font-sans space-y-4">
            <div className="p-4 bg-neutral-50/70 rounded-lg border border-neutral-200">
              <p className="text-xs leading-relaxed whitespace-pre-wrap">
                {renderHighlightedText(transcript.fullText, searchQuery)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
