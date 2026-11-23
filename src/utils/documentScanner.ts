import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerLocalUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

export interface NormalizedPoint {
  x: number; // 0..1 relative to image width
  y: number; // 0..1 relative to image height
}

export type QuadCorners = [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint]; // TL, TR, BR, BL

export type ScannerFilterMode = 'color' | 'grayscale' | 'bw';

export interface ScannedPage {
  id: string;
  originalUrl: string;
  originalBlob: Blob;
  originalWidth: number;
  originalHeight: number;
  corners: QuadCorners;
  autoDetected: boolean;
  rotationDeg: number; // 0, 90, 180, 270
  filterMode: ScannerFilterMode;
  brightnessAdjust: number; // -30..+40 (0 = تحسين تلقائي افتراضي)
  sourceType?: 'camera' | 'image' | 'pdf';
  processedUrl: string;
  processedBlob: Blob;
  processedSize: number;
  isProcessing?: boolean;
  curvatureDetected?: boolean;
}

export interface StabilityAnalysis {
  diffScore: number;
  status: 'calm' | 'minor_jitter' | 'moving';
  isStableEnough: boolean;
}

export interface QuadDetectionResult {
  quad: QuadCorners;
  confidence: number;
  detected: boolean;
  sharpness: number;
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

export interface StudioImportResult {
  pages: ScannedPage[];
  manualCropIndexes: number[];
  skippedErrors: string[];
}

export const FULL_FRAME_QUAD: QuadCorners = [
  { x: 0.0, y: 0.0 },
  { x: 1.0, y: 0.0 },
  { x: 1.0, y: 1.0 },
  { x: 0.0, y: 1.0 },
];

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
 * تحليل ذكي لحركة الكاميرا على إطارات مصغرة
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

  if (diffScore < 6.5) {
    return { diffScore, status: 'calm', isStableEnough: true };
  }
  if (diffScore < 13.5) {
    return { diffScore, status: 'minor_jitter', isStableEnough: false };
  }
  return { diffScore, status: 'moving', isStableEnough: false };
}

/**
 * استخراج مصفوفة رمادية + قنوات RGB مصغرة من عنصر الفيديو أو الكانفاس لتحليل الحدود والثبات
 */
export function sampleGrayscaleFrame(
  source: HTMLVideoElement | HTMLCanvasElement,
  sampleW = 160,
  sampleH = 213
): { gray: Uint8Array; rgba: Uint8ClampedArray; width: number; height: number } {
  const canvas = document.createElement('canvas');
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      gray: new Uint8Array(sampleW * sampleH),
      rgba: new Uint8ClampedArray(sampleW * sampleH * 4),
      width: sampleW,
      height: sampleH,
    };
  }
  ctx.drawImage(source, 0, 0, sampleW, sampleH);
  const { data } = ctx.getImageData(0, 0, sampleW, sampleH);
  const gray = new Uint8Array(sampleW * sampleH);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  return { gray, rgba: data, width: sampleW, height: sampleH };
}

function computeLaplacianSharpness(gray: Uint8Array, w: number, h: number): number {
  const x0 = Math.max(1, Math.floor(w * 0.1));
  const x1 = Math.min(w - 1, Math.ceil(w * 0.9));
  const y0 = Math.max(1, Math.floor(h * 0.1));
  const y1 = Math.min(h - 1, Math.ceil(h * 0.9));

  let sumAbs = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = y * w + x;
      const lap =
        4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - w] - gray[idx + w];
      sumAbs += Math.abs(lap);
      count++;
    }
  }
  return count > 0 ? sumAbs / count : 0;
}

function gaussianBlur3x3(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out[y * w + x] = src[y * w + x];
        continue;
      }
      const c = y * w + x;
      out[c] =
        (src[c - w - 1] +
          2 * src[c - w] +
          src[c - w + 1] +
          2 * src[c - 1] +
          4 * src[c] +
          2 * src[c + 1] +
          src[c + w - 1] +
          2 * src[c + w] +
          src[c + w + 1]) >>
        4;
    }
  }
  return out;
}

function morphDilate3x3(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let any = 0;
      for (let dy = -1; dy <= 1 && !any; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (mask[(y + dy) * w + (x + dx)]) {
            any = 1;
            break;
          }
        }
      }
      out[y * w + x] = any;
    }
  }
  return out;
}

function morphErode3x3(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let all = 1;
      for (let dy = -1; dy <= 1 && all; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!mask[(y + dy) * w + (x + dx)]) {
            all = 0;
            break;
          }
        }
      }
      out[y * w + x] = all;
    }
  }
  return out;
}

function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 3) return points;
  const sorted = [...points].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Array<{ x: number; y: number }> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Array<{ x: number; y: number }> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function fitSideLine(
  hull: Array<{ x: number; y: number }>,
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): [number, number, number] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 6) return [-dy, dx, dy * p1.x - dx * p1.y];

  const nx = -dy / len;
  const ny = dx / len;
  const maxDist = Math.max(3.5, len * 0.08);
  const near: Array<{ x: number; y: number }> = [];

  for (const p of hull) {
    const dist = Math.abs((p.x - p1.x) * nx + (p.y - p1.y) * ny);
    const proj = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (len * len);
    if (dist <= maxDist && proj >= -0.06 && proj <= 1.06) {
      near.push(p);
    }
  }

  if (near.length < 2) {
    return [-dy, dx, dy * p1.x - dx * p1.y];
  }

  let mx = 0;
  let my = 0;
  for (const p of near) {
    mx += p.x;
    my += p.y;
  }
  mx /= near.length;
  my /= near.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of near) {
    const ux = p.x - mx;
    const uy = p.y - my;
    sxx += ux * ux;
    syy += uy * uy;
    sxy += ux * uy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const a = -Math.sin(theta);
  const b = Math.cos(theta);
  const c = -(a * mx + b * my);
  return [a, b, c];
}

function intersectLines(
  l1: [number, number, number],
  l2: [number, number, number],
  fallback: { x: number; y: number }
): { x: number; y: number } {
  const det = l1[0] * l2[1] - l2[0] * l1[1];
  if (Math.abs(det) < 1e-6) return fallback;
  const x = (l1[1] * l2[2] - l2[1] * l1[2]) / det;
  const y = (l2[0] * l1[2] - l1[0] * l2[2]) / det;
  if (Math.hypot(x - fallback.x, y - fallback.y) > 45) {
    return fallback;
  }
  return { x, y };
}

function quadArea(q: QuadCorners): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) * 0.5;
}

function isValidPaperQuad(c: QuadCorners): boolean {
  const area = quadArea(c);
  if (area < 0.13 || area > 0.96) return false;

  for (let i = 0; i < 4; i++) {
    const prev = c[(i + 3) % 4];
    const curr = c[i];
    const next = c[(i + 1) % 4];
    const v1x = prev.x - curr.x;
    const v1y = prev.y - curr.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 < 0.16 || l2 < 0.16) return false;
    const cosA = (v1x * v2x + v1y * v2y) / (l1 * l2);
    const deg = (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI;
    if (deg < 35 || deg > 145) return false;
    const cross = v2x * v1y - v2y * v1x;
    if (cross <= 0) return false;
  }
  return true;
}

function measureQuadEdgeSupport(c: QuadCorners, grad: Float32Array, w: number, h: number): number {
  let strong = 0;
  let total = 0;
  for (let side = 0; side < 4; side++) {
    const p0 = c[side];
    const p1 = c[(side + 1) % 4];
    const x0 = p0.x * (w - 1);
    const y0 = p0.y * (h - 1);
    const x1 = p1.x * (w - 1);
    const y1 = p1.y * (h - 1);
    const steps = 24;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const cx = Math.round(x0 + (x1 - x0) * t);
      const cy = Math.round(y0 + (y1 - y0) * t);
      let maxG = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const sx = Math.max(1, Math.min(w - 2, cx + dx));
          const sy = Math.max(1, Math.min(h - 2, cy + dy));
          const g = grad[sy * w + sx];
          if (g > maxG) maxG = g;
        }
      }
      total++;
      if (maxG >= 48) strong++;
    }
  }
  return total > 0 ? strong / total : 0;
}

/**
 * توسيع طفيف (~0.35%) نحو الخارج لتعويض التآكل الناتج عن التنعيم ومنع قص أطراف النص أو أرقام الصفحات
 */
function expandQuadSlightly(q: QuadCorners, padFraction = 0.004): QuadCorners {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) * 0.25;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) * 0.25;
  return q.map((p) => ({
    x: clamp01(p.x + (p.x - cx) * padFraction),
    y: clamp01(p.y + (p.y - cy) * padFraction),
  })) as QuadCorners;
}

/**
 * تحسين مواضع الزوايا الأربع محلياً نحو أقوى تقاطع تدرّجات حواف (Corner Refinement)
 */
function refineQuadCornersLocal(q: QuadCorners, grad: Float32Array, w: number, h: number): QuadCorners {
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) * 0.25;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) * 0.25;
  const refined = q.map((corner) => {
    const px = Math.round(corner.x * (w - 1));
    const py = Math.round(corner.y * (h - 1));
    let bestX = px;
    let bestY = py;
    let bestScore = grad[py * w + px];
    const radius = 3;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = Math.max(1, Math.min(w - 2, px + dx));
        const ny = Math.max(1, Math.min(h - 2, py + dy));
        // تشجيع التحرك للخارج قليلاً عند تساوي التدرّج لتفادي اقتطاع الحافة
        const distFromCenter = Math.hypot(nx / w - cx, ny / h - cy);
        const origDist = Math.hypot(corner.x - cx, corner.y - cy);
        const outwardBias = distFromCenter >= origDist ? 6 : 0;
        const sc = grad[ny * w + nx] + outwardBias;
        if (sc > bestScore) {
          bestScore = sc;
          bestX = nx;
          bestY = ny;
        }
      }
    }
    return { x: clamp01(bestX / (w - 1)), y: clamp01(bestY / (h - 1)) };
  }) as QuadCorners;

  return isValidPaperQuad(refined) ? expandQuadSlightly(refined, 0.004) : expandQuadSlightly(q, 0.004);
}

/**
 * كشف حقيقي لرباعي المستند متعدد القنوات (لا يعتمد على اللون الأبيض الثابت):
 * 1. تقدير لون وملمس الخلفية من الإطار المحيط + إزالة تأثير النقوش القماشية
 * 2. دمج مسافة اللون عن الخلفية + تدرّج Sobel اللوني لالتقاط الورق الأبيض والأصفر والملون
 * 3. إغلاق مورفولوجي + فتح خفيف لمنع امتداد القناع لظلال أو أوراق مجاورة
 * 4. استخراج أكبر مكوّن متصل + الغلاف المحدب + توفيق أضلاع Least-Squares + تحسين الزوايا محلياً
 */
export function detectDocumentQuadFromGray(
  gray: Uint8Array,
  w: number,
  h: number,
  rgba?: Uint8ClampedArray
): QuadDetectionResult {
  const sharpness = computeLaplacianSharpness(gray, w, h);
  const blurred = gaussianBlur3x3(gray, w, h);
  const totalPixels = w * h;

  // حساب تدرّج Sobel المتعدد القنوات (أو الرمادي إن لم تُمرّر RGBA)
  const grad = new Float32Array(totalPixels);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let maxG = 0;
      if (rgba) {
        for (let ch = 0; ch < 3; ch++) {
          const i00 = ((y - 1) * w + (x - 1)) * 4 + ch;
          const i10 = ((y - 1) * w + x) * 4 + ch;
          const i20 = ((y - 1) * w + (x + 1)) * 4 + ch;
          const i01 = (y * w + (x - 1)) * 4 + ch;
          const i21 = (y * w + (x + 1)) * 4 + ch;
          const i02 = ((y + 1) * w + (x - 1)) * 4 + ch;
          const i12 = ((y + 1) * w + x) * 4 + ch;
          const i22 = ((y + 1) * w + (x + 1)) * 4 + ch;
          const gx = -rgba[i00] + rgba[i20] - 2 * rgba[i01] + 2 * rgba[i21] - rgba[i02] + rgba[i22];
          const gy = -rgba[i00] - 2 * rgba[i10] - rgba[i20] + rgba[i02] + 2 * rgba[i12] + rgba[i22];
          const g = Math.abs(gx) + Math.abs(gy);
          if (g > maxG) maxG = g;
        }
      } else {
        const gx =
          -blurred[(y - 1) * w + (x - 1)] +
          blurred[(y - 1) * w + (x + 1)] -
          2 * blurred[y * w + (x - 1)] +
          2 * blurred[y * w + (x + 1)] -
          blurred[(y + 1) * w + (x - 1)] +
          blurred[(y + 1) * w + (x + 1)];
        const gy =
          -blurred[(y - 1) * w + (x - 1)] -
          2 * blurred[(y - 1) * w + x] -
          blurred[(y - 1) * w + (x + 1)] +
          blurred[(y + 1) * w + (x - 1)] +
          2 * blurred[(y + 1) * w + x] +
          blurred[(y + 1) * w + (x + 1)];
        maxG = Math.abs(gx) + Math.abs(gy);
      }
      grad[y * w + x] = maxG;
    }
  }

  // تقدير لون الخلفية من الإطار الخارجي + مقياس السطوع الوسطي للمستند
  const borderR: number[] = [];
  const borderG: number[] = [];
  const borderB: number[] = [];
  const borderLum: number[] = [];
  const bw = Math.max(3, Math.floor(w * 0.05));
  const bh = Math.max(3, Math.floor(h * 0.05));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < bw || x >= w - bw || y < bh || y >= h - bh) {
        const p = y * w + x;
        borderLum.push(blurred[p]);
        if (rgba) {
          borderR.push(rgba[p * 4]);
          borderG.push(rgba[p * 4 + 1]);
          borderB.push(rgba[p * 4 + 2]);
        }
      }
    }
  }

  borderLum.sort((a, b) => a - b);
  const bgLumMed = borderLum[Math.floor(borderLum.length * 0.5)] ?? 100;

  let bgMedR = bgLumMed;
  let bgMedG = bgLumMed;
  let bgMedB = bgLumMed;
  if (rgba && borderR.length > 0) {
    borderR.sort((a, b) => a - b);
    borderG.sort((a, b) => a - b);
    borderB.sort((a, b) => a - b);
    bgMedR = borderR[Math.floor(borderR.length * 0.5)];
    bgMedG = borderG[Math.floor(borderG.length * 0.5)];
    bgMedB = borderB[Math.floor(borderB.length * 0.5)];
  }

  // تقدير لون وسمات الورقة من المنطقة الوسطى (تجنب الاعتماد على الأبيض فقط)
  const centerR: number[] = [];
  const centerG: number[] = [];
  const centerB: number[] = [];
  const centerLum: number[] = [];
  const cx0 = Math.floor(w * 0.28);
  const cx1 = Math.floor(w * 0.72);
  const cy0 = Math.floor(h * 0.25);
  const cy1 = Math.floor(h * 0.75);

  for (let y = cy0; y < cy1; y++) {
    for (let x = cx0; x < cx1; x++) {
      const p = y * w + x;
      centerLum.push(blurred[p]);
      if (rgba) {
        centerR.push(rgba[p * 4]);
        centerG.push(rgba[p * 4 + 1]);
        centerB.push(rgba[p * 4 + 2]);
      }
    }
  }
  centerLum.sort((a, b) => a - b);
  const centerP75Lum = centerLum[Math.floor(centerLum.length * 0.75)] ?? 200;

  let docMedR = centerP75Lum;
  let docMedG = centerP75Lum;
  let docMedB = centerP75Lum;
  if (rgba && centerR.length > 0) {
    centerR.sort((a, b) => a - b);
    centerG.sort((a, b) => a - b);
    centerB.sort((a, b) => a - b);
    docMedR = centerR[Math.floor(centerR.length * 0.72)];
    docMedG = centerG[Math.floor(centerG.length * 0.72)];
    docMedB = centerB[Math.floor(centerB.length * 0.72)];
  }

  const lumSpan = centerP75Lum - bgLumMed;
  const rgbColorDistDocToBg = Math.hypot(docMedR - bgMedR, docMedG - bgMedG, docMedB - bgMedB);

  const mask = new Uint8Array(totalPixels);
  if (rgba && rgbColorDistDocToBg >= 24) {
    // تصنيف ذكي لكل بكسل: أقرب للورقة المتوقعة أم للخلفية المحيطة (يعمل مع الورق الأصفر/الرمادي/الملون)
    for (let i = 0; i < totalPixels; i++) {
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      const dToBg = Math.hypot(r - bgMedR, g - bgMedG, b - bgMedB);
      const dToDoc = Math.hypot(r - docMedR, g - docMedG, b - docMedB);
      const isPaperTone =
        dToDoc <= dToBg * 0.85 ||
        (lumSpan >= 18 && blurred[i] >= bgLumMed + lumSpan * 0.47);
      // منع القناع من التمدد عبر حافة حادة جداً (كظلال قوية أو فاصل بين صفحتين)
      mask[i] = isPaperTone ? 1 : 0;
    }
  } else {
    const threshold =
      lumSpan >= 18
        ? bgLumMed + Math.max(14, lumSpan * 0.45)
        : Math.max(95, Math.min(218, bgLumMed + 24));
    for (let i = 0; i < totalPixels; i++) {
      mask[i] = blurred[i] >= threshold ? 1 : 0;
    }
  }

  // إغلاق لسد فجوات النص داخل الورقة ثم فتح لإزالة نقاط النسيج والظلال
  const closed = morphErode3x3(morphDilate3x3(mask, w, h), w, h);
  const opened = morphDilate3x3(morphErode3x3(closed, w, h), w, h);

  // البحث عن أفضل مكوّن متصل (مع نقاط ترجيح للتوسّط + مساحة مناسبة + تجنّب امتلاء الإطار)
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let bestPerimeter: Array<{ x: number; y: number }> = [];
  let bestScore = -1;
  let bestArea = 0;

  for (let sy = 2; sy < h - 2; sy++) {
    for (let sx = 2; sx < w - 2; sx++) {
      const startIdx = sy * w + sx;
      if (opened[startIdx] === 0 || visited[startIdx] === 1) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      visited[startIdx] = 1;
      const perimeter: Array<{ x: number; y: number }> = [];
      let area = 0;
      let touchBorderCount = 0;
      let sumX = 0;
      let sumY = 0;

      while (head < tail) {
        const idx = queue[head++];
        const px = idx % w;
        const py = (idx / w) | 0;
        area++;
        sumX += px;
        sumY += py;
        if (px <= 2 || px >= w - 3 || py <= 2 || py >= h - 3) {
          touchBorderCount++;
        }

        let isEdge = false;
        const neighbors = [idx - 1, idx + 1, idx - w, idx + w];
        for (const nIdx of neighbors) {
          const nx = nIdx % w;
          const ny = (nIdx / w) | 0;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || opened[nIdx] === 0) {
            isEdge = true;
          } else if (visited[nIdx] === 0) {
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
          }
        }
        if (isEdge) {
          perimeter.push({ x: px, y: py });
        }
      }

      const areaRatio = area / totalPixels;
      if (areaRatio < 0.12 || areaRatio > 0.94 || touchBorderCount > area * 0.2) continue;

      const avgX = sumX / area / w;
      const avgY = sumY / area / h;
      const centerDist = Math.hypot(avgX - 0.5, avgY - 0.5);
      const score = areaRatio * 100 - centerDist * 42;
      if (score > bestScore && perimeter.length >= 20) {
        bestScore = score;
        bestArea = area;
        bestPerimeter = perimeter;
      }
    }
  }

  if (bestPerimeter.length >= 20) {
    const hull = convexHull(bestPerimeter);
    if (hull.length >= 4) {
      let tl0 = hull[0];
      let tr0 = hull[0];
      let br0 = hull[0];
      let bl0 = hull[0];
      let minSum = Infinity;
      let maxSum = -Infinity;
      let maxDiff = -Infinity;
      let minDiff = Infinity;

      for (const p of hull) {
        const s = p.x + p.y;
        const d = p.x - p.y;
        if (s < minSum) {
          minSum = s;
          tl0 = p;
        }
        if (s > maxSum) {
          maxSum = s;
          br0 = p;
        }
        if (d > maxDiff) {
          maxDiff = d;
          tr0 = p;
        }
        if (d < minDiff) {
          minDiff = d;
          bl0 = p;
        }
      }

      const lineTop = fitSideLine(hull, tl0, tr0);
      const lineRight = fitSideLine(hull, tr0, br0);
      const lineBottom = fitSideLine(hull, br0, bl0);
      const lineLeft = fitSideLine(hull, bl0, tl0);

      const tl = intersectLines(lineLeft, lineTop, tl0);
      const tr = intersectLines(lineTop, lineRight, tr0);
      const br = intersectLines(lineRight, lineBottom, br0);
      const bl = intersectLines(lineBottom, lineLeft, bl0);

      const fittedQuad: QuadCorners = [
        { x: clamp01(tl.x / (w - 1)), y: clamp01(tl.y / (h - 1)) },
        { x: clamp01(tr.x / (w - 1)), y: clamp01(tr.y / (h - 1)) },
        { x: clamp01(br.x / (w - 1)), y: clamp01(br.y / (h - 1)) },
        { x: clamp01(bl.x / (w - 1)), y: clamp01(bl.y / (h - 1)) },
      ];

      if (isValidPaperQuad(fittedQuad)) {
        const refined = refineQuadCornersLocal(fittedQuad, grad, w, h);
        const edgeSupport = measureQuadEdgeSupport(refined, grad, w, h);
        const areaVal = quadArea(refined);
        const blobCoverage = Math.min(1, bestArea / (areaVal * totalPixels + 1));
        const contrastFactor = Math.min(1, Math.max(Math.abs(lumSpan) / 55, rgbColorDistDocToBg / 65));
        const confidence = Math.min(0.98, edgeSupport * 0.5 + blobCoverage * 0.32 + contrastFactor * 0.18);

        if (edgeSupport >= 0.28 && confidence >= 0.50) {
          return { quad: refined, confidence, detected: true, sharpness };
        }
      }
    }
  }

  return {
    quad: [
      { ...FULL_FRAME_QUAD[0] },
      { ...FULL_FRAME_QUAD[1] },
      { ...FULL_FRAME_QUAD[2] },
      { ...FULL_FRAME_QUAD[3] },
    ],
    confidence: 0.2,
    detected: false,
    sharpness,
  };
}

/**
 * اكتشاف زوايا الورقة مباشرة من صورة مأخوذة (Blob/File) باستخدام التحليل متعدد القنوات
 */
export async function detectQuadOnBlob(blob: Blob): Promise<QuadDetectionResult> {
  const { img, objectUrl } = await loadImageFromBlob(blob);
  try {
    const sampleW = img.width >= img.height ? 266 : 200;
    const sampleH = img.width >= img.height ? 200 : 266;
    const canvas = document.createElement('canvas');
    canvas.width = sampleW;
    canvas.height = sampleH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return {
        quad: FULL_FRAME_QUAD,
        confidence: 0,
        detected: false,
        sharpness: 0,
      };
    }
    ctx.drawImage(img, 0, 0, sampleW, sampleH);
    const { gray, rgba, width, height } = sampleGrayscaleFrame(canvas, sampleW, sampleH);
    return detectDocumentQuadFromGray(gray, width, height, rgba);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function clamp01(v: number): number {
  return Math.max(0.0, Math.min(1.0, v));
}

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

function isFullFrameQuad(corners: QuadCorners): boolean {
  return (
    Math.abs(corners[0].x) < 0.005 &&
    Math.abs(corners[0].y) < 0.005 &&
    Math.abs(corners[1].x - 1) < 0.005 &&
    Math.abs(corners[1].y) < 0.005 &&
    Math.abs(corners[2].x - 1) < 0.005 &&
    Math.abs(corners[2].y - 1) < 0.005 &&
    Math.abs(corners[3].x) < 0.005 &&
    Math.abs(corners[3].y - 1) < 0.005
  );
}

/**
 * كشف انحناء الصفحة الحقيقي (للكتب المفتوحة أو الورق المقوّس) وإنتاج مصفوفة تصحيح Coons Mesh
 * لا يتفعّل إلا إذا ثبت وجود انحناء حقيقي مستمر > 1.2% من ارتفاع الصفحة، ولا يُشغّل أبداً على الصفحات المسطحة
 */
function detectAndApplyCurvedMeshDewarpIfNeeded(
  warpedCanvas: HTMLCanvasElement
): { canvas: HTMLCanvasElement; curvatureDetected: boolean } {
  const w = warpedCanvas.width;
  const h = warpedCanvas.height;
  if (w < 240 || h < 240) {
    return { canvas: warpedCanvas, curvatureDetected: false };
  }

  const ctx = warpedCanvas.getContext('2d', { willReadFrequently: true })!;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // فحص استقامة سطور النص الأفقية والحدين العلوي/السفلي عبر 25 شريحة طولية
  const samplesN = 25;
  const searchMargin = Math.max(8, Math.round(h * 0.045));
  const topOffset = new Float32Array(samplesN);
  const botOffset = new Float32Array(samplesN);

  const lumaAt = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(w - 1, x));
    const cy = Math.max(0, Math.min(h - 1, y));
    const i = (cy * w + cx) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  for (let s = 0; s < samplesN; s++) {
    const u = (s + 0.5) / samplesN;
    const x = Math.round(u * (w - 1));

    // البحث قرب الحافة العليا عن انقطاع حاد بين خلفية داكنة/مختلفة وبداية الورقة
    let bestTopY = 0;
    let bestTopGrad = 0;
    for (let y = 1; y < searchMargin; y++) {
      const g = Math.abs(lumaAt(x, y + 2) - lumaAt(x, y - 1));
      if (g > bestTopGrad) {
        bestTopGrad = g;
        bestTopY = y;
      }
    }
    topOffset[s] = bestTopGrad >= 18 ? bestTopY : 0;

    // البحث قرب الحافة السفلى
    let bestBotDy = 0;
    let bestBotGrad = 0;
    for (let y = h - 2; y > h - 1 - searchMargin; y--) {
      const g = Math.abs(lumaAt(x, y - 2) - lumaAt(x, y + 1));
      if (g > bestBotGrad) {
        bestBotGrad = g;
        bestBotDy = h - 1 - y;
      }
    }
    botOffset[s] = bestBotGrad >= 18 ? bestBotDy : 0;
  }

  // تنعيم الملفين عبر نافذة 5 نقاط وإزالة الانحدار الخطي للتحقق من وجود تقوّس حقيقي في الوسط
  const smoothProfile = (arr: Float32Array): { curve: Float32Array; maxSag: number } => {
    const sm = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let acc = 0;
      let cnt = 0;
      for (let d = -2; d <= 2; d++) {
        const j = Math.max(0, Math.min(arr.length - 1, i + d));
        acc += arr[j];
        cnt++;
      }
      sm[i] = acc / cnt;
    }
    const startV = sm[0];
    const endV = sm[sm.length - 1];
    let maxSag = 0;
    for (let i = 2; i < sm.length - 2; i++) {
      const lin = startV + ((endV - startV) * i) / (sm.length - 1);
      const sag = Math.abs(sm[i] - lin);
      if (sag > maxSag) maxSag = sag;
    }
    return { curve: sm, maxSag };
  };

  const topP = smoothProfile(topOffset);
  const botP = smoothProfile(botOffset);
  const sagThreshold = h * 0.012; // 1.2% من ارتفاع الصفحة (انحناء حقيقي واضح)
  const maxAllowed = h * 0.042;

  const topCurved = topP.maxSag >= sagThreshold && topP.maxSag <= maxAllowed;
  const botCurved = botP.maxSag >= sagThreshold && botP.maxSag <= maxAllowed;

  if (!topCurved && !botCurved) {
    return { canvas: warpedCanvas, curvatureDetected: false };
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d', { willReadFrequently: true })!;
  const dstImg = outCtx.createImageData(w, h);
  const dst = dstImg.data;

  const sampleCurveAt = (curve: Float32Array, u: number, active: boolean): number => {
    if (!active) return 0;
    const pos = Math.max(0, Math.min(curve.length - 1, u * (curve.length - 1)));
    const i0 = Math.floor(pos);
    const i1 = Math.min(curve.length - 1, i0 + 1);
    const f = pos - i0;
    return curve[i0] * (1 - f) + curve[i1] * f;
  };

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const topY = sampleCurveAt(topP.curve, u, topCurved);
      const botY = h - 1 - sampleCurveAt(botP.curve, u, botCurved);
      // تصحيح هندسي عمودي غير خطي يشد التقوّس لاستقامة الصفحة دون تشويه الحروف المسطحة
      const sy = Math.max(0, Math.min(h - 1, topY + v * (botY - topY)));
      const y0 = Math.max(0, Math.min(h - 2, Math.floor(sy)));
      const fy = sy - y0;

      const idx0 = (y0 * w + x) * 4;
      const idx1 = ((y0 + 1) * w + x) * 4;
      const di = (y * w + x) * 4;

      dst[di] = data[idx0] * (1 - fy) + data[idx1] * fy;
      dst[di + 1] = data[idx0 + 1] * (1 - fy) + data[idx1 + 1] * fy;
      dst[di + 2] = data[idx0 + 2] * (1 - fy) + data[idx1 + 2] * fy;
      dst[di + 3] = 255;
    }
  }

  outCtx.putImageData(dstImg, 0, 0);
  return { canvas: outCanvas, curvatureDetected: true };
}

/**
 * قص الورقة وتصحيح المنظور والميل + تصحيح الانحناء عند الحاجة + التدوير المتعامد النظيف 90° / 180° / 270°
 */
export function warpAndRotateDocument(
  sourceImg: HTMLImageElement | HTMLCanvasElement,
  corners: QuadCorners,
  rotationDeg: number,
  maxWorkingDim = 1850
): HTMLCanvasElement & { __curvatureDetected?: boolean } {
  const srcW = sourceImg.width;
  const srcH = sourceImg.height;

  let warpedCanvas: HTMLCanvasElement;

  if (isFullFrameQuad(corners)) {
    let outW = srcW;
    let outH = srcH;
    if (outW > maxWorkingDim || outH > maxWorkingDim) {
      const scale = maxWorkingDim / Math.max(outW, outH);
      outW = Math.round(outW * scale);
      outH = Math.round(outH * scale);
    }
    warpedCanvas = document.createElement('canvas');
    warpedCanvas.width = outW;
    warpedCanvas.height = outH;
    const wCtx = warpedCanvas.getContext('2d', { willReadFrequently: true })!;
    wCtx.imageSmoothingEnabled = true;
    wCtx.imageSmoothingQuality = 'high';
    wCtx.drawImage(sourceImg, 0, 0, outW, outH);
  } else {
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

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = srcW;
    srcCanvas.height = srcH;
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
    srcCtx.drawImage(sourceImg, 0, 0, srcW, srcH);
    const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;

    warpedCanvas = document.createElement('canvas');
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
  }

  // تطبيق تصحيح الانحناء غير الخطي فقط عند اكتشاف انحناء حقيقي (مثل كتاب مفتوح)
  const dewarpedRes = detectAndApplyCurvedMeshDewarpIfNeeded(warpedCanvas);
  warpedCanvas = dewarpedRes.canvas;

  const normAngle = ((rotationDeg % 360) + 360) % 360;
  if (normAngle === 0) {
    (warpedCanvas as HTMLCanvasElement & { __curvatureDetected?: boolean }).__curvatureDetected =
      dewarpedRes.curvatureDetected;
    return warpedCanvas;
  }

  const outW = warpedCanvas.width;
  const outH = warpedCanvas.height;

  const rotW = normAngle === 180 ? outW : outH;
  const rotH = normAngle === 180 ? outH : outW;
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = rotW;
  rotCanvas.height = rotH;
  const rCtx = rotCanvas.getContext('2d')!;
  rCtx.translate(rotW / 2, rotH / 2);
  rCtx.rotate((normAngle * Math.PI) / 180);
  rCtx.drawImage(warpedCanvas, -outW / 2, -outH / 2);
  (rotCanvas as HTMLCanvasElement & { __curvatureDetected?: boolean }).__curvatureDetected =
    dewarpedRes.curvatureDetected;
  return rotCanvas;
}

/**
 * محرك معالجة المستندات متعدد المراحل (جودة CamScanner):
 * 1. Background Illumination Estimation & Per-Channel White Balance (إزالة الظلال والاصفرار)
 * 2. Edge-preserving light noise reduction (تنعيم حبيبات الخلفية بدون طمس الحروف)
 * 3. Local contrast enhancement (تحسين المناطق المظلمة دون حرق الفاتح)
 * 4. 3 أوضاع ألوان ذكية (الألوان الأصلية = الافتراضي، تدرج رمادي، أبيض وأسود تكيفي يحفظ القلم الرصاص)
 * 5. Adaptive Halo-Free Unsharp Mask حسب حدة الصورة ومستوى الضوضاء
 */
export function enhanceLegalDocumentCanvas(
  inputCanvas: HTMLCanvasElement,
  filterMode: ScannerFilterMode = 'color',
  brightnessAdjust = 0
): HTMLCanvasElement {
  const w = inputCanvas.width;
  const h = inputCanvas.height;
  const ctx = inputCanvas.getContext('2d', { willReadFrequently: true })!;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. تقدير الإضاءة الخلفية وتوازن اللون الأبيض عبر شبكة محلية لكل قناة (R, G, B)
  const gridCols = 32;
  const gridRows = 40;
  const bgR = new Float32Array(gridCols * gridRows);
  const bgG = new Float32Array(gridCols * gridRows);
  const bgB = new Float32Array(gridCols * gridRows);
  const cellW = w / gridCols;
  const cellH = h / gridRows;

  for (let gy = 0; gy < gridRows; gy++) {
    const yStart = Math.floor(gy * cellH);
    const yEnd = Math.min(h, Math.ceil((gy + 1) * cellH));
    for (let gx = 0; gx < gridCols; gx++) {
      const xStart = Math.floor(gx * cellW);
      const xEnd = Math.min(w, Math.ceil((gx + 1) * cellW));

      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      const stepY = Math.max(1, Math.floor((yEnd - yStart) / 6));
      const stepX = Math.max(1, Math.floor((xEnd - xStart) / 6));
      for (let y = yStart; y < yEnd; y += stepY) {
        for (let x = xStart; x < xEnd; x += stepX) {
          const i = (y * w + x) * 4;
          rs.push(data[i]);
          gs.push(data[i + 1]);
          bs.push(data[i + 2]);
        }
      }
      rs.sort((a, b) => a - b);
      gs.sort((a, b) => a - b);
      bs.sort((a, b) => a - b);
      const pIdx = Math.min(rs.length - 1, Math.floor(rs.length * 0.90));
      const cellIdx = gy * gridCols + gx;
      bgR[cellIdx] = rs.length > 0 ? Math.max(92, rs[pIdx]) : 238;
      bgG[cellIdx] = gs.length > 0 ? Math.max(92, gs[pIdx]) : 238;
      bgB[cellIdx] = bs.length > 0 ? Math.max(92, bs[pIdx]) : 238;
    }
  }

  // تنعيم مزدوج لخريطة الإضاءة الخلفية (Gaussian-equivalent smooth surface) لمنع تأثير الكتل المظللة أو العناوين الكبيرة
  const smoothGrid = (grid: Float32Array): Float32Array => {
    let cur = grid;
    for (let pass = 0; pass < 2; pass++) {
      const next = new Float32Array(gridCols * gridRows);
      for (let gy = 0; gy < gridRows; gy++) {
        for (let gx = 0; gx < gridCols; gx++) {
          let acc = 0;
          let wtSum = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = gx + dx;
              const ny = gy + dy;
              if (nx >= 0 && nx < gridCols && ny >= 0 && ny < gridRows) {
                const wt = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
                acc += cur[ny * gridCols + nx] * wt;
                wtSum += wt;
              }
            }
          }
          next[gy * gridCols + gx] = acc / wtSum;
        }
      }
      cur = next;
    }
    return cur;
  };

  const smBgR = smoothGrid(bgR);
  const smBgG = smoothGrid(bgG);
  const smBgB = smoothGrid(bgB);

  const clampedBright = Math.max(-35, Math.min(45, brightnessAdjust));
  const targetPaper = Math.max(210, Math.min(255, 245 + clampedBright * 0.45));
  const corrected = new Uint8ClampedArray(data.length);
  const bwThreshRatio = new Float32Array(w * h);

  // حساب متوسط انحراف الإضاءة الموضعي (لقياس الضوضاء والوضوح التكيفي لاحقاً)
  let bgNoiseSum = 0;
  let bgNoiseCount = 0;

  for (let y = 0; y < h; y++) {
    const gyf = (y + 0.5) / cellH - 0.5;
    const gy0 = Math.max(0, Math.min(gridRows - 2, Math.floor(gyf)));
    const fy = Math.max(0, Math.min(1, gyf - gy0));

    for (let x = 0; x < w; x++) {
      const gxf = (x + 0.5) / cellW - 0.5;
      const gx0 = Math.max(0, Math.min(gridCols - 2, Math.floor(gxf)));
      const fx = Math.max(0, Math.min(1, gxf - gx0));

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const c00 = gy0 * gridCols + gx0;
      const c10 = c00 + 1;
      const c01 = c00 + gridCols;
      const c11 = c01 + 1;

      const lBgR = smBgR[c00] * w00 + smBgR[c10] * w10 + smBgR[c01] * w01 + smBgR[c11] * w11;
      const lBgG = smBgG[c00] * w00 + smBgG[c10] * w10 + smBgG[c01] * w01 + smBgG[c11] * w11;
      const lBgB = smBgB[c00] * w00 + smBgB[c10] * w10 + smBgB[c01] * w01 + smBgB[c11] * w11;
      const lBgLum = 0.299 * lBgR + 0.587 * lBgG + 0.114 * lBgB;

      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // 2. تصحيح توازن اللون الأبيض (White Balance) + تقسيم الإضاءة الخلفية (Illumination Flattening)
      // ندمج التصحيح اللوني بنسبة 0.80 لإزالة اصفرار الإضاءة الصفراء دون مسح ألوان الأختام والأحبار
      const wbGainR = targetPaper / Math.max(85, lBgR);
      const wbGainG = targetPaper / Math.max(85, lBgG);
      const wbGainB = targetPaper / Math.max(85, lBgB);
      const neutralGain = targetPaper / Math.max(85, lBgLum);

      const gainR = wbGainR * 0.78 + neutralGain * 0.22;
      const gainG = wbGainG * 0.78 + neutralGain * 0.22;
      const gainB = wbGainB * 0.78 + neutralGain * 0.22;

      let nr = Math.min(255, r * Math.min(2.3, gainR) + clampedBright * 0.35);
      let ng = Math.min(255, g * Math.min(2.3, gainG) + clampedBright * 0.35);
      let nb = Math.min(255, b * Math.min(2.3, gainB) + clampedBright * 0.35);

      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      const chroma = Math.max(nr, ng, nb) - Math.min(nr, ng, nb);
      const relToWhite = lum / targetPaper;
      bwThreshRatio[y * w + x] = lum;

      if (chroma < 22 && relToWhite > 0.90) {
        // منطقة خلفية ورقة: نعوّم الإضاءة لتصبح نظيفة دون تحويلها لأبيض مصطنع يبتلع الخطوط الرصاصية الرفيعة
        bgNoiseSum += Math.abs(lum - targetPaper);
        bgNoiseCount++;
        const cleanFactor = Math.min(1, (relToWhite - 0.90) / 0.08);
        const liftTarget = 247 + clampedBright * 0.25;
        nr = nr + (liftTarget - nr) * cleanFactor * 0.82;
        ng = ng + (liftTarget - ng) * cleanFactor * 0.82;
        nb = nb + (liftTarget - nb) * cleanFactor * 0.82;
      } else if (lum < 168) {
        // تحسين موضعي خفيف للأحبار والقلم الرصاص والمناطق المظلمة مع حماية سمك الحروف
        const inkBoost = (168 - lum) * 0.15;
        nr = Math.max(0, nr - inkBoost * (chroma < 26 ? 1 : 0.45));
        ng = Math.max(0, ng - inkBoost * (chroma < 26 ? 1 : 0.45));
        nb = Math.max(0, nb - inkBoost * (chroma < 26 ? 1 : 0.45));
      }

      corrected[idx] = Math.max(0, Math.min(255, Math.round(nr)));
      corrected[idx + 1] = Math.max(0, Math.min(255, Math.round(ng)));
      corrected[idx + 2] = Math.max(0, Math.min(255, Math.round(nb)));
      corrected[idx + 3] = 255;
    }
  }

  // 3. تقليل التشويش الخفيف مع حفظ الحواف (Edge-Preserving Range Filter) في المناطق المستوية
  const avgPaperNoise = bgNoiseCount > 0 ? bgNoiseSum / bgNoiseCount : 6;
  const denoiseThresh = avgPaperNoise > 9 ? 18 : 11;
  const denoised = new Uint8ClampedArray(corrected);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = corrected[idx + c];
        let sumW = center * 2;
        let cntW = 2;
        const nOffsets = [((y - 1) * w + x) * 4, ((y + 1) * w + x) * 4, (y * w + x - 1) * 4, (y * w + x + 1) * 4];
        for (const ni of nOffsets) {
          const val = corrected[ni + c];
          if (Math.abs(val - center) <= denoiseThresh) {
            sumW += val;
            cntW++;
          }
        }
        denoised[idx + c] = Math.round(sumW / cntW);
      }
    }
  }

  // 4. تطبيق وضع الألوان المختار (الألوان الأصلية، تدرج رمادي، أبيض وأسود تكيفي Sauvola)
  const modeOut = new Uint8ClampedArray(denoised.length);
  if (filterMode === 'bw') {
    // حساب تكيفي Sauvola باستعمال Integral Image للسرعة الفائقة O(w*h)
    const integral = new Float64Array((w + 1) * (h + 1));
    const integralSq = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      let rowSq = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const l = 0.299 * denoised[i] + 0.587 * denoised[i + 1] + 0.114 * denoised[i + 2];
        rowSum += l;
        rowSq += l * l;
        const p = (y + 1) * (w + 1) + (x + 1);
        integral[p] = integral[p - (w + 1)] + rowSum;
        integralSq[p] = integralSq[p - (w + 1)] + rowSq;
      }
    }
    const winR = Math.max(8, Math.round(Math.min(w, h) * 0.018));
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - winR);
      const y1 = Math.min(h - 1, y + winR);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - winR);
        const x1 = Math.min(w - 1, x + winR);
        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const A = y0 * (w + 1) + x0;
        const B = y0 * (w + 1) + (x1 + 1);
        const C = (y1 + 1) * (w + 1) + x0;
        const D = (y1 + 1) * (w + 1) + (x1 + 1);
        const sumL = integral[D] - integral[B] - integral[C] + integral[A];
        const sumSqL = integralSq[D] - integralSq[B] - integralSq[C] + integralSq[A];
        const meanL = sumL / area;
        const variance = Math.max(0, sumSqL / area - meanL * meanL);
        const stdL = Math.sqrt(variance);

        // معادلة Sauvola معدلة لحماية الخطوط الفاتحة والقلم الرصاص
        const k = 0.18;
        const sauvolaT = meanL * (1 + k * (stdL / 128 - 1));
        const softFloorT = Math.min(232, Math.max(130, sauvolaT));

        const idx = (y * w + x) * 4;
        const curL = 0.299 * denoised[idx] + 0.587 * denoised[idx + 1] + 0.114 * denoised[idx + 2];
        const band = Math.max(14, stdL * 0.45);
        let bwVal: number;
        if (curL >= softFloorT + band * 0.5 && curL > 188) {
          bwVal = 255;
        } else if (curL <= softFloorT - band) {
          bwVal = 16;
        } else {
          const t = Math.max(0, Math.min(1, (curL - (softFloorT - band)) / (band * 1.5)));
          bwVal = Math.round(16 + t * 239);
        }
        modeOut[idx] = bwVal;
        modeOut[idx + 1] = bwVal;
        modeOut[idx + 2] = bwVal;
        modeOut[idx + 3] = 255;
      }
    }
  } else if (filterMode === 'grayscale') {
    for (let i = 0; i < denoised.length; i += 4) {
      let lum = 0.299 * denoised[i] + 0.587 * denoised[i + 1] + 0.114 * denoised[i + 2];
      if (lum > 205) lum = Math.min(255, lum + (lum - 205) * 0.35);
      else if (lum < 160) lum = Math.max(0, lum - (160 - lum) * 0.18);
      const gv = Math.max(0, Math.min(255, Math.round(lum)));
      modeOut[i] = gv;
      modeOut[i + 1] = gv;
      modeOut[i + 2] = gv;
      modeOut[i + 3] = 255;
    }
  } else {
    modeOut.set(denoised);
  }

  // 5. حدة تكيفية مضبوطة بدون هالات (Halo-Clamped Adaptive Unsharp Mask)
  const finalData = new Uint8ClampedArray(modeOut);
  if (filterMode !== 'bw') {
    // ضبط شدة الحدة تلقائياً حسب مستوى ضوضاء الخلفية
    const sharpAmount = avgPaperNoise > 10 ? 0.16 : 0.26;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const center = modeOut[idx + c];
          const u = modeOut[((y - 1) * w + x) * 4 + c];
          const d = modeOut[((y + 1) * w + x) * 4 + c];
          const l = modeOut[(y * w + (x - 1)) * 4 + c];
          const r = modeOut[(y * w + (x + 1)) * 4 + c];
          const avgN = (u + d + l + r) * 0.25;
          const minN = Math.min(center, u, d, l, r);
          const maxN = Math.max(center, u, d, l, r);
          const diff = center - avgN;
          // منع تضخيم الحبيبات المسطحة + تقليص الهالات خارج [minN-6, maxN+6]
          if (Math.abs(diff) < 3.5) {
            finalData[idx + c] = center;
          } else {
            const sharpened = center + diff * sharpAmount;
            finalData[idx + c] = Math.max(
              0,
              Math.min(255, Math.round(Math.max(minN - 6, Math.min(maxN + 6, sharpened))))
            );
          }
        }
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
 * معالجة صفحة واحدة (قص + تصحيح منظور + إزالة انحناء إن وُجد + تدوير + تسوية إضاءة + فلتر جودة + تحضير < 500 KB)
 */
export async function processCapturedDocumentPage(
  originalBlob: Blob,
  corners: QuadCorners,
  rotationDeg: number,
  filterMode: ScannerFilterMode = 'color',
  brightnessAdjust = 0
): Promise<{
  processedBlob: Blob;
  processedUrl: string;
  originalWidth: number;
  originalHeight: number;
  curvatureDetected: boolean;
}> {
  const { img, objectUrl } = await loadImageFromBlob(originalBlob);
  try {
    const originalWidth = img.width;
    const originalHeight = img.height;
    const warped = warpAndRotateDocument(img, corners, rotationDeg, 1850);
    const curvatureDetected = Boolean(warped.__curvatureDetected);
    const enhanced = enhanceLegalDocumentCanvas(warped, filterMode, brightnessAdjust);

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
      curvatureDetected,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * استيراد ملف PDF وتحويل صفحاته بالترتيب (معالجة مرحلية صفحة بصفحة لتوفير الذاكرة)
 */
export async function importPdfFileToDocumentPages(
  pdfFile: File,
  onProgress?: (label: string) => void
): Promise<ScannedPage[]> {
  const buf = await pdfFile.arrayBuffer();
  const dataCopy = new Uint8Array(buf);

  let pdf;
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerLocalUrl;
    }
    pdf = await pdfjsLib.getDocument({ data: dataCopy }).promise;
  } catch (_) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerLocalUrl;
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  }

  const totalPages = pdf.numPages;
  if (totalPages === 0) {
    throw new Error('ملف PDF المختار فارغ');
  }

  const importedPages: ScannedPage[] = [];

  for (let p = 1; p <= totalPages; p++) {
    onProgress?.(`استيراد صفحة ${p} من ${totalPages} من PDF...`);
    const page = await pdf.getPage(p);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxEdge = Math.max(baseViewport.width, baseViewport.height);
    const scale = Math.min(2.4, Math.max(1.3, 1650 / Math.max(1, maxEdge)));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const rawBlob = await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b!), 'image/jpeg', 0.92)
    );
    const originalUrl = URL.createObjectURL(rawBlob);
    const processed = await processCapturedDocumentPage(rawBlob, FULL_FRAME_QUAD, 0, 'color', 0);

    importedPages.push({
      id: `pdf_${Date.now()}_${p}_${Math.random().toString(36).slice(2, 6)}`,
      originalUrl,
      originalBlob: rawBlob,
      originalWidth: canvas.width,
      originalHeight: canvas.height,
      corners: [
        { ...FULL_FRAME_QUAD[0] },
        { ...FULL_FRAME_QUAD[1] },
        { ...FULL_FRAME_QUAD[2] },
        { ...FULL_FRAME_QUAD[3] },
      ],
      autoDetected: true,
      rotationDeg: 0,
      filterMode: 'color',
      brightnessAdjust: 0,
      sourceType: 'pdf',
      processedUrl: processed.processedUrl,
      processedBlob: processed.processedBlob,
      processedSize: processed.processedBlob.size,
      curvatureDetected: processed.curvatureDetected,
    });
  }

  return importedPages;
}

/**
 * استيراد مجموعة مختلطة من الصور وملفات PDF من "الاستوديو / مدير الملفات"
 */
export async function importStudioFilesToPages(
  files: FileList | File[],
  onProgress?: (label: string) => void
): Promise<StudioImportResult> {
  const list = Array.from(files);
  const addedPages: ScannedPage[] = [];
  const manualCropIndexes: number[] = [];
  const skippedErrors: string[] = [];

  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    const lowerName = f.name.toLowerCase();
    const isPdf = f.type === 'application/pdf' || lowerName.endsWith('.pdf');

    try {
      if (isPdf) {
        const pdfPages = await importPdfFileToDocumentPages(f, onProgress);
        addedPages.push(...pdfPages);
      } else {
        onProgress?.(`تحليل وتحسين الصورة ${i + 1} من ${list.length}...`);
        const det = await detectQuadOnBlob(f);
        const quadToUse = det.detected ? det.quad : FULL_FRAME_QUAD;
        const originalUrl = URL.createObjectURL(f);
        const processed = await processCapturedDocumentPage(f, quadToUse, 0, 'color', 0);

        const idx = addedPages.length;
        if (!det.detected) {
          manualCropIndexes.push(idx);
        }

        addedPages.push({
          id: `imp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          originalUrl,
          originalBlob: f,
          originalWidth: processed.originalWidth,
          originalHeight: processed.originalHeight,
          corners: quadToUse,
          autoDetected: det.detected,
          rotationDeg: 0,
          filterMode: 'color',
          brightnessAdjust: 0,
          sourceType: 'image',
          processedUrl: processed.processedUrl,
          processedBlob: processed.processedBlob,
          processedSize: processed.processedBlob.size,
          curvatureDetected: processed.curvatureDetected,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر قراءة الملف';
      skippedErrors.push(`${f.name}: ${msg}`);
    }
  }

  return { pages: addedPages, manualCropIndexes, skippedErrors };
}

/**
 * أ. تحضير الصور المنفصلة فقط (Scan_001.jpg ... كل منها < 500 KB)
 * لا يُعاد ضغط أي صورة يقل حجمها بالفعل عن 500 KB للحفاظ على أقصى وضوح
 */
export async function buildScannerImageOutputs(
  pages: ScannedPage[],
  onProgress?: (label: string, percent: number) => void
): Promise<ScannerExportResult['images']> {
  if (pages.length === 0) {
    throw new Error('لا توجد صفحات مصورة للحفظ');
  }

  const imageOutputs: ScannerExportResult['images'] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const indexStr = String(i + 1).padStart(3, '0');
    const fileName = `Scan_${indexStr}.jpg`;

    onProgress?.(
      `تجهيز والتحقق من الصورة ${i + 1} من ${pages.length}...`,
      Math.round(((i + 0.5) / pages.length) * 90)
    );

    let imgBlob = page.processedBlob;

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
      throw new Error(
        `تعذر تقليص ${fileName} لأقل من 500 KB دون الإضرار بالوضوح (${(imgBlob.size / 1024).toFixed(1)} KB)`
      );
    }

    imageOutputs.push({
      name: fileName,
      blob: imgBlob,
      url: URL.createObjectURL(imgBlob),
      size: imgBlob.size,
    });
  }

  onProgress?.('اكتمل تجهيز الصور (< 500 KB لكل صورة)', 100);
  return imageOutputs;
}

/**
 * ب. تحضير ملف PDF واحد موحد فقط (Scanned_Document.pdf) بحد أقصى 500 KB للملف بالكامل
 */
export async function buildScannerPdfOutput(
  pages: ScannedPage[],
  onProgress?: (label: string, percent: number) => void
): Promise<ScannerExportResult['pdf']> {
  if (pages.length === 0) {
    throw new Error('لا توجد صفحات مصورة لإنشاء ملف PDF');
  }

  onProgress?.('دمج الصفحات في ملف Scanned_Document.pdf...', 25);

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

  let attempt = 0;
  const qualityFloor = 0.56;
  const dimFloor = 880;

  while (pdfBlob.size >= STRICT_500KB_BYTES && attempt < 7) {
    attempt++;
    onProgress?.(
      `ضغط ملف PDF (${(pdfBlob.size / 1024).toFixed(0)} KB)...`,
      Math.min(95, 35 + attempt * 8)
    );

    if (pdfQuality > qualityFloor + 0.04) {
      pdfQuality = Math.max(qualityFloor, pdfQuality - 0.05);
    } else if (pdfDim > dimFloor) {
      pdfDim = Math.max(dimFloor, Math.round(pdfDim * 0.88));
      pdfQuality = 0.64;
    } else {
      break;
    }
    pdfBlob = await buildPdfFromPages(pdfDim, pdfQuality);
  }

  onProgress?.('اكتمل تجهيز ملف PDF', 100);

  return {
    name: 'Scanned_Document.pdf',
    blob: pdfBlob,
    url: URL.createObjectURL(pdfBlob),
    size: pdfBlob.size,
    exceededLimit: pdfBlob.size >= STRICT_500KB_BYTES,
  };
}

export async function buildScannerOutputs(
  pages: ScannedPage[],
  onProgress?: (label: string, percent: number) => void
): Promise<ScannerExportResult> {
  const images = await buildScannerImageOutputs(pages, (label, pct) =>
    onProgress?.(label, Math.round(pct * 0.6))
  );
  const pdf = await buildScannerPdfOutput(pages, (label, pct) =>
    onProgress?.(label, 60 + Math.round(pct * 0.4))
  );
  return { images, pdf };
}
