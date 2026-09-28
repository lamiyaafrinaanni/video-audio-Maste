import React, { useState } from 'react';
import { 
  Sparkles, 
  Download, 
  Printer, 
  Share2, 
  Copy, 
  Check, 
  Volume2, 
  Loader2, 
  FileText, 
  Mail, 
  Twitter, 
  Facebook, 
  Linkedin,
  CheckCircle2,
  Video,
  BookOpen,
  ShieldAlert,
  KeyRound,
  Languages,
  Globe,
  RotateCcw
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Language, VideoTranscript, AnalysisMode, VideoMetadata } from '../types';
import { TranscriptViewer } from './TranscriptViewer';
import { VideoMetadataCard } from './VideoMetadataCard';

interface AnalysisReportViewProps {
  lang: Language;
  rightPanelTab: 'report' | 'transcript';
  setRightPanelTab: (tab: 'report' | 'transcript') => void;
  analysisResult: string | null;
  analysisMode: AnalysisMode;
  isAnalyzing: boolean;
  analysisStatus: string;
  transcript: VideoTranscript | null;
  isExtractingAudio: boolean;
  audioExtractionStatus: string;
  onExtractAudioAndTranscribe: () => void;
  onSeekVideo: (seconds: number) => void;
  videoCurrentTime: number;
  onExportToPDF: () => void;
  isGeneratingPDF: boolean;
  isApiKeyError?: boolean;
  metadata?: VideoMetadata | null;
  onPlayPreview?: () => void;
}

export const AnalysisReportView: React.FC<AnalysisReportViewProps> = ({
  lang,
  rightPanelTab,
  setRightPanelTab,
  analysisResult,
  analysisMode,
  isAnalyzing,
  analysisStatus,
  transcript,
  isExtractingAudio,
  audioExtractionStatus,
  onExtractAudioAndTranscribe,
  onSeekVideo,
  videoCurrentTime,
  onExportToPDF,
  isGeneratingPDF,
  isApiKeyError = false,
  metadata = null,
  onPlayPreview,
}) => {
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const isBn = lang === 'bn';

  // AI Multilingual Translation State
  const [selectedTargetLang, setSelectedTargetLang] = useState<string>('es');
  const [translatedReport, setTranslatedReport] = useState<string | null>(null);
  const [activeLangName, setActiveLangName] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  const SUPPORTED_LANGUAGES = [
    { code: 'es', label: 'Spanish / Español', flag: '🇪🇸' },
    { code: 'fr', label: 'French / Français', flag: '🇫🇷' },
    { code: 'de', label: 'German / Deutsch', flag: '🇩🇪' },
    { code: 'ar', label: 'Arabic / العربية', flag: '🇸🇦' },
    { code: 'hi', label: 'Hindi / हिन्दी', flag: '🇮🇳' },
    { code: 'zh', label: 'Chinese / 中文', flag: '🇨🇳' },
    { code: 'ja', label: 'Japanese / 日本語', flag: '🇯🇵' },
    { code: 'pt', label: 'Portuguese / Português', flag: '🇧🇷' },
    { code: 'bn', label: 'Bengali / বাংলা', flag: '🇧🇩' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
  ];

  const handleTranslateReport = async (targetCodeOverride?: string) => {
    if (!analysisResult) return;
    const targetCode = targetCodeOverride || selectedTargetLang;
    setIsTranslating(true);
    setTranslationError(null);

    try {
      const res = await fetch('/api/translate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: analysisResult,
          targetLanguage: targetCode,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (data && data.success && data.translatedText) {
        setTranslatedReport(data.translatedText);
        setActiveLangName(data.targetLanguageName || targetCode);
      } else {
        setTranslationError(isBn ? 'অনুবাদ সম্পন্ন করা সম্ভব হয়নি।' : 'Failed to translate report.');
      }
    } catch (err: any) {
      console.error('Translation error:', err);
      setTranslationError(err?.message || (isBn ? 'অনুবাদ করার সময় ত্রুটি ঘটেছে।' : 'Error translating report.'));
    } finally {
      setIsTranslating(false);
    }
  };

  const handleResetTranslation = () => {
    setTranslatedReport(null);
    setActiveLangName(null);
    setTranslationError(null);
  };

  const currentDisplayReport = translatedReport || analysisResult;

  const copyReportText = () => {
    if (!currentDisplayReport) return;
    navigator.clipboard.writeText(currentDisplayReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareViaEmail = () => {
    if (!currentDisplayReport) return;
    const subject = encodeURIComponent((isBn ? "ভিডিও বিশ্লেষণ রিপোর্ট" : "Video Analysis Report"));
    const body = encodeURIComponent(currentDisplayReport);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const shareOnSocial = (platform: 'twitter' | 'facebook' | 'linkedin') => {
    if (!currentDisplayReport) return;
    const text = encodeURIComponent("Video Insight AI Report: " + currentDisplayReport.substring(0, 120) + "...");
    const url = encodeURIComponent(window.location.href);
    
    let shareUrl = '';
    if (platform === 'twitter') shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    if (platform === 'facebook') shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    if (platform === 'linkedin') shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
    
    window.open(shareUrl, '_blank');
  };

  return (
    <section className="w-full h-full" aria-label="Analysis Report and Speech Transcript">
      <div className="app-card p-4 sm:p-6 lg:p-8 flex flex-col min-h-[560px] h-full transition-all">
        {/* Top Header & Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--border-subtle)]">
          {/* Tabs: Report vs Transcript */}
          <div className="flex items-center gap-1.5 bg-[var(--surface-muted)] p-1 rounded-xl" role="tablist">
            <button
              role="tab"
              aria-selected={rightPanelTab === 'report'}
              type="button"
              onClick={() => setRightPanelTab('report')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all min-h-[38px] ${
                rightPanelTab === 'report'
                  ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs font-bold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <div 
                className={`w-2 h-2 rounded-full ${
                  isAnalyzing ? 'bg-[var(--amber-accent)] animate-pulse' : analysisResult ? 'bg-[var(--mcp-accent)]' : 'bg-[var(--border-strong)]'
                }`} 
              />
              <span>{isBn ? "বিশ্লেষণ রিপোর্ট" : "Analysis Report"}</span>
            </button>

            <button
              role="tab"
              aria-selected={rightPanelTab === 'transcript'}
              type="button"
              onClick={() => setRightPanelTab('transcript')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all min-h-[38px] ${
                rightPanelTab === 'transcript'
                  ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xs font-bold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5 text-[var(--brand-primary)]" />
              <span>{isBn ? "অডিও ট্রান্সক্রিপ্ট" : "Transcript"}</span>
              {transcript && (
                <span className="px-1.5 py-0.2 text-[10px] font-mono font-bold bg-[var(--brand-light)] text-[var(--brand-text)] rounded-full border border-[var(--brand-border)]">
                  {transcript.segments.length}
                </span>
              )}
              {isExtractingAudio && (
                <Loader2 className="w-3 h-3 animate-spin text-[var(--amber-accent)]" />
              )}
            </button>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {rightPanelTab === 'report' && analysisResult && (
              <>
                {/* Copy report button */}
                <button
                  type="button"
                  onClick={copyReportText}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-muted)] hover:bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium rounded-lg transition-colors min-h-[36px] cursor-pointer"
                  title={isBn ? "রিপোর্ট টেক্সট কপি করুন" : "Copy Report"}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copied ? (isBn ? "কপি হয়েছে!" : "Copied!") : (isBn ? "কপি" : "Copy")}</span>
                </button>

                {/* PDF Export Button */}
                <button
                  type="button"
                  onClick={onExportToPDF}
                  disabled={isGeneratingPDF}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-muted)] hover:bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-medium rounded-lg transition-colors min-h-[36px] disabled:opacity-50 cursor-pointer"
                  title={isBn ? "PDF ডাউনলোড করুন" : "Download PDF Report"}
                >
                  {isGeneratingPDF ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">PDF</span>
                </button>

                {/* Print button */}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="p-2 hover:bg-[var(--surface-muted)] text-[var(--text-primary)] rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                  title={isBn ? "প্রিন্ট করুন" : "Print Report"}
                >
                  <Printer className="w-4 h-4" />
                </button>

                {/* Share Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowShareMenu(!showShareMenu)}
                    className="p-2 hover:bg-[var(--surface-muted)] text-[var(--text-primary)] rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                    title={isBn ? "শেয়ার করুন" : "Share"}
                  >
                    <Share2 className="w-4 h-4" />
                  </button>

                  {showShareMenu && (
                    <div className="absolute right-0 mt-2 w-44 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl shadow-lg z-20 py-1.5 text-xs">
                      <button
                        onClick={shareViaEmail}
                        className="w-full px-3.5 py-2 text-left hover:bg-[var(--surface-muted)] flex items-center gap-2 text-[var(--text-primary)] cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        <span>Email</span>
                      </button>
                      <button
                        onClick={() => shareOnSocial('twitter')}
                        className="w-full px-3.5 py-2 text-left hover:bg-[var(--surface-muted)] flex items-center gap-2 text-[var(--text-primary)] cursor-pointer"
                      >
                        <Twitter className="w-3.5 h-3.5 text-blue-500" />
                        <span>X / Twitter</span>
                      </button>
                      <button
                        onClick={() => shareOnSocial('facebook')}
                        className="w-full px-3.5 py-2 text-left hover:bg-[var(--surface-muted)] flex items-center gap-2 text-[var(--text-primary)] cursor-pointer"
                      >
                        <Facebook className="w-3.5 h-3.5 text-blue-600" />
                        <span>Facebook</span>
                      </button>
                      <button
                        onClick={() => shareOnSocial('linkedin')}
                        className="w-full px-3.5 py-2 text-left hover:bg-[var(--surface-muted)] flex items-center gap-2 text-[var(--text-primary)] cursor-pointer"
                      >
                        <Linkedin className="w-3.5 h-3.5 text-blue-700" />
                        <span>LinkedIn</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>{isBn ? "সম্পন্ন" : "Done"}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Panel Body Content */}
        <div className="flex-1 overflow-y-auto pr-1">
          {rightPanelTab === 'transcript' ? (
            isExtractingAudio ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-16">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 text-[var(--amber-accent)] flex items-center justify-center relative">
                  <Volume2 className="w-7 h-7 animate-pulse" />
                  <div className="absolute inset-0 rounded-full border-2 border-[var(--amber-accent)] border-t-transparent animate-spin" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    {audioExtractionStatus || (isBn ? "অডিও প্রসেস করা হচ্ছে..." : "Extracting Audio...")}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {isBn 
                      ? "ব্রাউজারে সরাসরি অডিও ট্র্যাক আলাদা করে টাইমস্ট্যাম্প তৈরি হচ্ছে।" 
                      : "Decoding video audio channels and running fast speech recognition."}
                  </p>
                </div>
              </div>
            ) : transcript ? (
              <div className="space-y-4">
                {metadata && (
                  <VideoMetadataCard
                    metadata={metadata}
                    lang={lang}
                    onPlayPreview={onPlayPreview}
                  />
                )}
                <TranscriptViewer
                  transcript={transcript}
                  lang={lang}
                  onSeekVideo={onSeekVideo}
                  videoCurrentTime={videoCurrentTime}
                  onRetranscribe={onExtractAudioAndTranscribe}
                  isTranscribing={isExtractingAudio}
                />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-16">
                <div className="w-16 h-16 rounded-full bg-[var(--brand-light)] text-[var(--brand-text)] flex items-center justify-center">
                  <Volume2 className="w-7 h-7" />
                </div>
                <div className="max-w-sm space-y-1">
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    {isBn ? "সম্পূর্ণ অডিও ট্রান্সক্রিপ্ট" : "Audio Speech Transcript"}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {isBn 
                      ? "বাম পাশের প্যানেল থেকে 'অডিও এক্সট্রাক্ট ও টেক্সট ট্রান্সক্রিপ্ট' বাটনে চাপলে টাইমস্ট্যাম্পসহ সম্পূর্ণ টেক্সট তৈরি হবে।" 
                      : "Extract audio tracks directly from the video to view timestamped spoken dialogue."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onExtractAudioAndTranscribe}
                  className="px-5 py-2.5 bg-[var(--brand-primary)] text-white text-xs font-bold rounded-xl hover:bg-[var(--brand-primary-hover)] transition-colors flex items-center gap-2 min-h-[44px] cursor-pointer shadow-xs"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{isBn ? "অডিও এক্সট্রাক্ট শুরু করুন" : "Extract Audio Now"}</span>
                </button>
              </div>
            )
          ) : isAnalyzing ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-16">
              <div className="w-16 h-16 rounded-full bg-[var(--brand-light)] text-[var(--brand-text)] flex items-center justify-center relative">
                <Sparkles className="w-7 h-7 animate-pulse" />
                <div className="absolute inset-0 rounded-full border-2 border-[var(--brand-primary)] border-t-transparent animate-spin" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  {analysisStatus || (isBn ? "AI ভিডিওটি বিশ্লেষণ করছে..." : "AI is analyzing video content...")}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {isBn 
                    ? "ফ্রেমগুলো স্ক্যান করে গভীর সারসংক্ষেপ, সমস্যা-সমাধান ও শিক্ষণীয় পয়েন্ট প্রস্তুত হচ্ছে।" 
                    : "Deep multimodal processing across sampled keyframes and highlights."}
                </p>
              </div>
            </div>
          ) : !analysisResult ? (
            metadata ? (
              <div className="space-y-4 py-2">
                <VideoMetadataCard
                  metadata={metadata}
                  lang={lang}
                  onPlayPreview={onPlayPreview}
                />
                <div className="p-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/30 text-center flex flex-col items-center justify-center space-y-3">
                  <div className="app-empty-state-icon">
                    <Sparkles className="w-6 h-6 stroke-1 text-[var(--brand-primary)] animate-pulse" />
                  </div>
                  <div className="max-w-md space-y-1">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      {isBn ? "ভিডিও লোড হয়েছে, বিশ্লেষণ শুরুর জন্য প্রস্তুত" : "Video Ready for AI Analysis"}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      {isBn 
                        ? "বাম পাশের প্যানেল থেকে 'AI ভিডিও বিশ্লেষণ শুরু করুন' চাপলে এই ভিডিওর গভীর রিপোর্ট তৈরি হবে।" 
                        : "Click 'Analyze Video with AI' in the left panel to generate the structured multimodal report for this video."}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-16">
                <div className="app-empty-state-icon">
                  <Video className="w-7 h-7 stroke-1 text-[var(--text-muted)]" />
                </div>
                <div className="max-w-xs space-y-1">
                  <h3 className="text-base font-bold text-[var(--text-primary)]">
                    {isBn ? "কোনো বিশ্লেষণ নেই" : "No Analysis Yet"}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    {isBn 
                      ? "বাম পাশের প্যানেল থেকে ভিডিও আপলোড করুন অথবা কোনো URL দিয়ে 'AI ভিডিও বিশ্লেষণ শুরু করুন' চাপুন।" 
                      : "Upload a video file or supply a web URL in the left panel to generate an insightful AI analysis."}
                  </p>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-4">
              {/* Cleaner layout: Video Metadata Card displayed prominently at top */}
              {metadata && (
                <VideoMetadataCard
                  metadata={metadata}
                  lang={lang}
                  onPlayPreview={onPlayPreview}
                />
              )}

              {isApiKeyError && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[var(--text-primary)] text-xs flex items-start gap-2.5">
                  <KeyRound className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-amber-800 dark:text-amber-300">
                      {isBn
                        ? "স্মার্ট প্রিভিউ মোড: বর্তমান Gemini API কীটি সক্রিয় না থাকায় প্রিভিউ রিপোর্ট দেখানো হচ্ছে।"
                        : "Smart Preview Mode: Displaying preview report as live Gemini API key is inactive."}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      {isBn
                        ? "ভিডিওর ফ্রেম ও টাইমলাইন থেকে এই কাঠামোবদ্ধ বিশ্লেষণটি প্রস্তুত করা হয়েছে। সরাসরি Gemini 3.8 Flash মডেল যুক্ত করতে AI Studio-এর Settings > Secrets থেকে সচল GEMINI_API_KEY আপডেট করুন।"
                        : "This structured preview was generated from video frames and metadata. To connect directly to live Gemini 3.8 Flash, update your GEMINI_API_KEY in Settings > Secrets."}
                    </p>
                  </div>
                </div>
              )}
              {/* AI Multilingual Translation Toolbar */}
              <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 shrink-0">
                      <Languages className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <span>{isBn ? "এআই বহুভাষিক অনুবাদ" : "AI Multilingual Report Translator"}</span>
                        {activeLangName && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800">
                            {activeLangName}
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {isBn ? "রিপোর্টটি তাৎক্ষণিকভাবে যেকোনো বৈশ্বিক ভাষায় অনুবাদ করুন" : "Translate this report on the fly into major global languages"}
                      </p>
                    </div>
                  </div>

                  {activeLangName ? (
                    <button
                      type="button"
                      onClick={handleResetTranslation}
                      className="px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-[var(--border-subtle)] rounded-lg flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-2xs"
                      title={isBn ? "মূল রিপোর্ট দেখুন" : "Show original report"}
                    >
                      <RotateCcw className="w-3 h-3 text-slate-500" />
                      <span>{isBn ? "মূল রিপোর্ট দেখুন" : "Show Original"}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <select
                        value={selectedTargetLang}
                        onChange={(e) => setSelectedTargetLang(e.target.value)}
                        className="px-2.5 py-1 bg-[var(--surface-muted)] text-[var(--text-primary)] text-xs font-semibold rounded-lg border border-[var(--border-subtle)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[32px]"
                      >
                        {SUPPORTED_LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.flag} {l.label}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => handleTranslateReport()}
                        disabled={isTranslating}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95 disabled:opacity-50 min-h-[32px]"
                        title={isBn ? "রিপোর্ট অনুবাদ করুন" : "Translate report now"}
                      >
                        {isTranslating ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                            <span>{isBn ? "অনুবাদ হচ্ছে..." : "Translating..."}</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                            <span>{isBn ? "অনুবাদ করুন" : "Translate"}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Language Selection Pills */}
                <div className="flex items-center gap-1 overflow-x-auto pt-1 pb-0.5 no-scrollbar">
                  <span className="text-[10px] font-bold text-[var(--text-muted)] shrink-0 mr-1 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-indigo-500" />
                    {isBn ? "দ্রুত নির্বাচন:" : "Quick:"}
                  </span>
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => {
                        setSelectedTargetLang(l.code);
                        handleTranslateReport(l.code);
                      }}
                      disabled={isTranslating}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md border cursor-pointer transition-all shrink-0 flex items-center gap-1 ${
                        selectedTargetLang === l.code && activeLangName
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-[var(--surface-muted)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border-[var(--border-subtle)]'
                      }`}
                    >
                      <span>{l.flag}</span>
                      <span>{l.code.toUpperCase()}</span>
                    </button>
                  ))}
                </div>

                {translationError && (
                  <p className="text-[11px] font-medium text-red-600 dark:text-red-400 pt-0.5">
                    ⚠️ {translationError}
                  </p>
                )}
              </div>

              <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:text-[var(--text-secondary)] prose-p:text-sm prose-p:leading-relaxed prose-li:text-[var(--text-secondary)] prose-li:text-sm prose-strong:text-[var(--text-primary)] prose-blockquote:border-l-[var(--brand-primary)] prose-blockquote:bg-[var(--surface-muted)]/50 prose-blockquote:p-4 prose-blockquote:rounded-r-xl">
                <div className="markdown-body">
                  <ReactMarkdown>{currentDisplayReport}</ReactMarkdown>
                </div>
              </article>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
