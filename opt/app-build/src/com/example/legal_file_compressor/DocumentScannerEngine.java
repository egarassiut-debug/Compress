package com.example.legal_file_compressor;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PointF;
import android.media.ExifInterface;

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/**
 * محرك الرؤية الحاسوبية ومعالجة المستندات أوفلاين (Pure Android SDK - Zero External Bloat):
 * - تحليل إطارات NV21 بالزمن الحقيقي: كشف الورقة (Segmentation + Morphology + Connected Component + Convex Hull + 4-Line Intersection)
 * - حساب التباين على الحواف (Sobel Edge Strength) ومقياس الحدة (Sharpness/Laplacian) لمنع الالتقاط العشوائي عند غياب الورقة أو اهتزازها
 * - تصحيح المنظور الفعلي Projective Homography عبر Matrix.setPolyToPoly
 * - دعم 3 أوضاع للجودة: الألوان الأصلية المحسّنة (افتراضي)، تدرج رمادي، أبيض وأسود ذكي
 */
public final class DocumentScannerEngine {

    public static final int FILTER_ORIGINAL_COLOR = 0; // الافتراضي: ألوان أصلية محسّنة
    public static final int FILTER_GRAYSCALE = 1;
    public static final int FILTER_BLACK_WHITE = 2;

    public static final class DetectionResult {
        public final boolean detected;
        public final float confidence;     // 0..1
        public final float sharpness;      // مقياس وضوح الحواف والتفاصيل
        public final float stabilityDiff;  // معدل تغيّر الإضاءة بين الإطارات
        public final float[] corners;      // 8 قيم: [TL.x, TL.y, TR.x, TR.y, BR.x, BR.y, BL.x, BL.y] مطبّعة 0..1

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

    /**
     * استخراج مصفوفة رمادية مصغرة من إطار NV21 مع مراعاة زاوية العرض (عادة 90° للهواتف العمودية)
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

    /**
     * استخراج مصفوفة رمادية مصغرة من Bitmap
     */
    public static byte[] sampleGrayFromBitmap(Bitmap bmp, int outW, int outH) {
        Bitmap scaled = Bitmap.createScaledBitmap(bmp, outW, outH, true);
        int[] px = new int[outW * outH];
        scaled.getPixels(px, 0, outW, 0, 0, outW, outH);
        if (scaled != bmp) scaled.recycle();
        byte[] gray = new byte[outW * outH];
        for (int i = 0; i < px.length; i++) {
            int c = px[i];
            int r = (c >> 16) & 0xFF;
            int g = (c >> 8) & 0xFF;
            int b = c & 0xFF;
            gray[i] = (byte) ((r * 77 + g * 150 + b * 29) >> 8);
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

    /**
     * خوارزمية الرؤية الحاسوبية لاكتشاف المستند والزوايا الأربع من مصفوفة الإضاءة الرمادية:
     * 1. تنعيم Gaussian 3x3 لتقليل الضوضاء
     * 2. حساب تدرّج Sobel + مقياس الحدة Laplacian
     * 3. تقدير سطوع الخلفية من الإطار الخارجي + تحليل التباين لتكوين قناع الورقة
     * 4. إغلاق مورفولوجي (Dilation -> Erosion) لدمج الحروف داخل الورقة في جسم متصل واحد
     * 5. إيجاد أكبر مكوّن متصل (Connected Component BFS) + غلافه المحدب (Andrew's Convex Hull)
     * 6. فصل الأضلاع الـ 4 وتوفيقها بأقل مربعات (Least-Squares Line Fitting) ثم حساب تقاطع الخطوط للزوايا الدقيقة
     * 7. التحقق الصارم من الهندسة وقوة الحواف لرفض اللقطات التي لا تحتوي ورقة واضحة
     */
    public static DetectionResult detectDocumentQuad(byte[] grayBytes, int w, int h, float stabilityDiff) {
        int n = w * h;
        int[] lum = new int[n];
        for (int i = 0; i < n; i++) lum[i] = grayBytes[i] & 0xFF;

        // 1. Gaussian-like 3x3 smoothing
        int[] smooth = new int[n];
        System.arraycopy(lum, 0, smooth, 0, n);
        for (int y = 1; y < h - 1; y++) {
            int row = y * w;
            for (int x = 1; x < w - 1; x++) {
                int v =
                    lum[(y - 1) * w + (x - 1)] + 2 * lum[(y - 1) * w + x] + lum[(y - 1) * w + (x + 1)] +
                    2 * lum[row + (x - 1)] + 4 * lum[row + x] + 2 * lum[row + (x + 1)] +
                    lum[(y + 1) * w + (x - 1)] + 2 * lum[(y + 1) * w + x] + lum[(y + 1) * w + (x + 1)];
                smooth[row + x] = v >> 4;
            }
        }

        // 2. Sobel Gradient & Interior Laplacian sharpness
        int[] grad = new int[n];
        long lapSum = 0L;
        int lapCount = 0;
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                int gx =
                    -smooth[(y - 1) * w + (x - 1)] + smooth[(y - 1) * w + (x + 1)]
                    - 2 * smooth[y * w + (x - 1)] + 2 * smooth[y * w + (x + 1)]
                    - smooth[(y + 1) * w + (x - 1)] + smooth[(y + 1) * w + (x + 1)];
                int gy =
                    -smooth[(y - 1) * w + (x - 1)] - 2 * smooth[(y - 1) * w + x] - smooth[(y - 1) * w + (x + 1)]
                    + smooth[(y + 1) * w + (x - 1)] + 2 * smooth[(y + 1) * w + x] + smooth[(y + 1) * w + (x + 1)];
                grad[y * w + x] = Math.abs(gx) + Math.abs(gy);

                if (x > w / 6 && x < (w * 5) / 6 && y > h / 6 && y < (h * 5) / 6) {
                    int lap = Math.abs(4 * lum[y * w + x]
                        - lum[(y - 1) * w + x] - lum[(y + 1) * w + x]
                        - lum[y * w + (x - 1)] - lum[y * w + (x + 1)]);
                    lapSum += lap;
                    lapCount++;
                }
            }
        }
        float sharpness = lapCount > 0 ? (lapSum / (float) lapCount) : 0f;

        // 3. تقدير سطوع الخلفية المحيطة (شريط الإطار الخارجي) + سطوع الوسط
        int[] borderSamples = new int[(w * 2 + h * 2) * 3];
        int bs = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if (x < 3 || x >= w - 3 || y < 3 || y >= h - 3) {
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

        // إذا لم يوجد فرق إضاءة كافٍ ولا حواف قوية بين الورقة والخلفية، لا نخمّن قصاً خاطئاً
        int contrastSpan = centerP75 - borderMedian;
        boolean hasBrightPaper = contrastSpan >= 18;
        int threshold = hasBrightPaper
            ? borderMedian + Math.max(14, Math.round(contrastSpan * 0.44f))
            : Math.min(205, borderMedian + 28);

        // بناء القناع الثنائي الأولي (إضافة نقاط الحواف القوية لمنع تسرّب الحواف)
        boolean[] mask = new boolean[n];
        for (int y = 2; y < h - 2; y++) {
            for (int x = 2; x < w - 2; x++) {
                int idx = y * w + x;
                if (smooth[idx] >= threshold) {
                    mask[idx] = true;
                }
            }
        }

        // 4. إغلاق مورفولوجي (Dilate 3x3 ثم Erode 3x3) لسد فجوات النصوص والأختام داخل الورقة
        boolean[] dilated = dilate3x3(mask, w, h);
        boolean[] closed = erode3x3(dilated, w, h);
        // فتح خفيف (Erode -> Dilate) لإزالة النقاط الصغيرة المنفصلة في الخلفية
        boolean[] opened = dilate3x3(erode3x3(closed, w, h), w, h);

        // 5. إيجاد أكبر مكوّن متصل (BFS)
        int[] visited = new int[n];
        int[] queue = new int[n];
        List<int[]> bestBlob = null;
        int bestArea = 0;

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

                // رفض الكتل التي تملأ كامل الإطار أو الصغيرة جداً
                float areaRatio = area / (float) n;
                if (areaRatio >= 0.12f && areaRatio <= 0.94f && borderTouches < area * 0.18f && area > bestArea) {
                    bestArea = area;
                    bestBlob = perimeter;
                }
            }
        }

        if (bestBlob == null || bestBlob.size() < 20) {
            return new DetectionResult(false, 0.15f, sharpness, stabilityDiff, defaultGuideCorners());
        }

        // 6. حساب الغلاف المحدب (Andrew's Monotone Chain Convex Hull)
        List<PointF> hull = convexHull(bestBlob);
        if (hull.size() < 4) {
            return new DetectionResult(false, 0.2f, sharpness, stabilityDiff, defaultGuideCorners());
        }

        // 7. استخراج الزوايا المبدئية الـ 4 ثم تحسين الأضلاع بتوفيق الخطوط وتقاطعها (Least-Squares Line Intersection)
        float[] fitted = fitQuadFromHullAndEdges(hull, grad, w, h);
        if (fitted == null) {
            return new DetectionResult(false, 0.25f, sharpness, stabilityDiff, defaultGuideCorners());
        }

        // 8. التحقق من صحة الشكل الرباعي وقوة الحواف الحقيقية على أضلاعه الأربعة
        if (!isValidPaperQuad(fitted)) {
            return new DetectionResult(false, 0.3f, sharpness, stabilityDiff, defaultGuideCorners());
        }

        float edgeSupport = measureQuadEdgeSupport(fitted, grad, w, h);
        float blobCoverage = Math.min(1f, bestArea / (quadPolygonArea(fitted) * n + 1f));
        float confidence = Math.min(0.98f, edgeSupport * 0.55f + blobCoverage * 0.30f + Math.min(1f, contrastSpan / 60f) * 0.15f);

        boolean detected = edgeSupport >= 0.32f && confidence >= 0.52f;
        return new DetectionResult(detected, confidence, sharpness, stabilityDiff,
            detected ? fitted : defaultGuideCorners());
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

    private static float[] fitQuadFromHullAndEdges(List<PointF> hull, int[] grad, int w, int h) {
        // إيجاد النقاط الأربع القصوى من الغلاف المحدب
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

        // توفيق خطوط الأضلاع الـ 4 من نقاط الغلاف المحدب القريبة لكل ضلع
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

    // ax + by + c = 0 using PCA / total least squares over hull vertices near segment [p1, p2]
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
        // normal vector orthogonal to principal tangent (cos theta, sin theta)
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

    private static boolean isValidPaperQuad(float[] c) {
        float area = quadPolygonArea(c);
        if (area < 0.12f || area > 0.95f) return false;

        // فحص التحدب والزوايا الداخلية (بين 35° و 145°)
        for (int i = 0; i < 4; i++) {
            int p = ((i + 3) % 4) * 2;
            int q = i * 2;
            int r = ((i + 1) % 4) * 2;
            double v1x = c[p] - c[q], v1y = c[p + 1] - c[q + 1];
            double v2x = c[r] - c[q], v2y = c[r + 1] - c[q + 1];
            double l1 = Math.hypot(v1x, v1y);
            double l2 = Math.hypot(v2x, v2y);
            if (l1 < 0.15 || l2 < 0.15) return false;
            double cosA = (v1x * v2x + v1y * v2y) / (l1 * l2);
            double deg = Math.toDegrees(Math.acos(Math.max(-1.0, Math.min(1.0, cosA))));
            if (deg < 35.0 || deg > 145.0) return false;

            // اتجاه عقارب الساعة ثابت (TL -> TR -> BR -> BL)
            double cross = v2x * v1y - v2y * v1x;
            if (cross <= 0) return false;
        }
        return true;
    }

    private static float quadPolygonArea(float[] c) {
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
                if (maxG >= 55) strongCount++;
            }
        }
        return totalSamples > 0 ? (strongCount / (float) totalSamples) : 0f;
    }

    private static float clamp01(float v) {
        return Math.max(0.01f, Math.min(0.99f, v));
    }

    /**
     * فك الصورة الأصلية مع تطبيق اتجاه EXIF الحقيقي (لضمان توافق المحاور مع المعاينة العمودية)
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
        if (raw == null) throw new Exception("تعذر فك الصورة الملتقطة");

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
        return raw;
    }

    /**
     * تصحيح المنظور الفعلي (Projective Warp via Matrix.setPolyToPoly) + تدوير 90° دون فقدان الجودة + تحسين الصورة
     */
    public static Bitmap warpRotateAndEnhance(
        Bitmap source,
        float[] corners,
        int rotationDeg,
        int filterMode,
        int maxWorkingDim
    ) {
        return warpRotateAndEnhance(source, corners, rotationDeg, filterMode, 0, maxWorkingDim);
    }

    public static Bitmap warpRotateAndEnhance(
        Bitmap source,
        float[] corners,
        int rotationDeg,
        int filterMode,
        int brightnessAdjust,
        int maxWorkingDim
    ) {
        int sw = source.getWidth();
        int sh = source.getHeight();

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

        Bitmap warped = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(warped);
        canvas.drawColor(0xFFFFFFFF);
        Matrix warpMatrix = new Matrix();
        boolean mapped = warpMatrix.setPolyToPoly(srcPts, 0, dstPts, 0, 4);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        if (mapped) {
            canvas.drawBitmap(source, warpMatrix, paint);
        } else {
            canvas.drawBitmap(Bitmap.createScaledBitmap(source, outW, outH, true), 0, 0, paint);
        }

        // تدوير 90° / 180° / 270° بدون أي إعادة تشكيل ضبابية (فقط مضاعفات 90°)
        int normRot = ((rotationDeg % 360) + 360) % 360;
        int snappedRot = (Math.round(normRot / 90f) * 90) % 360;
        Bitmap oriented = warped;
        if (snappedRot != 0) {
            Matrix rotM = new Matrix();
            rotM.postRotate(snappedRot);
            oriented = Bitmap.createBitmap(warped, 0, 0, warped.getWidth(), warped.getHeight(), rotM, false);
            if (oriented != warped) warped.recycle();
        }

        Bitmap filtered = applyDocumentFilter(oriented, filterMode, brightnessAdjust);
        if (filtered != oriented) oriented.recycle();
        return filtered;
    }

    /**
     * تطبيق الفلتر المختار:
     * 0 = الألوان الأصلية المحسّنة (إزالة الظلال + حدة خفيفة + حماية كاملة للأختام والتوقيعات الملونة)
     * 1 = تدرج رمادي متوازن
     * 2 = أبيض وأسود ذكي يحفظ التوقيعات والأرقام الدقيقة
     */
    public static Bitmap applyDocumentFilter(Bitmap src, int filterMode) {
        return applyDocumentFilter(src, filterMode, 0);
    }

    public static Bitmap applyDocumentFilter(Bitmap src, int filterMode, int brightnessAdjust) {
        int clampedBright = Math.max(-35, Math.min(45, brightnessAdjust));
        float brightOffset = clampedBright * 1.15f;
        int w = src.getWidth();
        int h = src.getHeight();
        int[] pixels = new int[w * h];
        src.getPixels(pixels, 0, w, 0, 0, w, h);

        int cols = 16;
        int rows = 20;
        float[] bgGrid = new float[cols * rows];
        float cellW = (float) w / cols;
        float cellH = (float) h / rows;

        for (int gy = 0; gy < rows; gy++) {
            int y0 = (int) (gy * cellH);
            int y1 = Math.min(h, (int) ((gy + 1) * cellH));
            for (int gx = 0; gx < cols; gx++) {
                int x0 = (int) (gx * cellW);
                int x1 = Math.min(w, (int) ((gx + 1) * cellW));
                int stepY = Math.max(1, (y1 - y0) / 5);
                int stepX = Math.max(1, (x1 - x0) / 5);
                float[] lums = new float[36];
                int n = 0;
                for (int y = y0; y < y1 && n < 36; y += stepY) {
                    for (int x = x0; x < x1 && n < 36; x += stepX) {
                        int c = pixels[y * w + x];
                        lums[n++] = 0.299f * ((c >> 16) & 0xFF) + 0.587f * ((c >> 8) & 0xFF) + 0.114f * (c & 0xFF);
                    }
                }
                if (n > 0) {
                    Arrays.sort(lums, 0, n);
                    bgGrid[gy * cols + gx] = Math.max(95f, lums[Math.min(n - 1, (int) (n * 0.88f))]);
                } else {
                    bgGrid[gy * cols + gx] = 235f;
                }
            }
        }

        // تنعيم خريطة الخلفية 3x3
        float[] smoothBg = new float[cols * rows];
        for (int gy = 0; gy < rows; gy++) {
            for (int gx = 0; gx < cols; gx++) {
                float acc = 0f;
                int cnt = 0;
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dx = -1; dx <= 1; dx++) {
                        int nx = gx + dx, ny = gy + dy;
                        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) {
                            acc += bgGrid[ny * cols + nx];
                            cnt++;
                        }
                    }
                }
                smoothBg[gy * cols + gx] = acc / Math.max(1, cnt);
            }
        }

        for (int y = 0; y < h; y++) {
            float gyf = (y + 0.5f) / cellH - 0.5f;
            int gy0 = Math.max(0, Math.min(rows - 2, (int) Math.floor(gyf)));
            float fy = Math.max(0f, Math.min(1f, gyf - gy0));

            for (int x = 0; x < w; x++) {
                float gxf = (x + 0.5f) / cellW - 0.5f;
                int gx0 = Math.max(0, Math.min(cols - 2, (int) Math.floor(gxf)));
                float fx = Math.max(0f, Math.min(1f, gxf - gx0));

                float localBg =
                    smoothBg[gy0 * cols + gx0] * (1f - fx) * (1f - fy) +
                    smoothBg[gy0 * cols + gx0 + 1] * fx * (1f - fy) +
                    smoothBg[(gy0 + 1) * cols + gx0] * (1f - fx) * fy +
                    smoothBg[(gy0 + 1) * cols + gx0 + 1] * fx * fy;

                float gain = Math.min(1.85f, Math.max(0.95f, 242f / Math.max(85f, localBg)));
                float effGain = 1f + (gain - 1f) * 0.72f;

                int c = pixels[y * w + x];
                float r = ((c >> 16) & 0xFF) * effGain + brightOffset;
                float g = ((c >> 8) & 0xFF) * effGain + brightOffset;
                float b = (c & 0xFF) * effGain + brightOffset;
                float lum = 0.299f * r + 0.587f * g + 0.114f * b;

                if (filterMode == FILTER_GRAYSCALE) {
                    if (lum > 205f) lum = Math.min(255f, lum + (lum - 205f) * 0.35f);
                    else if (lum < 160f) lum = Math.max(0f, lum - (160f - lum) * 0.22f);
                    int v = Math.max(0, Math.min(255, Math.round(lum)));
                    pixels[y * w + x] = 0xFF000000 | (v << 16) | (v << 8) | v;
                } else if (filterMode == FILTER_BLACK_WHITE) {
                    // ثنائي تكيفي ناعم نسبياً للخلفية المحلية لحفظ التوقيعات والأرقام الدقيقة دون اختفاء
                    float ratio = lum / Math.max(100f, localBg * effGain);
                    int v;
                    if (ratio > 0.88f && lum > 175f) v = 255;
                    else if (ratio < 0.70f || lum < 115f) v = 18;
                    else {
                        float t = (ratio - 0.70f) / 0.18f;
                        v = Math.max(18, Math.min(255, Math.round(18f + t * 237f)));
                    }
                    pixels[y * w + x] = 0xFF000000 | (v << 16) | (v << 8) | v;
                } else {
                    // الألوان الأصلية المحسّنة
                    float chroma = Math.max(r, Math.max(g, b)) - Math.min(r, Math.min(g, b));
                    if (chroma < 26f && lum > 205f) {
                        float lift = (lum - 205f) * 0.28f;
                        r += lift; g += lift; b += lift;
                    } else if (lum < 155f) {
                        float darken = (155f - lum) * 0.12f;
                        r -= darken; g -= darken; b -= darken;
                    }
                    int ir = Math.max(0, Math.min(255, Math.round(r)));
                    int ig = Math.max(0, Math.min(255, Math.round(g)));
                    int ib = Math.max(0, Math.min(255, Math.round(b)));
                    pixels[y * w + x] = 0xFF000000 | (ir << 16) | (ig << 8) | ib;
                }
            }
        }

        // حدة متزنة (Unsharp Mask 0.22) لإبراز الحروف العربية والأرقام
        int[] finalPixels = Arrays.copyOf(pixels, pixels.length);
        for (int y = 1; y < h - 1; y++) {
            for (int x = 1; x < w - 1; x++) {
                int idx = y * w + x;
                int c0 = pixels[idx];
                int cU = pixels[(y - 1) * w + x];
                int cD = pixels[(y + 1) * w + x];
                int cL = pixels[y * w + (x - 1)];
                int cR = pixels[y * w + (x + 1)];

                int r = sharpenChannel((c0 >> 16) & 0xFF, (cU >> 16) & 0xFF, (cD >> 16) & 0xFF, (cL >> 16) & 0xFF, (cR >> 16) & 0xFF);
                int g = sharpenChannel((c0 >> 8) & 0xFF, (cU >> 8) & 0xFF, (cD >> 8) & 0xFF, (cL >> 8) & 0xFF, (cR >> 8) & 0xFF);
                int b = sharpenChannel(c0 & 0xFF, cU & 0xFF, cD & 0xFF, cL & 0xFF, cR & 0xFF);
                finalPixels[idx] = 0xFF000000 | (r << 16) | (g << 8) | b;
            }
        }

        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        out.setPixels(finalPixels, 0, w, 0, 0, w, h);
        return out;
    }

    private static int sharpenChannel(int c, int u, int d, int l, int r) {
        float avg = (u + d + l + r) * 0.25f;
        int val = Math.round(c + (c - avg) * 0.22f);
        return Math.max(0, Math.min(255, val));
    }
}
