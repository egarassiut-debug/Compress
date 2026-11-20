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
 * استخراج مصفوفة رمادية مصغرة من عنصر الفيديو أو الكانفاس لتحليل الحدود والثبات
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

function gaussianBlur3x3(gray: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        out[y * w + x] = gray[y * w + x];
        continue;
      }
      const c = y * w + x;
      const val =
        (gray[c - w - 1] +
          2 * gray[c - w] +
          gray[c - w + 1] +
          2 * gray[c - 1] +
          4 * gray[c] +
          2 * gray[c + 1] +
          gray[c + w - 1] +
          2 * gray[c + w] +
          gray[c + w + 1]) >>
        4;
      out[c] = val;
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

function orderQuadCorners(pts: Array<{ x: number; y: number }>): QuadCorners {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySum[0];
  const br = bySum[bySum.length - 1];
  const remaining = bySum.slice(1, bySum.length - 1);
  const tr = remaining[0].x - remaining[0].y >= remaining[1].x - remaining[1].y ? remaining[0] : remaining[1];
  const bl = tr === remaining[0] ? remaining[1] : remaining[0];
  return [tl, tr, br, bl];
}

/**
 * كشف حقيقي لرباعي المستند من مصفوفة رمادية
 */
export function detectDocumentQuadFromGray(
  gray: Uint8Array,
  w: number,
  h: number
): QuadDetectionResult {
  const sharpness = computeLaplacianSharpness(gray, w, h);
  const blurred = gaussianBlur3x3(gray, w, h);

  let sum = 0;
  for (let i = 0; i < blurred.length; i++) sum += blurred[i];
  const meanLum = sum / Math.max(1, blurred.length);

  let borderSum = 0;
  let borderCnt = 0;
  const bw = Math.max(2, Math.floor(w * 0.08));
  const bh = Math.max(2, Math.floor(h * 0.08));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < bw || x >= w - bw || y < bh || y >= h - bh) {
        borderSum += blurred[y * w + x];
        borderCnt++;
      }
    }
  }
  const borderMean = borderCnt > 0 ? borderSum / borderCnt : meanLum;

  const threshold = Math.max(105, Math.min(225, (meanLum + borderMean) * 0.5 + 16));
  const totalPixels = w * h;
  const mask = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    mask[i] = blurred[i] >= threshold ? 1 : 0;
  }

  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let bestComp: number[] = [];
  let bestScore = 0;

  for (let sy = 1; sy < h - 1; sy++) {
    for (let sx = 1; sx < w - 1; sx++) {
      const startIdx = sy * w + sx;
      if (mask[startIdx] === 0 || visited[startIdx] === 1) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      visited[startIdx] = 1;
      const compPixels: number[] = [];
      let touchBorderCount = 0;
      let cx = 0;
      let cy = 0;

      while (head < tail) {
        const idx = queue[head++];
        compPixels.push(idx);
        const px = idx % w;
        const py = (idx / w) | 0;
        cx += px;
        cy += py;
        if (px <= 1 || px >= w - 2 || py <= 1 || py >= h - 2) {
          touchBorderCount++;
        }

        const neighbors = [idx - 1, idx + 1, idx - w, idx + w];
        for (const nIdx of neighbors) {
          if (nIdx >= 0 && nIdx < totalPixels && mask[nIdx] === 1 && visited[nIdx] === 0) {
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
          }
        }
      }

      const areaRatio = compPixels.length / totalPixels;
      if (areaRatio < 0.14 || areaRatio > 0.94) continue;

      const avgX = cx / compPixels.length / w;
      const avgY = cy / compPixels.length / h;
      const centerDist = Math.hypot(avgX - 0.5, avgY - 0.5);
      const borderRatio = touchBorderCount / compPixels.length;
      if (borderRatio > 0.18 && areaRatio > 0.85) continue;

      const score = areaRatio * 100 - centerDist * 35;
      if (score > bestScore) {
        bestScore = score;
        bestComp = compPixels;
      }
    }
  }

  if (bestComp.length > totalPixels * 0.14) {
    const perimeterPts: Array<{ x: number; y: number }> = [];
    for (const idx of bestComp) {
      const px = idx % w;
      const py = (idx / w) | 0;
      const isEdge =
        px === 0 ||
        py === 0 ||
        px === w - 1 ||
        py === h - 1 ||
        mask[idx - 1] === 0 ||
        mask[idx + 1] === 0 ||
        mask[idx - w] === 0 ||
        mask[idx + w] === 0;
      if (isEdge) {
        perimeterPts.push({ x: px / w, y: py / h });
      }
    }

    const hull = convexHull(perimeterPts);
    if (hull.length >= 4) {
      let tl = hull[0];
      let tr = hull[0];
      let br = hull[0];
      let bl = hull[0];
      let minSum = Infinity;
      let maxSum = -Infinity;
      let maxDiff = -Infinity;
      let minDiff = Infinity;

      for (const p of hull) {
        const s = p.x + p.y;
        const d = p.x - p.y;
        if (s < minSum) {
          minSum = s;
          tl = p;
        }
        if (s > maxSum) {
          maxSum = s;
          br = p;
        }
        if (d > maxDiff) {
          maxDiff = d;
          tr = p;
        }
        if (d < minDiff) {
          minDiff = d;
          bl = p;
        }
      }

      const rawQuad = orderQuadCorners([tl, tr, br, bl]);
      const clamped: QuadCorners = [
        { x: clamp01(rawQuad[0].x), y: clamp01(rawQuad[0].y) },
        { x: clamp01(rawQuad[1].x), y: clamp01(rawQuad[1].y) },
        { x: clamp01(rawQuad[2].x), y: clamp01(rawQuad[2].y) },
        { x: clamp01(rawQuad[3].x), y: clamp01(rawQuad[3].y) },
      ];

      let polyArea = 0;
      for (let i = 0; i < 4; i++) {
        const a = clamped[i];
        const b = clamped[(i + 1) % 4];
        polyArea += a.x * b.y - b.x * a.y;
      }
      polyArea = Math.abs(polyArea) * 0.5;

      const spanW = (clamped[1].x - clamped[0].x + (clamped[2].x - clamped[3].x)) * 0.5;
      const spanH = (clamped[3].y - clamped[0].y + (clamped[2].y - clamped[1].y)) * 0.5;

      const isTooCloseToAllEdges =
        clamped[0].x < 0.015 &&
        clamped[0].y < 0.015 &&
        clamped[2].x > 0.985 &&
        clamped[2].y > 0.985;

      if (!isTooCloseToAllEdges && polyArea >= 0.16 && spanW >= 0.30 && spanH >= 0.30) {
        const confidence = Math.min(0.96, 0.58 + polyArea * 0.45);
        return { quad: clamped, confidence, detected: true, sharpness };
      }
    }
  }

  const grad = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
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
      grad[y * w + x] = Math.abs(gx) + Math.abs(gy);
    }
  }

  let tlS = { x: w * 0.08, y: h * 0.08, score: -1e9 };
  let trS = { x: w * 0.92, y: h * 0.08, score: -1e9 };
  let brS = { x: w * 0.92, y: h * 0.92, score: -1e9 };
  let blS = { x: w * 0.08, y: h * 0.92, score: -1e9 };

  let edgePoints = 0;
  const minMX = Math.floor(w * 0.03);
  const maxMX = Math.floor(w * 0.97);
  const minMY = Math.floor(h * 0.03);
  const maxMY = Math.floor(h * 0.97);

  for (let y = minMY; y < maxMY; y++) {
    for (let x = minMX; x < maxMX; x++) {
      const g = grad[y * w + x];
      const lum = blurred[y * w + x];
      if (g < 75 || lum < Math.max(95, meanLum * 0.85)) continue;
      edgePoints++;

      const nx = x / w;
      const ny = y / h;
      const edgeWeight = Math.min(g, 240) * 0.35;

      if (nx < 0.45 && ny < 0.45) {
        const s = edgeWeight - (nx + ny) * 145;
        if (s > tlS.score) tlS = { x, y, score: s };
      }
      if (nx > 0.55 && ny < 0.45) {
        const s = edgeWeight - (1 - nx + ny) * 145;
        if (s > trS.score) trS = { x, y, score: s };
      }
      if (nx > 0.55 && ny > 0.55) {
        const s = edgeWeight - (1 - nx + (1 - ny)) * 145;
        if (s > brS.score) brS = { x, y, score: s };
      }
      if (nx < 0.45 && ny > 0.55) {
        const s = edgeWeight - (nx + (1 - ny)) * 145;
        if (s > blS.score) blS = { x, y, score: s };
      }
    }
  }

  const foundEdges =
    tlS.score > -1e8 && trS.score > -1e8 && brS.score > -1e8 && blS.score > -1e8 && edgePoints > 45;

  if (foundEdges) {
    const fallbackQuad: QuadCorners = [
      { x: clamp01(tlS.x / w), y: clamp01(tlS.y / h) },
      { x: clamp01(trS.x / w), y: clamp01(trS.y / h) },
      { x: clamp01(brS.x / w), y: clamp01(brS.y / h) },
      { x: clamp01(blS.x / w), y: clamp01(blS.y / h) },
    ];
    const spanW = (fallbackQuad[1].x - fallbackQuad[0].x + (fallbackQuad[2].x - fallbackQuad[3].x)) * 0.5;
    const spanH = (fallbackQuad[3].y - fallbackQuad[0].y + (fallbackQuad[2].y - fallbackQuad[1].y)) * 0.5;
    if (spanW >= 0.32 && spanH >= 0.32) {
      return {
        quad: fallbackQuad,
        confidence: Math.min(0.88, 0.52 + edgePoints / 1400),
        detected: true,
        sharpness,
      };
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
 * اكتشاف زوايا الورقة مباشرة من صورة مأخوذة (Blob/File)
 */
export async function detectQuadOnBlob(blob: Blob): Promise<QuadDetectionResult> {
  const { img, objectUrl } = await loadImageFromBlob(blob);
  try {
    const sampleW = img.width >= img.height ? 180 : 135;
    const sampleH = img.width >= img.height ? 135 : 180;
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
    const { gray, width, height } = sampleGrayscaleFrame(canvas, sampleW, sampleH);
    return detectDocumentQuadFromGray(gray, width, height);
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
 * قص الورقة وتصحيح المنظور والميل + التدوير المتعامد النظيف 90° / 180° / 270°
 */
export function warpAndRotateDocument(
  sourceImg: HTMLImageElement | HTMLCanvasElement,
  corners: QuadCorners,
  rotationDeg: number,
  maxWorkingDim = 1850
): HTMLCanvasElement {
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

  const normAngle = ((rotationDeg % 360) + 360) % 360;
  if (normAngle === 0) {
    return warpedCanvas;
  }

  const outW = warpedCanvas.width;
  const outH = warpedCanvas.height;

  if (normAngle === 90 || normAngle === 180 || normAngle === 270) {
    const rotW = normAngle === 180 ? outW : outH;
    const rotH = normAngle === 180 ? outH : outW;
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = rotW;
    rotCanvas.height = rotH;
    const rCtx = rotCanvas.getContext('2d')!;
    rCtx.translate(rotW / 2, rotH / 2);
    rCtx.rotate((normAngle * Math.PI) / 180);
    rCtx.drawImage(warpedCanvas, -outW / 2, -outH / 2);
    return rotCanvas;
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
 * تحسين المستند القانوني (الافتراضي: ألوان أصلية محسّنة + إضاءة متزنة)
 * مع دعم ضبط الإضاءة الاختياري (-30..+40) وأوضاع الجودة الثلاثة
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

  const targetPaperLum = 242;
  const clampedBright = Math.max(-35, Math.min(45, brightnessAdjust));
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

      const gain = Math.min(1.85, Math.max(0.95, targetPaperLum / Math.max(85, localBg)));
      const effectiveGain = 1 + (gain - 1) * 0.72;

      let nr = r * effectiveGain + clampedBright;
      let ng = g * effectiveGain + clampedBright;
      let nb = b * effectiveGain + clampedBright;

      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
      const maxCh = Math.max(nr, ng, nb);
      const minCh = Math.min(nr, ng, nb);
      const chroma = maxCh - minCh;

      if (filterMode === 'bw') {
        const ratio = lum / Math.max(100, targetPaperLum * 0.96);
        let bwVal: number;
        if (ratio > 0.78) {
          bwVal = 255;
        } else if (ratio < 0.62) {
          bwVal = 18;
        } else {
          bwVal = Math.round(((ratio - 0.62) / 0.16) * 237 + 18);
        }
        out[idx] = bwVal;
        out[idx + 1] = bwVal;
        out[idx + 2] = bwVal;
        out[idx + 3] = 255;
      } else if (filterMode === 'grayscale') {
        let grayVal = lum;
        if (grayVal > 200) {
          grayVal = Math.min(255, grayVal + (grayVal - 200) * 0.42);
        } else if (grayVal < 160) {
          grayVal = Math.max(0, grayVal - (160 - grayVal) * 0.18);
        }
        const gv = Math.max(0, Math.min(255, Math.round(grayVal)));
        out[idx] = gv;
        out[idx + 1] = gv;
        out[idx + 2] = gv;
        out[idx + 3] = 255;
      } else {
        if (chroma < 26 && lum > 205) {
          const lift = (lum - 205) * 0.28;
          nr += lift;
          ng += lift;
          nb += lift;
        } else if (lum < 155) {
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
  }

  const finalData = new Uint8ClampedArray(out);
  if (filterMode !== 'bw') {
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
 * معالجة صفحة واحدة (قص + تصحيح منظور + تدوير + فلتر جودة + إضاءة + تحضير < 500 KB)
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
}> {
  const { img, objectUrl } = await loadImageFromBlob(originalBlob);
  try {
    const originalWidth = img.width;
    const originalHeight = img.height;
    const warped = warpAndRotateDocument(img, corners, rotationDeg, 1850);
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
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * استيراد ملف PDF وتحويل صفحاته بالترتيب إلى صفحات قابلة للمراجعة والتحسين والتدوير والقص داخل السكانر
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
    // مسار بديل محلي عند تعذر تحميل Worker الخارجي
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
    });
  }

  return importedPages;
}

/**
 * استيراد مجموعة مختلطة من الصور وملفات PDF من "الاستوديو / مدير الملفات"
 * مع تطبيق كشف الحدود والتحسين التلقائي على كل صورة والحفاظ على الترتيب
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
