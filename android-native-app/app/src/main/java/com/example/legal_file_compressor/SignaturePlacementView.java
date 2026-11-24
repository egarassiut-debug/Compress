package com.example.legal_file_compressor;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

/**
 * معاينة تفاعلية لتحريك وتغيير حجم التوقيع فوق صفحة المستند قبل دمجه نهائياً:
 * - سحب التوقيع بالإصبع لأي موضع داخل الصفحة
 * - تكبير/تصغير بإصبعين (Pinch) أو عبر مقبض الزاوية أو شريط التمرير
 */
public class SignaturePlacementView extends View {

    private Bitmap pageBitmap;
    private Bitmap signatureBitmap;
    private final RectF pageRect = new RectF();
    private final RectF sigRect = new RectF();

    private float centerNormX = 0.50f;
    private float centerNormY = 0.78f;
    private float widthFraction = 0.30f; // نسبة عرض التوقيع من عرض الصفحة (0.12 .. 0.70)

    private float lastX = 0f;
    private float lastY = 0f;
    private boolean isDragging = false;
    private boolean isResizingCorner = false;

    private ScaleGestureDetector scaleDetector;

    private final Paint bmpPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint boxPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint handleFillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint handleStrokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    public SignaturePlacementView(Context context) {
        super(context);
        init(context);
    }

    public SignaturePlacementView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init(context);
    }

    private float dp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private void init(Context context) {
        boxPaint.setColor(Color.parseColor("#2DD4BF"));
        boxPaint.setStyle(Paint.Style.STROKE);
        boxPaint.setStrokeWidth(dp(2f));

        handleFillPaint.setColor(Color.parseColor("#FDE047"));
        handleFillPaint.setStyle(Paint.Style.FILL);

        handleStrokePaint.setColor(Color.parseColor("#0F2557"));
        handleStrokePaint.setStyle(Paint.Style.STROKE);
        handleStrokePaint.setStrokeWidth(dp(1.8f));

        scaleDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override
            public boolean onScale(ScaleGestureDetector detector) {
                setWidthFraction(widthFraction * detector.getScaleFactor());
                return true;
            }
        });
    }

    public void setBitmaps(Bitmap pageBmp, Bitmap sigBmp) {
        this.pageBitmap = pageBmp;
        this.signatureBitmap = sigBmp;
        this.centerNormX = 0.50f;
        this.centerNormY = 0.78f;
        this.widthFraction = 0.30f;
        computePageRect();
        invalidate();
    }

    public void setWidthFraction(float fraction) {
        this.widthFraction = Math.max(0.10f, Math.min(0.75f, fraction));
        invalidate();
    }

    public float getWidthFraction() {
        return widthFraction;
    }

    public float getCenterNormX() {
        return centerNormX;
    }

    public float getCenterNormY() {
        return centerNormY;
    }

    private void computePageRect() {
        int vw = getWidth();
        int vh = getHeight();
        if (vw <= 0 || vh <= 0 || pageBitmap == null || pageBitmap.isRecycled()) return;
        float pad = dp(12f);
        float availW = Math.max(1f, vw - pad * 2f);
        float availH = Math.max(1f, vh - pad * 2f);
        float scale = Math.min(availW / pageBitmap.getWidth(), availH / pageBitmap.getHeight());
        float dw = pageBitmap.getWidth() * scale;
        float dh = pageBitmap.getHeight() * scale;
        float left = (vw - dw) * 0.5f;
        float top = (vh - dh) * 0.5f;
        pageRect.set(left, top, left + dw, top + dh);
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        computePageRect();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (pageBitmap == null || pageBitmap.isRecycled()) return;
        if (pageRect.width() <= 0) computePageRect();

        canvas.drawBitmap(pageBitmap, null, pageRect, bmpPaint);
        if (signatureBitmap == null || signatureBitmap.isRecycled()) return;

        float sigW = pageRect.width() * widthFraction;
        float aspect = signatureBitmap.getHeight() / (float) Math.max(1, signatureBitmap.getWidth());
        float sigH = sigW * aspect;

        float cx = pageRect.left + centerNormX * pageRect.width();
        float cy = pageRect.top + centerNormY * pageRect.height();

        float halfW = sigW * 0.5f;
        float halfH = sigH * 0.5f;
        if (cx - halfW < pageRect.left) cx = pageRect.left + halfW;
        if (cx + halfW > pageRect.right) cx = pageRect.right - halfW;
        if (cy - halfH < pageRect.top) cy = pageRect.top + halfH;
        if (cy + halfH > pageRect.bottom) cy = pageRect.bottom - halfH;

        centerNormX = (cx - pageRect.left) / Math.max(1f, pageRect.width());
        centerNormY = (cy - pageRect.top) / Math.max(1f, pageRect.height());

        sigRect.set(cx - halfW, cy - halfH, cx + halfW, cy + halfH);
        canvas.drawBitmap(signatureBitmap, null, sigRect, bmpPaint);
        canvas.drawRect(sigRect, boxPaint);

        // مقبض تغيير الحجم في الزاوية السفلية اليمنى
        float hr = dp(9f);
        canvas.drawCircle(sigRect.right, sigRect.bottom, hr, handleFillPaint);
        canvas.drawCircle(sigRect.right, sigRect.bottom, hr, handleStrokePaint);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (pageRect.width() <= 0 || signatureBitmap == null) return false;
        scaleDetector.onTouchEvent(event);

        float x = event.getX();
        float y = event.getY();

        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                lastX = x;
                lastY = y;
                float cornerDist = (float) Math.hypot(x - sigRect.right, y - sigRect.bottom);
                if (cornerDist <= dp(28f)) {
                    isResizingCorner = true;
                    isDragging = false;
                } else {
                    float pad = dp(18f);
                    RectF hit = new RectF(sigRect.left - pad, sigRect.top - pad, sigRect.right + pad, sigRect.bottom + pad);
                    isDragging = hit.contains(x, y) || pageRect.contains(x, y);
                    isResizingCorner = false;
                }
                return isDragging || isResizingCorner;

            case MotionEvent.ACTION_MOVE:
                if (event.getPointerCount() > 1) {
                    isDragging = false;
                    isResizingCorner = false;
                    return true;
                }
                if (isResizingCorner) {
                    float halfDx = Math.abs(x - sigRect.centerX());
                    float newFrac = (halfDx * 2f) / Math.max(1f, pageRect.width());
                    setWidthFraction(newFrac);
                    return true;
                }
                if (isDragging) {
                    float dx = (x - lastX) / Math.max(1f, pageRect.width());
                    float dy = (y - lastY) / Math.max(1f, pageRect.height());
                    centerNormX = Math.max(0.05f, Math.min(0.95f, centerNormX + dx));
                    centerNormY = Math.max(0.05f, Math.min(0.95f, centerNormY + dy));
                    lastX = x;
                    lastY = y;
                    invalidate();
                    return true;
                }
                break;

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                isDragging = false;
                isResizingCorner = false;
                return true;
        }
        return super.onTouchEvent(event);
    }
}
