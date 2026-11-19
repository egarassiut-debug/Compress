import { PDFDocument } from 'pdf-lib';

export interface NormalizedPoint {
  x: number; // 0..1 relative to image width
  y: number; // 0..1 relative to image height
}

export type QuadCorners = [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint]; // TL, TR, BR, BL

export interface ScannedPage {
  id: string;
  originalUrl: string;
  originalBlob: Blob;
  originalWidth: number;
  originalHeight: number;
  corners: QuadCorners;
  rotationDeg: number; // multiples of 45 degrees (0, 45, 90, 135, 180, 225, 270, 315)
  processedUrl: string;
  processedBlob: Blob;
  processedSize: number;
  isProcessing?: boolean;
}

export interface StabilityAnalysis {
  diffScore: number;
  status: 'calm' | 'minor_jitter' | 'moving';
  isStableEnough: boolean;
}

export interface ScannerExportResult {
  images: Array<{ name: string; blob: Blob; url: string; size: number }>;
  pdf: {
    name: string;
    blob: Blob;
    url: string;
    size: number;
    exceededLimit: boolean;
  };
}

export const DEFAULT_SCAN_QUAD: QuadCorners = [
  { x: 0.06, y: 0.06 },
  { x: 0.94, y: 0.06 },
  { x: 0.94, y: 0.94 },
  { x: 0.06, y: 0.94 },
];

export const STRICT_500KB_BYTES = 500 * 1024;
export const SAFE_TARGET_BYTES = 485 * 1024;

/**
 * تحميل Blob / File في HTMLImageElement بأمان
 */
export function loadImageFromBlob(blob: Blob): Promise<{ img: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, objectUrl });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('تعذر قراءة بيانات الصورة الملتقطة'));
    };
    img.src = objectUrl;
  });
}

/**
 * تحليل ذكي لحركة الكاميرا على إطارات مصغرة:
 * - يتجاهل الاهتزاز البسيط الطبيعي لليد دون إزعاج المستخدم
 * - يكتشف الحركة الفعلية المؤثرة على وضوح المستند
 */
export function analyzeFrameStability(
  prevGray: Uint8Array | null,
  currGray: Uint8Array
): StabilityAnalysis {
  if (!prevGray || prevGray.length !== currGray.length) {
    return { diffScore: 0, status: 'calm', isStableEnough: true };
  }

  let totalDiff = 0;
  const len = currGray.length;
  for (let i = 0; i < len; i++) {
    totalDiff += Math.abs(currGray[i] - prevGray[i]);
  }
  const diffScore = totalDiff / len;

  // عتبات ذكية: الاهتزاز الطفيف (< 6.5) لا يثير تنبيهاً، والحركة المؤثرة (> 13.5) فقط تنبّه
  if (diffScore < 6.5) {
    return { diffScore, status: 'calm', isStableEnough: true };
  }
  if (diffScore < 13.5) {
    return { diffScore, status: 'minor_jitter', isStableEnough: false };
  }
  return { diffScore, status: 'moving', isStableEnough: false };
}

/**
 * استخراج مصفوفة رمادية مصغرة من عنصر الفيديو أو الكانفاس لتحليل الحدود والثبات بأقل استهلاك ذاكرة
 */
export function sampleGrayscaleFrame(
  source: HTMLVideoElement | HTMLCanvasElement,
  sampleW = 120,
  sampleH = 160
): { gray: Uint8Array; width: number; height: number } {
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { gray: new Uint8Array(sampleW * sampleH), width: sampleW, height: sampleH };
  }
  ctx.drawImage(source, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
  const gray = new Uint8Array(sampleW * sampleH);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  return { gray, width: sampleW, height: sampleH };
}

/**
 * اكتشاف تلقائي لأطراف الورقة/المستند داخل الإطار عبر تحليل التباين والحواف والسطوع النسبي
 */
export function detectDocumentQuadFromGray(
  gray: Uint8Array,
  w: number,
  h: number
): { quad: QuadCorners; confidence: number } {
  // حساب حدود الورقة عبر مسح الحواف (Sobel gradient) وشدة السطوع المميزة للورق
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const meanLum = sum / Math.max(1, gray.length);
  const brightThreshold = Math.min(220, Math.max(95, meanLum + 14));

  const grad = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[(y - 1) * w + (x - 1)] +
        gray[(y - 1) * w + (x + 1)] -
        2 * gray[y * w + (x - 1)] +
        2 * gray[y * w + (x + 1)] -
        gray[(y + 1) * w + (x - 1)] +
        gray[(y + 1) * w + (x + 1)];
      const gy =
        -gray[(y - 1) * w + (x - 1)] -
        2 * gray[(y - 1) * w + x] -
        gray[(y - 1) * w + (x + 1)] +
        gray[(y + 1) * w + (x - 1)] +
        2 * gray[(y + 1) * w + x] +
        gray[(y + 1) * w + (x + 1)];
      grad[y * w + x] = Math.abs(gx) + Math.abs(gy);
    }
  }

  // البحث عن الزوايا الأربع عبر تعظيم (المسافة للزاوية الخارجية مع وجود حافة + سطوع داخلي للورقة)
  let tl = { x: w * 0.08, y: h * 0.08, score: -1e9 };
  let tr = { x: w * 0.92, y: h * 0.08, score: -1e9 };
  let br = { x: w * 0.92, y: h * 0.92, score: -1e9 };
  let bl = { x: w * 0.08, y: h * 0.92, score: -1e9 };

  let edgePoints = 0;
  const minMarginX = Math.floor(w * 0.04);
  const maxMarginX = Math.floor(w * 0.96);
  const minMarginY = Math.floor(h * 0.04);
  const maxMarginY = Math.floor(h * 0.96);

  for (let y = minMarginY; y < maxMarginY; y++) {
    for (let x = minMarginX; x < maxMarginX; x++) {
      const g = grad[y * w + x];
      const lum = gray[y * w + x];
      if (g < 55 || lum < brightThreshold * 0.65) continue;
      edgePoints++;

      const nx = x / w;
      const ny = y / h;
      const edgeWeight = Math.min(g, 240) * 0.35;

      // TL يفضل القرب من (0,0) في الربع العلوي الأيسر
      if (nx < 0.48 && ny < 0.48) {
        const s = edgeWeight - (nx + ny) * 140;
        if (s > tl.score) tl = { x, y, score: s };
      }
      // TR يفضل القرب من (1,0)
      if (nx > 0.52 && ny < 0.48) {
        const s = edgeWeight - (1 - nx + ny) * 140;
        if (s > tr.score) tr = { x, y, score: s };
      }
      // BR يفضل القرب من (1,1)
      if (nx > 0.52 && ny > 0.52) {
        const s = edgeWeight - (1 - nx + (1 - ny)) * 140;
        if (s > br.score) br = { x, y, score: s };
      }
      // BL يفضل القرب من (0,1)
      if (nx < 0.48 && ny > 0.52) {
        const s = edgeWeight - (nx + (1 - ny)) * 140;
        if (s > bl.score) bl = { x, y, score: s };
      }
    }
  }

  const foundAll =
    tl.score > -1e8 && tr.score > -1e8 && br.score > -1e8 && bl.score > -1e8 && edgePoints > 35;

  if (!foundAll) {
    return {
      quad: [
        { x: 0.07, y: 0.07 },
        { x: 0.93, y: 0.07 },
        { x: 0.93, y: 0.93 },
        { x: 0.07, y: 0.93 },
      ],
      confidence: 0.45,
    };
  }

  const rawQuad: QuadCorners = [
    { x: clamp01(tl.x / w), y: clamp01(tl.y / h) },
    { x: clamp01(tr.x / w), y: clamp01(tr.y / h) },
    { x: clamp01(br.x / w), y: clamp01(br.y / h) },
    { x: clamp01(bl.x / w), y: clamp01(bl.y / h) },
  ];

  // التحقق من مساحة الرباعي كي لا يكون ضيقاً أو مشوهاً
  const spanW = ((rawQuad[1].x - rawQuad[0].x) + (rawQuad[2].x - rawQuad[3].x)) * 0.5;
  const spanH = ((rawQuad[3].y - rawQuad[0].y) + (rawQuad[2].y - rawQuad[1].y)) * 0.5;
  if (spanW < 0.30 || spanH < 0.30) {
    return {
      quad: [
        { x: 0.07, y: 0.07 },
        { x: 0.93, y: 0.07 },
        { x: 0.93, y: 0.93 },
        { x: 0.07, y: 0.93 },
      ],
      confidence: 0.5,
    };
  }

  return { quad: rawQuad, confidence: Math.min(0.95, 0.6 + edgePoints / 1200) };
}

function clamp01(v: number): number {
  return Math.max(0.01, Math.min(0.99, v));
}

/**
 * حل مصفوفة التحويل الإسقاطي (Homography) لتصحيح المنظور والميل من أي 4 نقاط إلى مستطيل A4/متناسب
 */
function computeHomography(
  src: Array<{ x: number; y: number }>,
  dst: Array<{ x: number; y: number }>
): number[] {
  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;
    a.push([dx, dy, 1, 0, 0, 0, -dx * sx, -dy * sx]);
    b.push(sx);
    a.push([0, 0, 0, dx, dy, 1, -dx * sy, -dy * sy]);
    b.push(sy);
  }

  // Gaussian elimination
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > Math.abs(a[maxRow][i])) maxRow = k;
    }
    [a[i], a[maxRow]] = [a[maxRow], a[i]];
    [b[i], b[maxRow]] = [b[maxRow], b[i]];

    const pivot = a[i][i] || 1e-12;
    for (let j = i; j < n; j++) a[i][j] /= pivot;
    b[i] /= pivot;

    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = a[k][i];
      for (let j = i; j < n; j++) a[k][j] -= factor * a[i][j];
      b[k] -= factor * b[i];
    }
  }

  return [...b, 1];
}

/**
 * قص الورقة وتصحيح المنظور والميل + التدوير اليدوي (مضاعفات 45 درجة)
 */
export function warpAndRotateDocument(
  sourceImg: HTMLImageElement | HTMLCanvasElement,
  corners: QuadCorners,
  rotationDeg: number,
  maxWorkingDim = 1850
): HTMLCanvasElement {
  const srcW = sourceImg.width;
  const srcH = sourceImg.height;

  const pts = corners.map((p) => ({ x: p.x * srcW, y: p.y * srcH }));
  const topW = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const bottomW = Math.hypot(pts[2].x - pts[3].x, pts[2].y - pts[3].y);
  const leftH = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
  const rightH = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);

  let outW = Math.max(200, Math.round(Math.max(topW, bottomW)));
  let outH = Math.max(200, Math.round(Math.max(leftH, rightH)));

  if (outW > maxWorkingDim || outH > maxWorkingDim) {
    const scale = maxWorkingDim / Math.max(outW, outH);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }

  // رسم الصورة المصدرية في كانفاس مؤقت لقراءة البكسلات
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
  srcCtx.drawImage(sourceImg, 0, 0, srcW, srcH);
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;

  const warpedCanvas = document.createElement('canvas');
  warpedCanvas.width = outW;
  warpedCanvas.height = outH;
  const warpedCtx = warpedCanvas.getContext('2d', { willReadFrequently: true })!;
  const dstImg = warpedCtx.createImageData(outW, outH);
  const dstData = dstImg.data;

  const dstCorners = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const H = computeHomography(pts, dstCorners);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = H[6] * x + H[7] * y + H[8];
      const sx = (H[0] * x + H[1] * y + H[2]) / denom;
      const sy = (H[3] * x + H[4] * y + H[5]) / denom;

      const x0 = Math.max(0, Math.min(srcW - 2, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(srcH - 2, Math.floor(sy)));
      const fx = Math.max(0, Math.min(1, sx - x0));
      const fy = Math.max(0, Math.min(1, sy - y0));

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x0 + 1) * 4;
      const i01 = ((y0 + 1) * srcW + x0) * 4;
      const i11 = ((y0 + 1) * srcW + x0 + 1) * 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const di = (y * outW + x) * 4;
      dstData[di] = srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11;
      dstData[di + 1] =
        srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11;
      dstData[di + 2] =
        srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11;
      dstData[di + 3] = 255;
    }
  }
  warpedCtx.putImageData(dstImg, 0, 0);

  // تطبيق التدوير اليدوي (مضاعفات 45 درجة دقيقة دون قص الزوايا)
  const normAngle = ((rotationDeg % 360) + 360) % 360;
  if (normAngle === 0) {
    return warpedCanvas;
  }

  const rad = (normAngle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const rotW = Math.round(outW * cos + outH * sin);
  const rotH = Math.round(outW * sin + outH * cos);

  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rCtx = rotCanvas.getContext('2d')!;
  rCtx.fillStyle = '#FFFFFF';
  rCtx.fillRect(0, 0, rotW, rotH);
  rCtx.translate(rotW / 2, rotH / 2);
  rCtx.rotate(rad);
  rCtx.imageSmoothingEnabled = true;
  rCtx.imageSmoothingQuality = 'high';
  rCtx.drawImage(warpedCanvas, -outW / 2, -outH / 2);
  return rotCanvas;
}

/**
 * التحسين التلقائي للمستندات القانونية (ألوان كاملة + إزالة الظلال والبقع + توحيد الإضاءة + حدة متزنة):
 * - يحافظ على ألوان الأختام الحمراء والزرقاء والمداد اليدوي والعلامات المائية
 * - لا يحوّل الصورة للأبيض والأسود ولا يخترع أي تفاصيل
 */
export function enhanceLegalDocumentCanvas(inputCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = inputCanvas.width;
  const h = inputCanvas.height;
  const ctx = inputCanvas.getContext('2d', { willReadFrequently: true })!;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. بناء خريطة الإضاءة الخلفية المحلية لتوحيد الإضاءة وإزالة ظلال اليد والهاتف
  const gridCols = 24;
  const gridRows = 32;
  const bgGrid = new Float32Array(gridCols * gridRows);
  const cellW = w / gridCols;
  const cellH = h / gridRows;

  for (let gy = 0; gy < gridRows; gy++) {
    const yStart = Math.floor(gy * cellH);
    const yEnd = Math.min(h, Math.ceil((gy + 1) * cellH));
    for (let gx = 0; gx < gridCols; gx++) {
      const xStart = Math.floor(gx * cellW);
      const xEnd = Math.min(w, Math.ceil((gx + 1) * cellW));

      // أخذ المئين ~88 من الإضاءة داخل الخلية لتقدير لون الورقة الفعلي دون تأثر بالحبر الداكن
      const samples: number[] = [];
      const stepY = Math.max(1, Math.floor((yEnd - yStart) / 6));
      const stepX = Math.max(1, Math.floor((xEnd - xStart) / 6));
      for (let y = yStart; y < yEnd; y += stepY) {
        for (let x = xStart; x < xEnd; x += stepX) {
          const i = (y * w + x) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          samples.push(lum);
        }
      }
      samples.sort((a, b) => a - b);
      const p88 = samples.length > 0 ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.88))] : 235;
      bgGrid[gy * gridCols + gx] = Math.max(95, p88);
    }
  }

  // تنعيم خريطة الإضاءة لمنع أي مربعات حادة
  const smoothBg = new Float32Array(gridCols * gridRows);
  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      let acc = 0;
      let cnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx >= 0 && nx < gridCols && ny >= 0 && ny < gridRows) {
            acc += bgGrid[ny * gridCols + nx];
            cnt++;
          }
        }
      }
      smoothBg[gy * gridCols + gx] = acc / cnt;
    }
  }

  // 2. توحيد الإضاءة ومعالجة الإضاءة المنخفضة مع الحفاظ التام على نسب الألوان RGB (الأختام والتوقيعات)
  const targetPaperLum = 242;
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < h; y++) {
    const gyf = (y + 0.5) / cellH - 0.5;
    const gy0 = Math.max(0, Math.min(gridRows - 2, Math.floor(gyf)));
    const fy = Math.max(0, Math.min(1, gyf - gy0));

    for (let x = 0; x < w; x++) {
      const gxf = (x + 0.5) / cellW - 0.5;
      const gx0 = Math.max(0, Math.min(gridCols - 2, Math.floor(gxf)));
      const fx = Math.max(0, Math.min(1, gxf - gx0));

      const bg00 = smoothBg[gy0 * gridCols + gx0];
      const bg10 = smoothBg[gy0 * gridCols + gx0 + 1];
      const bg01 = smoothBg[(gy0 + 1) * gridCols + gx0];
      const bg11 = smoothBg[(gy0 + 1) * gridCols + gx0 + 1];
      const localBg =
        bg00 * (1 - fx) * (1 - fy) +
        bg10 * fx * (1 - fy) +
        bg01 * (1 - fx) * fy +
        bg11 * fx * fy;

      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // حساب معامل تفتيح الإضاءة وتقليل الظلال بنسبة متزنة تحمي الخلفيات والعلامات المائية
      const gain = Math.min(1.85, Math.max(0.95, targetPaperLum / Math.max(85, localBg)));
      // مزج متوازن (72% معالجة ظل + 28% أصلي) للحفاظ على طبيعة الورق والتفاصيل الدقيقة
      const effectiveGain = 1 + (gain - 1) * 0.72;

      let nr = r * effectiveGain;
      let ng = g * effectiveGain;
      let nb = b * effectiveGain;

      // تحسين تباين خفيف لإبراز الكتابة والأرقام الباهتة مع حماية التشبع اللوني للأختام
      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      const maxCh = Math.max(nr, ng, nb);
      const minCh = Math.min(nr, ng, nb);
      const chroma = maxCh - minCh;

      if (chroma < 26 && lum > 205) {
        // خلفية الورقة: تبييض ناعم فقط دون مسح العلامات المائية أو النصوص
        const lift = (lum - 205) * 0.28;
        nr += lift;
        ng += lift;
        nb += lift;
      } else if (lum < 155) {
        // الكتابات الداكنة والتوقيعات: زيادة وضوح متزنة دون إفساد الألوان
        const darken = (155 - lum) * 0.12;
        nr = Math.max(0, nr - darken);
        ng = Math.max(0, ng - darken);
        nb = Math.max(0, nb - darken);
      }

      out[idx] = Math.max(0, Math.min(255, Math.round(nr)));
      out[idx + 1] = Math.max(0, Math.min(255, Math.round(ng)));
      out[idx + 2] = Math.max(0, Math.min(255, Math.round(nb)));
      out[idx + 3] = 255;
    }
  }

  // 3. حدة لطيفة (Unsharp Mask خفيف بمقدار 0.22) لتوضيح الحروف العربية والأرقام دون هالات
  const finalData = new Uint8ClampedArray(out);
  const amount = 0.22;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = out[idx + c];
        const avgNeighbors =
          (out[((y - 1) * w + x) * 4 + c] +
            out[((y + 1) * w + x) * 4 + c] +
            out[(y * w + (x - 1)) * 4 + c] +
            out[(y * w + (x + 1)) * 4 + c]) *
          0.25;
        const sharpened = center + (center - avgNeighbors) * amount;
        finalData[idx + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
      }
    }
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.putImageData(new ImageData(finalData, w, h), 0, 0);
  return outCanvas;
}

/**
 * تصغير الأبعاد تدريجياً بجودة عالية لحماية وضوح النصوص والأختام داخل الماسح الضوئي
 */
function resizeCanvasStepped(source: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  if (Math.max(w, h) <= maxDim) return source;

  const ratio = maxDim / Math.max(w, h);
  const targetW = Math.max(1, Math.round(w * ratio));
  const targetH = Math.max(1, Math.round(h * ratio));

  let cur = source;
  let cw = w;
  let ch = h;

  while (cw * 0.5 > targetW && ch * 0.5 > targetH) {
    cw = Math.round(cw * 0.5);
    ch = Math.round(ch * 0.5);
    const step = document.createElement('canvas');
    step.width = cw;
    step.height = ch;
    const sCtx = step.getContext('2d')!;
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(cur, 0, 0, cw, ch);
    cur = step;
  }

  const dst = document.createElement('canvas');
  dst.width = targetW;
  dst.height = targetH;
  const dCtx = dst.getContext('2d')!;
  dCtx.imageSmoothingEnabled = true;
  dCtx.imageSmoothingQuality = 'high';
  dCtx.fillStyle = '#FFFFFF';
  dCtx.fillRect(0, 0, targetW, targetH);
  dCtx.drawImage(cur, 0, 0, targetW, targetH);
  return dst;
}

/**
 * معالجة صفحة واحدة من الكاميرا (قص + تصحيح منظور + تدوير 45° + تحسين تلقائي + تحضير للمعاينة < 500 KB)
 */
export async function processCapturedDocumentPage(
  originalBlob: Blob,
  corners: QuadCorners,
  rotationDeg: number
): Promise<{
  processedBlob: Blob;
  processedUrl: string;
  originalWidth: number;
  originalHeight: number;
}> {
  const { img, objectUrl } = await loadImageFromBlob(originalBlob);
  try {
    const originalWidth = img.width;
    const originalHeight = img.height;
    const warped = warpAndRotateDocument(img, corners, rotationDeg, 1850);
    const enhanced = enhanceLegalDocumentCanvas(warped);

    // ضغط مبدئي عالي الوضوح (< 500 KB) دون إعادة ضغط زائدة لاحقاً إذا تحقق الحجم
    let quality = 0.85;
    let maxDim = Math.max(enhanced.width, enhanced.height);
    let working = enhanced;
    let blob = await new Promise<Blob>((res) =>
      working.toBlob((b) => res(b!), 'image/jpeg', quality)
    );

    let attempts = 0;
    while (blob.size > SAFE_TARGET_BYTES && attempts < 7) {
      attempts++;
      if (quality > 0.66) {
        quality = Math.max(0.64, quality - 0.05);
      } else if (maxDim > 1150) {
        maxDim = Math.max(1150, Math.round(maxDim * 0.88));
        working = resizeCanvasStepped(enhanced, maxDim);
        quality = 0.72;
      } else {
        quality = Math.max(0.56, quality - 0.04);
      }
      blob = await new Promise<Blob>((res) =>
        working.toBlob((b) => res(b!), 'image/jpeg', quality)
      );
    }

    const processedUrl = URL.createObjectURL(blob);
    return {
      processedBlob: blob,
      processedUrl,
      originalWidth,
      originalHeight,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * تحضير وحساب المخرجات الثنائية المزدوجة (صور منفصلة Scan_001..N كل منها < 500KB + ملف PDF واحد Scanned_Document.pdf < 500KB)
 * يتم التحقق فعلياً من حجم كل صورة وحجم الـ PDF الكامل.
 */
export async function buildScannerOutputs(
  pages: ScannedPage[],
  onProgress?: (label: string, percent: number) => void
): Promise<ScannerExportResult> {
  if (pages.length === 0) {
    throw new Error('لا توجد صفحات مصورة للحفظ');
  }

  // 1. التحقق وتجهيز كل صورة منفصلة بشكل تدريجي لتقليل استهلاك الذاكرة (كل صورة < 500 KB)
  const imageOutputs: Array<{ name: string; blob: Blob; url: string; size: number }> = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const indexStr = String(i + 1).padStart(3, '0');
    const fileName = `Scan_${indexStr}.jpg`;

    onProgress?.(`تجهيز والتحقق من الصورة ${i + 1} من ${pages.length}...`, Math.round(((i + 0.5) / (pages.length + 1)) * 65));

    let imgBlob = page.processedBlob;

    // لا تعالج الملفات التي أصبحت أقل من 500KB بلا داعٍ
    if (imgBlob.size >= STRICT_500KB_BYTES) {
      const { img, objectUrl } = await loadImageFromBlob(imgBlob);
      try {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d')!.drawImage(img, 0, 0);

        let maxDim = Math.min(1800, Math.max(img.width, img.height));
        let q = 0.78;
        let working = resizeCanvasStepped(c, maxDim);
        imgBlob = await new Promise<Blob>((res) => working.toBlob((b) => res(b!), 'image/jpeg', q));

        let step = 0;
        while (imgBlob.size >= STRICT_500KB_BYTES && step < 8) {
          step++;
          if (q > 0.58) {
            q -= 0.05;
          } else {
            maxDim = Math.max(950, Math.round(maxDim * 0.85));
            working = resizeCanvasStepped(c, maxDim);
            q = 0.66;
          }
          imgBlob = await new Promise<Blob>((res) => working.toBlob((b) => res(b!), 'image/jpeg', q));
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    if (imgBlob.size >= STRICT_500KB_BYTES) {
      throw new Error(`تعذر تقليص ${fileName} لأقل من 500 KB دون الإضرار بالوضوح (${(imgBlob.size / 1024).toFixed(1)} KB)`);
    }

    imageOutputs.push({
      name: fileName,
      blob: imgBlob,
      url: URL.createObjectURL(imgBlob),
      size: imgBlob.size,
    });
  }

  // 2. تجميع كل الصفحات في ملف PDF واحد (Scanned_Document.pdf) بحد أقصى 500 KB للملف بالكامل
  onProgress?.('إنشاء ملف Scanned_Document.pdf المجمع...', 70);

  const buildPdfFromPages = async (maxDim: number, quality: number): Promise<Blob> => {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pages.length; i++) {
      const { img, objectUrl } = await loadImageFromBlob(pages[i].processedBlob);
      try {
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = img.width;
        srcCanvas.height = img.height;
        srcCanvas.getContext('2d')!.drawImage(img, 0, 0);

        const scaled = resizeCanvasStepped(srcCanvas, maxDim);
        const pageJpg = await new Promise<Blob>((res) =>
          scaled.toBlob((b) => res(b!), 'image/jpeg', quality)
        );
        const jpgBytes = await pageJpg.arrayBuffer();
        const embedded = await pdfDoc.embedJpg(jpgBytes);

        const isLandscape = img.width > img.height;
        const pageWidth = isLandscape ? 841.89 : 595.28;
        const pageHeight = isLandscape ? 595.28 : 841.89;
        const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);

        const margin = 8;
        const availW = pageWidth - margin * 2;
        const availH = pageHeight - margin * 2;
        const scale = Math.min(availW / embedded.width, availH / embedded.height);
        const rw = embedded.width * scale;
        const rh = embedded.height * scale;

        pdfPage.drawImage(embedded, {
          x: margin + (availW - rw) / 2,
          y: margin + (availH - rh) / 2,
          width: rw,
          height: rh,
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
    const bytes = await pdfDoc.save({ useObjectStreams: true });
    return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  };

  const pageCount = pages.length;
  let pdfDim = pageCount === 1 ? 1850 : pageCount <= 3 ? 1550 : pageCount <= 6 ? 1300 : 1120;
  let pdfQuality = pageCount === 1 ? 0.82 : pageCount <= 3 ? 0.75 : pageCount <= 6 ? 0.68 : 0.62;

  let pdfBlob = await buildPdfFromPages(pdfDim, pdfQuality);

  // تدرج متوازن للوصول لأقل من 500 KB للملف بالكامل مع احترام حد الأمان لعدم إفساد النصوص
  let attempt = 0;
  const qualityFloor = 0.56;
  const dimFloor = 880;

  while (pdfBlob.size >= STRICT_500KB_BYTES && attempt < 7) {
    attempt++;
    onProgress?.(`موازنة حجم ملف الـ PDF (${(pdfBlob.size / 1024).toFixed(0)} KB)...`, Math.min(95, 72 + attempt * 3));

    if (pdfQuality > qualityFloor + 0.04) {
      pdfQuality = Math.max(qualityFloor, pdfQuality - 0.05);
    } else if (pdfDim > dimFloor) {
      pdfDim = Math.max(dimFloor, Math.round(pdfDim * 0.88));
      pdfQuality = 0.64;
    } else {
      break; // نتوقف عند الحد الآمن لحماية وضوح المستندات
    }
    pdfBlob = await buildPdfFromPages(pdfDim, pdfQuality);
  }

  onProgress?.('اكتمل التجهيز والتحقق من الأحجام', 100);

  return {
    images: imageOutputs,
    pdf: {
      name: 'Scanned_Document.pdf',
      blob: pdfBlob,
      url: URL.createObjectURL(pdfBlob),
      size: pdfBlob.size,
      exceededLimit: pdfBlob.size >= STRICT_500KB_BYTES,
    },
  };
}
