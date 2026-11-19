package com.example.legal_file_compressor;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

/**
 * محرر قص يدوي تفاعلي فوق الصورة الأصلية يتيح سحب الزوايا الأربع (TL, TR, BR, BL) لتصحيح المنظور بدقة.
 */
public class CropOverlayView extends View {

    private Bitmap sourceBitmap;
    private final RectF imageRect = new RectF();
    private float[] corners = DocumentScannerEngine.fullFrameCorners();
    private int activeCorner = -1;

    private final Paint dimPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint handleFillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint handleStrokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint bmpPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Path outerPath = new Path();
    private final Path innerPath = new Path();

    public CropOverlayView(Context context) {
        super(context);
        init();
    }

    public CropOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        dimPaint.setColor(Color.argb(125, 0, 0, 0));
        dimPaint.setStyle(Paint.Style.FILL);

        linePaint.setColor(Color.parseColor("#2DD4BF"));
        linePaint.setStyle(Paint.Style.STROKE);
        linePaint.setStrokeWidth(6f);

        handleFillPaint.setColor(Color.parseColor("#FDE047"));
        handleFillPaint.setStyle(Paint.Style.FILL);

        handleStrokePaint.setColor(Color.parseColor("#0F2557"));
        handleStrokePaint.setStyle(Paint.Style.STROKE);
        handleStrokePaint.setStrokeWidth(5f);
    }

    public void setImageAndCorners(Bitmap bmp, float[] initialCorners) {
        this.sourceBitmap = bmp;
        if (initialCorners != null && initialCorners.length == 8) {
            this.corners = initialCorners.clone();
        } else {
            this.corners = DocumentScannerEngine.fullFrameCorners();
        }
        computeImageBounds();
        invalidate();
    }

    public float[] getCorners() {
        return corners.clone();
    }

    private void computeImageBounds() {
        int vw = getWidth();
        int vh = getHeight();
        if (vw <= 0 || vh <= 0 || sourceBitmap == null) return;
        float pad = 28f;
        float availW = Math.max(1f, vw - pad * 2f);
        float availH = Math.max(1f, vh - pad * 2f);
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
        if (sourceBitmap == null) return;
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

        for (int i = 0; i < 4; i++) {
            float r = (i == activeCorner) ? 28f : 22f;
            canvas.drawCircle(sx[i], sy[i], r, handleFillPaint);
            canvas.drawCircle(sx[i], sy[i], r, handleStrokePaint);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (imageRect.width() <= 0 || imageRect.height() <= 0) return false;
        float x = event.getX();
        float y = event.getY();

        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                activeCorner = -1;
                float bestDist = 90f;
                for (int i = 0; i < 4; i++) {
                    float cx = imageRect.left + corners[i * 2] * imageRect.width();
                    float cy = imageRect.top + corners[i * 2 + 1] * imageRect.height();
                    float d = (float) Math.hypot(x - cx, y - cy);
                    if (d < bestDist) {
                        bestDist = d;
                        activeCorner = i;
                    }
                }
                invalidate();
                return activeCorner != -1;

            case MotionEvent.ACTION_MOVE:
                if (activeCorner >= 0) {
                    float nx = Math.max(0f, Math.min(1f, (x - imageRect.left) / imageRect.width()));
                    float ny = Math.max(0f, Math.min(1f, (y - imageRect.top) / imageRect.height()));
                    corners[activeCorner * 2] = nx;
                    corners[activeCorner * 2 + 1] = ny;
                    invalidate();
                    return true;
                }
                break;

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                activeCorner = -1;
                invalidate();
                return true;
        }
        return super.onTouchEvent(event);
    }
}
