import React, { useState, useRef, useEffect } from 'react';
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
  CheckCircle2,
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
  Pencil,
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
import { DocumentScannerView } from './DocumentScannerView';

type ScreenType =
  | 'home'
  | 'compress_image'
  | 'compress_pdf'
  | 'merge_images'
  | 'document_scanner'
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

export const DevScannerSimulator: React.FC = () => {
  // يفتح التطبيق مباشرة على الشاشة الرئيسية فوراً بدون أي تسجيل دخول
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');

  // حالة ضغط الصور (صورة أو أكثر < 500 KB)
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

  // مربع حوار تأكيد الحفظ المركزي (3 ثوانٍ تلقائياً مع إغلاق يدوي × وزر فتح الملف)
  const [smartToast, setSmartToast] = useState<{
    show: boolean;
    message: string;
    sizeDetail?: string;
    fileType?: 'image' | 'document';
    fileUrl?: string;
    fileName?: string;
  }>({ show: false, message: '' });
  const smartToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogTokenRef = useRef<number>(0);

  const dismissSaveConfirmationDialog = () => {
    dialogTokenRef.current += 1;
    if (smartToastTimerRef.current) {
      clearTimeout(smartToastTimerRef.current);
      smartToastTimerRef.current = null;
    }
    setSmartToast({ show: false, message: '' });
  };

  useEffect(() => {
    return () => {
      if (smartToastTimerRef.current) {
        clearTimeout(smartToastTimerRef.current);
      }
    };
  }, []);

  const showSmartToast = (
    sizeDetail: string,
    fileUrl?: string,
    fileName?: string,
    fileType: 'image' | 'document' = 'document'
  ) => {
    if (!fileUrl) return;
    if (smartToastTimerRef.current) {
      clearTimeout(smartToastTimerRef.current);
      smartToastTimerRef.current = null;
    }
    const token = ++dialogTokenRef.current;
    const locationMessage =
      fileType === 'image'
        ? 'تم الحفظ في الاستوديو بنجاح'
        : 'تم الحفظ في مجلد التنزيلات (Downloads) بنجاح';

    setSmartToast({
      show: true,
      message: locationMessage,
      sizeDetail,
      fileType,
      fileUrl,
      fileName,
    });

    smartToastTimerRef.current = setTimeout(() => {
      if (dialogTokenRef.current === token) {
        setSmartToast({ show: false, message: '' });
      }
    }, 3000); // يختفي تلقائياً خلال 3 ثوانٍ إذا لم يتفاعل المستخدم
  };

  // إعدادات الحجم المستهدف القابلة للتعديل والمحفوظة محلياً
  // المعيار الموحد الجديد للنيابة العامة: الصور 500KB • الـ PDF 500KB
  const [targetImageKB, setTargetImageKB] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('manzoma_target_image_kb_v2');
        if (saved) {
          const parsed = parseInt(saved, 10);
          if (!isNaN(parsed) && parsed > 0) return parsed;
        }
      } catch (_) {}
    }
    return 500; // القيمة الافتراضية الموحدة 500KB
  });

  const [targetPdfKB, setTargetPdfKB] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('manzoma_target_pdf_kb');
        if (saved) {
          const parsed = parseInt(saved, 10);
          if (!isNaN(parsed) && parsed > 0) return parsed;
        }
      } catch (_) {}
    }
    return 500; // القيمة الافتراضية 500KB
  });

  // حالة نافذة تعديل الحجم المستهدف
  const [targetEditModal, setTargetEditModal] = useState<{
    isOpen: boolean;
    type: 'image' | 'pdf';
    inputValue: string;
    error?: string;
  }>({
    isOpen: false,
    type: 'image',
    inputValue: '500',
  });

  const openTargetEditor = (type: 'image' | 'pdf', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const currentVal = type === 'image' ? targetImageKB : targetPdfKB;
    setTargetEditModal({
      isOpen: true,
      type,
      inputValue: currentVal.toString(),
      error: undefined,
    });
  };

  const handleSaveTargetKB = () => {
    const parsed = parseInt(targetEditModal.inputValue.trim(), 10);
    if (isNaN(parsed) || parsed <= 0) {
      setTargetEditModal((prev) => ({
        ...prev,
        error: 'يرجى إدخال رقم صحيح موجب أكبر من صفر (مثال: 350 أو 500)',
      }));
      return;
    }

    if (targetEditModal.type === 'image') {
      setTargetImageKB(parsed);
      try {
        localStorage.setItem('manzoma_target_image_kb_v2', parsed.toString());
      } catch (_) {}
      showFlutterToast(`✅ تم تعديل الحجم المستهدف للصور إلى ${parsed} KB`);
    } else {
      setTargetPdfKB(parsed);
      try {
        localStorage.setItem('manzoma_target_pdf_kb', parsed.toString());
      } catch (_) {}
      showFlutterToast(`✅ تم تعديل الحجم المستهدف للـ PDF إلى ${parsed} KB`);
    }

    setTargetEditModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleResetTargetDefault = () => {
    if (targetEditModal.type === 'image') {
      setTargetImageKB(500);
      try {
        localStorage.removeItem('manzoma_target_image_kb_v2');
      } catch (_) {}
      showFlutterToast('✅ استعادة القيمة الافتراضية للصور (500 KB)');
    } else {
      setTargetPdfKB(500);
      try {
        localStorage.removeItem('manzoma_target_pdf_kb');
      } catch (_) {}
      showFlutterToast('✅ استعادة القيمة الافتراضية للـ PDF (500 KB)');
    }
    setTargetEditModal((prev) => ({ ...prev, isOpen: false }));
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
      title: 'تطبيق «ضغطة» لتصغير حجم الصور والـ PDF للمنظومة القضائية',
      text: 'زميلي العزيز المحامي ⚖️\nإليك تطبيق «ضغطة» لتصغير حجم الصور وملفات الـ PDF للمنظومة القضائية بحد أقصى 500 KB لتناسب اشتراطات النيابة ومصر الرقمية.\n• حفظ الصور مباشرة في المعرض (Gallery)\n• حفظ وفتح ملفات الـ PDF في التنزيلات\nتصميم وتنفيذ: مصطفى فرويز المحامي\nAl-Hawai Tech',
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
    const targetImageBytes = Math.round(targetImageKB * 1024 * 0.97);

    if (isProgressIndicatorEnabled) {
      setShowProgressWidget(true);
      setCurrentProgress({
        stage: 'بدء تحليل وفحص الصور...',
        percent: 8,
        originalSize: totalOriginalBytes,
        currentSize: totalOriginalBytes,
        totalPages: filesToCompress.length,
        currentPage: 1,
        targetMax: targetImageBytes * filesToCompress.length,
        detail: `استهداف أقل من ${targetImageKB} KB لكل صورة مع الحفاظ التام على الألوان`,
      });
    }

    try {
      // ضغط الصور لتكون أقل من targetImageKB مع الحفاظ الكامل على الألوان وترشيح عالي الدقة
      const results = await compressMultipleImagesClient(
        filesToCompress,
        targetImageBytes,
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

      if (results.length === 1 && results[0]?.url && results[0].compressedSize > 0) {
        const kb = (results[0].compressedSize / 1024).toFixed(1);
        showSmartToast(`(الحجم: ${kb} KB)`, results[0].url, results[0].name, 'image');
      } else if (results.length > 1 && results[0]?.url) {
        const totalKb = (results.reduce((acc, r) => acc + r.compressedSize, 0) / 1024).toFixed(1);
        showSmartToast(`(عدد الصور: ${results.length} • إجمالي: ${totalKb} KB)`, results[0].url, results[0].name, 'image');
      }

      // إبقاء المؤشر 3 ثوانٍ بعد الاكتمال لعرض الشفافية والنتيجة للمحامي
      setTimeout(() => {
        setShowProgressWidget(false);
      }, 3500);
    } catch (err: any) {
      showFlutterToast(`❌ خطأ: ${err.message || 'فشل ضغط الصورة'}`);
      setShowProgressWidget(false);
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleCompressPdfAction = async () => {
    if (!selectedPdf) return;

    setIsProcessingPdf(true);
    const targetPdfBytes = Math.round(targetPdfKB * 1024 * 0.97);

    if (isProgressIndicatorEnabled) {
      setShowProgressWidget(true);
      setCurrentProgress({
        stage: 'تحليل مستند الـ PDF واستخراج الصفحات...',
        percent: 10,
        originalSize: selectedPdf.size,
        currentSize: selectedPdf.size,
        targetMax: targetPdfBytes,
        detail: `استهداف أقل من ${targetPdfKB} KB مع الحفاظ على النصوص والأختام`,
      });
    }

    try {
      // ضغط ملف الـ PDF ليكون أقل من targetPdfKB مع حفظ فوري
      const result = await compressPdfClient(
        selectedPdf,
        targetPdfBytes,
        (progress) => {
          if (isProgressIndicatorEnabled) {
            setCurrentProgress(progress);
          }
        }
      );
      setPdfResult(result);
      triggerDownload(result.blob, result.name);

      confetti({ particleCount: 35, spread: 60, origin: { y: 0.8 } });
      if (result?.url && result.compressedSize > 0) {
        const kb = (result.compressedSize / 1024).toFixed(1);
        showSmartToast(`(الحجم: ${kb} KB)`, result.url, result.name, 'document');
      }

      setTimeout(() => {
        setShowProgressWidget(false);
      }, 3500);
    } catch (err: any) {
      showFlutterToast(`❌ خطأ: ${err.message || 'فشل ضغط ملف PDF'}`);
      setShowProgressWidget(false);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleMergeImagesAction = async () => {
    if (selectedImages.length === 0) return;

    setIsProcessingMerge(true);
    const totalBytes = selectedImages.reduce((acc, f) => acc + f.size, 0);
    const targetPdfBytes = Math.round(targetPdfKB * 1024 * 0.97);

    if (isProgressIndicatorEnabled) {
      setShowProgressWidget(true);
      setCurrentProgress({
        stage: 'تجهيز صور المستند للدمج في PDF موحد...',
        percent: 10,
        originalSize: totalBytes,
        currentSize: totalBytes,
        targetMax: targetPdfBytes,
        totalPages: selectedImages.length,
        currentPage: 1,
        detail: `استهداف أقل من ${targetPdfKB} KB وتطبيق الألوان الكاملة`,
      });
    }

    try {
      // دمج الصور في PDF واحد بالألوان الكاملة وأقل من targetPdfKB مع حفظ فوري
      const result = await mergeImagesToPdfClient(
        selectedImages,
        targetPdfBytes,
        (progress) => {
          if (isProgressIndicatorEnabled) {
            setCurrentProgress(progress);
          }
        }
      );
      setMergedPdfResult(result);
      triggerDownload(result.blob, result.name);

      confetti({ particleCount: 45, spread: 70, origin: { y: 0.8 } });
      if (result?.url && result.compressedSize > 0) {
        const kb = (result.compressedSize / 1024).toFixed(1);
        showSmartToast(`(الحجم: ${kb} KB)`, result.url, result.name, 'document');
      }

      setTimeout(() => {
        setShowProgressWidget(false);
      }, 3500);
    } catch (err: any) {
      showFlutterToast(`❌ خطأ: ${err.message || 'فشل دمج الصور'}`);
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
          
          {/* شريط التطبيق العلوي: اسم «ضغطة» باللون الكحلي الملكي والذهبي وزر المشاركة */}
          <div className="bg-[#0F2557] text-white px-3.5 py-2.5 flex items-center justify-between border-b-2 border-[#D4AF37] shadow-sm z-10 shrink-0">
            {currentScreen !== 'home' ? (
              <button
                onClick={() => setCurrentScreen('home')}
                className="px-2 py-1 hover:bg-white/10 rounded-lg text-white flex items-center gap-1.5 text-xs font-bold transition-colors"
              >
                <ArrowRight size={17} />
                <span>رجوع</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Scale size={18} className="text-[#FDE047] shrink-0" />
                <div className="flex items-baseline gap-1.5">
                  <span className="font-black text-base tracking-tight text-white">
                    ضغطة
                  </span>
                  <span className="text-[9px] font-bold bg-teal-500/25 text-teal-200 border border-teal-400/40 px-1.5 py-0.2 rounded">
                    تجريبي • التصوير
                  </span>
                  <span className="text-[10px] font-semibold text-[#FDE047]/90">
                    &lt; 500 KB
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={handleShareApp}
              className="px-2.5 py-1.5 bg-[#FDE047] hover:bg-[#FACC15] text-[#0F2557] rounded-lg font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all active:scale-95 shrink-0"
              title="مشاركة التطبيق"
            >
              <Share2 size={12} />
              <span>مشاركة</span>
            </button>
          </div>

          {/* شريط التحكم السريع بمؤشر الشفافية (صغير واختياري) */}
          <div className="bg-[#0B1D48] text-slate-200 px-3 py-1 flex items-center justify-between text-[10px] border-b border-blue-950 z-10 shrink-0">
            <span className="text-slate-300">منظومة النيابة ومصر الرقمية</span>
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
                  ? 'bg-teal-500/20 text-teal-200 border border-teal-400/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
              }`}
              title="تفعيل أو إلغاء مؤشر التقدم الجانبي الشفاف"
            >
              <Activity size={10} className={isProgressIndicatorEnabled ? 'text-teal-300' : 'text-slate-400'} />
              <span>المؤشر: {isProgressIndicatorEnabled ? 'مفعّل' : 'معطّل'}</span>
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
                    targetMax: 485 * 1024,
                    totalPages: 3,
                    currentPage: 3,
                    detail: 'يعرض الحجم اللحظي ونسبة الإنجاز بدقة A4 فائقة الوضوح',
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
          <div className="flex-1 overflow-y-auto px-3 py-2.5 text-right">
            
            {/* الشاشة الرئيسية المباشرة فور فتح التطبيق */}
            {currentScreen === 'home' && (
              <div className="space-y-2 animate-fade-in">
                {/* بطاقة الترحيب العلوية بالشعار المرفق وجملة الترحيب مع الميزان والوصف المختصر */}
                <div className="bg-gradient-to-br from-[#0B1D48] via-[#132C68] to-[#1D3E8A] text-white rounded-2xl p-2.5 border border-[#D4AF37]/45 shadow-sm flex items-center gap-2.5">
                  <img
                    src="/assets/brand/ic_launcher_foreground.png"
                    alt="شعار تطبيق ضغطة"
                    referrerPolicy="no-referrer"
                    className="w-[58px] h-[58px] rounded-xl object-contain bg-[#060E24] border border-[#D4AF37]/50 shrink-0 shadow-xs"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-[12.5px] font-bold text-white leading-tight truncate">
                        أهلاً بك زميلي المحامي
                      </h3>
                      <Scale size={14} className="text-[#FDE047] shrink-0" />
                    </div>
                    <p className="text-[9.8px] text-slate-200 leading-[1.35] mt-1 line-clamp-3">
                      اضغط مستنداتك وصورك بضغطة واحدة، بدون إنترنت، وبجودة عالية واجعلها جاهزة لتقديم الطلبات على منظومه النيابة والمحاكم.
                    </p>
                  </div>
                </div>

                {/* ==================== الخدمات الخمس رأسياً بالترتيب والألوان والترقيم (1 إلى 5) ==================== */}
                <div className="flex flex-col gap-1.5">
                  <div className="text-xs font-bold text-[#0F2557] px-0.5">
                    اضغط على الخدمة التي تريدها
                  </div>

                  {/* 1. الأزرق: تصغير حجم الصور */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setCurrentScreen('compress_image')}
                    onKeyDown={(e) => e.key === 'Enter' && setCurrentScreen('compress_image')}
                    className="w-full min-h-[50px] bg-[#1D4ED8] hover:bg-[#1E40AF] border border-[#3B82F6] text-white rounded-2xl px-2.5 py-1 flex items-center gap-2 transition-all text-right shadow-xs active:scale-[0.985] cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-full bg-white text-[#1D4ED8] font-black text-xs tabular-nums flex items-center justify-center shrink-0 shadow-2xs">
                      1
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                      <FileImage size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-[11.5px] text-white truncate">تصغير حجم الصور</span>
                        <button
                          type="button"
                          onClick={(e) => openTargetEditor('image', e)}
                          className="text-[9px] bg-white/15 hover:bg-white/25 text-white font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0 transition-colors"
                          title="تعديل الحجم المستهدف للصور"
                        >
                          <span>&lt; {targetImageKB} KB</span>
                          <Pencil size={8} />
                        </button>
                      </div>
                      <p className="text-[10px] text-blue-100 leading-tight mt-0.5 truncate">
                        ضغط صورة أو أكثر بألوان كاملة وحفظها بالمعرض
                      </p>
                    </div>
                    <ArrowRight size={13} className="rotate-180 text-white/80 shrink-0" />
                  </div>

                  {/* 2. البرتقالي: تصغير حجم ملفات PDF */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setCurrentScreen('compress_pdf')}
                    onKeyDown={(e) => e.key === 'Enter' && setCurrentScreen('compress_pdf')}
                    className="w-full min-h-[50px] bg-[#D94E0B] hover:bg-[#C2410C] border border-[#F97316] text-white rounded-2xl px-2.5 py-1 flex items-center gap-2 transition-all text-right shadow-xs active:scale-[0.985] cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-full bg-white text-[#C2410C] font-black text-xs tabular-nums flex items-center justify-center shrink-0 shadow-2xs">
                      2
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                      <FileText size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-[11.5px] text-white truncate">تصغير حجم ملفات PDF</span>
                        <button
                          type="button"
                          onClick={(e) => openTargetEditor('pdf', e)}
                          className="text-[9px] bg-white/15 hover:bg-white/25 text-white font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0 transition-colors"
                          title="تعديل الحجم المستهدف لملفات PDF"
                        >
                          <span>&lt; {targetPdfKB} KB</span>
                          <Pencil size={8} />
                        </button>
                      </div>
                      <p className="text-[10px] text-orange-100 leading-tight mt-0.5 truncate">
                        تقليص العرائض والمذكرات مع الحفاظ على الأختام
                      </p>
                    </div>
                    <ArrowRight size={13} className="rotate-180 text-white/80 shrink-0" />
                  </div>

                  {/* 3. الأخضر: دمج الصور في ملف PDF واحد */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setCurrentScreen('merge_images')}
                    onKeyDown={(e) => e.key === 'Enter' && setCurrentScreen('merge_images')}
                    className="w-full min-h-[50px] bg-[#047857] hover:bg-[#065F46] border border-[#10B981] text-white rounded-2xl px-2.5 py-1 flex items-center gap-2 transition-all text-right shadow-xs active:scale-[0.985] cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-full bg-white text-[#047857] font-black text-xs tabular-nums flex items-center justify-center shrink-0 shadow-2xs">
                      3
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                      <Files size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-[11.5px] text-white truncate">دمج الصور في ملف PDF واحد</span>
                        <button
                          type="button"
                          onClick={(e) => openTargetEditor('pdf', e)}
                          className="text-[9px] bg-white/15 hover:bg-white/25 text-white font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shrink-0 transition-colors"
                          title="تعديل الحجم المستهدف لملفات PDF"
                        >
                          <span>&lt; {targetPdfKB} KB</span>
                          <Pencil size={8} />
                        </button>
                      </div>
                      <p className="text-[10px] text-emerald-100 leading-tight mt-0.5 truncate">
                        دمج أوراق المحاضر والحوافظ بدقة A4 حادة
                      </p>
                    </div>
                    <ArrowRight size={13} className="rotate-180 text-white/80 shrink-0" />
                  </div>

                  {/* 4. التركواز: تصوير المستندات وتحسينها وضغطها */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setCurrentScreen('document_scanner')}
                    onKeyDown={(e) => e.key === 'Enter' && setCurrentScreen('document_scanner')}
                    className="w-full min-h-[50px] bg-[#0F766E] hover:bg-[#115E59] border border-[#14B8A6] text-white rounded-2xl px-2.5 py-1 flex items-center gap-2 transition-all text-right shadow-xs active:scale-[0.985] cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-full bg-white text-[#0F766E] font-black text-xs tabular-nums flex items-center justify-center shrink-0 shadow-2xs">
                      4
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                      <Scan size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-bold text-[11.5px] text-white truncate">تصوير المستندات وتحسينها وضغطها</span>
                        <span className="text-[9px] bg-white/15 text-white font-bold px-1.5 py-0.5 rounded-md shrink-0">
                          &lt; 500 KB
                        </span>
                      </div>
                      <p className="text-[10px] text-teal-100 leading-tight mt-0.5 truncate">
                        تصوير تلقائي أو يدوي وقص وتحسين ألوان وحفظ صور و PDF
                      </p>
                    </div>
                    <ArrowRight size={13} className="rotate-180 text-white/80 shrink-0" />
                  </div>

                  {/* 5. البنفسجي: البوابات القانونية */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setCurrentScreen('legal_portals')}
                    onKeyDown={(e) => e.key === 'Enter' && setCurrentScreen('legal_portals')}
                    className="w-full min-h-[50px] bg-[#6D28D9] hover:bg-[#5B21B6] border border-[#8B5CF6] text-white rounded-2xl px-2.5 py-1 flex items-center gap-2 transition-all text-right shadow-xs active:scale-[0.985] cursor-pointer"
                  >
                    <div className="w-7 h-7 rounded-full bg-white text-[#6D28D9] font-black text-xs tabular-nums flex items-center justify-center shrink-0 shadow-2xs">
                      5
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0">
                      <Globe size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-[11.5px] text-white block truncate">البوابات القانونية</span>
                      <p className="text-[10px] text-purple-100 leading-tight mt-0.5 truncate">
                        النيابة العامة ومحكمة الأسرة ومصر الرقمية (10 مواقع)
                      </p>
                    </div>
                    <ArrowRight size={13} className="rotate-180 text-white/80 shrink-0" />
                  </div>
                </div>

                {/* شريط معلومات حفظ المعرض والتنزيلات */}
                <div className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5 text-[9.5px] text-slate-600">
                  <FolderDown size={13} className="text-[#0F2557] shrink-0" />
                  <span className="truncate">الصور تُحفظ في الاستوديو • والـ PDF في التنزيلات (Downloads)</span>
                </div>

                {/* التذييل الرسمي الهادئ: العبارتان باللون الهادئ وحجم الخط القديم */}
                <div className="text-center pt-1 pb-0.5 text-[10.5px] font-normal text-slate-400/80 border-t border-slate-200/60 space-y-0.5">
                  <div>تصميم وتنفيذ: مصطفى فرويز المحامي</div>
                  <div>Al-Hawai Tech</div>
                </div>
              </div>
            )}

            {/* د) خدمة تصوير المستندات وتحسينها وضغطها */}
            {currentScreen === 'document_scanner' && (
              <DocumentScannerView
                onBackHome={() => setCurrentScreen('home')}
                onShowToast={showFlutterToast}
                onSaveComplete={(detail, fileUrl, fileName, fileType) =>
                  showSmartToast(detail, fileUrl, fileName, fileType)
                }
                onTriggerDownload={triggerDownload}
                onGenerateSampleDoc={generateSampleImage}
              />
            )}

            {/* شاشة قائمة الـ 10 مواقع القضائية المرقمة رأسياً من 1 إلى 10 */}
            {currentScreen === 'legal_portals' && (
              <div className="space-y-3 animate-fade-in pb-2">
                <div className="bg-gradient-to-r from-[#5B21B6] to-[#7C3AED] text-white rounded-2xl p-3 shadow-xs border border-[#8B5CF6]/40">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe size={16} className="text-[#FDE047]" />
                    <h3 className="font-bold text-xs">
                      البوابات القانونية الرسمية (10 مواقع)
                    </h3>
                  </div>
                  <p className="text-[10px] text-purple-100 leading-normal">
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

            {/* أ) شاشة ضغط الصور (صورة أو أكثر < 500 KB) */}
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
                      سيتم ضغطها بدقة فائقة لتصبح <strong>أقل من {targetImageKB} KB</strong> وحفظها فوراً في معرض الصور (Gallery)
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
                          <span
                            onClick={(e) => openTargetEditor('image', e)}
                            className="text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-800 font-bold px-2 py-0.5 rounded-full cursor-pointer flex items-center gap-1 border border-blue-300/60"
                            title="اضغط لتعديل الحجم المستهدف"
                          >
                            <span>أقل من {targetImageKB} KB</span>
                            <Pencil size={8} className="opacity-70" />
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
                              <span
                                onClick={(e) => openTargetEditor('image', e)}
                                className="font-bold text-teal-700 cursor-pointer hover:underline flex items-center gap-1"
                                title="اضغط لتعديل الحجم المطلوب"
                              >
                                <span>{imageResult ? formatFileSize(imageResult.compressedSize) : `أقل من ${targetImageKB} KB`}</span>
                                <Pencil size={9} className="opacity-60" />
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
                              ? `ضغط وحفظ (${selectedImagesForCompress.length} صور) في المعرض (< ${targetImageKB} KB)`
                              : `ضغط وحفظ في المعرض (< ${targetImageKB} KB)`}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ب) شاشة ضغط ملف الـ PDF لأقل من targetPdfKB KB */}
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
                      تقليص صفحات المذكرات والشكاوى لتصبح <strong>أقل من {targetPdfKB} KB</strong>
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
                          const sampleMerged = await mergeImagesToPdfClient([sampleImg], Math.round(targetPdfKB * 1024 * 0.96));
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
                          <span>{formatFileSize(pdfResult.compressedSize)} (أقل من {targetPdfKB} KB)</span>
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
                          <span>ضغط وحفظ مباشر بالتنزيلات (&lt; {targetPdfKB} KB)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ج) شاشة دمج الصور في ملف PDF واحد (< targetPdfKB KB) */}
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
                      اختر عدة صور لحافظة المستندات لدمجها في ملف موحد <strong>أقل من {targetPdfKB} KB</strong>
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
                        <span>{formatFileSize(mergedPdfResult.compressedSize)} (&lt; {targetPdfKB} KB)</span>
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
                          <span>دمج وحفظ في Downloads (&lt; {targetPdfKB} KB)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ==================== نافذة تعديل الحجم المستهدف (مباشرة وتفاعلية) ==================== */}
          {targetEditModal.isOpen && (
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in text-right">
              <div className="w-full max-w-[300px] bg-white rounded-3xl p-4 text-slate-900 space-y-3.5 shadow-2xl border border-slate-200 animate-slide-up">
                {/* الترويسة */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      targetEditModal.type === 'image' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-600'
                    }`}>
                      {targetEditModal.type === 'image' ? <FileImage size={18} /> : <FileText size={18} />}
                    </div>
                    <div>
                      <h3 className="font-bold text-xs text-slate-900">
                        {targetEditModal.type === 'image' ? 'تعديل حجم الصور المستهدف' : 'تعديل حجم PDF المستهدف'}
                      </h3>
                      <p className="text-[10px] text-slate-400">
                        الافتراضي الموحد: 500 KB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setTargetEditModal((prev) => ({ ...prev, isOpen: false }))}
                    className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* حقل إدخال الرقم الصحيح الموجب */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    أدخل الحجم المستهدف بالكيلوبايت (KB):
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      autoFocus
                      value={targetEditModal.inputValue}
                      onChange={(e) => setTargetEditModal((prev) => ({ ...prev, inputValue: e.target.value, error: undefined }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTargetKB();
                        if (e.key === 'Escape') setTargetEditModal((prev) => ({ ...prev, isOpen: false }));
                      }}
                      className="w-full text-center text-xl font-black font-mono py-2 px-10 bg-slate-50 border-2 border-slate-200 focus:border-blue-600 rounded-xl outline-hidden text-slate-900 transition-colors"
                      placeholder="500"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400 font-mono">
                      KB
                    </span>
                  </div>
                  {targetEditModal.error && (
                    <p className="text-[10px] font-bold text-red-600">{targetEditModal.error}</p>
                  )}
                </div>

                {/* خيارات سريعة شائعة */}
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 block font-semibold">خيارات سريعة:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[300, 400, 480, 500].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTargetEditModal((prev) => ({ ...prev, inputValue: preset.toString(), error: undefined }))}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold font-mono transition-all ${
                          targetEditModal.inputValue === preset.toString()
                            ? targetEditModal.type === 'image' ? 'bg-blue-600 text-white shadow-xs' : 'bg-orange-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {preset} KB {preset === 500 && '★'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* أزرار الحفظ والإلغاء والاستعادة */}
                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <button
                    onClick={handleSaveTargetKB}
                    className={`w-full py-2.5 text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-[0.98] ${
                      targetEditModal.type === 'image' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'
                    }`}
                  >
                    حفظ وتطبيق الحجم الجديد
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleResetTargetDefault}
                      className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10.5px] font-semibold transition-all"
                    >
                      استعادة الافتراضي (500 KB)
                    </button>
                    <button
                      onClick={() => setTargetEditModal((prev) => ({ ...prev, isOpen: false }))}
                      className="py-1.5 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-[10.5px] font-semibold transition-all"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

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

          {/* ==================== مربع حوار تأكيد الحفظ في منتصف الشاشة (3 ثوانٍ مع × وفتح الملف) ==================== */}
          {smartToast.show && (
            <div
              onClick={dismissSaveConfirmationDialog}
              className="absolute inset-0 bg-[#09183B]/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-50 animate-fade-in"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[285px] bg-white rounded-2xl p-4 text-slate-900 shadow-2xl border border-[#D4AF37]/80 animate-scale-in text-center relative"
              >
                <button
                  type="button"
                  onClick={dismissSaveConfirmationDialog}
                  aria-label="إغلاق"
                  className="absolute top-2.5 left-2.5 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
                >
                  <X size={15} />
                </button>

                <div className="w-11 h-11 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
                  <CheckCircle2 size={26} />
                </div>

                <h4 className="font-bold text-[13px] text-[#0F2557] leading-snug px-2">
                  {smartToast.message}
                </h4>

                {smartToast.sizeDetail && (
                  <p className="text-[11px] text-slate-500 mt-1 font-medium">
                    {smartToast.sizeDetail}
                  </p>
                )}

                {smartToast.fileUrl && (
                  <a
                    href={smartToast.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={dismissSaveConfirmationDialog}
                    className="mt-3.5 w-full py-2.5 bg-[#0F2557] hover:bg-[#16347A] text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    <ExternalLink size={14} className="text-[#FDE047]" />
                    <span>فتح الملف</span>
                  </a>
                )}
              </div>
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
