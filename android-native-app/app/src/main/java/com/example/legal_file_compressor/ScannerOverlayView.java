package com.example.legal_file_compressor;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.util.AttributeSet;
import android.view.View;

/**
 * إطار المعاينة الحية فوق الكاميرا لعرض حدود الورقة والزوايا الأربع المكتشفة تلقائياً
 * مع تخميد القفزات المفاجئة (Outlier Jump Damping) لاستقرار بصري احترافي.
 */
public class ScannerOverlayView extends View {

    private float[] corners = DocumentScannerEngine.defaultGuideCorners();
    private boolean detected = false;
    private boolean stableAndSharp = false;
    private int consecutiveJumpFrames = 0;

    private final Paint fillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dashedPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint cornerPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path quadPath = new Path();

    public ScannerOverlayView(Context context) {
        super(context);
        init();
    }

    public ScannerOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        fillPaint.setStyle(Paint.Style.FILL);

        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(6f);

        dashedPaint.setStyle(Paint.Style.STROKE);
        dashedPaint.setStrokeWidth(4.5f);
        dashedPaint.setColor(Color.parseColor("#F59E0B"));
        dashedPaint.setPathEffect(new DashPathEffect(new float[]{18f, 12f}, 0f));

        cornerPaint.setStyle(Paint.Style.FILL);
        cornerPaint.setColor(Color.parseColor("#FDE047"));
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
        if (corners == null || corners.length < 8) return;

        int w = getWidth();
        int h = getHeight();
        if (w <= 0 || h <= 0) return;

        quadPath.reset();
        quadPath.moveTo(corners[0] * w, corners[1] * h);
        quadPath.lineTo(corners[2] * w, corners[3] * h);
        quadPath.lineTo(corners[4] * w, corners[5] * h);
        quadPath.lineTo(corners[6] * w, corners[7] * h);
        quadPath.close();

        if (detected) {
            fillPaint.setColor(stableAndSharp ? Color.argb(42, 74, 222, 128) : Color.argb(34, 45, 212, 191));
            strokePaint.setColor(stableAndSharp ? Color.parseColor("#4ADE80") : Color.parseColor("#2DD4BF"));
            canvas.drawPath(quadPath, fillPaint);
            canvas.drawPath(quadPath, strokePaint);
        } else {
            fillPaint.setColor(Color.argb(18, 245, 158, 11));
            canvas.drawPath(quadPath, fillPaint);
            canvas.drawPath(quadPath, dashedPaint);
        }

        for (int i = 0; i < 4; i++) {
            float cx = corners[i * 2] * w;
            float cy = corners[i * 2 + 1] * h;
            canvas.drawCircle(cx, cy, detected ? 12f : 9f, cornerPaint);
        }
    }
}
