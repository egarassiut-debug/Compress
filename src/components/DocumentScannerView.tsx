import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Zap,
  ZapOff,
  RotateCw,
  Crop,
  Trash2,
  RefreshCw,
  Check,
  ChevronRight,
  ChevronLeft,
  Eye,
  Download,
  AlertTriangle,
  Plus,
  Sparkles,
  Hand,
  X,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import {
  ScannedPage,
  QuadCorners,
  DEFAULT_SCAN_QUAD,
  sampleGrayscaleFrame,
  analyzeFrameStability,
  detectDocumentQuadFromGray,
  processCapturedDocumentPage,
  buildScannerOutputs,
  ScannerExportResult,
  STRICT_500KB_BYTES,
} from '../utils/documentScanner';

interface DocumentScannerViewProps {
  onBackHome: () => void;
  onShowToast: (msg: string) => void;
  onSaveComplete: (
    sizeDetail: string,
    fileUrl: string,
    fileName: string,
    fileType: 'image' | 'document'
  ) => void;
  onTriggerDownload: (blob: Blob, filename: string) => void;
  onGenerateSampleDoc: (title: string, sizeKB?: number) => Promise<File>;
}

type ViewStep = 'camera' | 'review' | 'crop' | 'full_preview';

export const DocumentScannerView: React.FC<DocumentScannerViewProps> = ({
  onBackHome,
  onShowToast,
  onSaveComplete,
  onTriggerDownload,
  onGenerateSampleDoc,
}) => {
  const [step, setStep] = useState<ViewStep>('camera');
  const [captureMode, setCaptureMode] = useState<'auto' | 'manual'>('auto');
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  // الصفحات المصورة (مؤقتة في الجلسة حتى نجاح الحفظ النهائي)
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);

  // حالة الاكتشاف الذكي للحدود والثبات
  const [liveQuad, setLiveQuad] = useState<QuadCorners>(DEFAULT_SCAN_QUAD);
  const [stabilityHint, setStabilityHint] = useState<string | null>(null);
  const [stableStreak, setStableStreak] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);

  // حالة تعديل القص اليدوي
  const [editingCorners, setEditingCorners] = useState<QuadCorners>(DEFAULT_SCAN_QUAD);
  const [draggingCornerIdx, setDraggingCornerIdx] = useState<number | null>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);

  // حالة الحفظ والضغط
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ label: string; percent: number } | null>(null);
  const [oversizedConsent, setOversizedConsent] = useState<ScannerExportResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevGrayRef = useRef<Uint8Array | null>(null);
  const heavyShakeSinceRef = useRef<number | null>(null);
  const lastAutoCaptureAtRef = useRef<number>(0);
  const pagesRef = useRef<ScannedPage[]>(pages);
  const isMountedRef = useRef(true);
  const fileFallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  // تنظيف روابط الذاكرة المؤقتة لصفحة محددة
  const revokePageUrls = (page: ScannedPage) => {
    try {
      URL.revokeObjectURL(page.originalUrl);
    } catch (_) {}
    try {
      URL.revokeObjectURL(page.processedUrl);
    } catch (_) {}
  };

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch (_) {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setFlashOn(false);
  }, []);

  const startCameraStream = useCallback(async () => {
    setCameraError(null);
    stopCameraStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('الكاميرا غير متاحة في هذا المتصفح أو الجهاز. يمكنك استخدام التقاط صورة جاهزة أو النموذج التجريبي.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const caps = (track.getCapabilities ? track.getCapabilities() : {}) as Record<string, unknown>;
          setFlashSupported(Boolean(caps && 'torch' in caps));
          if (caps && 'focusMode' in caps && Array.isArray(caps.focusMode)) {
            if (caps.focusMode.includes('continuous')) {
              await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
            }
          }
        } catch (_) {
          setFlashSupported(false);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setIsCameraActive(true);
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError('تم رفض إذن الكاميرا. يرجى السماح بالوصول للكاميرا من إعدادات المتصفح أو الهاتف.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraError('لم يتم العثور على كاميرا متصلة بهذا الجهاز.');
      } else {
        setCameraError('تعذر تشغيل الكاميرا حالياً. يمكنك إعادة المحاولة أو استيراد صورة مستند.');
      }
    }
  }, [stopCameraStream]);

  // تشغيل الكاميرا فقط في خطوة التصوير وإغلاقها فوراً عند المغادرة
  useEffect(() => {
    isMountedRef.current = true;
    if (step === 'camera') {
      startCameraStream();
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [step, startCameraStream, stopCameraStream]);

  // تحرير جميع الموارد والصور المؤقتة عند الخروج من الخدمة
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopCameraStream();
      pagesRef.current.forEach(revokePageUrls);
    };
  }, [stopCameraStream]);

  // تبديل الفلاش
  const toggleFlash = async () => {
    const nextFlash = !flashOn;
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({
          advanced: [{ torch: nextFlash } as MediaTrackConstraintSet],
        });
        setFlashOn(nextFlash);
        return;
      } catch (_) {
        setFlashSupported(false);
      }
    }
    onShowToast('الفلاش غير مدعوم على كاميرا هذا الجهاز');
  };

  // التقاط إطار ومعالجته تلقائياً (اكتشاف الأطراف + قص + تصحيح المنظور + تحسين الألوان والإضاءة)
  const captureFromBlob = useCallback(
    async (rawBlob: Blob, detectedQuad?: QuadCorners) => {
      if (isCapturing) return;
      setIsCapturing(true);
      try {
        const quadToUse = detectedQuad || liveQuad || DEFAULT_SCAN_QUAD;
        const originalUrl = URL.createObjectURL(rawBlob);
        const processed = await processCapturedDocumentPage(rawBlob, quadToUse, 0);

        if (!isMountedRef.current) {
          URL.revokeObjectURL(originalUrl);
          URL.revokeObjectURL(processed.processedUrl);
          return;
        }

        const newPage: ScannedPage = {
          id: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          originalUrl,
          originalBlob: rawBlob,
          originalWidth: processed.originalWidth,
          originalHeight: processed.originalHeight,
          corners: quadToUse,
          rotationDeg: 0,
          processedUrl: processed.processedUrl,
          processedBlob: processed.processedBlob,
          processedSize: processed.processedBlob.size,
        };

        if (retakeIndex !== null) {
          setPages((prev) => {
            const copy = [...prev];
            if (copy[retakeIndex]) {
              revokePageUrls(copy[retakeIndex]);
              copy[retakeIndex] = newPage;
            }
            return copy;
          });
          setSelectedIndex(retakeIndex);
          setRetakeIndex(null);
          setStep('review');
          onShowToast('✅ تم استبدال الصفحة ومعالجتها وتحسينها تلقائياً');
        } else {
          setPages((prev) => {
            const next = [...prev, newPage];
            setSelectedIndex(next.length - 1);
            return next;
          });
          onShowToast('📸 تم التقاط الورقة وتحسينها وتصحيح منظورها تلقائياً');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'فشل التقاط الصفحة';
        onShowToast(`❌ ${msg} (الصفحات السابقة محفوظة)`);
      } finally {
        if (isMountedRef.current) {
          setIsCapturing(false);
        }
      }
    },
    [isCapturing, liveQuad, retakeIndex, onShowToast]
  );

  // التقاط من الفيديو المباشر مع محاولة ضبط التركيز التلقائي
  const handleCaptureFrame = useCallback(
    async (quadOverride?: QuadCorners) => {
      if (isCapturing) return;
      const video = videoRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        const track = streamRef.current?.getVideoTracks()[0];
        if (track) {
          try {
            await track.applyConstraints({ advanced: [{ focusMode: 'single-shot' } as MediaTrackConstraintSet] });
          } catch (_) {}
        }

        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, c.width, c.height);
        }
        const blob = await new Promise<Blob>((res) =>
          c.toBlob((b) => res(b!), 'image/jpeg', 0.94)
        );
        await captureFromBlob(blob, quadOverride);
      } else {
        // بديل تلقائي عند عدم وجود بث كاميرا فعلي (للاختبار على الحاسوب)
        const sampleFile = await onGenerateSampleDoc(`ورقة مستند ممسوحة #${pagesRef.current.length + 1}`, 1500);
        await captureFromBlob(sampleFile, [
          { x: 0.03, y: 0.03 },
          { x: 0.97, y: 0.03 },
          { x: 0.97, y: 0.97 },
          { x: 0.03, y: 0.97 },
        ]);
      }
    },
    [isCapturing, captureFromBlob, onGenerateSampleDoc]
  );

  // حلقة التحليل المباشر: اكتشاف الحدود + نظام ذكي لاكتشاف الحركة والثبات قبل الالتقاط التلقائي
  useEffect(() => {
    if (step !== 'camera' || !isCameraActive) return;

    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || isCapturing) return;

      const { gray, width, height } = sampleGrayscaleFrame(video, 120, 160);
      const { quad, confidence } = detectDocumentQuadFromGray(gray, width, height);
      setLiveQuad(quad);

      const stability = analyzeFrameStability(prevGrayRef.current, gray);
      prevGrayRef.current = gray;

      const now = Date.now();
      if (stability.status === 'moving') {
        if (heavyShakeSinceRef.current === null) {
          heavyShakeSinceRef.current = now;
        } else if (now - heavyShakeSinceRef.current > 1600) {
          // تنبيه بسيط فقط إذا استمرت الحركة وأصبحت مؤثرة على جودة التصوير
          setStabilityHint('حافظ على ثبات الهاتف قليلاً للحصول على أوضح صورة');
        }
        setStableStreak(0);
      } else {
        heavyShakeSinceRef.current = null;
        setStabilityHint(null);

        if (stability.isStableEnough) {
          setStableStreak((prev) => {
            const nextStreak = prev + 1;
            const cooldownOk = now - lastAutoCaptureAtRef.current > 2400;
            if (captureMode === 'auto' && nextStreak >= 4 && confidence >= 0.55 && cooldownOk) {
              lastAutoCaptureAtRef.current = now;
              setTimeout(() => handleCaptureFrame(quad), 0);
              return 0;
            }
            return nextStreak;
          });
        } else {
          // اهتزاز بسيط: ننتظر الاستقرار بصمت دون إظهار أي تنبيه مزعج
          setStableStreak(0);
        }
      }
    }, 320);

    return () => clearInterval(timer);
  }, [step, isCameraActive, captureMode, isCapturing, handleCaptureFrame]);

  // تدوير الصفحة بمقدار 45 درجة بالضبط عند كل ضغطة
  const handleRotatePage45 = async (index: number) => {
    const page = pages[index];
    if (!page || page.isProcessing) return;

    const nextAngle = (page.rotationDeg + 45) % 360;
    setPages((prev) => prev.map((p, i) => (i === index ? { ...p, isProcessing: true } : p)));

    try {
      const result = await processCapturedDocumentPage(page.originalBlob, page.corners, nextAngle);
      setPages((prev) =>
        prev.map((p, i) => {
          if (i !== index) return p;
          try {
            URL.revokeObjectURL(p.processedUrl);
          } catch (_) {}
          return {
            ...p,
            rotationDeg: nextAngle,
            processedBlob: result.processedBlob,
            processedUrl: result.processedUrl,
            processedSize: result.processedBlob.size,
            isProcessing: false,
          };
        })
      );
    } catch (_) {
      setPages((prev) => prev.map((p, i) => (i === index ? { ...p, isProcessing: false } : p)));
      onShowToast('تعذر تدوير الصفحة، حاول مجدداً');
    }
  };

  // فتح محرر القص اليدوي
  const openManualCrop = (index: number) => {
    const page = pages[index];
    if (!page) return;
    setSelectedIndex(index);
    setEditingCorners([
      { ...page.corners[0] },
      { ...page.corners[1] },
      { ...page.corners[2] },
      { ...page.corners[3] },
    ]);
    setStep('crop');
  };

  // تطبيق تعديل حدود القص اليدوية
  const applyManualCrop = async () => {
    const page = pages[selectedIndex];
    if (!page) return;
    setPages((prev) => prev.map((p, i) => (i === selectedIndex ? { ...p, isProcessing: true } : p)));
    setStep('review');
    try {
      const result = await processCapturedDocumentPage(
        page.originalBlob,
        editingCorners,
        page.rotationDeg
      );
      setPages((prev) =>
        prev.map((p, i) => {
          if (i !== selectedIndex) return p;
          try {
            URL.revokeObjectURL(p.processedUrl);
          } catch (_) {}
          return {
            ...p,
            corners: editingCorners,
            processedBlob: result.processedBlob,
            processedUrl: result.processedUrl,
            processedSize: result.processedBlob.size,
            isProcessing: false,
          };
        })
      );
      onShowToast('✅ تم تحديث قص الورقة وتحسينها بنجاح');
    } catch (_) {
      setPages((prev) => prev.map((p, i) => (i === selectedIndex ? { ...p, isProcessing: false } : p)));
      onShowToast('تعذر تطبيق القص اليدوي');
    }
  };

  // سحب نقاط الزوايا الأربع في محرر القص
  const handleCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingCornerIdx === null || !cropContainerRef.current) return;
    const rect = cropContainerRef.current.getBoundingClientRect();
    const nx = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / rect.height));
    setEditingCorners((prev) => {
      const next = [...prev] as QuadCorners;
      next[draggingCornerIdx] = { x: nx, y: ny };
      return next;
    });
  };

  // حذف صفحة مع حماية بقية الصفحات
  const handleDeletePage = (index: number) => {
    const target = pages[index];
    if (target) revokePageUrls(target);
    const remaining = pages.filter((_, i) => i !== index);
    setPages(remaining);
    if (remaining.length === 0) {
      setSelectedIndex(0);
      setStep('camera');
    } else {
      setSelectedIndex(Math.min(index, remaining.length - 1));
    }
  };

  // تغيير ترتيب الصفحات
  const movePage = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= pages.length) return;
    setPages((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSelectedIndex(target);
  };

  // إتمام حفظ الصور المنفصلة (Scan_001..) + ملف PDF (Scanned_Document.pdf) وحذف المؤقتات بعد التأكد فقط
  const commitVerifiedSave = (output: ScannerExportResult) => {
    try {
      // 1. حفظ الصور المنفصلة بالمعرض (التحقق المسبق أن كل صورة < 500 KB)
      for (const img of output.images) {
        if (img.size >= STRICT_500KB_BYTES) {
          throw new Error(`الصورة ${img.name} تجاوزت 500 KB`);
        }
        onTriggerDownload(img.blob, img.name);
      }

      // 2. حفظ ملف Scanned_Document.pdf في Downloads
      onTriggerDownload(output.pdf.blob, output.pdf.name);

      const pdfKb = (output.pdf.size / 1024).toFixed(1);
      const summaryDetail = `(تم حفظ ${output.images.length} صورة < 500 KB + PDF بحجم ${pdfKb} KB)`;

      // إنشاء نسخة من رابط الـ PDF لعرضه في نافذة النجاح قبل تنظيف المؤقتات
      const persistentPdfUrl = URL.createObjectURL(output.pdf.blob);

      // تنظيف الصور المؤقتة فقط بعد نجاح حفظ كلتا الصيغتين
      pages.forEach(revokePageUrls);
      output.images.forEach((im) => {
        try {
          URL.revokeObjectURL(im.url);
        } catch (_) {}
      });
      try {
        URL.revokeObjectURL(output.pdf.url);
      } catch (_) {}

      setPages([]);
      setSelectedIndex(0);
      setOversizedConsent(null);
      setSaveError(null);

      onSaveComplete(summaryDetail, persistentPdfUrl, output.pdf.name, 'document');
      onBackHome();
    } catch (err: unknown) {
      // عند فشل الحفظ: نحتفظ بالصور المؤقتة لإعادة المحاولة دون مطالبة المستخدم بإعادة التصوير
      const msg = err instanceof Error ? err.message : 'فشل الحفظ، يمكنك إعادة المحاولة';
      setSaveError(msg);
      onShowToast(`❌ ${msg}`);
    }
  };

  // بدء الحفظ المزدوج والتحقق الفعلي من الأحجام
  const handleSaveDualFormats = async () => {
    if (pages.length === 0 || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveProgress({ label: 'جاري تجهيز الصور وملف الـ PDF...', percent: 10 });

    try {
      const output = await buildScannerOutputs(pages, (label, percent) => {
        if (isMountedRef.current) {
          setSaveProgress({ label, percent });
        }
      });

      if (!isMountedRef.current) return;

      // التحقق الصارم لملف الـ PDF (< 500 KB للملف بالكامل)
      if (output.pdf.exceededLimit) {
        setOversizedConsent(output);
        setIsSaving(false);
        setSaveProgress(null);
        return;
      }

      commitVerifiedSave(output);
    } catch (err: unknown) {
      // في حال الفشل، لا نحذف الصور الأصلية المؤقتة ليتمكن المستخدم من المحاولة
      const msg = err instanceof Error ? err.message : 'تعذر حفظ المخرجات';
      setSaveError(msg);
      onShowToast(`❌ ${msg}`);
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
        setSaveProgress(null);
      }
    }
  };

  const currentPage = pages[selectedIndex];

  return (
    <div className="flex flex-col h-full -mx-3 -my-2.5 bg-slate-50 relative">
      <input
        ref={fileFallbackRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            await captureFromBlob(f, DEFAULT_SCAN_QUAD);
          }
          e.target.value = '';
        }}
      />

      {/* ==================== 1. شاشة الكاميرا الذكية ==================== */}
      {step === 'camera' && (
        <div className="flex-1 flex flex-col bg-slate-950 text-white">
          {/* شريط تحكم الكاميرا */}
          <div className="px-3 py-2 bg-[#09183B] border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCaptureMode('auto')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  captureMode === 'auto'
                    ? 'bg-teal-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                تصوير تلقائي
              </button>
              <button
                type="button"
                onClick={() => setCaptureMode('manual')}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  captureMode === 'manual'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                يدوي
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleFlash}
                className={`p-1.5 rounded-lg border text-[10px] flex items-center gap-1 ${
                  flashOn
                    ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-300'
                }`}
                title={flashSupported ? 'تشغيل / إيقاف الفلاش' : 'الفلاش غير مدعوم'}
              >
                {flashOn ? <Zap size={13} /> : <ZapOff size={13} />}
              </button>

              {pages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setRetakeIndex(null);
                    setStep('review');
                  }}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10.5px] font-bold flex items-center gap-1"
                >
                  <Check size={12} />
                  <span>مراجعة ({pages.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* نافذة المعاينة الحية مع اكتشاف الحدود */}
          <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
            {cameraError ? (
              <div className="p-5 text-center space-y-3 max-w-[280px]">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center mx-auto">
                  <Camera size={24} />
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">{cameraError}</p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={startCameraStream}
                    className="py-2 px-3 bg-teal-600 hover:bg-teal-500 rounded-xl text-xs font-bold"
                  >
                    إعادة محاولة تشغيل الكاميرا
                  </button>
                  <button
                    type="button"
                    onClick={() => fileFallbackRef.current?.click()}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-semibold"
                  >
                    استيراد صورة مستند من الجهاز
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCaptureFrame()}
                    className="py-2 px-3 bg-white/10 hover:bg-white/20 rounded-xl text-[11px] font-semibold text-teal-200"
                  >
                    ⚡ تصوير نموذج ورقة قانونية تجريبي
                  </button>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* إطار الحدود التلقائي المكتشف */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <polygon
                    points={liveQuad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                    fill="rgba(20, 184, 166, 0.12)"
                    stroke={captureMode === 'auto' && stableStreak >= 2 ? '#4ADE80' : '#2DD4BF'}
                    strokeWidth="0.9"
                    strokeDasharray="2 1.2"
                  />
                  {liveQuad.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x * 100}
                      cy={p.y * 100}
                      r="1.7"
                      fill="#FDE047"
                    />
                  ))}
                </svg>

                {/* شريط حالة هادئ جداً (بدون إزعاج على الاهتزاز البسيط) */}
                <div className="absolute top-2.5 inset-x-3 flex justify-center pointer-events-none">
                  {stabilityHint ? (
                    <div className="bg-amber-950/90 border border-amber-400/50 text-amber-200 text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
                      <Hand size={12} />
                      <span>{stabilityHint}</span>
                    </div>
                  ) : (
                    <div className="bg-slate-900/75 border border-teal-400/30 text-teal-200 text-[10px] px-3 py-1 rounded-full flex items-center gap-1.5">
                      <Sparkles size={11} className="text-amber-300" />
                      <span>
                        {retakeIndex !== null
                          ? `إعادة تصوير الصفحة ${retakeIndex + 1}`
                          : captureMode === 'auto'
                          ? stableStreak >= 2
                            ? 'جاري تثبيت اللقطة تلقائياً...'
                            : 'وجّه الكاميرا نحو المستند للالتقاط التلقائي'
                          : 'الوضع اليدوي: اضغط زر الالتقاط عند الجاهزية'}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* شريط الالتقاط السفلي */}
          <div className="px-3 py-3 bg-[#09183B] border-t border-slate-800 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => fileFallbackRef.current?.click()}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-[10px] font-semibold text-slate-200"
            >
              من الجهاز
            </button>

            <button
              type="button"
              disabled={isCapturing}
              onClick={() => handleCaptureFrame()}
              className="w-14 h-14 rounded-full bg-white border-4 border-teal-400 flex items-center justify-center shadow-lg active:scale-90 transition-transform disabled:opacity-50"
              title="التقاط الورقة الآن"
            >
              <div className="w-10 h-10 rounded-full bg-[#0F766E] flex items-center justify-center text-white">
                {isCapturing ? <RefreshCw size={18} className="animate-spin" /> : <Camera size={20} />}
              </div>
            </button>

            <div className="text-center min-w-[64px]">
              {pages.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep('review')}
                  className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-500 rounded-xl text-[10.5px] font-bold text-white"
                >
                  تم ({pages.length})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCaptureFrame()}
                  className="px-2 py-1.5 bg-slate-800 rounded-xl text-[9.5px] text-teal-300 font-semibold"
                >
                  نموذج سريع
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. شاشة مراجعة الصفحات والتدوير 45° ==================== */}
      {step === 'review' && currentPage && (
        <div className="flex-1 flex flex-col p-3 gap-2.5 overflow-y-auto">
          {/* رأس المراجعة + عدد الصفحات */}
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-2xs">
            <div>
              <h4 className="text-xs font-bold text-[#0F2557]">
                مراجعة المستند ({pages.length} {pages.length === 1 ? 'صفحة' : 'صفحات'})
              </h4>
              <p className="text-[10px] text-slate-500">
                صفحة {selectedIndex + 1} • {(currentPage.processedSize / 1024).toFixed(1)} KB • زاوية {currentPage.rotationDeg}°
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep('full_preview')}
              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#0F2557] rounded-lg text-[10.5px] font-bold flex items-center gap-1 border border-blue-200"
            >
              <Eye size={12} />
              <span>معاينة كاملة</span>
            </button>
          </div>

          {/* معاينة الصفحة الحالية المحسنة */}
          <div className="relative bg-slate-900 rounded-2xl border border-slate-300 overflow-hidden h-[230px] flex items-center justify-center shrink-0">
            <img
              src={currentPage.processedUrl}
              alt={`صفحة ${selectedIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />
            {currentPage.isProcessing && (
              <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center text-white text-xs gap-2">
                <RefreshCw size={16} className="animate-spin" />
                <span>جاري التحديث...</span>
              </div>
            )}
            <span className="absolute top-2 right-2 bg-emerald-600/90 text-white text-[9.5px] font-bold px-2 py-0.5 rounded-full">
              محسّنة تلقائياً (ألوان كاملة)
            </span>
          </div>

          {/* أزرار أدوات الصفحة: تدوير 45°، تعديل القص، إعادة تصوير، ترتيب، حذف */}
          <div className="grid grid-cols-5 gap-1.5">
            <button
              type="button"
              onClick={() => handleRotatePage45(selectedIndex)}
              className="py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center gap-0.5 text-[9.5px] font-bold text-[#0F2557]"
              title="تدوير 45 درجة"
            >
              <RotateCw size={14} />
              <span>تدوير 45°</span>
            </button>

            <button
              type="button"
              onClick={() => openManualCrop(selectedIndex)}
              className="py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center gap-0.5 text-[9.5px] font-bold text-[#0F2557]"
            >
              <Crop size={14} />
              <span>تعديل القص</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRetakeIndex(selectedIndex);
                setStep('camera');
              }}
              className="py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center gap-0.5 text-[9.5px] font-bold text-teal-700"
            >
              <Camera size={14} />
              <span>إعادة تصوير</span>
            </button>

            <div className="flex gap-1">
              <button
                type="button"
                disabled={selectedIndex === 0}
                onClick={() => movePage(selectedIndex, -1)}
                className="flex-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-200 rounded-xl flex items-center justify-center text-[#0F2557]"
                title="تقديم الصفحة"
              >
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                disabled={selectedIndex === pages.length - 1}
                onClick={() => movePage(selectedIndex, 1)}
                className="flex-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-200 rounded-xl flex items-center justify-center text-[#0F2557]"
                title="تأخير الصفحة"
              >
                <ChevronLeft size={14} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleDeletePage(selectedIndex)}
              className="py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex flex-col items-center gap-0.5 text-[9.5px] font-bold text-rose-600"
            >
              <Trash2 size={14} />
              <span>حذف</span>
            </button>
          </div>

          {/* شريط مصغرات الصفحات + زر إضافة ورقة */}
          <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 bg-white border border-slate-200 rounded-xl">
            {pages.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={`relative w-12 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                  idx === selectedIndex ? 'border-[#0F766E] ring-2 ring-teal-500/30' : 'border-slate-200'
                }`}
              >
                <img src={p.processedUrl} alt={`thumb-${idx + 1}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[8.5px] font-bold text-center">
                  {idx + 1}
                </span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setRetakeIndex(null);
                setStep('camera');
              }}
              className="w-12 h-14 rounded-lg border-2 border-dashed border-teal-500/60 bg-teal-50 hover:bg-teal-100 text-teal-700 flex flex-col items-center justify-center shrink-0 text-[9px] font-bold gap-0.5"
            >
              <Plus size={14} />
              <span>إضافة</span>
            </button>
          </div>

          {saveError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-2 text-[10.5px] text-rose-700 font-semibold">
              {saveError} — الصور الأصلية لا تزال محفوظة لإعادة المحاولة.
            </div>
          )}

          {saveProgress && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-2 space-y-1">
              <div className="flex justify-between text-[10px] font-bold text-teal-900">
                <span>{saveProgress.label}</span>
                <span>{saveProgress.percent}%</span>
              </div>
              <div className="w-full bg-teal-200/60 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#0F766E] h-full transition-all"
                  style={{ width: `${saveProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* زر الحفظ المزدوج النهائي: صور منفصلة Scan_001.. بالمعرض + PDF واحد Scanned_Document بالتنزيلات */}
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveDualFormats}
            className="w-full py-2.5 bg-[#0F766E] hover:bg-[#0D9488] text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2 disabled:opacity-50 mt-auto"
          >
            {isSaving ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>جاري التحقق والحفظ المزدوج...</span>
              </>
            ) : (
              <>
                <Download size={14} />
                <span>حفظ الصور بالمعرض و PDF بالتنزيلات (&lt; 500 KB)</span>
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-3 text-[9.5px] text-slate-500">
            <span className="flex items-center gap-1">
              <ImageIcon size={11} className="text-blue-600" />
              Scan_001.. (&lt; 500 KB لكل صورة)
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <FileText size={11} className="text-orange-600" />
              Scanned_Document.pdf (&lt; 500 KB إجمالاً)
            </span>
          </div>
        </div>
      )}

      {/* ==================== 3. شاشة تعديل حدود القص يدوياً ==================== */}
      {step === 'crop' && currentPage && (
        <div className="flex-1 flex flex-col bg-slate-950 text-white p-3 gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">تعديل زوايا قص الورقة يدوياً</span>
            <button
              type="button"
              onClick={() => setStep('review')}
              className="text-xs text-slate-300 hover:text-white"
            >
              إلغاء
            </button>
          </div>

          <div
            ref={cropContainerRef}
            onPointerMove={handleCropPointerMove}
            onPointerUp={() => setDraggingCornerIdx(null)}
            onPointerLeave={() => setDraggingCornerIdx(null)}
            className="relative flex-1 bg-black rounded-2xl overflow-hidden touch-none select-none"
          >
            <img
              src={currentPage.originalUrl}
              alt="قص يدوي"
              className="w-full h-full object-fill pointer-events-none"
            />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
              <polygon
                points={editingCorners.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                fill="rgba(20, 184, 166, 0.16)"
                stroke="#FDE047"
                strokeWidth="1"
              />
            </svg>
            {editingCorners.map((pt, idx) => (
              <div
                key={idx}
                onPointerDown={() => setDraggingCornerIdx(idx)}
                style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#FDE047] border-2 border-[#0F2557] shadow-lg cursor-grab active:cursor-grabbing"
              />
            ))}
          </div>

          <button
            type="button"
            onClick={applyManualCrop}
            className="w-full py-2.5 bg-[#0F766E] hover:bg-[#0D9488] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <Check size={14} />
            <span>تطبيق القص وتصحيح المنظور</span>
          </button>
        </div>
      )}

      {/* ==================== 4. معاينة المستند الكامل قبل الحفظ ==================== */}
      {step === 'full_preview' && (
        <div className="flex-1 flex flex-col p-3 gap-2.5 overflow-y-auto">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-[#0F2557]">
              معاينة المستند الكامل ({pages.length} صفحات)
            </h4>
            <button
              type="button"
              onClick={() => setStep('review')}
              className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-[10.5px] font-bold"
            >
              عودة للمراجعة
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3">
            {pages.map((p, idx) => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-2 space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-600">
                  <span>صفحة {idx + 1} (Scan_{String(idx + 1).padStart(3, '0')}.jpg)</span>
                  <span>{(p.processedSize / 1024).toFixed(1)} KB</span>
                </div>
                <img
                  src={p.processedUrl}
                  alt={`preview-${idx + 1}`}
                  className="w-full rounded-lg border border-slate-100"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== تنبيه صريح عند تجاوز ملف الـ PDF لحد 500 KB ==================== */}
      {oversizedConsent && (
        <div className="absolute inset-0 bg-[#09183B]/75 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[300px] bg-white rounded-2xl p-4 text-slate-900 shadow-2xl border border-amber-400 space-y-3 text-right">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle size={20} className="shrink-0" />
                <h4 className="font-bold text-xs text-[#0F2557]">
                  ملف PDF تجاوز الحد المطلوب (500 KB)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  try {
                    URL.revokeObjectURL(oversizedConsent.pdf.url);
                  } catch (_) {}
                  oversizedConsent.images.forEach((im) => {
                    try {
                      URL.revokeObjectURL(im.url);
                    } catch (_) {}
                  });
                  setOversizedConsent(null);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              الحجم النهائي لملف <strong dir="ltr">Scanned_Document.pdf</strong> ({pages.length} صفحات) وصل إلى{' '}
              <strong className="text-rose-600">
                {(oversizedConsent.pdf.size / 1024).toFixed(1)} KB
              </strong>{' '}
              وهو يتجاوز حد 500 KB لتفادي إفساد وضوح النصوص والأختام. هل توافق على حفظه بهذا الحجم؟
            </p>

            <div className="flex flex-col gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => commitVerifiedSave(oversizedConsent)}
                className="w-full py-2 bg-[#0F2557] hover:bg-[#16347A] text-white rounded-xl text-xs font-bold"
              >
                نعم، حفظ الملف رغم تجاوز 500 KB
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    URL.revokeObjectURL(oversizedConsent.pdf.url);
                  } catch (_) {}
                  oversizedConsent.images.forEach((im) => {
                    try {
                      URL.revokeObjectURL(im.url);
                    } catch (_) {}
                  });
                  setOversizedConsent(null);
                }}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إلغاء والعودة لمراجعة الصفحات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
