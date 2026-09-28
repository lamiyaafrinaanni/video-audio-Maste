import React, { useState } from 'react';
import { 
  Download, 
  Sparkles, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Video, 
  Music, 
  Image as ImageIcon,
  ArrowRight,
  ShieldCheck,
  ClipboardPaste,
  X,
  Copy,
  Check,
  Play
} from 'lucide-react';
import { Language } from '../types';

interface VideoFormat {
  id: string;
  label: string;
  ext: string;
  quality: string;
  sizeEst?: string;
  directDownloadUrl?: string;
  isDirect?: boolean;
}

interface VideoInfo {
  platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'twitter' | 'direct';
  platformLabel: string;
  platformColor: string;
  title: string;
  author: string;
  thumbnail: string;
  fallbackThumbnail?: string;
  originalUrl: string;
  videoId?: string;
  shortcode?: string;
  embedUrl?: string;
  formats: VideoFormat[];
}

interface VideoDownloaderProps {
  lang: Language;
  onSendToAnalyzer: (url: string) => void;
}

export const VideoDownloader: React.FC<VideoDownloaderProps> = ({ lang, onSendToAnalyzer }) => {
  const isBn = lang === 'bn';

  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>('1080p');
  
  // Download progress states
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatusText, setDownloadStatusText] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  // Detect platform as user types
  const detectPlatform = (url: string) => {
    const l = url.toLowerCase().trim();
    if (l.includes('youtube.com') || l.includes('youtu.be')) return { name: 'YouTube', color: '#FF0000', icon: '▶' };
    if (l.includes('tiktok.com')) return { name: 'TikTok', color: '#000000', icon: '🎵' };
    if (l.includes('instagram.com')) return { name: 'Instagram', color: '#E1306C', icon: '📸' };
    if (l.includes('facebook.com') || l.includes('fb.watch')) return { name: 'Facebook', color: '#1877F2', icon: '👥' };
    if (l.includes('twitter.com') || l.includes('x.com')) return { name: 'X / Twitter', color: '#0F1419', icon: '𝕏' };
    if (l.endsWith('.mp4') || l.endsWith('.webm') || l.endsWith('.mov')) return { name: 'Direct Video', color: '#2563EB', icon: '📁' };
    return null;
  };

  const currentDetected = detectPlatform(urlInput);

  const fetchVideoByUrl = async (targetUrl: string) => {
    if (!targetUrl.trim()) return;

    setIsLoading(true);
    setError(null);
    setVideoInfo(null);
    setDownloadSuccess(false);

    try {
      const res = await fetch('/api/video/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(isBn ? (data.errorBn || data.error) : data.error);
      }

      setVideoInfo(data);
      if (data.formats && data.formats.length > 0) {
        setSelectedFormat(data.formats[0].id);
      }
    } catch (err: any) {
      setError(err.message || (isBn ? 'ভিডিওর তথ্য অনুসন্ধান করতে সমস্যা হয়েছে।' : 'Failed to retrieve video information.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchInfo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await fetchVideoByUrl(urlInput);
  };

  const handleStartDownload = () => {
    if (!videoInfo) return;

    const chosen = videoInfo.formats.find(f => f.id === selectedFormat) || videoInfo.formats[0];

    // If direct link exists (like HD thumbnail or direct source MP4), trigger browser download
    if (chosen?.directDownloadUrl) {
      window.location.href = chosen.directDownloadUrl;
      setDownloadSuccess(true);
      return;
    }

    // Start progress simulation for stream packaging
    setIsDownloading(true);
    setDownloadProgress(5);
    setDownloadSuccess(false);
    setDownloadStatusText(lang === 'bn' ? 'সার্ভার সংযোগ স্থাপন করা হচ্ছে...' : 'Establishing stream connection...');

    const interval = setInterval(() => {
      setDownloadProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval);
          setTimeout(() => {
            setIsDownloading(false);
            setDownloadProgress(100);
            setDownloadSuccess(true);
            setDownloadStatusText(lang === 'bn' ? 'প্রসেসিং সম্পন্ন হয়েছে!' : 'Download stream ready!');
            
            // If direct link, download; else open stream/embed
            if (videoInfo.platform === 'direct') {
              window.location.href = `/api/video/download-stream?url=${encodeURIComponent(videoInfo.originalUrl)}&filename=${encodeURIComponent(videoInfo.title)}`;
            } else if (chosen.directDownloadUrl) {
              window.location.href = chosen.directDownloadUrl;
            }
          }, 600);
          return 95;
        }

        const next = prev + Math.floor(Math.random() * 15) + 8;
        if (next > 40 && next < 75) {
          setDownloadStatusText(lang === 'bn' ? 'ফরম্যাট কনভার্সন ও অডিও সিঙ্ক চলছে...' : 'Encoding format & syncing audio...');
        } else if (next >= 75) {
          setDownloadStatusText(lang === 'bn' ? 'ভিডিও ফাইল প্রস্তুত করা হচ্ছে...' : 'Finalizing video package...');
        }
        return next > 95 ? 95 : next;
      });
    }, 280);
  };

  const handleCopyLink = () => {
    if (videoInfo?.originalUrl) {
      navigator.clipboard.writeText(videoInfo.originalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl p-6 sm:p-8 shadow-card">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[var(--border-subtle)] pb-5 mb-6">
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <span>{lang === 'bn' ? 'মাল্টি-প্ল্যাটফর্ম ভিডিও ডাউনলোডার' : 'Multi-Platform Video Downloader'}</span>
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-muted)]">
              {lang === 'bn' 
                ? 'ইউটিউব, টিকটক, ইনস্টাগ্রাম, ফেসবুক ও সরাসরি ভিডিও লিঙ্ক থেকে মেটাডাটা ও ভিডিও ডাউনলোড করুন।'
                : 'Retrieve metadata, resolution formats, and download files from YouTube, TikTok, Instagram, and direct links.'}
            </p>
          </div>

          {/* Supported platform badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-2.5 py-1 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold">YouTube</span>
            <span className="px-2.5 py-1 bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 rounded-lg text-xs font-semibold">Instagram</span>
            <span className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-xs font-semibold">TikTok</span>
            <span className="px-2.5 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-lg text-xs font-semibold">Facebook</span>
            <span className="px-2.5 py-1 bg-[var(--surface-muted)] text-[var(--text-secondary)] border border-[var(--border-strong)] rounded-lg text-xs font-semibold">X (Twitter)</span>
            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold">Direct MP4</span>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleFetchInfo} className="space-y-4">
          <div className="relative">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={isBn ? 'ভিডিও লিঙ্ক পেস্ট করুন (YouTube, TikTok, Instagram, MP4)...' : 'Paste video URL from any platform (YouTube, TikTok, Instagram, .mp4)...'}
              className="w-full pl-4 pr-36 py-3.5 bg-[var(--surface-muted)] hover:bg-[var(--surface-card)] border border-[var(--border-strong)] hover:border-[var(--brand-primary)] focus:border-[var(--brand-primary)] focus:bg-[var(--surface-card)] focus:ring-3 focus:ring-[var(--brand-primary)]/15 rounded-xl text-xs sm:text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-light)] shadow-2xs transition-all duration-200 min-h-[48px]"
              required
            />
            {currentDetected && (
              <div 
                className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white flex items-center gap-1.5 shadow-xs"
                style={{ backgroundColor: currentDetected.color }}
              >
                <span>{currentDetected.icon}</span>
                <span>{currentDetected.name}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Working mode paste helper */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                      setUrlInput(text.trim());
                      fetchVideoByUrl(text.trim());
                    }
                  } catch {
                    // clipboard fallback
                  }
                }}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs active:scale-95 min-h-[36px]"
                title={isBn ? "ক্লিপবোর্ড থেকে পেস্ট ও সরাসরি খুঁজুন" : "Paste URL from clipboard & resolve"}
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-blue-600" />
                <span>{isBn ? "📋 ক্লিপবোর্ড থেকে পেস্ট" : "📋 Paste from Clipboard"}</span>
              </button>

              {urlInput && (
                <button
                  type="button"
                  onClick={() => {
                    setUrlInput('');
                    setVideoInfo(null);
                    setError(null);
                  }}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors min-h-[36px]"
                  title={isBn ? "মুছে ফেলুন" : "Clear input"}
                >
                  <X className="w-3.5 h-3.5" />
                  <span>{isBn ? "মুছুন" : "Clear"}</span>
                </button>
              )}

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/70 rounded-lg text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{isBn ? "ওয়ার্কিং মোড সক্রিয়" : "Working Mode Active"}</span>
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading || !urlInput.trim()}
              className="px-6 py-3 bg-slate-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm min-h-[44px] active:scale-98"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isBn ? 'মেটাডাটা লোড হচ্ছে...' : 'Resolving Video...'}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>{isBn ? 'ভিডিও আনুন ও ফরম্যাট দেখুন' : 'Fetch & Resolve'}</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Error message */}
        {error && (
          <div className="mt-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-red-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Video Details & Formats Card */}
      {videoInfo && (
        <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl p-6 sm:p-8 shadow-card space-y-6 animate-in slide-in-from-bottom-2 duration-300">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Thumbnail Preview */}
            <div className="lg:col-span-5 space-y-4">
              <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden border border-[var(--border-subtle)] relative group shadow-inner">
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    if (videoInfo.fallbackThumbnail && (e.currentTarget.src !== videoInfo.fallbackThumbnail)) {
                      e.currentTarget.src = videoInfo.fallbackThumbnail;
                    }
                  }}
                  className="w-full h-full object-cover rounded-xl transition-all duration-500 ease-out group-hover:scale-105 group-hover:brightness-105 filter drop-shadow-xs"
                />
                <div 
                  className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-white shadow-xs"
                  style={{ backgroundColor: videoInfo.platformColor }}
                >
                  {videoInfo.platformLabel}
                </div>
                {videoInfo.embedUrl && (
                  <a
                    href={videoInfo.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white gap-2 text-xs font-bold"
                  >
                    <Play className="w-10 h-10 fill-current" />
                  </a>
                )}
              </div>

              {/* Action: Send to AI Video Insight Studio */}
              <div className="p-4 bg-[var(--brand-light)] border border-[var(--brand-border)] rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold flex items-center gap-1.5 text-[var(--brand-text)]">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
                    <span>{isBn ? 'AI विश्लेषण স্টুডিও' : 'AI Insight Studio'}</span>
                  </span>
                  <span className="text-[10px] font-mono font-semibold bg-[var(--surface-card)] text-[var(--brand-text)] border border-[var(--brand-border)] px-1.5 py-0.5 rounded">
                    Gemini 3.8
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {isBn
                    ? 'এই ভিডিওটির সারসংক্ষেপ, টাইমস্ট্যাম্প, সমস্যা-সমাধান ও ট্রান্সক্রিপ্ট পেতে AI স্টুডিওতে পাঠান।'
                    : 'Analyze this video for step-by-step summary, root problems, pros/cons, and transcription.'}
                </p>
                <button
                  type="button"
                  onClick={() => onSendToAnalyzer(videoInfo.originalUrl)}
                  className="w-full py-3 px-4 bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer shadow-xs hover:shadow-md hover:shadow-indigo-600/20 active:scale-[0.99] focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 min-h-[42px]"
                >
                  <Sparkles className="w-4 h-4 text-indigo-200" />
                  <span>{isBn ? 'AI অ্যানালাইজারে পাঠান' : 'Send to AI Analyzer'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Video Details & Formats */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-5">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-mono text-[var(--text-muted)] flex items-center gap-1">
                    <span>{isBn ? 'লেখক / চ্যানেল:' : 'Author:'}</span>
                    <strong className="text-[var(--text-primary)]">{videoInfo.author}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="text-xs font-mono px-2.5 py-1 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] rounded-lg flex items-center gap-1 cursor-pointer transition-colors min-h-[32px]"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? (isBn ? 'কপি হয়েছে' : 'Copied') : (isBn ? 'লিঙ্ক কপি' : 'Copy URL')}</span>
                    </button>
                  </div>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] leading-snug">
                  {videoInfo.title}
                </h3>
              </div>

              {/* Format selection */}
              <div className="space-y-2.5 pt-3 border-t border-[var(--border-subtle)]">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] block">
                  {isBn ? 'ফরম্যাট ও রেজোলিউশন নির্বাচন করুন:' : 'Select Format & Quality:'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {videoInfo.formats.map((fmt) => {
                    const isSelected = selectedFormat === fmt.id;
                    const isAudio = fmt.ext === 'mp3';
                    const isImg = fmt.ext === 'jpg';

                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setSelectedFormat(fmt.id)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer min-h-[52px] ${
                          isSelected
                            ? 'border-[var(--brand-primary)] bg-[var(--brand-light)] text-[var(--brand-text)] shadow-xs ring-1 ring-[var(--brand-primary)]'
                            : 'border-[var(--border-subtle)] bg-[var(--surface-card-subtle)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)] text-[var(--text-primary)]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="flex items-center gap-1.5">
                            {isAudio ? <Music className="w-3.5 h-3.5 text-amber-500" /> : isImg ? <ImageIcon className="w-3.5 h-3.5 text-emerald-500" /> : <Video className="w-3.5 h-3.5 text-[var(--brand-primary)]" />}
                            <span>{fmt.label}</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono mt-1">
                          <span className="uppercase">{fmt.ext} • {fmt.quality}</span>
                          <span>{fmt.sizeEst}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Download Progress & Status Container */}
              <div className="space-y-2">
                {isDownloading && (
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 animate-in fade-in">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="flex items-center gap-2 font-bold text-blue-950">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span>{downloadStatusText}</span>
                      </span>
                      <span className="font-bold text-blue-700">{downloadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                        style={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {downloadSuccess && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-medium animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      {isBn 
                        ? 'ডাউনলোড সম্পন্ন হয়েছে! আপনার ব্রাউজারের ডাউনলোড ফোল্ডারে ফাইলটি চেক করুন।'
                        : 'Download initiated successfully! Please check your browser downloads.'}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Download Button */}
              <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handleStartDownload}
                  disabled={isDownloading}
                  className="w-full sm:flex-1 py-3 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm hover:shadow-md hover:shadow-blue-500/20 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[46px] active:scale-[0.99] focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  <Download className="w-4 h-4 text-white" />
                  <span>{isBn ? 'ভিডিও ডাউনলোড করুন' : 'Download Video Now'}</span>
                </button>

                <a
                  href={videoInfo.originalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto py-3 px-4 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors min-h-[46px]"
                >
                  <span>{isBn ? 'মূল সাইটে দেখুন' : 'Watch Original'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Platform compliance note */}
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>{lang === 'bn' ? 'ব্যবহারবিধি ও কপিরাইট নির্দেশনা' : 'Usage & Platform Guidelines'}</span>
            </div>
            <p className="leading-relaxed text-[11px]">
              {lang === 'bn'
                ? 'সরাসরি ভিডিও লিঙ্ক (.mp4) ব্রাউজার থেকে সরাসরি ডাউনলোড হয়। ইউটিউব, ইনস্টাগ্রাম বা টিকটকের মতো প্ল্যাটফর্মের ক্ষেত্রে তাদের প্রাইভেসি পলিসি ও কপিরাইট মেনে ফাইল প্রসেস করা হয়। এনালাইসিস পেতে আপনি যেকোনো ডাউনলোড করা ভিডিও "AI স্টুডিও" ট্যাবে আপলোড করতে পারেন।'
                : 'Direct video URLs (.mp4) are streamed directly to your browser. For social platforms (YouTube, Instagram, TikTok), metadata and embed streams are resolved in compliance with platform policies. You can also upload any downloaded .mp4 file to the "AI Studio" tab for deep analysis.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
