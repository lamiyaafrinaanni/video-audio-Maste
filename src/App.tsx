/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { jsPDF } from "jspdf";
import { Language, ThemeMode, AnalysisMode, HighlightFrame, AnalysisHistory, VideoTranscript, VideoMetadata, ChapterMarker } from './types';
import { Header } from './components/Header';
import { VideoInputPanel } from './components/VideoInputPanel';
import { AnalysisReportView } from './components/AnalysisReportView';
import { VideoDownloader } from './components/VideoDownloader';
import { McpAgentHub } from './components/McpAgentHub';
import { extractAudioFromVideoFile } from './utils/audioExtractor';

export function App() {
  const [lang, setLang] = useState<Language>('bn');
  const [mainView, setMainView] = useState<'studio' | 'downloader' | 'mcp'>('studio');
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'history'>('upload');
  const [rightPanelTab, setRightPanelTab] = useState<'report' | 'transcript'>('report');
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('standard');

  // Theme Mode & System Preference State
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    try {
      return (localStorage.getItem('video_insight_theme') as ThemeMode) || 'system';
    } catch {
      return 'system';
    }
  });
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  // Automatic System Preference Detection & CSS Root Variables Synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyThemeToDOM = (isDark: boolean) => {
      const root = document.documentElement;
      if (isDark) {
        root.classList.add('dark');
        root.classList.remove('light');
        root.setAttribute('data-theme', 'dark');
        setEffectiveTheme('dark');
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
        root.setAttribute('data-theme', 'light');
        setEffectiveTheme('light');
      }
    };

    // Calculate initial state based on themeMode setting
    if (themeMode === 'system') {
      applyThemeToDOM(mediaQuery.matches);
    } else {
      applyThemeToDOM(themeMode === 'dark');
    }

    // Dynamic listener for real-time OS preference changes
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      if (themeMode === 'system') {
        applyThemeToDOM(e.matches);
      }
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else if ((mediaQuery as any).addListener) {
      (mediaQuery as any).addListener(handleSystemThemeChange);
    }

    try {
      localStorage.setItem('video_insight_theme', themeMode);
    } catch (e) {
      console.warn("Could not persist theme to localStorage", e);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemThemeChange);
      } else if ((mediaQuery as any).removeListener) {
        (mediaQuery as any).removeListener(handleSystemThemeChange);
      }
    };
  }, [themeMode]);

  // Video State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);

  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [isOneClickExtracting, setIsOneClickExtracting] = useState(false);
  const [oneClickProgressStatus, setOneClickProgressStatus] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isApiKeyError, setIsApiKeyError] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Highlights & Chapter Markers
  const [highlights, setHighlights] = useState<HighlightFrame[]>([]);
  const [highlightsToast, setHighlightsToast] = useState<string | null>(null);
  const [chapters, setChapters] = useState<ChapterMarker[]>([]);
  const [isDetectingChapters, setIsDetectingChapters] = useState(false);
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [autoCaptureInterval, setAutoCaptureInterval] = useState(5);
  const lastAutoCapturedTimeRef = useRef<number>(-1);

  // Audio Extraction & Transcription
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);
  const [audioExtractionStatus, setAudioExtractionStatus] = useState('');
  const [transcript, setTranscript] = useState<VideoTranscript | null>(null);

  // History State
  const [history, setHistory] = useState<AnalysisHistory[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Load history from localStorage on initial mount
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('video_analysis_history');
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
    } catch (e) {
      console.error("Failed to parse history from localStorage", e);
    }
  }, []);

  const saveToHistory = (result: string, title: string, type: 'file' | 'url') => {
    const newItem: AnalysisHistory = {
      id: Date.now().toString(),
      title: title || (lang === 'bn' ? "ভিডিও বিশ্লেষণ" : "Video Analysis"),
      date: new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      result,
      type,
      mode: analysisMode,
      lang
    };
    const updated = [newItem, ...history].slice(0, 15);
    setHistory(updated);
    try {
      localStorage.setItem('video_analysis_history', JSON.stringify(updated));
    } catch (e) {
      console.warn("Storage quota exceeded", e);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('video_analysis_history');
    } catch (e) {
      console.error("Failed to clear localStorage", e);
    }
  };

  // Duration formatting helper
  const formatDuration = (sec?: number) => {
    if (!sec || isNaN(sec) || sec <= 0) return '00:00';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Helper to resolve high-res metadata from URLs
  const resolveVideoMetadata = async (url: string) => {
    if (!url) return;
    const cleanUrl = url.trim();
    const ytMatch = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i);

    let initialMeta: VideoMetadata;

    if (ytMatch) {
      const videoId = ytMatch[1];
      initialMeta = {
        title: `YouTube Video (${videoId})`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        fallbackThumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        duration: videoDuration || 0,
        durationFormatted: formatDuration(videoDuration),
        publisher: 'YouTube Creator',
        platform: 'youtube',
        platformLabel: 'YouTube',
        format: '1080p Full HD',
        originalUrl: cleanUrl,
        publishedDate: new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        qualityBadge: '1080P'
      };
    } else {
      const isTiktok = cleanUrl.includes('tiktok.com');
      const isInsta = cleanUrl.includes('instagram.com');
      const isFb = cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.watch');
      const isTwitter = cleanUrl.includes('twitter.com') || cleanUrl.includes('x.com');
      const filename = cleanUrl.split('/').pop()?.split('?')[0] || 'Web Video Stream';
      
      initialMeta = {
        title: filename,
        thumbnailUrl: isTiktok ? 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600&auto=format&fit=crop&q=80'
                    : isInsta ? 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=600&auto=format&fit=crop&q=80'
                    : isFb ? 'https://images.unsplash.com/photo-1562577309-4932fdd64cd1?w=600&auto=format&fit=crop&q=80'
                    : isTwitter ? 'https://images.unsplash.com/photo-1611605698335-8b1569810432?w=600&auto=format&fit=crop&q=80'
                    : 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=600&auto=format&fit=crop&q=80',
        duration: videoDuration || 0,
        durationFormatted: formatDuration(videoDuration),
        publisher: isTiktok ? 'TikTok Creator' : isInsta ? 'Instagram Creator' : isFb ? 'Facebook Creator' : isTwitter ? 'X Creator' : 'Web Stream',
        platform: isTiktok ? 'tiktok' : isInsta ? 'instagram' : isFb ? 'facebook' : isTwitter ? 'twitter' : 'direct',
        platformLabel: isTiktok ? 'TikTok' : isInsta ? 'Instagram' : isFb ? 'Facebook' : isTwitter ? 'X / Twitter' : 'Web Video',
        format: '1080p MP4',
        originalUrl: cleanUrl,
        publishedDate: new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        qualityBadge: 'HD'
      };
    }

    setVideoMetadata(initialMeta);

    // Fetch server /api/video/info in background for exact title, author name, HD thumbnail
    try {
      const res = await fetch('/api/video/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVideoMetadata(prev => ({
            title: data.title || prev?.title || 'Web Video',
            thumbnailUrl: data.thumbnail || prev?.thumbnailUrl || '',
            fallbackThumbnailUrl: data.fallbackThumbnail || prev?.fallbackThumbnailUrl,
            duration: prev?.duration || 0,
            durationFormatted: prev?.durationFormatted,
            publisher: data.author || prev?.publisher || 'Creator',
            platform: data.platform || prev?.platform,
            platformLabel: data.platformLabel || prev?.platformLabel,
            format: data.formats?.[0]?.quality || prev?.format || '1080p MP4',
            fileSize: data.formats?.[0]?.sizeEst || prev?.fileSize,
            originalUrl: data.originalUrl || cleanUrl,
            publishedDate: prev?.publishedDate,
            qualityBadge: data.formats?.[0]?.quality || prev?.qualityBadge
          }));
        }
      }
    } catch (e) {
      console.warn("Could not fetch remote video metadata", e);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setVideoFile(file);
      setVideoUrl('');
      const url = URL.createObjectURL(file);
      setVideoPreview(url);
      setAnalysisResult(null);
      setHighlights([]);
      setTranscript(null);
      setError(null);
      setIsApiKeyError(false);
      setVideoCurrentTime(0);

      const sizeFormatted = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      setVideoMetadata({
        title: file.name.replace(/\.[^/.]+$/, ""),
        thumbnailUrl: '',
        duration: 0,
        publisher: lang === 'bn' ? 'স্থানীয় আপলোড' : 'Local File',
        platform: 'file',
        platformLabel: lang === 'bn' ? 'লোকাল ফাইল' : 'Local File',
        format: file.type ? file.type.replace('video/', '').toUpperCase() : 'MP4',
        fileSize: sizeFormatted,
        publishedDate: new Date().toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        qualityBadge: 'HD'
      });
    }
  };

  const handleClearFile = () => {
    if (videoFile && videoPreview) {
      URL.revokeObjectURL(videoPreview);
    }
    setVideoFile(null);
    setVideoPreview(null);
    setVideoDuration(0);
    setVideoCurrentTime(0);
    setHighlights([]);
    setTranscript(null);
    setVideoMetadata(null);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoUrl) return;

    if (videoFile && videoPreview) {
      URL.revokeObjectURL(videoPreview);
      setVideoFile(null);
    }

    setVideoPreview(videoUrl);
    setAnalysisResult(null);
    setHighlights([]);
    setTranscript(null);
    setError(null);
    setIsApiKeyError(false);
    setVideoCurrentTime(0);

    resolveVideoMetadata(videoUrl);
  };

  // Video scrubber and time handlers
  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVideoCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  const handleSeekVideo = (seconds: number) => {
    setVideoCurrentTime(seconds);
    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleVideoLoadedMetadata = (duration: number) => {
    setVideoDuration(duration);
    setVideoMetadata(prev => {
      if (!prev) {
        return {
          title: videoFile ? videoFile.name : (videoUrl || 'Video Source'),
          thumbnailUrl: '',
          duration,
          durationFormatted: formatDuration(duration),
          publisher: videoFile ? (lang === 'bn' ? 'স্থানীয় আপলোড' : 'Local File') : 'Web Video',
          platform: videoFile ? 'file' : 'direct',
        };
      }
      return {
        ...prev,
        duration,
        durationFormatted: formatDuration(duration)
      };
    });

    // Capture crisp frame preview for local video files if thumbnail not set
    if (videoRef.current) {
      setTimeout(() => {
        try {
          const video = videoRef.current;
          if (!video) return;
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(video.videoWidth || 640, 640);
          canvas.height = Math.min(video.videoHeight || 360, 360);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            if (dataUrl && dataUrl.length > 50) {
              setVideoMetadata(prev => prev && (!prev.thumbnailUrl || prev.platform === 'file') ? { ...prev, thumbnailUrl: dataUrl } : prev);
            }
          }
        } catch (e) {
          console.warn("Could not capture initial video frame", e);
        }
      }, 400);
    }
  };

  const handleVideoTimeUpdate = (currentTime: number) => {
    setVideoCurrentTime(currentTime);

    // Auto capture frame every X seconds when enabled during video playback
    if (autoCaptureEnabled && autoCaptureInterval > 0 && videoRef.current && !videoRef.current.paused) {
      const currentSec = Math.floor(currentTime);

      if (lastAutoCapturedTimeRef.current > currentSec) {
        lastAutoCapturedTimeRef.current = -1;
      }

      if (
        currentSec > 0 &&
        (lastAutoCapturedTimeRef.current === -1 || currentSec - lastAutoCapturedTimeRef.current >= autoCaptureInterval) &&
        currentSec % autoCaptureInterval === 0
      ) {
        lastAutoCapturedTimeRef.current = currentSec;
        captureFrameAtCurrentTime(currentSec, true);
      }
    }
  };

  // Helper to suggest label using Gemini Vision
  const suggestHighlightLabel = async (frameId: string, dataUrl: string, timestamp: number) => {
    try {
      setHighlights(prev => prev.map(h => h.id === frameId ? { ...h, isSuggestingLabel: true } : h));
      const res = await fetch('/api/suggest-frame-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dataUrl,
          language: lang,
          timestamp,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.isApiKeyError) {
        setIsApiKeyError(true);
      }
      if (data && data.success && data.label) {
        setHighlights(prev =>
          prev.map(h => {
            if (h.id === frameId) {
              return {
                ...h,
                note: h.note && h.note.trim() ? h.note : data.label,
                suggestedLabel: data.label,
                isSuggestingLabel: false,
              };
            }
            return h;
          })
        );
      } else {
        setHighlights(prev => prev.map(h => h.id === frameId ? { ...h, isSuggestingLabel: false } : h));
      }
    } catch (err) {
      console.warn('Could not suggest highlight label:', err);
      setHighlights(prev => prev.map(h => h.id === frameId ? { ...h, isSuggestingLabel: false } : h));
    }
  };

  const captureFrameAtCurrentTime = (overrideTimeSec?: number, isAuto = false) => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(video.videoWidth || 640, 640);
      canvas.height = Math.min(video.videoHeight || 360, 360);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const currentSec = overrideTimeSec !== undefined ? Math.floor(overrideTimeSec) : Math.floor(video.currentTime);

        // Update videoMetadata thumbnail if empty
        setVideoMetadata(prev => prev && !prev.thumbnailUrl ? { ...prev, thumbnailUrl: dataUrl } : prev);

        const exists = highlights.some(h => Math.abs(h.timestamp - currentSec) < 2);
        if (!exists && highlights.length < 24) {
          const frameId = Date.now().toString() + Math.random().toString(36).substring(2, 5);
          const newFrame: HighlightFrame = {
            id: frameId,
            timestamp: currentSec,
            dataUrl,
            originalDataUrl: dataUrl,
            note: '',
            isSuggestingLabel: true,
          };
          setHighlights(prev => [...prev, newFrame]);
          
          if (isAuto) {
            setHighlightsToast(lang === 'bn' ? `অটো-ক্যাপচার ফ্রেম (${formatDuration(currentSec)}) যুক্ত হয়েছে!` : `Auto-captured frame (${formatDuration(currentSec)})!`);
          } else {
            setHighlightsToast(lang === 'bn' ? `হাইলাইট ফ্রেম যুক্ত হয়েছে!` : `Highlight captured!`);
          }
          setTimeout(() => setHighlightsToast(null), 2400);

          // Trigger quick AI call using Gemini Vision to automatically suggest a 2-3 word label
          suggestHighlightLabel(frameId, dataUrl, currentSec);
        } else if (exists && !isAuto) {
          setHighlightsToast(lang === 'bn' ? `এই ফ্রেমটি ইতিমধ্যেই যুক্ত রয়েছে` : `Frame at this timestamp already captured`);
          setTimeout(() => setHighlightsToast(null), 2000);
        }
      }
    } catch (e) {
      console.warn("Could not capture frame preview", e);
    }
  };

  // One-click batch sampling across entire video
  const handleBatchAutoCapture = async () => {
    if (!videoRef.current || !videoDuration || videoDuration <= 0) return;
    const interval = autoCaptureInterval || 5;
    const maxFrames = 16;
    const timestamps: number[] = [];
    
    for (let t = interval; t < videoDuration; t += interval) {
      if (timestamps.length >= maxFrames) break;
      timestamps.push(Math.floor(t));
    }

    if (timestamps.length === 0) {
      timestamps.push(Math.floor(videoDuration / 2));
    }

    const video = videoRef.current;
    const originalTime = video.currentTime;
    const wasPlaying = !video.paused;

    if (wasPlaying) {
      video.pause();
    }

    setHighlightsToast(lang === 'bn' ? 'সমগ্র ভিডিওর ফ্রেম অটো-ক্যাপচার করা হচ্ছে...' : 'Sampling highlights across entire video...');

    for (const ts of timestamps) {
      video.currentTime = ts;
      await new Promise(res => setTimeout(res, 220));
      captureFrameAtCurrentTime(ts, true);
    }

    video.currentTime = originalTime;
    if (wasPlaying) {
      video.play().catch(() => {});
    }

    setHighlightsToast(lang === 'bn' ? 'অটো-ক্যাপচার সম্পন্ন হয়েছে!' : 'Batch auto-capture complete!');
    setTimeout(() => setHighlightsToast(null), 3000);
  };

  // Detect AI Scene Changes & Chapter Markers
  const handleDetectChapters = async () => {
    setIsDetectingChapters(true);
    try {
      // Sample 5 representative frames if video element is ready
      const sampleFrames: Array<{ data: string; timestamp: number }> = [];
      if (videoRef.current && (videoDuration > 0 || videoRef.current.duration > 0)) {
        const video = videoRef.current;
        const dur = videoDuration || video.duration || 180;
        const originalTime = video.currentTime;
        const wasPlaying = !video.paused;
        if (wasPlaying) video.pause();

        const sampleTimes = [0, dur * 0.25, dur * 0.5, dur * 0.75, dur * 0.92];
        for (const t of sampleTimes) {
          video.currentTime = Math.floor(t);
          await new Promise(r => setTimeout(r, 180));
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            sampleFrames.push({ data: dataUrl, timestamp: Math.floor(t) });
          }
        }

        video.currentTime = originalTime;
        if (wasPlaying) video.play().catch(() => {});
      }

      const res = await fetch('/api/detect-chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames: sampleFrames,
          transcript: transcript?.fullText,
          duration: videoDuration,
          language: lang,
          context: videoMetadata?.title || videoUrl || videoFile?.name,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (data && data.success && Array.isArray(data.chapters)) {
        setChapters(data.chapters);
        if (data.isApiKeyError) {
          setIsApiKeyError(true);
        }
        setHighlightsToast(
          lang === 'bn'
            ? `${data.chapters.length}টি এআই চ্যাপ্টার মার্কার পাওয়া গেছে!`
            : `Detected ${data.chapters.length} chapter markers!`
        );
        setTimeout(() => setHighlightsToast(null), 3000);
      }
    } catch (err) {
      console.warn('Could not detect chapter markers:', err);
    } finally {
      setIsDetectingChapters(false);
    }
  };

  const handleAddChapterToHighlights = (chap: ChapterMarker) => {
    if (videoRef.current) {
      const video = videoRef.current;
      video.currentTime = chap.timestamp;
      setTimeout(() => {
        captureFrameAtCurrentTime(chap.timestamp, false);
        setHighlights(prev =>
          prev.map(h => (Math.abs(h.timestamp - chap.timestamp) < 2 ? { ...h, note: chap.title } : h))
        );
      }, 220);
    }
  };

  const handleAddAllChaptersToHighlights = async () => {
    if (!chapters || chapters.length === 0 || !videoRef.current) return;
    const video = videoRef.current;
    const originalTime = video.currentTime;
    const wasPlaying = !video.paused;
    if (wasPlaying) video.pause();

    setHighlightsToast(lang === 'bn' ? 'সবগুলো চ্যাপ্টার হাইলাইটে যুক্ত করা হচ্ছে...' : 'Adding all chapters to highlights...');

    for (const chap of chapters) {
      video.currentTime = chap.timestamp;
      await new Promise(r => setTimeout(r, 220));
      captureFrameAtCurrentTime(chap.timestamp, true);
      setHighlights(prev =>
        prev.map(h => (Math.abs(h.timestamp - chap.timestamp) < 2 ? { ...h, note: chap.title } : h))
      );
    }

    video.currentTime = originalTime;
    if (wasPlaying) video.play().catch(() => {});

    setHighlightsToast(lang === 'bn' ? 'সব চ্যাপ্টার হাইলাইটে যুক্ত হয়েছে!' : 'All chapters added as highlights!');
    setTimeout(() => setHighlightsToast(null), 3000);
  };

  // Capture frame on video pause
  const handleVideoPause = () => {
    captureFrameAtCurrentTime();
  };

  const handleHighlightNoteChange = (id: string, note: string) => {
    setHighlights(prev => prev.map(h => h.id === id ? { ...h, note } : h));
  };

  const handleUpdateHighlightFrame = (id: string, newDataUrl: string) => {
    setHighlights(prev => prev.map(h => {
      if (h.id === id) {
        return {
          ...h,
          dataUrl: newDataUrl,
          originalDataUrl: h.originalDataUrl || h.dataUrl,
        };
      }
      return h;
    }));
    setHighlightsToast(lang === 'bn' ? 'ফ্রেমে মার্কিং সফলভাবে সংরক্ষিত হয়েছে!' : 'Frame annotation saved!');
    setTimeout(() => setHighlightsToast(null), 2500);
  };

  const handleDeleteHighlight = (id: string) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
  };

  const handleClearHighlights = () => {
    setHighlights([]);
  };

  // Extract frames helper for Gemini video analysis
  const extractFrames = async (video: HTMLVideoElement, numFrames: number = 8): Promise<{ inlineData: { data: string; mimeType: string } }[]> => {
    const frames: { inlineData: { data: string; mimeType: string } }[] = [];
    
    // 1. Resolve duration reliably across local files and web streams
    let duration = video.duration;
    if (!duration || isNaN(duration) || duration === Infinity || duration <= 0) {
      if (videoDuration && !isNaN(videoDuration) && videoDuration > 0) {
        duration = videoDuration;
      } else if (videoMetadata?.duration && videoMetadata.duration > 0) {
        duration = videoMetadata.duration;
      } else {
        // Wait up to 2.5s for metadata event if video is currently buffering
        await new Promise<void>((resolve) => {
          if (video.duration && !isNaN(video.duration) && video.duration > 0 && video.duration !== Infinity) {
            duration = video.duration;
            return resolve();
          }
          const timer = setTimeout(() => {
            cleanup();
            resolve();
          }, 2500);
          const onLoaded = () => {
            if (video.duration && !isNaN(video.duration) && video.duration !== Infinity) {
              duration = video.duration;
            }
            cleanup();
            resolve();
          };
          const cleanup = () => {
            clearTimeout(timer);
            video.removeEventListener('loadedmetadata', onLoaded);
            video.removeEventListener('durationchange', onLoaded);
            video.removeEventListener('canplay', onLoaded);
          };
          video.addEventListener('loadedmetadata', onLoaded);
          video.addEventListener('durationchange', onLoaded);
          video.addEventListener('canplay', onLoaded);
        });
      }
    }

    // If duration cannot be determined from media events, fallback to current position or standard window
    if (!duration || isNaN(duration) || duration <= 0 || duration === Infinity) {
      duration = (video.currentTime && video.currentTime > 5) ? video.currentTime + 30 : 60;
    }

    const interval = duration / (numFrames + 1);
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    if (!ctx) return frames;

    const originalTime = video.currentTime;

    try {
      for (let i = 1; i <= numFrames; i++) {
        const targetTime = interval * i;
        setAnalysisStatus(
          lang === 'bn'
            ? `ফ্রেম প্রসেস করা হচ্ছে (${i}/${numFrames})...`
            : `Processing frame (${i}/${numFrames})...`
        );

        await new Promise<void>((resolve) => {
          let timeoutId: any;
          const onSeeked = () => {
            clearTimeout(timeoutId);
            video.removeEventListener('seeked', onSeeked);
            try {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
              const base64Data = dataUrl.split(',')[1];
              if (base64Data && base64Data.length > 50) {
                frames.push({
                  inlineData: {
                    data: base64Data,
                    mimeType: 'image/jpeg'
                  }
                });
              }
              resolve();
            } catch (err) {
              console.warn("Canvas capture notice (CORS/tainted):", err);
              resolve();
            }
          };

          timeoutId = setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            try {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
              const base64Data = dataUrl.split(',')[1];
              if (base64Data && base64Data.length > 50) {
                frames.push({
                  inlineData: {
                    data: base64Data,
                    mimeType: 'image/jpeg'
                  }
                });
              }
            } catch {}
            resolve();
          }, 2000);

          video.addEventListener('seeked', onSeeked);
          try {
            video.currentTime = targetTime;
          } catch {
            clearTimeout(timeoutId);
            video.removeEventListener('seeked', onSeeked);
            resolve();
          }
        });
      }
    } finally {
      try {
        video.currentTime = originalTime;
      } catch {}
    }

    return frames;
  };

  // Audio extraction and speech transcription
  const handleExtractAudioAndTranscribe = async () => {
    if (!videoPreview && !videoFile && !videoUrl) {
      setError(lang === 'bn' ? 'অনুগ্রহ করে প্রথমে একটি ভিডিও ফাইল বা লিঙ্ক দিন।' : 'Please provide a video file or URL first.');
      return;
    }

    setIsExtractingAudio(true);
    setError(null);
    setIsApiKeyError(false);

    try {
      let durationSec = videoDuration || videoMetadata?.duration || 60;
      let audioUrl = '';
      let formattedSize = videoMetadata?.fileSize || 'Cloud Stream';
      const payload: any = {
        language: lang,
        context: videoMetadata?.title || (videoFile ? videoFile.name : 'Video Track'),
        duration: durationSec,
      };

      if (videoFile) {
        setAudioExtractionStatus(lang === 'bn' ? 'ব্রাউজার থেকে অডিও চ্যানেল আলাদা করা হচ্ছে...' : 'Extracting audio channels...');
        const result = await extractAudioFromVideoFile(videoFile, (msg: string) => {
          setAudioExtractionStatus(msg);
        });
        durationSec = result.durationSeconds;
        audioUrl = result.audioUrl;
        formattedSize = result.formattedSize;

        payload.audioData = result.audioBase64;
        payload.mimeType = 'audio/wav';
        payload.duration = durationSec;
      } else {
        // Web URL (YouTube, Vimeo, direct MP4, etc.) - Send videoUrl to server without browser CORS fetch
        setAudioExtractionStatus(lang === 'bn' ? 'ভিডিও লিঙ্ক থেকে স্পিচ অডিও প্রসেস করা হচ্ছে...' : 'Processing audio track from video URL...');
        payload.videoUrl = videoUrl || videoPreview;
      }

      setAudioExtractionStatus(lang === 'bn' ? 'AI স্পিচ-টু-টেক্সট ট্রান্সক্রিপশন শুরু হচ্ছে...' : 'Running speech-to-text transcription...');

      const apiRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await apiRes.json().catch(() => ({}));

      if (!apiRes.ok || !data.success) {
        const isKey = Boolean(data.isApiKeyError);
        setIsApiKeyError(isKey);

        if (data.transcript?.segments?.length > 0) {
          setTranscript({
            fullText: data.transcript.fullText || '',
            segments: data.transcript.segments,
            durationSeconds: durationSec,
            languageDetected: data.transcript.languageDetected,
            extractedAt: new Date().toISOString(),
            audioUrl: audioUrl || undefined,
            audioSizeFormatted: formattedSize,
            isApiKeyError: isKey,
          });
          setRightPanelTab('transcript');
        }

        if (isKey) {
          setError(
            lang === 'bn'
              ? 'অডিও ট্র্যাক প্রস্তুত হয়েছে! তবে AI টেক্সট ট্রান্সক্রিপ্ট পেতে Settings > Secrets থেকে সচল GEMINI_API_KEY আপডেট করুন।'
              : 'Audio track ready! However, AI transcription requires an active GEMINI_API_KEY in Settings > Secrets.'
          );
        } else {
          setError(
            lang === 'bn'
              ? (data.errorBn || data.error || 'ট্রান্সক্রিপ্ট তৈরি করতে ব্যর্থ হয়েছে।')
              : (data.errorEn || data.error || 'Failed to generate transcript.')
          );
        }
        return;
      }

      const transcriptData: VideoTranscript = {
        fullText: data.transcript.fullText,
        segments: data.transcript.segments,
        durationSeconds: durationSec || (data.transcript.segments?.length ? data.transcript.segments[data.transcript.segments.length - 1].end : 60),
        languageDetected: data.transcript.languageDetected,
        extractedAt: new Date().toISOString(),
        audioUrl: audioUrl || undefined,
        audioSizeFormatted: formattedSize,
        isApiKeyError: Boolean(data.isApiKeyError),
      };

      setTranscript(transcriptData);
      setRightPanelTab('transcript');
    } catch (err: any) {
      console.error("Audio extraction error:", err);
      const rawMsg = err?.message || '';
      const isKey = err.isApiKeyError || rawMsg.includes('API_KEY');
      setIsApiKeyError(isKey);
      setError(rawMsg || (lang === 'bn' ? 'অডিও প্রসেসিংয়ে একটি সমস্যা হয়েছে।' : 'Audio processing failed.'));
    } finally {
      setIsExtractingAudio(false);
      setAudioExtractionStatus('');
    }
  };

  // Perform AI Video Deep Analysis
  const handleAnalyzeVideo = async () => {
    if (!videoPreview && !videoUrl) {
      setError(lang === 'bn' ? "অনুগ্রহ করে একটি ভিডিও নির্বাচন বা লিঙ্ক দিন।" : "Please provide a video file or URL.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setIsApiKeyError(false);
    setAnalysisStatus(lang === 'bn' ? "ভিডিও লোড করা হচ্ছে..." : "Loading video...");
    setRightPanelTab('report');

    try {
      let frames: { inlineData: { data: string; mimeType: string } }[] = [];

      // Try client-side frame extraction if video element is available
      if (videoRef.current) {
        try {
          setAnalysisStatus(lang === 'bn' ? "ভিডিও ফ্রেম নিষ্কাশন করা হচ্ছে..." : "Extracting video frames...");
          frames = await extractFrames(videoRef.current, 6);
        } catch (frameErr) {
          console.warn("Frame extraction skipped or deferred:", frameErr);
        }
      }

      // If no frames could be extracted client-side (e.g. remote URL, CORS, or background video):
      // Try to capture at least 1 snapshot from current video if possible
      if (frames.length === 0 && videoRef.current) {
        try {
          const video = videoRef.current;
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, 640, 360);
            const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            if (base64 && base64.length > 50) {
              frames.push({ inlineData: { data: base64, mimeType: 'image/jpeg' } });
            }
          }
        } catch {}
      }

      // If still no frames and no videoUrl and no highlights, throw friendly message
      if (frames.length === 0 && !videoUrl && highlights.length === 0) {
        throw new Error(lang === 'bn' ? "ভিডিও থেকে ফ্রেম পাওয়া যায়নি।" : "Could not extract video frames.");
      }

      setAnalysisStatus(lang === 'bn' ? "AI বিশ্লেষণ শুরু করছে..." : "AI is running multimodal analysis...");

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames: frames.map(f => ({
            data: f.inlineData.data,
            mimeType: f.inlineData.mimeType
          })),
          url: videoUrl || undefined,
          mode: analysisMode,
          language: lang,
          contextDescription: videoMetadata ? `${videoMetadata.title} ${videoMetadata.publisher ? `(${videoMetadata.publisher})` : ''}`.trim() : undefined,
          highlights: highlights.map(h => ({
            timestamp: h.timestamp,
            note: h.note,
            data: h.dataUrl
          }))
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        const isKey = Boolean(data.isApiKeyError);
        setIsApiKeyError(isKey);
        throw new Error(
          isKey
            ? (lang === 'bn' ? (data.errorBn || data.error) : (data.errorEn || data.error))
            : (data.error || (lang === 'bn' ? 'সার্ভার থেকে বিশ্লেষণ প্রস্তুত করা যায়নি।' : 'Server failed to process analysis'))
        );
      }

      const resultText = data.result || (lang === 'bn' ? "কোনো বিশ্লেষণ পাওয়া যায়নি।" : "No analysis found.");
      setAnalysisResult(resultText);
      setIsApiKeyError(Boolean(data.isApiKeyError));
      setError(null);
      saveToHistory(resultText, videoMetadata?.title || (videoFile ? videoFile.name : videoUrl), videoFile ? 'file' : 'url');
    } catch (err: any) {
      const rawMsg = err?.message || '';
      const isKey = rawMsg.includes('API key') || rawMsg.includes('API_KEY') || rawMsg.includes('GEMINI_API_KEY');
      setIsApiKeyError(isKey);

      if (isKey) {
        console.info("Gemini Smart Preview active (API key inactive or expired).");
        setError(
          lang === 'bn'
            ? "Gemini API কীটি সক্রিয় না থাকায় স্মার্ট প্রিভিউ মোড চালু রয়েছে। AI Studio-এর Settings > Secrets থেকে সচল GEMINI_API_KEY আপডেট করতে পারেন।"
            : "Gemini Smart Preview active. You can configure an active GEMINI_API_KEY in Settings > Secrets."
        );
      } else if (rawMsg.includes('tainted canvas') || rawMsg.includes('SecurityError')) {
        console.warn("CORS restriction on canvas capture:", rawMsg);
        setError(
          lang === 'bn'
            ? "রিমোট ভিডিওর CORS বিধিনিষেধের কারণে ফ্রেম পড়া সম্ভব হয়নি। ভিডিও লিঙ্কটি অ্যানালাইজারে পাঠান বা ডাউনলোড করে আপলোড করুন।"
            : "CORS restriction prevented extracting remote frames. Download the video and upload it instead."
        );
      } else {
        console.warn("Analysis notice:", rawMsg);
        setError(rawMsg || (lang === 'bn' ? "ভিডিও বিশ্লেষণ করতে একটি সমস্যা হয়েছে।" : "An error occurred during analysis."));
      }
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  };

  // Master One-Click Auto Extract (Highlights + Transcript + AI Analysis)
  const handleOneClickAutoExtractAll = async () => {
    if (!videoPreview && !videoFile && !videoUrl) {
      setError(lang === 'bn' ? 'অনুগ্রহ করে প্রথমে একটি ভিডিও ফাইল বা লিঙ্ক দিন।' : 'Please provide a video file or URL first.');
      return;
    }

    setIsOneClickExtracting(true);
    setError(null);
    setIsApiKeyError(false);

    try {
      // Step 1: Highlights Auto Sampling across entire video
      if (videoRef.current && (videoDuration > 0 || videoRef.current.duration > 0)) {
        setOneClickProgressStatus(
          lang === 'bn'
            ? 'ধাপ ১/৩: ভিডিও থেকে অটো ফ্রেম হাইলাইট এক্সট্র্যাক্ট করা হচ্ছে...'
            : 'Step 1/3: Auto sampling video frame highlights...'
        );
        await handleBatchAutoCapture();
      }

      // Step 2: Extract audio and transcribe speech to text
      setOneClickProgressStatus(
        lang === 'bn'
          ? 'ধাপ ২/৩: স্পিচ অডিও এক্সট্র্যাক্ট ও ট্রান্সক্রাইব করা হচ্ছে...'
          : 'Step 2/3: Extracting audio and transcribing speech to text...'
      );
      await handleExtractAudioAndTranscribe();

      // Step 3: Run AI deep video analysis
      setOneClickProgressStatus(
        lang === 'bn'
          ? 'ধাপ ৩/৩: গভীর এআই ভিডিও বিশ্লেষণ রিপোর্ট তৈরি করা হচ্ছে...'
          : 'Step 3/3: Generating deep AI video analysis report...'
      );
      await handleAnalyzeVideo();

      setRightPanelTab('report');
      setHighlightsToast(
        lang === 'bn'
          ? 'এক ক্লিকে ফ্রেম, অডিও ট্রান্সক্রিপ্ট ও গভীর বিশ্লেষণ সফলভাবে সম্পন্ন হয়েছে!'
          : 'One-click auto extraction complete!'
      );
    } catch (err: any) {
      console.error('One-click auto extraction error:', err);
      setError(err?.message || (lang === 'bn' ? 'এক ক্লিকে এক্সট্রাকশন সম্পন্ন করার সময় ত্রুটি ঘটেছে।' : 'One-click auto extraction failed.'));
    } finally {
      setIsOneClickExtracting(false);
      setOneClickProgressStatus(null);
    }
  };

  // PDF Export Generation
  const handleExportToPDF = async () => {
    if (!analysisResult) return;
    setIsGeneratingPDF(true);

    try {
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });

      const pageHeight = 297;
      const margin = 20;
      const bottomMargin = 25;
      const contentWidth = 170;
      let y = 25;
      let pageNum = 1;

      let fontLoaded = false;
      const fontUrl = "https://cdn.jsdelivr.net/gh/atulanand206/hindi-fonts@master/SolaimanLipi.ttf";

      try {
        const response = await fetch(fontUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          doc.addFileToVFS('SolaimanLipi.ttf', base64);
          doc.addFont('SolaimanLipi.ttf', 'SolaimanLipi', 'normal');
          doc.setFont('SolaimanLipi');
          fontLoaded = true;
        }
      } catch (fontErr) {
        console.warn("SolaimanLipi not loaded, defaulting to Helvetica", fontErr);
      }

      if (!fontLoaded) {
        doc.setFont('Helvetica', 'normal');
      }

      const checkY = (neededHeight: number) => {
        if (y + neededHeight > pageHeight - bottomMargin) {
          doc.addPage();
          pageNum++;
          y = 25;
          if (fontLoaded) doc.setFont('SolaimanLipi');
          else doc.setFont('Helvetica');
        }
      };

      const drawHeaderAndFooter = (pdfDoc: any, pIndex: number, total: number) => {
        pdfDoc.setFontSize(8);
        pdfDoc.setTextColor(100, 116, 139);
        if (fontLoaded) pdfDoc.setFont('SolaimanLipi', 'normal');
        else pdfDoc.setFont('Helvetica', 'normal');

        // Top line
        pdfDoc.text(lang === 'bn' ? "ভিডিও বিশ্লেষক AI // রিপোর্ট" : "Video Insight AI // Report", margin, 15);
        pdfDoc.setDrawColor(226, 232, 240);
        pdfDoc.setLineWidth(0.2);
        pdfDoc.line(margin, 17, 210 - margin, 17);

        // Bottom line
        pdfDoc.line(margin, pageHeight - 17, 210 - margin, pageHeight - 17);
        pdfDoc.text(lang === 'bn' ? "জেনারেটেড রিপোর্ট - অফলাইন কপি" : "Generated Report - Offline Copy", margin, pageHeight - 12);
        const pageLabel = lang === 'bn' ? `পৃষ্ঠা ${pIndex} / ${total}` : `Page ${pIndex} / ${total}`;
        pdfDoc.text(pageLabel, 210 - margin - pdfDoc.getTextWidth(pageLabel), pageHeight - 12);
      };

      // Title Banner
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(margin, y, contentWidth, 32, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.text(lang === 'bn' ? "ভিডিও বিশ্লেষণ রিপোর্ট" : "VIDEO ANALYSIS REPORT", margin + 8, y + 12);

      doc.setFontSize(9);
      const modeLabel = lang === 'bn'
        ? `মোড: ${analysisMode === 'problem_solving' ? 'সমস্যা ও সমাধান' : analysisMode === 'learning_points' ? 'শিক্ষণীয় বিষয়' : 'স্ট্যান্ডার্ড'}`
        : `Mode: ${analysisMode === 'problem_solving' ? 'Problem & Solutions' : analysisMode === 'learning_points' ? 'Key Learnings' : 'Standard'}`;
      doc.text(modeLabel, margin + 8, y + 20);

      const sourceLabel = `Video: ${videoFile ? videoFile.name : (videoUrl.substring(0, 45) + (videoUrl.length > 45 ? '...' : ''))}`;
      doc.text(sourceLabel, margin + 8, y + 26);

      y += 40;

      // Highlights thumbnails
      if (highlights.length > 0) {
        checkY(15);
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(lang === 'bn' ? "চিহ্নিত ফ্রেম ও হাইলাইটস" : "Captured Highlights", margin, y);
        y += 8;

        for (let i = 0; i < highlights.length; i++) {
          const h = highlights[i];
          const imgWidth = 44;
          const imgHeight = 24;
          checkY(imgHeight + 10);

          try {
            doc.addImage(h.dataUrl, 'JPEG', margin, y + 2, imgWidth, imgHeight);
          } catch (e) {
            doc.rect(margin, y + 2, imgWidth, imgHeight);
          }

          doc.setFontSize(8);
          doc.setTextColor(71, 85, 105);
          const noteText = h.note || (lang === 'bn' ? 'ব্যবহারকারী নোট দেননি।' : 'No note provided.');
          const wrapped = doc.splitTextToSize(noteText, contentWidth - imgWidth - 6);
          let noteY = y + 7;
          wrapped.forEach((wl: string) => {
            if (noteY < y + imgHeight + 4) {
              doc.text(wl, margin + imgWidth + 6, noteY);
              noteY += 4;
            }
          });

          y += imgHeight + 8;
        }
      }

      // Markdown Lines
      checkY(16);
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(lang === 'bn' ? "বিশ্লেষণ ফলাফল" : "Core Analysis", margin, y);
      y += 8;

      const lines = (analysisResult || "").split("\n");
      lines.forEach((line) => {
        const clean = line.trim();
        if (!clean) {
          y += 3;
          return;
        }

        if (clean.startsWith('# ')) {
          const text = clean.substring(2);
          const wrapped = doc.splitTextToSize(text, contentWidth);
          checkY(wrapped.length * 6 + 6);
          doc.setFontSize(13);
          doc.setTextColor(15, 23, 42);
          wrapped.forEach((wl: string) => {
            doc.text(wl, margin, y + 4);
            y += 5.5;
          });
          y += 2;
        } else if (clean.startsWith('## ')) {
          const text = clean.substring(3);
          const wrapped = doc.splitTextToSize(text, contentWidth);
          checkY(wrapped.length * 5 + 5);
          doc.setFontSize(11);
          doc.setTextColor(30, 41, 59);
          wrapped.forEach((wl: string) => {
            doc.text(wl, margin, y + 4);
            y += 5;
          });
          y += 1.5;
        } else if (clean.startsWith('- ') || clean.startsWith('* ')) {
          const text = clean.substring(2).replace(/\*\*/g, '').replace(/\*/g, '');
          const wrapped = doc.splitTextToSize(text, contentWidth - 6);
          checkY(wrapped.length * 4.5 + 2);
          doc.setFontSize(9.5);
          doc.setTextColor(51, 65, 85);
          doc.text("•", margin + 1, y + 3.5);
          wrapped.forEach((wl: string) => {
            doc.text(wl, margin + 5, y + 3.5);
            y += 4.2;
          });
          y += 1;
        } else {
          const polished = clean.replace(/\*\*/g, '').replace(/\*/g, '');
          const wrapped = doc.splitTextToSize(polished, contentWidth);
          checkY(wrapped.length * 4.5 + 2);
          doc.setFontSize(9.5);
          doc.setTextColor(51, 65, 85);
          wrapped.forEach((wl: string) => {
            doc.text(wl, margin, y + 3.5);
            y += 4.2;
          });
          y += 1;
        }
      });

      const totalPages = doc.internal.pages.length - 1;
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        drawHeaderAndFooter(doc, i, totalPages);
      }

      const filename = `${videoFile ? videoFile.name.split('.')[0] : 'video'}_analysis_report.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleSendFromDownloaderToAnalyzer = (url: string) => {
    setVideoUrl(url);
    setVideoPreview(url);
    setActiveTab('url');
    setMainView('studio');
    setAnalysisResult(null);
    setHighlights([]);
    setTranscript(null);
    resolveVideoMetadata(url);
  };

  const handleSelectHistory = (item: AnalysisHistory) => {
    setAnalysisResult(item.result);
    if (item.mode) setAnalysisMode(item.mode as AnalysisMode);
    setRightPanelTab('report');
  };

  return (
    <div className="app-container selection:bg-[var(--brand-primary)] selection:text-white antialiased">
      {/* 1. Header (Sticky & Responsive) */}
      <Header
        lang={lang}
        onLanguageChange={setLang}
        mainView={mainView}
        onViewChange={setMainView}
        themeMode={themeMode}
        onThemeChange={setThemeMode}
        effectiveTheme={effectiveTheme}
      />

      {/* 2. Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 transition-all">
        {/* VIEW 1: Video Studio (Primary Workspace) */}
        {mainView === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
            {/* Left Column: Video Controls & Scrubber (Cols 1-5 on Desktop, Full on Tablet/Mobile) */}
            <div className="lg:col-span-5 w-full">
              <VideoInputPanel
                lang={lang}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                analysisMode={analysisMode}
                setAnalysisMode={setAnalysisMode}
                videoFile={videoFile}
                videoUrl={videoUrl}
                setVideoUrl={setVideoUrl}
                videoPreview={videoPreview}
                videoDuration={videoDuration}
                videoCurrentTime={videoCurrentTime}
                onFileChange={handleFileChange}
                onClearFile={handleClearFile}
                onUrlSubmit={handleUrlSubmit}
                onScrubChange={handleScrubChange}
                onVideoPause={handleVideoPause}
                onVideoLoadedMetadata={handleVideoLoadedMetadata}
                onVideoTimeUpdate={handleVideoTimeUpdate}
                videoRef={videoRef}
                highlights={highlights}
                highlightsToast={highlightsToast}
                onSeekToTimestamp={handleSeekVideo}
                onHighlightNoteChange={handleHighlightNoteChange}
                onDeleteHighlight={handleDeleteHighlight}
                onClearHighlights={handleClearHighlights}
                onUpdateHighlightFrame={handleUpdateHighlightFrame}
                onManualCaptureFrame={captureFrameAtCurrentTime}
                onSuggestHighlightLabel={suggestHighlightLabel}
                autoCaptureEnabled={autoCaptureEnabled}
                setAutoCaptureEnabled={setAutoCaptureEnabled}
                autoCaptureInterval={autoCaptureInterval}
                setAutoCaptureInterval={setAutoCaptureInterval}
                onBatchAutoCapture={handleBatchAutoCapture}
                chapters={chapters}
                isDetectingChapters={isDetectingChapters}
                onDetectChapters={handleDetectChapters}
                onAddChapterToHighlights={handleAddChapterToHighlights}
                onAddAllChaptersToHighlights={handleAddAllChaptersToHighlights}
                onOneClickAutoExtractAll={handleOneClickAutoExtractAll}
                isOneClickExtracting={isOneClickExtracting}
                oneClickProgressStatus={oneClickProgressStatus}
                isExtractingAudio={isExtractingAudio}
                audioExtractionStatus={audioExtractionStatus}
                hasTranscript={Boolean(transcript)}
                onExtractAudioAndTranscribe={handleExtractAudioAndTranscribe}
                isAnalyzing={isAnalyzing}
                analysisStatus={analysisStatus}
                onAnalyzeVideo={handleAnalyzeVideo}
                error={error}
                isApiKeyError={isApiKeyError}
                onErrorDismiss={() => setError(null)}
                history={history}
                onSelectHistory={handleSelectHistory}
                onClearHistory={handleClearHistory}
              />
            </div>

            {/* Right Column: Analysis Report & Audio Transcript (Cols 6-12 on Desktop, Full on Tablet/Mobile) */}
            <div className="lg:col-span-7 w-full h-full">
              <AnalysisReportView
                lang={lang}
                rightPanelTab={rightPanelTab}
                setRightPanelTab={setRightPanelTab}
                analysisResult={analysisResult}
                analysisMode={analysisMode}
                isAnalyzing={isAnalyzing}
                analysisStatus={analysisStatus}
                transcript={transcript}
                isExtractingAudio={isExtractingAudio}
                audioExtractionStatus={audioExtractionStatus}
                onExtractAudioAndTranscribe={handleExtractAudioAndTranscribe}
                onSeekVideo={handleSeekVideo}
                videoCurrentTime={videoCurrentTime}
                onExportToPDF={handleExportToPDF}
                isGeneratingPDF={isGeneratingPDF}
                isApiKeyError={isApiKeyError}
                metadata={videoMetadata}
                onPlayPreview={() => {
                  if (videoRef.current) {
                    if (videoRef.current.paused) {
                      videoRef.current.play().catch(() => {});
                    } else {
                      videoRef.current.pause();
                    }
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* VIEW 2: Multi-Platform Video Downloader */}
        {mainView === 'downloader' && (
          <div className="max-w-4xl mx-auto w-full">
            <VideoDownloader
              lang={lang}
              onSendToAnalyzer={handleSendFromDownloaderToAnalyzer}
            />
          </div>
        )}

        {/* VIEW 3: Headless MCP Agent Hub */}
        {mainView === 'mcp' && (
          <div className="max-w-5xl mx-auto w-full">
            <McpAgentHub
              lang={lang}
              onAnalysisTriggered={(result) => {
                setAnalysisResult(result);
                setMainView('studio');
                setRightPanelTab('report');
              }}
            />
          </div>
        )}
      </main>

      {/* 3. Minimal Clean 1-Line Footer */}
      <footer className="app-footer">
        <p>© {new Date().getFullYear()} Video Insight AI</p>
      </footer>
    </div>
  );
}
export default App;
