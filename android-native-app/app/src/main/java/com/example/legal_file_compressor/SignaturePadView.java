package com.example.legal_file_compressor;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.util.TypedValue;
import android.view.MotionEvent;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

/**
 * لوحة رسم التوقيع بالإصبع محلياً 100% أوفلاين (بمنحنيات Bezier ناعمة).
 */
public class SignaturePadView extends View {

    private static final class Stroke {
        final Path path;
        final int color;
        final float width;

        Stroke(Path path, int color, float width) {
            this.path = path;
            this.color = color;
            this.width = width;
        }
    }

    private final List<Stroke> strokes = new ArrayList<Stroke>();
    private Path currentPath;
    private float lastX;
    private float lastY;
    private int inkColor = Color.parseColor("#1D4ED8"); // حبر أزرق قانوني افتراضي
    private float strokeWidthPx;

    private final Paint drawPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint guidePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    public SignaturePadView(Context context) {
        super(context);
        init();
    }

    public SignaturePadView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private float dp(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    private void init() {
        strokeWidthPx = dp(3.4f);

        drawPaint.setStyle(Paint.Style.STROKE);
        drawPaint.setStrokeCap(Paint.Cap.ROUND);
        drawPaint.setStrokeJoin(Paint.Join.ROUND);

        guidePaint.setColor(Color.parseColor("#CBD5E1"));
        guidePaint.setStyle(Paint.Style.STROKE);
        guidePaint.setStrokeWidth(dp(1.2f));

        borderPaint.setColor(Color.parseColor("#94A3B8"));
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(dp(1.2f));
    }

    public void setInkColor(int color) {
        this.inkColor = color;
    }

    public boolean hasSignature() {
        return !strokes.isEmpty();
    }

    public void undoLastStroke() {
        if (!strokes.isEmpty()) {
            strokes.remove(strokes.size() - 1);
            invalidate();
        }
    }

    public void clear() {
        strokes.clear();
        currentPath = null;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        canvas.drawColor(Color.WHITE);
        int w = getWidth();
        int h = getHeight();
        if (w <= 0 || h <= 0) return;

        float lineY = h * 0.74f;
        canvas.drawLine(dp(20f), lineY, w - dp(20f), lineY, guidePaint);
        canvas.drawRect(1f, 1f, w - 1f, h - 1f, borderPaint);

        for (Stroke s : strokes) {
            drawPaint.setColor(s.color);
            drawPaint.setStrokeWidth(s.width);
            canvas.drawPath(s.path, drawPaint);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = event.getX();
        float y = event.getY();

        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                if (getParent() != null) {
                    getParent().requestDisallowInterceptTouchEvent(true);
                }
                currentPath = new Path();
                currentPath.moveTo(x, y);
                currentPath.lineTo(x + 0.1f, y + 0.1f);
                strokes.add(new Stroke(currentPath, inkColor, strokeWidthPx));
                lastX = x;
                lastY = y;
                invalidate();
                return true;

            case MotionEvent.ACTION_MOVE:
                if (currentPath != null) {
                    float midX = (lastX + x) * 0.5f;
                    float midY = (lastY + y) * 0.5f;
                    currentPath.quadTo(lastX, lastY, midX, midY);
                    lastX = x;
                    lastY = y;
                    invalidate();
                    return true;
                }
                break;

            case MotionEvent.ACTION_UP:
            case MotionEvent.ACTION_CANCEL:
                if (currentPath != null) {
                    currentPath.lineTo(x, y);
                    currentPath = null;
                    invalidate();
                }
                if (getParent() != null) {
                    getParent().requestDisallowInterceptTouchEvent(false);
                }
                return true;
        }
        return super.onTouchEvent(event);
    }

    /**
     * تصدير التوقيع كصورة شفافة مقصوصة بدقة حول حدود الرسم فقط
     */
    public Bitmap exportTrimmedBitmap() {
        if (strokes.isEmpty() || getWidth() <= 0 || getHeight() <= 0) return null;
        RectF bounds = new RectF();
        RectF temp = new RectF();
        boolean first = true;
        for (Stroke s : strokes) {
            s.path.computeBounds(temp, true);
            if (first) {
                bounds.set(temp);
                first = false;
            } else {
                bounds.union(temp);
            }
        }
        float pad = strokeWidthPx * 2.5f;
        int left = Math.max(0, (int) Math.floor(bounds.left - pad));
        int top = Math.max(0, (int) Math.floor(bounds.top - pad));
        int right = Math.min(getWidth(), (int) Math.ceil(bounds.right + pad));
        int bottom = Math.min(getHeight(), (int) Math.ceil(bounds.bottom + pad));

        int outW = Math.max(24, right - left);
        int outH = Math.max(24, bottom - top);
        Bitmap out = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        canvas.translate(-left, -top);

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        for (Stroke s : strokes) {
            p.setColor(s.color);
            p.setStrokeWidth(s.width);
            canvas.drawPath(s.path, p);
        }
        return out;
    }
}
