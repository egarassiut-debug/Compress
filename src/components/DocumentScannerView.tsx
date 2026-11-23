import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Zap,
  ZapOff,
  RotateCw,
  RotateCcw,
  Crop,
  Trash2,
  RefreshCw,
  Check,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  AlertTriangle,
  Plus,
  Hand,
  X,
  FileText,
  Image as ImageIcon,
  ScanLine,
  SlidersHorizontal,
  FolderOpen,
  ExternalLink,
  Sun,
  ArrowLeft,
} from 'lucide-react';
import {
  ScannedPage,
  QuadCorners,
  ScannerFilterMode,
  FULL_FRAME_QUAD,
  DEFAULT_SCAN_QUAD,
  sampleGrayscaleFrame,
  analyzeFrameStability,
  detectDocumentQuadFromGray,
  detectQuadOnBlob,
  processCapturedDocumentPage,
  importStudioFilesToPages,
  buildScannerImageOutputs,
  buildScannerPdfOutput,
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

type ScannerStage = 'capture' | 'review' | 'export';

interface SavedExportInfo {
  kind: 'images' | 'pdf';
  title: string;
  detail: string;
  locationLabel: string;
  openUrl: string;
  fileName: string;
}

/**
 * توليد صورة ورقة قانونية مائلة بمنظور حقيقي للاختبار السريع عند غياب كاميرا على الحاسوب
 */
async function createSkewedSampleDocumentBlob(pageNum: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 1280;
  const ctx = c.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 960, 1280);
  bg.addColorStop(0, '#1E293B');
  bg.addColorStop(1, '#0F172A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 960, 1280);

  const tl = { x: 145, y: 120 };
  const tr = { x: 845, y: 185 };
  const br = { x: 785, y: 1155 };
  const bl = { x: 105, y: 1085 };

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.fillStyle = '#FAF8F5';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.clip();

  ctx.shadowBlur = 0;
  ctx.translate(480, 620);
  ctx.rotate(0.055);
  ctx.translate(-480, -620);

  ctx.fillStyle = '#0F2557';
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`عريضة ومذكرة دفاع قانونية — صفحة ${pageNum}`, 480, 260);

  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(210, 295);
  ctx.lineTo(750, 295);
  ctx.stroke();

  ctx.fillStyle = '#1E293B';
  ctx.font = '23px Arial, sans-serif';
  ctx.textAlign = 'right';
  const lines = [
    'أولاً: الوقائع والأسانيد القانونية الثابتة بالأوراق الرسمية،',
    'حيث تبين من مطالعة حافظة المستندات المرفقة والمؤرخة بتاريخ',
    '٢٠٢٥/٠٣/١٨ استيفاء كافة الشروط الشكلية والموضوعية المقررة.',
    'ثانياً: الدفوع القانونية والطلبات الختامية المرفوعة للمحكمة:',
    'إلزام المطعون ضده بتنفيذ الالتزامات التعاقدية كاملة دون تأخير،',
    'مع شمول الحكم بالنفاذ المعجل والاحتفاظ بكافة الأختام الرسمية.',
  ];
  lines.forEach((line, idx) => {
    ctx.fillText(line, 740, 365 + idx * 64);
  });

  ctx.strokeStyle = '#DC2626';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(310, 910, 74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#DC2626';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ختم رسمي معتمد', 310, 915);

  ctx.strokeStyle = '#1D4ED8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(570, 910);
  ctx.bezierCurveTo(615, 865, 650, 955, 705, 895);
  ctx.bezierCurveTo(725, 880, 745, 920, 765, 905);
  ctx.stroke();
  ctx.restore();

  return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.92));
}

export const DocumentScannerView: React.FC<DocumentScannerViewProps> = ({
  onBackHome,
  onShowToast,
  onSaveComplete: _onSaveComplete,
  onTriggerDownload,
  onGenerateSampleDoc,
}) => {
  // المراحل الثلاث فقط: 1. التصوير  ←  2. المراجعة والتحسين  ←  3. الحفظ والتصدير
  const [stage, setStage] = useState<ScannerStage>('capture');

  // حالة الكاميرا والالتقاط (المرحلة 1)
  const [captureMode, setCaptureMode] = useState<'auto' | 'manual'>('auto');
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isImportingStudio, setIsImportingStudio] = useState(false);
  const [importStatusText, setImportStatusText] = useState<string | null>(null);

  // حالة الاكتشاف المباشر على الكاميرا
  const [liveQuad, setLiveQuad] = useState<QuadCorners>(DEFAULT_SCAN_QUAD);
  const [liveDetected, setLiveDetected] = useState(false);
  const [liveSharpness, setLiveSharpness] = useState(0);
  const [stabilityHint, setStabilityHint] = useState<string | null>(null);
  const [stableStreak, setStableStreak] = useState(0);

  // مجموعة الصفحات المشتركة عبر المراحل الثلاث دون أي فقدان
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);

  // أدوات المراجعة والاختيارات الاختيارية (المرحلة 2)
  const [showEditTools, setShowEditTools] = useState(false);
  const [isManualCropOpen, setIsManualCropOpen] = useState(false);
  const [editingCorners, setEditingCorners] = useState<QuadCorners>(FULL_FRAME_QUAD);
  const [draggingCornerIdx, setDraggingCornerIdx] = useState<number | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const cropStageRef = useRef<HTMLDivElement>(null);
  const cropImgRef = useRef<HTMLImageElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // حالة الحفظ والتصدير (المرحلة 3)
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ label: string; percent: number } | null>(null);
  const [oversizedPdfConsent, setOversizedPdfConsent] = useState<ScannerExportResult['pdf'] | null>(null);
  const [savedExport, setSavedExport] = useState<SavedExportInfo | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevGrayRef = useRef<Uint8Array | null>(null);
  const heavyShakeSinceRef = useRef<number | null>(null);
  const lastAutoCaptureAtRef = useRef<number>(0);
  const pagesRef = useRef<ScannedPage[]>(pages);
  const savedExportRef = useRef<SavedExportInfo | null>(savedExport);
  const isMountedRef = useRef(true);
  const studioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    savedExportRef.current = savedExport;
  }, [savedExport]);

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
      setCameraError('الكاميرا غير متاحة في هذا المتصفح. يمكنك الاستيراد من الاستوديو أو تجربة نموذج مستند.');
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
              await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
              });
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
        setCameraError('تم رفض إذن الكاميرا. اسمح بالوصول أو استخدم «من الاستوديو» لاستيراد الصور وPDF.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraError('لا توجد كاميرا متصلة. يمكنك الاستيراد من الاستوديو أو تجربة ورقة مائلة.');
      } else {
        setCameraError('تعذر تشغيل الكاميرا حالياً. يمكنك المحاولة مجدداً أو الاستيراد من الاستوديو.');
      }
    }
  }, [stopCameraStream]);

  useEffect(() => {
    isMountedRef.current = true;
    if (stage === 'capture') {
      startCameraStream();
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
    };
  }, [stage, startCameraStream, stopCameraStream]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopCameraStream();
      pagesRef.current.forEach(revokePageUrls);
      if (savedExportRef.current?.openUrl) {
        try {
          URL.revokeObjectURL(savedExportRef.current.openUrl);
        } catch (_) {}
      }
    };
  }, [stopCameraStream]);

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

  // ==================== التقاط صفحة من الكاميرا (متعدد متواصل دون سؤال مسبق) ====================
  const captureFromBlob = useCallback(
    async (rawBlob: Blob, forcedQuad?: QuadCorners) => {
      if (isCapturing) return;
      setIsCapturing(true);
      try {
        let detected = Boolean(forcedQuad);
        let quadToUse: QuadCorners = forcedQuad || FULL_FRAME_QUAD;

        if (!forcedQuad) {
          const det = await detectQuadOnBlob(rawBlob);
          detected = det.detected;
          quadToUse = det.detected ? det.quad : FULL_FRAME_QUAD;
        }

        const originalUrl = URL.createObjectURL(rawBlob);
        const processed = await processCapturedDocumentPage(rawBlob, quadToUse, 0, 'color', 0);

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
          autoDetected: detected,
          rotationDeg: 0,
          filterMode: 'color',
          brightnessAdjust: 0,
          sourceType: 'camera',
          processedUrl: processed.processedUrl,
          processedBlob: processed.processedBlob,
          processedSize: processed.processedBlob.size,
          curvatureDetected: processed.curvatureDetected,
        };

        if (retakeIndex !== null) {
          const idxToReplace = retakeIndex;
          setPages((prev) => {
            const copy = [...prev];
            if (copy[idxToReplace]) {
              revokePageUrls(copy[idxToReplace]);
              copy[idxToReplace] = newPage;
            }
            return copy;
          });
          setSelectedIndex(idxToReplace);
          setRetakeIndex(null);
          setStage('review');
          onShowToast('تم استبدال الصفحة وتحسينها تلقائياً');
        } else {
          const nextNum = pagesRef.current.length + 1;
          setPages((prev) => {
            const next = [...prev, newPage];
            setSelectedIndex(next.length - 1);
            return next;
          });
          onShowToast(`تم التقاط الصفحة ${nextNum} (${(newPage.processedSize / 1024).toFixed(0)} KB)`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'فشل التقاط الصفحة';
        onShowToast(msg);
      } finally {
        if (isMountedRef.current) {
          setIsCapturing(false);
        }
      }
    },
    [isCapturing, retakeIndex, onShowToast]
  );

  const handleCaptureFrame = useCallback(
    async (quadOverride?: QuadCorners) => {
      if (isCapturing) return;
      const video = videoRef.current;
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        const track = streamRef.current?.getVideoTracks()[0];
        if (track) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: 'single-shot' } as MediaTrackConstraintSet],
            });
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
        const skewedBlob = await createSkewedSampleDocumentBlob(pagesRef.current.length + 1);
        await captureFromBlob(skewedBlob);
      }
    },
    [isCapturing, captureFromBlob]
  );

  const handleCaptureFlatSampleFallback = useCallback(async () => {
    if (isCapturing) return;
    const sampleFile = await onGenerateSampleDoc(`مستند قانوني #${pagesRef.current.length + 1}`, 950);
    await captureFromBlob(sampleFile);
  }, [isCapturing, onGenerateSampleDoc, captureFromBlob]);

  // ==================== استيراد صور متعددة وملفات PDF من «من الاستوديو» ====================
  const handleStudioFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || isImportingStudio) return;
    setIsImportingStudio(true);
    setImportStatusText('جاري استيراد وتحسين المستندات...');

    try {
      const result = await importStudioFilesToPages(fileList, (status) => {
        if (isMountedRef.current) setImportStatusText(status);
      });

      if (!isMountedRef.current) {
        result.pages.forEach(revokePageUrls);
        return;
      }

      if (result.pages.length > 0) {
        setPages((prev) => {
          const next = [...prev, ...result.pages];
          setSelectedIndex(next.length - 1);
          return next;
        });
        onShowToast(`تمت إضافة ${result.pages.length} صفحة إلى المستند`);
      }

      if (result.skippedErrors.length > 0) {
        onShowToast(`تعذر استيراد بعض الملفات: ${result.skippedErrors[0]}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل استيراد الملفات';
      onShowToast(msg);
    } finally {
      if (isMountedRef.current) {
        setIsImportingStudio(false);
        setImportStatusText(null);
      }
    }
  };

  // ==================== حلقة كشف الورقة والثبات على الكاميرا الحية ====================
  useEffect(() => {
    if (stage !== 'capture' || !isCameraActive) return;

    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || isCapturing || isImportingStudio) return;

      const { gray, rgba, width, height } = sampleGrayscaleFrame(video, 160, 213);
      const det = detectDocumentQuadFromGray(gray, width, height, rgba);
      setLiveQuad((prev) => {
        if (!det.detected) return det.quad;
        let maxShift = 0;
        for (let i = 0; i < 4; i++) {
          const d = Math.hypot(prev[i].x - det.quad[i].x, prev[i].y - det.quad[i].y);
          if (d > maxShift) maxShift = d;
        }
        // تخميد القفزات المفاجئة الناتجة عن الظلال العابرة مع إبقاء التتبع السلس
        const alpha = maxShift > 0.22 && det.confidence < 0.72 ? 0.25 : 0.45;
        return [0, 1, 2, 3].map((i) => ({
          x: prev[i].x * (1 - alpha) + det.quad[i].x * alpha,
          y: prev[i].y * (1 - alpha) + det.quad[i].y * alpha,
        })) as QuadCorners;
      });
      setLiveDetected(det.detected);
      setLiveSharpness(det.sharpness);

      const stability = analyzeFrameStability(prevGrayRef.current, gray);
      prevGrayRef.current = gray;

      const now = Date.now();
      const isSharp = det.sharpness >= 7.0;

      if (!det.detected) {
        heavyShakeSinceRef.current = null;
        setStabilityHint(null);
        setStableStreak(0);
        return;
      }

      if (stability.status === 'moving') {
        if (heavyShakeSinceRef.current === null) {
          heavyShakeSinceRef.current = now;
        } else if (now - heavyShakeSinceRef.current > 1400) {
          setStabilityHint('ثبّت الهاتف قليلاً');
        }
        setStableStreak(0);
      } else {
        heavyShakeSinceRef.current = null;
        setStabilityHint(null);

        if (stability.isStableEnough && isSharp) {
          setStableStreak((prev) => {
            const nextStreak = prev + 1;
            const cooldownOk = now - lastAutoCaptureAtRef.current > 2400;
            if (captureMode === 'auto' && nextStreak >= 3 && det.confidence >= 0.52 && cooldownOk) {
              lastAutoCaptureAtRef.current = now;
              setTimeout(() => handleCaptureFrame(det.quad), 0);
              return 0;
            }
            return nextStreak;
          });
        } else {
          setStableStreak(0);
        }
      }
    }, 260);

    return () => clearInterval(timer);
  }, [stage, isCameraActive, captureMode, isCapturing, isImportingStudio, handleCaptureFrame]);

  // ==================== أدوات المرحلة الثانية: التدوير 90°، الفلاتر، الإضاءة، القص اليدوي ====================
  const reprocessPageAt = async (
    index: number,
    patch: {
      corners?: QuadCorners;
      rotationDeg?: number;
      filterMode?: ScannerFilterMode;
      brightnessAdjust?: number;
      autoDetected?: boolean;
    }
  ) => {
    const page = pages[index];
    if (!page || page.isProcessing) return;

    const nextCorners = patch.corners ?? page.corners;
    const nextRot = patch.rotationDeg ?? page.rotationDeg;
    const nextMode = patch.filterMode ?? page.filterMode;
    const nextBright = patch.brightnessAdjust ?? page.brightnessAdjust;

    setPages((prev) => prev.map((p, i) => (i === index ? { ...p, isProcessing: true } : p)));

    try {
      const result = await processCapturedDocumentPage(
        page.originalBlob,
        nextCorners,
        nextRot,
        nextMode,
        nextBright
      );
      setPages((prev) =>
        prev.map((p, i) => {
          if (i !== index) return p;
          try {
            URL.revokeObjectURL(p.processedUrl);
          } catch (_) {}
          return {
            ...p,
            corners: nextCorners,
            autoDetected: patch.autoDetected ?? p.autoDetected,
            rotationDeg: nextRot,
            filterMode: nextMode,
            brightnessAdjust: nextBright,
            processedBlob: result.processedBlob,
            processedUrl: result.processedUrl,
            processedSize: result.processedBlob.size,
            curvatureDetected: result.curvatureDetected,
            isProcessing: false,
          };
        })
      );
    } catch (_) {
      setPages((prev) => prev.map((p, i) => (i === index ? { ...p, isProcessing: false } : p)));
      onShowToast('تعذر تحديث الصفحة، حاول مجدداً');
    }
  };

  const handleRotatePage90 = (index: number, delta: 90 | -90) => {
    const page = pages[index];
    if (!page) return;
    const nextAngle = (((page.rotationDeg + delta) % 360) + 360) % 360;
    reprocessPageAt(index, { rotationDeg: nextAngle });
  };

  const handleOpenManualCrop = (index: number) => {
    const page = pages[index];
    if (!page) return;
    setSelectedIndex(index);
    setEditingCorners([
      { ...page.corners[0] },
      { ...page.corners[1] },
      { ...page.corners[2] },
      { ...page.corners[3] },
    ]);
    setIsManualCropOpen(true);
  };

  const handleRedetectInCrop = async () => {
    const page = pages[selectedIndex];
    if (!page) return;
    const det = await detectQuadOnBlob(page.originalBlob);
    if (det.detected) {
      setEditingCorners(det.quad);
      onShowToast('تم تحديد زوايا الورقة تلقائياً');
    } else {
      setEditingCorners([
        { ...FULL_FRAME_QUAD[0] },
        { ...FULL_FRAME_QUAD[1] },
        { ...FULL_FRAME_QUAD[2] },
        { ...FULL_FRAME_QUAD[3] },
      ]);
      onShowToast('اسحب الزوايا الأربع يدوياً حسب الحاجة');
    }
  };

  const applyManualCrop = async () => {
    setIsManualCropOpen(false);
    await reprocessPageAt(selectedIndex, { corners: editingCorners, autoDetected: true });
    onShowToast('تم تطبيق القص وتصحيح المنظور');
  };

  const handleCropPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingCornerIdx === null || !cropStageRef.current) return;
    const rect = cropStageRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = Math.max(0.0, Math.min(1.0, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.0, Math.min(1.0, (e.clientY - rect.top) / rect.height));
    setEditingCorners((prev) => {
      const next = [...prev] as QuadCorners;
      next[draggingCornerIdx] = { x: nx, y: ny };
      return next;
    });
  };

  const handleDeletePage = (index: number) => {
    const target = pages[index];
    if (target) revokePageUrls(target);
    const remaining = pages.filter((_, i) => i !== index);
    setPages(remaining);
    if (remaining.length === 0) {
      setSelectedIndex(0);
      setShowEditTools(false);
      setStage('capture');
    } else {
      setSelectedIndex(Math.min(index, remaining.length - 1));
    }
  };

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

  // ==================== المرحلة الثالثة: الحفظ والتصدير المستقل ====================
  const handleSaveImagesOnly = async () => {
    if (pages.length === 0 || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveProgress({ label: 'تجهيز الصور المستقلة (< 500 KB)...', percent: 20 });

    try {
      const images = await buildScannerImageOutputs(pages, (label, percent) => {
        if (isMountedRef.current) setSaveProgress({ label, percent });
      });

      for (const img of images) {
        if (img.size >= STRICT_500KB_BYTES) {
          throw new Error(`الصورة ${img.name} تجاوزت 500 KB`);
        }
        onTriggerDownload(img.blob, img.name);
      }

      const maxKb = Math.max(...images.map((im) => im.size / 1024)).toFixed(1);
      const persistentOpenUrl = URL.createObjectURL(images[0].blob);

      images.forEach((im) => {
        try {
          URL.revokeObjectURL(im.url);
        } catch (_) {}
      });

      if (savedExport?.openUrl) {
        try {
          URL.revokeObjectURL(savedExport.openUrl);
        } catch (_) {}
      }

      setSavedExport({
        kind: 'images',
        title: `تم حفظ ${images.length} ${images.length === 1 ? 'صورة' : 'صور'} بنجاح`,
        detail: `الحد الأقصى للصورة ${maxKb} KB · أقل من 500 KB لكل صورة`,
        locationLabel: 'مجلد التنزيلات / معرض الصور (Pictures/ManzomaLawyer)',
        openUrl: persistentOpenUrl,
        fileName: images[0].name,
      });
      onShowToast(`تم حفظ ${images.length} صورة بنجاح`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حفظ الصور';
      setSaveError(msg);
      onShowToast(msg);
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
        setSaveProgress(null);
      }
    }
  };

  const finalizePdfSave = (pdfResult: ScannerExportResult['pdf']) => {
    onTriggerDownload(pdfResult.blob, pdfResult.name);
    const pdfKb = (pdfResult.size / 1024).toFixed(1);
    const persistentOpenUrl = URL.createObjectURL(pdfResult.blob);
    try {
      URL.revokeObjectURL(pdfResult.url);
    } catch (_) {}

    if (savedExport?.openUrl) {
      try {
        URL.revokeObjectURL(savedExport.openUrl);
      } catch (_) {}
    }

    setOversizedPdfConsent(null);
    setSavedExport({
      kind: 'pdf',
      title: 'تم حفظ ملف PDF بنجاح',
      detail: `${pdfResult.name} · ${pages.length} ${pages.length === 1 ? 'صفحة' : 'صفحات'} · ${pdfKb} KB`,
      locationLabel: 'مجلد التنزيلات (Downloads)',
      openUrl: persistentOpenUrl,
      fileName: pdfResult.name,
    });
    onShowToast(`تم حفظ Scanned_Document.pdf (${pdfKb} KB)`);
  };

  const handleSavePdfOnly = async () => {
    if (pages.length === 0 || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveProgress({ label: 'دمج الصفحات في ملف PDF واحد...', percent: 20 });

    try {
      const pdfResult = await buildScannerPdfOutput(pages, (label, percent) => {
        if (isMountedRef.current) setSaveProgress({ label, percent });
      });

      if (!isMountedRef.current) return;

      if (pdfResult.exceededLimit) {
        setOversizedPdfConsent(pdfResult);
        return;
      }

      finalizePdfSave(pdfResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حفظ ملف PDF';
      setSaveError(msg);
      onShowToast(msg);
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
        setSaveProgress(null);
      }
    }
  };

  const handleStartNewScan = () => {
    pages.forEach(revokePageUrls);
    if (savedExport?.openUrl) {
      try {
        URL.revokeObjectURL(savedExport.openUrl);
      } catch (_) {}
    }
    setPages([]);
    setSelectedIndex(0);
    setRetakeIndex(null);
    setShowEditTools(false);
    setIsManualCropOpen(false);
    setIsLightboxOpen(false);
    setSavedExport(null);
    setSaveError(null);
    setOversizedPdfConsent(null);
    setStage('capture');
  };

  const currentPage = pages[selectedIndex];
  const stageIdx = stage === 'capture' ? 1 : stage === 'review' ? 2 : 3;
  const activeCropCorner =
    isManualCropOpen && draggingCornerIdx !== null ? editingCorners[draggingCornerIdx] : null;

  useEffect(() => {
    if (!isManualCropOpen || !currentPage?.originalUrl) {
      cropImgRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) cropImgRef.current = img;
    };
    img.src = currentPage.originalUrl;
    return () => {
      cancelled = true;
    };
  }, [isManualCropOpen, currentPage?.originalUrl]);

  useEffect(() => {
    if (!activeCropCorner || !loupeCanvasRef.current || !cropImgRef.current) return;
    const canvas = loupeCanvasRef.current;
    const img = cropImgRef.current;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (iw <= 0 || ih <= 0) return;

    const size = 192;
    if (canvas.width !== size) canvas.width = size;
    if (canvas.height !== size) canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, size, size);

    const cx = activeCropCorner.x * iw;
    const cy = activeCropCorner.y * ih;
    const srcSpan = Math.max(48, Math.min(iw, ih) * 0.22);
    const halfSpan = srcSpan * 0.5;
    const sx0 = cx - halfSpan;
    const sy0 = cy - halfSpan;

    const clipLeft = Math.max(0, sx0);
    const clipTop = Math.max(0, sy0);
    const clipRight = Math.min(iw, sx0 + srcSpan);
    const clipBottom = Math.min(ih, sy0 + srcSpan);

    if (clipRight > clipLeft && clipBottom > clipTop) {
      const dx = ((clipLeft - sx0) / srcSpan) * size;
      const dy = ((clipTop - sy0) / srcSpan) * size;
      const dw = ((clipRight - clipLeft) / srcSpan) * size;
      const dh = ((clipBottom - clipTop) / srcSpan) * size;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        img,
        clipLeft,
        clipTop,
        clipRight - clipLeft,
        clipBottom - clipTop,
        dx,
        dy,
        dw,
        dh
      );
    }

    const mid = size * 0.5;
    ctx.strokeStyle = 'rgba(45, 212, 191, 0.88)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(mid - 14, mid);
    ctx.moveTo(mid + 14, mid);
    ctx.lineTo(size, mid);
    ctx.moveTo(mid, 0);
    ctx.lineTo(mid, mid - 14);
    ctx.moveTo(mid, mid + 14);
    ctx.lineTo(mid, size);
    ctx.stroke();

    ctx.strokeStyle = '#0F2557';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mid, mid, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#FDE047';
    ctx.beginPath();
    ctx.arc(mid, mid, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [activeCropCorner]);

  return (
    <div dir="rtl" className="flex flex-col h-full -mx-3 -my-2.5 bg-slate-50 relative select-none">
      {/* مدخل استيراد الصور المتعددة وملفات PDF من «من الاستوديو» */}
      <input
        ref={studioInputRef}
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = e.target.files;
          await handleStudioFilesSelected(files);
          e.target.value = '';
        }}
      />

      {/* ==================== مؤشر التقدم البسيط للمراحل الثلاث (1 ← 2 ← 3) ==================== */}
      <div className="bg-[#09183B] text-white px-2.5 py-2 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <button
            type="button"
            onClick={() => {
              if (stage === 'export') {
                setSavedExport(null);
                setStage('review');
              } else if (stage === 'review') {
                setIsManualCropOpen(false);
                setStage('capture');
              } else {
                onBackHome();
              }
            }}
            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <ArrowLeft size={12} />
            <span>{stage === 'capture' ? 'الرئيسية' : 'السابق'}</span>
          </button>

          <span className="text-[11px] font-bold text-slate-100 truncate">
            {stage === 'capture'
              ? '1. التصوير وتجميع المستندات'
              : stage === 'review'
              ? '2. المراجعة والتحسين'
              : '3. الحفظ والتصدير'}
          </span>

          <span className="text-[10px] font-mono text-teal-300 tabular-nums whitespace-nowrap shrink-0">
            {pages.length} {pages.length === 1 ? 'صفحة' : 'صفحات'}
          </span>
        </div>

        {/* شريط خطوات المراحل الثلاث */}
        <div className="grid grid-cols-3 gap-1.5 text-[9.5px] font-bold">
          {[
            { num: 1, key: 'capture' as const, label: '1. التصوير' },
            { num: 2, key: 'review' as const, label: '2. المراجعة' },
            { num: 3, key: 'export' as const, label: '3. الحفظ' },
          ].map((item) => {
            const active = stageIdx === item.num;
            const done = stageIdx > item.num;
            const clickable = item.num === 1 || pages.length > 0;
            return (
              <button
                key={item.key}
                type="button"
                disabled={!clickable}
                onClick={() => {
                  if (!clickable) return;
                  if (item.key !== 'review') setIsManualCropOpen(false);
                  if (item.key !== 'export') setSavedExport(null);
                  setStage(item.key);
                }}
                className={`py-1 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#0F766E] text-white'
                    : done
                    ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-500/40'
                    : clickable
                    ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-900/60 text-slate-500 opacity-60'
                }`}
              >
                {done && <Check size={10} />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ==================== المرحلة 1: التصوير وتجميع المستندات ==================== */}
      {stage === 'capture' && (
        <div className="flex-1 flex flex-col bg-slate-950 text-white min-h-0">
          {/* شريط تحكم خفيف أعلى الكاميرا */}
          <div className="px-3 py-1.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setCaptureMode('auto')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors whitespace-nowrap shrink-0 ${
                  captureMode === 'auto' ? 'bg-[#0F766E] text-white' : 'text-slate-300'
                }`}
              >
                تلقائي
              </button>
              <button
                type="button"
                onClick={() => setCaptureMode('manual')}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors whitespace-nowrap shrink-0 ${
                  captureMode === 'manual' ? 'bg-amber-400 text-slate-950' : 'text-slate-300'
                }`}
              >
                يدوي
              </button>
            </div>

            {retakeIndex !== null && (
              <span className="text-[10px] font-bold text-amber-300 truncate">
                إعادة تصوير صفحة {retakeIndex + 1}
              </span>
            )}

            <button
              type="button"
              onClick={toggleFlash}
              aria-label="فلاش الكاميرا"
              className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 ${
                flashOn
                  ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-200'
              }`}
            >
              {flashOn ? <Zap size={12} /> : <ZapOff size={12} />}
              <span>{flashSupported ? (flashOn ? 'مضاء' : 'فلاش') : 'فلاش'}</span>
            </button>
          </div>

          {/* نافذة الكاميرا وإطار الكشف التلقائي */}
          <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center min-h-0">
            {cameraError ? (
              <div className="p-4 text-center space-y-2.5 max-w-[290px]">
                <div className="w-11 h-11 rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center mx-auto">
                  <Camera size={22} />
                </div>
                <p className="text-[11px] text-slate-200 leading-relaxed">{cameraError}</p>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => studioInputRef.current?.click()}
                    className="py-2.5 px-3 bg-[#0F766E] hover:bg-[#0D9488] rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5"
                  >
                    <FolderOpen size={14} />
                    <span>من الاستوديو (صور أو PDF)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCaptureFrame()}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-[11px] font-semibold"
                  >
                    تجربة التقاط ورقة مائلة
                  </button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={startCameraStream}
                      className="py-1.5 px-2 bg-white/10 hover:bg-white/15 rounded-xl text-[10px] text-slate-200"
                    >
                      إعادة تشغيل الكاميرا
                    </button>
                    <button
                      type="button"
                      onClick={handleCaptureFlatSampleFallback}
                      className="py-1.5 px-2 bg-white/10 hover:bg-white/15 rounded-xl text-[10px] text-teal-200"
                    >
                      نموذج مستند جاهز
                    </button>
                  </div>
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

                {/* إطار الرؤية الحاسوبية المباشر */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <polygon
                    points={liveQuad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                    fill={liveDetected ? 'rgba(20, 184, 166, 0.14)' : 'rgba(245, 158, 11, 0.05)'}
                    stroke={
                      !liveDetected
                        ? '#F59E0B'
                        : stableStreak >= 2
                        ? '#4ADE80'
                        : '#2DD4BF'
                    }
                    strokeWidth={liveDetected ? '1.2' : '0.8'}
                    strokeDasharray={liveDetected ? undefined : '2.5 1.5'}
                  />
                  {liveQuad.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x * 100}
                      cy={p.y * 100}
                      r={liveDetected ? '1.9' : '1.3'}
                      fill="#FDE047"
                    />
                  ))}
                </svg>

                {/* تنبيه حالة الكشف العلوي المختصر */}
                <div className="absolute top-2.5 inset-x-3 flex justify-center pointer-events-none">
                  {stabilityHint ? (
                    <div className="bg-rose-950/90 border border-rose-400/50 text-rose-200 text-[10px] font-bold px-3 py-1 rounded-lg flex items-center gap-1.5">
                      <Hand size={12} />
                      <span>{stabilityHint}</span>
                    </div>
                  ) : !liveDetected ? (
                    <div className="bg-slate-900/85 border border-amber-400/40 text-amber-300 text-[10px] px-3 py-1 rounded-lg flex items-center gap-1.5">
                      <ScanLine size={11} />
                      <span>وجّه الكاميرا نحو المستند</span>
                    </div>
                  ) : liveSharpness < 7 ? (
                    <div className="bg-slate-900/85 border border-teal-400/40 text-teal-200 text-[10px] px-3 py-1 rounded-lg">
                      تم رصد الورقة — جارٍ ضبط التركيز...
                    </div>
                  ) : (
                    <div className="bg-emerald-950/90 border border-emerald-400/50 text-emerald-300 text-[10px] font-bold px-3 py-1 rounded-lg flex items-center gap-1">
                      <Check size={11} />
                      <span>
                        {captureMode === 'auto' ? 'ثابت ✓ جاري الالتقاط التلقائي' : 'جاهز ✓ اضغط زر التصوير'}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* مؤشر استيراد الاستوديو عند تحويل PDF أو صور */}
            {isImportingStudio && (
              <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-2 z-20 px-4 text-center">
                <RefreshCw size={22} className="animate-spin text-teal-400" />
                <p className="text-xs font-bold text-white">{importStatusText || 'جاري الاستيراد...'}</p>
              </div>
            )}
          </div>

          {/* شريط مصغرات سريع عند وجود صفحات مضافة */}
          {pages.length > 0 && (
            <div className="px-2.5 py-1.5 bg-slate-900 border-t border-slate-800 flex items-center gap-1.5 overflow-x-auto shrink-0">
              {pages.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedIndex(idx);
                    setStage('review');
                  }}
                  className="relative w-8 h-10 rounded-md overflow-hidden border border-teal-400/60 shrink-0"
                  title={`صفحة ${idx + 1}`}
                >
                  <img src={p.processedUrl} alt={`صفحة ${idx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[8px] font-bold text-center text-white">
                    {idx + 1}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* شريط المرحلة الأولى السفلي: من الاستوديو + زر الالتقاط + زر التالي */}
          <div className="px-3 py-2.5 bg-[#09183B] border-t border-slate-800 flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              disabled={isImportingStudio}
              onClick={() => studioInputRef.current?.click()}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-[10.5px] font-bold text-slate-100 flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <FolderOpen size={13} className="text-teal-300" />
              <span>من الاستوديو</span>
            </button>

            <button
              type="button"
              disabled={isCapturing || isImportingStudio}
              onClick={() => handleCaptureFrame()}
              aria-label="التقاط الصفحة"
              className="w-14 h-14 rounded-full bg-white border-4 border-teal-400 flex items-center justify-center shadow-lg active:scale-90 transition-transform disabled:opacity-50 shrink-0"
            >
              <div className="w-10 h-10 rounded-full bg-[#0F766E] flex items-center justify-center text-white">
                {isCapturing ? <RefreshCw size={18} className="animate-spin" /> : <Camera size={20} />}
              </div>
            </button>

            <button
              type="button"
              disabled={pages.length === 0 || isImportingStudio}
              onClick={() => {
                setRetakeIndex(null);
                setStage('review');
              }}
              className="px-3.5 py-2 bg-[#0F766E] hover:bg-[#0D9488] disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
            >
              <span>التالي{pages.length > 0 ? ` (${pages.length})` : ''}</span>
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ==================== المرحلة 2: المراجعة والتحسين ==================== */}
      {stage === 'review' && currentPage && (
        <div className="flex-1 flex flex-col p-2.5 gap-2 overflow-y-auto min-h-0">
          {/* رأس معلومات الصفحة الحالية */}
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shrink-0">
            <div className="text-[10.5px] text-slate-600 flex items-center gap-1.5 tabular-nums">
              <strong className="text-[#0F2557]">
                صفحة {selectedIndex + 1} من {pages.length}
              </strong>
              <span aria-hidden="true">·</span>
              <span>{(currentPage.processedSize / 1024).toFixed(1)} KB</span>
              <span aria-hidden="true">·</span>
              <span>{currentPage.rotationDeg}°</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={currentPage.isProcessing}
                onClick={() => {
                  reprocessPageAt(selectedIndex, {
                    filterMode: 'color',
                    brightnessAdjust: 0,
                  });
                  onShowToast('تم تطبيق التحسين التلقائي للمستند');
                }}
                className="px-2 py-1 bg-teal-50 hover:bg-teal-100 text-[#0F766E] border border-teal-200 rounded-lg text-[10px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <RefreshCw size={11} />
                <span>تحسين تلقائي</span>
              </button>

              <button
                type="button"
                onClick={() => setIsLightboxOpen(true)}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-[#0F2557] rounded-lg text-[10px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Maximize2 size={11} />
                <span>تكبير</span>
              </button>
            </div>
          </div>

          {/* معاينة الصفحة المكبرة */}
          <div
            onClick={() => setIsLightboxOpen(true)}
            className="relative bg-slate-900 rounded-2xl border border-slate-300 overflow-hidden flex-1 min-h-[180px] flex items-center justify-center cursor-zoom-in"
          >
            <img
              src={currentPage.processedUrl}
              alt={`صفحة ${selectedIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />
            {currentPage.isProcessing && (
              <div className="absolute inset-0 bg-slate-950/75 flex items-center justify-center text-white text-xs gap-2">
                <RefreshCw size={16} className="animate-spin" />
                <span>جاري التحسين...</span>
              </div>
            )}
          </div>

          {/* شريط مصغرات الصفحات + زر إضافة من الكاميرا أو الاستوديو */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1.5 bg-white border border-slate-200 rounded-xl shrink-0">
            {pages.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={`relative w-10 h-12 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                  idx === selectedIndex ? 'border-[#0F766E] ring-2 ring-teal-500/25' : 'border-slate-200'
                }`}
              >
                <img src={p.processedUrl} alt={`thumb-${idx + 1}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0 inset-x-0 bg-black/75 text-white text-[8px] font-bold text-center">
                  {idx + 1}
                </span>
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setRetakeIndex(null);
                setStage('capture');
              }}
              className="w-10 h-12 rounded-lg border-2 border-dashed border-teal-500/60 bg-teal-50 hover:bg-teal-100 text-teal-800 flex flex-col items-center justify-center shrink-0 text-[8px] font-bold gap-0.5"
              title="تصوير صفحة إضافية"
            >
              <Plus size={13} />
              <span>كاميرا</span>
            </button>

            <button
              type="button"
              disabled={isImportingStudio}
              onClick={() => studioInputRef.current?.click()}
              className="w-10 h-12 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-[#0F2557] flex flex-col items-center justify-center shrink-0 text-[8px] font-bold gap-0.5 disabled:opacity-50"
              title="استيراد صور أو PDF من الاستوديو"
            >
              <FolderOpen size={12} />
              <span>استوديو</span>
            </button>
          </div>

          {/* الشريط السريع الأساسي: تدوير 90° + ترتيب + إعادة + حذف + أدوات التحرير */}
          <div className="grid grid-cols-6 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => handleRotatePage90(selectedIndex, 90)}
              className="py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center gap-0.5 text-[9px] font-bold text-[#0F2557]"
            >
              <RotateCw size={13} />
              <span>يمين 90°</span>
            </button>

            <button
              type="button"
              onClick={() => handleRotatePage90(selectedIndex, -90)}
              className="py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center gap-0.5 text-[9px] font-bold text-[#0F2557]"
            >
              <RotateCcw size={13} />
              <span>يسار 90°</span>
            </button>

            <div className="flex gap-0.5">
              <button
                type="button"
                disabled={selectedIndex === 0}
                onClick={() => movePage(selectedIndex, -1)}
                className="flex-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-200 rounded-xl flex items-center justify-center text-[#0F2557]"
                title="تقديم"
              >
                <ChevronRight size={13} />
              </button>
              <button
                type="button"
                disabled={selectedIndex === pages.length - 1}
                onClick={() => movePage(selectedIndex, 1)}
                className="flex-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-200 rounded-xl flex items-center justify-center text-[#0F2557]"
                title="تأخير"
              >
                <ChevronLeft size={13} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setRetakeIndex(selectedIndex);
                setStage('capture');
              }}
              className="py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center gap-0.5 text-[9px] font-bold text-teal-700"
            >
              <Camera size={13} />
              <span>إعادة</span>
            </button>

            <button
              type="button"
              onClick={() => handleDeletePage(selectedIndex)}
              className="py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex flex-col items-center gap-0.5 text-[9px] font-bold text-rose-600"
            >
              <Trash2 size={13} />
              <span>حذف</span>
            </button>

            <button
              type="button"
              onClick={() => setShowEditTools((v) => !v)}
              className={`py-1.5 border rounded-xl flex flex-col items-center gap-0.5 text-[9px] font-bold transition-colors ${
                showEditTools
                  ? 'bg-[#0F2557] text-white border-[#0F2557]'
                  : 'bg-white hover:bg-slate-100 text-[#0F2557] border-slate-200'
              }`}
            >
              <SlidersHorizontal size={13} />
              <span>أدوات التحرير</span>
            </button>
          </div>

          {/* قائمة أدوات التحرير الاختيارية المختصرة (تُفتح عند الحاجة فقط) */}
          {showEditTools && (
            <div className="bg-white border border-slate-200 rounded-xl p-2 space-y-2 shrink-0">
              {/* أ. القص اليدوي والمنظور + إعادة التحسين التلقائي */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleOpenManualCrop(selectedIndex)}
                  className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-[#0F2557] flex items-center justify-center gap-1"
                >
                  <Crop size={12} />
                  <span>القص اليدوي والمنظور</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    reprocessPageAt(selectedIndex, {
                      filterMode: 'color',
                      brightnessAdjust: 0,
                    });
                    onShowToast('تم تطبيق التحسين التلقائي للمستند');
                  }}
                  className="py-1.5 px-2 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1"
                >
                  <RefreshCw size={11} />
                  <span>تحسين تلقائي</span>
                </button>
              </div>

              {/* ب. ضبط الإضاءة */}
              <div className="flex items-center gap-2 text-[10px] text-slate-700">
                <Sun size={13} className="text-amber-500 shrink-0" />
                <span className="font-bold whitespace-nowrap">الإضاءة:</span>
                <input
                  type="range"
                  min={-30}
                  max={40}
                  step={5}
                  value={currentPage.brightnessAdjust}
                  onChange={(e) =>
                    reprocessPageAt(selectedIndex, { brightnessAdjust: Number(e.target.value) })
                  }
                  className="flex-1 accent-[#0F766E] h-1.5"
                />
                <span className="font-mono text-[9.5px] w-7 text-left tabular-nums">
                  {currentPage.brightnessAdjust > 0
                    ? `+${currentPage.brightnessAdjust}`
                    : currentPage.brightnessAdjust}
                </span>
              </div>

              {/* ج. أوضاع الألوان الثلاثة */}
              <div className="grid grid-cols-3 gap-1">
                {(
                  [
                    { mode: 'color', label: 'ألوان أصلية' },
                    { mode: 'grayscale', label: 'تدرج رمادي' },
                    { mode: 'bw', label: 'أبيض وأسود' },
                  ] as const
                ).map((item) => {
                  const active = currentPage.filterMode === item.mode;
                  return (
                    <button
                      key={item.mode}
                      type="button"
                      onClick={() => reprocessPageAt(selectedIndex, { filterMode: item.mode })}
                      className={`py-1.5 rounded-lg text-[9.5px] font-bold border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[#0F766E] text-white border-[#0F766E]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* زر رئيسي واضح للانتقال للمرحلة الثالثة */}
          <button
            type="button"
            onClick={() => {
              setShowEditTools(false);
              setSavedExport(null);
              setStage('export');
            }}
            className="w-full py-2.5 bg-[#0F2557] hover:bg-[#16347A] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shrink-0"
          >
            <span>التالي: الحفظ والتصدير</span>
            <ChevronLeft size={15} />
          </button>
        </div>
      )}

      {/* ==================== المرحلة 3: الحفظ والتصدير ==================== */}
      {stage === 'export' && (
        <div className="flex-1 flex flex-col p-3 gap-3 overflow-y-auto min-h-0">
          {/* شريط التقدم عند المعالجة */}
          {saveProgress && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-2.5 space-y-1.5 shrink-0">
              <div className="flex justify-between text-[10.5px] font-bold text-teal-900">
                <span>{saveProgress.label}</span>
                <span className="tabular-nums">{saveProgress.percent}%</span>
              </div>
              <div className="w-full bg-teal-200/70 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-[#0F766E] h-full transition-all"
                  style={{ width: `${saveProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {saveError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-[10.5px] text-rose-700 font-semibold shrink-0">
              {saveError} — صفحاتك ما زالت محفوظة لإعادة المحاولة.
            </div>
          )}

          {savedExport ? (
            /* شاشة ما بعد الحفظ: رسالة نجاح + مكان الحفظ + فتح الملف + بدء تصوير جديد */
            <div className="bg-white border border-emerald-300 rounded-2xl p-4 shadow-sm space-y-3 my-auto">
              <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <Check size={24} />
              </div>

              <div className="text-center space-y-1">
                <h4 className="text-sm font-bold text-[#0F2557]">{savedExport.title}</h4>
                <p className="text-[11px] text-slate-600">{savedExport.detail}</p>
                <p className="text-[10.5px] text-teal-800 bg-teal-50 border border-teal-200/70 rounded-lg py-1.5 px-2.5 mt-2">
                  مكان الحفظ: <strong>{savedExport.locationLabel}</strong>
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <a
                  href={savedExport.openUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-[#0F2557] hover:bg-[#16347A] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <ExternalLink size={14} className="text-[#FDE047]" />
                  <span>فتح الملف المحفوظ</span>
                </a>

                <button
                  type="button"
                  onClick={handleStartNewScan}
                  className="w-full py-2.5 bg-[#0F766E] hover:bg-[#0D9488] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Camera size={14} />
                  <span>بدء عملية تصوير جديدة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSavedExport(null)}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-semibold"
                >
                  حفظ بصيغة أخرى ({savedExport.kind === 'images' ? 'PDF' : 'صور'})
                </button>
              </div>
            </div>
          ) : (
            /* الشاشة الافتراضية للمرحلة 3: اختياران واضحان فقط (حفظ الصور | حفظ PDF) */
            <>
              <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-between shrink-0">
                <div>
                  <h4 className="text-xs font-bold text-[#0F2557]">جاهز للحفظ والتصدير</h4>
                  <p className="text-[10.5px] text-slate-500 mt-0.5 tabular-nums">
                    {pages.length} {pages.length === 1 ? 'صفحة جاهزة بالترتيب' : 'صفحات جاهزة بالترتيب'} · هدف الضغط &lt; 500 KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStage('review')}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-[#0F2557] rounded-lg text-[10px] font-bold whitespace-nowrap"
                >
                  مراجعة
                </button>
              </div>

              <div className="space-y-2.5 my-auto">
                {/* 1. حفظ الصور */}
                <button
                  type="button"
                  disabled={isSaving || pages.length === 0}
                  onClick={handleSaveImagesOnly}
                  className="w-full p-3.5 bg-[#0F2557] hover:bg-[#16347A] text-white rounded-2xl text-right shadow-sm flex items-center gap-3 transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <ImageIcon size={22} className="text-[#FDE047]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold">1. حفظ الصور</div>
                    <p className="text-[10.5px] text-blue-100 mt-0.5 leading-snug">
                      حفظ كل صفحة كصورة مستقلة (أقل من 500 KB لكل صورة مع حفظ الوضوح)
                    </p>
                  </div>
                </button>

                {/* 2. حفظ PDF */}
                <button
                  type="button"
                  disabled={isSaving || pages.length === 0}
                  onClick={handleSavePdfOnly}
                  className="w-full p-3.5 bg-[#0F766E] hover:bg-[#0D9488] text-white rounded-2xl text-right shadow-sm flex items-center gap-3 transition-all active:scale-[0.99] disabled:opacity-50"
                >
                  <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <FileText size={22} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold">2. حفظ PDF</div>
                    <p className="text-[10.5px] text-teal-100 mt-0.5 leading-snug">
                      دمج جميع الصفحات بالترتيب في ملف Scanned_Document.pdf (&lt; 500 KB)
                    </p>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== أداة القص اليدوي وتصحيح المنظور بسحب الزوايا ==================== */}
      {isManualCropOpen && currentPage && (
        <div className="absolute inset-0 z-40 flex flex-col bg-slate-950 text-white p-2.5 gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold">القص اليدوي وتصحيح المنظور</span>
            <button
              type="button"
              onClick={() => setIsManualCropOpen(false)}
              className="px-2 py-1 text-[10.5px] text-slate-300 hover:text-white bg-slate-800 rounded-lg"
            >
              إلغاء
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={handleRedetectInCrop}
              className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] font-bold text-teal-300 flex items-center justify-center gap-1"
            >
              <ScanLine size={12} />
              <span>كشف تلقائي للزوايا</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setEditingCorners([
                  { ...FULL_FRAME_QUAD[0] },
                  { ...FULL_FRAME_QUAD[1] },
                  { ...FULL_FRAME_QUAD[2] },
                  { ...FULL_FRAME_QUAD[3] },
                ])
              }
              className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-[10px] font-bold text-white flex items-center justify-center gap-1"
            >
              <Maximize2 size={12} />
              <span>كامل الصورة</span>
            </button>
          </div>

          <div
            onPointerMove={handleCropPointerMove}
            onPointerUp={() => setDraggingCornerIdx(null)}
            onPointerCancel={() => setDraggingCornerIdx(null)}
            onPointerLeave={() => setDraggingCornerIdx(null)}
            className="flex-1 bg-black rounded-2xl overflow-hidden flex items-center justify-center p-2 touch-none select-none min-h-0"
          >
            <div
              ref={cropStageRef}
              className="relative inline-block max-w-full max-h-full"
              style={{
                aspectRatio: `${currentPage.originalWidth || 3} / ${currentPage.originalHeight || 4}`,
              }}
            >
              <img
                src={currentPage.originalUrl}
                alt="قص يدوي"
                className="w-full h-full object-contain block pointer-events-none"
              />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                <polygon
                  points={editingCorners.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                  fill="rgba(20, 184, 166, 0.16)"
                  stroke="#2DD4BF"
                  strokeWidth="1.2"
                />
              </svg>
              {editingCorners.map((pt, idx) => (
                <div
                  key={idx}
                  data-testid={`crop-corner-${idx}`}
                  onPointerDown={() => setDraggingCornerIdx(idx)}
                  style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FDE047] border-2 border-[#0F2557] shadow-lg cursor-grab active:cursor-grabbing ${
                    draggingCornerIdx === idx ? 'w-7 h-7 scale-110 ring-2 ring-teal-400' : 'w-6 h-6'
                  }`}
                />
              ))}

              {/* عدسة التكبير الدائرية أثناء سحب أي زاوية */}
              {activeCropCorner && (
                <div
                  data-testid="crop-magnifying-loupe"
                  style={{
                    left: `${Math.max(16, Math.min(84, activeCropCorner.x * 100))}%`,
                    top:
                      activeCropCorner.y < 0.28
                        ? `calc(${activeCropCorner.y * 100}% + 68px)`
                        : `calc(${activeCropCorner.y * 100}% - 68px)`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full overflow-hidden border-[3px] border-[#0F2557] ring-2 ring-[#FDE047] shadow-2xl pointer-events-none z-50 bg-slate-900"
                >
                  <canvas ref={loupeCanvasRef} className="w-full h-full block" />
                </div>
              )}
            </div>
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

      {/* ==================== معاينة مكبرة للصفحة ==================== */}
      {isLightboxOpen && currentPage && (
        <div
          onClick={() => setIsLightboxOpen(false)}
          className="absolute inset-0 z-40 bg-slate-950/95 flex flex-col p-3"
        >
          <div className="flex items-center justify-between text-white mb-2">
            <span className="text-xs font-bold tabular-nums">
              صفحة {selectedIndex + 1} من {pages.length} · {(currentPage.processedSize / 1024).toFixed(1)} KB
            </span>
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center min-h-0" onClick={(e) => e.stopPropagation()}>
            <img
              src={currentPage.processedUrl}
              alt={`معاينة صفحة ${selectedIndex + 1}`}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </div>
        </div>
      )}

      {/* ==================== تنبيه الموافقة إذا تجاوز PDF حد 500 KB ==================== */}
      {oversizedPdfConsent && (
        <div className="absolute inset-0 bg-[#09183B]/75 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[300px] bg-white rounded-2xl p-4 text-slate-900 shadow-2xl border border-amber-400 space-y-3 text-right">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle size={20} className="shrink-0" />
                <h4 className="font-bold text-xs text-[#0F2557]">
                  ملف PDF تجاوز حد 500 KB
                </h4>
              </div>
              <button
                type="button"
                onClick={() => {
                  try {
                    URL.revokeObjectURL(oversizedPdfConsent.url);
                  } catch (_) {}
                  setOversizedPdfConsent(null);
                }}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              الحجم الفعلي لملف <strong dir="ltr">Scanned_Document.pdf</strong> ({pages.length} صفحات) وصل إلى{' '}
              <strong className="text-rose-600 tabular-nums">
                {(oversizedPdfConsent.size / 1024).toFixed(1)} KB
              </strong>{' '}
              حفاظاً على وضوح النصوص والأختام. هل توافق على حفظه بهذا الحجم؟
            </p>

            <div className="flex flex-col gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => finalizePdfSave(oversizedPdfConsent)}
                className="w-full py-2 bg-[#0F2557] hover:bg-[#16347A] text-white rounded-xl text-xs font-bold"
              >
                نعم، حفظ ملف PDF الآن
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    URL.revokeObjectURL(oversizedPdfConsent.url);
                  } catch (_) {}
                  setOversizedPdfConsent(null);
                }}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
