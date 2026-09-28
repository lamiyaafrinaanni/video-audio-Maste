import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  Square, 
  ArrowUpRight, 
  Circle, 
  Pencil, 
  RotateCcw, 
  Trash2, 
  Check, 
  X, 
  Sparkles,
  Palette,
  Sliders,
  Undo2
} from 'lucide-react';
import { HighlightFrame, Language } from '../types';

interface FrameAnnotationModalProps {
  frame: HighlightFrame;
  lang: Language;
  onSave: (frameId: string, annotatedDataUrl: string) => void;
  onClose: () => void;
}

type DrawingTool = 'rectangle' | 'arrow' | 'circle' | 'pen';

const COLOR_PALETTE = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Yellow', hex: '#facc15' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'White', hex: '#ffffff' },
];

const STROKE_WIDTHS = [
  { label: 'S', value: 2 },
  { label: 'M', value: 4 },
  { label: 'L', value: 7 },
];

export const FrameAnnotationModal: React.FC<FrameAnnotationModalProps> = ({
  frame,
  lang,
  onSave,
  onClose,
}) => {
  const isBn = lang === 'bn';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tool, setTool] = useState<DrawingTool>('rectangle');
  const [color, setColor] = useState<string>('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);

  // Undo history stack
  const [historyStack, setHistoryStack] = useState<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const currentSnapshotRef = useRef<ImageData | null>(null);

  // Loaded base image
  const baseImageRef = useRef<HTMLImageElement | null>(null);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Initialize canvas with image
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    // Use current dataUrl (which may already have prior annotations, or originalDataUrl)
    img.src = frame.dataUrl;

    img.onload = () => {
      baseImageRef.current = img;
      // Set canvas dimensions to image natural size (capped at readable resolution)
      const targetWidth = Math.min(img.naturalWidth || 640, 854);
      const targetHeight = Math.min(img.naturalHeight || 360, 480);
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const initialSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistoryStack([initialSnapshot]);
      setCanUndo(false);
    };
  }, [frame.dataUrl]);

  // Coordinate helper
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if (e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  // Draw Arrow helper
  const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
    const headlen = Math.max(12, strokeWidth * 3.5);
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Shaft
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // Start drawing
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Prevent default scroll on touch
    if ('touches' in e && e.cancelable) {
      e.preventDefault();
    }

    const pos = getCoordinates(e);
    setIsDrawing(true);
    setStartPos(pos);

    // Save snapshot of canvas prior to current stroke
    currentSnapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (tool === 'pen') {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  };

  // Continue drawing
  const drawMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if ('touches' in e && e.cancelable) {
      e.preventDefault();
    }

    const currentPos = getCoordinates(e);

    if (tool === 'pen') {
      ctx.lineTo(currentPos.x, currentPos.y);
      ctx.stroke();
    } else {
      // Restore pre-stroke snapshot for clean real-time shape preview
      if (currentSnapshotRef.current) {
        ctx.putImageData(currentSnapshotRef.current, 0, 0);
      }

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (tool === 'rectangle') {
        const x = Math.min(startPos.x, currentPos.x);
        const y = Math.min(startPos.y, currentPos.y);
        const w = Math.abs(currentPos.x - startPos.x);
        const h = Math.abs(currentPos.y - startPos.y);
        
        ctx.beginPath();
        ctx.strokeRect(x, y, w, h);
      } else if (tool === 'arrow') {
        drawArrow(ctx, startPos.x, startPos.y, currentPos.x, currentPos.y);
      } else if (tool === 'circle') {
        const radiusX = Math.abs(currentPos.x - startPos.x) / 2;
        const radiusY = Math.abs(currentPos.y - startPos.y) / 2;
        const centerX = Math.min(startPos.x, currentPos.x) + radiusX;
        const centerY = Math.min(startPos.y, currentPos.y) + radiusY;

        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();
      }

      ctx.restore();
    }
  };

  // Finish drawing
  const finishDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setStartPos(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (tool === 'pen') {
      ctx.restore();
    }

    // Push new state onto history stack (limit to last 20 actions)
    const newSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistoryStack(prev => {
      const updated = [...prev, newSnapshot];
      return updated.slice(-20);
    });
    setCanUndo(true);
  };

  // Undo last action
  const handleUndo = useCallback(() => {
    if (historyStack.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Pop the latest snapshot and restore the previous one
    const newHistory = historyStack.slice(0, -1);
    const previousSnapshot = newHistory[newHistory.length - 1];
    ctx.putImageData(previousSnapshot, 0, 0);

    setHistoryStack(newHistory);
    setCanUndo(newHistory.length > 1);
  }, [historyStack]);

  // Reset / Clear annotations back to clean original image
  const handleReset = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // If originalDataUrl exists, load that, otherwise re-draw base image
    const resetImg = new Image();
    resetImg.crossOrigin = 'anonymous';
    resetImg.src = frame.originalDataUrl || frame.dataUrl;
    resetImg.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(resetImg, 0, 0, canvas.width, canvas.height);
      const cleanSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setHistoryStack([cleanSnapshot]);
      setCanUndo(false);
    };
  };

  // Save annotated image
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const annotatedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onSave(frame.id, annotatedDataUrl);
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annotation-modal-title"
    >
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[94vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--surface-muted)]/50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <h2 id="annotation-modal-title" className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                {isBn ? "হাইলাইট ফ্রেমে ভিজ্যুয়াল মার্কিং করুন" : "Annotate Highlight Frame"}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                {isBn 
                  ? `টাইমস্ট্যাম্প: ${formatTime(frame.timestamp)} — গুরুত্বপূর্ণ এলাকা চিহ্নিত করতে রেক্টেঙ্গেল বা তীর আঁকুন`
                  : `Timestamp: ${formatTime(frame.timestamp)} — Draw rectangles, arrows or marks to focus on key areas`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-light)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)] transition-colors cursor-pointer"
            title={isBn ? "বন্ধ করুন" : "Close"}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2.5 bg-[var(--surface-card-subtle)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          {/* 1. Drawing Tools (Rectangle, Arrow, Circle, Pen) */}
          <div className="flex items-center gap-1 bg-[var(--surface-muted)] p-1 rounded-xl border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setTool('rectangle')}
              className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                tool === 'rectangle'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title={isBn ? "রেক্টেঙ্গেল / বাক্স আঁকুন" : "Draw Rectangle"}
            >
              <Square className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isBn ? "বক্স" : "Box"}</span>
            </button>

            <button
              type="button"
              onClick={() => setTool('arrow')}
              className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                tool === 'arrow'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title={isBn ? "তীর চিহ্ন আঁকুন" : "Draw Arrow"}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isBn ? "তীর" : "Arrow"}</span>
            </button>

            <button
              type="button"
              onClick={() => setTool('circle')}
              className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                tool === 'circle'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title={isBn ? "বৃত্ত / সার্কেল আঁকুন" : "Draw Circle"}
            >
              <Circle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isBn ? "বৃত্ত" : "Circle"}</span>
            </button>

            <button
              type="button"
              onClick={() => setTool('pen')}
              className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                tool === 'pen'
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title={isBn ? "ফ্রিহ্যান্ড কলম" : "Freehand Pen"}
            >
              <Pencil className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isBn ? "কলম" : "Pen"}</span>
            </button>
          </div>

          {/* 2. Color Palette */}
          <div className="flex items-center gap-1.5 bg-[var(--surface-muted)] px-2 py-1 rounded-xl border border-[var(--border-subtle)]">
            <Palette className="w-3.5 h-3.5 text-[var(--text-light)] mr-1 hidden xs:inline" />
            {COLOR_PALETTE.map(c => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                className={`w-5 h-5 rounded-full transition-transform cursor-pointer relative border ${
                  color === c.hex ? 'scale-115 ring-2 ring-indigo-500 ring-offset-1 border-white' : 'border-black/20 hover:scale-105'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.name}
                aria-label={c.name}
              />
            ))}
          </div>

          {/* 3. Stroke Thickness & Actions */}
          <div className="flex items-center gap-2">
            {/* Stroke Width Selector */}
            <div className="flex items-center bg-[var(--surface-muted)] p-1 rounded-xl border border-[var(--border-subtle)]">
              {STROKE_WIDTHS.map(sw => (
                <button
                  key={sw.label}
                  type="button"
                  onClick={() => setStrokeWidth(sw.value)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    strokeWidth === sw.value
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  title={`${sw.label} (${sw.value}px)`}
                >
                  {sw.label}
                </button>
              ))}
            </div>

            {/* Undo Button */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-1.5 rounded-lg bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title={isBn ? "পূর্বাবস্থায় ফেরান (Undo)" : "Undo stroke"}
              aria-label="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>

            {/* Reset / Clear Annotations Button */}
            <button
              type="button"
              onClick={handleReset}
              className="p-1.5 rounded-lg bg-[var(--surface-muted)] hover:bg-red-50 dark:hover:bg-red-950/40 text-[var(--text-secondary)] hover:text-red-500 border border-[var(--border-subtle)] transition-colors cursor-pointer"
              title={isBn ? "সব ড্রয়িং মুছুন (Reset)" : "Reset all annotations"}
              aria-label="Reset"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas Workspace */}
        <div className="flex-1 bg-slate-950/90 p-3 sm:p-4 flex flex-col items-center justify-center overflow-auto min-h-[280px]">
          <div className="relative max-w-full max-h-[60vh] flex items-center justify-center rounded-xl overflow-hidden shadow-xl border border-slate-700/80 bg-black">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={drawMove}
              onMouseUp={finishDrawing}
              onMouseLeave={finishDrawing}
              onTouchStart={startDrawing}
              onTouchMove={drawMove}
              onTouchEnd={finishDrawing}
              className="touch-none cursor-crosshair max-w-full max-h-[58vh] object-contain block"
            />
          </div>

          <p className="mt-2 text-[11px] text-slate-400 font-medium text-center">
            {isBn 
              ? "ছবিতে ক্লিক ও ড্র্যাগ করে চিহ্নিত স্থান হাইলাইট করুন। শেষ হলে 'সংরক্ষণ করুন' বাটনে চাপুন।" 
              : "Click and drag to highlight areas of interest. Click 'Save Annotation' when finished."}
          </p>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-[var(--surface-muted)]/50 border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div className="text-xs text-[var(--text-light)] hidden sm:flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {isBn 
                ? "সংরক্ষণ করলে ফ্রেমটি আপডেট হবে এবং AI বিশ্লেষণে ব্যবহৃত হবে" 
                : "Saved annotations update the highlight frame and AI analysis"}
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              {isBn ? "বাতিল" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] active:scale-95 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isBn ? "সংরক্ষণ করুন" : "Save Annotation"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
