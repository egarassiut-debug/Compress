package com.example.legal_file_compressor;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.View;

/**
 * إطار التوجيه الحي فوق الكاميرا لجميع أوضاع السكانر المعتمدة:
 * - فردي / دفعة: عرض الحدود الحية المكتشفة تلقائياً مع تخميد القفزات
 * - الكتب: إطار صفحة كتاب واحدة + دليل خط العمود لتقليل الانحناء
 * - بطاقات الهوية: كادر بنسبة بطاقة الهوية القياسية + إبراز الحدود المكتشفة
 * - قراءة QR والباركود: مربع مسح مركزي + شريط مسح متحرك
 */
public class ScannerOverlayView extends View {

    private float[] corners = DocumentScannerEngine.defaultGuideCorners();
    private boolean detected = false;
    private boolean stableAndSharp = false;
    private int consecutiveJumpFrames = 0;
    private int scanMode = DocumentScannerEngine.SCAN_MODE_SINGLE;

    private float qrScanFraction = 0.05f;
    private boolean qrScanDown = true;

    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dashedPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint cornerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dimMaskPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bracketPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint laserPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint guideLinePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path quadPath = new Path();
    private final Path maskPath = new Path();
    private final RectF guideRect = new RectF();

    public ScannerOverlayView(Context context) {
        super(context);
        init();
    }

    public ScannerOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private float dp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private void init() {
        fillPaint.setStyle(Paint.Style.FILL);

        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(dp(2.4f));

        dashedPaint.setStyle(Paint.Style.STROKE);
        dashedPaint.setStrokeWidth(dp(1.8f));
        dashedPaint.setColor(Color.parseColor("#F59E0B"));
        dashedPaint.setPathEffect(new DashPathEffect(new float[]{ dp(7f), dp(5f) }, 0f));

        cornerPaint.setStyle(Paint.Style.FILL);
        cornerPaint.setColor(Color.parseColor("#FDE047"));

        dimMaskPaint.setStyle(Paint.Style.FILL);
        dimMaskPaint.setColor(Color.argb(128, 8, 15, 32));

        bracketPaint.setStyle(Paint.Style.STROKE);
        bracketPaint.setStrokeWidth(dp(3.4f));
        bracketPaint.setStrokeCap(Paint.Cap.ROUND);
        bracketPaint.setColor(Color.parseColor("#2DD4BF"));

        laserPaint.setStyle(Paint.Style.STROKE);
        laserPaint.setStrokeWidth(dp(2.5f));
        laserPaint.setColor(Color.parseColor("#4ADE80"));

        guideLinePaint.setStyle(Paint.Style.STROKE);
        guideLinePaint.setStrokeWidth(dp(1.3f));
        guideLinePaint.setColor(Color.argb(170, 253, 224, 71));
        guideLinePaint.setPathEffect(new DashPathEffect(new float[]{ dp(5f), dp(5f) }, 0f));
    }

    public void setScanMode(int mode) {
        if (this.scanMode != mode) {
            this.scanMode = mode;
            this.detected = false;
            this.stableAndSharp = false;
            this.corners = (mode == DocumentScannerEngine.SCAN_MODE_ID_CARD)
                ? DocumentScannerEngine.defaultIdCardCorners()
                : DocumentScannerEngine.defaultGuideCorners();
            postInvalidate();
        }
    }

    public void updateDetection(float[] newCorners, boolean isDetected, boolean isStableAndSharp) {
        if (newCorners != null && newCorners.length == 8) {
            if (this.corners == null || (!this.detected && isDetected)) {
                this.corners = newCorners.clone();
                consecutiveJumpFrames = 0;
            } else {
                float maxShift = 0f;
                for (int i = 0; i < 4; i++) {
                    float d = (float) Math.hypot(
                        this.corners[i * 2] - newCorners[i * 2],
                        this.corners[i * 2 + 1] - newCorners[i * 2 + 1]
                    );
                    if (d > maxShift) maxShift = d;
                }
                float alpha;
                if (this.detected && isDetected && maxShift > 0.22f) {
                    consecutiveJumpFrames++;
                    alpha = consecutiveJumpFrames >= 2 ? 0.44f : 0.22f;
                } else {
                    consecutiveJumpFrames = 0;
                    alpha = 0.42f;
                }
                for (int i = 0; i < 8; i++) {
                    this.corners[i] = this.corners[i] * (1f - alpha) + newCorners[i] * alpha;
                }
            }
        }
        this.detected = isDetected;
        this.stableAndSharp = isStableAndSharp;
        postInvalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int w = getWidth();
        int h = getHeight();
        if (w <= 0 || h <= 0) return;

        if (scanMode == DocumentScannerEngine.SCAN_MODE_QR) {
            drawQrOverlay(canvas, w, h);
            return;
        }

        if (scanMode == DocumentScannerEngine.SCAN_MODE_ID_CARD) {
            drawIdCardGuideFrame(canvas, w, h);
        } else if (scanMode == DocumentScannerEngine.SCAN_MODE_BOOK) {
            drawBookSinglePageGuide(canvas, w, h);
        }

        if (!detected || corners == null || corners.length < 8) return;
        quadPath.reset();
        quadPath.moveTo(corners[0] * w, corners[1] * h);
        quadPath.lineTo(corners[2] * w, corners[3] * h);
        quadPath.lineTo(corners[4] * w, corners[5] * h);
        quadPath.lineTo(corners[6] * w, corners[7] * h);
        quadPath.close();

        fillPaint.setColor(stableAndSharp ? Color.argb(40, 74, 222, 128) : Color.argb(32, 45, 212, 191));
        strokePaint.setColor(stableAndSharp ? Color.parseColor("#4ADE80") : Color.parseColor("#2DD4BF"));
        canvas.drawPath(quadPath, fillPaint);
        canvas.drawPath(quadPath, strokePaint);

        float dotR = dp(4.8f);
        for (int i = 0; i < 4; i++) {
            canvas.drawCircle(corners[i * 2] * w, corners[i * 2 + 1] * h, dotR, cornerPaint);
        }
    }

    private void drawQrOverlay(Canvas canvas, int w, int h) {
        float box = Math.min(w, h) * 0.64f;
        float left = (w - box) * 0.5f;
        float top = (h - box) * 0.46f;
        guideRect.set(left, top, left + box, top + box);

        maskPath.reset();
        maskPath.addRect(0, 0, w, h, Path.Direction.CW);
        maskPath.addRoundRect(guideRect, dp(14f), dp(14f), Path.Direction.CCW);
        maskPath.setFillType(Path.FillType.EVEN_ODD);
        canvas.drawPath(maskPath, dimMaskPaint);

        bracketPaint.setColor(Color.parseColor("#4ADE80"));
        drawCornerBrackets(canvas, guideRect, dp(26f));

        // تحريك خط المسح الأخضر داخل الإطار بسلاسة
        float lineY = guideRect.top + dp(10f) + qrScanFraction * (guideRect.height() - dp(20f));
        canvas.drawLine(guideRect.left + dp(14f), lineY, guideRect.right - dp(14f), lineY, laserPaint);

        if (qrScanDown) {
            qrScanFraction += 0.024f;
            if (qrScanFraction >= 0.96f) qrScanDown = false;
        } else {
            qrScanFraction -= 0.024f;
            if (qrScanFraction <= 0.04f) qrScanDown = true;
        }
        postInvalidateDelayed(35);
    }

    private void drawIdCardGuideFrame(Canvas canvas, int w, int h) {
        float cardW = w * 0.84f;
        float cardH = cardW * (54.0f / 85.6f); // نسبة بطاقة الهوية القياسية
        if (cardH > h * 0.58f) {
            cardH = h * 0.58f;
            cardW = cardH * (85.6f / 54.0f);
        }
        float left = (w - cardW) * 0.5f;
        float top = (h - cardH) * 0.48f;
        guideRect.set(left, top, left + cardW, top + cardH);

        maskPath.reset();
        maskPath.addRect(0, 0, w, h, Path.Direction.CW);
        maskPath.addRoundRect(guideRect, dp(12f), dp(12f), Path.Direction.CCW);
        maskPath.setFillType(Path.FillType.EVEN_ODD);
        canvas.drawPath(maskPath, dimMaskPaint);

        bracketPaint.setColor(detected ? Color.parseColor("#4ADE80") : Color.parseColor("#FDE047"));
        drawCornerBrackets(canvas, guideRect, dp(24f));
    }

    private void drawBookSinglePageGuide(Canvas canvas, int w, int h) {
        // خط إرشادي خفيف لمحاذاة حافة الكتاب عند التصوير الفردي للصفحة
        float left = w * 0.08f;
        float right = w * 0.92f;
        float top = h * 0.09f;
        float bot = h * 0.91f;
        canvas.drawLine(left, top + dp(18f), left, bot - dp(18f), guideLinePaint);
        canvas.drawLine(right, top + dp(18f), right, bot - dp(18f), guideLinePaint);
    }

    private void drawCornerBrackets(Canvas canvas, RectF r, float len) {
        // أعلى اليسار
        canvas.drawLine(r.left, r.top, r.left + len, r.top, bracketPaint);
        canvas.drawLine(r.left, r.top, r.left, r.top + len, bracketPaint);
        // أعلى اليمين
        canvas.drawLine(r.right, r.top, r.right - len, r.top, bracketPaint);
        canvas.drawLine(r.right, r.top, r.right, r.top + len, bracketPaint);
        // أسفل اليمين
        canvas.drawLine(r.right, r.bottom, r.right - len, r.bottom, bracketPaint);
        canvas.drawLine(r.right, r.bottom, r.right, r.bottom - len, bracketPaint);
        // أسفل اليسار
        canvas.drawLine(r.left, r.bottom, r.left + len, r.bottom, bracketPaint);
        canvas.drawLine(r.left, r.bottom, r.left, r.bottom - len, bracketPaint);
    }
}
