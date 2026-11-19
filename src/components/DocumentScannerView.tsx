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
  Eye,
  AlertTriangle,
  Plus,
  Sparkles,
  Hand,
  X,
  FileText,
  Image as ImageIcon,
  ScanLine,
  Maximize2,
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

type ViewStep = 'camera' | 'review' | 'crop' | 'full_preview';

/**
 * توليد صورة ورقة قانونية مائلة بمنظور حقيقي فوق مكتب داكن للاختبار السريع على الحاسوب بدون كاميرا
 */
async function createSkewedSampleDocumentBlob(pageNum: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 1280;
  const ctx = c.getContext('2d')!;

  // خلفية مكتب داكن متدرج لإبراز حدود الورقة البيضاء بوضوح للرؤية الحاسوبية
  const bg = ctx.createLinearGradient(0, 0, 960, 1280);
  bg.addColorStop(0, '#1E293B');
  bg.addColorStop(1, '#0F172A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 960, 1280);

  // مضلع ورقة مائل بمنظور شبه منحرف (Skewed trapezoid)
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

  // محتوى نصي قانوني + أختام ملونة داخل حدود الورقة المائلة
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

  // ختم أحمر دائري ملون (لاختبار الحفاظ على الألوان الأصلية)
  ctx.strokeStyle = '#DC2626';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(310, 910, 74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#DC2626';
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ختم رسمي معتمد', 310, 915);

  // توقيع أزرق (لاختبار الحفاظ على التوقيعات الملونة)
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

  // الصفحات المصورة (مؤقتة بالجلسة حتى الحفظ الفعلي وإغلاق المستخدم)
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [retakeIndex, setRetakeIndex] = useState<number | null>(null);

  // حالة الاكتشاف الحقيقي للحدود والثبات والوضوح
  const [liveQuad, setLiveQuad] = useState<QuadCorners>(DEFAULT_SCAN_QUAD);
  const [liveDetected, setLiveDetected] = useState(false);
  const [liveSharpness, setLiveSharpness] = useState(0);
  const [stabilityHint, setStabilityHint] = useState<string | null>(null);
  const [stableStreak, setStableStreak] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);

  // حالة تعديل القص اليدوي
  const [editingCorners, setEditingCorners] = useState<QuadCorners>(FULL_FRAME_QUAD);
  const [draggingCornerIdx, setDraggingCornerIdx] = useState<number | null>(null);
  const [cropBanner, setCropBanner] = useState<string | null>(null);
  const cropStageRef = useRef<HTMLDivElement>(null);

  // حالة الحفظ والتصدير المستقل
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ label: string; percent: number } | null>(null);
  const [oversizedPdfConsent, setOversizedPdfConsent] = useState<ScannerExportResult['pdf'] | null>(null);
  const [postExportPrompt, setPostExportPrompt] = useState<{
    kind: 'images' | 'pdf';
    detail: string;
    fileUrl: string;
    fileName: string;
    fileType: 'image' | 'document';
  } | null>(null);
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
      setCameraError('الكاميرا غير متاحة في هذا المتصفح أو الجهاز. يمكنك استيراد صورة أو تجربة نموذج الورقة المائلة.');
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
        setCameraError('تم رفض إذن الكاميرا. يرجى السماح بالوصول للكاميرا من إعدادات المتصفح أو استيراد صورة.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraError('لم يتم العثور على كاميرا متصلة بهذا الجهاز. يمكنك استيراد صورة أو تجربة نموذج الورقة المائلة.');
      } else {
        setCameraError('تعذر تشغيل الكاميرا حالياً. يمكنك إعادة المحاولة أو استيراد صورة مستند.');
      }
    }
  }, [stopCameraStream]);

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

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopCameraStream();
      pagesRef.current.forEach(revokePageUrls);
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

  /**
   * التقاط ومعالجة الصورة عبر محرك الرؤية الحاسوبية الفعلي:
   * - يكشف حدود الورقة تلقائياً داخل الصورة الملتقطة/المستوردة
   * - إذا فشل الاكتشاف التلقائي، يحافظ على كامل الصورة الأصلية (FULL_FRAME_QUAD) ويفتح شاشة التعديل اليدوي فوراً
   * - الوضع الافتراضي للجودة هو الألوان الأصلية ('color') للحفاظ على الأختام والتوقيعات
   */
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
        const processed = await processCapturedDocumentPage(rawBlob, quadToUse, 0, 'color');

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
          processedUrl: processed.processedUrl,
          processedBlob: processed.processedBlob,
          processedSize: processed.processedBlob.size,
        };

        let targetIdx: number;
        if (retakeIndex !== null) {
          targetIdx = retakeIndex;
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
        } else {
          targetIdx = pagesRef.current.length;
          setPages((prev) => {
            const next = [...prev, newPage];
            setSelectedIndex(next.length - 1);
            return next;
          });
        }

        if (!detected) {
          // عدم تنفيذ قص عشوائي — فتح محرر الزوايا الأربع فوق الصورة الكاملة تلقائياً
          setSelectedIndex(targetIdx);
          setEditingCorners([
            { ...FULL_FRAME_QUAD[0] },
            { ...FULL_FRAME_QUAD[1] },
            { ...FULL_FRAME_QUAD[2] },
            { ...FULL_FRAME_QUAD[3] },
          ]);
          setCropBanner('لم تتضح حدود الورقة تلقائياً — تم عرض الصورة كاملة لتحديد الزوايا الأربع يدوياً');
          setStep('crop');
          onShowToast('⚠️ لم يتضح إطار الورقة تلقائياً — حدد الزوايا يدوياً');
        } else if (retakeIndex !== null) {
          setStep('review');
          onShowToast('✅ تم استبدال الصفحة وقصها وتصحيح منظورها تلقائياً');
        } else {
          onShowToast(`✅ تم التقاط الورقة وقصها وتصحيح منظورها (${targetIdx + 1})`);
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
    [isCapturing, retakeIndex, onShowToast]
  );

  // التقاط إطار من الفيديو المباشر (أو توليد نموذج ورقة مائلة للاختبار عند غياب الكاميرا)
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

  // حلقة التحليل المباشر بالزمن الحقيقي: كشف الورقة + الثبات + الوضوح (لا التقط تلقائياً إذا detected === false)
  useEffect(() => {
    if (step !== 'camera' || !isCameraActive) return;

    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || isCapturing) return;

      const { gray, width, height } = sampleGrayscaleFrame(video, 120, 160);
      const det = detectDocumentQuadFromGray(gray, width, height);
      setLiveQuad((prev) =>
        det.detected
          ? ([0, 1, 2, 3].map((i) => ({
              x: prev[i].x * 0.5 + det.quad[i].x * 0.5,
              y: prev[i].y * 0.5 + det.quad[i].y * 0.5,
            })) as QuadCorners)
          : det.quad
      );
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
          setStabilityHint('حافظ على ثبات الهاتف قليلاً للحصول على أوضح صورة');
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
  }, [step, isCameraActive, captureMode, isCapturing, handleCaptureFrame]);

  // ==================== التدوير المتعامد 90° يمين أو يسار لكل صفحة ====================
  const handleRotatePage90 = async (index: number, delta: 90 | -90) => {
    const page = pages[index];
    if (!page || page.isProcessing) return;

    const nextAngle = (((page.rotationDeg + delta) % 360) + 360) % 360;
    setPages((prev) => prev.map((p, i) => (i === index ? { ...p, isProcessing: true } : p)));

    try {
      const result = await processCapturedDocumentPage(
        page.originalBlob,
        page.corners,
        nextAngle,
        page.filterMode
      );
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

  // ==================== تغيير وضع الجودة (ألوان أصلية / تدرج رمادي / أبيض وأسود) ====================
  const handleChangeFilterMode = async (index: number, mode: ScannerFilterMode) => {
    const page = pages[index];
    if (!page || page.isProcessing || page.filterMode === mode) return;

    setPages((prev) => prev.map((p, i) => (i === index ? { ...p, isProcessing: true } : p)));

    try {
      const result = await processCapturedDocumentPage(
        page.originalBlob,
        page.corners,
        page.rotationDeg,
        mode
      );
      setPages((prev) =>
        prev.map((p, i) => {
          if (i !== index) return p;
          try {
            URL.revokeObjectURL(p.processedUrl);
          } catch (_) {}
          return {
            ...p,
            filterMode: mode,
            processedBlob: result.processedBlob,
            processedUrl: result.processedUrl,
            processedSize: result.processedBlob.size,
            isProcessing: false,
          };
        })
      );
    } catch (_) {
      setPages((prev) => prev.map((p, i) => (i === index ? { ...p, isProcessing: false } : p)));
      onShowToast('تعذر تغيير وضع المعالجة');
    }
  };

  // ==================== القص اليدوي وتحريك الزوايا الأربع ====================
  const openManualCrop = (index: number, bannerMsg: string | null = null) => {
    const page = pages[index];
    if (!page) return;
    setSelectedIndex(index);
    setEditingCorners([
      { ...page.corners[0] },
      { ...page.corners[1] },
      { ...page.corners[2] },
      { ...page.corners[3] },
    ]);
    setCropBanner(bannerMsg);
    setStep('crop');
  };

  const handleRedetectInCrop = async () => {
    const page = pages[selectedIndex];
    if (!page) return;
    const det = await detectQuadOnBlob(page.originalBlob);
    if (det.detected) {
      setEditingCorners(det.quad);
      setCropBanner(null);
      onShowToast('✓ تم إعادة اكتشاف الزوايا الأربع للورقة');
    } else {
      setEditingCorners([
        { ...FULL_FRAME_QUAD[0] },
        { ...FULL_FRAME_QUAD[1] },
        { ...FULL_FRAME_QUAD[2] },
        { ...FULL_FRAME_QUAD[3] },
      ]);
      onShowToast('لم يتضح إطار مستقل — يمكنك سحب الزوايا الأربع يدوياً');
    }
  };

  const applyManualCrop = async () => {
    const page = pages[selectedIndex];
    if (!page) return;
    setPages((prev) => prev.map((p, i) => (i === selectedIndex ? { ...p, isProcessing: true } : p)));
    setCropBanner(null);
    setStep('review');
    try {
      const result = await processCapturedDocumentPage(
        page.originalBlob,
        editingCorners,
        page.rotationDeg,
        page.filterMode
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
            autoDetected: true,
            processedBlob: result.processedBlob,
            processedUrl: result.processedUrl,
            processedSize: result.processedBlob.size,
            isProcessing: false,
          };
        })
      );
      onShowToast('✅ تم تطبيق القص وتصحيح المنظور بنجاح');
    } catch (_) {
      setPages((prev) => prev.map((p, i) => (i === selectedIndex ? { ...p, isProcessing: false } : p)));
      onShowToast('تعذر تطبيق القص اليدوي');
    }
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
      setStep('camera');
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

  // ==================== التصدير المستقل: أ. حفظ الصور بالمعرض (< 500 KB) ====================
  const handleSaveImagesOnly = async () => {
    if (pages.length === 0 || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveProgress({ label: 'تجهيز وحفظ الصور منفردة (< 500 KB)...', percent: 15 });

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
      const summaryDetail = `(تم حفظ ${images.length} صورة • بحد أقصى ${maxKb} KB < 500 KB)`;
      const persistentFirstUrl = URL.createObjectURL(images[0].blob);

      images.forEach((im) => {
        try {
          URL.revokeObjectURL(im.url);
        } catch (_) {}
      });

      setPostExportPrompt({
        kind: 'images',
        detail: summaryDetail,
        fileUrl: persistentFirstUrl,
        fileName: images[0].name,
        fileType: 'image',
      });
      onShowToast(`✅ تم حفظ ${images.length} صورة (< 500 KB لكل صورة)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حفظ الصور';
      setSaveError(msg);
      onShowToast(`❌ ${msg}`);
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
        setSaveProgress(null);
      }
    }
  };

  // ==================== التصدير المستقل: ب. حفظ PDF موحد (< 500 KB أو موافقة) ====================
  const finalizePdfSave = (pdfResult: ScannerExportResult['pdf']) => {
    onTriggerDownload(pdfResult.blob, pdfResult.name);
    const pdfKb = (pdfResult.size / 1024).toFixed(1);
    const summaryDetail = `(ملف Scanned_Document.pdf • ${pages.length} صفحات • ${pdfKb} KB)`;
    const persistentPdfUrl = URL.createObjectURL(pdfResult.blob);
    try {
      URL.revokeObjectURL(pdfResult.url);
    } catch (_) {}

    setOversizedPdfConsent(null);
    setPostExportPrompt({
      kind: 'pdf',
      detail: summaryDetail,
      fileUrl: persistentPdfUrl,
      fileName: pdfResult.name,
      fileType: 'document',
    });
    onShowToast(`✅ تم حفظ Scanned_Document.pdf (${pdfKb} KB)`);
  };

  const handleSavePdfOnly = async () => {
    if (pages.length === 0 || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveProgress({ label: 'تجميع الصفحات في Scanned_Document.pdf...', percent: 15 });

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
      onShowToast(`❌ ${msg}`);
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
        setSaveProgress(null);
      }
    }
  };

  // تنظيف الملفات المؤقتة فقط بعد إقرار المستخدم بالانتهاء والعودة للرئيسية
  const handleFinishAndCleanup = () => {
    const prompt = postExportPrompt;
    pages.forEach(revokePageUrls);
    setPages([]);
    setSelectedIndex(0);
    setPostExportPrompt(null);
    if (prompt) {
      onSaveComplete(prompt.detail, prompt.fileUrl, prompt.fileName, prompt.fileType);
    }
    onBackHome();
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
            await captureFromBlob(f);
          }
          e.target.value = '';
        }}
      />

      {/* ==================== 1. شاشة الكاميرا الذكية واكتشاف الورقة الفعلي ==================== */}
      {step === 'camera' && (
        <div className="flex-1 flex flex-col bg-slate-950 text-white">
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
                تلقائي
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

          <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
            {cameraError ? (
              <div className="p-4 text-center space-y-2.5 max-w-[290px]">
                <div className="w-11 h-11 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center mx-auto">
                  <Camera size={22} />
                </div>
                <p className="text-[11px] text-slate-200 leading-relaxed">{cameraError}</p>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={startCameraStream}
                    className="py-2 px-3 bg-teal-600 hover:bg-teal-500 rounded-xl text-[11px] font-bold"
                  >
                    إعادة محاولة تشغيل الكاميرا
                  </button>
                  <button
                    type="button"
                    onClick={() => fileFallbackRef.current?.click()}
                    className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-[11px] font-semibold"
                  >
                    استيراد صورة مستند من الجهاز
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCaptureFrame()}
                    className="py-2 px-3 bg-emerald-700/80 hover:bg-emerald-600 rounded-xl text-[11px] font-bold text-white"
                  >
                    تجربة كشف وقص ورقة مائلة بمنظور حقيقي
                  </button>
                  <button
                    type="button"
                    onClick={handleCaptureFlatSampleFallback}
                    className="py-1.5 px-3 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] text-teal-200"
                  >
                    نموذج مستند قانوني جاهز
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

                {/* إطار الرؤية الحاسوبية المباشر */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <polygon
                    points={liveQuad.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
                    fill={liveDetected ? 'rgba(20, 184, 166, 0.14)' : 'rgba(245, 158, 11, 0.06)'}
                    stroke={
                      !liveDetected
                        ? '#F59E0B'
                        : stableStreak >= 2
                        ? '#4ADE80'
                        : '#2DD4BF'
                    }
                    strokeWidth={liveDetected ? '1.1' : '0.8'}
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

                <div className="absolute top-2.5 inset-x-3 flex justify-center pointer-events-none">
                  {stabilityHint ? (
                    <div className="bg-rose-950/90 border border-rose-400/50 text-rose-200 text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 shadow-lg">
                      <Hand size={12} />
                      <span>{stabilityHint}</span>
                    </div>
                  ) : !liveDetected ? (
                    <div className="bg-slate-900/85 border border-amber-400/40 text-amber-300 text-[10px] px-3 py-1 rounded-full flex items-center gap-1.5">
                      <ScanLine size={11} />
                      <span>لم يتم اكتشاف ورقة بوضوح — وجّه الكاميرا نحو المستند</span>
                    </div>
                  ) : liveSharpness < 7 ? (
                    <div className="bg-slate-900/85 border border-teal-400/40 text-teal-200 text-[10px] px-3 py-1 rounded-full flex items-center gap-1.5">
                      <Sparkles size={11} />
                      <span>تم رصد الورقة — جارٍ ضبط التركيز والوضوح...</span>
                    </div>
                  ) : (
                    <div className="bg-emerald-950/90 border border-emerald-400/50 text-emerald-300 text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                      <Check size={11} />
                      <span>
                        {retakeIndex !== null
                          ? `إعادة تصوير الصفحة ${retakeIndex + 1}`
                          : captureMode === 'auto'
                          ? 'تم رصد الورقة ✓ ثبّت للالتقاط التلقائي'
                          : 'تم رصد حدود الورقة ✓ اضغط زر الالتقاط'}
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

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
              title="التقاط الورقة يدوياً الآن"
            >
              <div className="w-10 h-10 rounded-full bg-[#0F766E] flex items-center justify-center text-white">
                {isCapturing ? <RefreshCw size={18} className="animate-spin" /> : <Camera size={20} />}
              </div>
            </button>

            <div className="text-center min-w-[68px]">
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
                  className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-[9.5px] text-teal-300 font-semibold"
                >
                  ورقة مائلة
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. شاشة المراجعة والتدوير 90° وأوضاع الجودة ==================== */}
      {step === 'review' && currentPage && (
        <div className="flex-1 flex flex-col p-2.5 gap-2 overflow-y-auto">
          <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs">
            <div>
              <h4 className="text-[11.5px] font-bold text-[#0F2557]">
                مراجعة المستند ({pages.length} {pages.length === 1 ? 'صفحة' : 'صفحات'})
              </h4>
              <p className="text-[9.5px] text-slate-500">
                صفحة {selectedIndex + 1} • {(currentPage.processedSize / 1024).toFixed(1)} KB • زاوية {currentPage.rotationDeg}°
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep('full_preview')}
              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-[#0F2557] rounded-lg text-[10px] font-bold flex items-center gap-1 border border-blue-200"
            >
              <Eye size={12} />
              <span>معاينة</span>
            </button>
          </div>

          <div className="relative bg-slate-900 rounded-2xl border border-slate-300 overflow-hidden h-[200px] flex items-center justify-center shrink-0">
            <img
              src={currentPage.processedUrl}
              alt={`صفحة ${selectedIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />
            {currentPage.isProcessing && (
              <div className="absolute inset-0 bg-slate-950/75 flex items-center justify-center text-white text-xs gap-2">
                <RefreshCw size={16} className="animate-spin" />
                <span>جاري التحديث...</span>
              </div>
            )}
            <span className="absolute top-2 right-2 bg-emerald-600/90 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
              {currentPage.filterMode === 'color'
                ? 'ألوان أصلية محسّنة'
                : currentPage.filterMode === 'grayscale'
                ? 'تدرج رمادي'
                : 'أبيض وأسود ذكي'}
            </span>
          </div>

          {/* شريط أوضاع الجودة الثلاثة (الافتراضي: ألوان أصلية) */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => handleChangeFilterMode(selectedIndex, 'color')}
              className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                currentPage.filterMode === 'color'
                  ? 'bg-[#0F766E] text-white border-[#0F766E]'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              ألوان أصلية {currentPage.filterMode === 'color' ? '✓' : ''}
            </button>
            <button
              type="button"
              onClick={() => handleChangeFilterMode(selectedIndex, 'grayscale')}
              className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                currentPage.filterMode === 'grayscale'
                  ? 'bg-[#0F766E] text-white border-[#0F766E]'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              تدرج رمادي {currentPage.filterMode === 'grayscale' ? '✓' : ''}
            </button>
            <button
              type="button"
              onClick={() => handleChangeFilterMode(selectedIndex, 'bw')}
              className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                currentPage.filterMode === 'bw'
                  ? 'bg-[#0F766E] text-white border-[#0F766E]'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              أبيض وأسود {currentPage.filterMode === 'bw' ? '✓' : ''}
            </button>
          </div>

          {/* شريط أدوات الصفحة: تدوير 90° يمين/يسار + قص + إعادة تصوير + ترتيب + حذف */}
          <div className="grid grid-cols-6 gap-1">
            <button
              type="button"
              onClick={() => handleRotatePage90(selectedIndex, 90)}
              className="py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center gap-0.5 text-[9px] font-bold text-[#0F2557]"
              title="تدوير 90° لليمين"
            >
              <RotateCw size={13} />
              <span>يمين 90°</span>
            </button>

            <button
              type="button"
              onClick={() => handleRotatePage90(selectedIndex, -90)}
              className="py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center gap-0.5 text-[9px] font-bold text-[#0F2557]"
              title="تدوير 90° لليسار"
            >
              <RotateCcw size={13} />
              <span>يسار 90°</span>
            </button>

            <button
              type="button"
              onClick={() => openManualCrop(selectedIndex)}
              className="py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center gap-0.5 text-[9px] font-bold text-[#0F2557]"
            >
              <Crop size={13} />
              <span>القص</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRetakeIndex(selectedIndex);
                setStep('camera');
              }}
              className="py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl flex flex-col items-center gap-0.5 text-[9px] font-bold text-teal-700"
            >
              <Camera size={13} />
              <span>إعادة</span>
            </button>

            <div className="flex gap-0.5">
              <button
                type="button"
                disabled={selectedIndex === 0}
                onClick={() => movePage(selectedIndex, -1)}
                className="flex-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-200 rounded-xl flex items-center justify-center text-[#0F2557]"
                title="تقديم الصفحة"
              >
                <ChevronRight size={13} />
              </button>
              <button
                type="button"
                disabled={selectedIndex === pages.length - 1}
                onClick={() => movePage(selectedIndex, 1)}
                className="flex-1 bg-white hover:bg-slate-100 disabled:opacity-40 border border-slate-200 rounded-xl flex items-center justify-center text-[#0F2557]"
                title="تأخير الصفحة"
              >
                <ChevronLeft size={13} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleDeletePage(selectedIndex)}
              className="py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex flex-col items-center gap-0.5 text-[9px] font-bold text-rose-600"
            >
              <Trash2 size={13} />
              <span>حذف</span>
            </button>
          </div>

          {/* مصغرات الصفحات + زر إضافة ورقة */}
          <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 bg-white border border-slate-200 rounded-xl shrink-0">
            {pages.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className={`relative w-11 h-13 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                  idx === selectedIndex ? 'border-[#0F766E] ring-2 ring-teal-500/30' : 'border-slate-200'
                }`}
              >
                <img src={p.processedUrl} alt={`thumb-${idx + 1}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[8px] font-bold text-center">
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
              className="w-11 h-13 rounded-lg border-2 border-dashed border-teal-500/60 bg-teal-50 hover:bg-teal-100 text-teal-700 flex flex-col items-center justify-center shrink-0 text-[8.5px] font-bold gap-0.5"
            >
              <Plus size={13} />
              <span>إضافة</span>
            </button>
          </div>

          {saveError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-2 text-[10px] text-rose-700 font-semibold">
              {saveError} — الصور المؤقتة محفوظة لإعادة المحاولة.
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

          {/* خياران منفصلان وواضحان للتصدير والحفظ */}
          <div className="grid grid-cols-2 gap-1.5 mt-auto">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveImagesOnly}
              className="py-2.5 px-2 bg-[#0F2557] hover:bg-[#16347A] text-white rounded-xl text-[10.5px] font-bold shadow-sm flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <ImageIcon size={13} />
              <span>أ. حفظ الصور (&lt; 500 KB)</span>
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={handleSavePdfOnly}
              className="py-2.5 px-2 bg-[#0F766E] hover:bg-[#0D9488] text-white rounded-xl text-[10.5px] font-bold shadow-sm flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <FileText size={13} />
              <span>ب. حفظ PDF (&lt; 500 KB)</span>
            </button>
          </div>
        </div>
      )}

      {/* ==================== 3. شاشة تعديل حدود القص يدوياً بدقة أبعاد حقيقية ==================== */}
      {step === 'crop' && currentPage && (
        <div className="flex-1 flex flex-col bg-slate-950 text-white p-2.5 gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold">تعديل زوايا قص الورقة يدوياً</span>
            <button
              type="button"
              onClick={() => {
                setCropBanner(null);
                setStep('review');
              }}
              className="text-xs text-slate-300 hover:text-white"
            >
              إلغاء
            </button>
          </div>

          {cropBanner && (
            <div className="bg-amber-500/15 border border-amber-400/50 text-amber-200 text-[10px] px-2.5 py-1.5 rounded-lg">
              {cropBanner}
            </div>
          )}

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
              <span>كامل الصورة الأصلية</span>
            </button>
          </div>

          <div
            onPointerMove={handleCropPointerMove}
            onPointerUp={() => setDraggingCornerIdx(null)}
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
                  onPointerDown={() => setDraggingCornerIdx(idx)}
                  style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#FDE047] border-2 border-[#0F2557] shadow-lg cursor-grab active:cursor-grabbing"
                />
              ))}
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
                  <span>{(p.processedSize / 1024).toFixed(1)} KB • {p.rotationDeg}°</span>
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

      {/* ==================== نافذة الموافقة الصريحة عند تجاوز ملف PDF حد 500 KB ==================== */}
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
              الحجم النهائي لملف <strong dir="ltr">Scanned_Document.pdf</strong> ({pages.length} صفحات) وصل إلى{' '}
              <strong className="text-rose-600">
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
                إلغاء والعودة للمراجعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== نافذة تأكيد بعد نجاح أحد خياري التصدير ==================== */}
      {postExportPrompt && (
        <div className="absolute inset-0 bg-[#09183B]/75 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[300px] bg-white rounded-2xl p-4 text-slate-900 shadow-2xl border border-emerald-400 space-y-3 text-right">
            <div className="flex items-center gap-2 text-emerald-600">
              <Check size={20} className="shrink-0" />
              <h4 className="font-bold text-xs text-[#0F2557]">
                {postExportPrompt.kind === 'images' ? 'تم حفظ الصور بنجاح' : 'تم حفظ ملف PDF بنجاح'}
              </h4>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {postExportPrompt.detail}. يمكنك البقاء الآن لتصدير{' '}
              {postExportPrompt.kind === 'images' ? 'ملف PDF الموحد أيضاً' : 'الصور منفردة بالمعرض أيضاً'}، أو الإغلاق وحذف الملفات المؤقتة.
            </p>
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setPostExportPrompt(null)}
                className="w-full py-2 bg-[#0F766E] hover:bg-[#0D9488] text-white rounded-xl text-xs font-bold"
              >
                البقاء في المراجعة
              </button>
              <button
                type="button"
                onClick={handleFinishAndCleanup}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold"
              >
                تم، إغلاق وحذف المؤقتات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
