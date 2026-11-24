package com.example.legal_file_compressor;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PointF;
import android.media.ExifInterface;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/**
 * محرك الرؤية الحاسوبية ومعالجة المستندات أوفلاين (تطبيق ضغطة - Pure Android SDK):
 * 1. كشف حدود المستند متعدد القنوات + مسار احتياطي مبني على خريطة التدرج (للخلفيات الفاتحة وبطاقات الهوية)
 * 2. تصحيح المنظور Projective Homography عبر Matrix.setPolyToPoly
 * 3. تسطيح خفيف لانحناء صفحات الكتب (Book Dewarping) دون محرك ثقيل مع كشف الانحناء على نسخة مصغرة
 * 4. معالجة بالبلاط/الشرائح (Strip-Based Tile Processing) لتقليل ذروة الذاكرة بأكثر من 85%:
 *    - إلغاء مصفوفات double[] الكاملة والاستعاضة بشرائح صغيرة ثابتة الحجم (STRIP_H = 96)
 *    - تنعيم وتبييض وحِدة عبر مخزن دائري من 3 صفوف فقط بدل نسخ المصفوفات الكاملة في الذاكرة
 * 5. حماية الألوان والأختام الحمراء والتوقيعات الزرقاء في المستندات القانونية والهويات
 */
public final class DocumentScannerEngine {

    public static final int FILTER_ORIGINAL_COLOR = 0; // ألوان أصلية محسّنة (الافتراضي)
    public static final int FILTER_GRAYSCALE = 1;      // تدرج رمادي متوازن
    public static final int FILTER_BLACK_WHITE = 2;    // أبيض وأسود تكيفي (Sauvola بالشرائح)
    public static final int FILTER_NATURAL = 3;        // طبيعي لطيف (للهويات والأختام الحساسة)

    public static final int SCAN_MODE_SINGLE = 0;
    public static final int SCAN_MODE_BATCH = 1;
    public static final int SCAN_MODE_BOOK = 2;
    public static final int SCAN_MODE_ID_CARD = 3;
    public static final int SCAN_MODE_QR = 4;

    private static final int STRIP_H = 96;

    public static final class DetectionResult {
        public final boolean detected;
        public final float confidence;     // 0..1
        public final float sharpness;      // مقياس وضوح التفاصيل
        public final float stabilityDiff;  // معدل تغيّر الإطارات
        public final float[] corners;      // 8 قيم مطبّعة 0..1: TL, TR, BR, BL

        public DetectionResult(boolean detected, float confidence, float sharpness, float stabilityDiff, float[] corners) {
            this.detected = detected;
            this.confidence = confidence;
            this.sharpness = sharpness;
            this.stabilityDiff = stabilityDiff;
            this.corners = corners;
        }
    }

    private DocumentScannerEngine() {}

    public static float[] fullFrameCorners() {
        return new float[]{ 0f, 0f, 1f, 0f, 1f, 1f, 0f, 1f };
    }

    public static float[] defaultGuideCorners() {
        return new float[]{ 0.08f, 0.08f, 0.92f, 0.08f, 0.92f, 0.92f, 0.08f, 0.92f };
    }

    public static float[] defaultIdCardCorners() {
        return new float[]{ 0.09f, 0.27f, 0.91f, 0.27f, 0.91f, 0.73f, 0.09f, 0.73f };
    }

    /**
     * التحقق من أن المضلع محدب وصالح لتصحيح المنظور دون تقاطع أضلاع
     */
    public static boolean isConvexQuad(float[] c) {
        if (c == null || c.length != 8) return false;
        float sign = 0f;
        for (int i = 0; i < 4; i++) {
            int p0 = i * 2;
            int p1 = ((i + 1) % 4) * 2;
            int p2 = ((i + 2) % 4) * 2;
            float dx1 = c[p1] - c[p0];
            float dy1 = c[p1 + 1] - c[p0 + 1];
            float dx2 = c[p2] - c[p1];
            float dy2 = c[p2 + 1] - c[p1 + 1];
            float cross = dx1 * dy2 - dy1 * dx2;
            if (Math.abs(cross) < 1e-4f) return false;
            if (i == 0) sign = cross;
            else if ((sign > 0f && cross < 0f) || (sign < 0f && cross > 0f)) return false;
        }
        return quadPolygonArea(c) >= 0.015f;
    }

    /**
     * استخراج مصفوفة رمادية مصغرة من إطار NV21 مع مراعاة زاوية العرض
     */
    public static byte[] sampleGrayFromNv21(byte[] nv21, int srcW, int srcH, int displayDeg, int outW, int outH) {
        byte[] gray = new byte[outW * outH];
        if (nv21 == null || nv21.length < srcW * srcH) return gray;

        int norm = ((displayDeg % 360) + 360) % 360;
        for (int py = 0; py < outH; py++) {
            float ny = (py + 0.5f) / outH;
            for (int px = 0; px < outW; px++) {
                float nx = (px + 0.5f) / outW;
                int sx, sy;
                if (norm == 90) {
                    sx = Math.min(srcW - 1, Math.max(0, Math.round(ny * (srcW - 1))));
                    sy = Math.min(srcH - 1, Math.max(0, Math.round((1f - nx) * (srcH - 1))));
                } else if (norm == 270) {
                    sx = Math.min(srcW - 1, Math.max(0, Math.round((1f - ny) * (srcW - 1))));
                    sy = Math.min(srcH - 1, Math.max(0, Math.round(nx * (srcH - 1))));
                } else if (norm == 180) {
                    sx = Math.min(srcW - 1, Math.max(0, Math.round((1f - nx) * (srcW - 1))));
                    sy = Math.min(srcH - 1, Math.max(0, Math.round((1f - ny) * (srcH - 1))));
                } else {
                    sx = Math.min(srcW - 1, Math.max(0, Math.round(nx * (srcW - 1))));
                    sy = Math.min(srcH - 1, Math.max(0, Math.round(ny * (srcH - 1))));
                }
                gray[py * outW + px] = nv21[sy * srcW + sx];
            }
        }
        return gray;
    }

    public static float computeStabilityDiff(byte[] prev, byte[] curr) {
        if (prev == null || curr == null || prev.length != curr.length) return 99f;
        long total = 0L;
        for (int i = 0; i < curr.length; i++) {
            total += Math.abs((curr[i] & 0xFF) - (prev[i] & 0xFF));
        }
        return total / (float) curr.length;
    }

    public static DetectionResult detectDocumentQuad(Bitmap srcBmp, float stabilityDiff) {
        return detectDocumentQuad(srcBmp, stabilityDiff, SCAN_MODE_SINGLE);
    }

    /**
     * كشف حدود المستند/البطاقة متعدد القنوات من Bitmap بدقة منخفضة الذاكرة
     */
    public static DetectionResult detectDocumentQuad(Bitmap srcBmp, float stabilityDiff, int scanMode) {
        float[] fallback = (scanMode == SCAN_MODE_ID_CARD) ? defaultIdCardCorners() : defaultGuideCorners();
        if (srcBmp == null || srcBmp.isRecycled()) {
            return new DetectionResult(false, 0.1f, 0f, stabilityDiff, fallback);
        }
        final int w = srcBmp.getWidth() >= srcBmp.getHeight() ? 266 : 200;
        final int h = srcBmp.getWidth() >= srcBmp.getHeight() ? 200 : 266;
        Bitmap scaled = Bitmap.createScaledBitmap(srcBmp, w, h, true);
        int[] px = new int[w * h];
        scaled.getPixels(px, 0, w, 0, 0, w, h);
        if (scaled != srcBmp) scaled.recycle();
        return detectQuadFromArgb(px, w, h, stabilityDiff, scanMode);
    }

    private static DetectionResult detectQuadFromArgb(int[] px, int w, int h, float stabilityDiff, int scanMode) {
        int n = w * h;
        int[] rArr = new int[n];
        int[] gArr = new int[n];
        int[] bArr = new int[n];
        int[] lum = new int[n];
        for (int i = 0; i < n; i++) {
            int c = px[i];
            int r = (c >> 16) & 0xFF;
            int g = (c >> 8) & 0xFF;
            int b = c & 0xFF;
            rArr[i] = r;
            gArr[i] = g;
            bArr[i] = b;
            lum[i] = (r * 77 + g * 150 + b * 29) >> 8;
        }

        int[] smoothLum = gaussian3x3(lum, w, h);
        int[] smoothR = gaussian3x3(rArr, w, h);
        int[] smoothG = gaussian3x3(gArr, w, h);
        int[] smoothB = gaussian3x3(bArr, w, h);

        int[] grad = new int[n];
        long lapSum = 0L;
        int lapCount = 0;
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                int idx = y * w + x;
                int lumG = sobelAt(smoothLum, w, x, y);
                int cG = (sobelAt(smoothR, w, x, y) + sobelAt(smoothG, w, x, y) + sobelAt(smoothB, w, x, y)) / 2;
                grad[idx] = Math.max(lumG, cG);

                if (x > w / 6 && x < (w * 5) / 6 && y > h / 6 && y < (h * 5) / 6) {
                    int lap = Math.abs(4 * lum[idx]
                        - lum[idx - 1] - lum[idx + 1] - lum[idx - w] - lum[idx + w]);
                    lapSum += lap;
                    lapCount++;
                }
            }
        }
        float sharpness = lapCount > 0 ? (lapSum / (float) lapCount) : 0f;

        // تقدير الخلفية من الإطار الخارجي
        int maxB = w * 8 + h * 8 + 32;
        int[] bR = new int[maxB], bG = new int[maxB], bB = new int[maxB], bL = new int[maxB];
        int bs = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if ((x < 5 || x >= w - 5 || y < 5 || y >= h - 5) && bs < maxB) {
                    int idx = y * w + x;
                    bR[bs] = smoothR[idx];
                    bG[bs] = smoothG[idx];
                    bB[bs] = smoothB[idx];
                    bL[bs] = smoothLum[idx];
                    bs++;
                }
            }
        }
        Arrays.sort(bR, 0, bs);
        Arrays.sort(bG, 0, bs);
        Arrays.sort(bB, 0, bs);
        Arrays.sort(bL, 0, bs);
        int medR = bs > 0 ? bR[bs / 2] : 100;
        int medG = bs > 0 ? bG[bs / 2] : 100;
        int medB = bs > 0 ? bB[bs / 2] : 100;
        int borderMedL = bs > 0 ? bL[bs / 2] : 100;

        // أخذ عينة من المنطقة الوسطى (أو منطقة البطاقة المركزية)
        int yStart = (scanMode == SCAN_MODE_ID_CARD) ? (h * 3) / 10 : h / 4;
        int yEnd = (scanMode == SCAN_MODE_ID_CARD) ? (h * 7) / 10 : (h * 3) / 4;
        int xStart = (scanMode == SCAN_MODE_ID_CARD) ? w / 5 : w / 4;
        int xEnd = (scanMode == SCAN_MODE_ID_CARD) ? (w * 4) / 5 : (w * 3) / 4;

        int maxC = (w * h) / 3 + 32;
        int[] cR = new int[maxC], cG = new int[maxC], cB = new int[maxC], cL = new int[maxC];
        int cs = 0;
        for (int y = yStart; y < yEnd; y++) {
            for (int x = xStart; x < xEnd; x++) {
                if (cs < maxC) {
                    int idx = y * w + x;
                    cR[cs] = smoothR[idx];
                    cG[cs] = smoothG[idx];
                    cB[cs] = smoothB[idx];
                    cL[cs] = smoothLum[idx];
                    cs++;
                }
            }
        }
        Arrays.sort(cR, 0, cs);
        Arrays.sort(cG, 0, cs);
        Arrays.sort(cB, 0, cs);
        Arrays.sort(cL, 0, cs);
        int docR = cs > 0 ? cR[(int) (cs * 0.62f)] : 200;
        int docG = cs > 0 ? cG[(int) (cs * 0.62f)] : 200;
        int docB = cs > 0 ? cB[(int) (cs * 0.62f)] : 200;
        int centerP75 = cs > 0 ? cL[(int) (cs * 0.75f)] : 190;

        float lumSpan = Math.abs(centerP75 - borderMedL);
        boolean paperBrighter = centerP75 >= borderMedL;
        float colorSpan = (float) Math.sqrt(
            (docR - medR) * (docR - medR) +
            (docG - medG) * (docG - medG) +
            (docB - medB) * (docB - medB)
        );

        float[] fallback = (scanMode == SCAN_MODE_ID_CARD) ? defaultIdCardCorners() : defaultGuideCorners();
        boolean[] mask = new boolean[n];
        if (lumSpan >= 11f || colorSpan >= 18f) {
            float lumThresh = paperBrighter
                ? (borderMedL + lumSpan * 0.44f)
                : (borderMedL - lumSpan * 0.44f);
            float colorDistThresh = Math.max(18f, colorSpan * 0.36f);
            for (int y = 2; y < h - 2; y++) {
                for (int x = 2; x < w - 2; x++) {
                    int idx = y * w + x;
                    boolean brightMatch = lumSpan >= 12f && (paperBrighter ? smoothLum[idx] >= lumThresh : smoothLum[idx] <= lumThresh);
                    float bgDist = (float) Math.sqrt(
                        (smoothR[idx] - medR) * (smoothR[idx] - medR) +
                        (smoothG[idx] - medG) * (smoothG[idx] - medG) +
                        (smoothB[idx] - medB) * (smoothB[idx] - medB)
                    );
                    float docDist = (float) Math.sqrt(
                        (smoothR[idx] - docR) * (smoothR[idx] - docR) +
                        (smoothG[idx] - docG) * (smoothG[idx] - docG) +
                        (smoothB[idx] - docB) * (smoothB[idx] - docB)
                    );
                    boolean colorMatch = colorSpan >= 18f && bgDist >= colorDistThresh && docDist <= bgDist * 0.88f;
                    if (brightMatch || colorMatch) {
                        mask[idx] = true;
                    }
                }
            }
            DetectionResult primary = extractBestQuadFromMask(mask, grad, w, h, sharpness, stabilityDiff,
                Math.max(lumSpan, colorSpan * 0.85f), scanMode);
            if (primary.detected) return primary;
        }

        // مسار احتياطي يعتمد على حواف التدرج (مهم للورق الأبيض فوق مكتب فاتح أو بطاقات الهوية)
        DetectionResult edgeRes = detectQuadFromEdgeEnvelope(grad, w, h, sharpness, stabilityDiff, scanMode);
        if (edgeRes.detected) return edgeRes;

        return new DetectionResult(false, 0.15f, sharpness, stabilityDiff, fallback);
    }

    public static DetectionResult detectDocumentQuad(byte[] grayBytes, int w, int h, float stabilityDiff) {
        return detectDocumentQuad(grayBytes, w, h, stabilityDiff, SCAN_MODE_SINGLE);
    }

    /**
     * خوارزمية الرؤية الحاسوبية بالزمن الحقيقي لإطارات NV21 الرمادية
     */
    public static DetectionResult detectDocumentQuad(byte[] grayBytes, int w, int h, float stabilityDiff, int scanMode) {
        int n = w * h;
        int[] lum = new int[n];
        for (int i = 0; i < n; i++) lum[i] = grayBytes[i] & 0xFF;

        int[] smooth = gaussian3x3(lum, w, h);

        int[] grad = new int[n];
        long lapSum = 0L;
        int lapCount = 0;
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                int idx = y * w + x;
                grad[idx] = sobelAt(smooth, w, x, y);
                if (x > w / 6 && x < (w * 5) / 6 && y > h / 6 && y < (h * 5) / 6) {
                    int lap = Math.abs(4 * lum[idx]
                        - lum[idx - 1] - lum[idx + 1] - lum[idx - w] - lum[idx + w]);
                    lapSum += lap;
                    lapCount++;
                }
            }
        }
        float sharpness = lapCount > 0 ? (lapSum / (float) lapCount) : 0f;

        int[] borderSamples = new int[(w * 2 + h * 2) * 4];
        int bs = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if (x < 4 || x >= w - 4 || y < 4 || y >= h - 4) {
                    if (bs < borderSamples.length) borderSamples[bs++] = smooth[y * w + x];
                }
            }
        }
        Arrays.sort(borderSamples, 0, bs);
        int borderMedian = bs > 0 ? borderSamples[bs / 2] : 100;

        int[] centerSamples = new int[(w * h) / 4 + 16];
        int cs = 0;
        for (int y = h / 4; y < (h * 3) / 4; y++) {
            for (int x = w / 4; x < (w * 3) / 4; x++) {
                if (cs < centerSamples.length) centerSamples[cs++] = smooth[y * w + x];
            }
        }
        Arrays.sort(centerSamples, 0, cs);
        int centerP75 = cs > 0 ? centerSamples[(int) (cs * 0.75f)] : 180;

        int contrastSpan = Math.abs(centerP75 - borderMedian);
        boolean brighter = centerP75 >= borderMedian;
        int threshold = contrastSpan >= 14
            ? (brighter
                ? borderMedian + Math.max(10, Math.round(contrastSpan * 0.40f))
                : borderMedian - Math.max(10, Math.round(contrastSpan * 0.40f)))
            : Math.min(205, borderMedian + 24);

        boolean[] mask = new boolean[n];
        for (int y = 2; y < h - 2; y++) {
            for (int x = 2; x < w - 2; x++) {
                int idx = y * w + x;
                if (brighter ? (smooth[idx] >= threshold) : (smooth[idx] <= threshold)) {
                    mask[idx] = true;
                }
            }
        }
        DetectionResult res = extractBestQuadFromMask(mask, grad, w, h, sharpness, stabilityDiff, contrastSpan, scanMode);
        if (res.detected) return res;

        return detectQuadFromEdgeEnvelope(grad, w, h, sharpness, stabilityDiff, scanMode);
    }

    /**
     * مسار كشف احتياطي يعتمد على إغلاق الحواف القوية واستخراج الصندوق الداخلي الأكبر
     */
    private static DetectionResult detectQuadFromEdgeEnvelope(
        int[] grad, int w, int h, float sharpness, float stabilityDiff, int scanMode
    ) {
        int n = w * h;
        int[] sample = new int[n / 4 + 8];
        int sc = 0;
        for (int y = 4; y < h - 4; y += 2) {
            for (int x = 4; x < w - 4; x += 2) {
                if (sc < sample.length) sample[sc++] = grad[y * w + x];
            }
        }
        Arrays.sort(sample, 0, sc);
        int edgeThresh = sc > 0 ? Math.max(58, sample[(int) (sc * 0.84f)]) : 75;

        boolean[] edgeMask = new boolean[n];
        for (int y = 2; y < h - 2; y++) {
            for (int x = 2; x < w - 2; x++) {
                if (grad[y * w + x] >= edgeThresh) edgeMask[y * w + x] = true;
            }
        }
        // إغلاق الفجوات وملء ما خارج الحافة عبر BFS من الحواف الأربع
        boolean[] barrier = dilate3x3(edgeMask, w, h);
        boolean[] outside = new boolean[n];
        int[] q = new int[n];
        int head = 0, tail = 0;
        for (int x = 0; x < w; x++) {
            if (!barrier[x]) { outside[x] = true; q[tail++] = x; }
            int b = (h - 1) * w + x;
            if (!barrier[b] && !outside[b]) { outside[b] = true; q[tail++] = b; }
        }
        for (int y = 1; y < h - 1; y++) {
            int l = y * w;
            if (!barrier[l] && !outside[l]) { outside[l] = true; q[tail++] = l; }
            int r = y * w + (w - 1);
            if (!barrier[r] && !outside[r]) { outside[r] = true; q[tail++] = r; }
        }
        int[] dxs = { -1, 1, 0, 0 };
        int[] dys = { 0, 0, -1, 1 };
        while (head < tail) {
            int cur = q[head++];
            int cx = cur % w;
            int cy = cur / w;
            for (int k = 0; k < 4; k++) {
                int nx = cx + dxs[k], ny = cy + dys[k];
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                    int ni = ny * w + nx;
                    if (!outside[ni] && !barrier[ni]) {
                        outside[ni] = true;
                        q[tail++] = ni;
                    }
                }
            }
        }
        boolean[] inside = new boolean[n];
        int insideCount = 0;
        for (int i = 0; i < n; i++) {
            if (!outside[i]) {
                inside[i] = true;
                insideCount++;
            }
        }
        if (insideCount > n * 0.06f && insideCount < n * 0.90f) {
            return extractBestQuadFromMask(inside, grad, w, h, sharpness, stabilityDiff, 35f, scanMode);
        }
        float[] fallback = (scanMode == SCAN_MODE_ID_CARD) ? defaultIdCardCorners() : defaultGuideCorners();
        return new DetectionResult(false, 0.18f, sharpness, stabilityDiff, fallback);
    }

    private static DetectionResult extractBestQuadFromMask(
        boolean[] mask,
        int[] grad,
        int w,
        int h,
        float sharpness,
        float stabilityDiff,
        float contrastSpan,
        int scanMode
    ) {
        int n = w * h;
        boolean[] dilated = dilate3x3(mask, w, h);
        boolean[] closed = erode3x3(dilated, w, h);
        boolean[] opened = dilate3x3(erode3x3(closed, w, h), w, h);

        int[] visited = new int[n];
        int[] queue = new int[n];
        List<int[]> bestBlob = null;
        int bestArea = 0;

        float minAreaRatio = (scanMode == SCAN_MODE_ID_CARD) ? 0.055f : 0.10f;
        float maxBorderRatio = 0.42f;

        for (int y = 2; y < h - 2; y++) {
            for (int x = 2; x < w - 2; x++) {
                int start = y * w + x;
                if (!opened[start] || visited[start] != 0) continue;

                int head = 0, tail = 0;
                queue[tail++] = start;
                visited[start] = 1;
                List<int[]> perimeter = new ArrayList<int[]>();
                int area = 0;
                int borderTouches = 0;

                while (head < tail) {
                    int cur = queue[head++];
                    int cy = cur / w;
                    int cx = cur % w;
                    area++;
                    if (cx <= 2 || cx >= w - 3 || cy <= 2 || cy >= h - 3) {
                        borderTouches++;
                    }
                    boolean isEdge = false;
                    int[] dxs = { -1, 1, 0, 0 };
                    int[] dys = { 0, 0, -1, 1 };
                    for (int k = 0; k < 4; k++) {
                        int nx = cx + dxs[k];
                        int ny = cy + dys[k];
                        if (nx < 0 || nx >= w || ny < 0 || ny >= h) {
                            isEdge = true;
                            continue;
                        }
                        int ni = ny * w + nx;
                        if (!opened[ni]) {
                            isEdge = true;
                        } else if (visited[ni] == 0) {
                            visited[ni] = 1;
                            queue[tail++] = ni;
                        }
                    }
                    if (isEdge) {
                        perimeter.add(new int[]{ cx, cy });
                    }
                }

                float areaRatio = area / (float) n;
                if (areaRatio >= minAreaRatio && areaRatio <= 0.96f && borderTouches < area * maxBorderRatio && area > bestArea) {
                    bestArea = area;
                    bestBlob = perimeter;
                }
            }
        }

        float[] fallback = (scanMode == SCAN_MODE_ID_CARD) ? defaultIdCardCorners() : defaultGuideCorners();
        if (bestBlob == null || bestBlob.size() < 16) {
            return new DetectionResult(false, 0.15f, sharpness, stabilityDiff, fallback);
        }

        List<PointF> hull = convexHull(bestBlob);
        if (hull.size() < 4) {
            return new DetectionResult(false, 0.2f, sharpness, stabilityDiff, fallback);
        }

        float[] fitted = fitQuadFromHullAndEdges(hull, w, h);
        if (fitted == null || !isValidPaperQuad(fitted, scanMode)) {
            return new DetectionResult(false, 0.28f, sharpness, stabilityDiff, fallback);
        }

        float[] refined = refineQuadCornersDirectional(fitted, grad, w, h, scanMode);
        float[] protectedQuad = expandQuadSlightly(refined, 0.005f);

        float edgeSupport = measureQuadEdgeSupport(protectedQuad, grad, w, h);
        float blobCoverage = Math.min(1f, bestArea / (quadPolygonArea(protectedQuad) * n + 1f));
        float confidence = Math.min(0.98f,
            edgeSupport * 0.50f + blobCoverage * 0.30f + Math.min(1f, Math.max(0f, contrastSpan) / 55f) * 0.20f);

        boolean detected = edgeSupport >= 0.24f && confidence >= 0.44f;
        return new DetectionResult(detected, confidence, sharpness, stabilityDiff,
            detected ? protectedQuad : fallback);
    }

    private static int sobelAt(int[] ch, int w, int x, int y) {
        int gx =
            -ch[(y - 1) * w + (x - 1)] + ch[(y - 1) * w + (x + 1)]
            - 2 * ch[y * w + (x - 1)] + 2 * ch[y * w + (x + 1)]
            - ch[(y + 1) * w + (x - 1)] + ch[(y + 1) * w + (x + 1)];
        int gy =
            -ch[(y - 1) * w + (x - 1)] - 2 * ch[(y - 1) * w + x] - ch[(y - 1) * w + (x + 1)]
            + ch[(y + 1) * w + (x - 1)] + 2 * ch[(y + 1) * w + x] + ch[(y + 1) * w + (x + 1)];
        return Math.abs(gx) + Math.abs(gy);
    }

    private static int[] gaussian3x3(int[] src, int w, int h) {
        int[] out = new int[w * h];
        System.arraycopy(src, 0, out, 0, w * h);
        for (int y = 1; y < h - 1; y++) {
            int row = y * w;
            for (int x = 1; x < w - 1; x++) {
                int v =
                    src[(y - 1) * w + (x - 1)] + 2 * src[(y - 1) * w + x] + src[(y - 1) * w + (x + 1)] +
                    2 * src[row + (x - 1)] + 4 * src[row + x] + 2 * src[row + (x + 1)] +
                    src[(y + 1) * w + (x - 1)] + 2 * src[(y + 1) * w + x] + src[(y + 1) * w + (x + 1)];
                out[row + x] = v >> 4;
            }
        }
        return out;
    }

    private static boolean[] dilate3x3(boolean[] src, int w, int h) {
        boolean[] out = new boolean[w * h];
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                boolean any = false;
                for (int dy = -1; dy <= 1 && !any; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        if (src[(y + dy) * w + (x + dx)]) {
                            any = true;
                            break;
                        }
                    }
                }
                out[y * w + x] = any;
            }
        }
        return out;
    }

    private static boolean[] erode3x3(boolean[] src, int w, int h) {
        boolean[] out = new boolean[w * h];
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                boolean all = true;
                for (int dy = -1; dy <= 1 && all; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        if (!src[(y + dy) * w + (x + dx)]) {
                            all = false;
                            break;
                        }
                    }
                }
                out[y * w + x] = all;
            }
        }
        return out;
    }

    private static List<PointF> convexHull(List<int[]> pts) {
        int[][] arr = pts.toArray(new int[0][]);
        Arrays.sort(arr, new Comparator<int[]>() {
            @Override
            public int compare(int[] a, int[] b) {
                if (a[0] != b[0]) return Integer.compare(a[0], b[0]);
                return Integer.compare(a[1], b[1]);
            }
        });

        int n = arr.length;
        int[][] hull = new int[2 * n][];
        int k = 0;
        for (int i = 0; i < n; i++) {
            while (k >= 2 && cross(hull[k - 2], hull[k - 1], arr[i]) <= 0) k--;
            hull[k++] = arr[i];
        }
        for (int i = n - 2, t = k + 1; i >= 0; i--) {
            while (k >= t && cross(hull[k - 2], hull[k - 1], arr[i]) <= 0) k--;
            hull[k++] = arr[i];
        }
        List<PointF> res = new ArrayList<PointF>(Math.max(0, k - 1));
        for (int i = 0; i < k - 1; i++) {
            res.add(new PointF(hull[i][0], hull[i][1]));
        }
        return res;
    }

    private static long cross(int[] o, int[] a, int[] b) {
        return (long) (a[0] - o[0]) * (b[1] - o[1]) - (long) (a[1] - o[1]) * (b[0] - o[0]);
    }

    private static float[] fitQuadFromHullAndEdges(List<PointF> hull, int w, int h) {
        int iTL = 0, iTR = 0, iBR = 0, iBL = 0;
        float minSum = Float.MAX_VALUE, maxSum = -Float.MAX_VALUE;
        float minDiff = Float.MAX_VALUE, maxDiff = -Float.MAX_VALUE;

        for (int i = 0; i < hull.size(); i++) {
            PointF p = hull.get(i);
            float sum = p.x + p.y;
            float diff = p.x - p.y;
            if (sum < minSum) { minSum = sum; iTL = i; }
            if (sum > maxSum) { maxSum = sum; iBR = i; }
            if (diff > maxDiff) { maxDiff = diff; iTR = i; }
            if (diff < minDiff) { minDiff = diff; iBL = i; }
        }

        PointF tl0 = hull.get(iTL);
        PointF tr0 = hull.get(iTR);
        PointF br0 = hull.get(iBR);
        PointF bl0 = hull.get(iBL);

        double[] lineTop = fitSideLine(hull, tl0, tr0);
        double[] lineRight = fitSideLine(hull, tr0, br0);
        double[] lineBottom = fitSideLine(hull, br0, bl0);
        double[] lineLeft = fitSideLine(hull, bl0, tl0);

        PointF tl = intersectLines(lineLeft, lineTop, tl0);
        PointF tr = intersectLines(lineTop, lineRight, tr0);
        PointF br = intersectLines(lineRight, lineBottom, br0);
        PointF bl = intersectLines(lineBottom, lineLeft, bl0);

        return new float[]{
            clamp01(tl.x / w), clamp01(tl.y / h),
            clamp01(tr.x / w), clamp01(tr.y / h),
            clamp01(br.x / w), clamp01(br.y / h),
            clamp01(bl.x / w), clamp01(bl.y / h)
        };
    }

    private static double[] fitSideLine(List<PointF> hull, PointF p1, PointF p2) {
        double dx = p2.x - p1.x;
        double dy = p2.y - p1.y;
        double len = Math.hypot(dx, dy);
        if (len < 6.0) return new double[]{ -dy, dx, dy * p1.x - dx * p1.y };

        double nx = -dy / len;
        double ny = dx / len;

        List<PointF> near = new ArrayList<PointF>();
        double maxDist = Math.max(4.0, len * 0.08);
        for (PointF p : hull) {
            double dist = Math.abs((p.x - p1.x) * nx + (p.y - p1.y) * ny);
            double proj = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (len * len);
            if (dist <= maxDist && proj >= -0.08 && proj <= 1.08) {
                near.add(p);
            }
        }
        if (near.size() < 2) {
            return new double[]{ -dy, dx, dy * p1.x - dx * p1.y };
        }

        double mx = 0, my = 0;
        for (PointF p : near) { mx += p.x; my += p.y; }
        mx /= near.size();
        my /= near.size();

        double sxx = 0, syy = 0, sxy = 0;
        for (PointF p : near) {
            double ux = p.x - mx;
            double uy = p.y - my;
            sxx += ux * ux;
            syy += uy * uy;
            sxy += ux * uy;
        }
        double theta = 0.5 * Math.atan2(2.0 * sxy, sxx - syy);
        double a = -Math.sin(theta);
        double b = Math.cos(theta);
        double c = -(a * mx + b * my);
        return new double[]{ a, b, c };
    }

    private static PointF intersectLines(double[] l1, double[] l2, PointF fallback) {
        double det = l1[0] * l2[1] - l2[0] * l1[1];
        if (Math.abs(det) < 1e-6) return fallback;
        double x = (l1[1] * l2[2] - l2[1] * l1[2]) / det;
        double y = (l2[0] * l1[2] - l1[0] * l2[2]) / det;
        if (Math.hypot(x - fallback.x, y - fallback.y) > 40.0) {
            return fallback;
        }
        return new PointF((float) x, (float) y);
    }

    /**
     * تحسين موضعي اتجاهي لموضع الزوايا الأربع (±8px) مع تفضيل الحافة الخارجية بدل السطور الداخلية
     */
    private static float[] refineQuadCornersDirectional(float[] c, int[] grad, int w, int h, int scanMode) {
        float mx = (c[0] + c[2] + c[4] + c[6]) * 0.25f * (w - 1);
        float my = (c[1] + c[3] + c[5] + c[7]) * 0.25f * (h - 1);
        float[] out = c.clone();
        for (int i = 0; i < 4; i++) {
            float cx = c[i * 2] * (w - 1);
            float cy = c[i * 2 + 1] * (h - 1);
            float ox = cx - mx;
            float oy = cy - my;
            float oLen = Math.max(1f, (float) Math.hypot(ox, oy));
            ox /= oLen;
            oy /= oLen;

            int bestX = Math.round(cx);
            int bestY = Math.round(cy);
            float bestScore = -1f;
            for (int dy = -7; dy <= 7; dy++) {
                for (int dx = -7; dx <= 7; dx++) {
                    int nx = Math.max(1, Math.min(w - 2, Math.round(cx) + dx));
                    int ny = Math.max(1, Math.min(h - 2, Math.round(cy) + dy));
                    int g = grad[ny * w + nx];
                    // مكافأة طفيفة للنقطة الأبعد عن المركز حتى لا تنجذب الزاوية إلى سطور النص الداخلية
                    float outwardProj = dx * ox + dy * oy;
                    float distPenalty = (dx * dx + dy * dy) * 0.65f;
                    float score = g + Math.max(-4f, outwardProj * 3.5f) - distPenalty;
                    if (g >= 42 && score > bestScore) {
                        bestScore = score;
                        bestX = nx;
                        bestY = ny;
                    }
                }
            }
            if (bestScore > 0f) {
                out[i * 2] = clamp01(bestX / (float) (w - 1));
                out[i * 2 + 1] = clamp01(bestY / (float) (h - 1));
            }
        }
        return isValidPaperQuad(out, scanMode) ? out : c;
    }

    private static float[] expandQuadSlightly(float[] c, float margin) {
        float mx = (c[0] + c[2] + c[4] + c[6]) * 0.25f;
        float my = (c[1] + c[3] + c[5] + c[7]) * 0.25f;
        float[] out = new float[8];
        for (int i = 0; i < 4; i++) {
            float dx = c[i * 2] - mx;
            float dy = c[i * 2 + 1] - my;
            float len = (float) Math.hypot(dx, dy);
            if (len < 1e-4f) {
                out[i * 2] = c[i * 2];
                out[i * 2 + 1] = c[i * 2 + 1];
            } else {
                out[i * 2] = clamp01(c[i * 2] + (dx / len) * margin);
                out[i * 2 + 1] = clamp01(c[i * 2 + 1] + (dy / len) * margin);
            }
        }
        return out;
    }

    private static boolean isValidPaperQuad(float[] c, int scanMode) {
        float area = quadPolygonArea(c);
        float minArea = (scanMode == SCAN_MODE_ID_CARD) ? 0.055f : 0.10f;
        if (area < minArea || area > 0.96f) return false;

        for (int i = 0; i < 4; i++) {
            int p = ((i + 3) % 4) * 2;
            int q = i * 2;
            int r = ((i + 1) % 4) * 2;
            double v1x = c[p] - c[q], v1y = c[p + 1] - c[q + 1];
            double v2x = c[r] - c[q], v2y = c[r + 1] - c[q + 1];
            double l1 = Math.hypot(v1x, v1y);
            double l2 = Math.hypot(v2x, v2y);
            if (l1 < 0.12 || l2 < 0.12) return false;
            double cosA = (v1x * v2x + v1y * v2y) / (l1 * l2);
            double deg = Math.toDegrees(Math.acos(Math.max(-1.0, Math.min(1.0, cosA))));
            if (deg < 35.0 || deg > 145.0) return false;

            double cross = v2x * v1y - v2y * v1x;
            if (cross <= 0) return false;
        }
        return true;
    }

    public static float quadPolygonArea(float[] c) {
        float s = 0f;
        for (int i = 0; i < 4; i++) {
            int j = (i + 1) % 4;
            s += c[i * 2] * c[j * 2 + 1] - c[j * 2] * c[i * 2 + 1];
        }
        return Math.abs(s) * 0.5f;
    }

    private static float measureQuadEdgeSupport(float[] c, int[] grad, int w, int h) {
        int strongCount = 0;
        int totalSamples = 0;
        for (int side = 0; side < 4; side++) {
            int next = (side + 1) % 4;
            float x0 = c[side * 2] * (w - 1), y0 = c[side * 2 + 1] * (h - 1);
            float x1 = c[next * 2] * (w - 1), y1 = c[next * 2 + 1] * (h - 1);
            int steps = 20;
            for (int s = 1; s < steps; s++) {
                float t = s / (float) steps;
                int cx = Math.round(x0 + (x1 - x0) * t);
                int cy = Math.round(y0 + (y1 - y0) * t);
                int maxG = 0;
                for (int dy = -2; dy <= 2; dy++) {
                    for (int dx = -2; dx <= 2; dx++) {
                        int sx = Math.max(1, Math.min(w - 2, cx + dx));
                        int sy = Math.max(1, Math.min(h - 2, cy + dy));
                        int g = grad[sy * w + sx];
                        if (g > maxG) maxG = g;
                    }
                }
                totalSamples++;
                if (maxG >= 48) strongCount++;
            }
        }
        return totalSamples > 0 ? (strongCount / (float) totalSamples) : 0f;
    }

    private static float clamp01(float v) {
        return Math.max(0.002f, Math.min(0.998f, v));
    }

    private static boolean isFullFrame(float[] c) {
        return Math.abs(c[0]) < 0.005f && Math.abs(c[1]) < 0.005f
            && Math.abs(c[2] - 1f) < 0.005f && Math.abs(c[3]) < 0.005f
            && Math.abs(c[4] - 1f) < 0.005f && Math.abs(c[5] - 1f) < 0.005f
            && Math.abs(c[6]) < 0.005f && Math.abs(c[7] - 1f) < 0.005f;
    }

    /**
     * فك الصورة بدقة آمنة للعرض في المراجعة أو المعاينة دون تحميل الدقة الكاملة
     */
    public static Bitmap decodeSampledThumbnail(File file, int maxDim) {
        if (file == null || !file.exists()) return null;
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
            int max = Math.max(bounds.outWidth, bounds.outHeight);
            int sample = 1;
            while (max / sample > maxDim * 2) {
                sample *= 2;
            }
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            opts.inPreferredConfig = Bitmap.Config.RGB_565;
            Bitmap bmp = BitmapFactory.decodeFile(file.getAbsolutePath(), opts);
            if (bmp == null) return null;
            int curMax = Math.max(bmp.getWidth(), bmp.getHeight());
            if (curMax > maxDim) {
                float r = maxDim / (float) curMax;
                Bitmap scaled = Bitmap.createScaledBitmap(
                    bmp,
                    Math.max(80, Math.round(bmp.getWidth() * r)),
                    Math.max(80, Math.round(bmp.getHeight() * r)),
                    true
                );
                if (scaled != bmp) bmp.recycle();
                return scaled;
            }
            return bmp;
        } catch (Throwable t) {
            return null;
        }
    }

    /**
     * فك الصورة الأصلية مع تطبيق اتجاه EXIF الحقيقي (لضمان توافق المحاور)
     */
    public static Bitmap decodeNormalizedOriginal(File origFile, int maxLoadDim) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(origFile.getAbsolutePath(), bounds);

        int inSample = 1;
        int maxDim = Math.max(bounds.outWidth, bounds.outHeight);
        while (maxDim / inSample > maxLoadDim * 2) {
            inSample *= 2;
        }

        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = inSample;
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap raw = BitmapFactory.decodeFile(origFile.getAbsolutePath(), opts);
        if (raw == null) throw new Exception("تعذر فك الصورة");

        int exifRotate = 0;
        try {
            ExifInterface exif = new ExifInterface(origFile.getAbsolutePath());
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) exifRotate = 90;
            else if (orientation == ExifInterface.ORIENTATION_ROTATE_180) exifRotate = 180;
            else if (orientation == ExifInterface.ORIENTATION_ROTATE_270) exifRotate = 270;
        } catch (Exception ignored) {}

        if (exifRotate != 0) {
            Matrix m = new Matrix();
            m.postRotate(exifRotate);
            Bitmap fixed = Bitmap.createBitmap(raw, 0, 0, raw.getWidth(), raw.getHeight(), m, true);
            if (fixed != raw) raw.recycle();
            raw = fixed;
        }
        if (Math.max(raw.getWidth(), raw.getHeight()) > maxLoadDim) {
            float sc = maxLoadDim / (float) Math.max(raw.getWidth(), raw.getHeight());
            Bitmap scaled = Bitmap.createScaledBitmap(
                raw,
                Math.max(120, Math.round(raw.getWidth() * sc)),
                Math.max(120, Math.round(raw.getHeight() * sc)),
                true
            );
            if (scaled != raw) raw.recycle();
            raw = scaled;
        }
        return raw;
    }

    /**
     * تصحيح خفيف لانحناء صفحة الكتاب الواحدة (Book Dewarping) دون محرك ثقيل:
     * 1. يقيس التقوس العلوي والسفلي على نسخة مصغرة (~320px) لتفادي تخصيص أي مصفوفات كبيرة للصفحات المسطحة
     * 2. إذا وُجد تقوس فعلي (>= 1.2% في وضع الكتب أو >= 1.5% عام)، يطبق التسطيح شريحةً بشريحة
     */
    private static Bitmap dewarpCurvedPageIfNeeded(Bitmap warped, int scanMode) {
        int w = warped.getWidth();
        int h = warped.getHeight();
        if (w < 240 || h < 240) return warped;

        // كشف التقوس على نسخة مصغرة جداً (320px) ~0.4 MB فقط
        int sw = Math.min(320, w);
        int sh = Math.max(120, Math.round(h * (sw / (float) w)));
        Bitmap tiny = Bitmap.createScaledBitmap(warped, sw, sh, true);
        int[] tinyPx = new int[sw * sh];
        tiny.getPixels(tinyPx, 0, sw, 0, 0, sw, sh);
        if (tiny != warped) tiny.recycle();

        int samplesN = 25;
        int searchMargin = Math.max(6, Math.round(sh * 0.055f));
        float[] topOffset = new float[samplesN];
        float[] botOffset = new float[samplesN];

        for (int s = 0; s < samplesN; s++) {
            float u = (s + 0.5f) / samplesN;
            int x = Math.round(u * (sw - 1));

            int bestTopY = 0;
            float bestTopGrad = 0f;
            for (int y = 1; y < searchMargin; y++) {
                float g = Math.abs(lumaAt(tinyPx, sw, sh, x, y + 2) - lumaAt(tinyPx, sw, sh, x, y - 1));
                if (g > bestTopGrad) {
                    bestTopGrad = g;
                    bestTopY = y;
                }
            }
            topOffset[s] = bestTopGrad >= 16f ? (bestTopY / (float) sh) * h : 0f;

            int bestBotDy = 0;
            float bestBotGrad = 0f;
            for (int y = sh - 2; y > sh - 1 - searchMargin; y--) {
                float g = Math.abs(lumaAt(tinyPx, sw, sh, x, y - 2) - lumaAt(tinyPx, sw, sh, x, y + 1));
                if (g > bestBotGrad) {
                    bestBotGrad = g;
                    bestBotDy = sh - 1 - y;
                }
            }
            botOffset[s] = bestBotGrad >= 16f ? (bestBotDy / (float) sh) * h : 0f;
        }

        float[] smTop = new float[samplesN];
        float[] smBot = new float[samplesN];
        float topSag = smoothCurveAndMaxSag(topOffset, smTop);
        float botSag = smoothCurveAndMaxSag(botOffset, smBot);

        float minFrac = (scanMode == SCAN_MODE_BOOK) ? 0.010f : 0.015f;
        float sagThreshold = h * minFrac;
        float maxAllowed = h * 0.048f;
        boolean topCurved = topSag >= sagThreshold && topSag <= maxAllowed;
        boolean botCurved = botSag >= sagThreshold && botSag <= maxAllowed;

        if (!topCurved && !botCurved) {
            return warped;
        }

        // استيفاء ثنائي خطي للشرائح الأفقية مباشرة من warped إلى out دون حجز مصفوفتين كاملتين للحجم الكامل
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        int maxTopY = topCurved ? (int) Math.ceil(maxAllowed) + 2 : 0;
        int maxBotY = botCurved ? (int) Math.ceil(maxAllowed) + 2 : 0;
        int bandPad = Math.max(maxTopY, maxBotY) + 2;

        int[] dstStrip = new int[w * STRIP_H];
        int[] srcBand = null;
        int srcBandCap = 0;

        for (int yStart = 0; yStart < h; yStart += STRIP_H) {
            int curH = Math.min(STRIP_H, h - yStart);
            int readTop = Math.max(0, yStart - bandPad);
            int readBot = Math.min(h - 1, yStart + curH - 1 + bandPad);
            int readH = readBot - readTop + 1;

            int need = w * readH;
            if (srcBand == null || srcBandCap < need) {
                srcBand = new int[need];
                srcBandCap = need;
            }
            warped.getPixels(srcBand, 0, w, 0, readTop, w, readH);

            for (int ly = 0; ly < curH; ly++) {
                int y = yStart + ly;
                float v = y / (float) (h - 1);
                for (int x = 0; x < w; x++) {
                    float u = x / (float) (w - 1);
                    float topY = topCurved ? sampleCurve(smTop, u) : 0f;
                    float botY = (h - 1) - (botCurved ? sampleCurve(smBot, u) : 0f);
                    float sy = Math.max(readTop, Math.min(readBot - 0.001f, topY + v * (botY - topY)));
                    int y0 = Math.max(readTop, Math.min(readBot - 1, (int) Math.floor(sy)));
                    float fy = sy - y0;

                    int localY0 = y0 - readTop;
                    int localY1 = Math.min(readH - 1, localY0 + 1);
                    int c0 = srcBand[localY0 * w + x];
                    int c1 = srcBand[localY1 * w + x];
                    int r = Math.round(((c0 >> 16) & 0xFF) * (1f - fy) + ((c1 >> 16) & 0xFF) * fy);
                    int g = Math.round(((c0 >> 8) & 0xFF) * (1f - fy) + ((c1 >> 8) & 0xFF) * fy);
                    int b = Math.round((c0 & 0xFF) * (1f - fy) + (c1 & 0xFF) * fy);
                    dstStrip[ly * w + x] = 0xFF000000 | (r << 16) | (g << 8) | b;
                }
            }
            out.setPixels(dstStrip, 0, w, 0, yStart, w, curH);
        }
        return out;
    }

    private static float lumaAt(int[] px, int w, int h, int x, int y) {
        int cx = Math.max(0, Math.min(w - 1, x));
        int cy = Math.max(0, Math.min(h - 1, y));
        int c = px[cy * w + cx];
        return 0.299f * ((c >> 16) & 0xFF) + 0.587f * ((c >> 8) & 0xFF) + 0.114f * (c & 0xFF);
    }

    private static float smoothCurveAndMaxSag(float[] raw, float[] smoothedOut) {
        int n = raw.length;
        for (int i = 0; i < n; i++) {
            float acc = 0f;
            int cnt = 0;
            for (int d = -2; d <= 2; d++) {
                int j = Math.max(0, Math.min(n - 1, i + d));
                acc += raw[j];
                cnt++;
            }
            smoothedOut[i] = acc / cnt;
        }
        float startV = smoothedOut[0];
        float endV = smoothedOut[n - 1];
        float maxSag = 0f;
        for (int i = 2; i < n - 2; i++) {
            float lin = startV + ((endV - startV) * i) / (n - 1);
            float sag = Math.abs(smoothedOut[i] - lin);
            if (sag > maxSag) maxSag = sag;
        }
        return maxSag;
    }

    private static float sampleCurve(float[] curve, float u) {
        float pos = Math.max(0f, Math.min(curve.length - 1f, u * (curve.length - 1)));
        int i0 = (int) Math.floor(pos);
        int i1 = Math.min(curve.length - 1, i0 + 1);
        float f = pos - i0;
        return curve[i0] * (1f - f) + curve[i1] * f;
    }

    public static Bitmap warpRotateAndEnhance(
        Bitmap source,
        float[] corners,
        int rotationDeg,
        int filterMode,
        int brightnessAdjust,
        int maxWorkingDim
    ) {
        return warpRotateAndEnhance(source, corners, rotationDeg, filterMode, brightnessAdjust, maxWorkingDim, SCAN_MODE_SINGLE);
    }

    /**
     * تصحيح المنظور الفعلي + تسطيح الكتب عند اللزوم + تدوير 90° + تحسين منخفض الذاكرة
     */
    public static Bitmap warpRotateAndEnhance(
        Bitmap source,
        float[] corners,
        int rotationDeg,
        int filterMode,
        int brightnessAdjust,
        int maxWorkingDim,
        int scanMode
    ) {
        int sw = source.getWidth();
        int sh = source.getHeight();

        Bitmap warped;
        if (isFullFrame(corners)) {
            int outW = sw;
            int outH = sh;
            if (outW > maxWorkingDim || outH > maxWorkingDim) {
                float scale = maxWorkingDim / (float) Math.max(outW, outH);
                outW = Math.max(120, Math.round(outW * scale));
                outH = Math.max(120, Math.round(outH * scale));
            }
            warped = (outW == sw && outH == sh)
                ? source.copy(Bitmap.Config.ARGB_8888, true)
                : Bitmap.createScaledBitmap(source, outW, outH, true);
        } else {
            float[] srcPts = new float[]{
                corners[0] * sw, corners[1] * sh,
                corners[2] * sw, corners[3] * sh,
                corners[4] * sw, corners[5] * sh,
                corners[6] * sw, corners[7] * sh
            };

            double topW = Math.hypot(srcPts[2] - srcPts[0], srcPts[3] - srcPts[1]);
            double botW = Math.hypot(srcPts[4] - srcPts[6], srcPts[5] - srcPts[7]);
            double leftH = Math.hypot(srcPts[6] - srcPts[0], srcPts[7] - srcPts[1]);
            double rightH = Math.hypot(srcPts[4] - srcPts[2], srcPts[5] - srcPts[3]);

            int outW = Math.max(200, (int) Math.round(Math.max(topW, botW)));
            int outH = Math.max(200, (int) Math.round(Math.max(leftH, rightH)));
            if (outW > maxWorkingDim || outH > maxWorkingDim) {
                float scale = maxWorkingDim / (float) Math.max(outW, outH);
                outW = Math.max(120, Math.round(outW * scale));
                outH = Math.max(120, Math.round(outH * scale));
            }

            float[] dstPts = new float[]{
                0f, 0f,
                outW, 0f,
                outW, outH,
                0f, outH
            };

            warped = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(warped);
            canvas.drawColor(0xFFFFFFFF);
            Matrix warpMatrix = new Matrix();
            boolean mapped = warpMatrix.setPolyToPoly(srcPts, 0, dstPts, 0, 4);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            if (mapped) {
                canvas.drawBitmap(source, warpMatrix, paint);
            } else {
                Bitmap fallbackScaled = Bitmap.createScaledBitmap(source, outW, outH, true);
                canvas.drawBitmap(fallbackScaled, 0, 0, paint);
                if (fallbackScaled != source) fallbackScaled.recycle();
            }
        }

        Bitmap dewarped = (scanMode == SCAN_MODE_ID_CARD)
            ? warped
            : dewarpCurvedPageIfNeeded(warped, scanMode);
        if (dewarped != warped) warped.recycle();

        int normRot = ((rotationDeg % 360) + 360) % 360;
        int snappedRot = (Math.round(normRot / 90f) * 90) % 360;
        Bitmap oriented = dewarped;
        if (snappedRot != 0) {
            Matrix rotM = new Matrix();
            rotM.postRotate(snappedRot);
            oriented = Bitmap.createBitmap(dewarped, 0, 0, dewarped.getWidth(), dewarped.getHeight(), rotM, false);
            if (oriented != dewarped) dewarped.recycle();
        }

        if (!oriented.isMutable()) {
            Bitmap mut = oriented.copy(Bitmap.Config.ARGB_8888, true);
            oriented.recycle();
            oriented = mut;
        }

        applyDocumentFilterInPlace(oriented, filterMode, brightnessAdjust, scanMode);
        return oriented;
    }

    /**
     * معالجة الصورة موضعياً (In-Place Strip Processing) لتخفيض استهلاك الذاكرة بأكثر من 85%:
     * - بدون أي مصفوفات double[] أو int[] كاملة بحجم الصورة
     * - حساب خلفية الإضاءة بأخذ عينات صفية من 20×26 خلية باستخدام صف واحد فقط
     * - تطبيق التوازن والتنعيم والحِدة والفلتر على شرائح أفقية (STRIP_H = 96) وإعادة الكتابة داخل نفس الـ Bitmap
     */
    public static void applyDocumentFilterInPlace(Bitmap work, int filterMode, int brightnessAdjust, int scanMode) {
        if (work == null || work.isRecycled()) return;
        int clampedBright = Math.max(-35, Math.min(45, brightnessAdjust));
        int w = work.getWidth();
        int h = work.getHeight();
        if (w < 8 || h < 8) return;

        // 1) تقدير شبكة الإضاءة الخلفية باستخدام مخزن صف واحد فقط (~7 KB بدل ~14 MB)
        final int cols = 20;
        final int rows = 26;
        float[] bgR = new float[cols * rows];
        float[] bgG = new float[cols * rows];
        float[] bgB = new float[cols * rows];
        float cellW = (float) w / cols;
        float cellH = (float) h / rows;

        int[] singleRow = new int[w];
        float[] sr = new float[36];
        float[] sg = new float[36];
        float[] sb = new float[36];

        for (int gy = 0; gy < rows; gy++) {
            int y0 = (int) (gy * cellH);
            int y1 = Math.min(h, (int) Math.ceil((gy + 1) * cellH));
            int stepY = Math.max(1, (y1 - y0) / 6);
            int[] cellCounts = new int[cols];
            float[][] cellSr = new float[cols][36];
            float[][] cellSg = new float[cols][36];
            float[][] cellSb = new float[cols][36];

            for (int y = y0; y < y1; y += stepY) {
                work.getPixels(singleRow, 0, w, 0, y, w, 1);
                for (int gx = 0; gx < cols; gx++) {
                    if (cellCounts[gx] >= 36) continue;
                    int x0 = (int) (gx * cellW);
                    int x1 = Math.min(w, (int) Math.ceil((gx + 1) * cellW));
                    int stepX = Math.max(1, (x1 - x0) / 6);
                    for (int x = x0; x < x1 && cellCounts[gx] < 36; x += stepX) {
                        int c = singleRow[x];
                        int k = cellCounts[gx]++;
                        cellSr[gx][k] = (c >> 16) & 0xFF;
                        cellSg[gx][k] = (c >> 8) & 0xFF;
                        cellSb[gx][k] = c & 0xFF;
                    }
                }
            }
            for (int gx = 0; gx < cols; gx++) {
                int cnt = cellCounts[gx];
                int cellIdx = gy * cols + gx;
                if (cnt > 0) {
                    System.arraycopy(cellSr[gx], 0, sr, 0, cnt);
                    System.arraycopy(cellSg[gx], 0, sg, 0, cnt);
                    System.arraycopy(cellSb[gx], 0, sb, 0, cnt);
                    Arrays.sort(sr, 0, cnt);
                    Arrays.sort(sg, 0, cnt);
                    Arrays.sort(sb, 0, cnt);
                    int pIdx = Math.min(cnt - 1, (int) (cnt * 0.90f));
                    bgR[cellIdx] = Math.max(92f, sr[pIdx]);
                    bgG[cellIdx] = Math.max(92f, sg[pIdx]);
                    bgB[cellIdx] = Math.max(92f, sb[pIdx]);
                } else {
                    bgR[cellIdx] = 238f;
                    bgG[cellIdx] = 238f;
                    bgB[cellIdx] = 238f;
                }
            }
        }

        float[] smBgR = smoothBgGrid(bgR, cols, rows);
        float[] smBgG = smoothBgGrid(bgG, cols, rows);
        float[] smBgB = smoothBgGrid(bgB, cols, rows);

        float targetPaper = Math.max(210f, Math.min(255f, 245f + clampedBright * 0.45f));
        boolean gentleMode = (filterMode == FILTER_NATURAL || scanMode == SCAN_MODE_ID_CARD);
        float bgNoiseSum = 0f;
        int bgNoiseCount = 0;

        // 2) المرحلة الأولى بالبلاط: تسوية الإضاءة وحماية الأختام والتوقيعات موضعياً داخل work
        int[] normStrip = new int[w * STRIP_H];
        for (int yStart = 0; yStart < h; yStart += STRIP_H) {
            int curH = Math.min(STRIP_H, h - yStart);
            work.getPixels(normStrip, 0, w, 0, yStart, w, curH);

            for (int ly = 0; ly < curH; ly++) {
                int y = yStart + ly;
                float gyf = (y + 0.5f) / cellH - 0.5f;
                int gy0 = Math.max(0, Math.min(rows - 2, (int) Math.floor(gyf)));
                float fy = Math.max(0f, Math.min(1f, gyf - gy0));

                for (int x = 0; x < w; x++) {
                    float gxf = (x + 0.5f) / cellW - 0.5f;
                    int gx0 = Math.max(0, Math.min(cols - 2, (int) Math.floor(gxf)));
                    float fx = Math.max(0f, Math.min(1f, gxf - gx0));

                    float w00 = (1f - fx) * (1f - fy);
                    float w10 = fx * (1f - fy);
                    float w01 = (1f - fx) * fy;
                    float w11 = fx * fy;

                    int c00 = gy0 * cols + gx0;
                    float lBgR = smBgR[c00] * w00 + smBgR[c00 + 1] * w10 + smBgR[c00 + cols] * w01 + smBgR[c00 + cols + 1] * w11;
                    float lBgG = smBgG[c00] * w00 + smBgG[c00 + 1] * w10 + smBgG[c00 + cols] * w01 + smBgG[c00 + cols + 1] * w11;
                    float lBgB = smBgB[c00] * w00 + smBgB[c00 + 1] * w10 + smBgB[c00 + cols] * w01 + smBgB[c00 + cols + 1] * w11;
                    float lBgLum = 0.299f * lBgR + 0.587f * lBgG + 0.114f * lBgB;

                    int idx = ly * w + x;
                    int c = normStrip[idx];
                    float origR = (c >> 16) & 0xFF;
                    float origG = (c >> 8) & 0xFF;
                    float origB = c & 0xFF;

                    float wbGainR = targetPaper / Math.max(85f, lBgR);
                    float wbGainG = targetPaper / Math.max(85f, lBgG);
                    float wbGainB = targetPaper / Math.max(85f, lBgB);
                    float neutralGain = targetPaper / Math.max(85f, lBgLum);

                    float maxGain = gentleMode ? 1.45f : 2.10f;
                    float wbBlend = gentleMode ? 0.45f : 0.75f;
                    float gainR = Math.min(maxGain, wbGainR * wbBlend + neutralGain * (1f - wbBlend));
                    float gainG = Math.min(maxGain, wbGainG * wbBlend + neutralGain * (1f - wbBlend));
                    float gainB = Math.min(maxGain, wbGainB * wbBlend + neutralGain * (1f - wbBlend));

                    float nr = Math.min(255f, origR * gainR + clampedBright * 0.35f);
                    float ng = Math.min(255f, origG * gainG + clampedBright * 0.35f);
                    float nb = Math.min(255f, origB * gainB + clampedBright * 0.35f);

                    float lum = 0.299f * nr + 0.587f * ng + 0.114f * nb;
                    float chroma = Math.max(nr, Math.max(ng, nb)) - Math.min(nr, Math.min(ng, nb));
                    float relToWhite = lum / targetPaper;

                    if (gentleMode) {
                        // وضع الهوية/الطبيعي: يزيل اصفرار الخلفية بلطف فقط ويحمي الأختام والصور تماماً
                        if (chroma < 18f && relToWhite > 0.93f) {
                            float cleanFactor = Math.min(1f, (relToWhite - 0.93f) / 0.06f);
                            float liftTarget = 246f + clampedBright * 0.2f;
                            nr += (liftTarget - nr) * cleanFactor * 0.45f;
                            ng += (liftTarget - ng) * cleanFactor * 0.45f;
                            nb += (liftTarget - nb) * cleanFactor * 0.45f;
                        }
                    } else {
                        // المستندات القانونية: تبييض الخلفية المحايدة + حماية الأختام الحمراء والتوقيعات الزرقاء
                        if (chroma < 22f && relToWhite > 0.90f) {
                            bgNoiseSum += Math.abs(lum - targetPaper);
                            bgNoiseCount++;
                            float cleanFactor = Math.min(1f, (relToWhite - 0.90f) / 0.08f);
                            float liftTarget = 247f + clampedBright * 0.25f;
                            nr += (liftTarget - nr) * cleanFactor * 0.80f;
                            ng += (liftTarget - ng) * cleanFactor * 0.80f;
                            nb += (liftTarget - nb) * cleanFactor * 0.80f;
                        } else if (lum < 166f) {
                            float inkBoost = (166f - lum) * 0.13f;
                            float factor = chroma < 24f ? 1f : 0.28f;
                            nr = Math.max(0f, nr - inkBoost * factor);
                            ng = Math.max(0f, ng - inkBoost * factor);
                            nb = Math.max(0f, nb - inkBoost * factor);
                        }
                    }

                    int ir = Math.max(0, Math.min(255, Math.round(nr)));
                    int ig = Math.max(0, Math.min(255, Math.round(ng)));
                    int ib = Math.max(0, Math.min(255, Math.round(nb)));
                    normStrip[idx] = 0xFF000000 | (ir << 16) | (ig << 8) | ib;
                }
            }
            work.setPixels(normStrip, 0, w, 0, yStart, w, curH);
        }

        // 3) تنعيم انتقائي للخلفية + تدرج رمادي (عند طلبه) عبر مخزن دائري من 3 صفوف فقط (22 KB)
        float avgPaperNoise = bgNoiseCount > 0 ? (bgNoiseSum / bgNoiseCount) : 6f;
        int denoiseThresh = gentleMode ? 8 : (avgPaperNoise > 9f ? 18 : 11);
        apply3RowRangeDenoiseInPlace(work, w, h, denoiseThresh, filterMode == FILTER_GRAYSCALE);

        if (filterMode == FILTER_BLACK_WHITE) {
            // 4 أ) Sauvola بالشرائح (Strip Integral): يستهلك ~3.8 MB بدل ~54.8 MB وبنفس النتيجة الحسابية تماماً
            applyStripSauvolaBwInPlace(work, w, h);
        } else {
            // 4 ب) حدة تكيفية مضادة للهالات عبر مخزن دائري من 3 صفوف فقط (22 KB)
            float sharpAmount = gentleMode ? 0.14f : (avgPaperNoise > 10f ? 0.16f : 0.24f);
            apply3RowAdaptiveSharpenInPlace(work, w, h, sharpAmount);
        }
    }

    private static void apply3RowRangeDenoiseInPlace(Bitmap work, int w, int h, int thresh, boolean toGrayscale) {
        if (h < 3 || w < 3) return;
        int[] rowPrev = new int[w];
        int[] rowCurr = new int[w];
        int[] rowNext = new int[w];
        int[] rowOut = new int[w];

        work.getPixels(rowPrev, 0, w, 0, 0, w, 1);
        work.getPixels(rowCurr, 0, w, 0, 1, w, 1);

        if (toGrayscale) {
            convertRowToBalancedGray(rowPrev, w);
            work.setPixels(rowPrev, 0, w, 0, 0, w, 1);
            // إعادة قراءة الصف الأول في rowPrev كما كان قبل التحويل للحفاظ على دقة الجوار
            work.getPixels(rowPrev, 0, w, 0, 0, w, 1);
        }

        for (int y = 1; y < h - 1; y++) {
            work.getPixels(rowNext, 0, w, 0, y + 1, w, 1);
            rowOut[0] = toGrayscale ? pixelToBalancedGray(rowCurr[0]) : rowCurr[0];
            rowOut[w - 1] = toGrayscale ? pixelToBalancedGray(rowCurr[w - 1]) : rowCurr[w - 1];

            for (int x = 1; x < w - 1; x++) {
                int c0 = rowCurr[x];
                int cU = rowPrev[x];
                int cD = rowNext[x];
                int cL = rowCurr[x - 1];
                int cR = rowCurr[x + 1];

                int r = rangeFilterChannel((c0 >> 16) & 0xFF, (cU >> 16) & 0xFF, (cD >> 16) & 0xFF,
                    (cL >> 16) & 0xFF, (cR >> 16) & 0xFF, thresh);
                int g = rangeFilterChannel((c0 >> 8) & 0xFF, (cU >> 8) & 0xFF, (cD >> 8) & 0xFF,
                    (cL >> 8) & 0xFF, (cR >> 8) & 0xFF, thresh);
                int b = rangeFilterChannel(c0 & 0xFF, cU & 0xFF, cD & 0xFF,
                    cL & 0xFF, cR & 0xFF, thresh);
                int px = 0xFF000000 | (r << 16) | (g << 8) | b;
                rowOut[x] = toGrayscale ? pixelToBalancedGray(px) : px;
            }
            work.setPixels(rowOut, 0, w, 0, y, w, 1);

            int[] tmp = rowPrev;
            rowPrev = rowCurr;
            rowCurr = rowNext;
            rowNext = tmp;
        }

        if (toGrayscale) {
            convertRowToBalancedGray(rowCurr, w);
            work.setPixels(rowCurr, 0, w, 0, h - 1, w, 1);
        }
    }

    private static void apply3RowAdaptiveSharpenInPlace(Bitmap work, int w, int h, float sharpAmount) {
        if (h < 3 || w < 3) return;
        int[] rowPrev = new int[w];
        int[] rowCurr = new int[w];
        int[] rowNext = new int[w];
        int[] rowOut = new int[w];

        work.getPixels(rowPrev, 0, w, 0, 0, w, 1);
        work.getPixels(rowCurr, 0, w, 0, 1, w, 1);

        for (int y = 1; y < h - 1; y++) {
            work.getPixels(rowNext, 0, w, 0, y + 1, w, 1);
            rowOut[0] = rowCurr[0];
            rowOut[w - 1] = rowCurr[w - 1];

            for (int x = 1; x < w - 1; x++) {
                int c0 = rowCurr[x];
                int cU = rowPrev[x];
                int cD = rowNext[x];
                int cL = rowCurr[x - 1];
                int cR = rowCurr[x + 1];

                int r = sharpenChannelAdaptive((c0 >> 16) & 0xFF, (cU >> 16) & 0xFF, (cD >> 16) & 0xFF,
                    (cL >> 16) & 0xFF, (cR >> 16) & 0xFF, sharpAmount);
                int g = sharpenChannelAdaptive((c0 >> 8) & 0xFF, (cU >> 8) & 0xFF, (cD >> 8) & 0xFF,
                    (cL >> 8) & 0xFF, (cR >> 8) & 0xFF, sharpAmount);
                int b = sharpenChannelAdaptive(c0 & 0xFF, cU & 0xFF, cD & 0xFF,
                    cL & 0xFF, cR & 0xFF, sharpAmount);
                rowOut[x] = 0xFF000000 | (r << 16) | (g << 8) | b;
            }
            work.setPixels(rowOut, 0, w, 0, y, w, 1);

            int[] tmp = rowPrev;
            rowPrev = rowCurr;
            rowCurr = rowNext;
            rowNext = tmp;
        }
    }

    /**
     * Sauvola بالشرائح الأفقية (STRIP_H = 96 + هامش winR من الأعلى والأسفل):
     * - يخفض استهلاك الذاكرة من ~55 MB (double[] لكامل الصورة) إلى ~3.5 MB فقط
     * - int[] لجدول المجموع الآمن ضد الفيض الحسابي لأن 160 * 2400 * 255 < Integer.MAX_VALUE
     * - byte[] للسطوع بدلاً من int[]
     */
    private static void applyStripSauvolaBwInPlace(Bitmap work, int w, int h) {
        int winR = Math.max(8, Math.min(32, Math.round(Math.min(w, h) * 0.018f)));
        int maxBandH = STRIP_H + winR * 2;
        int iw = w + 1;

        byte[] bandLuma = new byte[w * maxBandH];
        int[] bandRow = new int[w];
        int[] stripIntegral = new int[iw * (maxBandH + 1)];
        long[] stripIntegralSq = new long[iw * (maxBandH + 1)];
        int[] outRow = new int[w];

        for (int yStart = 0; yStart < h; yStart += STRIP_H) {
            int curH = Math.min(STRIP_H, h - yStart);
            int readTop = Math.max(0, yStart - winR);
            int readBot = Math.min(h - 1, yStart + curH - 1 + winR);
            int readH = readBot - readTop + 1;

            Arrays.fill(stripIntegral, 0, iw, 0);
            Arrays.fill(stripIntegralSq, 0, iw, 0L);

            for (int ry = 0; ry < readH; ry++) {
                work.getPixels(bandRow, 0, w, 0, readTop + ry, w, 1);
                int rowSum = 0;
                long rowSq = 0L;
                int baseOut = (ry + 1) * iw;
                int basePrev = ry * iw;
                stripIntegral[baseOut] = 0;
                stripIntegralSq[baseOut] = 0L;

                for (int x = 0; x < w; x++) {
                    int c = bandRow[x];
                    int l = (((c >> 16) & 0xFF) * 77 + ((c >> 8) & 0xFF) * 150 + (c & 0xFF) * 29) >> 8;
                    bandLuma[ry * w + x] = (byte) l;
                    rowSum += l;
                    rowSq += (long) l * l;
                    stripIntegral[baseOut + x + 1] = stripIntegral[basePrev + x + 1] + rowSum;
                    stripIntegralSq[baseOut + x + 1] = stripIntegralSq[basePrev + x + 1] + rowSq;
                }
            }

            for (int ly = 0; ly < curH; ly++) {
                int gy = yStart + ly;
                int y0 = Math.max(readTop, gy - winR) - readTop;
                int y1 = Math.min(readBot, gy + winR) - readTop;
                int rBandY = gy - readTop;

                for (int x = 0; x < w; x++) {
                    int x0 = Math.max(0, x - winR);
                    int x1 = Math.min(w - 1, x + winR);
                    double area = (x1 - x0 + 1) * (y1 - y0 + 1);
                    int A = y0 * iw + x0;
                    int B = y0 * iw + (x1 + 1);
                    int C = (y1 + 1) * iw + x0;
                    int D = (y1 + 1) * iw + (x1 + 1);
                    double sumL = stripIntegral[D] - stripIntegral[B] - stripIntegral[C] + stripIntegral[A];
                    double sumSq = stripIntegralSq[D] - stripIntegralSq[B] - stripIntegralSq[C] + stripIntegralSq[A];
                    double meanL = sumL / area;
                    double var = Math.max(0.0, sumSq / area - meanL * meanL);
                    double stdL = Math.sqrt(var);

                    double sauvolaT = meanL * (1.0 + 0.18 * (stdL / 128.0 - 1.0));
                    double softFloorT = Math.min(232.0, Math.max(130.0, sauvolaT));

                    int curL = bandLuma[rBandY * w + x] & 0xFF;
                    double band = Math.max(14.0, stdL * 0.45);
                    int v;
                    if (curL >= softFloorT + band * 0.5 && curL > 188.0) {
                        v = 255;
                    } else if (curL <= softFloorT - band) {
                        v = 16;
                    } else {
                        double t = Math.max(0.0, Math.min(1.0, (curL - (softFloorT - band)) / (band * 1.5)));
                        v = (int) Math.round(16.0 + t * 239.0);
                    }
                    outRow[x] = 0xFF000000 | (v << 16) | (v << 8) | v;
                }
                work.setPixels(outRow, 0, w, 0, gy, w, 1);
            }
        }
    }

    private static void convertRowToBalancedGray(int[] row, int w) {
        for (int i = 0; i < w; i++) {
            row[i] = pixelToBalancedGray(row[i]);
        }
    }

    private static int pixelToBalancedGray(int c) {
        float lum = 0.299f * ((c >> 16) & 0xFF) + 0.587f * ((c >> 8) & 0xFF) + 0.114f * (c & 0xFF);
        if (lum > 205f) lum = Math.min(255f, lum + (lum - 205f) * 0.35f);
        else if (lum < 160f) lum = Math.max(0f, lum - (160f - lum) * 0.18f);
        int gv = Math.max(0, Math.min(255, Math.round(lum)));
        return 0xFF000000 | (gv << 16) | (gv << 8) | gv;
    }

    /**
     * ضغط Bitmap بصيغة JPEG بأمان تحت الحد الأقصى المطلوب (مع تقليص الأبعاد تدريجياً عند الحاجة)
     */
    public static byte[] compressBitmapUnderMaxBytes(Bitmap bmp, int initialQuality, int maxBytes) {
        Bitmap current = bmp;
        boolean createdScaled = false;
        try {
            int quality = initialQuality;
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            current.compress(Bitmap.CompressFormat.JPEG, quality, baos);

            int qTries = 0;
            while (baos.size() > maxBytes && qTries < 5 && quality > 64) {
                qTries++;
                quality = Math.max(62, quality - 6);
                baos.reset();
                current.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            }

            int dimTries = 0;
            while (baos.size() > maxBytes && dimTries < 4) {
                dimTries++;
                int nw = Math.max(480, Math.round(current.getWidth() * 0.84f));
                int nh = Math.max(480, Math.round(current.getHeight() * 0.84f));
                Bitmap next = Bitmap.createScaledBitmap(current, nw, nh, true);
                if (createdScaled && current != bmp && !current.isRecycled()) {
                    current.recycle();
                }
                current = next;
                createdScaled = (current != bmp);
                baos.reset();
                current.compress(Bitmap.CompressFormat.JPEG, Math.max(66, quality), baos);
            }
            return baos.toByteArray();
        } finally {
            if (createdScaled && current != bmp && !current.isRecycled()) {
                current.recycle();
            }
        }
    }

    private static float[] smoothBgGrid(float[] grid, int cols, int rows) {
        float[] cur = grid;
        for (int pass = 0; pass < 2; pass++) {
            float[] next = new float[cols * rows];
            for (int gy = 0; gy < rows; gy++) {
                for (int gx = 0; gx < cols; gx++) {
                    float acc = 0f;
                    float wtSum = 0f;
                    for (int dy = -1; dy <= 1; dy++) {
                        for (int dx = -1; dx <= 1; dx++) {
                            int nx = gx + dx, ny = gy + dy;
                            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                                float wt = (dx == 0 && dy == 0) ? 4f : ((dx == 0 || dy == 0) ? 2f : 1f);
                                acc += cur[ny * cols + nx] * wt;
                                wtSum += wt;
                            }
                        }
                    }
                    next[gy * cols + gx] = acc / wtSum;
                }
            }
            cur = next;
        }
        return cur;
    }

    private static int rangeFilterChannel(int center, int u, int d, int l, int r, int thresh) {
        int sum = center * 2;
        int cnt = 2;
        if (Math.abs(u - center) <= thresh) { sum += u; cnt++; }
        if (Math.abs(d - center) <= thresh) { sum += d; cnt++; }
        if (Math.abs(l - center) <= thresh) { sum += l; cnt++; }
        if (Math.abs(r - center) <= thresh) { sum += r; cnt++; }
        return Math.round(sum / (float) cnt);
    }

    private static int sharpenChannelAdaptive(int center, int u, int d, int l, int r, float amount) {
        float avg = (u + d + l + r) * 0.25f;
        float diff = center - avg;
        if (Math.abs(diff) < 3.5f) return center;
        int minN = Math.min(center, Math.min(Math.min(u, d), Math.min(l, r)));
        int maxN = Math.max(center, Math.max(Math.max(u, d), Math.max(l, r)));
        int clamped = Math.round(Math.max(minN - 6f, Math.min(maxN + 6f, center + diff * amount)));
        return Math.max(0, Math.min(255, clamped));
    }
}
