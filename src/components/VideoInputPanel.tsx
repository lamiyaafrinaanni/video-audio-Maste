import React, { useRef, useState } from 'react';
import { 
  Upload, 
  Link as LinkIcon, 
  History as HistoryIcon, 
  FileVideo, 
  CheckCircle2, 
  Lightbulb, 
  BookOpen, 
  ShieldAlert, 
  ChevronRight, 
  Camera, 
  Trash2, 
  Volume2, 
  Loader2, 
  AlertCircle, 
  KeyRound, 
  Sparkles,
  Play,
  RotateCcw,
  LayoutList,
  LayoutGrid,
  Download,
  Clock,
  Timer,
  BookmarkPlus,
  Plus,
  AlertTriangle,
  X,
  Pencil,
  ArrowRightLeft
} from 'lucide-react';
import { FrameCompareModal } from './FrameCompareModal';
import { Language, AnalysisMode, HighlightFrame, AnalysisHistory, ChapterMarker } from '../types';
import { FrameAnnotationModal } from './FrameAnnotationModal';

interface VideoInputPanelProps {
  lang: Language;
  activeTab: 'upload' | 'url' | 'history';
  setActiveTab: (tab: 'upload' | 'url' | 'history') => void;
  analysisMode: AnalysisMode;
  setAnalysisMode: (mode: AnalysisMode) => void;
  videoFile: File | null;
  videoUrl: string;
  setVideoUrl: (url: string) => void;
  videoPreview: string | null;
  videoDuration: number;
  videoCurrentTime: number;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearFile: () => void;
  onUrlSubmit: (e: React.FormEvent) => void;
  onScrubChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoPause: () => void;
  onVideoLoadedMetadata: (duration: number) => void;
  onVideoTimeUpdate: (currentTime: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  highlights: HighlightFrame[];
  highlightsToast: string | null;
  onSeekToTimestamp: (time: number) => void;
  onHighlightNoteChange: (id: string, note: string) => void;
  onDeleteHighlight: (id: string) => void;
  onClearHighlights: () => void;
  onUpdateHighlightFrame?: (id: string, newDataUrl: string) => void;
  onManualCaptureFrame?: () => void;
  onSuggestHighlightLabel?: (frameId: string, dataUrl: string, timestamp: number) => void;
  autoCaptureEnabled: boolean;
  setAutoCaptureEnabled: (enabled: boolean) => void;
  autoCaptureInterval: number;
  setAutoCaptureInterval: (interval: number) => void;
  onBatchAutoCapture?: () => void;
  chapters?: ChapterMarker[];
  isDetectingChapters?: boolean;
  onDetectChapters?: () => void;
  onAddChapterToHighlights?: (chapter: ChapterMarker) => void;
  onAddAllChaptersToHighlights?: () => void;
  onOneClickAutoExtractAll?: () => void;
  isOneClickExtracting?: boolean;
  oneClickProgressStatus?: string | null;
  isExtractingAudio: boolean;
  audioExtractionStatus: string;
  hasTranscript: boolean;
  onExtractAudioAndTranscribe: () => void;
  isAnalyzing: boolean;
  analysisStatus: string;
  onAnalyzeVideo: () => void;
  error: string | null;
  isApiKeyError: boolean;
  onErrorDismiss: () => void;
  history: AnalysisHistory[];
  onSelectHistory: (item: AnalysisHistory) => void;
  onClearHistory: () => void;
}

export const VideoInputPanel: React.FC<VideoInputPanelProps> = ({
  lang,
  activeTab,
  setActiveTab,
  analysisMode,
  setAnalysisMode,
  videoFile,
  videoUrl,
  setVideoUrl,
  videoPreview,
  videoDuration,
  videoCurrentTime,
  onFileChange,
  onClearFile,
  onUrlSubmit,
  onScrubChange,
  onVideoPause,
  onVideoLoadedMetadata,
  onVideoTimeUpdate,
  videoRef,
  highlights,
  highlightsToast,
  onSeekToTimestamp,
  onHighlightNoteChange,
  onDeleteHighlight,
  onClearHighlights,
  onUpdateHighlightFrame,
  onManualCaptureFrame,
  onSuggestHighlightLabel,
  autoCaptureEnabled,
  setAutoCaptureEnabled,
  autoCaptureInterval,
  setAutoCaptureInterval,
  onBatchAutoCapture,
  chapters = [],
  isDetectingChapters = false,
  onDetectChapters,
  onAddChapterToHighlights,
  onAddAllChaptersToHighlights,
  onOneClickAutoExtractAll,
  isOneClickExtracting = false,
  oneClickProgressStatus = null,
  isExtractingAudio,
  audioExtractionStatus,
  hasTranscript,
  onExtractAudioAndTranscribe,
  isAnalyzing,
  analysisStatus,
  onAnalyzeVideo,
  error,
  isApiKeyError,
  onErrorDismiss,
  history,
  onSelectHistory,
  onClearHistory,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBn = lang === 'bn';

  const [highlightViewMode, setHighlightViewMode] = useState<'list' | 'grid'>('list');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const [annotatingFrame, setAnnotatingFrame] = useState<HighlightFrame | null>(null);

  // Compare Frames State
  const [isCompareSelectionMode, setIsCompareSelectionMode] = useState(false);
  const [compareFrameA, setCompareFrameA] = useState<HighlightFrame | null>(null);
  const [compareFrameB, setCompareFrameB] = useState<HighlightFrame | null>(null);

  const handleSelectFrameForCompare = (frame: HighlightFrame) => {
    if (!compareFrameA) {
      setCompareFrameA(frame);
    } else if (compareFrameA.id === frame.id) {
      setCompareFrameA(null);
    } else {
      setCompareFrameB(frame);
    }
  };

  const handleOpenQuickCompare = (frame: HighlightFrame) => {
    setCompareFrameA(frame);
    const otherFrame = highlights.find(h => h.id !== frame.id) || frame;
    setCompareFrameB(otherFrame);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleDownloadHighlights = () => {
    if (highlights.length === 0) return;
    try {
      const exportData = {
        title: videoFile ? videoFile.name : (videoUrl || 'Video Highlights'),
        exportedAt: new Date().toISOString(),
        totalHighlights: highlights.length,
        durationSeconds: videoDuration,
        durationFormatted: formatTime(videoDuration),
        highlights: highlights.map((h, i) => ({
          index: i + 1,
          id: h.id,
          timestamp: h.timestamp,
          timestampFormatted: formatTime(h.timestamp),
          note: h.note || '',
          suggestedLabel: h.suggestedLabel || '',
          dataUrl: h.dataUrl,
        })),
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      const safeName = videoFile ? videoFile.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'video_highlights';
      downloadAnchor.setAttribute('download', `${safeName}_highlights.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      const msg = isBn ? 'হাইলাইট JSON সফলভাবে ডাউনলোড হয়েছে!' : 'Highlights JSON exported successfully!';
      setDownloadToast(msg);
      setTimeout(() => setDownloadToast(null), 3200);
    } catch (err) {
      console.error('Failed to export highlights JSON:', err);
    }
  };

  return (
    <aside className="space-y-6 w-full" aria-label="Video Input & Analysis Controls">
      {/* Primary Card */}
      <div className="app-card overflow-hidden">
        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 border-b border-[var(--border-subtle)] bg-[var(--surface-card-subtle)] p-1 gap-1" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'upload'}
            onClick={() => setActiveTab('upload')}
            className={`app-tab-btn ${
              activeTab === 'upload' ? 'app-tab-btn-active' : 'app-tab-btn-inactive'
            }`}
          >
            <Upload className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
            <span>{isBn ? "আপলোড" : "Upload"}</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'url'}
            onClick={() => setActiveTab('url')}
            className={`app-tab-btn ${
              activeTab === 'url' ? 'app-tab-btn-active' : 'app-tab-btn-inactive'
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5 text-[var(--downloader-accent)]" />
            <span>URL</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            className={`app-tab-btn ${
              activeTab === 'history' ? 'app-tab-btn-active' : 'app-tab-btn-inactive'
            }`}
          >
            <HistoryIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>{isBn ? "ইতিহাস" : "History"}</span>
            {history.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-[var(--surface-muted)] text-[var(--text-secondary)] text-[10px] flex items-center justify-center font-bold">
                {history.length}
              </span>
            )}
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {/* Analysis Goal / Mode Selection */}
          {activeTab !== 'history' && (
            <div className="space-y-2.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-[var(--amber-accent)]" />
                <span>{isBn ? "বিশ্লেষণের লক্ষ্য ও ক্যাটাগরি" : "Analysis Goal"}</span>
              </label>

              <div className="grid grid-cols-1 gap-2">
                {/* 1. Goal Category */}
                <button
                  type="button"
                  onClick={() => setAnalysisMode('goal_category')}
                  className={`app-mode-btn ${
                    analysisMode === 'goal_category' ? 'app-mode-btn-active-indigo border-indigo-600 dark:border-indigo-400 bg-indigo-50/20' : ''
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      {isBn ? "বিশ্লেষণের লক্ষ্য ও ক্যাটাগরি" : "Analysis Goal & Category"}
                    </span>
                    {analysisMode === 'goal_category' && (
                      <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] leading-relaxed pl-6">
                    {isBn 
                      ? "মূল লক্ষ্য, ভিডিওর শ্রেণিবিভাগ বা ক্যাটাগরি এবং বিস্তারিত ডোমেন বিশ্লেষণ।" 
                      : "Core analysis objective, video categorization, and specific domain classification."}
                  </span>
                </button>

                {/* 2. Learning Points */}
                <button
                  type="button"
                  onClick={() => setAnalysisMode('learning_points')}
                  className={`app-mode-btn ${
                    analysisMode === 'learning_points' ? 'app-mode-btn-active-indigo' : ''
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <BookOpen className="w-4 h-4 text-[var(--brand-primary)] shrink-0" />
                      {isBn ? "শিক্ষণীয় বিষয় ও বাস্তব প্রয়োগ" : "Learnings & Practical Applications"}
                    </span>
                    {analysisMode === 'learning_points' && (
                      <span className="w-2 h-2 rounded-full bg-[var(--brand-primary)] shrink-0" />
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] leading-relaxed pl-6">
                    {isBn 
                      ? "মূল বার্তা, গুরুত্বপূর্ণ তথ্য এবং বাস্তব জীবনে সুনির্দিষ্ট প্রয়োগ বিধি।" 
                      : "Core takeaways, key lessons, and actionable real-world execution guidelines."}
                  </span>
                </button>

                {/* 3. Problem Solving */}
                <button
                  type="button"
                  onClick={() => setAnalysisMode('problem_solving')}
                  className={`app-mode-btn ${
                    analysisMode === 'problem_solving' ? 'app-mode-btn-active-amber' : ''
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <ShieldAlert className="w-4 h-4 text-[var(--amber-accent)] shrink-0" />
                      {isBn ? "সমস্যা ও সমাধান বিশ্লেষণ" : "Problems & Actionable Solutions"}
                    </span>
                    {analysisMode === 'problem_solving' && (
                      <span className="w-2 h-2 rounded-full bg-[var(--amber-accent)] shrink-0" />
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] leading-relaxed pl-6">
                    {isBn 
                      ? "আলোচিত সমস্যা চিহ্নিতকরণ এবং তাৎক্ষণিক পদক্ষেপসহ কার্যকর সমাধান।" 
                      : "Identifies problems shown in video and maps immediate step-by-step remedies."}
                  </span>
                </button>

                {/* 4. Standard Mode */}
                <button
                  type="button"
                  onClick={() => setAnalysisMode('standard')}
                  className={`app-mode-btn ${
                    analysisMode === 'standard' ? 'app-mode-btn-active-standard' : ''
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-bold flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <CheckCircle2 className="w-4 h-4 text-[var(--mcp-accent)] shrink-0" />
                      {isBn ? "স্ট্যান্ডার্ড সারসংক্ষেপ" : "Standard Summary & Breakdown"}
                    </span>
                    {analysisMode === 'standard' && (
                      <span className="w-2 h-2 rounded-full bg-[var(--text-primary)] shrink-0" />
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] leading-relaxed pl-6">
                    {isBn 
                      ? "ধারাবাহিক পয়েন্ট, সুবিধা-অসুবিধা এবং সামগ্রিক পরামর্শ।" 
                      : "General step-by-step review, pros, cons, and overall overview."}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 1: File Upload */}
          {activeTab === 'upload' && (
            <div className="space-y-3">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`app-dropzone ${videoFile ? 'app-dropzone-active' : ''}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                aria-label="Upload video file"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={onFileChange} 
                  accept="video/*" 
                  className="hidden" 
                />
                
                {!videoFile ? (
                  <div className="space-y-2.5">
                    <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                      <FileVideo className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {isBn ? "ভিডিও নির্বাচন করুন বা ড্রপ করুন" : "Choose video or drag & drop"}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        MP4, WebM, MOV {isBn ? "(সর্বোচ্চ ১ জিবি পর্যন্ত সাপোর্টেড)" : "(Up to 1 GB supported)"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{isBn ? "ভিডিও ফাইল সিলেক্ট হয়েছে" : "File Attached"}</span>
                    </div>
                    <p className="text-xs font-mono font-medium text-slate-700 truncate max-w-xs mx-auto">
                      {videoFile.name}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                    </p>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClearFile();
                      }}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 underline pt-1 min-h-[36px]"
                    >
                      {isBn ? "অন্য ফাইল নির্বাচন করুন" : "Change File"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Video URL Input */}
          {activeTab === 'url' && (
            <form onSubmit={onUrlSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  {isBn ? "ভিডিও ওয়েব লিঙ্ক (Direct MP4 / WebM)" : "Video Web URL"}
                </label>
                <div className="flex gap-2">
                  <input 
                    type="url"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://example.com/video.mp4"
                    className="flex-1 bg-[var(--surface-muted)] border border-[var(--border-strong)] text-[var(--text-primary)] placeholder:text-[var(--text-light)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono focus:bg-[var(--surface-card)] focus:outline-hidden focus:border-[var(--brand-primary)] transition-colors min-h-[44px]"
                    required
                  />
                  <button 
                    type="submit"
                    className="bg-slate-900 text-white px-4 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px] cursor-pointer active:scale-95"
                    title={isBn ? "ভিডিও লোড করুন" : "Load Video"}
                    aria-label="Load Video URL"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Working mode input utilities */}
              <div className="flex items-center justify-between gap-2 pt-1 flex-wrap text-[11px]">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) setVideoUrl(text.trim());
                    } catch {}
                  }}
                  className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>📋 {isBn ? "ক্লিপবোর্ড থেকে পেস্ট করুন" : "Paste from clipboard"}</span>
                </button>
                {videoUrl && (
                  <button
                    type="button"
                    onClick={() => setVideoUrl('')}
                    className="text-slate-400 hover:text-slate-600 text-[11px] cursor-pointer"
                  >
                    {isBn ? "মুছে ফেলুন" : "Clear"}
                  </button>
                )}
              </div>

              <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200/60 text-[11px] text-blue-900 leading-relaxed flex items-start gap-2">
                <span className="text-blue-600 font-bold shrink-0">💡</span>
                <span>
                  {isBn 
                    ? 'ইউটিউব, ইনস্টাগ্রাম বা টিকটকের ভিডিও সরাসরি দেখতে উপরের "ডাউনলোডার" ট্যাব থেকে ফাইলটি ডাউনলোড করে নিন বা লিঙ্ক সমাধান করুন।' 
                    : 'For YouTube, TikTok, or Instagram, use the "Downloader" tab in the header to download the file directly.'}
                </span>
              </div>
            </form>
          )}

          {/* TAB 3: History */}
          {activeTab === 'history' && (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {history.length === 0 ? (
                <div className="text-center py-10 space-y-2 text-slate-400">
                  <HistoryIcon className="w-8 h-8 mx-auto stroke-1" />
                  <p className="text-xs">{isBn ? "এখনো কোনো রিপোর্ট সংরক্ষিত নেই" : "No saved reports yet"}</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200 text-xs">
                    <span className="font-semibold text-slate-600">{isBn ? "পূর্ববর্তী রিপোর্টসমূহ" : "Saved Reports"}</span>
                    <button
                      type="button"
                      onClick={onClearHistory}
                      className="text-red-600 hover:underline flex items-center gap-1 text-[11px]"
                    >
                      <Trash2 className="w-3 h-3" />
                      {isBn ? "সব মুছুন" : "Clear all"}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => onSelectHistory(item)}
                        className="p-3 rounded-xl border border-slate-200/90 hover:border-indigo-500 hover:bg-indigo-50/30 cursor-pointer transition-all space-y-1"
                      >
                        <div className="flex justify-between items-start">
                          <p className="text-xs font-bold text-slate-900 truncate max-w-[180px]">{item.title}</p>
                          <span className="text-[10px] text-slate-400 font-mono">{item.date}</span>
                        </div>
                        <span className="text-[10px] font-semibold text-indigo-700 uppercase bg-indigo-50 px-1.5 py-0.5 rounded">
                          {item.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Video Preview & Timeline Scrubber (Fixed/Sticky Top Stack on Mobile/Desktop Scroll - z-999) */}
          {videoPreview && activeTab !== 'history' && (
            <div className="space-y-4 pt-2">
              {/* STICKY TOP CONTAINER: Video Preview Player & Scrubber */}
              <div className="sticky top-0 z-[999] bg-[var(--surface-card)] pt-2 pb-3.5 -mx-4 sm:-mx-6 px-4 sm:px-6 border-b border-[var(--border-subtle)] shadow-xs space-y-2.5 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {isBn ? "ভিডিও প্রিভিউ ও ফ্রেম স্ক্রাবার" : "Video Preview & Timeline"}
                  </span>
                  <span className="text-xs font-mono font-bold bg-slate-900 text-white dark:bg-slate-800 px-2 py-0.5 rounded-md shadow-2xs">
                    {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
                  </span>
                </div>

                {/* Video Player Box */}
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-[var(--border-subtle)] shadow-xs">
                  <video 
                    ref={videoRef}
                    src={videoPreview} 
                    controls 
                    playsInline
                    className="w-full h-full object-contain"
                    onLoadedMetadata={(e) => onVideoLoadedMetadata(e.currentTarget.duration)}
                    onTimeUpdate={(e) => onVideoTimeUpdate(e.currentTarget.currentTime)}
                    onPause={onVideoPause}
                  />

                  {/* Frame capture toast */}
                  {highlightsToast && (
                    <div className="absolute top-2.5 right-2.5 bg-slate-900/90 backdrop-blur-sm text-white px-2.5 py-1 text-xs font-medium rounded-lg flex items-center gap-1.5 z-20 shadow-md border border-slate-700">
                      <Camera className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{highlightsToast}</span>
                    </div>
                  )}
                </div>

                {/* Timeline Range Scrubber */}
                <div className="space-y-1 bg-[var(--surface-muted)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
                  <div className="flex justify-between items-center text-[11px] text-[var(--text-muted)] font-medium">
                    <span className="flex items-center gap-1.5">
                      <Play className="w-3 h-3 text-[var(--text-primary)]" />
                      {isBn ? "টাইমলাইন স্ক্রাব করুন" : "Scrub timeline"}
                    </span>
                    <div className="flex items-center gap-2">
                      {onManualCaptureFrame && (
                        <button
                          type="button"
                          id="btn-manual-capture-frame"
                          onClick={onManualCaptureFrame}
                          className="px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-100/80 hover:bg-indigo-200/80 dark:bg-indigo-950 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 rounded-md flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                          title={isBn ? "বর্তমান ফ্রেম ক্যাপচার করুন" : "Capture current video frame"}
                        >
                          <Camera className="w-2.5 h-2.5" />
                          <span>{isBn ? "ক্যাপচার" : "Capture"}</span>
                        </button>
                      )}
                      <span className="font-mono text-[var(--text-primary)] font-bold">{formatTime(videoCurrentTime)}</span>
                    </div>
                  </div>
                  <input 
                    type="range"
                    min={0}
                    max={videoDuration || 100}
                    step={0.05}
                    value={videoCurrentTime}
                    onChange={onScrubChange}
                    className="w-full accent-indigo-600 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                    aria-label="Timeline Scrubber"
                  />

                  {/* Visual Chapter Marker Tick Indicators along Scrubber */}
                  {chapters.length > 0 && videoDuration > 0 && (
                    <div className="relative w-full h-2 mt-0.5">
                      {chapters.map((chap) => {
                        const posPct = Math.min(100, Math.max(0, (chap.timestamp / videoDuration) * 100));
                        return (
                          <div
                            key={`tick_${chap.id}`}
                            onClick={() => onSeekToTimestamp(chap.timestamp)}
                            className="absolute top-0 w-2 h-2 -mt-0.5 bg-amber-500 rounded-full border border-white dark:border-slate-900 cursor-pointer hover:scale-125 transition-transform z-10 shadow-2xs"
                            style={{ left: `calc(${posPct}% - 4px)` }}
                            title={`${chap.title} (${chap.timestampFormatted}) - ${isBn ? 'এই চ্যাপ্টারে যান' : 'Seek to chapter'}`}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* SCROLLABLE COMPONENTS CONTAINER BELOW VIDEO PREVIEW (z-0 relative) */}
              <div className="relative z-0 space-y-4 pt-1">
                {/* AI Scene & Chapter Detection Card */}
              <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-3 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 shrink-0">
                      <BookmarkPlus className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <span>{isBn ? "এআই দৃশ্য পরিবর্তন ও চ্যাপ্টার মার্কার" : "AI Scene Changes & Chapter Markers"}</span>
                        {chapters.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[10px] font-mono font-bold">
                            {chapters.length}
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {isBn ? "ভিডিওর স্বাভাবিক দৃশ্য পরিবর্তন ও বিষয়ভিত্তিক চ্যাপ্টার সনাক্তকরণ" : "Detects natural scene cuts and topic transitions automatically"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 ml-auto">
                    {chapters.length > 0 && onAddAllChaptersToHighlights && (
                      <button
                        type="button"
                        id="btn-add-all-chapters"
                        onClick={onAddAllChaptersToHighlights}
                        className="px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/80 rounded-lg flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-2xs"
                        title={isBn ? "সবগুলো চ্যাপ্টারকে টাইমলাইন হাইলাইটে যোগ করুন" : "Add all detected chapter markers as highlight frames"}
                      >
                        <Plus className="w-3 h-3" />
                        <span>{isBn ? "সব যোগ করুন" : "Add All to Highlights"}</span>
                      </button>
                    )}

                    {onDetectChapters && (
                      <button
                        type="button"
                        id="btn-detect-chapters"
                        onClick={onDetectChapters}
                        disabled={isDetectingChapters}
                        className="px-2.5 py-1 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95 disabled:opacity-50"
                        title={isBn ? "এআই দিয়ে দৃশ্য পরিবর্তন ও চ্যাপ্টার মার্কার এক্সট্র্যাক্ট করুন" : "Detect natural scene changes and generate chapter markers"}
                      >
                        {isDetectingChapters ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-white" />
                            <span>{isBn ? "সনাক্ত হচ্ছে..." : "Detecting..."}</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3 text-amber-200" />
                            <span>{isBn ? "চ্যাপ্টার এক্সট্র্যাক্ট" : "Detect Chapters"}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Chapters List */}
                {chapters.length > 0 ? (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 pt-0.5">
                    {chapters.map((chap) => (
                      <div
                        key={chap.id}
                        className="p-2 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-lg flex items-start justify-between gap-2 transition-all group/chap"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          {/* Timestamp Badge */}
                          <button
                            type="button"
                            onClick={() => onSeekToTimestamp(chap.timestamp)}
                            className="px-2 py-1 bg-amber-100 dark:bg-amber-950/80 hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-300 rounded font-mono font-bold text-[10px] flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                            title={isBn ? `${chap.timestampFormatted} সময়ে ভিডিও দেখুন` : `Seek video to ${chap.timestampFormatted}`}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>{chap.timestampFormatted}</span>
                          </button>

                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-[var(--text-primary)] truncate">{chap.title}</p>
                              {chap.transitionType && (
                                <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                                  {chap.transitionType}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[var(--text-secondary)] line-clamp-1">{chap.summary}</p>
                          </div>
                        </div>

                        {onAddChapterToHighlights && (
                          <button
                            type="button"
                            onClick={() => onAddChapterToHighlights(chap)}
                            className="px-2 py-1 bg-[var(--surface-card)] hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-300 border border-[var(--border-subtle)] rounded text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer transition-all active:scale-95 shadow-2xs"
                            title={isBn ? "এই চ্যাপ্টারকে টাইমলাইন হাইলাইটে যোগ করুন" : "Add this chapter marker as a highlight frame"}
                          >
                            <Plus className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span className="hidden sm:inline">{isBn ? "হাইলাইটে যোগ" : "Add"}</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-2.5 text-center text-xs text-[var(--text-muted)] bg-[var(--surface-muted)]/40 rounded-lg border border-dashed border-[var(--border-subtle)] flex items-center justify-between gap-2">
                    <span className="text-[11px]">
                      {isBn 
                        ? "'চ্যাপ্টার এক্সট্র্যাক্ট' বাটন চেপে এআই দিয়ে ভিডিওর দৃশ্য পরিবর্তনের মার্কার তৈরি করুন।" 
                        : "Click 'Detect Chapters' to identify natural scene changes and topic boundaries."}
                    </span>
                    {onDetectChapters && (
                      <button
                        type="button"
                        onClick={onDetectChapters}
                        disabled={isDetectingChapters}
                        className="px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded cursor-pointer shrink-0"
                      >
                        {isBn ? "চালান" : "Detect"}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Auto-Capture Settings & Toggle Bar */}
              <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl p-3 space-y-2.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 shrink-0">
                      <Timer className="w-4 h-4" />
                    </div>
                    <div>
                      <label htmlFor="auto-capture-toggle" className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer">
                        <span>{isBn ? "প্রতি X সেকেন্ড পর পর অটো-ক্যাপচার" : "Capture every X seconds"}</span>
                        {autoCaptureEnabled && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            {isBn ? "সক্রিয়" : "ON"}
                          </span>
                        )}
                      </label>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {isBn ? "প্লেব্যাক চলাকালে নির্দিষ্ট ব্যবধানে স্বয়ংক্রিয় ফ্রেম যুক্ত হবে" : "Auto-captures video frames at defined interval during playback"}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    id="auto-capture-toggle"
                    role="switch"
                    aria-checked={autoCaptureEnabled}
                    onClick={() => setAutoCaptureEnabled(!autoCaptureEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      autoCaptureEnabled ? 'bg-[var(--brand-primary)]' : 'bg-[var(--surface-muted)] border border-[var(--border-strong)]'
                    }`}
                    title={isBn ? "অটো-ক্যাপচার টগল করুন" : "Toggle auto-capture"}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        autoCaptureEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Interval Selection Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                      {isBn ? "ক্যাপচার ব্যবধান:" : "Interval:"}
                    </span>
                    
                    {/* Preset Interval Buttons */}
                    <div className="flex items-center gap-1 bg-[var(--surface-muted)] p-0.5 rounded-lg border border-[var(--border-subtle)]">
                      {[2, 5, 10, 15, 30].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setAutoCaptureInterval(sec)}
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                            autoCaptureInterval === sec
                              ? 'bg-[var(--brand-primary)] text-white shadow-xs'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>

                    {/* Custom Number Input */}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={300}
                        value={autoCaptureInterval}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val > 0) setAutoCaptureInterval(val);
                        }}
                        className="w-12 px-1.5 py-0.5 text-[11px] font-mono font-bold bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-md text-center focus:border-[var(--brand-primary)] focus:outline-hidden"
                        title={isBn ? "কাস্টম সেকেন্ড" : "Custom seconds"}
                      />
                      <span className="text-[10px] font-medium text-[var(--text-muted)]">sec</span>
                    </div>
                  </div>

                  {/* One-Click Batch Sample Button */}
                  {onBatchAutoCapture && (
                    <button
                      type="button"
                      id="btn-batch-auto-capture"
                      onClick={onBatchAutoCapture}
                      className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/80 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95 ml-auto"
                      title={isBn ? `সম্পূর্ণ ভিডিও থেকে প্রতি ${autoCaptureInterval} সেকেন্ডে ফ্রেম এক্সট্র্যাক্ট করুন` : `Instantly sample highlights across entire video every ${autoCaptureInterval} seconds`}
                    >
                      <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                      <span>{isBn ? "পুরো ভিডিওর ফ্রেম ক্যাপচার" : "Sample Video"}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Highlights Section */}
              <div className="bg-slate-50/80 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-700 rounded-xl p-3.5 space-y-3">
                <div className="flex flex-wrap justify-between items-center gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200">
                    <Camera className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>{isBn ? "চিহ্নিত ফ্রেম ও হাইলাইটস" : "Captured Highlights"}</span>
                    <span className="bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-full text-[10px] font-mono">
                      {highlights.length}
                    </span>
                  </div>

                  {highlights.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {/* View Mode Toggle: List vs Grid Gallery */}
                      <div 
                        className="flex items-center bg-slate-200/80 dark:bg-slate-700/80 p-0.5 rounded-lg border border-slate-300/80 dark:border-slate-600"
                        role="group"
                        aria-label={isBn ? "ভিউ পরিবর্তন" : "Highlight view mode"}
                      >
                        <button
                          type="button"
                          id="btn-highlight-view-list"
                          onClick={() => setHighlightViewMode('list')}
                          className={`p-1 rounded-md transition-all cursor-pointer ${
                            highlightViewMode === 'list'
                              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                          title={isBn ? "কমপ্যাক্ট লিস্ট ভিউ" : "Compact List View"}
                          aria-pressed={highlightViewMode === 'list'}
                        >
                          <LayoutList className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          id="btn-highlight-view-grid"
                          onClick={() => setHighlightViewMode('grid')}
                          className={`p-1 rounded-md transition-all cursor-pointer ${
                            highlightViewMode === 'grid'
                              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                          title={isBn ? "গ্রিড গ্যালারি ভিউ" : "Grid Gallery View"}
                          aria-pressed={highlightViewMode === 'grid'}
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Compare Frames Mode Toggle Button */}
                      {highlights.length >= 2 && (
                        <button
                          type="button"
                          id="btn-compare-frames-mode"
                          onClick={() => {
                            setIsCompareSelectionMode(!isCompareSelectionMode);
                            setCompareFrameA(null);
                            setCompareFrameB(null);
                          }}
                          className={`text-[11px] font-semibold px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors shadow-xs active:scale-95 border ${
                            isCompareSelectionMode
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border-indigo-200 dark:border-indigo-800'
                          }`}
                          title={isBn ? "দুটি ফ্রেম বেছে নিয়ে পাশাপাশি তুলনা করুন" : "Select two captured frames to compare side-by-side"}
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          <span className="hidden sm:inline">{isBn ? "তুলনা মোড" : "Compare"}</span>
                        </button>
                      )}

                      {/* Deselect / বাছাই বাতিল Button */}
                      {(isCompareSelectionMode || compareFrameA || compareFrameB) && (
                        <button
                          type="button"
                          id="btn-deselect-frames"
                          onClick={() => {
                            setIsCompareSelectionMode(false);
                            setCompareFrameA(null);
                            setCompareFrameB(null);
                          }}
                          className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors active:scale-95 shadow-xs"
                          title={isBn ? "সব নির্বাচন বা তুলনা বাতিল করুন" : "Deselect and cancel compare mode"}
                        >
                          <X className="w-3 h-3 text-red-500" />
                          <span>{isBn ? "বাছাই বাতিল" : "Deselect"}</span>
                        </button>
                      )}

                      {/* Download Highlights JSON Button */}
                      <button
                        type="button"
                        id="btn-download-highlights"
                        onClick={handleDownloadHighlights}
                        className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors shadow-xs active:scale-95"
                        title={isBn ? "ক্যাপচার করা ফ্রেম ও নোট JSON ফাইল হিসেবে ডাউনলোড করুন" : "Download captured highlights (with base64 frames & notes) as JSON"}
                      >
                        <Download className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                        <span className="hidden sm:inline">{isBn ? "ডাউনলোড" : "Export"}</span>
                      </button>

                      {/* Clear All Highlights Button (opens confirmation modal) */}
                      <button
                        type="button"
                        id="btn-clear-highlights-modal-open"
                        onClick={() => setShowClearConfirm(true)}
                        className="text-[11px] font-semibold text-red-600 hover:text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-2 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors active:scale-95"
                        title={isBn ? "সবগুলো হাইলাইট মুছে ফেলুন" : "Clear all highlights"}
                      >
                        <Trash2 className="w-3 h-3" />
                        <span className="hidden sm:inline">{isBn ? "মুছুন" : "Clear"}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Download Toast Notification */}
                {downloadToast && (
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-lg text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in duration-150">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="flex-1 font-medium">{downloadToast}</span>
                  </div>
                )}

                {/* Custom Confirmation Modal for Clear All Highlights */}
                {showClearConfirm && (
                  <div 
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="clear-highlights-title"
                  >
                    <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 border border-red-200 dark:border-red-800/50">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div className="space-y-1">
                          <h3 id="clear-highlights-title" className="text-sm font-bold text-[var(--text-primary)]">
                            {isBn ? "সবগুলো হাইলাইট মুছে ফেলতে চান?" : "Clear All Captured Highlights?"}
                          </h3>
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            {isBn 
                              ? `আপনার ক্যাপচার করা ${highlights.length}টি ফ্রেম ও নোট স্থায়ীভাবে মুছে যাবে। এটি পূর্বাবস্থায় ফেরানো যাবে না।`
                              : `This will permanently delete all ${highlights.length} captured frames, timestamps, and notes. This action cannot be undone.`}
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                        <button
                          type="button"
                          id="btn-cancel-clear-highlights"
                          onClick={() => setShowClearConfirm(false)}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] cursor-pointer transition-colors"
                        >
                          {isBn ? "বাতিল" : "Cancel"}
                        </button>
                        <button
                          type="button"
                          id="btn-confirm-clear-highlights"
                          onClick={() => {
                            onClearHighlights();
                            setShowClearConfirm(false);
                          }}
                          className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 active:bg-red-800 text-white flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{isBn ? "হ্যাঁ, মুছে ফেলুন" : "Yes, Clear All"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Frame Annotation Modal for drawing rectangles, arrows, circles, and freehand marks */}
                {annotatingFrame && (
                  <FrameAnnotationModal
                    frame={annotatingFrame}
                    lang={lang}
                    onClose={() => setAnnotatingFrame(null)}
                    onSave={(frameId, annotatedDataUrl) => {
                      if (onUpdateHighlightFrame) {
                        onUpdateHighlightFrame(frameId, annotatedDataUrl);
                      }
                      setAnnotatingFrame(null);
                    }}
                  />
                )}

                {highlights.length === 0 ? (
                  <div className="p-3 text-center text-xs text-[var(--text-muted)] bg-[var(--surface-muted)]/50 rounded-lg border border-dashed border-[var(--border-subtle)] space-y-1">
                    <p className="font-semibold text-[var(--text-primary)]">
                      {isBn ? "পজ করে বা 'ক্যাপচার' চেপে হাইলাইট যুক্ত করুন" : "Pause video or click 'Capture' to save highlights"}
                    </p>
                    <p className="text-[11px] text-[var(--text-light)]">
                      {isBn 
                        ? "ভিডিও ফ্রেমের সাথে সাথে Gemini Vision স্বয়ংক্রিয়ভাবে ২-৩ শব্দের লেবেল সাজেস্ট করবে।" 
                        : "Video frames will receive 2-3 word AI labels and be prioritized in deep analysis."}
                    </p>
                  </div>
                ) : highlightViewMode === 'list' ? (
                  /* 1. Compact List View */
                  <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                    {highlights.map((item, idx) => (
                      <div 
                        key={item.id}
                        className="flex gap-2.5 p-2 bg-[var(--surface-card)] rounded-lg border border-[var(--border-subtle)] text-xs items-center hover:border-[var(--brand-primary)]/40 transition-all shadow-2xs"
                      >
                        {/* Highlight Frame Thumbnail with 'View' Button & Below-Thumbnail Timestamp */}
                        <div className="flex flex-col items-center shrink-0 w-20 sm:w-24">
                          <div 
                            className="relative group/thumb w-full aspect-video rounded-md overflow-hidden bg-black shrink-0 border border-[var(--border-subtle)] shadow-xs"
                          >
                            <img 
                              src={item.dataUrl} 
                              alt={`Frame ${idx + 1}`}
                              className="w-full h-full object-cover transition-transform duration-200 group-hover/thumb:scale-105" 
                              referrerPolicy="no-referrer"
                            />

                            {/* 'View' Button on Thumbnail */}
                            <button
                              type="button"
                              id={`btn-view-highlight-${item.id}`}
                              onClick={() => onSeekToTimestamp(item.timestamp)}
                              className="absolute inset-0 bg-black/40 hover:bg-black/60 focus:bg-black/60 text-white flex items-center justify-center transition-all cursor-pointer z-20 group/viewbtn"
                              title={isBn ? `${formatTime(item.timestamp)} সময়ে যান ও ভিডিও দেখুন` : `Seek to ${formatTime(item.timestamp)} and view video`}
                              aria-label={isBn ? `ভিডিও ফ্রেম দেখুন (${formatTime(item.timestamp)})` : `View frame at ${formatTime(item.timestamp)}`}
                            >
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-[10px] font-bold shadow-xs transform group-hover/viewbtn:scale-105 active:scale-95 transition-all">
                                <Play className="w-2.5 h-2.5 fill-current" />
                                <span>{isBn ? "দেখুন" : "View"}</span>
                              </span>
                            </button>
                          </div>

                          {/* Timestamp (MM:SS) clearly displayed below thumbnail */}
                          <div 
                            className="mt-1 w-full flex items-center justify-center gap-1 text-[10px] font-mono font-bold text-[var(--text-secondary)] bg-[var(--surface-muted)] px-1 py-0.5 rounded border border-[var(--border-subtle)]"
                            title={isBn ? `টাইমস্ট্যাম্প: ${formatTime(item.timestamp)}` : `Timestamp: ${formatTime(item.timestamp)}`}
                          >
                            <Clock className="w-2.5 h-2.5 text-[var(--brand-primary)]" />
                            <span>{formatTime(item.timestamp)}</span>
                          </div>
                        </div>

                        {/* Note Input with AI label status */}
                        <div className="flex-1 min-w-0 relative">
                          <input 
                            type="text"
                            value={item.note}
                            onChange={(e) => onHighlightNoteChange(item.id, e.target.value)}
                            placeholder={item.isSuggestingLabel ? (isBn ? "AI লেবেল তৈরি হচ্ছে..." : "AI labeling...") : (isBn ? "নোট বা শিরোনাম..." : "Add note or label...")}
                            className="w-full px-2 py-1.5 text-[11px] bg-[var(--surface-muted)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-md focus:border-[var(--brand-primary)] focus:outline-hidden pr-6"
                          />
                          {item.isSuggestingLabel && (
                            <Loader2 className="w-3 h-3 text-[var(--brand-primary)] animate-spin absolute right-2 top-2" />
                          )}
                        </div>

                        {/* AI Suggest Button */}
                        {onSuggestHighlightLabel && (
                          <button
                            type="button"
                            id={`btn-ai-label-list-${item.id}`}
                            onClick={() => onSuggestHighlightLabel(item.id, item.dataUrl, item.timestamp)}
                            disabled={item.isSuggestingLabel}
                            className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-md transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                            title={isBn ? "AI দিয়ে ২-৩ শব্দের লেবেল তৈরি করুন" : "Suggest 2-3 word AI label with Gemini Vision"}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Compare Button */}
                        <button
                          type="button"
                          id={`btn-compare-list-${item.id}`}
                          onClick={() => {
                            if (isCompareSelectionMode) {
                              handleSelectFrameForCompare(item);
                            } else {
                              handleOpenQuickCompare(item);
                            }
                          }}
                          className={`p-1.5 rounded-md transition-colors cursor-pointer shrink-0 ${
                            compareFrameA?.id === item.id
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                          }`}
                          title={isBn ? "অন্য ফ্রেমের সাথে তুলনা করুন" : "Compare this frame with another"}
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>

                        {/* Annotate / Draw Button */}
                        <button
                          type="button"
                          id={`btn-annotate-list-${item.id}`}
                          onClick={() => setAnnotatingFrame(item)}
                          className="p-1.5 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-md transition-colors cursor-pointer shrink-0"
                          title={isBn ? "ফ্রেমে ড্রয়িং ও ভিজ্যুয়াল মার্কিং করুন (বক্স, তীর)" : "Draw on frame (rectangle, arrow) to highlight areas"}
                          aria-label={isBn ? "ফ্রেমে আঁকুন" : "Draw on frame"}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {/* Quick View Button on Action Row */}
                        <button
                          type="button"
                          id={`btn-seek-highlight-action-${item.id}`}
                          onClick={() => onSeekToTimestamp(item.timestamp)}
                          className="px-2 py-1 bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)] border border-[var(--border-subtle)] rounded-md text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer active:scale-95 shrink-0"
                          title={isBn ? `${formatTime(item.timestamp)} সময়ে ভিডিও চালান` : `Play video at ${formatTime(item.timestamp)}`}
                        >
                          <Play className="w-3 h-3 fill-current text-[var(--brand-primary)]" />
                          <span className="hidden sm:inline font-medium">{isBn ? "দেখুন" : "View"}</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => onDeleteHighlight(item.id)}
                          className="text-[var(--text-light)] hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 min-h-[32px] min-w-[32px] flex items-center justify-center cursor-pointer transition-colors shrink-0"
                          title={isBn ? "মুছে ফেলুন" : "Delete"}
                          aria-label={isBn ? "মুছে ফেলুন" : "Delete highlight"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* 2. Grid Gallery View */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                    {highlights.map((item, idx) => (
                      <div 
                        key={item.id}
                        className="bg-[var(--surface-card)] rounded-xl border border-[var(--border-subtle)] p-2.5 flex flex-col justify-between hover:border-[var(--brand-primary)]/40 hover:shadow-xs transition-all"
                      >
                        <div>
                          {/* Thumbnail Container */}
                          <div className="relative group/thumb w-full aspect-video rounded-lg overflow-hidden bg-black border border-[var(--border-subtle)] shadow-xs">
                            <img 
                              src={item.dataUrl} 
                              alt={`Frame ${idx + 1}`}
                              className="w-full h-full object-cover transition-transform duration-200 group-hover/thumb:scale-105" 
                              referrerPolicy="no-referrer"
                            />
                            {/* 'View' Button on Thumbnail */}
                            <button
                              type="button"
                              id={`btn-view-grid-highlight-${item.id}`}
                              onClick={() => onSeekToTimestamp(item.timestamp)}
                              className="absolute inset-0 bg-black/40 hover:bg-black/60 focus:bg-black/60 text-white flex items-center justify-center transition-all cursor-pointer z-20 group/viewbtn"
                              title={isBn ? `${formatTime(item.timestamp)} সময়ে যান ও ভিডিও দেখুন` : `Seek to ${formatTime(item.timestamp)} and view video`}
                            >
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] text-white text-[11px] font-bold shadow-md transform group-hover/viewbtn:scale-105 active:scale-95 transition-all">
                                <Play className="w-3 h-3 fill-current" />
                                <span>{isBn ? "দেখুন" : "View"}</span>
                              </span>
                            </button>
                          </div>

                          {/* Timestamp (MM:SS) clearly displayed below thumbnail */}
                          <div className="mt-1.5 flex items-center justify-between px-0.5">
                            <div 
                              className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-[var(--text-primary)] bg-[var(--surface-muted)] px-2 py-0.5 rounded-md border border-[var(--border-subtle)]"
                              title={isBn ? `টাইমস্ট্যাম্প: ${formatTime(item.timestamp)}` : `Timestamp: ${formatTime(item.timestamp)}`}
                            >
                              <Clock className="w-3 h-3 text-[var(--brand-primary)]" />
                              <span>{formatTime(item.timestamp)}</span>
                            </div>
                            <span className="text-[10px] font-semibold text-[var(--text-light)]">
                              #{idx + 1}
                            </span>
                          </div>

                          {/* Note Input with AI indicator */}
                          <div className="mt-2 relative">
                            <input 
                              type="text"
                              value={item.note}
                              onChange={(e) => onHighlightNoteChange(item.id, e.target.value)}
                              placeholder={item.isSuggestingLabel ? (isBn ? "AI লেবেল তৈরি হচ্ছে..." : "AI labeling...") : (isBn ? "নোট বা শিরোনাম লিখুন..." : "Add note or label...")}
                              className="w-full px-2.5 py-1.5 text-[11px] bg-[var(--surface-muted)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-md focus:border-[var(--brand-primary)] focus:outline-hidden pr-6"
                            />
                            {item.isSuggestingLabel && (
                              <div className="absolute right-2 top-2">
                                <Loader2 className="w-3 h-3 text-[var(--brand-primary)] animate-spin" />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Grid Footer Controls */}
                        <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
                          {onSuggestHighlightLabel && (
                            <button
                              type="button"
                              id={`btn-ai-label-grid-${item.id}`}
                              onClick={() => onSuggestHighlightLabel(item.id, item.dataUrl, item.timestamp)}
                              disabled={item.isSuggestingLabel}
                              className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors"
                              title={isBn ? "AI দিয়ে নতুন লেবেল সাজেস্ট করুন" : "Suggest 2-3 word AI label with Gemini Vision"}
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>{item.isSuggestingLabel ? (isBn ? "বিশ্লেষণ..." : "Labeling...") : (isBn ? "AI লেবেল" : "AI Label")}</span>
                            </button>
                          )}

                          <div className="flex items-center gap-1 ml-auto">
                            {/* Compare Button */}
                            <button
                              type="button"
                              id={`btn-compare-grid-${item.id}`}
                              onClick={() => {
                                if (isCompareSelectionMode) {
                                  handleSelectFrameForCompare(item);
                                } else {
                                  handleOpenQuickCompare(item);
                                }
                              }}
                              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                                compareFrameA?.id === item.id
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                              }`}
                              title={isBn ? "অন্য ফ্রেমের সাথে তুলনা করুন" : "Compare this frame with another"}
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>

                            {/* Annotate / Draw Button */}
                            <button
                              type="button"
                              id={`btn-annotate-grid-${item.id}`}
                              onClick={() => setAnnotatingFrame(item)}
                              className="p-1.5 rounded-md hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-600 dark:text-amber-400 hover:text-amber-700 transition-colors cursor-pointer"
                              title={isBn ? "ফ্রেমে ড্রয়িং ও মার্কিং করুন (বক্স, তীর)" : "Draw on frame (rectangle, arrow) to highlight areas"}
                              aria-label={isBn ? "ফ্রেমে আঁকুন" : "Draw on frame"}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              id={`btn-seek-grid-${item.id}`}
                              onClick={() => onSeekToTimestamp(item.timestamp)}
                              className="p-1.5 rounded-md hover:bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)] transition-colors cursor-pointer"
                              title={isBn ? `${formatTime(item.timestamp)} সময়ে ভিডিও চালান` : `Play video at ${formatTime(item.timestamp)}`}
                            >
                              <Play className="w-3 h-3 fill-current text-[var(--brand-primary)]" />
                            </button>
                            <button
                              type="button"
                              id={`btn-delete-grid-${item.id}`}
                              onClick={() => onDeleteHighlight(item.id)}
                              className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-[var(--text-light)] hover:text-red-500 transition-colors cursor-pointer"
                              title={isBn ? "মুছে ফেলুন" : "Delete"}
                              aria-label={isBn ? "মুছে ফেলুন" : "Delete highlight"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* HERO ACTION: One-Click Auto Extract All */}
              {onOneClickAutoExtractAll && (
                <button
                  type="button"
                  id="btn-one-click-auto-extract-all"
                  onClick={onOneClickAutoExtractAll}
                  disabled={isOneClickExtracting || isAnalyzing || isExtractingAudio}
                  className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-700 hover:via-teal-700 hover:to-indigo-700 text-white rounded-xl text-xs sm:text-sm font-extrabold shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer min-h-[50px] active:scale-98 border border-emerald-400/30"
                  title={isBn ? "এক ক্লিকে হাইলাইট ফ্রেম, অডিও ট্রান্সক্রিপ্ট ও গভীর এআই ভিডিও বিশ্লেষণ সম্পন্ন করুন" : "One click to extract frame highlights, transcribe audio, and generate deep AI report"}
                >
                  {isOneClickExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white shrink-0" />
                      <span className="truncate">
                        {oneClickProgressStatus || (isBn ? "অটো এক্সট্র্যাক্ট সক্রিয়..." : "One-click auto extracting...")}
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4.5 h-4.5 text-amber-300 animate-bounce shrink-0" />
                      <span>{isBn ? "⚡ এক ক্লিকে অটো সম্পূর্ণ এক্সট্র্যাক্ট" : "⚡ One-Click Auto Extract All"}</span>
                    </>
                  )}
                </button>
              )}

              {/* Action 1: Extract Audio & Speech Transcription */}
              <button
                type="button"
                id="btn-extract-audio"
                onClick={onExtractAudioAndTranscribe}
                disabled={isExtractingAudio || isAnalyzing}
                className="w-full py-3 px-4 bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold text-[var(--text-primary)] transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer min-h-[44px] active:scale-98"
              >
                {isExtractingAudio ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                    <span className="truncate">
                      {audioExtractionStatus || (isBn ? "অডিও এক্সট্রাক্ট হচ্ছে..." : "Extracting audio...")}
                    </span>
                  </>
                ) : hasTranscript ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">
                      {isBn ? "ট্রান্সক্রিপ্ট প্রস্তুত (ডান প্যানেলে দেখুন)" : "Transcript Ready (View in Right Panel)"}
                    </span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4 text-indigo-600" />
                    <span>{isBn ? "অডিও এক্সট্রাক্ট ও টেক্সট ট্রান্সক্রিপ্ট" : "Extract Audio & Transcribe"}</span>
                  </>
                )}
              </button>

              {/* Additional Direct Audio To Text Action Button */}
              <button
                type="button"
                id="btn-audio-to-text-direct-act"
                onClick={onExtractAudioAndTranscribe}
                disabled={isExtractingAudio || isAnalyzing}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 via-indigo-600 to-teal-500 hover:from-indigo-600 hover:via-indigo-700 hover:to-teal-600 text-white rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer min-h-[44px] active:scale-98 border border-indigo-400/20"
                title={isBn ? "ভিডিওর ভয়েস বা অডিও সরাসরি টেক্সটে রূপান্তর করুন" : "Directly transcribe video speech and audio track to text"}
              >
                <Volume2 className="w-4 h-4 text-white animate-pulse" />
                <span>{isBn ? "🎙️ অডিও থেকে টেক্সট (Audio To Text)" : "🎙️ Audio To Text (Speech-to-Text)"}</span>
              </button>

              {/* Action 2: Start AI Deep Video Analysis */}
              <button
                type="button"
                id="btn-start-analysis"
                onClick={onAnalyzeVideo}
                disabled={isAnalyzing}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer min-h-[48px] active:scale-98"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="truncate">{analysisStatus || (isBn ? "বিশ্লেষণ হচ্ছে..." : "Analyzing video...")}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{isBn ? "AI ভিডিও বিশ্লেষণ শুরু করুন" : "Start AI Video Analysis"}</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
              </div>
            </div>
          )}

          {/* Error Alert Box */}
          {error && (
            <div 
              className={`p-3.5 rounded-xl text-xs space-y-2 border transition-all ${
                isApiKeyError
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  {isApiKeyError ? (
                    <KeyRound className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <p className="font-semibold leading-relaxed">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={onErrorDismiss}
                  className="text-slate-400 hover:text-slate-700 p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </div>

              {isApiKeyError && (
                <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200 text-[11px] text-slate-800 space-y-1">
                  <p className="font-bold text-amber-900">
                    {isBn ? "API Key সক্রিয় করার নির্দেশিকা:" : "How to configure API Key:"}
                  </p>
                  <ol className="list-decimal list-inside space-y-0.5 text-slate-700">
                    <li>{isBn ? "AI Studio মেনু থেকে Settings খুলুন" : "Open Settings in AI Studio"}</li>
                    <li>{isBn ? "Secrets ট্যাবে যান" : "Go to Secrets tab"}</li>
                    <li>{isBn ? "GEMINI_API_KEY ফিল্ডে সচল কী সংরক্ষণ করুন" : "Provide an active key in GEMINI_API_KEY"}</li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Frame Comparison Modal */}
      {compareFrameA && compareFrameB && (
        <FrameCompareModal
          frameA={compareFrameA}
          frameB={compareFrameB}
          lang={lang}
          onClose={() => {
            setCompareFrameA(null);
            setCompareFrameB(null);
          }}
          onSeekToTimestamp={onSeekToTimestamp}
        />
      )}
    </aside>
  );
};
