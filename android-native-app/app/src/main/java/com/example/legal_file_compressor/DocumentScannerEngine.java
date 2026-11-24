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

    public static final int FILTER_ORIGINAL_COLOR = 0; // تحسين ذكي لطيف يحافظ على الأختام والكتابة الخفيفة
    public static final int FILTER_GRAYSCALE = 1;      // تدرج رمادي متوازن
    public static final int FILTER_BLACK_WHITE = 2;    // أبيض وأسود تكيفي (Sauvola بالشرائح)
    public static final int FILTER_NATURAL = 3;        // طبيعي لطيف (للهويات والأختام الحساسة)
    public static final int FILTER_ORIGINAL = 4;       // الأصل الكامل دون تعديل ألوان أو تبييض (الافتراضي)

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
     * التحقق المنطقي من قص المستخدم قبل الاعتماد أو الانتقال للحفظ
     */
    public static boolean isLogicalUserCrop(float[] c, int scanMode) {
        if (!isConvexQuad(c)) return false;
        float area = quadPolygonArea(c);
        float minArea = (scanMode == SCAN_MODE_ID_CARD) ? 0.045f : 0.07f;
        if (area < minArea) return false;

        double topW = Math.hypot(c[2] - c[0], c[3] - c[1]);
        double botW = Math.hypot(c[4] - c[6], c[5] - c[7]);
        double leftH = Math.hypot(c[6] - c[0], c[7] - c[1]);
        double rightH = Math.hypot(c[4] - c[2], c[5] - c[3]);
        double minSide = Math.min(Math.min(topW, botW), Math.min(leftH, rightH));
        if (minSide < 0.08) return false;

        double avgW = (topW + botW) * 0.5;
        double avgH = (leftH + rightH) * 0.5;
        double aspect = Math.max(avgW, avgH) / Math.max(0.01, Math.min(avgW, avgH));
        if (aspect > 4.5) return false;

        for (int i = 0; i < 4; i++) {
            int p = ((i + 3) % 4) * 2;
            int q = i * 2;
            int r = ((i + 1) % 4) * 2;
            double v1x = c[p] - c[q], v1y = c[p + 1] - c[q + 1];
            double v2x = c[r] - c[q], v2y = c[r + 1] - c[q + 1];
            double l1 = Math.hypot(v1x, v1y);
            double l2 = Math.hypot(v2x, v2y);
            if (l1 < 0.08 || l2 < 0.08) return false;
            double cosA = (v1x * v2x + v1y * v2y) / (l1 * l2);
            double deg = Math.toDegrees(Math.acos(Math.max(-1.0, Math.min(1.0, cosA))));
            if (deg < 28.0 || deg > 152.0) return false;
        }
        return true;
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
     * كشف حدود الورقة الخارجية الكاملة من Bitmap مع الحفاظ على نسبة الأبعاد الحقيقية للصورة
     */
    public static DetectionResult detectDocumentQuad(Bitmap srcBmp, float stabilityDiff, int scanMode) {
        float[] fallback = (scanMode == SCAN_MODE_ID_CARD) ? defaultIdCardCorners() : fullFrameCorners();
        if (srcBmp == null || srcBmp.isRecycled() || srcBmp.getWidth() < 16 || srcBmp.getHeight() < 16) {
            return new DetectionResult(false, 0.05f, 0f, stabilityDiff, fallback);
        }
        final int longEdge = 320;
        int sw = srcBmp.getWidth();
        int sh = srcBmp.getHeight();
        float scale = longEdge / (float) Math.max(sw, sh);
        int w = Math.max(120, Math.round(sw * scale));
        int h = Math.max(120, Math.round(sh * scale));

        Bitmap scaled = Bitmap.createScaledBitmap(srcBmp, w, h, true);
        int[] px = new int[w * h];
        scaled.getPixels(px, 0, w, 0, 0, w, h);
        if (scaled != srcBmp) scaled.recycle();
        return detectDocumentQuadFromArgb(px, w, h, stabilityDiff, scanMode);
    }

    /**
     * نقطة دخول قابلة للاختبار المباشر على مصفوفات ARGB الكاملة دون الحاجة لـ Bitmap
     */
    public static DetectionResult detectDocumentQuadFromArgb(int[] px, int w, int h, float stabilityDiff, int scanMode) {
        float[] fallback = (scanMode == SCAN_MODE_ID_CARD) ? defaultIdCardCorners() : fullFrameCorners();
        if (px == null || w < 32 || h < 32 || px.length < w * h) {
            return new DetectionResult(false, 0.05f, 0f, stabilityDiff, fallback);
        }
        int n = w * h;
        int[] rArr = new int[n];
        int[] gArr = new int[n];
        int[] bArr = new int[n];
        int[] rawLum = new int[n];
        for (int i = 0; i < n; i++) {
            int c = px[i];
            int r = (c >> 16) & 0xFF;
            int g = (c >> 8) & 0xFF;
            int b = c & 0xFF;
            rArr[i] = r;
            gArr[i] = g;
            bArr[i] = b;
            rawLum[i] = (r * 77 + g * 150 + b * 29) >> 8;
        }
        return detectQuadCore(rawLum, rArr, gArr, bArr, w, h, stabilityDiff, scanMode, true);
    }

    public static DetectionResult detectDocumentQuad(byte[] grayBytes, int w, int h, float stabilityDiff) {
        return detectDocumentQuad(grayBytes, w, h, stabilityDiff, SCAN_MODE_SINGLE);
    }

    /**
     * كشف حدود المستند في الزمن الحقيقي لإطارات الكاميرا الرمادية NV21
     */
    public static DetectionResult detectDocumentQuad(byte[] grayBytes, int w, int h, float stabilityDiff, int scanMode) {
        float[] fallback = (scanMode == SCAN_MODE_ID_CARD) ? defaultIdCardCorners() : defaultGuideCorners();
        if (grayBytes == null || w < 32 || h < 32 || grayBytes.length < w * h) {
            return new DetectionResult(false, 0.05f, 0f, stabilityDiff, fallback);
        }
        int n = w * h;
        int[] rawLum = new int[n];
        for (int i = 0; i < n; i++) rawLum[i] = grayBytes[i] & 0xFF;
        return detectQuadCore(rawLum, null, null, null, w, h, stabilityDiff, scanMode, false);
    }

    private static final class ScoredCandidate {
        final float[] quad;
        final float confidence;

        ScoredCandidate(float[] quad, float confidence) {
            this.quad = quad;
            this.confidence = confidence;
        }
    }

    /**
     * النواة الموحدة لاكتشاف حدود الورقة الخارجية الكاملة:
     * 1. إزالة النص والأختام والباركود والأسطر الداخلية عبر الإغلاق المورفولوجي (Separable Closing)
     *    بحيث لا تنجذب الحواف أبداً إلى فقرة أو شريط سفلي داخل المستند
     * 2. توليد فرضيات متعددة (تباين الخلفية، عتبة Otsu التكيفية، غلاف الحواف النظيف، إسقاط الحواف الأربع)
     * 3. تقييم كل فرضية بفحوصات هندسية صارمة ضد الأشرطة والميل قبل اعتماد أي نتيجة
     */
    private static DetectionResult detectQuadCore(
        int[] rawLum,
        int[] rawR,
        int[] rawG,
        int[] rawB,
        int w,
        int h,
        float stabilityDiff,
        int scanMode,
        boolean hasColor
    ) {
        int n = w * h;
        int[] smoothLum = gaussian3x3(rawLum, w, h);
        float sharpness = computeInteriorLaplacianSharpness(rawLum, w, h);

        int closeRadius = Math.max(2, Math.min(4, Math.round(Math.min(w, h) / 72f)));
        int[] closedLum = morphCloseSeparable(smoothLum, w, h, closeRadius);

        int[] closedR = null, closedG = null, closedB = null;
        if (hasColor && rawR != null && rawG != null && rawB != null) {
            closedR = morphCloseSeparable(gaussian3x3(rawR, w, h), w, h, closeRadius);
            closedG = morphCloseSeparable(gaussian3x3(rawG, w, h), w, h, closeRadius);
            closedB = morphCloseSeparable(gaussian3x3(rawB, w, h), w, h, closeRadius);
        }

        int[] closedGrad = new int[n];
        int[] closedGx = new int[n];
        int[] closedGy = new int[n];
        for (int y = 1; y < h - 1; y++) {
            int row = y * w;
            for (int x = 1; x < w - 1; x++) {
                int idx = row + x;
                int gx =
                    -closedLum[(y - 1) * w + (x - 1)] + closedLum[(y - 1) * w + (x + 1)]
                    - 2 * closedLum[row + (x - 1)] + 2 * closedLum[row + (x + 1)]
                    - closedLum[(y + 1) * w + (x - 1)] + closedLum[(y + 1) * w + (x + 1)];
                int gy =
                    -closedLum[(y - 1) * w + (x - 1)] - 2 * closedLum[(y - 1) * w + x] - closedLum[(y - 1) * w + (x + 1)]
                    + closedLum[(y + 1) * w + (x - 1)] + 2 * closedLum[(y + 1) * w + x] + closedLum[(y + 1) * w + (x + 1)];
                closedGx[idx] = gx;
                closedGy[idx] = gy;
                int gMag = Math.abs(gx) + Math.abs(gy);
                if (closedR != null) {
                    int cg = (sobelAt(closedR, w, x, y) + sobelAt(closedG, w, x, y) + sobelAt(closedB, w, x, y)) / 2;
                    if (cg > gMag) gMag = cg;
                }
                closedGrad[idx] = gMag;
            }
        }

        // عينات الإطار الخارجي + عينات المنطقة الداخلية (على الصورة المنظّفة من النصوص)
        int maxB = w * 8 + h * 8 + 64;
        int[] bL = new int[maxB];
        int[] bR = hasColor ? new int[maxB] : null;
        int[] bG = hasColor ? new int[maxB] : null;
        int[] bB = hasColor ? new int[maxB] : null;
        int bs = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if ((x < 4 || x >= w - 4 || y < 4 || y >= h - 4) && bs < maxB) {
                    int idx = y * w + x;
                    bL[bs] = closedLum[idx];
                    if (hasColor) {
                        bR[bs] = closedR[idx];
                        bG[bs] = closedG[idx];
                        bB[bs] = closedB[idx];
                    }
                    bs++;
                }
            }
        }
        Arrays.sort(bL, 0, bs);
        int borderP25 = bs > 0 ? bL[(int) (bs * 0.25f)] : 90;
        int borderMed = bs > 0 ? bL[bs / 2] : 110;
        int borderP75 = bs > 0 ? bL[(int) (bs * 0.75f)] : 130;
        int medR = 110, medG = 110, medB = 110;
        if (hasColor && bs > 0) {
            Arrays.sort(bR, 0, bs);
            Arrays.sort(bG, 0, bs);
            Arrays.sort(bB, 0, bs);
            medR = bR[bs / 2];
            medG = bG[bs / 2];
            medB = bB[bs / 2];
        }

        int yStart = (scanMode == SCAN_MODE_ID_CARD) ? (h * 28) / 100 : (h * 18) / 100;
        int yEnd = (scanMode == SCAN_MODE_ID_CARD) ? (h * 72) / 100 : (h * 82) / 100;
        int xStart = (scanMode == SCAN_MODE_ID_CARD) ? (w * 18) / 100 : (w * 18) / 100;
        int xEnd = (scanMode == SCAN_MODE_ID_CARD) ? (w * 82) / 100 : (w * 82) / 100;

        int maxC = (w * h) / 2 + 64;
        int[] cL = new int[maxC];
        int[] cR = hasColor ? new int[maxC] : null;
        int[] cG = hasColor ? new int[maxC] : null;
        int[] cB = hasColor ? new int[maxC] : null;
        int cs = 0;
        for (int y = yStart; y < yEnd; y++) {
            for (int x = xStart; x < xEnd; x++) {
                if (cs < maxC) {
                    int idx = y * w + x;
                    cL[cs] = closedLum[idx];
                    if (hasColor) {
                        cR[cs] = closedR[idx];
                        cG[cs] = closedG[idx];
                        cB[cs] = closedB[idx];
                    }
                    cs++;
                }
            }
        }
        Arrays.sort(cL, 0, cs);
        int centerP60 = cs > 0 ? cL[(int) (cs * 0.60f)] : 195;
        int centerP75 = cs > 0 ? cL[(int) (cs * 0.75f)] : 205;
        int docR = 200, docG = 200, docB = 200;
        if (hasColor && cs > 0) {
            Arrays.sort(cR, 0, cs);
            Arrays.sort(cG, 0, cs);
            Arrays.sort(cB, 0, cs);
            docR = cR[(int) (cs * 0.65f)];
            docG = cG[(int) (cs * 0.65f)];
            docB = cB[(int) (cs * 0.65f)];
        }

        ScoredCandidate best = null;

        // الفرضية 1: فصل لون وسطوع الورقة عن الإطار المحيط (مع مسارين للحدود الملامسة للحافة)
        float lumSpanMed = Math.abs(centerP75 - borderMed);
        float lumSpanLow = Math.abs(centerP75 - borderP25);
        float colorSpan = hasColor ? (float) Math.sqrt(
            (docR - medR) * (docR - medR) + (docG - medG) * (docG - medG) + (docB - medB) * (docB - medB)
        ) : 0f;

        if (lumSpanMed >= 9f || colorSpan >= 14f) {
            boolean brighter = centerP75 >= borderMed;
            float lumT = brighter ? (borderMed + lumSpanMed * 0.42f) : (borderMed - lumSpanMed * 0.42f);
            boolean[] maskA = buildColorLumMask(closedLum, closedR, closedG, closedB, w, h,
                brighter, lumSpanMed, lumT, medR, medG, medB, docR, docG, docB, colorSpan, hasColor);
            best = pickBetter(best, evaluateMaskCandidates(maskA, closedGrad, closedLum, w, h,
                Math.max(lumSpanMed, colorSpan * 0.85f), scanMode));
        }

        if (lumSpanLow >= 14f && Math.abs(borderMed - borderP25) >= 12f) {
            boolean brighter = centerP75 >= borderP25;
            float lumT = brighter ? (borderP25 + lumSpanLow * 0.45f) : (borderP25 - lumSpanLow * 0.45f);
            boolean[] maskA2 = buildColorLumMask(closedLum, null, null, null, w, h,
                brighter, lumSpanLow, lumT, 0, 0, 0, 0, 0, 0, 0f, false);
            best = pickBetter(best, evaluateMaskCandidates(maskA2, closedGrad, closedLum, w, h,
                lumSpanLow, scanMode));
        }

        // الفرضية 2: عتبة Otsu التكيفية على خريطة الورقة المنظّفة (تعالج الظلال والإضاءة غير المتجانسة)
        int[] otsu = computeOtsuThreshold(closedLum, w, h);
        if (otsu[1] >= 12) {
            int otsuT = otsu[0];
            boolean paperBright = centerP60 >= borderP25 || centerP75 >= borderP75 - 8;
            boolean[] maskOtsu = new boolean[n];
            for (int y = 1; y < h - 1; y++) {
                for (int x = 1; x < w - 1; x++) {
                    int idx = y * w + x;
                    maskOtsu[idx] = paperBright ? (closedLum[idx] >= otsuT) : (closedLum[idx] <= otsuT);
                }
            }
            best = pickBetter(best, evaluateMaskCandidates(maskOtsu, closedGrad, closedLum, w, h, otsu[1], scanMode));
        }

        // الفرضية 3: غلاف الحواف المنظّف من النصوص (بعتبة قوية + عتبة لطيفة للورق الفاتح فوق خلفية فاتحة)
        best = pickBetter(best, detectFromCleanEdgeEnvelope(closedGrad, closedLum, w, h, 0.84f, 44, scanMode));
        if (best == null || best.confidence < 0.62f) {
            best = pickBetter(best, detectFromCleanEdgeEnvelope(closedGrad, closedLum, w, h, 0.76f, 26, scanMode));
        }

        // الفرضية 4: إسقاط الحواف الأربع المستقيمة (للمستندات الكاملة أو ذات التباين المنخفض مع الخلفية)
        if (scanMode != SCAN_MODE_ID_CARD && (best == null || best.confidence < 0.68f)) {
            best = pickBetter(best, detectFromDirectionalBorderLines(closedGrad, closedGx, closedGy, closedLum, w, h, scanMode));
        }

        if (best != null && best.confidence >= 0.50f) {
            return new DetectionResult(true, best.confidence, sharpness, stabilityDiff, best.quad);
        }
        float[] missFallback = (scanMode == SCAN_MODE_ID_CARD)
            ? defaultIdCardCorners()
            : (hasColor ? fullFrameCorners() : defaultGuideCorners());
        float missConf = best != null ? Math.min(0.42f, best.confidence) : 0.12f;
        return new DetectionResult(false, missConf, sharpness, stabilityDiff, missFallback);
    }

    private static boolean[] buildColorLumMask(
        int[] lum, int[] rArr, int[] gArr, int[] bArr, int w, int h,
        boolean paperBrighter, float lumSpan, float lumThresh,
        int medR, int medG, int medB, int docR, int docG, int docB, float colorSpan, boolean hasColor
    ) {
        int n = w * h;
        boolean[] mask = new boolean[n];
        float colorDistThresh = Math.max(15f, colorSpan * 0.34f);
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                int idx = y * w + x;
                boolean brightMatch = lumSpan >= 9f && (paperBrighter ? lum[idx] >= lumThresh : lum[idx] <= lumThresh);
                boolean colorMatch = false;
                if (hasColor && colorSpan >= 14f) {
                    float bgDist = (float) Math.sqrt(
                        (rArr[idx] - medR) * (rArr[idx] - medR) +
                        (gArr[idx] - medG) * (gArr[idx] - medG) +
                        (bArr[idx] - medB) * (bArr[idx] - medB)
                    );
                    float docDist = (float) Math.sqrt(
                        (rArr[idx] - docR) * (rArr[idx] - docR) +
                        (gArr[idx] - docG) * (gArr[idx] - docG) +
                        (bArr[idx] - docB) * (bArr[idx] - docB)
                    );
                    colorMatch = bgDist >= colorDistThresh && docDist <= bgDist * 0.90f;
                }
                if (brightMatch || colorMatch) mask[idx] = true;
            }
        }
        return mask;
    }

    private static int[] computeOtsuThreshold(int[] lum, int w, int h) {
        int[] hist = new int[256];
        int total = 0;
        long sumAll = 0L;
        for (int y = 2; y < h - 2; y++) {
            for (int x = 2; x < w - 2; x++) {
                int v = Math.max(0, Math.min(255, lum[y * w + x]));
                hist[v]++;
                total++;
                sumAll += v;
            }
        }
        if (total == 0) return new int[]{ 128, 0 };
        double sumB = 0.0;
        int wB = 0;
        double maxVar = -1.0;
        int bestT = 128;
        int bestSep = 0;
        for (int t = 0; t < 256; t++) {
            wB += hist[t];
            if (wB == 0) continue;
            int wF = total - wB;
            if (wF == 0) break;
            sumB += (double) t * hist[t];
            double mB = sumB / wB;
            double mF = (sumAll - sumB) / wF;
            double varBetween = (double) wB * wF * (mB - mF) * (mB - mF);
            if (varBetween > maxVar) {
                maxVar = varBetween;
                bestT = t;
                bestSep = (int) Math.round(Math.abs(mF - mB));
            }
        }
        return new int[]{ bestT, bestSep };
    }

    private static ScoredCandidate detectFromCleanEdgeEnvelope(
        int[] grad, int[] closedLum, int w, int h, float pctile, int minFloor, int scanMode
    ) {
        int n = w * h;
        int[] sample = new int[n / 4 + 16];
        int sc = 0;
        for (int y = 3; y < h - 3; y += 2) {
            for (int x = 3; x < w - 3; x += 2) {
                if (sc < sample.length) sample[sc++] = grad[y * w + x];
            }
        }
        Arrays.sort(sample, 0, sc);
        int edgeThresh = sc > 0 ? Math.max(minFloor, sample[(int) (sc * pctile)]) : minFloor;

        boolean[] edgeMask = new boolean[n];
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                if (grad[y * w + x] >= edgeThresh) edgeMask[y * w + x] = true;
            }
        }
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
            int cx = cur % w, cy = cur / w;
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
            if (!outside[i]) { inside[i] = true; insideCount++; }
        }
        float minFrac = (scanMode == SCAN_MODE_ID_CARD) ? 0.09f : 0.20f;
        if (insideCount > n * minFrac && insideCount < n * 0.96f) {
            return evaluateMaskCandidates(inside, grad, closedLum, w, h, 34f, scanMode);
        }
        return null;
    }

    /**
     * إسقاط الحواف الأربع المستقيمة عبر مسح مائل (-16°..+16°) في النطاقات الخارجية الأربعة
     */
    private static ScoredCandidate detectFromDirectionalBorderLines(
        int[] grad, int[] gx, int[] gy, int[] closedLum, int w, int h, int scanMode
    ) {
        // نحسب أعلى خط مستقيم في كل من: أعلى [0..0.38h]، أسفل [0.62h..1.0h]، يسار [0..0.38w]، يمين [0.62w..1.0w]
        double[] topLine = findStrongestBandLine(grad, gx, gy, w, h, true, 0.02f, 0.36f, 1f);
        double[] botLine = findStrongestBandLine(grad, gx, gy, w, h, true, 0.64f, 0.98f, -1f);
        double[] leftLine = findStrongestBandLine(grad, gx, gy, w, h, false, 0.02f, 0.36f, 1f);
        double[] rightLine = findStrongestBandLine(grad, gx, gy, w, h, false, 0.64f, 0.98f, -1f);

        if (topLine == null || botLine == null || leftLine == null || rightLine == null) return null;

        PointF tl = intersectLinePair(leftLine, topLine);
        PointF tr = intersectLinePair(topLine, rightLine);
        PointF br = intersectLinePair(rightLine, botLine);
        PointF bl = intersectLinePair(botLine, leftLine);
        if (tl == null || tr == null || br == null || bl == null) return null;

        float[] quad = canonicalOrderQuad(new float[]{
            clamp01(tl.x / w), clamp01(tl.y / h),
            clamp01(tr.x / w), clamp01(tr.y / h),
            clamp01(br.x / w), clamp01(br.y / h),
            clamp01(bl.x / w), clamp01(bl.y / h)
        });
        float[] refined = refineQuadCornersDirectional(quad, grad, w, h, scanMode);
        float[] padded = expandQuadSlightly(refined, 0.005f);
        return scoreAndValidateQuad(padded, grad, closedLum, w, h, 30f, scanMode, 0.92f);
    }

    /**
     * إيجاد أقوى خط حافة مستمر في نطاق أفقي أو عمودي (مع تفضيل الخطوط القريبة من المحيط الخارجي)
     */
    private static double[] findStrongestBandLine(
        int[] grad, int[] gx, int[] gy, int w, int h,
        boolean horizontal, float startFrac, float endFrac, float inwardDir
    ) {
        double bestScore = -1.0;
        double[] bestLine = null;
        int span = horizontal ? w : h;
        int crossSpan = horizontal ? h : w;
        int posStart = Math.max(2, Math.round(crossSpan * startFrac));
        int posEnd = Math.min(crossSpan - 3, Math.round(crossSpan * endFrac));
        int xMin = Math.round(span * 0.12f);
        int xMax = Math.round(span * 0.88f);
        int step = Math.max(2, (xMax - xMin) / 48);

        for (int deg = -14; deg <= 14; deg += 2) {
            double slope = Math.tan(Math.toRadians(deg));
            for (int c = posStart; c <= posEnd; c += 2) {
                double sumG = 0.0;
                int hits = 0;
                int total = 0;
                int polPos = 0, polNeg = 0;
                for (int u = xMin; u <= xMax; u += step) {
                    double du = u - span * 0.5;
                    int v = (int) Math.round(c + slope * du);
                    if (v < 2 || v >= crossSpan - 2) continue;
                    int px = horizontal ? u : v;
                    int py = horizontal ? v : u;
                    int idx = py * w + px;
                    int g = grad[idx];
                    // فحص ±1px للتسامح مع الرقمنة
                    int gMax = Math.max(g, horizontal
                        ? Math.max(grad[(py - 1) * w + px], grad[(py + 1) * w + px])
                        : Math.max(grad[py * w + (px - 1)], grad[py * w + (px + 1)]));
                    total++;
                    if (gMax >= 24) {
                        hits++;
                        sumG += Math.min(180, gMax);
                        int sg = horizontal ? gy[idx] : gx[idx];
                        if (sg > 12) polPos++;
                        else if (sg < -12) polNeg++;
                    }
                }
                if (total < 14 || hits < total * 0.42) continue;
                double hitRatio = hits / (double) total;
                double avgG = sumG / total;
                double polarityConsistency = Math.max(polPos, polNeg) / (double) Math.max(1, polPos + polNeg);
                if (polarityConsistency < 0.62) continue;
                // مكافأة طفيفة للاقتراب من المحيط الخارجي للورقة بدل الانزلاق إلى حافة فقرة داخلية
                double distFromMid = Math.abs(c - crossSpan * 0.5) / (crossSpan * 0.5);
                double score = avgG * hitRatio * (0.7 + 0.3 * polarityConsistency) * (0.88 + 0.22 * distFromMid);
                if (score > bestScore) {
                    bestScore = score;
                    // تمثيل الخط: a*x + b*y + cc = 0
                    if (horizontal) {
                        // y = c + slope * (x - w*0.5)  =>  -slope*x + y + (slope*w*0.5 - c) = 0
                        bestLine = new double[]{ -slope, 1.0, slope * (w * 0.5) - c };
                    } else {
                        // x = c + slope * (y - h*0.5)  =>  x - slope*y + (slope*h*0.5 - c) = 0
                        bestLine = new double[]{ 1.0, -slope, slope * (h * 0.5) - c };
                    }
                }
            }
        }
        return bestLine;
    }

    private static PointF intersectLinePair(double[] l1, double[] l2) {
        double det = l1[0] * l2[1] - l2[0] * l1[1];
        if (Math.abs(det) < 1e-6) return null;
        double x = (l1[1] * l2[2] - l2[1] * l1[2]) / det;
        double y = (l2[0] * l1[2] - l1[0] * l2[2]) / det;
        if (Double.isNaN(x) || Double.isNaN(y) || Double.isInfinite(x) || Double.isInfinite(y)) return null;
        return new PointF((float) x, (float) y);
    }

    private static ScoredCandidate pickBetter(ScoredCandidate a, ScoredCandidate b) {
        if (a == null) return b;
        if (b == null) return a;
        return b.confidence > a.confidence ? b : a;
    }

    private static ScoredCandidate evaluateMaskCandidates(
        boolean[] mask,
        int[] grad,
        int[] closedLum,
        int w,
        int h,
        float contrastSpan,
        int scanMode
    ) {
        int n = w * h;
        boolean[] dilated = dilate3x3(mask, w, h);
        boolean[] closed = erode3x3(dilated, w, h);
        boolean[] opened = dilate3x3(erode3x3(closed, w, h), w, h);

        int[] visited = new int[n];
        int[] queue = new int[n];

        float minAreaRatio = (scanMode == SCAN_MODE_ID_CARD) ? 0.09f : 0.20f;
        float maxBorderRatio = 0.72f;

        List<int[]> bestBlob = null;
        int bestArea = 0;
        List<int[]> secondBlob = null;
        int secondArea = 0;

        int[] dxs = { -1, 1, 0, 0 };
        int[] dys = { 0, 0, -1, 1 };

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
                    if (cx <= 1 || cx >= w - 2 || cy <= 1 || cy >= h - 2) {
                        borderTouches++;
                    }
                    boolean isEdge = false;
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
                if (areaRatio >= minAreaRatio && areaRatio <= 0.985f && borderTouches < area * maxBorderRatio) {
                    if (area > bestArea) {
                        secondArea = bestArea;
                        secondBlob = bestBlob;
                        bestArea = area;
                        bestBlob = perimeter;
                    } else if (area > secondArea) {
                        secondArea = area;
                        secondBlob = perimeter;
                    }
                }
            }
        }

        ScoredCandidate res = null;
        if (bestBlob != null && bestBlob.size() >= 16) {
            res = pickBetter(res, fitAndScoreBlob(bestBlob, bestArea, grad, closedLum, w, h, contrastSpan, scanMode));
        }
        if (secondBlob != null && secondBlob.size() >= 16) {
            res = pickBetter(res, fitAndScoreBlob(secondBlob, secondArea, grad, closedLum, w, h, contrastSpan, scanMode));
        }
        return res;
    }

    private static ScoredCandidate fitAndScoreBlob(
        List<int[]> perimeter,
        int blobArea,
        int[] grad,
        int[] closedLum,
        int w,
        int h,
        float contrastSpan,
        int scanMode
    ) {
        List<PointF> hull = convexHull(perimeter);
        if (hull.size() < 4) return null;

        float[] fitted = fitQuadFromHullRobust(hull, w, h);
        if (fitted == null) return null;

        float[] refined = refineQuadCornersDirectional(fitted, grad, w, h, scanMode);
        float[] protectedQuad = expandQuadSlightly(refined, 0.006f);
        float[] ordered = canonicalOrderQuad(protectedQuad);

        float quadAreaPx = quadPolygonArea(ordered) * (w * h);
        float fillRatio = Math.min(1.05f, blobArea / Math.max(1f, quadAreaPx));
        return scoreAndValidateQuad(ordered, grad, closedLum, w, h, contrastSpan, scanMode, fillRatio);
    }

    /**
     * تقليص الغلاف المحدب بتقنية حذف أصغر مثلث ثم ملاءمة أضلاع المربع بدقة عند أي زاوية ميل
     */
    private static float[] fitQuadFromHullRobust(List<PointF> hull, int w, int h) {
        List<PointF> poly = new ArrayList<PointF>(hull);
        while (poly.size() > 4) {
            int removeIdx = 0;
            double minTriArea = Double.MAX_VALUE;
            int m = poly.size();
            for (int i = 0; i < m; i++) {
                PointF a = poly.get((i + m - 1) % m);
                PointF b = poly.get(i);
                PointF c = poly.get((i + 1) % m);
                double area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) * 0.5;
                if (area < minTriArea) {
                    minTriArea = area;
                    removeIdx = i;
                }
            }
            poly.remove(removeIdx);
        }
        if (poly.size() != 4) return null;

        // ترتيب أولي عقارب الساعة حول المركز
        float[] rawQuad = canonicalOrderQuad(new float[]{
            poly.get(0).x, poly.get(0).y,
            poly.get(1).x, poly.get(1).y,
            poly.get(2).x, poly.get(2).y,
            poly.get(3).x, poly.get(3).y
        });

        PointF tl0 = new PointF(rawQuad[0], rawQuad[1]);
        PointF tr0 = new PointF(rawQuad[2], rawQuad[3]);
        PointF br0 = new PointF(rawQuad[4], rawQuad[5]);
        PointF bl0 = new PointF(rawQuad[6], rawQuad[7]);

        double[] lineTop = fitSideLine(hull, tl0, tr0);
        double[] lineRight = fitSideLine(hull, tr0, br0);
        double[] lineBottom = fitSideLine(hull, br0, bl0);
        double[] lineLeft = fitSideLine(hull, bl0, tl0);

        double maxJump = Math.min(w, h) * 0.14;
        PointF tl = intersectLinesBounded(lineLeft, lineTop, tl0, maxJump);
        PointF tr = intersectLinesBounded(lineTop, lineRight, tr0, maxJump);
        PointF br = intersectLinesBounded(lineRight, lineBottom, br0, maxJump);
        PointF bl = intersectLinesBounded(lineBottom, lineLeft, bl0, maxJump);

        return canonicalOrderQuad(new float[]{
            clamp01(tl.x / w), clamp01(tl.y / h),
            clamp01(tr.x / w), clamp01(tr.y / h),
            clamp01(br.x / w), clamp01(br.y / h),
            clamp01(bl.x / w), clamp01(bl.y / h)
        });
    }

    /**
     * ترتيب الزوايا الأربع هندسياً بترتيب ثابت:
     * 0: أعلى يسار (TL)، 1: أعلى يمين (TR)، 2: أسفل يمين (BR)، 3: أسفل يسار (BL)
     */
    public static float[] canonicalOrderQuad(float[] c) {
        if (c == null || c.length != 8) return fullFrameCorners();
        float mx = (c[0] + c[2] + c[4] + c[6]) * 0.25f;
        float my = (c[1] + c[3] + c[5] + c[7]) * 0.25f;

        final float[][] pts = new float[4][3];
        for (int i = 0; i < 4; i++) {
            pts[i][0] = c[i * 2];
            pts[i][1] = c[i * 2 + 1];
            pts[i][2] = (float) Math.atan2(pts[i][1] - my, pts[i][0] - mx);
        }
        Arrays.sort(pts, new Comparator<float[]>() {
            @Override
            public int compare(float[] a, float[] b) {
                return Float.compare(a[2], b[2]);
            }
        });

        // بدء الدوران من أقرب نقطة لأعلى اليسار (أصغر x + y)
        int start = 0;
        float minSum = Float.MAX_VALUE;
        for (int i = 0; i < 4; i++) {
            float sum = pts[i][0] + pts[i][1];
            if (sum < minSum) {
                minSum = sum;
                start = i;
            }
        }
        float[] out = new float[8];
        for (int i = 0; i < 4; i++) {
            float[] p = pts[(start + i) % 4];
            out[i * 2] = p[0];
            out[i * 2 + 1] = p[1];
        }
        return out;
    }

    private static ScoredCandidate scoreAndValidateQuad(
        float[] c,
        int[] grad,
        int[] closedLum,
        int w,
        int h,
        float contrastSpan,
        int scanMode,
        float fillRatio
    ) {
        if (!isValidPaperQuad(c, scanMode)) return null;

        int nonBorderSides = 0;
        float sumEdgeSupport = 0f;
        float sumBoundaryContrast = 0f;
        float minSideScore = 1f;

        for (int side = 0; side < 4; side++) {
            int next = (side + 1) % 4;
            float x0 = c[side * 2], y0 = c[side * 2 + 1];
            float x1 = c[next * 2], y1 = c[next * 2 + 1];
            if (isFlushWithImageBorder(x0, y0, x1, y1)) {
                continue;
            }
            nonBorderSides++;
            float[] sideStats = measureSingleSideSupport(x0, y0, x1, y1, grad, closedLum, w, h, c);
            float edgeRatio = sideStats[0];
            float stepRatio = sideStats[1];
            float combined = Math.max(edgeRatio, stepRatio * 0.85f);
            if (combined < 0.20f) {
                // ضلع داخلي غير مدعوم بحافة فعلية -> نرفض القص كي لا يقتطع نصف الورقة
                return null;
            }
            if (combined < minSideScore) minSideScore = combined;
            sumEdgeSupport += edgeRatio;
            sumBoundaryContrast += stepRatio;
        }

        if (nonBorderSides == 0) {
            // كامل الإطار مطابق لحواف الصورة تقريباً: نقبله فقط لو يغطي >= 88%
            return quadPolygonArea(c) >= 0.88f ? new ScoredCandidate(c, 0.56f) : null;
        }
        if (nonBorderSides == 1 && quadPolygonArea(c) < 0.72f) {
            return null;
        }

        float avgEdge = sumEdgeSupport / nonBorderSides;
        float avgStep = sumBoundaryContrast / nonBorderSides;
        if (avgEdge < 0.28f && avgStep < 0.34f) return null;

        float area = quadPolygonArea(c);
        float areaBonus;
        if (scanMode == SCAN_MODE_ID_CARD) {
            areaBonus = (area >= 0.14f && area <= 0.72f) ? 1.0f : 0.72f;
        } else {
            // تفضيل الورقة الكاملة على أي منطقة فرعية أصغر داخلها
            areaBonus = Math.min(1.0f, Math.max(0.35f, (area - 0.12f) / 0.58f));
        }

        float conf = Math.min(0.98f,
            avgEdge * 0.34f
            + avgStep * 0.24f
            + minSideScore * 0.14f
            + areaBonus * 0.18f
            + Math.min(1f, Math.max(0f, fillRatio)) * 0.05f
            + Math.min(1f, Math.max(0f, contrastSpan) / 60f) * 0.05f
        );
        if (conf < 0.50f) return null;
        return new ScoredCandidate(c, conf);
    }

    private static boolean isFlushWithImageBorder(float x0, float y0, float x1, float y1) {
        final float eps = 0.026f;
        return (x0 <= eps && x1 <= eps)
            || (x0 >= 1f - eps && x1 >= 1f - eps)
            || (y0 <= eps && y1 <= eps)
            || (y0 >= 1f - eps && y1 >= 1f - eps);
    }

    private static float[] measureSingleSideSupport(
        float nx0, float ny0, float nx1, float ny1,
        int[] grad, int[] closedLum, int w, int h, float[] quad
    ) {
        float x0 = nx0 * (w - 1), y0 = ny0 * (h - 1);
        float x1 = nx1 * (w - 1), y1 = ny1 * (h - 1);
        float dx = x1 - x0, dy = y1 - y0;
        float len = Math.max(1f, (float) Math.hypot(dx, dy));
        // المتجه العمودي للداخل بناءً على مركز المضلع
        float mx = (quad[0] + quad[2] + quad[4] + quad[6]) * 0.25f * (w - 1);
        float my = (quad[1] + quad[3] + quad[5] + quad[7]) * 0.25f * (h - 1);
        float inX = -dy / len, inY = dx / len;
        float midX = (x0 + x1) * 0.5f, midY = (y0 + y1) * 0.5f;
        if ((mx - midX) * inX + (my - midY) * inY < 0f) {
            inX = -inX;
            inY = -inY;
        }

        int steps = 24;
        int edgeHits = 0;
        int stepHits = 0;
        int total = 0;
        for (int s = 1; s < steps; s++) {
            float t = s / (float) steps;
            int cx = Math.round(x0 + dx * t);
            int cy = Math.round(y0 + dy * t);
            int maxG = 0;
            for (int oy = -2; oy <= 2; oy++) {
                for (int ox = -2; ox <= 2; ox++) {
                    int sx = Math.max(1, Math.min(w - 2, cx + ox));
                    int sy = Math.max(1, Math.min(h - 2, cy + oy));
                    int g = grad[sy * w + sx];
                    if (g > maxG) maxG = g;
                }
            }
            if (maxG >= 28) edgeHits++;

            int ix = Math.max(0, Math.min(w - 1, Math.round(cx + inX * 4f)));
            int iy = Math.max(0, Math.min(h - 1, Math.round(cy + inY * 4f)));
            int ox = Math.max(0, Math.min(w - 1, Math.round(cx - inX * 4f)));
            int oy = Math.max(0, Math.min(h - 1, Math.round(cy - inY * 4f)));
            if (Math.abs(closedLum[iy * w + ix] - closedLum[oy * w + ox]) >= 9) {
                stepHits++;
            }
            total++;
        }
        if (total == 0) return new float[]{ 0f, 0f };
        return new float[]{ edgeHits / (float) total, stepHits / (float) total };
    }

    /**
     * اختبارات التحقق الهندسية الصارمة لمنع القص الشريطي أو المائل أو المقتطع لجزء من المستند
     */
    public static boolean isValidPaperQuad(float[] c, int scanMode) {
        if (!isConvexQuad(c)) return false;

        float area = quadPolygonArea(c);
        float minArea = (scanMode == SCAN_MODE_ID_CARD) ? 0.10f : 0.22f;
        if (area < minArea || area > 0.985f) return false;

        // فحص الترتيب الصحيح: أعلى يسار، أعلى يمين، أسفل يمين، أسفل يسار
        float topAvgY = (c[1] + c[3]) * 0.5f;
        float botAvgY = (c[5] + c[7]) * 0.5f;
        float leftAvgX = (c[0] + c[6]) * 0.5f;
        float rightAvgX = (c[2] + c[4]) * 0.5f;
        if (botAvgY - topAvgY < (scanMode == SCAN_MODE_ID_CARD ? 0.14f : 0.24f)) return false;
        if (rightAvgX - leftAvgX < 0.24f) return false;

        double topW = Math.hypot(c[2] - c[0], c[3] - c[1]);
        double botW = Math.hypot(c[4] - c[6], c[5] - c[7]);
        double leftH = Math.hypot(c[6] - c[0], c[7] - c[1]);
        double rightH = Math.hypot(c[4] - c[2], c[5] - c[3]);

        double minW = Math.min(topW, botW), maxW = Math.max(topW, botW);
        double minH = Math.min(leftH, rightH), maxH = Math.max(leftH, rightH);

        if (scanMode == SCAN_MODE_ID_CARD) {
            if (minW < 0.26 || minH < 0.16) return false;
            if (minW / Math.max(1e-4, maxW) < 0.52 || minH / Math.max(1e-4, maxH) < 0.52) return false;
            double aspect = ((topW + botW) * 0.5) / Math.max(1e-4, (leftH + rightH) * 0.5);
            if (aspect < 1.05 || aspect > 2.40) return false;
        } else {
            // رفض قاطع للأشرطة الأفقية أو العمودية الصغيرة (مثل شريط أسفل الورقة)
            if (minH < 0.30 || maxH < 0.36) return false;
            if (minW < 0.28 || maxW < 0.36) return false;
            if (minW / Math.max(1e-4, maxW) < 0.48 || minH / Math.max(1e-4, maxH) < 0.48) return false;
            double avgW = (topW + botW) * 0.5;
            double avgH = (leftH + rightH) * 0.5;
            double aspect = Math.max(avgW, avgH) / Math.max(1e-4, Math.min(avgW, avgH));
            if (aspect > 2.35) return false;

            // منع اعتماد منطقة فرعية محصورة في النصف السفلي أو العلوي فقط
            float minY = Math.min(Math.min(c[1], c[3]), Math.min(c[5], c[7]));
            float maxY = Math.max(Math.max(c[1], c[3]), Math.max(c[5], c[7]));
            float minX = Math.min(Math.min(c[0], c[2]), Math.min(c[4], c[6]));
            float maxX = Math.max(Math.max(c[0], c[2]), Math.max(c[4], c[6]));
            if (area < 0.40f && (minY > 0.40f || maxY < 0.60f || minX > 0.40f || maxX < 0.60f)) {
                return false;
            }
        }

        // فحص الزوايا الأربع والتوازي النسبي للأضلاع المتقابلة لمنع التشوه والميل الشديد
        for (int i = 0; i < 4; i++) {
            int p = ((i + 3) % 4) * 2;
            int q = i * 2;
            int r = ((i + 1) % 4) * 2;
            double v1x = c[p] - c[q], v1y = c[p + 1] - c[q + 1];
            double v2x = c[r] - c[q], v2y = c[r + 1] - c[q + 1];
            double l1 = Math.hypot(v1x, v1y);
            double l2 = Math.hypot(v2x, v2y);
            if (l1 < 0.14 || l2 < 0.14) return false;
            double cosA = (v1x * v2x + v1y * v2y) / (l1 * l2);
            double deg = Math.toDegrees(Math.acos(Math.max(-1.0, Math.min(1.0, cosA))));
            if (deg < 52.0 || deg > 128.0) return false;

            double cross = v2x * v1y - v2y * v1x;
            if (cross <= 0) return false;
        }

        double topAng = Math.atan2(c[3] - c[1], c[2] - c[0]);
        double botAng = Math.atan2(c[5] - c[7], c[4] - c[6]);
        double leftAng = Math.atan2(c[7] - c[1], c[6] - c[0]);
        double rightAng = Math.atan2(c[5] - c[3], c[4] - c[2]);
        if (angleDiffDeg(topAng, botAng) > 30.0 || angleDiffDeg(leftAng, rightAng) > 30.0) {
            return false;
        }
        return true;
    }

    private static double angleDiffDeg(double a, double b) {
        double d = Math.toDegrees(Math.abs(a - b)) % 360.0;
        if (d > 180.0) d = 360.0 - d;
        return d;
    }

    private static float computeInteriorLaplacianSharpness(int[] lum, int w, int h) {
        long lapSum = 0L;
        int lapCount = 0;
        for (int y = h / 6; y < (h * 5) / 6; y++) {
            int row = y * w;
            for (int x = w / 6; x < (w * 5) / 6; x++) {
                int idx = row + x;
                int lap = Math.abs(4 * lum[idx] - lum[idx - 1] - lum[idx + 1] - lum[idx - w] - lum[idx + w]);
                lapSum += lap;
                lapCount++;
            }
        }
        return lapCount > 0 ? (lapSum / (float) lapCount) : 0f;
    }

    /**
     * إغلاق مورفولوجي قابل للفصل (Max ثم Min 1D) يزيل الحبر والنصوص والباركود مع إبقاء حافة الورقة سليمة
     */
    private static int[] morphCloseSeparable(int[] src, int w, int h, int radius) {
        int[] dilated = morphExtremeSeparable(src, w, h, radius, true);
        return morphExtremeSeparable(dilated, w, h, radius, false);
    }

    private static int[] morphExtremeSeparable(int[] src, int w, int h, int radius, boolean takeMax) {
        int[] temp = new int[w * h];
        int[] out = new int[w * h];
        for (int y = 0; y < h; y++) {
            int row = y * w;
            for (int x = 0; x < w; x++) {
                int x0 = Math.max(0, x - radius);
                int x1 = Math.min(w - 1, x + radius);
                int best = src[row + x0];
                for (int kx = x0 + 1; kx <= x1; kx++) {
                    int v = src[row + kx];
                    if (takeMax ? (v > best) : (v < best)) best = v;
                }
                temp[row + x] = best;
            }
        }
        for (int y = 0; y < h; y++) {
            int y0 = Math.max(0, y - radius);
            int y1 = Math.min(h - 1, y + radius);
            int row = y * w;
            for (int x = 0; x < w; x++) {
                int best = temp[y0 * w + x];
                for (int ky = y0 + 1; ky <= y1; ky++) {
                    int v = temp[ky * w + x];
                    if (takeMax ? (v > best) : (v < best)) best = v;
                }
                out[row + x] = best;
            }
        }
        return out;
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

    private static double[] fitSideLine(List<PointF> hull, PointF p1, PointF p2) {
        double dx = p2.x - p1.x;
        double dy = p2.y - p1.y;
        double len = Math.hypot(dx, dy);
        if (len < 6.0) return new double[]{ -dy, dx, dy * p1.x - dx * p1.y };

        double nx = -dy / len;
        double ny = dx / len;

        List<PointF> near = new ArrayList<PointF>();
        double maxDist = Math.max(3.5, len * 0.06);
        for (PointF p : hull) {
            double dist = Math.abs((p.x - p1.x) * nx + (p.y - p1.y) * ny);
            double proj = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / (len * len);
            if (dist <= maxDist && proj >= -0.05 && proj <= 1.05) {
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

    private static PointF intersectLinesBounded(double[] l1, double[] l2, PointF fallback, double maxJump) {
        double det = l1[0] * l2[1] - l2[0] * l1[1];
        if (Math.abs(det) < 1e-6) return fallback;
        double x = (l1[1] * l2[2] - l2[1] * l1[2]) / det;
        double y = (l2[0] * l1[2] - l1[0] * l2[2]) / det;
        if (Double.isNaN(x) || Double.isNaN(y) || Math.hypot(x - fallback.x, y - fallback.y) > maxJump) {
            return fallback;
        }
        return new PointF((float) x, (float) y);
    }

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
            for (int dy = -5; dy <= 5; dy++) {
                for (int dx = -5; dx <= 5; dx++) {
                    int nx = Math.max(1, Math.min(w - 2, Math.round(cx) + dx));
                    int ny = Math.max(1, Math.min(h - 2, Math.round(cy) + dy));
                    int g = grad[ny * w + nx];
                    float outwardProj = dx * ox + dy * oy;
                    float distPenalty = (dx * dx + dy * dy) * 0.75f;
                    float score = g + Math.max(-3f, outwardProj * 3.0f) - distPenalty;
                    if (g >= 28 && score > bestScore) {
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

    public static float quadPolygonArea(float[] c) {
        float s = 0f;
        for (int i = 0; i < 4; i++) {
            int j = (i + 1) % 4;
            s += c[i * 2] * c[j * 2 + 1] - c[j * 2] * c[i * 2 + 1];
        }
        return Math.abs(s) * 0.5f;
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

        Bitmap dewarped = (scanMode == SCAN_MODE_BOOK)
            ? dewarpCurvedPageIfNeeded(warped, scanMode)
            : warped;
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
     * معالجة الصورة موضعياً (In-Place Strip Processing):
     * - FILTER_ORIGINAL يحافظ على البكسلات الأصلية 100% دون أي تعديل تلقائي على الأختام أو الكتابة الخفيفة
     * - التحسين الذكي والرمادي يحميان الألوان والأختام والتوقيعات والنصوص الدقيقة
     */
    public static void applyDocumentFilterInPlace(Bitmap work, int filterMode, int brightnessAdjust, int scanMode) {
        if (work == null || work.isRecycled()) return;
        int clampedBright = Math.max(-35, Math.min(45, brightnessAdjust));
        int w = work.getWidth();
        int h = work.getHeight();
        if (w < 8 || h < 8) return;

        if (filterMode == FILTER_ORIGINAL) {
            if (clampedBright == 0) return;
            int[] strip = new int[w * STRIP_H];
            int delta = Math.round(clampedBright * 1.15f);
            for (int yStart = 0; yStart < h; yStart += STRIP_H) {
                int curH = Math.min(STRIP_H, h - yStart);
                work.getPixels(strip, 0, w, 0, yStart, w, curH);
                int total = w * curH;
                for (int i = 0; i < total; i++) {
                    int c = strip[i];
                    int r = Math.max(0, Math.min(255, ((c >> 16) & 0xFF) + delta));
                    int g = Math.max(0, Math.min(255, ((c >> 8) & 0xFF) + delta));
                    int b = Math.max(0, Math.min(255, (c & 0xFF) + delta));
                    strip[i] = 0xFF000000 | (r << 16) | (g << 8) | b;
                }
                work.setPixels(strip, 0, w, 0, yStart, w, curH);
            }
            return;
        }

        // 1) تقدير شبكة الإضاءة الخلفية باستخدام مخزن صف واحد فقط (~7 KB)
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
                    bgR[cellIdx] = Math.max(105f, sr[pIdx]);
                    bgG[cellIdx] = Math.max(105f, sg[pIdx]);
                    bgB[cellIdx] = Math.max(105f, sb[pIdx]);
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

        float targetPaper = Math.max(210f, Math.min(255f, 244f + clampedBright * 0.45f));
        boolean gentleMode = (filterMode == FILTER_NATURAL || scanMode == SCAN_MODE_ID_CARD);
        boolean legalColorSafe = (filterMode == FILTER_ORIGINAL_COLOR);
        float bgNoiseSum = 0f;
        int bgNoiseCount = 0;

        // 2) تسوية الإضاءة مع حماية كاملة للكتابة الخفيفة والأختام والتوقيعات
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

                    float wbGainR = targetPaper / Math.max(95f, lBgR);
                    float wbGainG = targetPaper / Math.max(95f, lBgG);
                    float wbGainB = targetPaper / Math.max(95f, lBgB);
                    float neutralGain = targetPaper / Math.max(95f, lBgLum);

                    float maxGain = (gentleMode || legalColorSafe) ? 1.52f : 1.90f;
                    float wbBlend = (gentleMode || legalColorSafe) ? 0.48f : 0.68f;
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
                        if (chroma < 16f && relToWhite > 0.94f) {
                            float cleanFactor = Math.min(1f, (relToWhite - 0.94f) / 0.05f);
                            float liftTarget = 246f + clampedBright * 0.2f;
                            nr += (liftTarget - nr) * cleanFactor * 0.40f;
                            ng += (liftTarget - ng) * cleanFactor * 0.40f;
                            nb += (liftTarget - nb) * cleanFactor * 0.40f;
                        }
                    } else if (legalColorSafe) {
                        // تحسين قانوني متوازن: ينظف الورقة فقط فوق 93.5% مع إبقاء الكتابة الباهتة والأختام سليمة
                        if (chroma < 16f && relToWhite > 0.935f) {
                            bgNoiseSum += Math.abs(lum - targetPaper);
                            bgNoiseCount++;
                            float cleanFactor = Math.min(1f, (relToWhite - 0.935f) / 0.055f);
                            float liftTarget = 247f + clampedBright * 0.22f;
                            nr += (liftTarget - nr) * cleanFactor * 0.55f;
                            ng += (liftTarget - ng) * cleanFactor * 0.55f;
                            nb += (liftTarget - nb) * cleanFactor * 0.55f;
                        } else if (lum < 185f) {
                            float inkBoost = (185f - lum) * 0.14f;
                            float factor = chroma < 20f ? 1f : 0.22f;
                            nr = Math.max(0f, nr - inkBoost * factor);
                            ng = Math.max(0f, ng - inkBoost * factor);
                            nb = Math.max(0f, nb - inkBoost * factor);
                        }
                    } else {
                        // رمادي / أبيض وأسود: تنظيف أوضح مع إبقاء النصوص الخفيفة مرئية
                        if (chroma < 20f && relToWhite > 0.915f) {
                            bgNoiseSum += Math.abs(lum - targetPaper);
                            bgNoiseCount++;
                            float cleanFactor = Math.min(1f, (relToWhite - 0.915f) / 0.075f);
                            float liftTarget = 247f + clampedBright * 0.25f;
                            nr += (liftTarget - nr) * cleanFactor * 0.70f;
                            ng += (liftTarget - ng) * cleanFactor * 0.70f;
                            nb += (liftTarget - nb) * cleanFactor * 0.70f;
                        } else if (lum < 178f) {
                            float inkBoost = (178f - lum) * 0.14f;
                            float factor = chroma < 24f ? 1f : 0.26f;
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

        // 3) تنعيم انتقائي لطيف + تحويل رمادي عند الطلب
        float avgPaperNoise = bgNoiseCount > 0 ? (bgNoiseSum / bgNoiseCount) : 6f;
        int denoiseThresh = (gentleMode || legalColorSafe) ? 7 : (avgPaperNoise > 9f ? 14 : 9);
        apply3RowRangeDenoiseInPlace(work, w, h, denoiseThresh, filterMode == FILTER_GRAYSCALE);

        if (filterMode == FILTER_BLACK_WHITE) {
            applyStripSauvolaBwInPlace(work, w, h);
        } else {
            float sharpAmount = (gentleMode || legalColorSafe) ? 0.15f : (avgPaperNoise > 10f ? 0.16f : 0.22f);
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
