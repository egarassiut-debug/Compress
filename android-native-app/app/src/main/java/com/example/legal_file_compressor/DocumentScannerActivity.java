package com.example.legal_file_compressor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.hardware.Camera;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * خدمة تصوير المستندات - نظام 3 مراحل واضح وسريع (Android Native - أوفلاين بالكامل):
 * المرحلة 1: التصوير وتجميع المستندات (كاميرا حية + التقاط متعدد + استيراد صور متعددة وملفات PDF من الاستوديو)
 * المرحلة 2: المراجعة والتحسين (تدوير 90°، ترتيب، إعادة، حذف، وقائمة «أدوات التحرير» مطوية: قص يدوي، إضاءة، ألوان)
 * المرحلة 3: الحفظ والتصدير (< 500 KB للصور و PDF مع موافقة صريحة إن تجاوز PDF، وفتح الملف المحفوظ وبدء عملية جديدة)
 */
@SuppressWarnings("deprecation")
public class DocumentScannerActivity extends Activity implements SurfaceHolder.Callback {

    private static final int STRICT_500KB = 500 * 1024;
    private static final int SAFE_TARGET_BYTES = 485 * 1024;
    private static final int REQ_CAMERA_PERM = 301;
    private static final int REQ_STUDIO_PICK = 302;

    private static final int STEP_CAPTURE = 0;
    private static final int STEP_REVIEW = 1;
    private static final int STEP_EXPORT = 2;
    private static final int STEP_CROP = 3;

    private static class ScannedPage {
        File originalTempFile;
        File processedTempFile;
        float[] corners = DocumentScannerEngine.defaultGuideCorners();
        boolean autoDetected = false;
        int rotationDeg = 0; // مضاعفات 90° فقط (0، 90، 180، 270)
        int filterMode = DocumentScannerEngine.FILTER_ORIGINAL_COLOR; // الافتراضي: ألوان أصلية
        int brightnessAdjust = 0; // -30..+40
        byte[] processedBytes;
    }

    private Camera camera;
    private SurfaceView surfaceView;
    private SurfaceHolder surfaceHolder;
    private ScannerOverlayView scannerOverlayView;
    private ImageView ivPreview;
    private CropOverlayView cropOverlayView;
    private TextView tvTitle;
    private TextView tvStabilityHint;

    private Button btnStepCapture;
    private Button btnStepReview;
    private Button btnStepExport;

    private View layoutCameraControls;
    private View layoutCropControls;
    private View layoutReviewControls;
    private View layoutEditToolsDrawer;
    private ScrollView scrollExportStage;
    private View layoutExportFooter;
    private View layoutExportOptions;
    private View layoutPostSavePanel;

    private Button btnModeToggle;
    private Button btnFlashToggle;
    private Button btnStudioImport;
    private Button btnCapture;
    private Button btnOpenReview;

    private Button btnCropAutoDetect;
    private Button btnCropResetFull;
    private Button btnCropCancel;
    private Button btnCropApply;

    private Button btnPrevPage;
    private Button btnNextPage;
    private Button btnMovePrev;
    private Button btnMoveNext;
    private Button btnFullPreview;
    private Button btnRotateRight90;
    private Button btnRotateLeft90;
    private Button btnManualCrop;
    private Button btnRetake;
    private Button btnDelete;
    private Button btnAddMore;
    private Button btnReviewImportStudio;
    private Button btnToggleEditTools;
    private Button btnBrightnessDown;
    private TextView tvBrightnessValue;
    private Button btnBrightnessUp;
    private Button btnAutoAdjust;
    private Button btnFilterColor;
    private Button btnFilterGray;
    private Button btnFilterBw;
    private Button btnGoToExport;

    private TextView tvExportSummary;
    private TextView tvExportSubsummary;
    private Button btnSaveImagesOnly;
    private Button btnSavePdfOnly;
    private TextView tvPostSaveTitle;
    private TextView tvPostSaveDetails;
    private Button btnOpenSavedFile;
    private Button btnExportOtherFormat;
    private Button btnStartNewScan;
    private Button btnBackToReview;
    private Button btnExportAddMore;

    private boolean isAutoMode = true;
    private boolean isFlashOn = false;
    private boolean showEditDrawer = false;
    private int currentStep = STEP_CAPTURE;
    private boolean isCapturing = false;
    private boolean isImportingStudio = false;
    private volatile boolean isAnalyzingFrame = false;
    private int selectedIndex = 0;
    private int retakeIndex = -1;
    private Bitmap cropEditingBitmap;

    private Uri lastSavedUri;
    private String lastSavedMimeType;
    private String lastSavedKind; // "images" | "pdf"

    private byte[] prevSampleFrame;
    private int stableStreak = 0;
    private long lastFrameCheckMs = 0L;
    private long lastAutoShotMs = 0L;
    private long heavyShakeSinceMs = 0L;
    private volatile float[] latestLiveCorners = DocumentScannerEngine.defaultGuideCorners();
    private volatile boolean latestLiveDetected = false;

    private final List<ScannedPage> pages = new ArrayList<ScannedPage>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_document_scanner);

        surfaceView = (SurfaceView) findViewById(R.id.camera_surface);
        scannerOverlayView = (ScannerOverlayView) findViewById(R.id.scanner_overlay_view);
        ivPreview = (ImageView) findViewById(R.id.iv_review_preview);
        cropOverlayView = (CropOverlayView) findViewById(R.id.crop_overlay_view);
        tvTitle = (TextView) findViewById(R.id.tv_scanner_title);
        tvStabilityHint = (TextView) findViewById(R.id.tv_stability_hint);

        btnStepCapture = (Button) findViewById(R.id.btn_step_capture);
        btnStepReview = (Button) findViewById(R.id.btn_step_review);
        btnStepExport = (Button) findViewById(R.id.btn_step_export);

        layoutCameraControls = findViewById(R.id.layout_camera_controls);
        layoutCropControls = findViewById(R.id.layout_crop_controls);
        layoutReviewControls = findViewById(R.id.layout_review_controls);
        layoutEditToolsDrawer = findViewById(R.id.layout_edit_tools_drawer);
        scrollExportStage = (ScrollView) findViewById(R.id.scroll_export_stage);
        layoutExportFooter = findViewById(R.id.layout_export_footer);
        layoutExportOptions = findViewById(R.id.layout_export_options);
        layoutPostSavePanel = findViewById(R.id.layout_post_save_panel);

        btnModeToggle = (Button) findViewById(R.id.btn_scanner_mode);
        btnFlashToggle = (Button) findViewById(R.id.btn_flash_toggle);
        btnStudioImport = (Button) findViewById(R.id.btn_studio_import);
        btnCapture = (Button) findViewById(R.id.btn_capture_page);
        btnOpenReview = (Button) findViewById(R.id.btn_open_review);

        btnCropAutoDetect = (Button) findViewById(R.id.btn_crop_auto_detect);
        btnCropResetFull = (Button) findViewById(R.id.btn_crop_reset_full);
        btnCropCancel = (Button) findViewById(R.id.btn_crop_cancel);
        btnCropApply = (Button) findViewById(R.id.btn_crop_apply);

        btnPrevPage = (Button) findViewById(R.id.btn_prev_page);
        btnNextPage = (Button) findViewById(R.id.btn_next_page);
        btnMovePrev = (Button) findViewById(R.id.btn_move_prev);
        btnMoveNext = (Button) findViewById(R.id.btn_move_next);
        btnFullPreview = (Button) findViewById(R.id.btn_full_preview);
        btnRotateRight90 = (Button) findViewById(R.id.btn_rotate_right_90);
        btnRotateLeft90 = (Button) findViewById(R.id.btn_rotate_left_90);
        btnManualCrop = (Button) findViewById(R.id.btn_manual_crop);
        btnRetake = (Button) findViewById(R.id.btn_retake_page);
        btnDelete = (Button) findViewById(R.id.btn_delete_page);
        btnAddMore = (Button) findViewById(R.id.btn_add_more_pages);
        btnReviewImportStudio = (Button) findViewById(R.id.btn_review_import_studio);
        btnToggleEditTools = (Button) findViewById(R.id.btn_toggle_edit_tools);
        btnBrightnessDown = (Button) findViewById(R.id.btn_brightness_down);
        tvBrightnessValue = (TextView) findViewById(R.id.tv_brightness_value);
        btnBrightnessUp = (Button) findViewById(R.id.btn_brightness_up);
        btnAutoAdjust = (Button) findViewById(R.id.btn_auto_adjust);
        btnFilterColor = (Button) findViewById(R.id.btn_filter_color);
        btnFilterGray = (Button) findViewById(R.id.btn_filter_gray);
        btnFilterBw = (Button) findViewById(R.id.btn_filter_bw);
        btnGoToExport = (Button) findViewById(R.id.btn_go_to_export);

        tvExportSummary = (TextView) findViewById(R.id.tv_export_summary);
        tvExportSubsummary = (TextView) findViewById(R.id.tv_export_subsummary);
        btnSaveImagesOnly = (Button) findViewById(R.id.btn_save_images_only);
        btnSavePdfOnly = (Button) findViewById(R.id.btn_save_pdf_only);
        tvPostSaveTitle = (TextView) findViewById(R.id.tv_post_save_title);
        tvPostSaveDetails = (TextView) findViewById(R.id.tv_post_save_details);
        btnOpenSavedFile = (Button) findViewById(R.id.btn_open_saved_file);
        btnExportOtherFormat = (Button) findViewById(R.id.btn_export_other_format);
        btnStartNewScan = (Button) findViewById(R.id.btn_start_new_scan);
        btnBackToReview = (Button) findViewById(R.id.btn_back_to_review);
        btnExportAddMore = (Button) findViewById(R.id.btn_export_add_more);

        surfaceHolder = surfaceView.getHolder();
        surfaceHolder.addCallback(this);

        findViewById(R.id.btn_scanner_back).setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (currentStep == STEP_CROP) {
                    closeCropScreenToReview();
                } else if (currentStep == STEP_EXPORT) {
                    switchToReview();
                } else if (currentStep == STEP_REVIEW) {
                    switchToCapture();
                } else {
                    finish();
                }
            }
        });

        btnStepCapture.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                switchToCapture();
            }
        });

        btnStepReview.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!pages.isEmpty()) switchToReview();
            }
        });

        btnStepExport.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!pages.isEmpty()) switchToExport();
            }
        });

        btnModeToggle.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                isAutoMode = !isAutoMode;
                stableStreak = 0;
                btnModeToggle.setText(isAutoMode ? "تلقائي" : "يدوي");
                updateCameraStatusHint(latestLiveDetected, false, false);
            }
        });

        btnFlashToggle.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleFlash();
            }
        });

        View.OnClickListener studioPickerClick = new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openStudioPicker();
            }
        };
        btnStudioImport.setOnClickListener(studioPickerClick);
        btnReviewImportStudio.setOnClickListener(studioPickerClick);

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

        btnRotateRight90.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                rotateCurrentPage90(90);
            }
        });

        btnRotateLeft90.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                rotateCurrentPage90(-90);
            }
        });

        btnToggleEditTools.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showEditDrawer = !showEditDrawer;
                layoutEditToolsDrawer.setVisibility(showEditDrawer ? View.VISIBLE : View.GONE);
                btnToggleEditTools.setText(showEditDrawer ? "إخفاء التحرير" : "أدوات التحرير");
            }
        });

        btnManualCrop.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openManualCrop(selectedIndex);
            }
        });

        btnBrightnessDown.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                adjustCurrentBrightness(-8);
            }
        });

        btnBrightnessUp.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                adjustCurrentBrightness(8);
            }
        });

        btnAutoAdjust.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                resetAutoAdjustCurrentPage();
            }
        });

        btnCropAutoDetect.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                redetectCornersInCropView();
            }
        });

        btnCropResetFull.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (cropEditingBitmap != null) {
                    cropOverlayView.setImageAndCorners(cropEditingBitmap, DocumentScannerEngine.fullFrameCorners());
                }
            }
        });

        btnCropCancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                closeCropScreenToReview();
            }
        });

        btnCropApply.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                applyManualCropCorners();
            }
        });

        btnRetake.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                retakeIndex = selectedIndex;
                switchToCapture();
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
                switchToCapture();
            }
        });

        btnFilterColor.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                changeCurrentFilterMode(DocumentScannerEngine.FILTER_ORIGINAL_COLOR);
            }
        });

        btnFilterGray.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                changeCurrentFilterMode(DocumentScannerEngine.FILTER_GRAYSCALE);
            }
        });

        btnFilterBw.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                changeCurrentFilterMode(DocumentScannerEngine.FILTER_BLACK_WHITE);
            }
        });

        btnGoToExport.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!pages.isEmpty()) switchToExport();
            }
        });

        btnBackToReview.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                switchToReview();
            }
        });

        btnExportAddMore.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                retakeIndex = -1;
                switchToCapture();
            }
        });

        btnSaveImagesOnly.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                saveImagesOnly();
            }
        });

        btnSavePdfOnly.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                savePdfOnly(false);
            }
        });

        btnOpenSavedFile.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openLastSavedFile();
            }
        });

        btnExportOtherFormat.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if ("images".equals(lastSavedKind)) {
                    savePdfOnly(false);
                } else {
                    saveImagesOnly();
                }
            }
        });

        btnStartNewScan.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startNewScanSession();
            }
        });

        updateStepIndicator();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            checkSelfPermission("android.permission.CAMERA") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.CAMERA"}, REQ_CAMERA_PERM);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA_PERM) {
            if (grantResults != null && grantResults.length > 0 &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (currentStep == STEP_CAPTURE && surfaceHolder != null &&
                    surfaceHolder.getSurface() != null && surfaceHolder.getSurface().isValid()) {
                    openCamera();
                }
            } else {
                Toast.makeText(this, "يمكنك الاستيراد من الاستوديو أو منح صلاحية الكاميرا للتصوير", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        if (currentStep == STEP_CAPTURE) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                checkSelfPermission("android.permission.CAMERA") != PackageManager.PERMISSION_GRANTED) {
                return;
            }
            openCamera();
        }
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {}

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        releaseCamera();
    }

    private void openCamera() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            checkSelfPermission("android.permission.CAMERA") != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        releaseCamera();
        try {
            camera = Camera.open();
            camera.setDisplayOrientation(90);
            try {
                Camera.Parameters params = camera.getParameters();
                List<String> focusModes = params.getSupportedFocusModes();
                if (focusModes != null && focusModes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) {
                    params.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
                }
                List<Camera.Size> picSizes = params.getSupportedPictureSizes();
                if (picSizes != null && !picSizes.isEmpty()) {
                    Camera.Size best = picSizes.get(0);
                    for (Camera.Size s : picSizes) {
                        int maxS = Math.max(s.width, s.height);
                        int maxBest = Math.max(best.width, best.height);
                        if (maxS <= 3200 && maxS > maxBest) best = s;
                    }
                    params.setPictureSize(best.width, best.height);
                }
                params.setRotation(90);
                camera.setParameters(params);
            } catch (Exception ignored) {}

            camera.setPreviewDisplay(surfaceHolder);
            camera.setPreviewCallback(new Camera.PreviewCallback() {
                @Override
                public void onPreviewFrame(final byte[] data, Camera cam) {
                    if (currentStep != STEP_CAPTURE || isCapturing || isAnalyzingFrame || data == null) return;
                    long now = System.currentTimeMillis();
                    if (now - lastFrameCheckMs < 240) return;
                    lastFrameCheckMs = now;

                    final Camera.Size previewSize;
                    try {
                        previewSize = cam.getParameters().getPreviewSize();
                    } catch (Exception e) {
                        return;
                    }
                    if (previewSize == null || data.length < previewSize.width * previewSize.height) return;

                    isAnalyzingFrame = true;
                    final byte[] copy = new byte[previewSize.width * previewSize.height];
                    System.arraycopy(data, 0, copy, 0, copy.length);

                    new Thread(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                analyzeLivePreviewFrame(copy, previewSize.width, previewSize.height);
                            } finally {
                                isAnalyzingFrame = false;
                            }
                        }
                    }).start();
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

    private void analyzeLivePreviewFrame(byte[] yPlane, int srcW, int srcH) {
        final int sampleW = 120;
        final int sampleH = 160;
        byte[] gray = DocumentScannerEngine.sampleGrayFromNv21(yPlane, srcW, srcH, 90, sampleW, sampleH);
        float stabilityDiff = DocumentScannerEngine.computeStabilityDiff(prevSampleFrame, gray);
        prevSampleFrame = gray;

        final DocumentScannerEngine.DetectionResult res =
            DocumentScannerEngine.detectDocumentQuad(gray, sampleW, sampleH, stabilityDiff);

        latestLiveCorners = res.corners;
        latestLiveDetected = res.detected;

        final long now = System.currentTimeMillis();
        final boolean isShakingHeavy = stabilityDiff >= 13.5f;
        final boolean isCalm = stabilityDiff < 6.5f;
        final boolean isSharp = res.sharpness >= 7.0f;

        if (!res.detected) {
            heavyShakeSinceMs = 0L;
            stableStreak = 0;
        } else if (isShakingHeavy) {
            if (heavyShakeSinceMs == 0L) heavyShakeSinceMs = now;
            stableStreak = 0;
        } else {
            heavyShakeSinceMs = 0L;
            if (isCalm && isSharp) {
                stableStreak++;
            } else {
                stableStreak = 0;
            }
        }

        final boolean readyForAuto = isAutoMode && res.detected && isCalm && isSharp && stableStreak >= 3
            && (now - lastAutoShotMs > 2400) && !isCapturing;
        if (readyForAuto) {
            lastAutoShotMs = now;
            stableStreak = 0;
        }

        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (currentStep != STEP_CAPTURE) return;
                scannerOverlayView.updateDetection(res.corners, res.detected, isCalm && isSharp);
                updateCameraStatusHint(res.detected, isShakingHeavy && (heavyShakeSinceMs > 0 && now - heavyShakeSinceMs > 1200), isSharp);
                if (readyForAuto) {
                    captureWithAutofocus();
                }
            }
        });
    }

    private void updateCameraStatusHint(boolean detected, boolean shakingNotice, boolean sharp) {
        if (currentStep != STEP_CAPTURE) {
            tvStabilityHint.setVisibility(View.GONE);
            return;
        }
        tvStabilityHint.setVisibility(View.VISIBLE);
        if (!detected) {
            tvStabilityHint.setText("وجّه الكاميرا نحو المستند أو استورد من الاستوديو");
            tvStabilityHint.setTextColor(Color.parseColor("#FDE047"));
        } else if (shakingNotice) {
            tvStabilityHint.setText("ثبّت الهاتف قليلاً للحصول على أوضح صورة");
            tvStabilityHint.setTextColor(Color.parseColor("#FCA5A5"));
        } else if (!sharp) {
            tvStabilityHint.setText("تم رصد الورقة — جارٍ ضبط التركيز والوضوح...");
            tvStabilityHint.setTextColor(Color.parseColor("#5EEAD4"));
        } else if (isAutoMode) {
            tvStabilityHint.setText("تم اكتشاف الورقة ✓ ثبّت الهاتف للالتقاط التلقائي");
            tvStabilityHint.setTextColor(Color.parseColor("#4ADE80"));
        } else {
            tvStabilityHint.setText("تم اكتشاف حدود الورقة ✓ اضغط زر الالتقاط");
            tvStabilityHint.setTextColor(Color.parseColor("#4ADE80"));
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
                btnFlashToggle.setText(isFlashOn ? "فلاش ✓" : "فلاش");
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

                                Bitmap normBmp = DocumentScannerEngine.decodeNormalizedOriginal(orig, 1850);
                                byte[] gray = DocumentScannerEngine.sampleGrayFromBitmap(normBmp, 160, 213);
                                DocumentScannerEngine.DetectionResult det =
                                    DocumentScannerEngine.detectDocumentQuad(gray, 160, 213, 0f);
                                normBmp.recycle();

                                final boolean detectedOnCapture = det.detected;
                                final float[] chosenCorners = detectedOnCapture
                                    ? det.corners
                                    : DocumentScannerEngine.fullFrameCorners();

                                final ScannedPage processed = processOriginalFile(
                                    orig,
                                    chosenCorners,
                                    detectedOnCapture,
                                    0,
                                    DocumentScannerEngine.FILTER_ORIGINAL_COLOR,
                                    0
                                );

                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        lastSavedKind = null;
                                        lastSavedUri = null;
                                        if (retakeIndex >= 0 && retakeIndex < pages.size()) {
                                            deletePageTempFiles(pages.get(retakeIndex));
                                            pages.set(retakeIndex, processed);
                                            selectedIndex = retakeIndex;
                                            retakeIndex = -1;
                                            isCapturing = false;
                                            if (!detectedOnCapture) {
                                                Toast.makeText(DocumentScannerActivity.this,
                                                    "تعذر تحديد الحدود تلقائياً — يمكنك ضبط الزوايا يدوياً", Toast.LENGTH_LONG).show();
                                                openManualCrop(selectedIndex);
                                            } else {
                                                switchToReview();
                                            }
                                        } else {
                                            pages.add(processed);
                                            selectedIndex = pages.size() - 1;
                                            updateCaptureCounter();
                                            isCapturing = false;
                                            if (!detectedOnCapture) {
                                                Toast.makeText(DocumentScannerActivity.this,
                                                    "تم التقاط الصفحة (" + pages.size() + ") — يمكنك ضبط القص لاحقاً من المراجعة", Toast.LENGTH_SHORT).show();
                                            } else {
                                                Toast.makeText(DocumentScannerActivity.this,
                                                    "✓ تم التقاط الصفحة وقصها تلقائياً (" + pages.size() + ")", Toast.LENGTH_SHORT).show();
                                            }
                                            if (currentStep == STEP_CAPTURE && camera != null) {
                                                try { camera.startPreview(); } catch (Exception ignored) {}
                                            }
                                        }
                                    }
                                });
                            } catch (final Exception ex) {
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        isCapturing = false;
                                        Toast.makeText(DocumentScannerActivity.this,
                                            "تعذر معالجة الورقة (الصفحات السابقة محفوظة)", Toast.LENGTH_SHORT).show();
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

    // ==================== استيراد صور متعددة وملفات PDF من الاستوديو ====================
    private void openStudioPicker() {
        if (isImportingStudio) return;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{ "image/*", "application/pdf" });
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(intent, REQ_STUDIO_PICK);
        } catch (Exception e) {
            Toast.makeText(this, "تعذر فتح مستعرض الملفات", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_STUDIO_PICK && resultCode == RESULT_OK && data != null) {
            final List<Uri> uris = new ArrayList<Uri>();
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri u = clip.getItemAt(i).getUri();
                    if (u != null) uris.add(u);
                }
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
            if (!uris.isEmpty()) {
                importStudioUris(uris);
            }
        }
    }

    private void importStudioUris(final List<Uri> uris) {
        isImportingStudio = true;
        Toast.makeText(this, "جارٍ استيراد وتحسين الملفات المختارة...", Toast.LENGTH_SHORT).show();

        new Thread(new Runnable() {
            @Override
            public void run() {
                final List<ScannedPage> imported = new ArrayList<ScannedPage>();
                final List<String> skipped = new ArrayList<String>();
                ContentResolver resolver = getContentResolver();

                for (Uri uri : uris) {
                    String mime = resolver.getType(uri);
                    String displayName = queryDisplayName(resolver, uri);
                    boolean isPdf = (mime != null && mime.toLowerCase(Locale.US).contains("pdf"))
                        || (displayName != null && displayName.toLowerCase(Locale.US).endsWith(".pdf"));

                    if (isPdf) {
                        try {
                            importPdfUriToPages(resolver, uri, imported);
                        } catch (Exception ex) {
                            skipped.add((displayName != null ? displayName : "PDF") + " (ملف تالف أو محمي بكلمة مرور)");
                        }
                    } else {
                        try {
                            File orig = File.createTempFile("studio_img_", ".jpg", getCacheDir());
                            InputStream is = resolver.openInputStream(uri);
                            if (is == null) throw new Exception("تعذر فتح الصورة");
                            FileOutputStream fos = new FileOutputStream(orig);
                            byte[] buf = new byte[8192];
                            int read;
                            while ((read = is.read(buf)) != -1) {
                                fos.write(buf, 0, read);
                            }
                            fos.close();
                            is.close();

                            Bitmap normBmp = DocumentScannerEngine.decodeNormalizedOriginal(orig, 1850);
                            byte[] gray = DocumentScannerEngine.sampleGrayFromBitmap(normBmp, 160, 213);
                            DocumentScannerEngine.DetectionResult det =
                                DocumentScannerEngine.detectDocumentQuad(gray, 160, 213, 0f);
                            normBmp.recycle();

                            float[] corners = det.detected ? det.corners : DocumentScannerEngine.fullFrameCorners();
                            ScannedPage p = processOriginalFile(
                                orig, corners, det.detected, 0, DocumentScannerEngine.FILTER_ORIGINAL_COLOR, 0);
                            imported.add(p);
                        } catch (Exception ex) {
                            skipped.add((displayName != null ? displayName : "صورة") + " (تعذر قراءة الصورة)");
                        }
                    }
                }

                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        isImportingStudio = false;
                        if (!imported.isEmpty()) {
                            pages.addAll(imported);
                            selectedIndex = pages.size() - imported.size();
                            lastSavedKind = null;
                            lastSavedUri = null;
                            updateCaptureCounter();
                            updateStepIndicator();
                            Toast.makeText(DocumentScannerActivity.this,
                                "✓ تم استيراد " + imported.size() + " صفحة بنجاح", Toast.LENGTH_SHORT).show();
                            switchToReview();
                        }
                        if (!skipped.isEmpty()) {
                            Toast.makeText(DocumentScannerActivity.this,
                                "تعذر استيراد: " + skipped.get(0), Toast.LENGTH_LONG).show();
                        }
                    }
                });
            }
        }).start();
    }

    private void importPdfUriToPages(ContentResolver resolver, Uri uri, List<ScannedPage> out) throws Exception {
        if (Build.VERSION.SDK_INT < 21) {
            throw new Exception("يتطلب Android 5+ لاستيراد PDF");
        }
        ParcelFileDescriptor pfd = resolver.openFileDescriptor(uri, "r");
        if (pfd == null) throw new Exception("تعذر فتح PDF");
        PdfRenderer renderer = null;
        try {
            renderer = new PdfRenderer(pfd);
            int pageCount = renderer.getPageCount();
            if (pageCount <= 0) throw new Exception("ملف PDF فارغ");

            for (int i = 0; i < pageCount; i++) {
                PdfRenderer.Page page = renderer.openPage(i);
                int w = page.getWidth();
                int h = page.getHeight();
                float scale = Math.min(2.2f, 1650f / Math.max(1, Math.max(w, h)));
                int rw = Math.max(240, Math.round(w * scale));
                int rh = Math.max(240, Math.round(h * scale));

                Bitmap bmp = Bitmap.createBitmap(rw, rh, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bmp);
                canvas.drawColor(Color.WHITE);
                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                page.close();

                File orig = File.createTempFile("studio_pdf_p_", ".jpg", getCacheDir());
                FileOutputStream fos = new FileOutputStream(orig);
                bmp.compress(Bitmap.CompressFormat.JPEG, 92, fos);
                fos.close();
                bmp.recycle();

                ScannedPage sp = processOriginalFile(
                    orig,
                    DocumentScannerEngine.fullFrameCorners(),
                    true,
                    0,
                    DocumentScannerEngine.FILTER_ORIGINAL_COLOR,
                    0
                );
                out.add(sp);
            }
        } finally {
            if (renderer != null) {
                try { renderer.close(); } catch (Exception ignored) {}
            }
            try { pfd.close(); } catch (Exception ignored) {}
        }
    }

    private String queryDisplayName(ContentResolver resolver, Uri uri) {
        Cursor cursor = null;
        try {
            cursor = resolver.query(uri, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getString(0);
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return uri.getLastPathSegment();
    }

    private ScannedPage processOriginalFile(
        File origFile,
        float[] corners,
        boolean autoDetected,
        int rotationDeg,
        int filterMode,
        int brightnessAdjust
    ) throws Exception {
        Bitmap raw = DocumentScannerEngine.decodeNormalizedOriginal(origFile, 1850);
        Bitmap enhanced = DocumentScannerEngine.warpRotateAndEnhance(
            raw, corners, rotationDeg, filterMode, brightnessAdjust, 1850);
        if (enhanced != raw) raw.recycle();

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
                quality = Math.max(60, quality - 4);
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
        page.corners = corners != null ? corners.clone() : DocumentScannerEngine.fullFrameCorners();
        page.autoDetected = autoDetected;
        page.rotationDeg = ((rotationDeg % 360) + 360) % 360;
        page.filterMode = filterMode;
        page.brightnessAdjust = Math.max(-35, Math.min(45, brightnessAdjust));
        page.processedBytes = outBytes;
        return page;
    }

    private void rotateCurrentPage90(final int deltaDeg) {
        if (pages.isEmpty()) return;
        final int targetIdx = selectedIndex;
        final ScannedPage page = pages.get(targetIdx);
        final int nextDeg = (page.rotationDeg + deltaDeg + 360) % 360;
        reprocessPageInBackground(targetIdx, page.corners, page.autoDetected, nextDeg, page.filterMode, page.brightnessAdjust, null);
    }

    private void changeCurrentFilterMode(final int newFilterMode) {
        if (pages.isEmpty()) return;
        final int targetIdx = selectedIndex;
        final ScannedPage page = pages.get(targetIdx);
        if (page.filterMode == newFilterMode) return;
        reprocessPageInBackground(targetIdx, page.corners, page.autoDetected, page.rotationDeg, newFilterMode, page.brightnessAdjust, null);
    }

    private void adjustCurrentBrightness(int delta) {
        if (pages.isEmpty()) return;
        final int targetIdx = selectedIndex;
        final ScannedPage page = pages.get(targetIdx);
        final int nextBrightness = Math.max(-30, Math.min(40, page.brightnessAdjust + delta));
        if (nextBrightness == page.brightnessAdjust) return;
        reprocessPageInBackground(targetIdx, page.corners, page.autoDetected, page.rotationDeg, page.filterMode, nextBrightness, null);
    }

    private void resetAutoAdjustCurrentPage() {
        if (pages.isEmpty()) return;
        final int targetIdx = selectedIndex;
        final ScannedPage page = pages.get(targetIdx);
        reprocessPageInBackground(
            targetIdx, page.corners, page.autoDetected, page.rotationDeg,
            DocumentScannerEngine.FILTER_ORIGINAL_COLOR, 0, "✓ تم الضبط التلقائي للإضاءة والألوان");
    }

    private void reprocessPageInBackground(
        final int targetIdx,
        final float[] corners,
        final boolean autoDetected,
        final int rotationDeg,
        final int filterMode,
        final int brightnessAdjust,
        final String successToast
    ) {
        final ScannedPage page = pages.get(targetIdx);
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    final ScannedPage updated = processOriginalFile(
                        page.originalTempFile, corners, autoDetected, rotationDeg, filterMode, brightnessAdjust);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (page.processedTempFile != null && page.processedTempFile.exists()) {
                                page.processedTempFile.delete();
                            }
                            if (targetIdx < pages.size()) {
                                pages.set(targetIdx, updated);
                                lastSavedKind = null;
                                lastSavedUri = null;
                                updateReviewPreview();
                                if (successToast != null) {
                                    Toast.makeText(DocumentScannerActivity.this, successToast, Toast.LENGTH_SHORT).show();
                                }
                            }
                        }
                    });
                } catch (Exception ignored) {}
            }
        }).start();
    }

    private void openManualCrop(int index) {
        if (index < 0 || index >= pages.size()) return;
        selectedIndex = index;
        final ScannedPage page = pages.get(index);
        currentStep = STEP_CROP;
        releaseCamera();

        surfaceView.setVisibility(View.GONE);
        scannerOverlayView.setVisibility(View.GONE);
        ivPreview.setVisibility(View.GONE);
        scrollExportStage.setVisibility(View.GONE);
        cropOverlayView.setVisibility(View.VISIBLE);
        tvStabilityHint.setVisibility(View.GONE);
        btnModeToggle.setVisibility(View.INVISIBLE);

        layoutCameraControls.setVisibility(View.GONE);
        layoutReviewControls.setVisibility(View.GONE);
        layoutExportFooter.setVisibility(View.GONE);
        layoutCropControls.setVisibility(View.VISIBLE);
        tvTitle.setText("تحديد زوايا قص الورقة");

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    final Bitmap raw = DocumentScannerEngine.decodeNormalizedOriginal(page.originalTempFile, 1600);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (cropEditingBitmap != null && !cropEditingBitmap.isRecycled()) {
                                cropEditingBitmap.recycle();
                            }
                            cropEditingBitmap = raw;
                            cropOverlayView.setImageAndCorners(raw, page.corners);
                        }
                    });
                } catch (Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(DocumentScannerActivity.this, "تعذر فتح محرر القص", Toast.LENGTH_SHORT).show();
                            switchToReview();
                        }
                    });
                }
            }
        }).start();
    }

    private void redetectCornersInCropView() {
        if (cropEditingBitmap == null) return;
        byte[] gray = DocumentScannerEngine.sampleGrayFromBitmap(cropEditingBitmap, 160, 213);
        DocumentScannerEngine.DetectionResult res =
            DocumentScannerEngine.detectDocumentQuad(gray, 160, 213, 0f);
        if (res.detected) {
            cropOverlayView.setImageAndCorners(cropEditingBitmap, res.corners);
            Toast.makeText(this, "✓ تم إعادة اكتشاف الزوايا الأربع", Toast.LENGTH_SHORT).show();
        } else {
            cropOverlayView.setImageAndCorners(cropEditingBitmap, DocumentScannerEngine.fullFrameCorners());
            Toast.makeText(this, "لم يتضح مستند منفصل — يمكنك سحب الزوايا يدوياً", Toast.LENGTH_SHORT).show();
        }
    }

    private void applyManualCropCorners() {
        if (selectedIndex < 0 || selectedIndex >= pages.size()) return;
        final int targetIdx = selectedIndex;
        final ScannedPage page = pages.get(targetIdx);
        final float[] editedCorners = cropOverlayView.getCorners();

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    final ScannedPage updated = processOriginalFile(
                        page.originalTempFile, editedCorners, true, page.rotationDeg, page.filterMode, page.brightnessAdjust);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (page.processedTempFile != null && page.processedTempFile.exists()) {
                                page.processedTempFile.delete();
                            }
                            pages.set(targetIdx, updated);
                            lastSavedKind = null;
                            lastSavedUri = null;
                            closeCropScreenToReview();
                            Toast.makeText(DocumentScannerActivity.this, "✓ تم تطبيق القص وتصحيح المنظور", Toast.LENGTH_SHORT).show();
                        }
                    });
                } catch (Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(DocumentScannerActivity.this, "تعذر تطبيق القص", Toast.LENGTH_SHORT).show();
                        }
                    });
                }
            }
        }).start();
    }

    private void closeCropScreenToReview() {
        cropOverlayView.setVisibility(View.GONE);
        layoutCropControls.setVisibility(View.GONE);
        if (cropEditingBitmap != null && !cropEditingBitmap.isRecycled()) {
            cropEditingBitmap.recycle();
            cropEditingBitmap = null;
        }
        switchToReview();
    }

    private void movePage(int delta) {
        int target = selectedIndex + delta;
        if (target < 0 || target >= pages.size()) return;
        ScannedPage moved = pages.remove(selectedIndex);
        pages.add(target, moved);
        selectedIndex = target;
        lastSavedKind = null;
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
            label.setText(String.format(Locale.US, "صفحة %d (Scan_%03d.jpg) • %.1f KB • %d°",
                i + 1, i + 1, p.processedBytes.length / 1024f, p.rotationDeg));
            label.setPadding(0, 12, 0, 8);
            container.addView(label);

            ImageView img = new ImageView(this);
            img.setAdjustViewBounds(true);
            img.setImageBitmap(BitmapFactory.decodeByteArray(p.processedBytes, 0, p.processedBytes.length));
            container.addView(img);
        }
        scroll.addView(container);

        new AlertDialog.Builder(this)
            .setTitle("معاينة المستند (" + pages.size() + " صفحات)")
            .setView(scroll)
            .setPositiveButton("إغلاق", null)
            .show();
    }

    private void deleteCurrentPage() {
        if (pages.isEmpty()) return;
        ScannedPage removed = pages.remove(selectedIndex);
        deletePageTempFiles(removed);
        lastSavedKind = null;
        if (pages.isEmpty()) {
            switchToCapture();
        } else {
            selectedIndex = Math.min(selectedIndex, pages.size() - 1);
            updateReviewPreview();
        }
    }

    private void switchToCapture() {
        currentStep = STEP_CAPTURE;
        ivPreview.setVisibility(View.GONE);
        cropOverlayView.setVisibility(View.GONE);
        scrollExportStage.setVisibility(View.GONE);
        surfaceView.setVisibility(View.VISIBLE);
        scannerOverlayView.setVisibility(View.VISIBLE);

        layoutReviewControls.setVisibility(View.GONE);
        layoutCropControls.setVisibility(View.GONE);
        layoutExportFooter.setVisibility(View.GONE);
        layoutCameraControls.setVisibility(View.VISIBLE);
        btnModeToggle.setVisibility(View.VISIBLE);

        tvTitle.setText("1. التصوير وتجميع المستندات");
        updateCaptureCounter();
        updateStepIndicator();
        updateCameraStatusHint(false, false, false);
        openCamera();
    }

    private void switchToReview() {
        if (pages.isEmpty()) {
            switchToCapture();
            return;
        }
        currentStep = STEP_REVIEW;
        releaseCamera();
        surfaceView.setVisibility(View.GONE);
        scannerOverlayView.setVisibility(View.GONE);
        cropOverlayView.setVisibility(View.GONE);
        scrollExportStage.setVisibility(View.GONE);
        ivPreview.setVisibility(View.VISIBLE);
        tvStabilityHint.setVisibility(View.GONE);
        btnModeToggle.setVisibility(View.INVISIBLE);

        layoutCameraControls.setVisibility(View.GONE);
        layoutCropControls.setVisibility(View.GONE);
        layoutExportFooter.setVisibility(View.GONE);
        layoutReviewControls.setVisibility(View.VISIBLE);
        updateStepIndicator();
        updateReviewPreview();
    }

    private void switchToExport() {
        if (pages.isEmpty()) return;
        currentStep = STEP_EXPORT;
        releaseCamera();
        surfaceView.setVisibility(View.GONE);
        scannerOverlayView.setVisibility(View.GONE);
        cropOverlayView.setVisibility(View.GONE);
        ivPreview.setVisibility(View.GONE);
        tvStabilityHint.setVisibility(View.GONE);
        btnModeToggle.setVisibility(View.INVISIBLE);

        layoutCameraControls.setVisibility(View.GONE);
        layoutCropControls.setVisibility(View.GONE);
        layoutReviewControls.setVisibility(View.GONE);
        scrollExportStage.setVisibility(View.VISIBLE);
        layoutExportFooter.setVisibility(View.VISIBLE);

        long totalBytes = 0L;
        for (ScannedPage p : pages) {
            totalBytes += p.processedBytes.length;
        }
        tvTitle.setText("3. الحفظ والتصدير (" + pages.size() + " صفحات)");
        tvExportSummary.setText(String.format(Locale.US,
            "الصفحات الجاهزة للحفظ: %d صفحة (الحجم الحالي للصور: %.1f KB)",
            pages.size(), totalBytes / 1024f));
        updateExportPostSaveUI();
        updateStepIndicator();
    }

    private void updateExportPostSaveUI() {
        if (lastSavedKind == null) {
            layoutExportOptions.setVisibility(View.VISIBLE);
            layoutPostSavePanel.setVisibility(View.GONE);
        } else {
            layoutExportOptions.setVisibility(View.GONE);
            layoutPostSavePanel.setVisibility(View.VISIBLE);
            btnExportOtherFormat.setText("images".equals(lastSavedKind)
                ? "تصدير كملف PDF موحد أيضاً"
                : "حفظ الصور في المعرض أيضاً");
        }
    }

    private void updateCaptureCounter() {
        btnOpenReview.setText("التالي (" + pages.size() + ")");
        btnOpenReview.setEnabled(!pages.isEmpty());
    }

    private void updateStepIndicator() {
        int active = currentStep == STEP_CROP ? STEP_REVIEW : currentStep;
        styleStepBtn(btnStepCapture, active == STEP_CAPTURE);
        styleStepBtn(btnStepReview, active == STEP_REVIEW);
        styleStepBtn(btnStepExport, active == STEP_EXPORT);
        btnStepReview.setEnabled(!pages.isEmpty());
        btnStepExport.setEnabled(!pages.isEmpty());
    }

    private void styleStepBtn(Button b, boolean active) {
        b.setBackgroundResource(active ? R.drawable.bg_share_button : R.drawable.bg_icon_box);
        b.setTextColor(active ? Color.parseColor("#09183B") : Color.WHITE);
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
        tvBrightnessValue.setText(cur.brightnessAdjust == 0 ? "تلقائي"
            : (cur.brightnessAdjust > 0 ? "+" + cur.brightnessAdjust : String.valueOf(cur.brightnessAdjust)));

        updateFilterButtonStyles(cur.filterMode);
    }

    private void updateFilterButtonStyles(int mode) {
        btnFilterColor.setBackgroundResource(mode == DocumentScannerEngine.FILTER_ORIGINAL_COLOR
            ? R.drawable.bg_share_button : R.drawable.bg_icon_box);
        btnFilterColor.setTextColor(mode == DocumentScannerEngine.FILTER_ORIGINAL_COLOR
            ? Color.parseColor("#09183B") : Color.WHITE);
        btnFilterColor.setText(mode == DocumentScannerEngine.FILTER_ORIGINAL_COLOR ? "ألوان أصلية ✓" : "ألوان أصلية");

        btnFilterGray.setBackgroundResource(mode == DocumentScannerEngine.FILTER_GRAYSCALE
            ? R.drawable.bg_share_button : R.drawable.bg_icon_box);
        btnFilterGray.setTextColor(mode == DocumentScannerEngine.FILTER_GRAYSCALE
            ? Color.parseColor("#09183B") : Color.WHITE);
        btnFilterGray.setText(mode == DocumentScannerEngine.FILTER_GRAYSCALE ? "تدرج رمادي ✓" : "تدرج رمادي");

        btnFilterBw.setBackgroundResource(mode == DocumentScannerEngine.FILTER_BLACK_WHITE
            ? R.drawable.bg_share_button : R.drawable.bg_icon_box);
        btnFilterBw.setTextColor(mode == DocumentScannerEngine.FILTER_BLACK_WHITE
            ? Color.parseColor("#09183B") : Color.WHITE);
        btnFilterBw.setText(mode == DocumentScannerEngine.FILTER_BLACK_WHITE ? "أبيض وأسود ✓" : "أبيض وأسود");
    }

    // ==================== المرحلة 3 أ: حفظ الصور منفردة في معرض الهاتف (< 500 KB) ====================
    private void saveImagesOnly() {
        if (pages.isEmpty()) return;
        btnSaveImagesOnly.setEnabled(false);
        btnSavePdfOnly.setEnabled(false);

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    Uri firstImageUri = null;
                    long maxImgBytes = 0L;
                    for (int i = 0; i < pages.size(); i++) {
                        ScannedPage page = pages.get(i);
                        byte[] bytesToSave = ensureImageUnder500KB(page.processedBytes);
                        maxImgBytes = Math.max(maxImgBytes, bytesToSave.length);
                        String name = String.format(Locale.US, "Scan_%03d.jpg", i + 1);
                        Uri saved = saveImageGallery(bytesToSave, name);
                        if (firstImageUri == null) firstImageUri = saved;
                    }

                    final Uri resultUri = firstImageUri;
                    final String maxKb = String.format(Locale.US, "%.1f", maxImgBytes / 1024f);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            btnSaveImagesOnly.setEnabled(true);
                            btnSavePdfOnly.setEnabled(true);
                            lastSavedKind = "images";
                            lastSavedUri = resultUri;
                            lastSavedMimeType = "image/jpeg";
                            tvPostSaveTitle.setText("✓ تم حفظ الصور بالمعرض بنجاح");
                            tvPostSaveDetails.setText("عدد الصفحات: " + pages.size()
                                + " صورة • أقصى حجم: " + maxKb + " KB (< 500 KB)\nمكان الحفظ: Pictures/ManzomaLawyer (معرض الصور)");
                            updateExportPostSaveUI();
                        }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            btnSaveImagesOnly.setEnabled(true);
                            btnSavePdfOnly.setEnabled(true);
                            Toast.makeText(DocumentScannerActivity.this,
                                "فشل حفظ الصور: " + e.getMessage(),
                                Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        }).start();
    }

    private byte[] ensureImageUnder500KB(byte[] currentBytes) throws Exception {
        // إذا كانت الصورة أقل من 500 KB بالفعل، نحفظها مباشرة دون إعادة معالجة غير ضرورية
        if (currentBytes.length < STRICT_500KB) {
            return currentBytes;
        }
        Bitmap bmp = BitmapFactory.decodeByteArray(currentBytes, 0, currentBytes.length);
        if (bmp == null) throw new Exception("تعذر قراءة الصورة للحفظ");
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        int quality = 80;
        bmp.compress(Bitmap.CompressFormat.JPEG, quality, baos);
        int tries = 0;
        while (baos.toByteArray().length >= STRICT_500KB && tries < 6) {
            tries++;
            quality = Math.max(55, quality - 5);
            baos.reset();
            bmp.compress(Bitmap.CompressFormat.JPEG, quality, baos);
        }
        bmp.recycle();
        byte[] out = baos.toByteArray();
        if (out.length >= STRICT_500KB) {
            throw new Exception("تجاوزت صورة حجم 500 KB");
        }
        return out;
    }

    // ==================== المرحلة 3 ب: حفظ ملف PDF واحد لجميع الصفحات (< 500 KB أو موافقة صريحة) ====================
    private void savePdfOnly(final boolean allowOversized) {
        if (pages.isEmpty()) return;
        btnSaveImagesOnly.setEnabled(false);
        btnSavePdfOnly.setEnabled(false);

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
                                btnSaveImagesOnly.setEnabled(true);
                                btnSavePdfOnly.setEnabled(true);
                                new AlertDialog.Builder(DocumentScannerActivity.this)
                                    .setTitle("تنبيه حجم ملف PDF")
                                    .setMessage("تعذر تقليص ملف Scanned_Document.pdf لأقل من 500 KB دون الإضرار بوضوح الكتابة والأختام.\nالحجم الفعلي: " + sizeKb + " KB\nهل توافق على الحفظ بهذا الحجم؟")
                                    .setNegativeButton("إلغاء والعودة", null)
                                    .setPositiveButton("نعم، حفظ ملف PDF", new DialogInterface.OnClickListener() {
                                        @Override
                                        public void onClick(DialogInterface dialog, int which) {
                                            savePdfOnly(true);
                                        }
                                    }).show();
                            }
                        });
                        return;
                    }

                    final Uri savedUri = savePdfDownloads(pdfBytes, "Scanned_Document.pdf");
                    final String pdfKb = String.format(Locale.US, "%.1f", pdfBytes.length / 1024f);

                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            btnSaveImagesOnly.setEnabled(true);
                            btnSavePdfOnly.setEnabled(true);
                            lastSavedKind = "pdf";
                            lastSavedUri = savedUri;
                            lastSavedMimeType = "application/pdf";
                            tvPostSaveTitle.setText("✓ تم حفظ ملف PDF بنجاح");
                            tvPostSaveDetails.setText("Scanned_Document.pdf • " + pages.size()
                                + " صفحات • " + pdfKb + " KB\nمكان الحفظ: مجلد التنزيلات (Downloads)");
                            updateExportPostSaveUI();
                        }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            btnSaveImagesOnly.setEnabled(true);
                            btnSavePdfOnly.setEnabled(true);
                            Toast.makeText(DocumentScannerActivity.this,
                                "فشل حفظ PDF: " + e.getMessage(),
                                Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        }).start();
    }

    private void openLastSavedFile() {
        if (lastSavedUri == null) {
            Toast.makeText(this, "الملف محفوظ في معرض الصور / مجلد التنزيلات", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            Intent viewIntent = new Intent(Intent.ACTION_VIEW);
            viewIntent.setDataAndType(lastSavedUri, lastSavedMimeType != null ? lastSavedMimeType : "*/*");
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(viewIntent);
        } catch (Exception e) {
            Toast.makeText(this, "لا يوجد تطبيق مثبّت لفتح هذا النوع مباشرة، تجد الملف في مجلد الحفظ", Toast.LENGTH_LONG).show();
        }
    }

    private void startNewScanSession() {
        cleanupAllTempFiles();
        selectedIndex = 0;
        retakeIndex = -1;
        lastSavedKind = null;
        lastSavedUri = null;
        lastSavedMimeType = null;
        showEditDrawer = false;
        layoutEditToolsDrawer.setVisibility(View.GONE);
        switchToCapture();
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

    private Bitmap scaleMaxDim(Bitmap src, int maxDim) {
        int max = Math.max(src.getWidth(), src.getHeight());
        if (max <= maxDim) return src;
        float r = (float) maxDim / max;
        return Bitmap.createScaledBitmap(src, Math.round(src.getWidth() * r), Math.round(src.getHeight() * r), true);
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

    private Uri saveImageGallery(byte[] bytes, String fileName) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver r = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
            v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            v.put("relative_path", Environment.DIRECTORY_PICTURES + "/ManzomaLawyer");
            Uri u = r.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (u != null) {
                java.io.OutputStream os = r.openOutputStream(u);
                if (os != null) { os.write(bytes); os.flush(); os.close(); return u; }
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
        return null;
    }

    private Uri savePdfDownloads(byte[] bytes, String fileName) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver r = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            v.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
            v.put("relative_path", Environment.DIRECTORY_DOWNLOADS);
            Uri u = r.insert(Uri.parse("content://media/external/downloads"), v);
            if (u != null) {
                java.io.OutputStream os = r.openOutputStream(u);
                if (os != null) { os.write(bytes); os.flush(); os.close(); return u; }
            }
        }
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (!dir.exists()) dir.mkdirs();
        File target = new File(dir, fileName);
        FileOutputStream fos = new FileOutputStream(target);
        fos.write(bytes);
        fos.flush();
        fos.close();
        return null;
    }

    private void deletePageTempFiles(ScannedPage p) {
        if (p == null) return;
        if (p.originalTempFile != null && p.originalTempFile.exists()) p.originalTempFile.delete();
        if (p.processedTempFile != null && p.processedTempFile.exists()) p.processedTempFile.delete();
    }

    private void cleanupAllTempFiles() {
        for (ScannedPage p : pages) {
            deletePageTempFiles(p);
        }
        pages.clear();
    }

    @Override
    protected void onDestroy() {
        releaseCamera();
        if (cropEditingBitmap != null && !cropEditingBitmap.isRecycled()) {
            cropEditingBitmap.recycle();
            cropEditingBitmap = null;
        }
        cleanupAllTempFiles();
        super.onDestroy();
    }
}
