package com.example.legal_file_compressor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.hardware.Camera;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.ScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * شاشة تصوير المستندات ضوئياً أوفلاين لتطبيق «ضغطة» الأصلي
 * مستقلة تماماً ولا تعدّل أي إعدادات ضغط سابقة في MainActivity.
 * - تصوير متتالي لصفحات غير محدودة (تلقائي / يدوي)، فلاش، تركيز تلقائي
 * - تجاهل الاهتزاز البسيط لليد مع تنبيه هادئ عند الحركة المؤثرة فقط
 * - ضبط حدود القص وتدوير يدوي بمقدار 45 درجة عند كل ضغطة
 * - تحسين تلقائي للإضاءة وإزالة الظلال مع الحفاظ التام على الألوان والأختام والتوقيعات
 * - مراجعة، معاينة كاملة، ترتيب الصفحات (تقديم/تأخير)، حذف، إعادة تصوير
 * - حفظ مزدوج: Scan_001.jpg.. بالمعرض (< 500 KB) + Scanned_Document.pdf بالتنزيلات (< 500 KB)
 */
@SuppressWarnings("deprecation")
public class DocumentScannerActivity extends Activity implements SurfaceHolder.Callback {

    private static final int STRICT_500KB = 500 * 1024;
    private static final int SAFE_TARGET_BYTES = 485 * 1024;
    private static final int REQ_CAMERA_PERM = 301;

    private static class ScannedPage {
        File originalTempFile;
        File processedTempFile;
        int rotationDeg = 0;
        int cropTrimPct = 4; // هامش قص ذكي (0%، 4%، 8%)
        byte[] processedBytes;
    }

    private Camera camera;
    private SurfaceView surfaceView;
    private SurfaceHolder surfaceHolder;
    private ImageView ivPreview;
    private TextView tvTitle;
    private TextView tvStabilityHint;
    private View layoutCameraControls;
    private View layoutReviewControls;
    private Button btnModeToggle;
    private Button btnFlashToggle;
    private Button btnCapture;
    private Button btnOpenReview;
    private Button btnPrevPage;
    private Button btnNextPage;
    private Button btnMovePrev;
    private Button btnMoveNext;
    private Button btnFullPreview;
    private Button btnRotate45;
    private Button btnCropMargin;
    private Button btnRetake;
    private Button btnDelete;
    private Button btnAddMore;
    private Button btnSaveDual;

    private boolean isAutoMode = true;
    private boolean isFlashOn = false;
    private boolean isInReview = false;
    private boolean isCapturing = false;
    private int selectedIndex = 0;
    private int retakeIndex = -1;

    private byte[] prevSampleFrame;
    private int stableStreak = 0;
    private long lastFrameCheckMs = 0L;
    private long lastAutoShotMs = 0L;
    private long heavyShakeSinceMs = 0L;

    private final List<ScannedPage> pages = new ArrayList<ScannedPage>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_document_scanner);

        surfaceView = (SurfaceView) findViewById(R.id.camera_surface);
        ivPreview = (ImageView) findViewById(R.id.iv_review_preview);
        tvTitle = (TextView) findViewById(R.id.tv_scanner_title);
        tvStabilityHint = (TextView) findViewById(R.id.tv_stability_hint);
        layoutCameraControls = findViewById(R.id.layout_camera_controls);
        layoutReviewControls = findViewById(R.id.layout_review_controls);
        btnModeToggle = (Button) findViewById(R.id.btn_scanner_mode);
        btnFlashToggle = (Button) findViewById(R.id.btn_flash_toggle);
        btnCapture = (Button) findViewById(R.id.btn_capture_page);
        btnOpenReview = (Button) findViewById(R.id.btn_open_review);
        btnPrevPage = (Button) findViewById(R.id.btn_prev_page);
        btnNextPage = (Button) findViewById(R.id.btn_next_page);
        btnMovePrev = (Button) findViewById(R.id.btn_move_prev);
        btnMoveNext = (Button) findViewById(R.id.btn_move_next);
        btnFullPreview = (Button) findViewById(R.id.btn_full_preview);
        btnRotate45 = (Button) findViewById(R.id.btn_rotate_45);
        btnCropMargin = (Button) findViewById(R.id.btn_crop_margin);
        btnRetake = (Button) findViewById(R.id.btn_retake_page);
        btnDelete = (Button) findViewById(R.id.btn_delete_page);
        btnAddMore = (Button) findViewById(R.id.btn_add_more_pages);
        btnSaveDual = (Button) findViewById(R.id.btn_save_dual_outputs);

        surfaceHolder = surfaceView.getHolder();
        surfaceHolder.addCallback(this);

        findViewById(R.id.btn_scanner_back).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });

        btnModeToggle.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                isAutoMode = !isAutoMode;
                btnModeToggle.setText(isAutoMode ? "تلقائي" : "يدوي");
            }
        });

        btnFlashToggle.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleFlash();
            }
        });

        btnCapture.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                captureWithAutofocus();
            }
        });

        btnOpenReview.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!pages.isEmpty()) switchToReview();
            }
        });

        btnPrevPage.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (selectedIndex > 0) {
                    selectedIndex--;
                    updateReviewPreview();
                }
            }
        });

        btnNextPage.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (selectedIndex < pages.size() - 1) {
                    selectedIndex++;
                    updateReviewPreview();
                }
            }
        });

        btnMovePrev.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                movePage(-1);
            }
        });

        btnMoveNext.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                movePage(1);
            }
        });

        btnFullPreview.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showFullPreviewDialog();
            }
        });

        btnRotate45.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                rotateCurrentPage45();
            }
        });

        btnCropMargin.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                cycleCropMargin();
            }
        });

        btnRetake.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                retakeIndex = selectedIndex;
                switchToCamera();
            }
        });

        btnDelete.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                deleteCurrentPage();
            }
        });

        btnAddMore.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                retakeIndex = -1;
                switchToCamera();
            }
        });

        btnSaveDual.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                saveDualOutputs(false);
            }
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            checkSelfPermission("android.permission.CAMERA") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.CAMERA"}, REQ_CAMERA_PERM);
        }
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        if (!isInReview) openCamera();
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {}

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        releaseCamera();
    }

    private void openCamera() {
        releaseCamera();
        try {
            camera = Camera.open();
            camera.setDisplayOrientation(90);
            camera.setPreviewDisplay(surfaceHolder);
            camera.setPreviewCallback(new Camera.PreviewCallback() {
                @Override
                public void onPreviewFrame(byte[] data, Camera cam) {
                    analyzeMotionFrame(data);
                }
            });
            camera.startPreview();
        } catch (Exception e) {
            Toast.makeText(this, "تعذر تشغيل الكاميرا: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void releaseCamera() {
        if (camera != null) {
            try { camera.setPreviewCallback(null); } catch (Exception ignored) {}
            try { camera.stopPreview(); } catch (Exception ignored) {}
            try { camera.release(); } catch (Exception ignored) {}
            camera = null;
            isFlashOn = false;
        }
    }

    private void analyzeMotionFrame(byte[] yuv) {
        if (!isAutoMode || isInReview || isCapturing || yuv == null || yuv.length < 256) return;
        long now = System.currentTimeMillis();
        if (now - lastFrameCheckMs < 350) return;
        lastFrameCheckMs = now;

        int step = Math.max(1, yuv.length / 400);
        byte[] sample = new byte[400];
        for (int i = 0; i < 400 && i * step < yuv.length; i++) {
            sample[i] = yuv[i * step];
        }

        if (prevSampleFrame == null) {
            prevSampleFrame = sample;
            return;
        }

        int totalDiff = 0;
        for (int i = 0; i < sample.length; i++) {
            totalDiff += Math.abs((sample[i] & 0xFF) - (prevSampleFrame[i] & 0xFF));
        }
        prevSampleFrame = sample;
        double meanDiff = totalDiff / (double) sample.length;

        if (meanDiff >= 13.5) {
            if (heavyShakeSinceMs == 0L) heavyShakeSinceMs = now;
            stableStreak = 0;
            if (now - heavyShakeSinceMs > 1600) {
                tvStabilityHint.setText("حافظ على ثبات الهاتف قليلاً للحصول على أوضح صورة");
                tvStabilityHint.setVisibility(View.VISIBLE);
            }
        } else if (meanDiff < 6.5) {
            heavyShakeSinceMs = 0L;
            tvStabilityHint.setVisibility(View.GONE);
            stableStreak++;
            if (stableStreak >= 4 && now - lastAutoShotMs > 2400) {
                lastAutoShotMs = now;
                stableStreak = 0;
                captureWithAutofocus();
            }
        } else {
            // اهتزاز طفيف: نتجاهله بدون تنبيه وننتظر الثبات
            heavyShakeSinceMs = 0L;
            tvStabilityHint.setVisibility(View.GONE);
            stableStreak = 0;
        }
    }

    private void toggleFlash() {
        if (camera == null) return;
        try {
            Camera.Parameters params = camera.getParameters();
            List<String> modes = params.getSupportedFlashModes();
            if (modes != null && modes.contains(Camera.Parameters.FLASH_MODE_TORCH)) {
                isFlashOn = !isFlashOn;
                params.setFlashMode(isFlashOn ? Camera.Parameters.FLASH_MODE_TORCH : Camera.Parameters.FLASH_MODE_OFF);
                camera.setParameters(params);
                btnFlashToggle.setText(isFlashOn ? "فلاش: تشغيل" : "فلاش: إيقاف");
            } else {
                Toast.makeText(this, "الفلاش غير مدعوم على هذا الجهاز", Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(this, "تعذر التحكم بالفلاش", Toast.LENGTH_SHORT).show();
        }
    }

    private void captureWithAutofocus() {
        if (camera == null || isCapturing) return;
        isCapturing = true;
        try {
            camera.autoFocus(new Camera.AutoFocusCallback() {
                @Override
                public void onAutoFocus(boolean success, Camera cam) {
                    takeActualPicture();
                }
            });
        } catch (Exception e) {
            takeActualPicture();
        }
    }

    private void takeActualPicture() {
        if (camera == null) {
            isCapturing = false;
            return;
        }
        try {
            camera.takePicture(null, null, new Camera.PictureCallback() {
                @Override
                public void onPictureTaken(final byte[] data, Camera cam) {
                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                File orig = File.createTempFile("scan_orig_", ".jpg", getCacheDir());
                                FileOutputStream fos = new FileOutputStream(orig);
                                fos.write(data);
                                fos.close();

                                final ScannedPage processed = processOriginalFile(orig, 0, 4);
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (retakeIndex >= 0 && retakeIndex < pages.size()) {
                                            pages.set(retakeIndex, processed);
                                            selectedIndex = retakeIndex;
                                            retakeIndex = -1;
                                            switchToReview();
                                        } else {
                                            pages.add(processed);
                                            selectedIndex = pages.size() - 1;
                                            btnOpenReview.setText("مراجعة (" + pages.size() + ")");
                                        }
                                        isCapturing = false;
                                        if (!isInReview && camera != null) {
                                            try { camera.startPreview(); } catch (Exception ignored) {}
                                        }
                                    }
                                });
                            } catch (final Exception ex) {
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        isCapturing = false;
                                        Toast.makeText(DocumentScannerActivity.this, "تعذر معالجة الورقة (الصفحات السابقة محفوظة)", Toast.LENGTH_SHORT).show();
                                    }
                                });
                            }
                        }
                    }).start();
                }
            });
        } catch (Exception e) {
            isCapturing = false;
        }
    }

    private ScannedPage processOriginalFile(File origFile, int rotationDeg, int cropTrimPct) throws Exception {
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap raw = BitmapFactory.decodeFile(origFile.getAbsolutePath(), opts);
        if (raw == null) throw new Exception("تعذر فك الصورة");

        Bitmap cropped = raw;
        if (cropTrimPct > 0 && raw.getWidth() > 200 && raw.getHeight() > 200) {
            int dx = Math.round(raw.getWidth() * (cropTrimPct / 100f));
            int dy = Math.round(raw.getHeight() * (cropTrimPct / 100f));
            int cw = Math.max(100, raw.getWidth() - dx * 2);
            int ch = Math.max(100, raw.getHeight() - dy * 2);
            cropped = Bitmap.createBitmap(raw, dx, dy, cw, ch);
            if (cropped != raw) raw.recycle();
        }

        Bitmap rotated = cropped;
        if (rotationDeg % 360 != 0) {
            Matrix matrix = new Matrix();
            matrix.postRotate(rotationDeg % 360);
            rotated = Bitmap.createBitmap(cropped, 0, 0, cropped.getWidth(), cropped.getHeight(), matrix, true);
            if (rotated != cropped) cropped.recycle();
        }

        Bitmap resized = scaleMaxDim(rotated, 1850);
        if (resized != rotated) rotated.recycle();

        Bitmap enhanced = enhanceLegalColorBitmap(resized);
        if (enhanced != resized) resized.recycle();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        int quality = 88;
        enhanced.compress(Bitmap.CompressFormat.JPEG, quality, baos);
        if (baos.toByteArray().length > SAFE_TARGET_BYTES) {
            quality = 82;
            baos.reset();
            enhanced.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            int tries = 0;
            while (baos.toByteArray().length > SAFE_TARGET_BYTES && tries < 6) {
                tries++;
                quality = Math.max(58, quality - 5);
                baos.reset();
                enhanced.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            }
        }
        enhanced.recycle();

        byte[] outBytes = baos.toByteArray();
        File procFile = File.createTempFile("scan_proc_", ".jpg", getCacheDir());
        FileOutputStream fos = new FileOutputStream(procFile);
        fos.write(outBytes);
        fos.close();

        ScannedPage page = new ScannedPage();
        page.originalTempFile = origFile;
        page.processedTempFile = procFile;
        page.rotationDeg = rotationDeg;
        page.cropTrimPct = cropTrimPct;
        page.processedBytes = outBytes;
        return page;
    }

    private Bitmap scaleMaxDim(Bitmap src, int maxDim) {
        int max = Math.max(src.getWidth(), src.getHeight());
        if (max <= maxDim) return src;
        float r = (float) maxDim / max;
        return Bitmap.createScaledBitmap(src, Math.round(src.getWidth() * r), Math.round(src.getHeight() * r), true);
    }

    // تحسين تلقائي لإزالة الظلال وتوحيد الإضاءة مع الحفاظ التام على الألوان والأختام والتوقيعات
    private Bitmap enhanceLegalColorBitmap(Bitmap src) {
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
                        int r = (c >> 16) & 0xFF;
                        int g = (c >> 8) & 0xFF;
                        int b = c & 0xFF;
                        lums[n++] = 0.299f * r + 0.587f * g + 0.114f * b;
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

        for (int y = 0; y < h; y++) {
            int gy = Math.min(rows - 1, (int) (y / cellH));
            for (int x = 0; x < w; x++) {
                int gx = Math.min(cols - 1, (int) (x / cellW));
                float localBg = bgGrid[gy * cols + gx];
                float gain = Math.min(1.85f, Math.max(0.95f, 242f / Math.max(85f, localBg)));
                float effGain = 1f + (gain - 1f) * 0.72f;

                int c = pixels[y * w + x];
                float r = ((c >> 16) & 0xFF) * effGain;
                float g = ((c >> 8) & 0xFF) * effGain;
                float b = (c & 0xFF) * effGain;

                float lum = 0.299f * r + 0.587f * g + 0.114f * b;
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

        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        out.setPixels(pixels, 0, w, 0, 0, w, h);
        return out;
    }

    private void rotateCurrentPage45() {
        if (pages.isEmpty()) return;
        final ScannedPage page = pages.get(selectedIndex);
        final int nextDeg = (page.rotationDeg + 45) % 360;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    final ScannedPage updated = processOriginalFile(page.originalTempFile, nextDeg, page.cropTrimPct);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            pages.set(selectedIndex, updated);
                            updateReviewPreview();
                        }
                    });
                } catch (Exception ignored) {}
            }
        }).start();
    }

    private void cycleCropMargin() {
        if (pages.isEmpty()) return;
        final ScannedPage page = pages.get(selectedIndex);
        final int nextCrop = page.cropTrimPct == 4 ? 8 : (page.cropTrimPct == 8 ? 0 : 4);
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    final ScannedPage updated = processOriginalFile(page.originalTempFile, page.rotationDeg, nextCrop);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            pages.set(selectedIndex, updated);
                            updateReviewPreview();
                            Toast.makeText(DocumentScannerActivity.this,
                                "تم ضبط هامش القص: " + nextCrop + "%", Toast.LENGTH_SHORT).show();
                        }
                    });
                } catch (Exception ignored) {}
            }
        }).start();
    }

    private void movePage(int delta) {
        int target = selectedIndex + delta;
        if (target < 0 || target >= pages.size()) return;
        ScannedPage moved = pages.remove(selectedIndex);
        pages.add(target, moved);
        selectedIndex = target;
        updateReviewPreview();
    }

    private void showFullPreviewDialog() {
        if (pages.isEmpty()) return;
        ScrollView scroll = new ScrollView(this);
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(24, 24, 24, 24);
        for (int i = 0; i < pages.size(); i++) {
            ScannedPage p = pages.get(i);
            TextView label = new TextView(this);
            label.setText(String.format(Locale.US, "صفحة %d (Scan_%03d.jpg) • %.1f KB",
                i + 1, i + 1, p.processedBytes.length / 1024f));
            label.setPadding(0, 12, 0, 8);
            container.addView(label);

            ImageView img = new ImageView(this);
            img.setAdjustViewBounds(true);
            img.setImageBitmap(BitmapFactory.decodeByteArray(p.processedBytes, 0, p.processedBytes.length));
            container.addView(img);
        }
        scroll.addView(container);

        new AlertDialog.Builder(this)
            .setTitle("معاينة المستند الكامل (" + pages.size() + " صفحات)")
            .setView(scroll)
            .setPositiveButton("إغلاق", null)
            .show();
    }

    private void deleteCurrentPage() {
        if (pages.isEmpty()) return;
        pages.remove(selectedIndex);
        if (pages.isEmpty()) {
            switchToCamera();
        } else {
            selectedIndex = Math.min(selectedIndex, pages.size() - 1);
            updateReviewPreview();
        }
    }

    private void switchToReview() {
        isInReview = true;
        releaseCamera();
        surfaceView.setVisibility(View.GONE);
        ivPreview.setVisibility(View.VISIBLE);
        layoutCameraControls.setVisibility(View.GONE);
        layoutReviewControls.setVisibility(View.VISIBLE);
        updateReviewPreview();
    }

    private void switchToCamera() {
        isInReview = false;
        ivPreview.setVisibility(View.GONE);
        surfaceView.setVisibility(View.VISIBLE);
        layoutReviewControls.setVisibility(View.GONE);
        layoutCameraControls.setVisibility(View.VISIBLE);
        tvTitle.setText("تصوير المستندات أوفلاين");
        btnOpenReview.setText("مراجعة (" + pages.size() + ")");
        openCamera();
    }

    private void updateReviewPreview() {
        if (pages.isEmpty()) return;
        ScannedPage cur = pages.get(selectedIndex);
        tvTitle.setText(String.format(Locale.US, "صفحة %d/%d • %.1f KB • %d°",
            selectedIndex + 1, pages.size(), cur.processedBytes.length / 1024f, cur.rotationDeg));
        Bitmap bmp = BitmapFactory.decodeByteArray(cur.processedBytes, 0, cur.processedBytes.length);
        ivPreview.setImageBitmap(bmp);
        btnPrevPage.setEnabled(selectedIndex > 0);
        btnNextPage.setEnabled(selectedIndex < pages.size() - 1);
        btnMovePrev.setEnabled(selectedIndex > 0);
        btnMoveNext.setEnabled(selectedIndex < pages.size() - 1);
    }

    private void saveDualOutputs(final boolean allowOversized) {
        if (pages.isEmpty()) return;
        btnSaveDual.setEnabled(false);
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    final byte[] pdfBytes = buildCombinedPdfUnder500KB();
                    if (pdfBytes.length >= STRICT_500KB && !allowOversized) {
                        final String sizeKb = String.format(Locale.US, "%.1f", pdfBytes.length / 1024f);
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                btnSaveDual.setEnabled(true);
                                new AlertDialog.Builder(DocumentScannerActivity.this)
                                    .setTitle("تنبيه حجم ملف PDF")
                                    .setMessage("تعذر تقليص ملف Scanned_Document.pdf لأقل من 500 KB دون المساس بجودة النصوص.\nالحجم الفعلي: " + sizeKb + " KB\nهل توافق على الحفظ؟")
                                    .setNegativeButton("إلغاء", null)
                                    .setPositiveButton("حفظ رغم ذلك", new DialogInterface.OnClickListener() {
                                        @Override
                                        public void onClick(DialogInterface dialog, int which) {
                                            saveDualOutputs(true);
                                        }
                                    }).show();
                            }
                        });
                        return;
                    }

                    // 1. حفظ الصور المنفصلة Scan_001.jpg.. والتحقق من < 500 KB
                    for (int i = 0; i < pages.size(); i++) {
                        byte[] imgBytes = pages.get(i).processedBytes;
                        if (imgBytes.length >= STRICT_500KB) {
                            throw new Exception("تجاوزت صورة حجم 500 KB");
                        }
                        String name = String.format(Locale.US, "Scan_%03d.jpg", i + 1);
                        saveImageGallery(imgBytes, name);
                    }

                    // 2. حفظ Scanned_Document.pdf بالتنزيلات
                    savePdfDownloads(pdfBytes, "Scanned_Document.pdf");

                    // 3. حذف الملفات المؤقتة بعد التأكد التام من نجاح الحفظ المزدوج
                    for (ScannedPage p : pages) {
                        if (p.originalTempFile != null && p.originalTempFile.exists()) p.originalTempFile.delete();
                        if (p.processedTempFile != null && p.processedTempFile.exists()) p.processedTempFile.delete();
                    }

                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(DocumentScannerActivity.this,
                                "✅ تم حفظ " + pages.size() + " صور بالمعرض و Scanned_Document.pdf بالتنزيلات",
                                Toast.LENGTH_LONG).show();
                            finish();
                        }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            btnSaveDual.setEnabled(true);
                            Toast.makeText(DocumentScannerActivity.this,
                                "فشل الحفظ (المستندات محفوظة لإعادة المحاولة): " + e.getMessage(),
                                Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        }).start();
    }

    private byte[] buildCombinedPdfUnder500KB() throws Exception {
        int count = pages.size();
        int maxDim = count == 1 ? 1850 : (count <= 3 ? 1550 : (count <= 6 ? 1300 : 1120));
        int quality = count == 1 ? 82 : (count <= 3 ? 75 : (count <= 6 ? 68 : 62));
        byte[] pdf = renderPagesToPdf(maxDim, quality);
        int tries = 0;
        while (pdf.length >= STRICT_500KB && tries < 6) {
            tries++;
            if (quality > 58) quality = Math.max(56, quality - 5);
            else maxDim = Math.max(880, Math.round(maxDim * 0.88f));
            pdf = renderPagesToPdf(maxDim, quality);
        }
        return pdf;
    }

    private byte[] renderPagesToPdf(int maxDim, int quality) throws Exception {
        ArrayList<byte[]> jpegs = new ArrayList<byte[]>();
        ArrayList<int[]> dims = new ArrayList<int[]>();
        for (ScannedPage p : pages) {
            Bitmap bmp = BitmapFactory.decodeByteArray(p.processedBytes, 0, p.processedBytes.length);
            Bitmap scaled = scaleMaxDim(bmp, maxDim);
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, b);
            jpegs.add(b.toByteArray());
            dims.add(new int[]{ scaled.getWidth(), scaled.getHeight() });
            if (scaled != bmp) scaled.recycle();
            bmp.recycle();
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ArrayList<Long> offsets = new ArrayList<Long>();
        baos.write("%PDF-1.4\n".getBytes("ISO-8859-1"));
        offsets.add((long) baos.size());
        baos.write("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n".getBytes("ISO-8859-1"));
        StringBuilder kids = new StringBuilder();
        for (int i = 0; i < jpegs.size(); i++) kids.append(3 + i * 3).append(" 0 R ");
        offsets.add((long) baos.size());
        baos.write(("2 0 obj\n<< /Type /Pages /Kids [" + kids + "] /Count " + jpegs.size() + " >>\nendobj\n").getBytes("ISO-8859-1"));
        for (int i = 0; i < jpegs.size(); i++) {
            int w = dims.get(i)[0], h = dims.get(i)[1];
            float pw = w > h ? 841.89f : 595.28f;
            float ph = w > h ? 595.28f : 841.89f;
            float s = Math.min((pw - 16) / w, (ph - 16) / h);
            offsets.add((long) baos.size());
            baos.write(((3 + i * 3) + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw + " " + ph + "] /Resources << /XObject << /Im" + (i + 1) + " " + (4 + i * 3) + " 0 R >> >> /Contents " + (5 + i * 3) + " 0 R >>\nendobj\n").getBytes("ISO-8859-1"));
            offsets.add((long) baos.size());
            baos.write(((4 + i * 3) + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + w + " /Height " + h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpegs.get(i).length + " >>\nstream\n").getBytes("ISO-8859-1"));
            baos.write(jpegs.get(i));
            baos.write("\nendstream\nendobj\n".getBytes("ISO-8859-1"));
            String cs = String.format(Locale.US, "q\n%.2f 0 0 %.2f %.2f %.2f cm\n/Im%d Do\nQ\n", w * s, h * s, (pw - w * s) / 2f, (ph - h * s) / 2f, i + 1);
            byte[] cb = cs.getBytes("ISO-8859-1");
            offsets.add((long) baos.size());
            baos.write(((5 + i * 3) + " 0 obj\n<< /Length " + cb.length + " >>\nstream\n").getBytes("ISO-8859-1"));
            baos.write(cb);
            baos.write("endstream\nendobj\n".getBytes("ISO-8859-1"));
        }
        long xref = baos.size();
        baos.write(("xref\n0 " + (offsets.size() + 1) + "\n0000000000 65535 f \n").getBytes("ISO-8859-1"));
        for (long off : offsets) baos.write(String.format(Locale.US, "%010d 00000 n \n", off).getBytes("ISO-8859-1"));
        baos.write(("trailer\n<< /Size " + (offsets.size() + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n").getBytes("ISO-8859-1"));
        return baos.toByteArray();
    }

    private void saveImageGallery(byte[] bytes, String fileName) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver r = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
            v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            v.put("relative_path", Environment.DIRECTORY_PICTURES + "/ManzomaLawyer");
            Uri u = r.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (u != null) {
                OutputStream os = r.openOutputStream(u);
                if (os != null) { os.write(bytes); os.flush(); os.close(); return; }
            }
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "ManzomaLawyer");
        if (!dir.exists()) dir.mkdirs();
        File target = new File(dir, fileName);
        FileOutputStream fos = new FileOutputStream(target);
        fos.write(bytes);
        fos.flush();
        fos.close();
        MediaScannerConnection.scanFile(this, new String[]{ target.getAbsolutePath() }, new String[]{ "image/jpeg" }, null);
    }

    private void savePdfDownloads(byte[] bytes, String fileName) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver r = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            v.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
            v.put("relative_path", Environment.DIRECTORY_DOWNLOADS);
            Uri u = r.insert(Uri.parse("content://media/external/downloads"), v);
            if (u != null) {
                OutputStream os = r.openOutputStream(u);
                if (os != null) { os.write(bytes); os.flush(); os.close(); return; }
            }
        }
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists()) dir.mkdirs();
        File target = new File(dir, fileName);
        FileOutputStream fos = new FileOutputStream(target);
        fos.write(bytes);
        fos.flush();
        fos.close();
    }

    @Override
    protected void onDestroy() {
        releaseCamera();
        for (ScannedPage p : pages) {
            if (p.originalTempFile != null && p.originalTempFile.exists()) p.originalTempFile.delete();
            if (p.processedTempFile != null && p.processedTempFile.exists()) p.processedTempFile.delete();
        }
        super.onDestroy();
    }
}
