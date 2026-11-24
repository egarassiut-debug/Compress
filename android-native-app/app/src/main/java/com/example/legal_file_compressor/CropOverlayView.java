package com.example.legal_file_compressor;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.MotionEvent;
import android.view.View;

/**
 * محرر قص يدوي احترافي بدقة عالية فوق الصورة الأصلية:
 * - مقاسات متجاوبة بوحدة dp لجميع كثافات الشاشة
 * - سحب الزوايا الأربع (TL, TR, BR, BL) + مقابض منتصف الأضلاع الأربعة
 * - حماية التحدب (Convex Quad Guard) لمنع تقاطع الأضلاع
 * - عدسة تكبير دائرية عالية الدقة (2.8x Magnifying Loupe) تعرض المنطقة الفعلية تحت الإصبع
 *   مع خطوط القص المتقاطعة، وتتموضع بذكاء دون حجب النقطة أو الخروج عن الحواف، وتختفي عند الإفلات
 */
public class CropOverlayView extends View {

    private static final int HANDLE_NONE = -1;
    private static final int HANDLE_EDGE_OFFSET = 4; // 4..7 = Top, Right, Bottom, Left edges

    private Bitmap sourceBitmap;
    private final RectF imageRect = new RectF();
    private float[] corners = DocumentScannerEngine.fullFrameCorners();
    private int activeHandle = HANDLE_NONE;
    private float lastTouchX = 0f;
    private float lastTouchY = 0f;

    private float cornerRadiusDp;
    private float cornerActiveRadiusDp;
    private float edgeHandleLenDp;
    private float touchThresholdDp;
    private float loupeRadiusDp;
    private float loupeOffsetDp;
    private float padDp;

    private final Paint dimPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint handleFillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint handleStrokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint edgeHandlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bmpPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);

    private final Paint loupeBgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint loupeQuadPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint loupeCrossPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint loupeRingPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint loupeGoldRingPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint loupeDotPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private final Path outerPath = new Path();
    private final Path innerPath = new Path();
    private final Path loupeClipPath = new Path();
    private final Path loupeQuadPath = new Path();
    private final Matrix loupeMatrix = new Matrix();

    public CropOverlayView(Context context) {
        super(context);
        init();
    }

    public CropOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private float dp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private void init() {
        cornerRadiusDp = dp(10f);
        cornerActiveRadiusDp = dp(13f);
        edgeHandleLenDp = dp(14f);
        touchThresholdDp = dp(38f);
        loupeRadiusDp = dp(52f);
        loupeOffsetDp = dp(64f);
        padDp = dp(18f);

        dimPaint.setColor(Color.argb(135, 0, 0, 0));
        dimPaint.setStyle(Paint.Style.FILL);

        linePaint.setColor(Color.parseColor("#2DD4BF"));
        linePaint.setStyle(Paint.Style.STROKE);
        linePaint.setStrokeWidth(dp(2.4f));

        handleFillPaint.setColor(Color.parseColor("#FDE047"));
        handleFillPaint.setStyle(Paint.Style.FILL);

        handleStrokePaint.setColor(Color.parseColor("#0F2557"));
        handleStrokePaint.setStyle(Paint.Style.STROKE);
        handleStrokePaint.setStrokeWidth(dp(2.2f));

        edgeHandlePaint.setColor(Color.parseColor("#2DD4BF"));
        edgeHandlePaint.setStyle(Paint.Style.FILL);

        loupeBgPaint.setColor(Color.parseColor("#0F172A"));
        loupeBgPaint.setStyle(Paint.Style.FILL);

        loupeQuadPaint.setColor(Color.argb(235, 45, 212, 191));
        loupeQuadPaint.setStyle(Paint.Style.STROKE);
        loupeQuadPaint.setStrokeWidth(dp(2f));

        loupeCrossPaint.setColor(Color.argb(235, 253, 224, 71));
        loupeCrossPaint.setStyle(Paint.Style.STROKE);
        loupeCrossPaint.setStrokeWidth(dp(1.4f));

        loupeRingPaint.setColor(Color.parseColor("#0F2557"));
        loupeRingPaint.setStyle(Paint.Style.STROKE);
        loupeRingPaint.setStrokeWidth(dp(4f));

        loupeGoldRingPaint.setColor(Color.parseColor("#FDE047"));
        loupeGoldRingPaint.setStyle(Paint.Style.STROKE);
        loupeGoldRingPaint.setStrokeWidth(dp(1.8f));

        loupeDotPaint.setColor(Color.parseColor("#FDE047"));
        loupeDotPaint.setStyle(Paint.Style.FILL);
    }

    public void setImageAndCorners(Bitmap bmp, float[] initialCorners) {
        this.sourceBitmap = bmp;
        if (initialCorners != null && initialCorners.length == 8 && DocumentScannerEngine.isConvexQuad(initialCorners)) {
            this.corners = initialCorners.clone();
        } else if (initialCorners != null && initialCorners.length == 8) {
            this.corners = initialCorners.clone();
        } else {
            this.corners = DocumentScannerEngine.fullFrameCorners();
        }
        this.activeHandle = HANDLE_NONE;
        computeImageBounds();
        invalidate();
    }

    public float[] getCorners() {
        return corners.clone();
    }

    private void computeImageBounds() {
        int vw = getWidth();
        int vh = getHeight();
        if (vw <= 0 || vh <= 0 || sourceBitmap == null || sourceBitmap.isRecycled()) return;
        float availW = Math.max(1f, vw - padDp * 2f);
        float availH = Math.max(1f, vh - padDp * 2f);
        float scale = Math.min(availW / sourceBitmap.getWidth(), availH / sourceBitmap.getHeight());
        float dw = sourceBitmap.getWidth() * scale;
        float dh = sourceBitmap.getHeight() * scale;
        float left = (vw - dw) * 0.5f;
        float top = (vh - dh) * 0.5f;
        imageRect.set(left, top, left + dw, top + dh);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        computeImageBounds();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (sourceBitmap == null || sourceBitmap.isRecycled()) return;
        if (imageRect.width() <= 0) computeImageBounds();

        canvas.drawBitmap(sourceBitmap, null, imageRect, bmpPaint);

        float[] sx = new float[4];
        float[] sy = new float[4];
        for (int i = 0; i < 4; i++) {
            sx[i] = imageRect.left + corners[i * 2] * imageRect.width();
            sy[i] = imageRect.top + corners[i * 2 + 1] * imageRect.height();
        }

        outerPath.reset();
        outerPath.addRect(imageRect, Path.Direction.CW);
        innerPath.reset();
        innerPath.moveTo(sx[0], sy[0]);
        innerPath.lineTo(sx[1], sy[1]);
        innerPath.lineTo(sx[2], sy[2]);
        innerPath.lineTo(sx[3], sy[3]);
        innerPath.close();
        outerPath.setFillType(Path.FillType.EVEN_ODD);
        outerPath.addPath(innerPath);
        canvas.drawPath(outerPath, dimPaint);
        canvas.drawPath(innerPath, linePaint);

        // مقابض منتصف الأضلاع الأربعة
        for (int e = 0; e < 4; e++) {
            int next = (e + 1) % 4;
            float mx = (sx[e] + sx[next]) * 0.5f;
            float my = (sy[e] + sy[next]) * 0.5f;
            boolean isActive = (activeHandle == HANDLE_EDGE_OFFSET + e);
            float r = isActive ? dp(7.5f) : dp(5.5f);
            canvas.drawCircle(mx, my, r, edgeHandlePaint);
            canvas.drawCircle(mx, my, r, handleStrokePaint);
        }

        // مقابض الزوايا الأربع
        for (int i = 0; i < 4; i++) {
            float r = (i == activeHandle) ? cornerActiveRadiusDp : cornerRadiusDp;
            canvas.drawCircle(sx[i], sy[i], r, handleFillPaint);
            canvas.drawCircle(sx[i], sy[i], r, handleStrokePaint);
        }

        // عدسة التكبير الدائرية: تظهر أثناء سحب الزاوية أو منتصف الضلع وتختفي فور رفع الإصبع
        if (activeHandle >= 0 && activeHandle < 4) {
            drawMagnifyingLoupe(canvas, sx[activeHandle], sy[activeHandle],
                corners[activeHandle * 2], corners[activeHandle * 2 + 1]);
        } else if (activeHandle >= HANDLE_EDGE_OFFSET && activeHandle < HANDLE_EDGE_OFFSET + 4) {
            int e = activeHandle - HANDLE_EDGE_OFFSET;
            int next = (e + 1) % 4;
            float mxScreen = (sx[e] + sx[next]) * 0.5f;
            float myScreen = (sy[e] + sy[next]) * 0.5f;
            float mxNorm = (corners[e * 2] + corners[next * 2]) * 0.5f;
            float myNorm = (corners[e * 2 + 1] + corners[next * 2 + 1]) * 0.5f;
            drawMagnifyingLoupe(canvas, mxScreen, myScreen, mxNorm, myNorm);
        }
    }

    private void drawMagnifyingLoupe(Canvas canvas, float screenX, float screenY, float normX, float normY) {
        int vw = getWidth();
        int vh = getHeight();
        if (vw <= 0 || vh <= 0 || sourceBitmap == null || sourceBitmap.isRecycled()) return;

        float radius = Math.max(dp(44f), Math.min(dp(64f), Math.min(vw, vh) * 0.145f));
        float margin = dp(12f);
        float offset = radius + loupeOffsetDp;

        // تموضع ذكي متوافق مع RTL ولا يحجب النقطة المسحوبة أو يخرج من الشاشة
        float lx = screenX;
        float ly = screenY - offset;
        if (ly - radius < margin) {
            ly = screenY + offset;
        }
        if (ly + radius > vh - margin) {
            ly = Math.max(radius + margin, Math.min(vh - radius - margin, screenY));
            boolean isRtl = getLayoutDirection() == LAYOUT_DIRECTION_RTL;
            float sideOffset = radius + dp(56f);
            float prefX = isRtl ? (screenX - sideOffset) : (screenX + sideOffset);
            if (prefX - radius < margin || prefX + radius > vw - margin) {
                prefX = (screenX < vw * 0.5f) ? (screenX + sideOffset) : (screenX - sideOffset);
            }
            lx = prefX;
        }
        lx = Math.max(radius + margin, Math.min(vw - radius - margin, lx));
        ly = Math.max(radius + margin, Math.min(vh - radius - margin, ly));

        float bx = normX * sourceBitmap.getWidth();
        float by = normY * sourceBitmap.getHeight();
        float baseScale = imageRect.width() / Math.max(1f, sourceBitmap.getWidth());
        float zoomScale = baseScale * 2.8f;

        loupeMatrix.reset();
        loupeMatrix.postTranslate(-bx, -by);
        loupeMatrix.postScale(zoomScale, zoomScale);
        loupeMatrix.postTranslate(lx, ly);

        canvas.save();
        loupeClipPath.reset();
        loupeClipPath.addCircle(lx, ly, radius, Path.Direction.CW);
        canvas.clipPath(loupeClipPath);

        canvas.drawCircle(lx, ly, radius, loupeBgPaint);
        canvas.drawBitmap(sourceBitmap, loupeMatrix, bmpPaint);

        // رسم خطوط القص الفعلية مكبرة داخل العدسة ليرى المستخدم المحاذاة على حافة الورقة بدقة
        loupeQuadPath.reset();
        for (int i = 0; i < 4; i++) {
            float qx = (corners[i * 2] * sourceBitmap.getWidth() - bx) * zoomScale + lx;
            float qy = (corners[i * 2 + 1] * sourceBitmap.getHeight() - by) * zoomScale + ly;
            if (i == 0) loupeQuadPath.moveTo(qx, qy);
            else loupeQuadPath.lineTo(qx, qy);
        }
        loupeQuadPath.close();
        canvas.drawPath(loupeQuadPath, loupeQuadPaint);

        float gap = dp(8f);
        canvas.drawLine(lx - radius, ly, lx - gap, ly, loupeCrossPaint);
        canvas.drawLine(lx + gap, ly, lx + radius, ly, loupeCrossPaint);
        canvas.drawLine(lx, ly - radius, lx, ly - gap, loupeCrossPaint);
        canvas.drawLine(lx, ly + gap, lx, ly + radius, loupeCrossPaint);
        canvas.drawCircle(lx, ly, dp(2.8f), loupeDotPaint);
        canvas.restore();

        canvas.drawCircle(lx, ly, radius, loupeRingPaint);
        canvas.drawCircle(lx, ly, radius + dp(1.5f), loupeGoldRingPaint);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (imageRect.width() <= 0 || imageRect.height() <= 0) return false;
        float x = event.getX();
        float y = event.getY();

        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                activeHandle = HANDLE_NONE;
                lastTouchX = x;
                lastTouchY = y;
                float bestDist = touchThresholdDp;
                for (int i = 0; i < 4; i++) {
                    float cx = imageRect.left + corners[i * 2] * imageRect.width();
                    float cy = imageRect.top + corners[i * 2 + 1] * imageRect.height();
                    float d = (float) Math.hypot(x - cx, y - cy);
                    if (d < bestDist) {
                        bestDist = d;
                        activeHandle = i;
                    }
                }
                if (activeHandle == HANDLE_NONE) {
                    float bestEdgeDist = touchThresholdDp;
                    for (int e = 0; e < 4; e++) {
                        int next = (e + 1) % 4;
                        float mx = imageRect.left + ((corners[e * 2] + corners[next * 2]) * 0.5f) * imageRect.width();
                        float my = imageRect.top + ((corners[e * 2 + 1] + corners[next * 2 + 1]) * 0.5f) * imageRect.height();
                        float d = (float) Math.hypot(x - mx, y - my);
                        if (d < bestEdgeDist) {
                            bestEdgeDist = d;
                            activeHandle = HANDLE_EDGE_OFFSET + e;
                        }
                    }
                }
                if (activeHandle != HANDLE_NONE && getParent() != null) {
                    getParent().requestDisallowInterceptTouchEvent(true);
                }
                invalidate();
                return activeHandle != HANDLE_NONE;

            case MotionEvent.ACTION_MOVE:
                if (activeHandle >= 0 && activeHandle < 4) {
                    float nx = Math.max(0f, Math.min(1f, (x - imageRect.left) / imageRect.width()));
                    float ny = Math.max(0f, Math.min(1f, (y - imageRect.top) / imageRect.height()));
                    float[] candidate = corners.clone();
                    candidate[activeHandle * 2] = nx;
                    candidate[activeHandle * 2 + 1] = ny;
                    if (DocumentScannerEngine.isConvexQuad(candidate)) {
                        corners = candidate;
                    }
                    lastTouchX = x;
                    lastTouchY = y;
                    invalidate();
                    return true;
                } else if (activeHandle >= HANDLE_EDGE_OFFSET && activeHandle < HANDLE_EDGE_OFFSET + 4) {
                    int e = activeHandle - HANDLE_EDGE_OFFSET;
                    int next = (e + 1) % 4;
                    float dxNorm = (x - lastTouchX) / imageRect.width();
                    float dyNorm = (y - lastTouchY) / imageRect.height();
                    float[] candidate = corners.clone();
                    candidate[e * 2] = Math.max(0f, Math.min(1f, candidate[e * 2] + dxNorm));
                    candidate[e * 2 + 1] = Math.max(0f, Math.min(1f, candidate[e * 2 + 1] + dyNorm));
                    candidate[next * 2] = Math.max(0f, Math.min(1f, candidate[next * 2] + dxNorm));
                    candidate[next * 2 + 1] = Math.max(0f, Math.min(1f, candidate[next * 2 + 1] + dyNorm));
                    if (DocumentScannerEngine.isConvexQuad(candidate)) {
                        corners = candidate;
                    }
                    lastTouchX = x;
                    lastTouchY = y;
                    invalidate();
                    return true;
                }
                break;

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                activeHandle = HANDLE_NONE;
                if (getParent() != null) {
                    getParent().requestDisallowInterceptTouchEvent(false);
                }
                invalidate();
                return true;
        }
        return super.onTouchEvent(event);
    }
}
