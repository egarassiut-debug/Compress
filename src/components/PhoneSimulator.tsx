import React, { useState, useRef } from 'react';
import {
  FileImage,
  FileText,
  Files,
  ArrowRight,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  ExternalLink,
  ShieldCheck,
  FolderDown,
  Gavel,
  Scale,
  Globe,
  Building2,
  Car,
  FileCheck2,
  Users,
  Award,
  ScrollText,
  Share2,
  Check,
  Send,
  Image as ImageIcon,
  Camera,
  Scan,
  Activity,
  Gauge,
  Minimize2,
  Maximize2,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
} from 'lucide-react';
import {
  compressImageClient,
  compressMultipleImagesClient,
  compressPdfClient,
  mergeImagesToPdfClient,
  CompressionResult,
  CompressionProgress,
} from '../utils/compression';
import confetti from 'canvas-confetti';

type ScreenType =
  | 'home'
  | 'compress_image'
  | 'compress_pdf'
  | 'merge_images'
  | 'legal_portals';

interface LegalPortal {
  id: string;
  title: string;
  category: string;
  url: string;
  icon: React.ReactNode;
  bgGradient: string;
  borderColor: string;
}

export const PhoneSimulator: React.FC = () => {
  // يفتح التطبيق مباشرة على الشاشة الرئيسية فوراً بدون أي تسجيل دخول
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');

  // حالة ضغط الصور (صورة أو أكثر دفعة واحدة < 200 KB)
  const [selectedImagesForCompress, setSelectedImagesForCompress] = useState<File[]>([]);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageResult, setImageResult] = useState<CompressionResult | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // حالة ضغط الـ PDF (<500KB)
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [pdfResult, setPdfResult] = useState<CompressionResult | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);

  // حالة دمج الصور إلى PDF (<500KB)
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [mergedPdfResult, setMergedPdfResult] = useState<CompressionResult | null>(null);
  const [isProcessingMerge, setIsProcessingMerge] = useState(false);

  // مؤشر التقدم التفاعلي والشفاف لعملية الضغط (صغير، جانبي، واختياري للمحامي)
  const [isProgressIndicatorEnabled, setIsProgressIndicatorEnabled] = useState<boolean>(true);
  const [isProgressExpanded, setIsProgressExpanded] = useState<boolean>(true);
  const [currentProgress, setCurrentProgress] = useState<CompressionProgress | null>(null);
  const [showProgressWidget, setShowProgressWidget] = useState<boolean>(false);

  // رسالة الـ 3 ثوانٍ الذكية العائمة مع زر [ فتح ]
  const [smartToast, setSmartToast] = useState<{
    show: boolean;
    message: string;
    fileUrl?: string;
    fileName?: string;
  }>({ show: false, message: '' });
  const smartToastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showSmartToast = (message: string, fileUrl?: string, fileName?: string) => {
    if (smartToastTimerRef.current) {
      clearTimeout(smartToastTimerRef.current);
    }
    setSmartToast({ show: true, message, fileUrl, fileName });
    smartToastTimerRef.current = setTimeout(() => {
      setSmartToast({ show: false, message: '' });
    }, 3000); // تختفي تلقائياً خلال 3 ثوانٍ بالضبط
  };

  // إشعار سناك بار فلاتر
  const [snackBarMessage, setSnackBarMessage] = useState<string | null>(null);

  // نافذة مشاركة وحفظ الـ PDF المباشرة (Save/Share Sheet)
  const [pdfShareModal, setPdfShareModal] = useState<{
    name: string;
    url: string;
    size: number;
    blob: Blob;
  } | null>(null);

  // نافذة مشاركة التطبيق مع الزملاء
  const [isShareAppModalOpen, setIsShareAppModalOpen] = useState(false);
  const [copiedShareText, setCopiedShareText] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const multiImagesInputRef = useRef<HTMLInputElement>(null);

  // حالة الماسح الضوئي المباشر بكاميرا الهاتف (Scanner)
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'image' | 'pdf_merge'>('image');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);

  const startCameraScanner = async (target: 'image' | 'pdf_merge') => {
    setScannerTarget(target);
    setIsScannerOpen(true);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        setCameraStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }
    } catch (err: any) {
      console.warn('Camera access error or unsupported:', err);
      showFlutterToast('يرجى السماح بالوصول لكاميرا الهاتف لإجراء المسح الضوئي');
    }
  };

  const stopCameraScanner = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsScannerOpen(false);
  };

  const captureScannedDocument = async () => {
    let capturedFile: File | null = null;

    if (videoRef.current && videoRef.current.videoWidth > 0) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      const blob = await new Promise<Blob>((res) =>
        canvas.toBlob((b) => res(b!), 'image/jpeg', 0.95)
      );
      capturedFile = new File([blob], `scanned_doc_${Date.now()}.jpg`, { type: 'image/jpeg' });
    } else {
      // محاكاة فورية لصورة مستند ملون ممسوح ضوئياً بكاميرا عالية الدقة إذا لم تتوفر الكاميرا الحقيقية
      capturedFile = await generateSampleImage('مستند رسمي ممسوح ضوئياً بالكاميرا', 1600);
    }

    stopCameraScanner();

    if (capturedFile) {
      if (scannerTarget === 'image') {
        setSelectedImagesForCompress([capturedFile]);
        setSelectedImage(capturedFile);
        setImagePreview(URL.createObjectURL(capturedFile));
        setImageResult(null);
        setCurrentScreen('compress_image');
        showFlutterToast('📸 تم التقاط المستند بالكاميرا بنجاح! جاهز للضغط الفوري');
      } else {
        setSelectedImages((prev) => [...prev, capturedFile]);
        setMergedPdfResult(null);
        setCurrentScreen('merge_images');
        showFlutterToast('📸 تم التقاط ورقة المستند وإضافتها لملف الـ PDF بنجاح!');
      }
    }
  };

  const showFlutterToast = (msg: string) => {
    setSnackBarMessage(msg);
    setTimeout(() => {
      setSnackBarMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // قائمة الـ 10 مواقع الرسمية للنيابة ومحكمة الأسرة ومصر الرقمية
  const legalPortals: LegalPortal[] = [
    {
      id: 'ppo',
      title: 'بوابة النيابة العامة',
      category: 'خدمات الجنائي والعرائض والتظلمات',
      url: 'https://ppo.gov.eg/',
      icon: <Gavel size={22} className="text-blue-700" />,
      bgGradient: 'from-blue-50 to-indigo-50',
      borderColor: 'border-blue-200',
    },
    {
      id: 'family',
      title: 'محكمة الأسرة',
      category: 'دعاوى الأسرة والولاية على المال والنفقة',
      url: 'https://ppo.gov.eg/',
      icon: <Users size={22} className="text-teal-700" />,
      bgGradient: 'from-teal-50 to-emerald-50',
      borderColor: 'border-teal-200',
    },
    {
      id: 'digital_egypt',
      title: 'منصة مصر الرقمية',
      category: 'خدمات التوثيق والتوكيلات وتحرير المحاضر',
      url: 'https://digital.gov.eg/',
      icon: <FileCheck2 size={22} className="text-amber-700" />,
      bgGradient: 'from-amber-50 to-yellow-50',
      borderColor: 'border-amber-200',
    },
    {
      id: 'moj',
      title: 'بوابة وزارة العدل',
      category: 'إقامة الدعاوى عن بُعد والاستعلام القضائي',
      url: 'https://moj.gov.eg/',
      icon: <Scale size={22} className="text-blue-600" />,
      bgGradient: 'from-blue-50 to-sky-50',
      borderColor: 'border-blue-200',
    },
    {
      id: 'cassation',
      title: 'محكمة النقض المصرية',
      category: 'جداول الطعون وأحكام النقض الجنائية والمدنية',
      url: 'https://cc.gov.eg/',
      icon: <Building2 size={22} className="text-purple-700" />,
      bgGradient: 'from-purple-50 to-violet-50',
      borderColor: 'border-purple-200',
    },
    {
      id: 'state_council',
      title: 'مجلس الدولة المصري',
      category: 'محاكم القضاء الإداري والطعون التأديبية',
      url: 'https://ecs.gov.eg/',
      icon: <Building2 size={22} className="text-emerald-700" />,
      bgGradient: 'from-emerald-50 to-teal-50',
      borderColor: 'border-emerald-200',
    },
    {
      id: 'const_court',
      title: 'المحكمة الدستورية العليا',
      category: 'الأحكام الدستورية وجداول الجلسات',
      url: 'https://hccourt.gov.eg/',
      icon: <ScrollText size={22} className="text-rose-700" />,
      bgGradient: 'from-rose-50 to-red-50',
      borderColor: 'border-rose-200',
    },
    {
      id: 'bar_assoc',
      title: 'نقابة المحامين المصرية',
      category: 'تجديد القيد والعلاج والخدمات النقابية',
      url: 'https://egyls.com/',
      icon: <Award size={22} className="text-indigo-700" />,
      bgGradient: 'from-indigo-50 to-blue-50',
      borderColor: 'border-indigo-200',
    },
    {
      id: 'notary',
      title: 'الشهر العقاري والتوثيق',
      category: 'حجز المواعيد ومعاملات التوثيق والعقود',
      url: 'https://rso.gov.eg/',
      icon: <FileText size={22} className="text-cyan-700" />,
      bgGradient: 'from-cyan-50 to-sky-50',
      borderColor: 'border-cyan-200',
    },
    {
      id: 'traffic',
      title: 'نيابات المرور الإلكترونية',
      category: 'استعلام وتظلمات المخالفات وتراخيص القيادة',
      url: 'https://ppo.gov.eg/',
      icon: <Car size={22} className="text-orange-700" />,
      bgGradient: 'from-orange-50 to-amber-50',
      borderColor: 'border-orange-200',
    },
  ];

  const openPortalUrl = (url: string, title: string) => {
    showFlutterToast(`جاري فتح موقع: ${title}`);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const generateSampleImage = async (title: string, sizeKB = 1600): Promise<File> => {
    const canvas = document.createElement('canvas');
    canvas.width = 2200;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // خلفية الورق الرسمي
      ctx.fillStyle = '#FCFDFE';
      ctx.fillRect(0, 0, 2200, 1600);

      // إطار المستند الرسمي
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 14;
      ctx.strokeRect(50, 50, 2100, 1500);

      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 4;
      ctx.strokeRect(70, 70, 2060, 1460);

      // ترويسة المستند
      ctx.fillStyle = '#1e3a8a';
      ctx.font = 'bold 56px Cairo, Arial';
      ctx.fillText('جمهورية مصر العربية - وزارة العدل - مصلحة الشهر العقاري والتوثيق', 180, 200);
      ctx.font = 'bold 46px Cairo, Arial';
      ctx.fillText(title, 180, 290);

      ctx.fillStyle = '#334155';
      ctx.font = '34px Cairo, Arial';
      ctx.fillText('مستند رسمي معتمد موجه لمنظومة النيابة العامة ومصر الرقمية والمحاكم', 180, 380);
      ctx.fillText(`ألوان وأختام أصلية كاملة 100% • الحجم الأصلي: ~${sizeKB} KB • ضغط دقيق < 500 KB`, 180, 440);

      // خطوط نصوص قانونية واضحة
      ctx.fillStyle = '#0f172a';
      ctx.font = '30px Cairo, Arial';
      ctx.fillText('إنه في يوم الموافق / / قد حضر أمامنا نحن الموثق بالشهر العقاري:', 180, 540);
      ctx.fillText('السيد / المستشار القانوني وقرر توكيل الأستاذ / مصطفى فرويز المحامي في كافة القضايا...', 180, 600);

      // 1. رسم ختم النسر الرسمي الدائري بالأحمر القرمزي المعتمد (Red Seal)
      ctx.save();
      ctx.translate(1650, 800);
      ctx.strokeStyle = '#dc2626'; // أحمر قرمزي
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 140, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 120, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 22px Cairo, Arial';
      ctx.textAlign = 'center';
      ctx.fillText('جمهورية مصر العربية', 0, -60);
      ctx.fillText('★ وزارة العدل ★', 0, 0);
      ctx.fillText('خاتم شعار الجمهورية', 0, 60);
      ctx.restore();

      // 2. توقيع حي بالمداد الأزرق (Blue Ink Signature)
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(350, 850);
      ctx.bezierCurveTo(450, 750, 520, 950, 650, 820);
      ctx.bezierCurveTo(720, 780, 800, 890, 890, 800);
      ctx.stroke();

      ctx.fillStyle = '#1d4ed8';
      ctx.font = 'bold 28px Cairo, Arial';
      ctx.fillText('توقيع الموثق الرسمي المعتمد (مداد أزرق)', 380, 930);
      ctx.restore();

      // 3. دمغة نقابة المحامين / الشهر العقاري باللون الأخضر والذهبي
      ctx.save();
      ctx.fillStyle = '#047857';
      ctx.fillRect(180, 1050, 260, 140);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Cairo, Arial';
      ctx.fillText('دمغة محاماة رسمية', 210, 1130);
      ctx.restore();

      // تفاصيل محاكاة الحجم والورق عالي الكثافة
      for (let i = 0; i < 220; i++) {
        ctx.fillStyle = `hsla(${(i * 15) % 360}, 75%, 45%, 0.65)`;
        ctx.beginPath();
        ctx.arc(
          200 + Math.random() * 1800,
          700 + Math.random() * 750,
          Math.random() * 12 + 3,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    const blob = await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b!), 'image/jpeg', 0.98)
    );
    return new File([blob], `tawkeel_colored_${Date.now()}.jpg`, { type: 'image/jpeg' });
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleShareApp = async () => {
    const shareData = {
      title: 'تطبيق تصغير حجم الصور للمنظومة القضائية',
      text: 'زميلي العزيز المحامي ⚖️\nإليك تطبيق تصغير حجم الصور وملفات الـ PDF للمنظومة القضائية بحد أقصى 500 KB لتناسب اشتراطات النيابة ومصر الرقمية.\n• حفظ الصور مباشرة في المعرض (Gallery)\n• نافذة مشاركة سريعة لملفات الـ PDF\nتصميم وتنفيذ: مصطفى فرويز المحامي ⚖️',
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (e) {
        // Fallback to modal if cancelled or unsupported
      }
    }
    setIsShareAppModalOpen(true);
  };

  const handleCompressImageAction = async () => {
    const filesToCompress = selectedImagesForCompress.length > 0 
      ? selectedImagesForCompress 
      : (selectedImage ? [selectedImage] : []);
    
    if (filesToCompress.length === 0) return;

    setIsProcessingImage(true);
    const totalOriginalBytes = filesToCompress.reduce((acc, f) => acc + f.size, 0);

    if (isProgressIndicatorEnabled) {
      setShowProgressWidget(true);
      setCurrentProgress({
        stage: 'بدء تحليل وفحص الصور...',
        percent: 8,
        originalSize: totalOriginalBytes,
        currentSize: totalOriginalBytes,
        totalPages: filesToCompress.length,
        currentPage: 1,
        targetMax: 185 * 1024 * filesToCompress.length,
        detail: 'فحص الأختام والتباين ومعايير المنظومة',
      });
    }

    try {
      // ضغط الصور لتكون أقل من 200 KB مع الحفاظ الكامل على الألوان وترشيح عالي الدقة
      const results = await compressMultipleImagesClient(
        filesToCompress,
        185 * 1024,
        (progress) => {
          if (isProgressIndicatorEnabled) {
            setCurrentProgress(progress);
          }
        }
      );
      
      // حفظ / تنزيل فوري وتلقائي لكافة الصور في المعرض بدون نوافذ معلقة
      results.forEach((res) => {
        triggerDownload(res.blob, res.name);
      });

      if (results.length > 0) {
        setImageResult(results[0]);
      }

      confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });

      if (results.length === 1) {
        const kb = (results[0].compressedSize / 1024).toFixed(1);
        showSmartToast(`(تم الحفظ - الحجم: ${kb} KB)`, results[0].url, results[0].name);
      } else {
        const totalKb = (results.reduce((acc, r) => acc + r.compressedSize, 0) / 1024).toFixed(1);
        showSmartToast(`(تم حفظ ${results.length} صور - إجمالي: ${totalKb} KB)`, results[0].url, results[0].name);
      }

      // إبقاء المؤشر 3 ثوانٍ بعد الاكتمال لعرض الشفافية والنتيجة للمحامي
      setTimeout(() => {
        setShowProgressWidget(false);
      }, 3500);
    } catch (err: any) {
      showSmartToast(`❌ خطأ: ${err.message || 'فشل ضغط الصورة'}`);
      setShowProgressWidget(false);
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleCompressPdfAction = async () => {
    if (!selectedPdf) return;

    setIsProcessingPdf(true);
    if (isProgressIndicatorEnabled) {
      setShowProgressWidget(true);
      setCurrentProgress({
        stage: 'تحليل مستند الـ PDF واستخراج الصفحات...',
        percent: 10,
        originalSize: selectedPdf.size,
        currentSize: selectedPdf.size,
        targetMax: 470 * 1024,
        detail: 'تطبيق معيار 72-96 DPI لضمان نقاء الخطوط والأختام',
      });
    }

    try {
      // ضغط ملف الـ PDF ليكون أقل من 500 KB مع حفظ فوري
      const result = await compressPdfClient(
        selectedPdf,
        460 * 1024,
        (progress) => {
          if (isProgressIndicatorEnabled) {
            setCurrentProgress(progress);
          }
        }
      );
      setPdfResult(result);
      triggerDownload(result.blob, result.name);

      confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
      const kb = (result.compressedSize / 1024).toFixed(1);
      showSmartToast(`(تم الحفظ - الحجم: ${kb} KB)`, result.url, result.name);

      setTimeout(() => {
        setShowProgressWidget(false);
      }, 3500);
    } catch (err: any) {
      showSmartToast(`❌ خطأ: ${err.message || 'فشل ضغط ملف PDF'}`);
      setShowProgressWidget(false);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleMergeImagesAction = async () => {
    if (selectedImages.length === 0) return;

    setIsProcessingMerge(true);
    const totalBytes = selectedImages.reduce((acc, f) => acc + f.size, 0);

    if (isProgressIndicatorEnabled) {
      setShowProgressWidget(true);
      setCurrentProgress({
        stage: 'تجهيز صور المستند للدمج في PDF موحد...',
        percent: 10,
        originalSize: totalBytes,
        currentSize: totalBytes,
        targetMax: 470 * 1024,
        totalPages: selectedImages.length,
        currentPage: 1,
        detail: 'تطبيق مقاس A4 القياسي والألوان الكاملة 100%',
      });
    }

    try {
      // دمج الصور في PDF واحد بالألوان الكاملة وأقل من 500 KB مع حفظ فوري
      const result = await mergeImagesToPdfClient(
        selectedImages,
        460 * 1024,
        (progress) => {
          if (isProgressIndicatorEnabled) {
            setCurrentProgress(progress);
          }
        }
      );
      setMergedPdfResult(result);
      triggerDownload(result.blob, result.name);

      confetti({ particleCount: 45, spread: 70, origin: { y: 0.8 } });
      const kb = (result.compressedSize / 1024).toFixed(1);
      showSmartToast(`(تم الحفظ - الحجم: ${kb} KB)`, result.url, result.name);

      setTimeout(() => {
        setShowProgressWidget(false);
      }, 3500);
    } catch (err: any) {
      showSmartToast(`❌ خطأ: ${err.message || 'فشل دمج الصور'}`);
      setShowProgressWidget(false);
    } finally {
      setIsProcessingMerge(false);
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* إطار الهاتف الذكي التفاعلي */}
      <div className="relative w-[340px] sm:w-[380px] h-[720px] bg-slate-900 rounded-[48px] p-3 shadow-2xl shadow-blue-950/40 border-4 border-slate-700/80 ring-1 ring-slate-600/30 flex flex-col overflow-hidden select-none">
        
        {/* شريط الحالة */}
        <div className="relative z-20 flex items-center justify-between px-6 pt-2 pb-1 text-[11px] font-semibold text-slate-300">
          <span>10:30</span>
          <div className="w-24 h-4 bg-slate-950 rounded-full flex items-center justify-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800" />
            <div className="w-1.5 h-1.5 rounded-full bg-teal-500/40" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]">4G</span>
            <div className="w-5 h-2.5 border border-slate-400 rounded-sm p-0.5 flex items-center">
              <div className="h-full w-full bg-emerald-400 rounded-[1px]" />
            </div>
          </div>
        </div>

        {/* شاشة الهاتف الداخلية */}
        <div className="relative flex-1 bg-slate-50 text-slate-900 rounded-[38px] overflow-hidden flex flex-col">
          
          {/* شريط AppBar فلاتر: اسم التطبيق في العنوان الرئيسي وزر مشاركة التطبيق */}
          <div className="bg-[#1e3a8a] text-white px-3 sm:px-4 py-3 flex items-center justify-between shadow-sm z-10">
            {currentScreen !== 'home' ? (
              <button
                onClick={() => setCurrentScreen('home')}
                className="p-1 hover:bg-white/10 rounded-full text-white flex items-center gap-1 text-xs"
              >
                <ArrowRight size={18} />
                <span>رجوع</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Gavel size={17} className="text-amber-400 shrink-0" />
                <span className="font-bold text-xs tracking-tight">
                  تصغير حجم الصور للمنظومة
                </span>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              {/* زر مشاركة التطبيق مع الزملاء المحامين */}
              <button
                onClick={handleShareApp}
                className="px-2 py-1 bg-amber-400 hover:bg-amber-300 text-slate-900 rounded-full font-bold text-[10px] flex items-center gap-1 shadow-xs transition-all active:scale-95"
                title="مشاركة التطبيق"
              >
                <Share2 size={11} />
                <span>مشاركة</span>
              </button>

              <div className="text-[10px] bg-teal-500/20 text-teal-200 border border-teal-400/30 px-2 py-0.5 rounded-full font-semibold">
                متاح فوراً
              </div>
            </div>
          </div>

          {/* شريط التحكم السريع بمؤشر الشفافية (اختياري وصغير) */}
          <div className="bg-[#172554] text-slate-200 px-3 py-1 flex items-center justify-between text-[10px] border-b border-blue-900/60 z-10 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300">منظومة النيابة ومصر الرقمية</span>
            </div>
            <button
              onClick={() => {
                const nextState = !isProgressIndicatorEnabled;
                setIsProgressIndicatorEnabled(nextState);
                if (nextState) {
                  setShowProgressWidget(true);
                  if (!currentProgress) {
                    setCurrentProgress({
                      stage: 'جاهز لمراقبة عملية الضغط',
                      percent: 100,
                      originalSize: 1850 * 1024,
                      currentSize: 395 * 1024,
                      targetMax: 470 * 1024,
                      totalPages: 3,
                      currentPage: 3,
                      detail: 'يعرض الحجم اللحظي ونسبة الإنجاز بشفافية',
                    });
                  }
                  showFlutterToast('تم تفعيل مؤشر التقدم الشفاف الجانبي ✓');
                } else {
                  setShowProgressWidget(false);
                  showFlutterToast('تم إخفاء مؤشر التقدم الجانبي (اختياري)');
                }
              }}
              className={`px-2 py-0.5 rounded-md font-bold flex items-center gap-1 transition-all ${
                isProgressIndicatorEnabled
                  ? 'bg-teal-500/25 text-teal-300 border border-teal-400/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
              }`}
              title="تفعيل أو إلغاء مؤشر التقدم الجانبي الشفاف"
            >
              <Activity size={10} className={isProgressIndicatorEnabled ? 'text-teal-400 animate-pulse' : 'text-slate-400'} />
              <span>المؤشر الجانبي: {isProgressIndicatorEnabled ? 'مفعّل' : 'معطّل'}</span>
            </button>
          </div>

          {/* ==================== مؤشر التقدم التفاعلي (صغير وجانبي واختياري) ==================== */}
          {isProgressIndicatorEnabled && showProgressWidget && currentProgress && (
            <div
              className={`absolute top-20 right-2 z-40 transition-all duration-300 ${
                isProgressExpanded ? 'w-[230px]' : 'w-auto'
              }`}
            >
              {isProgressExpanded ? (
                /* البطاقة الجانبية المدمجة (Compact Side Card) */
                <div className="bg-slate-900/95 backdrop-blur-md border border-teal-500/40 rounded-2xl p-3 shadow-2xl text-right text-white space-y-2 animate-fade-in ring-1 ring-white/10">
                  {/* ترويسة المؤشر الجانبي مع أزرار التصغير والإغلاق الاختياري */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                          currentProgress.percent === 100 ? 'bg-emerald-400' : 'bg-teal-400'
                        }`} />
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${
                          currentProgress.percent === 100 ? 'bg-emerald-500' : 'bg-teal-500'
                        }`} />
                      </span>
                      <span className="font-bold text-[11px] text-teal-300 flex items-center gap-1">
                        <Activity size={11} />
                        <span>مؤشر الشفافية</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* زر التصغير لشريط مصغر جانبي */}
                      <button
                        onClick={() => setIsProgressExpanded(false)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                        title="تصغير المؤشر"
                      >
                        <Minimize2 size={11} />
                      </button>
                      {/* زر الإغلاق الاختياري للمحامي */}
                      <button
                        onClick={() => setShowProgressWidget(false)}
                        className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-red-300 transition-colors"
                        title="إخفاء المؤشر (اختياري)"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>

                  {/* النسبة المئوية لإتمام الضغط وشريط التقدم */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-slate-300 font-semibold text-[10px]">نسبة الإنجاز:</span>
                      <span className="font-bold font-mono text-teal-300 bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-500/30 text-[11px]">
                        {currentProgress.percent}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/60">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          currentProgress.percent === 100
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                            : 'bg-gradient-to-r from-blue-500 via-teal-400 to-emerald-400'
                        }`}
                        style={{ width: `${currentProgress.percent}%` }}
                      />
                    </div>
                  </div>

                  {/* الحجم الحالي للملف مقارنة بالحجم الأصلي (عرض مباشر للشفافية) */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2 space-y-1">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="text-slate-400">الحجم الحالي:</span>
                      <span className="font-bold font-mono text-emerald-400">
                        {formatFileSize(currentProgress.currentSize)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-500">الحجم الأصلي:</span>
                      <span className="font-mono text-slate-400 line-through">
                        {formatFileSize(currentProgress.originalSize)}
                      </span>
                    </div>
                    <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-[9.5px]">
                      <span className="text-slate-400">الحد الأقصى:</span>
                      <span className="text-amber-300 font-semibold font-mono">
                        &lt; {currentProgress.targetMax ? formatFileSize(currentProgress.targetMax) : '500 KB'}
                      </span>
                    </div>
                  </div>

                  {/* مرحلة المعالجة والشفافية الحالية */}
                  <div className="text-[10px] text-slate-300 bg-slate-800/50 p-1.5 rounded-lg border border-slate-700/40">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-bold text-teal-400 truncate max-w-[130px]">
                        {currentProgress.stage}
                      </span>
                      {currentProgress.totalPages && (
                        <span className="text-[9px] bg-slate-700 text-slate-200 px-1 py-0.2 rounded font-mono">
                          {currentProgress.currentPage || 1}/{currentProgress.totalPages}
                        </span>
                      )}
                    </div>
                    {currentProgress.detail && (
                      <p className="text-[9px] text-slate-400 leading-tight">
                        {currentProgress.detail}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* الشريط المصغر الجانبي (Mini Pill) */
                <button
                  onClick={() => setIsProgressExpanded(true)}
                  className="bg-slate-900/95 hover:bg-slate-800 text-white border border-teal-500/50 hover:border-teal-400 rounded-full px-2.5 py-1.5 shadow-xl flex items-center gap-1.5 text-[10.5px] backdrop-blur-md transition-all active:scale-95 animate-fade-in group"
                  title="توسيع مؤشر الشفافية"
                >
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                  <span className="font-bold font-mono text-teal-300">{currentProgress.percent}%</span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    {formatFileSize(currentProgress.currentSize)}
                  </span>
                  <ChevronDown size={12} className="text-teal-400 group-hover:translate-y-0.5 transition-transform" />
                </button>
              )}
            </div>
          )}

          {/* زر عائم جانبي لعرض مؤشر التقدم الشفاف في أي وقت */}
          {isProgressIndicatorEnabled && (!showProgressWidget || !currentProgress) && (
            <button
              onClick={() => {
                setShowProgressWidget(true);
                if (!currentProgress) {
                  setCurrentProgress({
                    stage: 'جاهز لعرض مؤشر الشفافية',
                    percent: 100,
                    originalSize: 1850 * 1024,
                    currentSize: 395 * 1024,
                    targetMax: 470 * 1024,
                    totalPages: 3,
                    currentPage: 3,
                    detail: 'يعرض الحجم اللحظي ونسبة الإنجاز بدقة 72-96 DPI',
                  });
                }
              }}
              className="absolute top-24 -right-1 z-30 bg-blue-900/90 hover:bg-blue-800 text-teal-300 border border-teal-500/40 rounded-l-xl px-1 py-2 shadow-lg flex flex-col items-center gap-1 text-[9px] font-bold transition-transform hover:translate-x-0"
              title="عرض مؤشر التقدم الجانبي"
            >
              <Activity size={12} className="text-teal-400 animate-pulse" />
              <span className="[writing-mode:vertical-rl] tracking-tighter">مؤشر التقدم</span>
            </button>
          )}

          {/* محتوى الشاشات */}
          <div className="flex-1 overflow-y-auto p-4 text-right">
            
            {/* الشاشة الرئيسية المباشرة فور فتح التطبيق */}
            {currentScreen === 'home' && (
              <div className="space-y-4 animate-fade-in pb-2">
                {/* بطاقة الترحيب العلوية */}
                <div className="bg-gradient-to-br from-[#1e3a8a] via-[#1e40af] to-[#0f172a] text-white rounded-2xl p-3.5 shadow-md shadow-blue-900/30">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1 bg-teal-500/20 text-teal-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-teal-500/30">
                      <ShieldCheck size={11} />
                      <span>بدون تسجيل دخول • حفظ مباشر بالتنزيلات</span>
                    </span>
                    <Scale size={15} className="text-amber-300" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold mb-0.5">
                    أهلاً بك زميلي العزيز المحامي ⚖️
                  </h3>
                  <p className="text-[11px] text-blue-100 leading-normal">
                    ضغط مباشر لملفات النيابة ومحكمة الأسرة ومصر الرقمية بدون إعلانات وبأعلى دقة.
                  </p>
                </div>

                {/* ==================== أ) الأزرار الثلاثة في منتصف الشاشة ==================== */}
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-700 px-1 flex items-center justify-between">
                    <span>أدوات ضغط وتحويل المستندات:</span>
                    <span className="text-[10px] text-blue-700 font-semibold">تنزيل مباشر في Downloads</span>
                  </div>

                  {/* 1. تصغير حجم الصور (صورة أو أكثر < 200 KB) */}
                  <button
                    onClick={() => setCurrentScreen('compress_image')}
                    className="w-full bg-white hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-2xl p-3 flex items-start gap-3 transition-all text-right shadow-xs active:scale-[0.99] group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 shrink-0 group-hover:scale-105 transition-transform">
                      <FileImage size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-xs text-slate-800">تصغير حجم الصور (صورة أو أكثر)</span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">
                          &lt; 200 KB
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 leading-tight">
                        ضغط صور التوكيلات والبطاقات (واحدة أو أكثر دفعة واحدة) لتصبح أقل من 200 KB وحفظها فوراً بالمعرض.
                      </p>
                    </div>
                  </button>

                  {/* 2. تصغير حجم ملف PDF (بحد أقصى 500 KB) */}
                  <button
                    onClick={() => setCurrentScreen('compress_pdf')}
                    className="w-full bg-white hover:bg-orange-50/60 border border-slate-200 hover:border-orange-300 rounded-2xl p-3 flex items-start gap-3 transition-all text-right shadow-xs active:scale-[0.99] group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 shrink-0 group-hover:scale-105 transition-transform">
                      <FileText size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-xs text-slate-800">تصغير حجم ملف PDF</span>
                        <span className="text-[10px] bg-orange-100 text-orange-700 font-bold px-1.5 py-0.5 rounded">
                          &lt; 500 KB
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 leading-tight">
                        تقليص عرائض الدعاوى مع الحفاظ التام على الألوان والأختام وحدّة الخطوط (أقل من 500 KB).
                      </p>
                    </div>
                  </button>

                  {/* 3. دمج الصور في ملف pdf واحد (< 500 KB) */}
                  <button
                    onClick={() => setCurrentScreen('merge_images')}
                    className="w-full bg-white hover:bg-emerald-50/60 border border-slate-200 hover:border-emerald-300 rounded-2xl p-3 flex items-start gap-3 transition-all text-right shadow-xs active:scale-[0.99] group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0 group-hover:scale-105 transition-transform">
                      <Files size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-xs text-slate-800">دمج الصور في ملف pdf واحد</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded">
                          &lt; 500 KB
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 leading-tight">
                        دمج أوراق الحافظة والمحاضر بالألوان الأصلية ودقة A4 حادة بدون تشويش أو تبكسل (&lt; 500 KB).
                      </p>
                    </div>
                  </button>

                  {/* 4. مسح ضوئي بالكاميرا المباشرة (Scanner) */}
                  <button
                    onClick={() => startCameraScanner('image')}
                    className="w-full bg-gradient-to-r from-teal-50 to-emerald-50 hover:from-teal-100/70 hover:to-emerald-100/70 border border-teal-200/80 hover:border-teal-300 rounded-2xl p-3 flex items-start gap-3 transition-all text-right shadow-xs active:scale-[0.99] group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-teal-600 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform shadow-sm">
                      <Camera size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-xs text-teal-950 flex items-center gap-1.5">
                          <span>مسح ضوئي للمستند بالكاميرا</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                        </span>
                        <span className="text-[10px] bg-teal-200/80 text-teal-900 font-bold px-1.5 py-0.5 rounded">
                          كاميرا حية 📸
                        </span>
                      </div>
                      <p className="text-[10.5px] text-teal-700 leading-tight">
                        التقاط صور التوكيلات والمذكرات مباشرة بكاميرا الهاتف وتمريرها فوراً للضغط لضمان أعلى جودة بدون فقد للتفاصيل.
                      </p>
                    </div>
                  </button>
                </div>

                {/* ==================== ب) المربع الأزرق المميز في أسفل الشاشة ==================== */}
                <div className="pt-2">
                  <div className="rounded-2xl shadow-lg shadow-blue-900/30 overflow-hidden border-2 border-blue-400/80">
                    <button
                      onClick={() => setCurrentScreen('legal_portals')}
                      className="w-full bg-gradient-to-r from-[#1e3a8a] via-[#1d4ed8] to-[#2563eb] hover:from-[#1e40af] hover:to-[#1d4ed8] text-white p-4 flex items-center gap-3.5 text-right transition-all group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform shadow-inner">
                        <Globe size={26} className="text-amber-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-xs sm:text-sm text-white leading-tight">
                          تسجيل الدخول لموقع النيابة ومحكمة الأسرة ومصر الرقمية
                        </h4>
                        <p className="text-[10.5px] text-blue-100 mt-1 flex items-center gap-1">
                          <span>اضغط هنا لفتح قائمة الـ 10 مواقع القضائية الرسمية</span>
                        </p>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                        <ArrowRight size={14} className="rotate-180 text-white" />
                      </div>
                    </button>
                  </div>
                </div>

                {/* شريط معلومات حفظ المعرض والمشاركة */}
                <div className="bg-slate-100 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2 text-[10.5px] text-slate-600">
                  <FolderDown size={15} className="text-blue-700 shrink-0" />
                  <span>الصور تُحفظ تلقائياً في المعرض (Gallery) • والـ PDF في التنزيلات (Downloads)</span>
                </div>

                {/* ==================== تعديل مكان ومظهر اسم المصمم في الفوتر ==================== */}
                <div className="text-center py-2.5 pt-3 text-[11px] font-semibold text-slate-400 border-t border-slate-200/70 mt-2">
                  <span>تصميم وتنفيذ: مصطفى فرويز المحامي ⚖️</span>
                </div>
              </div>
            )}

            {/* شاشة قائمة الـ 10 مواقع القضائية المرقمة رأسياً من 1 إلى 10 */}
            {currentScreen === 'legal_portals' && (
              <div className="space-y-3 animate-fade-in pb-2">
                <div className="bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] text-white rounded-2xl p-3 shadow-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe size={16} className="text-amber-300" />
                    <h3 className="font-bold text-xs">
                      مواقع النيابة ومحكمة الأسرة ومصر الرقمية (10 مواقع)
                    </h3>
                  </div>
                  <p className="text-[10px] text-blue-100 leading-normal">
                    قائمة بالروابط الرسمية المباشرة لرفع ومتابعة قضاياك بعد ضغط المستندات:
                  </p>
                </div>

                {/* قائمة متتالية رأسية مرقمة من 1 إلى 10 */}
                <div className="space-y-2">
                  {legalPortals.map((portal, index) => {
                    const itemNumber = index + 1;
                    return (
                      <div
                        key={portal.id}
                        onClick={() => openPortalUrl(portal.url, portal.title)}
                        className="bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-2.5 flex items-center gap-2.5 shadow-xs hover:shadow-md transition-all cursor-pointer active:scale-[0.99] group"
                      >
                        {/* 1. رقم الترتيب من 1 إلى 10 */}
                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#1e3a8a] to-blue-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0 shadow-xs">
                          {itemNumber}
                        </div>

                        {/* 2. أيقونة معبرة */}
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          {portal.icon}
                        </div>

                        {/* 3. اسم الجهة ونبذة قصيرة */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-xs text-slate-800 truncate">
                            {portal.title}
                          </h4>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            {portal.category}
                          </p>
                        </div>

                        {/* 4. زر فتح الرابط */}
                        <div className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition-colors shrink-0">
                          <span>دخول</span>
                          <ExternalLink size={10} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* أ) شاشة ضغط الصور (صورة أو أكثر < 200 KB) */}
            {currentScreen === 'compress_image' && (
              <div className="space-y-3 animate-fade-in">
                <input
                  type="file"
                  ref={imageInputRef}
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files ? Array.from(e.target.files) : [];
                    if (files.length > 0) {
                      setSelectedImagesForCompress(files);
                      setSelectedImage(files[0]);
                      setImagePreview(URL.createObjectURL(files[0]));
                      setImageResult(null);
                    }
                  }}
                />

                {!selectedImage && selectedImagesForCompress.length === 0 ? (
                  <div className="border-2 border-dashed border-blue-200 bg-blue-50/40 rounded-2xl p-5 text-center">
                    <div className="w-12 h-12 mx-auto rounded-full bg-blue-100 flex items-center justify-center text-blue-700 mb-2.5">
                      <Upload size={22} />
                    </div>
                    <h4 className="font-bold text-xs text-slate-800 mb-1">
                      اختر صورة أو عدة صور للمستندات
                    </h4>
                    <p className="text-[10px] text-slate-500 mb-3">
                      سيتم ضغطها بدقة فائقة لتصبح <strong>أقل من 200 KB</strong> وحفظها فوراً في معرض الصور (Gallery)
                    </p>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => imageInputRef.current?.click()}
                        className="w-full py-2.5 bg-[#1e3a8a] hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <Upload size={14} />
                        <span>اختيار صورة أو عدة صور دفعة واحدة</span>
                      </button>
                      <button
                        onClick={() => startCameraScanner('image')}
                        className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <Camera size={15} />
                        <span>مسح ضوئي بكاميرا الهاتف (Scan)</span>
                      </button>
                      <button
                        onClick={async () => {
                          const sample = await generateSampleImage('توكيل رسمي عام في القضايا', 1800);
                          setSelectedImagesForCompress([sample]);
                          setSelectedImage(sample);
                          setImagePreview(URL.createObjectURL(sample));
                          setImageResult(null);
                        }}
                        className="w-full py-2 bg-white border border-blue-200 text-blue-800 rounded-xl text-xs font-semibold hover:bg-blue-50"
                      >
                        ⚡ تجربة نموذج توكيل ملون (ألوان وأختام كاملة)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* عرض الصور المحددة (صورة واحدة أو أكثر في الأمر الواحد) */}
                    {selectedImagesForCompress.length > 1 ? (
                      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">
                            الصور المحددة للضغط ({selectedImagesForCompress.length} صور):
                          </span>
                          <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                            أقل من 200 KB لكل صورة
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-100">
                          {selectedImagesForCompress.map((img, idx) => (
                            <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-white border border-slate-200">
                              <img
                                src={URL.createObjectURL(img)}
                                alt={`img-${idx}`}
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1 rounded">
                                {(img.size / 1024).toFixed(0)} KB
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
                          <span>إجمالي الحجم الأصلي:</span>
                          <span className="font-bold text-slate-700">
                            {formatFileSize(selectedImagesForCompress.reduce((acc, f) => acc + f.size, 0))}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                        {imagePreview && (
                          <div className="relative h-36 bg-slate-100 overflow-hidden">
                            <img
                              src={imageResult ? imageResult.url : imagePreview}
                              alt="preview"
                              className="w-full h-full object-contain"
                            />
                            {imageResult && (
                              <span className="absolute top-2 left-2 bg-teal-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                                جاهزة ومضغوطة للمنظومة!
                              </span>
                            )}
                          </div>
                        )}

                        <div className="p-3">
                          <div className="text-xs font-bold text-slate-800 truncate mb-1">
                            {selectedImage ? selectedImage.name : 'مستند الصورة'}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-100">
                            <div>
                              <span className="text-slate-400 block text-[10px]">الحجم الأصلي:</span>
                              <span className="font-bold text-slate-700">
                                {selectedImage ? formatFileSize(selectedImage.size) : '0 B'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">الحجم المطلوب:</span>
                              <span className="font-bold text-teal-700">
                                {imageResult ? formatFileSize(imageResult.compressedSize) : 'أقل من 200 KB'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => imageInputRef.current?.click()}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-1"
                      >
                        <RefreshCw size={12} />
                        <span>اختيار صور أخرى</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedImage(null);
                          setSelectedImagesForCompress([]);
                          setImagePreview(null);
                          setImageResult(null);
                        }}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <button
                      disabled={isProcessingImage}
                      onClick={handleCompressImageAction}
                      className="w-full py-2.5 bg-[#1e3a8a] hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-900/25 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isProcessingImage ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>
                            {selectedImagesForCompress.length > 1
                              ? `جاري ضغط وحفظ ${selectedImagesForCompress.length} صور في المعرض...`
                              : 'جاري الضغط والحفظ في المعرض...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Download size={14} />
                          <span>
                            {selectedImagesForCompress.length > 1
                              ? `ضغط وحفظ (${selectedImagesForCompress.length} صور) في المعرض (< 200 KB)`
                              : 'ضغط وحفظ في معرض الصور (Gallery)'}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ب) شاشة ضغط ملف الـ PDF لأقل من 500 KB */}
            {currentScreen === 'compress_pdf' && (
              <div className="space-y-3 animate-fade-in">
                <input
                  type="file"
                  ref={pdfInputRef}
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setSelectedPdf(f);
                      setPdfResult(null);
                    }
                  }}
                />

                {!selectedPdf ? (
                  <div className="border-2 border-dashed border-orange-200 bg-orange-50/40 rounded-2xl p-5 text-center">
                    <div className="w-12 h-12 mx-auto rounded-full bg-orange-100 flex items-center justify-center text-orange-600 mb-2.5">
                      <FileText size={22} />
                    </div>
                    <h4 className="font-bold text-xs text-slate-800 mb-1">
                      اختر ملف PDF لتصغير حجمه
                    </h4>
                    <p className="text-[10px] text-slate-500 mb-3">
                      تقليص صفحات المذكرات والشكاوى لتصبح <strong>أقل من 500 KB</strong>
                    </p>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => pdfInputRef.current?.click()}
                        className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                      >
                        اختيار ملف PDF
                      </button>
                      <button
                        onClick={async () => {
                          const sampleImg = await generateSampleImage('عريضة دعوى وصحيفة استئناف', 1200);
                          const sampleMerged = await mergeImagesToPdfClient([sampleImg], 480 * 1024);
                          const samplePdf = new File([sampleMerged.blob], 'areeda_sample_large.pdf', {
                            type: 'application/pdf',
                          });
                          setSelectedPdf(samplePdf);
                          setPdfResult(null);
                        }}
                        className="w-full py-2 bg-white border border-orange-200 text-orange-700 rounded-xl text-xs font-semibold hover:bg-orange-50"
                      >
                        ⚡ تجربة ملف PDF عريضة دعوى
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs">
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                          <FileText size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate">
                            {selectedPdf.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            الحجم الحالي: {formatFileSize(selectedPdf.size)}
                          </div>
                        </div>
                      </div>

                      {pdfResult && (
                        <div className="bg-teal-50 border border-teal-200 rounded-xl p-2 flex items-center justify-between text-xs font-bold text-teal-800">
                          <span>الحجم بعد الضغط:</span>
                          <span>{formatFileSize(pdfResult.compressedSize)} (أقل من 500 KB)</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => pdfInputRef.current?.click()}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-1"
                      >
                        <RefreshCw size={12} />
                        <span>اختيار ملف آخر</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedPdf(null);
                          setPdfResult(null);
                        }}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <button
                      disabled={isProcessingPdf}
                      onClick={handleCompressPdfAction}
                      className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/25 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isProcessingPdf ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>جاري تقليص الـ PDF وحفظه...</span>
                        </>
                      ) : (
                        <>
                          <Download size={14} />
                          <span>ضغط وحفظ مباشر بالتنزيلات (&lt; 500 KB)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ج) شاشة دمج الصور في ملف PDF واحد (<500KB) */}
            {currentScreen === 'merge_images' && (
              <div className="space-y-3 animate-fade-in">
                <input
                  type="file"
                  ref={multiImagesInputRef}
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) {
                      setSelectedImages((prev) => [...prev, ...files]);
                      setMergedPdfResult(null);
                    }
                  }}
                />

                {selectedImages.length === 0 ? (
                  <div className="border-2 border-dashed border-emerald-200 bg-emerald-50/40 rounded-2xl p-5 text-center">
                    <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2.5">
                      <Files size={22} />
                    </div>
                    <h4 className="font-bold text-xs text-slate-800 mb-1">
                      دمج صور المحضر في ملف PDF واحد
                    </h4>
                    <p className="text-[10px] text-slate-500 mb-3">
                      اختر عدة صور لحافظة المستندات لدمجها في ملف موحد <strong>أقل من 500 KB</strong>
                    </p>

                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => multiImagesInputRef.current?.click()}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <Upload size={14} />
                        <span>اختيار صور من جهازك</span>
                      </button>
                      <button
                        onClick={() => startCameraScanner('pdf_merge')}
                        className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <Camera size={15} />
                        <span>مسح ورقة جديدة بالكاميرا (Scan)</span>
                      </button>
                      <button
                        onClick={async () => {
                          const img1 = await generateSampleImage('ورقة محضر جنحة رقم 1', 1100);
                          const img2 = await generateSampleImage('ورقة توكيل رسمي عام رقم 2', 1200);
                          const img3 = await generateSampleImage('شهادة إدارية رسمية رقم 3', 1300);
                          setSelectedImages([img1, img2, img3]);
                          setMergedPdfResult(null);
                        }}
                        className="w-full py-2 bg-white border border-emerald-200 text-emerald-700 rounded-xl text-xs font-semibold hover:bg-emerald-50"
                      >
                        ⚡ إضافة 3 أوراق حافظة مستندات نموذجية
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        الصور المحددة ({selectedImages.length}):
                      </span>
                      <button
                        onClick={() => multiImagesInputRef.current?.click()}
                        className="text-[11px] text-emerald-600 font-bold hover:underline"
                      >
                        + إضافة المزيد
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1 bg-white border border-slate-200 rounded-2xl">
                      {selectedImages.map((img, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 group"
                        >
                          <img
                            src={URL.createObjectURL(img)}
                            alt="thumb"
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1 rounded">
                            ورقة {idx + 1}
                          </span>
                          <button
                            onClick={() =>
                              setSelectedImages((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="absolute top-1 left-1 bg-rose-600 text-white p-0.5 rounded-full shadow"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {mergedPdfResult && (
                      <div className="bg-teal-50 border border-teal-200 rounded-xl p-2 flex items-center justify-between text-xs font-bold text-teal-800">
                        <span>تم دمج الـ PDF وحفظه:</span>
                        <span>{formatFileSize(mergedPdfResult.compressedSize)} (&lt; 500 KB)</span>
                      </div>
                    )}

                    <button
                      disabled={isProcessingMerge}
                      onClick={handleMergeImagesAction}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/25 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isProcessingMerge ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>جاري الدمج والحفظ بالتنزيلات...</span>
                        </>
                      ) : (
                        <>
                          <Download size={14} />
                          <span>دمج وحفظ في Downloads (&lt; 500 KB)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* شريط الإشعار Snackbar */}
          {snackBarMessage && (
            <div className="mx-3 mb-2 bg-slate-900 text-white text-[11px] p-2.5 rounded-xl shadow-xl border border-slate-800 flex items-center justify-between animate-fade-in z-20">
              <span className="truncate">{snackBarMessage}</span>
              <button
                onClick={() => setSnackBarMessage(null)}
                className="text-blue-400 font-bold text-[10px] ml-2 shrink-0"
              >
                حسناً
              </button>
            </div>
          )}

          {/* ==================== نافذة مشاركة وحفظ الـ PDF المباشرة (Save/Share Sheet) ==================== */}
          {pdfShareModal && (
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-end justify-center z-50 animate-fade-in">
              <div className="w-full bg-white rounded-t-3xl p-4 text-slate-900 space-y-3.5 shadow-2xl border-t border-slate-200 animate-slide-up">
                <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-1" />

                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 text-[10px] font-bold px-2 py-0.5 rounded-full mb-1">
                      <Check size={11} />
                      <span>جاهز ومضغوط للمنظومة (&lt; 500 KB)</span>
                    </span>
                    <h3 className="font-bold text-xs sm:text-sm text-slate-900">
                      حفظ أو إرسال ملف الـ PDF إلى المنظومة
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      الحجم النهائي: {formatFileSize(pdfShareModal.size)}
                    </p>
                  </div>
                  <button
                    onClick={() => setPdfShareModal(null)}
                    className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {/* 1. حفظ في ملفات الهاتف */}
                  <button
                    onClick={() => {
                      triggerDownload(pdfShareModal.blob, pdfShareModal.name);
                      showFlutterToast('✅ تم بدء حفظ ملف الـ PDF في جهازك!');
                    }}
                    className="p-2.5 bg-blue-50 hover:bg-blue-100/80 border border-blue-200 text-blue-900 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all text-center"
                  >
                    <Download size={18} className="text-blue-700" />
                    <span className="text-[11px] font-bold">حفظ في الملفات</span>
                  </button>

                  {/* 2. إرسال عبر واتساب */}
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `تم ضغط مستند الـ PDF بنجاح بحجم ${formatFileSize(
                        pdfShareModal.size
                      )} (< 500 KB) جاهزاً للرفع على المنظومة القضائية.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-900 rounded-xl flex flex-col items-center justify-center gap-1.5 transition-all text-center"
                  >
                    <Send size={18} className="text-emerald-700" />
                    <span className="text-[11px] font-bold">إرسال عبر واتساب</span>
                  </a>
                </div>

                {/* 3. مشاركة النظام المباشرة */}
                <button
                  onClick={async () => {
                    if (navigator.share) {
                      try {
                        const file = new File([pdfShareModal.blob], pdfShareModal.name, {
                          type: 'application/pdf',
                        });
                        await navigator.share({
                          title: 'مستند المنظومة المضغوط',
                          files: [file],
                        });
                        return;
                      } catch (_) {}
                    }
                    triggerDownload(pdfShareModal.blob, pdfShareModal.name);
                    showFlutterToast('✅ تم تنزيل الملف لمشاركته مع التطبيقات!');
                  }}
                  className="w-full py-2.5 bg-gradient-to-r from-[#1e3a8a] to-blue-700 hover:from-blue-900 hover:to-blue-800 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-900/20 flex items-center justify-center gap-2"
                >
                  <Share2 size={14} />
                  <span>مشاركة فورية (System Share Sheet)</span>
                </button>

                <button
                  onClick={() => setPdfShareModal(null)}
                  className="w-full py-1.5 text-slate-500 hover:text-slate-800 text-[11px] font-medium"
                >
                  إغلاق
                </button>
              </div>
            </div>
          )}

          {/* ==================== نافذة مشاركة التطبيق مع الزملاء المحامين ==================== */}
          {isShareAppModalOpen && (
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
              <div className="w-full max-w-[320px] bg-white rounded-2xl p-4 text-slate-900 space-y-3 shadow-2xl border border-slate-200 animate-scale-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-900 flex items-center justify-center font-bold">
                      <Share2 size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">مشاركة التطبيق مع الزملاء</h4>
                      <p className="text-[10px] text-slate-500">تصميم: مصطفى فرويز المحامي</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsShareAppModalOpen(false)}
                    className="p-1 hover:bg-slate-100 rounded-full text-slate-400"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[10.5px] text-slate-700 leading-relaxed text-right">
                  تطبيق 'تصغير حجم الصور للمنظومة' (بحد أقصى 500 KB) للمحامين • فتح فوري بدون تسجيل دخول وبدون إعلانات.
                </div>

                <div className="space-y-2">
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `زميلي العزيز المحامي ⚖️\nإليك تطبيق تصغير حجم الصور وملفات الـ PDF للمنظومة القضائية (بحد أقصى 500 KB).\n• حفظ مباشر في المعرض\n• نافذة مشاركة سريعة\nتصميم وتنفيذ: مصطفى فرويز المحامي ⚖️\n${window.location.href}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <Send size={13} />
                    <span>إرسال عبر واتساب (WhatsApp)</span>
                  </a>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `تطبيق تصغير حجم الصور والـ PDF للمنظومة القضائية (بحد أقصى 500 KB) - تصميم وتنفيذ: مصطفى فرويز المحامي ⚖️\n${window.location.href}`
                      );
                      setCopiedShareText(true);
                      setTimeout(() => setCopiedShareText(false), 3000);
                    }}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
                  >
                    {copiedShareText ? <Check size={13} className="text-teal-600" /> : <Share2 size={13} />}
                    <span>{copiedShareText ? 'تم نسخ الرابط بنجاح!' : 'نسخ رابط ورسالة التطبيق'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== رسالة الـ 3 ثوانٍ الذكية العائمة مع زر [ فتح ] ==================== */}
          {smartToast.show && (
            <div className="absolute bottom-7 left-3 right-3 z-50 animate-fade-in bg-slate-900/95 backdrop-blur-xs text-white border border-slate-700/80 rounded-2xl p-2.5 shadow-2xl flex items-center justify-between gap-2.5">
              <div className="flex-1 min-w-0 text-xs font-bold text-slate-100 truncate text-right">
                {smartToast.message}
              </div>
              {smartToast.fileUrl && (
                <button
                  onClick={() => {
                    window.open(smartToast.fileUrl, '_blank');
                    setSmartToast({ show: false, message: '' });
                  }}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shrink-0 shadow-md active:scale-95 transition-all"
                >
                  فتح
                </button>
              )}
            </div>
          )}

          {/* ==================== واجهة المسح الضوئي المباشر بكاميرا الهاتف (Camera Scanner) ==================== */}
          {isScannerOpen && (
            <div className="absolute inset-0 bg-slate-950 z-50 flex flex-col animate-fade-in text-white">
              {/* شريط أدوات الكاميرا العلوي */}
              <div className="p-3 bg-slate-900/90 backdrop-blur-md flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                  <span className="font-bold text-xs">
                    {scannerTarget === 'image' ? 'ماسح ضوئي للمستندات (صورة)' : 'مسح ورقة لملف الـ PDF'}
                  </span>
                </div>
                <button
                  onClick={stopCameraScanner}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-full text-xs font-semibold"
                >
                  إلغاء ✕
                </button>
              </div>

              {/* شاشة الكاميرا المباشرة مع إطار توجيه المستند */}
              <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* إطار المسح الضوئي التوجيهي (Scanner Viewfinder Frame) */}
                <div className="absolute inset-4 border-2 border-dashed border-teal-400/80 rounded-2xl pointer-events-none flex flex-col justify-between p-3 bg-teal-500/5">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] bg-teal-900/80 text-teal-200 px-2 py-0.5 rounded-md font-mono">
                      A4 Document Guide
                    </span>
                    <Scan size={18} className="text-teal-400 animate-pulse" />
                  </div>

                  <div className="text-center text-[11px] text-teal-200/90 bg-slate-900/80 py-1 px-3 rounded-full mx-auto backdrop-blur-xs">
                    ضع أختام وتفاصيل المستند داخل الإطار الأخضر
                  </div>
                </div>
              </div>

              {/* شريط التحكم السفلي وزر الالتقاط */}
              <div className="p-4 bg-slate-900/90 backdrop-blur-md flex items-center justify-around border-t border-slate-800">
                <button
                  onClick={async () => {
                    // تجربة نموذج عالي الدقة بدون كاميرا إذا كان المستخدم على لابتوب بدون كاميرا
                    const sample = await generateSampleImage('توكيل رسمي ممسوح ضوئياً', 1800);
                    stopCameraScanner();
                    if (scannerTarget === 'image') {
                      setSelectedImagesForCompress([sample]);
                      setSelectedImage(sample);
                      setImagePreview(URL.createObjectURL(sample));
                      setImageResult(null);
                      setCurrentScreen('compress_image');
                    } else {
                      setSelectedImages((prev) => [...prev, sample]);
                      setMergedPdfResult(null);
                      setCurrentScreen('merge_images');
                    }
                    showFlutterToast('⚡ تم مسح نموذج مستند رسمي بنجاح!');
                  }}
                  className="text-[10px] text-slate-400 hover:text-white bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700"
                >
                  نموذج تجريبي
                </button>

                {/* زر التقاط المستند (Shutter Button) */}
                <button
                  onClick={captureScannedDocument}
                  className="w-14 h-14 rounded-full bg-white border-4 border-teal-500 flex items-center justify-center shadow-lg shadow-teal-500/40 active:scale-90 transition-transform"
                  title="التقاط المستند"
                >
                  <div className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white">
                    <Camera size={20} />
                  </div>
                </button>

                <div className="text-[10px] text-teal-300 font-semibold text-center">
                  دقة نقية 100%<br />بدون فقد للألوان
                </div>
              </div>
            </div>
          )}

          {/* شريط التنقل السفلي */}
          <div className="h-5 flex items-center justify-center bg-white border-t border-slate-100">
            <div className="w-24 h-1 bg-slate-300 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};
