import React, { useState } from 'react';
import { 
  Clock, 
  User, 
  ExternalLink, 
  Video, 
  FileVideo, 
  CheckCircle2, 
  Copy, 
  Check, 
  Film, 
  Play,
  HardDrive,
  Sparkles,
  Layers,
  Calendar
} from 'lucide-react';
import { Language, VideoMetadata } from '../types';

interface VideoMetadataCardProps {
  metadata: VideoMetadata | null;
  lang: Language;
  onPlayPreview?: () => void;
  className?: string;
}

export const VideoMetadataCard: React.FC<VideoMetadataCardProps> = ({
  metadata,
  lang,
  onPlayPreview,
  className = '',
}) => {
  const isBn = lang === 'bn';
  const [imgSrc, setImgSrc] = useState<string>(metadata?.thumbnailUrl || '');
  const [imgFailed, setImgFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  // Synchronize when metadata prop updates
  React.useEffect(() => {
    if (metadata?.thumbnailUrl) {
      setImgSrc(metadata.thumbnailUrl);
      setImgFailed(false);
    }
  }, [metadata?.thumbnailUrl]);

  if (!metadata) {
    return null;
  }

  const handleImageError = () => {
    if (metadata.fallbackThumbnailUrl && imgSrc !== metadata.fallbackThumbnailUrl) {
      setImgSrc(metadata.fallbackThumbnailUrl);
    } else {
      setImgFailed(true);
    }
  };

  const copyVideoUrl = () => {
    if (!metadata.originalUrl) return;
    navigator.clipboard.writeText(metadata.originalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSeconds = (sec?: number) => {
    if (!sec || isNaN(sec) || sec <= 0) return metadata.durationFormatted || '00:00';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const displayDuration = formatSeconds(metadata.duration);

  // Platform badges styling
  const getPlatformBadge = () => {
    switch (metadata.platform) {
      case 'youtube':
        return { label: 'YouTube', color: 'bg-red-500/10 text-red-600 border-red-500/20' };
      case 'tiktok':
        return { label: 'TikTok', color: 'bg-neutral-900/10 text-neutral-900 dark:text-neutral-200 border-neutral-700/20' };
      case 'facebook':
        return { label: 'Facebook', color: 'bg-blue-600/10 text-blue-600 border-blue-600/20' };
      case 'instagram':
        return { label: 'Instagram', color: 'bg-pink-600/10 text-pink-600 border-pink-600/20' };
      case 'twitter':
        return { label: 'X / Twitter', color: 'bg-neutral-800/10 text-neutral-800 dark:text-neutral-200 border-neutral-600/20' };
      case 'file':
        return { label: isBn ? 'লোকাল ফাইল' : 'Local File', color: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' };
      default:
        return { label: metadata.platformLabel || (isBn ? 'ওয়েব ভিডিও' : 'Web Video'), color: 'bg-indigo-600/10 text-indigo-600 border-indigo-500/20' };
    }
  };

  const platformBadge = getPlatformBadge();

  return (
    <div 
      className={`bg-[var(--surface-muted)]/40 border border-[var(--border-subtle)] rounded-xl p-3 sm:p-4 transition-all ${className}`}
      aria-label="Video Metadata and Source Summary"
    >
      <div className="flex flex-col sm:flex-row gap-3.5 sm:gap-4 items-start">
        {/* Left: High-Quality Thumbnail with Duration Overlay */}
        <div className="relative w-full sm:w-48 md:w-56 shrink-0 aspect-video rounded-lg overflow-hidden bg-black/5 dark:bg-black/40 border border-[var(--border-subtle)] group">
          {!imgFailed && imgSrc ? (
            <img
              src={imgSrc}
              alt={metadata.title || "Video thumbnail"}
              referrerPolicy="no-referrer"
              onError={handleImageError}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900 text-white/70 p-3 text-center">
              <Film className="w-8 h-8 text-white/50 mb-1" />
              <span className="text-[10px] font-mono text-white/60">
                {isBn ? 'ভিডিও থাম্বনেইল' : 'Video Stream'}
              </span>
            </div>
          )}

          {/* Interactive Play Overlay Trigger (if handler available) */}
          {onPlayPreview && (
            <button
              type="button"
              onClick={onPlayPreview}
              className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white"
              title={isBn ? "ভিডিও প্রিভিউ দেখুন" : "Preview Video"}
            >
              <div className="w-9 h-9 rounded-full bg-white/90 text-black flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                <Play className="w-4 h-4 fill-current ml-0.5 text-neutral-900" />
              </div>
            </button>
          )}

          {/* Duration Pill (Bottom-Right Overlay) */}
          {displayDuration && (
            <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-black/85 text-white backdrop-blur-xs flex items-center gap-1 shadow-xs">
              <Clock className="w-2.5 h-2.5 opacity-80" />
              <span>{displayDuration}</span>
            </div>
          )}

          {/* Quality / Resolution Badge (Top-Left Overlay) */}
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-black/75 text-white/90 uppercase tracking-wider backdrop-blur-xs shadow-xs">
            {metadata.qualityBadge || (metadata.platform === 'file' ? 'HD' : '1080P')}
          </div>
        </div>

        {/* Right: Video Metadata & Publisher Info */}
        <div className="flex-1 min-w-0 w-full flex flex-col justify-between self-stretch py-0.5">
          <div className="space-y-1.5">
            {/* Title & Platform Tag */}
            <div className="flex items-start justify-between gap-2">
              <h4 
                className="text-xs sm:text-sm font-bold text-[var(--text-primary)] line-clamp-2 leading-snug"
                title={metadata.title}
              >
                {metadata.title || (isBn ? 'ভিডিও বিবরণী' : 'Untitled Video Source')}
              </h4>
            </div>

            {/* Publisher & Creator Info */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-[var(--text-secondary)] font-medium">
                <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span className="font-semibold text-[var(--text-primary)] truncate max-w-[200px]">
                  {metadata.publisher || (isBn ? 'অজ্ঞাত প্রকাশক' : 'Unknown Publisher')}
                </span>
                <span title={isBn ? "যাচাইকৃত উৎস" : "Verified Source"} className="inline-flex items-center">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                </span>
              </div>

              <span className="text-[var(--text-light)]">•</span>

              {/* Platform Chip */}
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${platformBadge.color}`}>
                {platformBadge.label}
              </span>
            </div>

            {/* Structured Metadata Grid */}
            <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--text-secondary)] font-mono">
              {/* Duration Spec */}
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                <span className="text-[var(--text-muted)]">{isBn ? 'দৈর্ঘ্য:' : 'Duration:'}</span>
                <span className="font-semibold text-[var(--text-primary)]">{displayDuration}</span>
              </div>

              {/* Format / Resolution */}
              {metadata.format && (
                <div className="flex items-center gap-1">
                  <FileVideo className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-[var(--text-muted)]">{isBn ? 'ফরম্যাট:' : 'Format:'}</span>
                  <span className="font-semibold text-[var(--text-primary)] uppercase">{metadata.format}</span>
                </div>
              )}

              {/* File Size (if present) */}
              {metadata.fileSize && (
                <div className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-[var(--text-muted)]">{isBn ? 'আকার:' : 'Size:'}</span>
                  <span className="font-semibold text-[var(--text-primary)]">{metadata.fileSize}</span>
                </div>
              )}

              {/* Published Date (if present) */}
              {metadata.publishedDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-[var(--text-muted)]">{isBn ? 'তারিখ:' : 'Date:'}</span>
                  <span className="text-[var(--text-primary)]">{metadata.publishedDate}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Actions Row */}
          {metadata.originalUrl && (
            <div className="pt-2.5 mt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
              <div className="text-[11px] text-[var(--text-muted)] truncate max-w-xs font-mono">
                {metadata.originalUrl}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={copyVideoUrl}
                  className="px-2 py-1 text-[11px] font-medium bg-[var(--surface-card)] hover:bg-[var(--surface-muted)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                  title={isBn ? "ভিডিও লিঙ্ক কপি করুন" : "Copy URL"}
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? (isBn ? 'কপি হয়েছে' : 'Copied') : (isBn ? 'কপি লিঙ্ক' : 'Copy Link')}</span>
                </button>

                <a
                  href={metadata.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 text-[11px] font-semibold bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white rounded-md transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                  title={isBn ? "মূল ভিডিও খুলুন" : "Open Original Video"}
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>{isBn ? 'মূল ভিডিও' : 'Original'}</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
