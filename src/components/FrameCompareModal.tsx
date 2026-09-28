import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Sliders, 
  Columns, 
  Layers, 
  Play, 
  Loader2, 
  ArrowRightLeft, 
  CheckCircle2,
  Clock,
  Info
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { HighlightFrame, Language } from '../types';

interface FrameCompareModalProps {
  frameA: HighlightFrame;
  frameB: HighlightFrame;
  lang: Language;
  onClose: () => void;
  onSeekToTimestamp: (secs: number) => void;
  onTriggerApiKeyError?: () => void;
}

export const FrameCompareModal: React.FC<FrameCompareModalProps> = ({
  frameA,
  frameB,
  lang,
  onClose,
  onSeekToTimestamp,
  onTriggerApiKeyError,
}) => {
  const isBn = lang === 'bn';
  const [viewMode, setViewMode] = useState<'side' | 'split' | 'diff'>('side');
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [diffBlendOpacity, setDiffBlendOpacity] = useState<number>(0.5);

  // AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Drag handler for Split Slider
  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let pct = (x / rect.width) * 100;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    setSliderPosition(pct);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      handleMove(e.touches[0].clientX);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      handleMove(e.clientX);
    }
  };

  // Execute AI Visual Difference Detection
  const handleRunAiComparison = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const res = await fetch('/api/compare-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageA: frameA.dataUrl,
          imageB: frameB.dataUrl,
          timestampA: frameA.timestamp,
          timestampB: frameB.timestamp,
          language: lang,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (data && data.isApiKeyError && onTriggerApiKeyError) {
        onTriggerApiKeyError();
      }

      if (data && data.success && data.analysis) {
        setAiAnalysisResult(data.analysis);
      } else {
        setAnalysisError(isBn ? 'পার্থক্য বিশ্লেষণ সম্পন্ন করা যায়নি।' : 'Failed to analyze frame comparison.');
      }
    } catch (err: any) {
      console.error('Frame comparison error:', err);
      setAnalysisError(err?.message || (isBn ? 'ত্রুটি ঘটেছে।' : 'Error comparing frames.'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--surface-card-subtle)]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                <span>{isBn ? "ফ্রেম তুলনা ও ভিজ্যুয়াল ডিটেক্টর" : "Compare Captured Frames"}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                  {formatTime(frameA.timestamp)} vs {formatTime(frameB.timestamp)}
                </span>
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                {isBn 
                  ? "দুটি ফ্রেমের মধ্যবর্তী পরিবর্তন, বিষয়ের সরণ ও সূক্ষ্ম পার্থক্য পর্যবেক্ষণ করুন" 
                  : "Detect motion, visual changes, and scene progress between two timestamps"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)] rounded-xl transition-colors cursor-pointer"
            aria-label="Close Comparison"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal View Controls & Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-[var(--surface-muted)]/50 border-b border-[var(--border-subtle)]">
          {/* Comparison Mode Toggles */}
          <div className="flex items-center gap-1 bg-[var(--surface-card)] p-1 rounded-xl border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setViewMode('side')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'side'
                  ? 'bg-[var(--brand-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{isBn ? "পাশাপাশি (Side-by-Side)" : "Side-by-Side"}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'split'
                  ? 'bg-[var(--brand-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isBn ? "স্প্লিট স্লাইডার (Swipe)" : "Split Slider"}</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('diff')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'diff'
                  ? 'bg-[var(--brand-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isBn ? "ডিফারেন্স ওভারলে (Diff)" : "Blend Diff"}</span>
            </button>
          </div>

          {/* AI Visual Difference Run Button */}
          <button
            type="button"
            onClick={handleRunAiComparison}
            disabled={isAnalyzing}
            className="px-4 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 active:scale-95 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[36px]"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>{isBn ? "পার্থক্য বিশ্লেষণ হচ্ছে..." : "Analyzing differences..."}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                <span>{isBn ? "⚡ এআই দিয়ে পরিবর্তন বিশ্লেষণ" : "⚡ AI Difference Analysis"}</span>
              </>
            )}
          </button>
        </div>

        {/* Modal Main Content Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {/* COMPARISON VIEW CANVAS AREA */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 p-3 sm:p-4 shadow-inner relative min-h-[260px] flex items-center justify-center overflow-hidden">
            
            {/* VIEW MODE 1: SIDE-BY-SIDE */}
            {viewMode === 'side' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {/* Frame A */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300 font-bold px-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      Frame A ({formatTime(frameA.timestamp)})
                    </span>
                    <button
                      type="button"
                      onClick={() => onSeekToTimestamp(frameA.timestamp)}
                      className="px-2 py-0.5 bg-blue-900/60 hover:bg-blue-800 text-blue-300 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>{isBn ? "প্লে করুন" : "Seek"}</span>
                    </button>
                  </div>
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-slate-800 shadow-md group">
                    <img
                      src={frameA.dataUrl}
                      alt={`Frame A at ${formatTime(frameA.timestamp)}`}
                      className="w-full h-full object-contain"
                    />
                    {frameA.note && (
                      <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-xs text-white text-[11px] p-1.5 rounded-lg border border-slate-700/80 truncate">
                        📝 {frameA.note}
                      </div>
                    )}
                  </div>
                </div>

                {/* Frame B */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-300 font-bold px-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                      Frame B ({formatTime(frameB.timestamp)})
                    </span>
                    <button
                      type="button"
                      onClick={() => onSeekToTimestamp(frameB.timestamp)}
                      className="px-2 py-0.5 bg-purple-900/60 hover:bg-purple-800 text-purple-300 rounded text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>{isBn ? "প্লে করুন" : "Seek"}</span>
                    </button>
                  </div>
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-slate-800 shadow-md group">
                    <img
                      src={frameB.dataUrl}
                      alt={`Frame B at ${formatTime(frameB.timestamp)}`}
                      className="w-full h-full object-contain"
                    />
                    {frameB.note && (
                      <div className="absolute bottom-2 left-2 right-2 bg-black/80 backdrop-blur-xs text-white text-[11px] p-1.5 rounded-lg border border-slate-700/80 truncate">
                        📝 {frameB.note}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW MODE 2: SPLIT SLIDER / SWIPE */}
            {viewMode === 'split' && (
              <div className="w-full max-w-2xl space-y-2">
                <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                  <span className="text-blue-400 font-bold">◄ Frame A ({formatTime(frameA.timestamp)})</span>
                  <span className="text-slate-500">{isBn ? "স্লাইডার টেনে ফ্রেম তুলনা করুন" : "Drag handle to compare"}</span>
                  <span className="text-purple-400 font-bold">Frame B ({formatTime(frameB.timestamp)}) ►</span>
                </div>

                <div 
                  ref={containerRef}
                  onMouseDown={() => { isDraggingRef.current = true; }}
                  onMouseUp={() => { isDraggingRef.current = false; }}
                  onMouseLeave={() => { isDraggingRef.current = false; }}
                  onMouseMove={handleMouseMove}
                  onTouchMove={handleTouchMove}
                  className="relative aspect-video rounded-xl overflow-hidden bg-black border border-slate-800 shadow-md select-none cursor-ew-resize"
                >
                  {/* Underneath: Frame B */}
                  <img
                    src={frameB.dataUrl}
                    alt="Frame B"
                    className="absolute inset-0 w-full h-full object-contain"
                  />

                  {/* Top Layer: Frame A clipped to slider position */}
                  <div 
                    className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-white shadow-xl"
                    style={{ width: `${sliderPosition}%` }}
                  >
                    <img
                      src={frameA.dataUrl}
                      alt="Frame A"
                      className="w-full h-full object-contain max-w-none"
                      style={{ width: containerRef.current ? `${containerRef.current.clientWidth}px` : '100%' }}
                    />
                  </div>

                  {/* Handle divider icon */}
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-lg border-2 border-indigo-600 font-bold text-xs pointer-events-none"
                    style={{ left: `${sliderPosition}%` }}
                  >
                    ↔
                  </div>
                </div>
              </div>
            )}

            {/* VIEW MODE 3: DIFFERENCE OVERLAY BLEND */}
            {viewMode === 'diff' && (
              <div className="w-full max-w-2xl space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="font-bold">{isBn ? "ডিফারেন্স ব্লেন্ডিং মোড (Difference Overlay)" : "Difference Blend Overlay"}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">{isBn ? "অপাসিটি:" : "Opacity:"}</span>
                    <input 
                      type="range" 
                      min={0} 
                      max={1} 
                      step={0.05} 
                      value={diffBlendOpacity}
                      onChange={(e) => setDiffBlendOpacity(parseFloat(e.target.value))}
                      className="w-24 accent-indigo-500 h-1.5 cursor-pointer"
                    />
                    <span className="font-mono text-[11px] text-slate-400">{Math.round(diffBlendOpacity * 100)}%</span>
                  </div>
                </div>

                <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-slate-800 shadow-md">
                  {/* Frame A Base Layer */}
                  <img
                    src={frameA.dataUrl}
                    alt="Frame A Base"
                    className="absolute inset-0 w-full h-full object-contain"
                  />

                  {/* Frame B Difference Layer with mix-blend-difference */}
                  <img
                    src={frameB.dataUrl}
                    alt="Frame B Difference"
                    className="absolute inset-0 w-full h-full object-contain mix-blend-difference"
                    style={{ opacity: diffBlendOpacity }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 text-center">
                  💡 {isBn 
                    ? "যেসব অংশ উজ্জ্বল দেখাবে সেখানে সবচেয়ে বেশি ভিজ্যুয়াল পরিবর্তন বা মুভমেন্ট ঘটেছে।" 
                    : "Bright pixels indicate areas with significant movement or visual changes between timestamps."}
                </p>
              </div>
            )}
          </div>

          {/* AI DIFFERENCE ANALYSIS REPORT SECTION */}
          {aiAnalysisResult ? (
            <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-2 animate-in fade-in duration-300">
              <div className="flex items-center justify-between pb-1 border-b border-indigo-500/20">
                <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>{isBn ? "এআই ভিজ্যুয়াল পরিবর্তন বিশ্লেষণ ফলাফল" : "AI Visual Difference Breakdown"}</span>
                </h4>
                <span className="text-[10px] font-mono text-[var(--text-muted)]">Gemini 3.8 Flash</span>
              </div>
              <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:text-xs prose-headings:font-bold prose-p:text-xs prose-li:text-xs prose-p:leading-relaxed">
                <ReactMarkdown>{aiAnalysisResult}</ReactMarkdown>
              </article>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[var(--surface-muted)] border border-[var(--border-subtle)] text-center flex flex-col items-center justify-center space-y-2">
              <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                <Info className="w-5 h-5" />
              </div>
              <div className="max-w-md space-y-1">
                <h4 className="text-xs font-bold text-[var(--text-primary)]">
                  {isBn ? "এআই দিয়ে সূক্ষ্ম পরিবর্তন শনাক্তকরণ" : "AI Powered Visual Progress Detection"}
                </h4>
                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  {isBn 
                    ? "উপরে '⚡ এআই দিয়ে পরিবর্তন বিশ্লেষণ' বাটনে চাপলে Gemini Vision মডেল দিয়ে ফ্রেম A ও B-এর মধ্যে বিষয়বস্তুর মুভমেন্ট, আলোর পরিবর্তন ও নতুন এলিমেন্ট চিহ্নিত করা হবে।" 
                    : "Click '⚡ AI Difference Analysis' above to let Gemini Vision detect object movement, lighting shifts, and scene additions."}
                </p>
              </div>
            </div>
          )}

          {analysisError && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">
              ⚠️ {analysisError}
            </p>
          )}

        </div>
      </div>
    </div>
  );
};
