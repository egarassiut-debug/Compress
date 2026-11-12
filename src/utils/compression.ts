import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';

// تعيين مسار الـ worker لمكتبة pdfjs
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export interface CompressionResult {
  blob: Blob;
  url: string;
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
  name: string;
}

export interface CompressionProgress {
  stage: string;
  percent: number; // 0 - 100
  originalSize: number;
  currentSize: number;
  currentPage?: number;
  totalPages?: number;
  detail?: string;
  targetMax?: number;
}

/**
 * خوارزمية ترشيح عالية الدقة (High-Quality Stepped Downsampling)
 * تمنع التشويش والتبكسل وتضمن بقاء الأختام والخطوط الدقيقة حادة وواضحة
 */
function highQualityResizeCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number
): HTMLCanvasElement {
  let curW = source.width;
  let curH = source.height;

  // إذا كانت الأبعاد المستهدفة مساوية أو أكبر، نرسم مباشرة
  if (curW <= targetWidth && curH <= targetHeight) {
    const directCanvas = document.createElement('canvas');
    directCanvas.width = targetWidth;
    directCanvas.height = targetHeight;
    const directCtx = directCanvas.getContext('2d', { willReadFrequently: false })!;
    directCtx.imageSmoothingEnabled = true;
    directCtx.imageSmoothingQuality = 'high';
    directCtx.fillStyle = '#FFFFFF';
    directCtx.fillRect(0, 0, targetWidth, targetHeight);
    directCtx.drawImage(source, 0, 0, targetWidth, targetHeight);
    return directCanvas;
  }

  // تصغير متدرج ناعم (Stepped Resampling) لمنع تكسر حواف الحروف وفقدان الأختام
  let currentCanvas = document.createElement('canvas');
  currentCanvas.width = curW;
  currentCanvas.height = curH;
  let ctx = currentCanvas.getContext('2d', { willReadFrequently: false })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, curW, curH);

  while (curW * 0.5 > targetWidth && curH * 0.5 > targetHeight) {
    curW = Math.round(curW * 0.5);
    curH = Math.round(curH * 0.5);
    const stepCanvas = document.createElement('canvas');
    stepCanvas.width = curW;
    stepCanvas.height = curH;
    const stepCtx = stepCanvas.getContext('2d', { willReadFrequently: false })!;
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(currentCanvas, 0, 0, curW, curH);
    currentCanvas = stepCanvas;
  }

  // الرسم النهائي بالأبعاد المحددة بأعلى دقة
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetWidth;
  finalCanvas.height = targetHeight;
  const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: false })!;
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';
  finalCtx.fillStyle = '#FFFFFF';
  finalCtx.fillRect(0, 0, targetWidth, targetHeight);
  finalCtx.drawImage(currentCanvas, 0, 0, targetWidth, targetHeight);

  return finalCanvas;
}

/**
 * ضغط ذكي وعالي الجودة للصور الفردية:
 * 1. إذا كان حجم الصورة الأصلي أقل من 200 KB بالفعل، نتجنب إعادة الضغط لحماية الجودة.
 * 2. الحفاظ التام على أبعاد ونسب الصورة الأصلية واتجاهها الصحيح.
 * 3. دقة أبعاد مرتفعة (حتى 1800-2000 بكسل) تمنع تشويش الحروف الصغيرة والأختام الرسمية.
 * 4. حد أدنى صارم للجودة (Quality Floor >= 58%) لعدم الإضرار بوضوح المستند.
 */
export async function compressImageClient(
  file: File,
  targetMaxBytes = 195 * 1024, // 195 KB لضمان أن تكون أقل من 200 KB
  onProgress?: (progress: CompressionProgress) => void
): Promise<CompressionResult> {
  const originalSize = file.size;

  onProgress?.({
    stage: 'فحص المستند والصورة الأصلية',
    percent: 15,
    originalSize,
    currentSize: originalSize,
    targetMax: targetMaxBytes,
    detail: 'تحليل دقة المستند والأختام الملونة وحجم الملف',
  });

  // قاعدة أساسية: إذا كانت الصورة بالفعل أقل من الحجم المستهدف، لا نعيد ضغطها دون داعٍ
  if (originalSize <= targetMaxBytes) {
    onProgress?.({
      stage: 'الصورة مطابقة للاشتراطات بالفعل (< 200 KB)',
      percent: 100,
      originalSize,
      currentSize: originalSize,
      targetMax: targetMaxBytes,
      detail: `الحجم الأصلي: ${(originalSize / 1024).toFixed(1)} KB - تم الحفظ بجودتها الكاملة الأصلية 100%`,
    });

    const url = URL.createObjectURL(file);
    return {
      blob: file,
      url,
      originalSize,
      compressedSize: originalSize,
      reductionPercentage: 0,
      name: file.name,
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('فشل قراءة ملف الصورة'));
    reader.onload = async (e) => {
      onProgress?.({
        stage: 'فك تشفير الصورة وتحليل التفاصيل',
        percent: 30,
        originalSize,
        currentSize: Math.round(originalSize * 0.9),
        targetMax: targetMaxBytes,
        detail: 'معايرة الألوان 24-bit والحفاظ على التوقيعات والمداد الأزرق والأحمر',
      });

      const img = new Image();
      img.onerror = () => reject(new Error('فشل فك تشفير الصورة'));
      img.onload = async () => {
        // نبدأ بدقة أبعاد عالية (1800 بكسل) تتيح قراءة أدق البنود القانونية
        let maxDimension = Math.min(Math.max(img.width, img.height), 1800);
        let width = img.width;
        let height = img.height;

        const ratio = width / height;
        if (width > height) {
          if (width > maxDimension) {
            width = maxDimension;
            height = Math.round(maxDimension / ratio);
          }
        } else {
          if (height > maxDimension) {
            height = maxDimension;
            width = Math.round(maxDimension * ratio);
          }
        }

        onProgress?.({
          stage: 'ترشيح متدرج فائق النقاء (Stepped Resampling)',
          percent: 50,
          originalSize,
          currentSize: Math.round(originalSize * 0.6),
          targetMax: targetMaxBytes,
          detail: `الأبعاد: ${width}×${height} بكسل • دقة واضحة لأختام النسر والتوقيعات`,
        });

        let canvas = highQualityResizeCanvas(img, width, height);

        // جودة ابتدائية نقية 78% تمنع تشوه الحروف
        let quality = 0.78;
        let bestBlob: Blob | null = await new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), 'image/jpeg', quality)
        );

        onProgress?.({
          stage: 'موازنة الحجم والدقة',
          percent: 75,
          originalSize,
          currentSize: bestBlob?.size || Math.round(originalSize * 0.4),
          targetMax: targetMaxBytes,
          detail: bestBlob ? `الحجم الحالي: ${(bestBlob.size / 1024).toFixed(1)} KB` : 'قياس حجم الملف',
        });

        // حلقة ضبط ذكية تدريجية تحافظ على وضوح المستند:
        // نضبط الجودة أولاً دون تخفيض الأبعاد بشكل مبالغ فيه
        let attempts = 0;
        const minQualityFloor = 0.58; // لا ننزل عن 58% لمنع التبكسل والتشويش
        const minDimensionFloor = 1200; // لا ننزل عن 1200 بكسل لقراءة النصوص الصغيرة

        while (bestBlob && bestBlob.size > targetMaxBytes && attempts < 5) {
          attempts++;

          if (quality > minQualityFloor + 0.05) {
            // تخفيض طفيف متدرج للجودة مع الحفاظ على الأبعاد العالية
            quality = Math.max(minQualityFloor, quality - 0.06);
          } else if (maxDimension > minDimensionFloor) {
            // تقليص تدريجي هادئ للأبعاد بنسبة 10% فقط عند الضرورة
            maxDimension = Math.max(minDimensionFloor, Math.round(maxDimension * 0.90));
            if (img.width > img.height) {
              width = maxDimension;
              height = Math.round(maxDimension / ratio);
            } else {
              height = maxDimension;
              width = Math.round(maxDimension * ratio);
            }
            canvas = highQualityResizeCanvas(img, width, height);
            quality = 0.68; // إعادة رفع الجودة قليلاً عند تصغير الأبعاد
          } else {
            // وصلنا للحد الأدنى المقبول للجودة - نتوقف لحماية وضوح المستند
            break;
          }

          bestBlob = await new Promise<Blob | null>((res) =>
            canvas.toBlob((b) => res(b), 'image/jpeg', quality)
          );

          onProgress?.({
            stage: `موازنة تدريجية للمستند (خطوة ${attempts})`,
            percent: Math.min(94, 75 + attempts * 4),
            originalSize,
            currentSize: bestBlob?.size || targetMaxBytes,
            targetMax: targetMaxBytes,
            detail: `الحجم: ${((bestBlob?.size || 0) / 1024).toFixed(1)} KB • الجودة: ${Math.round(quality * 100)}%`,
          });
        }

        if (!bestBlob) {
          bestBlob = await new Promise<Blob>((res) =>
            canvas.toBlob((b) => res(b || new Blob()), 'image/jpeg', 0.65)
          );
        }

        const compressedSize = bestBlob.size;
        const reductionPercentage = Math.max(
          1,
          Math.round(((originalSize - compressedSize) / originalSize) * 100)
        );
        const url = URL.createObjectURL(bestBlob);

        onProgress?.({
          stage: 'اكتملت المعالجة بنقاء فائق وجاهز للحفظ بالمعرض',
          percent: 100,
          originalSize,
          currentSize: compressedSize,
          targetMax: targetMaxBytes,
          detail: `تم تقليص الحجم بنسبة ${reductionPercentage}% - الحجم: ${(compressedSize / 1024).toFixed(1)} KB`,
        });

        resolve({
          blob: bestBlob,
          url,
          originalSize,
          compressedSize,
          reductionPercentage,
          name: file.name.replace(/\.[^/.]+$/, '') + '_compressed.jpg',
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * ضغط مجموعة من الصور في الأمر الواحد دفعة واحدة
 */
export async function compressMultipleImagesClient(
  files: File[],
  targetMaxBytes = 195 * 1024,
  onProgress?: (progress: CompressionProgress) => void
): Promise<CompressionResult[]> {
  const totalOriginalSize = files.reduce((acc, f) => acc + f.size, 0);
  const results: CompressionResult[] = [];
  let currentAccumulatedSize = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const pageNum = i + 1;
    const totalPages = files.length;

    onProgress?.({
      stage: `معالجة مستند ${pageNum} من ${totalPages}`,
      percent: Math.round((i / totalPages) * 100),
      originalSize: totalOriginalSize,
      currentSize: currentAccumulatedSize || Math.round(totalOriginalSize * 0.8),
      currentPage: pageNum,
      totalPages,
      targetMax: targetMaxBytes * totalPages,
      detail: `اسم الملف: ${file.name.substring(0, 20)}`,
    });

    const result = await compressImageClient(file, targetMaxBytes, (subProg) => {
      const overallPercent = Math.round(((i + subProg.percent / 100) / totalPages) * 100);
      onProgress?.({
        stage: `مستند ${pageNum}/${totalPages}: ${subProg.stage}`,
        percent: overallPercent,
        originalSize: totalOriginalSize,
        currentSize: currentAccumulatedSize + subProg.currentSize,
        currentPage: pageNum,
        totalPages,
        targetMax: targetMaxBytes * totalPages,
        detail: subProg.detail,
      });
    });

    results.push(result);
    currentAccumulatedSize += result.compressedSize;
  }

  onProgress?.({
    stage: `اكتملت معالجة كافة الصور بنجاح (${results.length} مستندات)`,
    percent: 100,
    originalSize: totalOriginalSize,
    currentSize: currentAccumulatedSize,
    totalPages: files.length,
    currentPage: files.length,
    detail: `إجمالي الحجم: ${(currentAccumulatedSize / 1024).toFixed(1)} KB`,
  });

  return results;
}

/**
 * دمج مجموعة صور في ملف PDF واحد عالي الدقة:
 * - الحفاظ على اتجاه كل صفحة (أفقي Landscape أو رأسي Portrait) بناءً على أبعاد الصورة الأصلية دون قص أو تمدد.
 * - دقة متوازنة وحادة للكتابة والأختام الرسمية (150-180 DPI).
 * - استهداف أقل من 500 KB مع الحفاظ على وضوح المستند.
 */
export async function mergeImagesToPdfClient(
  files: File[],
  strictMaxThreshold = 480 * 1024,
  onProgress?: (progress: CompressionProgress) => void
): Promise<CompressionResult> {
  const totalOriginalSize = files.reduce((acc, f) => acc + f.size, 0);
  const pageCount = files.length;

  onProgress?.({
    stage: 'قراءة وفحص الصور المراد دمجها',
    percent: 10,
    originalSize: totalOriginalSize,
    currentSize: totalOriginalSize,
    totalPages: pageCount,
    targetMax: strictMaxThreshold,
    detail: `إجمالي الصفحات: ${pageCount} ورقة • تحليل أبعاد واتجاهات المستندات`,
  });

  const generatePdfWithParams = async (
    maxDim: number,
    quality: number,
    reportStep = false
  ): Promise<Blob> => {
    const pdfDoc = await PDFDocument.create();
    let runningBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const pageIndex = i + 1;

      if (reportStep) {
        onProgress?.({
          stage: `معالجة ورقة ${pageIndex} من ${pageCount} بدقة عالية`,
          percent: Math.round(15 + (pageIndex / pageCount) * 65),
          originalSize: totalOriginalSize,
          currentSize: runningBytes || Math.round((pageIndex / pageCount) * totalOriginalSize * 0.4),
          currentPage: pageIndex,
          totalPages: pageCount,
          targetMax: strictMaxThreshold,
          detail: 'الحفاظ على أبعاد ونسب الصفحة الأصلية وحدّة الأختام',
        });
      }

      const imageBitmap = await new Promise<HTMLImageElement>((resolveImg, rejectImg) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const image = new Image();
          image.onload = () => resolveImg(image);
          image.onerror = () => rejectImg(new Error('فشل قراءة صورة المستند'));
          image.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
      });

      let w = imageBitmap.width;
      let h = imageBitmap.height;
      if (w > maxDim || h > maxDim) {
        const r = w / h;
        if (w > h) {
          w = maxDim;
          h = Math.round(maxDim / r);
        } else {
          h = maxDim;
          w = Math.round(maxDim * r);
        }
      }

      const canvas = highQualityResizeCanvas(imageBitmap, w, h);

      // ضغط الصورة بصيغة JPEG بجودة متوازنة
      const imgJpgBlob = await new Promise<Blob>((res) =>
        canvas.toBlob((b) => res(b!), 'image/jpeg', quality)
      );

      runningBytes += imgJpgBlob.size;
      const imageBytes = await imgJpgBlob.arrayBuffer();
      const embeddedImage = await pdfDoc.embedJpg(imageBytes);

      // تحديد أبعاد صفحة الـ PDF بناءً على الاتجاه والنسب الأصلية للمستند دون قص أو تمدد
      const isLandscape = imageBitmap.width > imageBitmap.height;
      const standardA4Long = 841.89;
      const standardA4Short = 595.28;

      const pageWidth = isLandscape ? standardA4Long : standardA4Short;
      const pageHeight = isLandscape ? standardA4Short : standardA4Long;

      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      // هامش نظيف ضئيل (8pt) لتعظيم مساحة القراءة ووضوح الخطوط
      const margin = 8;
      const availW = pageWidth - margin * 2;
      const availH = pageHeight - margin * 2;
      const scale = Math.min(availW / embeddedImage.width, availH / embeddedImage.height);
      const renderW = embeddedImage.width * scale;
      const renderH = embeddedImage.height * scale;

      page.drawImage(embeddedImage, {
        x: margin + (availW - renderW) / 2,
        y: margin + (availH - renderH) / 2,
        width: renderW,
        height: renderH,
      });
    }

    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    return new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  };

  // ميزانية ذكية للأبعاد والجودة بحسب عدد الصفحات لضمان أعلى وضوح تحت 500 KB:
  let currentMaxDim = 1600; // دقة ممتازة (150-180 DPI) تمنع تشويش الحروف
  let currentQuality = 0.76;

  if (pageCount === 1) {
    currentMaxDim = 1750;
    currentQuality = 0.78;
  } else if (pageCount === 2) {
    currentMaxDim = 1550;
    currentQuality = 0.74;
  } else if (pageCount <= 5) {
    currentMaxDim = Math.max(1300, 1500 - pageCount * 40);
    currentQuality = Math.max(0.66, 0.74 - pageCount * 0.02);
  } else {
    currentMaxDim = Math.max(1150, 1350 - pageCount * 25);
    currentQuality = Math.max(0.60, 0.68 - pageCount * 0.01);
  }

  let finalBlob = await generatePdfWithParams(currentMaxDim, currentQuality, true);

  onProgress?.({
    stage: 'تجميع مستند الـ PDF النهائي',
    percent: 88,
    originalSize: totalOriginalSize,
    currentSize: finalBlob.size,
    totalPages: pageCount,
    currentPage: pageCount,
    targetMax: strictMaxThreshold,
    detail: `الحجم الحالي: ${(finalBlob.size / 1024).toFixed(1)} KB`,
  });

  // حلقة ضبط تدريجية هادئة مع احترام الحد الأدنى للجودة (Floor)
  let attempts = 0;
  const qualityFloor = 0.58;
  const dimFloor = 1100;

  while (finalBlob.size > strictMaxThreshold && attempts < 4) {
    attempts++;
    if (currentQuality > qualityFloor + 0.04) {
      currentQuality = Math.max(qualityFloor, currentQuality - 0.06);
    } else if (currentMaxDim > dimFloor) {
      currentMaxDim = Math.max(dimFloor, Math.round(currentMaxDim * 0.90));
      currentQuality = 0.65;
    } else {
      break; // نتوقف عند الحد الأدنى لعدم إفساد جودة المستند
    }

    finalBlob = await generatePdfWithParams(currentMaxDim, currentQuality, false);

    onProgress?.({
      stage: `موازنة تدريجية لاشتراط < 500 KB (خطوة ${attempts})`,
      percent: Math.min(96, 88 + attempts * 2),
      originalSize: totalOriginalSize,
      currentSize: finalBlob.size,
      totalPages: pageCount,
      currentPage: pageCount,
      targetMax: strictMaxThreshold,
      detail: `الحجم: ${(finalBlob.size / 1024).toFixed(1)} KB • الدقة: ${currentMaxDim}px`,
    });
  }

  const compressedSize = finalBlob.size;
  const reductionPercentage = Math.max(
    1,
    Math.round(((totalOriginalSize - compressedSize) / totalOriginalSize) * 100)
  );

  onProgress?.({
    stage: 'اكتمل دمج مستند الـ PDF بنجاح وجاهز للمنظومة',
    percent: 100,
    originalSize: totalOriginalSize,
    currentSize: compressedSize,
    totalPages: pageCount,
    currentPage: pageCount,
    targetMax: strictMaxThreshold,
    detail: `الحجم النهائي: ${(compressedSize / 1024).toFixed(1)} KB (وفرت ${reductionPercentage}%)`,
  });

  return {
    blob: finalBlob,
    url: URL.createObjectURL(finalBlob),
    originalSize: totalOriginalSize,
    compressedSize,
    reductionPercentage,
    name: `merged_manzoma_${Date.now()}.pdf`,
  };
}

/**
 * معالجة وضغط ملفات PDF القانونية بطريقة احترافية متوازنة:
 * 1. عدم تحويل صفحات PDF النصية إلى صور دون ضرورة للحفاظ على النصوص القابلة للبحث والتحديد.
 * 2. محاولة الضغط الهيكلي الخالي من الفقدان (Lossless Structural Compression) أولاً عبر pdf-lib.
 * 3. إذا كان الملف بالفعل أقل من 500 KB، يتم الحفاظ عليه كاملاً بجودته ونصوصه الأصلية دون أي تشويش.
 * 4. عند الحاجة لضغط الصفحات المصورة (Scanned PDFs)، استخدام دقة DPI متوازنة (150-180 DPI بدلاً من 72 DPI)
 *    للحفاظ على وضوح الحروف الصغيرة وأختام النسر والتوقيعات.
 * 5. الحفاظ الدقيق على أبعاد ونسب كل صفحة واتجاهها (أفقي/رأسي) كما في الملف الأصلي دون قص أو تمدد أو حواف مشوهة.
 * 6. الالتزام بحد أدنى للجودة لعدم إفساد المستند حتى لو كان حجمه النهائي قريباً من الهدف.
 */
export async function compressPdfClient(
  file: File,
  strictMaxThreshold = 490 * 1024, // 490 KB لاستهداف أقل من 500 KB
  onProgress?: (progress: CompressionProgress) => void
): Promise<CompressionResult> {
  const originalSize = file.size;
  const arrayBuffer = await file.arrayBuffer();

  onProgress?.({
    stage: 'قراءة وتحليل هيكل مستند الـ PDF',
    percent: 10,
    originalSize,
    currentSize: originalSize,
    targetMax: strictMaxThreshold,
    detail: `الحجم الأصلي: ${(originalSize / 1024).toFixed(1)} KB • فحص النصوص والأختام`,
  });

  // ==================== المرحلة 1: الضغط الهيكلي الخالي من الفقدان (Lossless Structural Optimization) ====================
  // تحسين تدفقات الكائنات وإزالة التكرارات دون تحويل النصوص إلى صور
  try {
    const rawPdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const structBytes = await rawPdfDoc.save({ useObjectStreams: true, addDefaultPage: false });

    // إذا كان المستند الأصلي بالفعل أقل من 500 KB أو نجح الضغط الهيكلي في جعله أقل من 500 KB:
    // نحافظ على النصوص الفيكتورية بالكامل 100% قابلة للبحث والتحديد وبأعلى حدة مطلقة
    if (structBytes.length <= strictMaxThreshold || originalSize <= strictMaxThreshold) {
      const finalBytes = structBytes.length < originalSize ? structBytes : new Uint8Array(arrayBuffer);
      const optimizedBlob = new Blob([finalBytes as unknown as BlobPart], { type: 'application/pdf' });
      const reduction = Math.max(0, Math.round(((originalSize - optimizedBlob.size) / originalSize) * 100));

      onProgress?.({
        stage: 'تم تحسين المستند بنجاح مع الحفاظ التام على النصوص والأختام 100%',
        percent: 100,
        originalSize,
        currentSize: optimizedBlob.size,
        targetMax: strictMaxThreshold,
        detail: `نصوص قابلة للبحث والتحديد • الحجم: ${(optimizedBlob.size / 1024).toFixed(1)} KB`,
      });

      return {
        blob: optimizedBlob,
        url: URL.createObjectURL(optimizedBlob),
        originalSize,
        compressedSize: optimizedBlob.size,
        reductionPercentage: reduction,
        name: file.name.replace(/\.[^/.]+$/, '') + '_optimized.pdf',
      };
    }
  } catch (err) {
    console.warn('Structural optimization pass failed, proceeding to adaptive raster:', err);
  }

  // ==================== المرحلة 2: المعالجة الذكية للصفحات والمستندات الممسوحة ضوئياً ====================
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    // فحص عينة من الصفحات لمعرفة ما إذا كان المستند نصياً بالكامل:
    let totalTextLength = 0;
    const sampleCount = Math.min(numPages, 3);
    for (let p = 1; p <= sampleCount; p++) {
      try {
        const page = await pdf.getPage(p);
        const textContent = await page.getTextContent();
        totalTextLength += textContent.items.length;
      } catch (_) {}
    }

    // حساب دقة DPI حادة ومناسبة للمستندات القضائية:
    // نعتمد 150-180 DPI للصفحات العادية و 135-150 DPI للمستندات الكبيرة
    // (دقة 72-96 القديمة كانت سبب تشويش المستند وضياع معالم الأختام)
    let targetDpi = numPages <= 2 ? 180 : (numPages <= 5 ? 150 : (numPages <= 10 ? 135 : 120));
    let scaleFactor = targetDpi / 72;

    onProgress?.({
      stage: `فحص ${numPages} صفحة وتطبيق معيار دقة ${targetDpi} DPI`,
      percent: 25,
      originalSize,
      currentSize: Math.round(originalSize * 0.8),
      totalPages: numPages,
      targetMax: strictMaxThreshold,
      detail: `معيار دقة ${targetDpi} DPI يحافظ على وضوح أدق التوقيعات والأختام والخطوط`,
    });

    // دالة داخلية لإعادة بناء الـ PDF مع الحفاظ الصارم على أبعاد ونسب كل صفحة
    const buildCompressedPdf = async (
      scale: number,
      jpegQuality: number,
      reportSteps = false
    ): Promise<Blob> => {
      const outputPdf = await PDFDocument.create();
      let runningSize = 0;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (reportSteps) {
          onProgress?.({
            stage: `معالجة وضغط صفحة ${pageNum} من ${numPages} (دقة ${Math.round(scale * 72)} DPI)`,
            percent: Math.round(25 + (pageNum / numPages) * 55),
            originalSize,
            currentSize: runningSize || Math.round((pageNum / numPages) * originalSize * 0.45),
            currentPage: pageNum,
            totalPages: numPages,
            targetMax: strictMaxThreshold,
            detail: 'الحفاظ على أبعاد واتجاه الصفحة ونقاء أختام النسر والتوقيعات',
          });
        }

        const page = await pdf.getPage(pageNum);

        // 1. أبعاد الصفحة الأصلية بوحدات الـ PDF النقاطية (Points)
        const origViewport = page.getViewport({ scale: 1 });
        const origWidth = origViewport.width;
        const origHeight = origViewport.height;

        // 2. أبعاد الرسم بدقة الـ DPI المستهدفة العالية
        const renderViewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(renderViewport.width);
        canvas.height = Math.round(renderViewport.height);
        const ctx = canvas.getContext('2d', { alpha: false });

        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          await page.render({
            canvasContext: ctx,
            viewport: renderViewport,
          }).promise;
        }

        // ضغط صفحة المستند كـ JPEG بألوان كاملة 24-bit
        const pageJpgBlob = await new Promise<Blob>((res) =>
          canvas.toBlob((b) => res(b!), 'image/jpeg', jpegQuality)
        );

        runningSize += pageJpgBlob.size;
        const pageBytes = await pageJpgBlob.arrayBuffer();
        const embeddedImg = await outputPdf.embedJpg(pageBytes);

        // 3. الحفاظ على أبعاد ونسب الصفحة الأصلية تماماً دون فرض A4 أو قص أو تمدد
        const newPage = outputPdf.addPage([origWidth, origHeight]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: origWidth,
          height: origHeight,
        });
      }

      const finalPdfBytes = await outputPdf.save({ useObjectStreams: true });
      return new Blob([finalPdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    };

    // جودة ابتدائية نقية تمنع تشوه النصوص (76% للمستندات القصيرة، 70% للمتوسطة)
    let quality = numPages <= 2 ? 0.76 : (numPages <= 5 ? 0.71 : 0.66);
    let finalBlob = await buildCompressedPdf(scaleFactor, quality, true);

    onProgress?.({
      stage: 'تجميع وضغط مستند الـ PDF النهائي',
      percent: 85,
      originalSize,
      currentSize: finalBlob.size,
      totalPages: numPages,
      currentPage: numPages,
      targetMax: strictMaxThreshold,
      detail: `الحجم الحالي: ${(finalBlob.size / 1024).toFixed(1)} KB`,
    });

    // حلقة ضبط تدريجية هادئة مع حد أدنى صارم للجودة:
    // لا ننزل عن 120 DPI ولا عن 58% جودة لحماية وضوح المستند القضائي
    let attempts = 0;
    const dpiFloor = 120;
    const qualityFloor = 0.58;

    while (finalBlob.size > strictMaxThreshold && attempts < 4) {
      attempts++;
      const currentDpi = scaleFactor * 72;

      if (quality > qualityFloor + 0.04) {
        quality = Math.max(qualityFloor, quality - 0.06);
      } else if (currentDpi > dpiFloor) {
        scaleFactor = Math.max(dpiFloor / 72, scaleFactor * 0.90);
        quality = 0.64; // إعادة رفع الجودة عند خفض الأبعاد
      } else {
        // وصلنا للحد الأدنى المسموح لسلامة الخطوط والأختام - نتوقف لحماية المستند
        break;
      }

      finalBlob = await buildCompressedPdf(scaleFactor, quality, false);

      onProgress?.({
        stage: `موازنة تدريجية لاشتراط < 500 KB (خطوة ${attempts})`,
        percent: Math.min(95, 85 + attempts * 2),
        originalSize,
        currentSize: finalBlob.size,
        totalPages: numPages,
        currentPage: numPages,
        targetMax: strictMaxThreshold,
        detail: `الحجم: ${(finalBlob.size / 1024).toFixed(1)} KB • الجودة: ${Math.round(quality * 100)}%`,
      });
    }

    const compressedSize = finalBlob.size;
    const reductionPercentage = Math.max(
      1,
      Math.round(((originalSize - compressedSize) / originalSize) * 100)
    );

    onProgress?.({
      stage: 'اكتمل ضغط مستند الـ PDF بنجاح وجاهز للمنظومة',
      percent: 100,
      originalSize,
      currentSize: compressedSize,
      totalPages: numPages,
      currentPage: numPages,
      targetMax: strictMaxThreshold,
      detail: `الحجم النهائي: ${(compressedSize / 1024).toFixed(1)} KB (وفرت ${reductionPercentage}%)`,
    });

    return {
      blob: finalBlob,
      url: URL.createObjectURL(finalBlob),
      originalSize,
      compressedSize,
      reductionPercentage,
      name: file.name.replace(/\.[^/.]+$/, '') + '_compressed.pdf',
    };
  } catch (err) {
    console.warn('Advanced PDF compression fallback:', err);
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const bytes = await pdfDoc.save({ useObjectStreams: true });
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });

    return {
      blob,
      url: URL.createObjectURL(blob),
      originalSize,
      compressedSize: blob.size,
      reductionPercentage: Math.max(1, Math.round(((originalSize - blob.size) / originalSize) * 100)),
      name: file.name.replace(/\.[^/.]+$/, '') + '_optimized.pdf',
    };
  }
}
