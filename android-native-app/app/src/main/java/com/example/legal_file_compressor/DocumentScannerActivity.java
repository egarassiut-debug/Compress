package com.example.legal_file_compressor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.pdf.PdfRenderer;
import android.hardware.Camera;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * خدمة تصوير ومسح المستندات المستقلة لتطبيق «ضغطة» (100% أوفلاين - Android Native):
 * - إدارة ذاكرة محكمة: تخزين الصفحات على القرص + فك عينات مصغرة للمراجعة والمعاينة
 * - أوضاع المسح المعتمدة: فردي، دفعة، الكتب (صفحة واحدة)، بطاقات الهوية، قراءة QR والباركود (ZXing Core)
 * - قص يدوي مع عدسة تكبير دقيقة (2.8x)، تدوير، فلاتر قانونية، توقيع إلكتروني محلي، طابع زمني بمعاينة، HD، فلاش، وإعدادات ومساعدة
 */
@SuppressWarnings("deprecation")
public class DocumentScannerActivity extends Activity implements SurfaceHolder.Callback {

    private static final String PREFS_NAME = "daghta_scanner_prefs";
    private static final String PREF_AUTO_CAPTURE = "auto_capture";
    private static final String PREF_DEFAULT_FILTER = "default_filter";
    private static final String PREF_DEFAULT_HD = "default_hd";
    private static final String PREF_CROP_ON_MISS = "crop_on_miss";

    private static final int STRICT_500KB = 500 * 1024;
    private static final int SAFE_TARGET_BYTES = 485 * 1024;
    private static final int MAX_DIM_STANDARD = 1550;
    private static final int MAX_DIM_HD = 2200;

    private static final int REQ_CAMERA_PERM = 301;
    private static final int REQ_IMPORT_IMAGES = 302;
    private static final int REQ_IMPORT_FILES = 303;

    private static final int STEP_CAPTURE = 0;
    private static final int STEP_REVIEW = 1;
    private static final int STEP_EXPORT = 2;
    private static final int STEP_CROP = 3;
    private static final int STEP_SIGN_DRAW = 4;
    private static final int STEP_SIGN_PLACE = 5;
    private static final int STEP_TIMESTAMP = 6;

    private static final int TS_CORNER_BR = 0;
    private static final int TS_CORNER_BL = 1;
    private static final int TS_CORNER_TR = 2;

    private static class ScannedPage {
        File originalTempFile;
        File processedTempFile;
        long processedSizeBytes = 0L;
        float[] corners = DocumentScannerEngine.defaultGuideCorners();
        boolean autoDetected = false;
        int rotationDeg = 0;
        int filterMode = DocumentScannerEngine.FILTER_ORIGINAL_COLOR;
        int brightnessAdjust = 0;
        int scanMode = DocumentScannerEngine.SCAN_MODE_SINGLE;
    }

    private Camera camera;
    private int activePreviewW = 0;
    private int activePreviewH = 0;
    private boolean surfaceReady = false;

    private FrameLayout stageContainer;
    private SurfaceView surfaceView;
    private SurfaceHolder surfaceHolder;
    private ScannerOverlayView scannerOverlayView;
    private ImageView ivPreview;
    private CropOverlayView cropOverlayView;
    private SignaturePlacementView signaturePlacementView;
    private View signaturePadPanel;
    private SignaturePadView signaturePadView;
    private TextView tvTitle;
    private TextView tvStabilityHint;
    private View qrResultCard;
    private TextView tvQrFormat;
    private TextView tvQrContent;
    private TextView tvQrKindHint;
    private Button btnQrCopy;
    private Button btnQrRescan;

    private Button btnBack;
    private Button btnFlashToggle;
    private Button btnHdToggle;
    private Button btnHelpGuide;
    private Button btnMoreSettings;

    private View layoutCameraControls;
    private View layoutCropControls;
    private View layoutSigDrawControls;
    private View layoutSigPlaceControls;
    private View layoutTimestampControls;
    private View layoutReviewControls;
    private View layoutEditToolsDrawer;
    private ScrollView scrollExportStage;
    private View layoutExportFooter;
    private View layoutExportOptions;
    private View layoutPostSavePanel;

    private Button btnModeSingle;
    private Button btnModeBatch;
    private Button btnModeBook;
    private Button btnModeIdCard;
    private Button btnModeQr;
    private Button btnAllFeatures;
    private Button btnImportImages;
    private Button btnCapture;
    private Button btnImportFiles;
    private Button btnOpenReview;

    private Button btnCropAutoDetect;
    private Button btnCropResetFull;
    private Button btnCropCancel;
    private Button btnCropApply;

    private Button btnSigInkBlue;
    private Button btnSigInkBlack;
    private Button btnSigInkRed;
    private Button btnSigUndo;
    private Button btnSigClear;
    private Button btnSigDrawCancel;
    private Button btnSigDrawNext;
    private SeekBar seekSignatureSize;
    private Button btnSigPlaceCancel;
    private Button btnSigPlaceApply;

    private Button btnTsPosBr;
    private Button btnTsPosBl;
    private Button btnTsPosTr;
    private Button btnTsToggleTime;
    private Button btnTsCancel;
    private Button btnTsApply;

    private Button btnPrevPage;
    private Button btnNextPage;
    private Button btnMovePrev;
    private Button btnMoveNext;
    private Button btnFullPreview;
    private Button btnDelete;
    private Button btnManualCrop;
    private Button btnRotateRight90;
    private Button btnOpenSignature;
    private Button btnOpenTimestamp;
    private Button btnToggleEditTools;
    private Button btnFilterColor;
    private Button btnFilterNatural;
    private Button btnFilterGray;
    private Button btnFilterBw;
    private Button btnBrightnessDown;
    private TextView tvBrightnessValue;
    private Button btnBrightnessUp;
    private Button btnAddMore;
    private Button btnRetake;
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

    private SharedPreferences prefs;
    private boolean autoCaptureEnabled = true;
    private int defaultFilterMode = DocumentScannerEngine.FILTER_ORIGINAL_COLOR;
    private boolean isHdEnabled = false;
    private boolean promptCropOnMiss = true;

    private int activeScanMode = DocumentScannerEngine.SCAN_MODE_SINGLE;
    private boolean isFlashOn = false;
    private boolean showEditDrawer = false;
    private int currentStep = STEP_CAPTURE;

    private volatile boolean isCapturing = false;
    private volatile boolean isBusyProcessing = false;
    private volatile boolean isAnalyzingFrame = false;
    private int selectedIndex = 0;
    private int retakeIndex = -1;

    private Bitmap currentDisplayBitmap;
    private Bitmap cropEditingBitmap;
    private Bitmap pendingSignatureBitmap;
    private Bitmap timestampPreviewBaseBitmap;
    private Bitmap timestampPreviewWorkingBitmap;
    private int timestampCorner = TS_CORNER_BR;
    private boolean timestampIncludeTime = true;
    private String lastDecodedQrText = null;
    private boolean qrPausedAfterMatch = false;

    private volatile Uri lastSavedUri;
    private String lastSavedMimeType;
    private volatile String lastSavedKind;

    private byte[] prevSampleFrame;
    private int stableStreak = 0;
    private long lastFrameCheckMs = 0L;
    private long lastAutoShotMs = 0L;
    private long heavyShakeSinceMs = 0L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ScannerOfflineCodeReader offlineCodeReader = new ScannerOfflineCodeReader();
    private final List<ScannedPage> pages = new ArrayList<ScannedPage>();
    private final ExecutorService workerExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService previewExecutor = Executors.newSingleThreadExecutor();

    private boolean isActivityUnavailable() {
        return isFinishing() || (Build.VERSION.SDK_INT >= 17 && isDestroyed());
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_document_scanner);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        autoCaptureEnabled = prefs.getBoolean(PREF_AUTO_CAPTURE, true);
        defaultFilterMode = prefs.getInt(PREF_DEFAULT_FILTER, DocumentScannerEngine.FILTER_ORIGINAL_COLOR);
        isHdEnabled = prefs.getBoolean(PREF_DEFAULT_HD, false);
        promptCropOnMiss = prefs.getBoolean(PREF_CROP_ON_MISS, true);

        bindViews();
        wireListeners();
        updateHdUi();
        updateFlashUi();
        updateModeChipsUi();
        updateCaptureCounter();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            checkSelfPermission("android.permission.CAMERA") != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.CAMERA"}, REQ_CAMERA_PERM);
        }
    }

    private void bindViews() {
        stageContainer = (FrameLayout) findViewById(R.id.scanner_stage_container);
        surfaceView = (SurfaceView) findViewById(R.id.camera_surface);
        scannerOverlayView = (ScannerOverlayView) findViewById(R.id.scanner_overlay_view);
        ivPreview = (ImageView) findViewById(R.id.iv_review_preview);
        cropOverlayView = (CropOverlayView) findViewById(R.id.crop_overlay_view);
        signaturePlacementView = (SignaturePlacementView) findViewById(R.id.signature_placement_view);
        signaturePadPanel = findViewById(R.id.signature_pad_panel);
        signaturePadView = (SignaturePadView) findViewById(R.id.signature_pad_view);
        tvTitle = (TextView) findViewById(R.id.tv_scanner_title);
        tvStabilityHint = (TextView) findViewById(R.id.tv_stability_hint);
        qrResultCard = findViewById(R.id.qr_result_card);
        tvQrFormat = (TextView) findViewById(R.id.tv_qr_format);
        tvQrContent = (TextView) findViewById(R.id.tv_qr_content);
        tvQrKindHint = (TextView) findViewById(R.id.tv_qr_kind_hint);
        btnQrCopy = (Button) findViewById(R.id.btn_qr_copy);
        btnQrRescan = (Button) findViewById(R.id.btn_qr_rescan);

        btnBack = (Button) findViewById(R.id.btn_scanner_back);
        btnFlashToggle = (Button) findViewById(R.id.btn_flash_toggle);
        btnHdToggle = (Button) findViewById(R.id.btn_hd_toggle);
        btnHelpGuide = (Button) findViewById(R.id.btn_help_guide);
        btnMoreSettings = (Button) findViewById(R.id.btn_more_settings);

        layoutCameraControls = findViewById(R.id.layout_camera_controls);
        layoutCropControls = findViewById(R.id.layout_crop_controls);
        layoutSigDrawControls = findViewById(R.id.layout_signature_draw_controls);
        layoutSigPlaceControls = findViewById(R.id.layout_signature_place_controls);
        layoutTimestampControls = findViewById(R.id.layout_timestamp_controls);
        layoutReviewControls = findViewById(R.id.layout_review_controls);
        layoutEditToolsDrawer = findViewById(R.id.layout_edit_tools_drawer);
        scrollExportStage = (ScrollView) findViewById(R.id.scroll_export_stage);
        layoutExportFooter = findViewById(R.id.layout_export_footer);
        layoutExportOptions = findViewById(R.id.layout_export_options);
        layoutPostSavePanel = findViewById(R.id.layout_post_save_panel);

        btnModeSingle = (Button) findViewById(R.id.btn_mode_single);
        btnModeBatch = (Button) findViewById(R.id.btn_mode_batch);
        btnModeBook = (Button) findViewById(R.id.btn_mode_book);
        btnModeIdCard = (Button) findViewById(R.id.btn_mode_id_card);
        btnModeQr = (Button) findViewById(R.id.btn_mode_qr);
        btnAllFeatures = (Button) findViewById(R.id.btn_all_features);
        btnImportImages = (Button) findViewById(R.id.btn_import_images);
        btnCapture = (Button) findViewById(R.id.btn_capture_page);
        btnImportFiles = (Button) findViewById(R.id.btn_import_files);
        btnOpenReview = (Button) findViewById(R.id.btn_open_review);

        btnCropAutoDetect = (Button) findViewById(R.id.btn_crop_auto_detect);
        btnCropResetFull = (Button) findViewById(R.id.btn_crop_reset_full);
        btnCropCancel = (Button) findViewById(R.id.btn_crop_cancel);
        btnCropApply = (Button) findViewById(R.id.btn_crop_apply);

        btnSigInkBlue = (Button) findViewById(R.id.btn_sig_ink_blue);
        btnSigInkBlack = (Button) findViewById(R.id.btn_sig_ink_black);
        btnSigInkRed = (Button) findViewById(R.id.btn_sig_ink_red);
        btnSigUndo = (Button) findViewById(R.id.btn_sig_undo);
        btnSigClear = (Button) findViewById(R.id.btn_sig_clear);
        btnSigDrawCancel = (Button) findViewById(R.id.btn_sig_draw_cancel);
        btnSigDrawNext = (Button) findViewById(R.id.btn_sig_draw_next);
        seekSignatureSize = (SeekBar) findViewById(R.id.seek_signature_size);
        btnSigPlaceCancel = (Button) findViewById(R.id.btn_sig_place_cancel);
        btnSigPlaceApply = (Button) findViewById(R.id.btn_sig_place_apply);

        btnTsPosBr = (Button) findViewById(R.id.btn_ts_pos_br);
        btnTsPosBl = (Button) findViewById(R.id.btn_ts_pos_bl);
        btnTsPosTr = (Button) findViewById(R.id.btn_ts_pos_tr);
        btnTsToggleTime = (Button) findViewById(R.id.btn_ts_toggle_time);
        btnTsCancel = (Button) findViewById(R.id.btn_ts_cancel);
        btnTsApply = (Button) findViewById(R.id.btn_ts_apply);

        btnPrevPage = (Button) findViewById(R.id.btn_prev_page);
        btnNextPage = (Button) findViewById(R.id.btn_next_page);
        btnMovePrev = (Button) findViewById(R.id.btn_move_prev);
        btnMoveNext = (Button) findViewById(R.id.btn_move_next);
        btnFullPreview = (Button) findViewById(R.id.btn_full_preview);
        btnDelete = (Button) findViewById(R.id.btn_delete_page);
        btnManualCrop = (Button) findViewById(R.id.btn_manual_crop);
        btnRotateRight90 = (Button) findViewById(R.id.btn_rotate_right_90);
        btnOpenSignature = (Button) findViewById(R.id.btn_open_signature);
        btnOpenTimestamp = (Button) findViewById(R.id.btn_open_timestamp);
        btnToggleEditTools = (Button) findViewById(R.id.btn_toggle_edit_tools);
        btnFilterColor = (Button) findViewById(R.id.btn_filter_color);
        btnFilterNatural = (Button) findViewById(R.id.btn_filter_natural);
        btnFilterGray = (Button) findViewById(R.id.btn_filter_gray);
        btnFilterBw = (Button) findViewById(R.id.btn_filter_bw);
        btnBrightnessDown = (Button) findViewById(R.id.btn_brightness_down);
        tvBrightnessValue = (TextView) findViewById(R.id.tv_brightness_value);
        btnBrightnessUp = (Button) findViewById(R.id.btn_brightness_up);
        btnAddMore = (Button) findViewById(R.id.btn_add_more_pages);
        btnRetake = (Button) findViewById(R.id.btn_retake_page);
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
    }

    private void wireListeners() {
        btnBack.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                handleBackNavigation();
            }
        });

        btnFlashToggle.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                toggleFlash();
            }
        });

        btnHdToggle.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                isHdEnabled = !isHdEnabled;
                updateHdUi();
                Toast.makeText(DocumentScannerActivity.this,
                    isHdEnabled ? "تم تفعيل جودة HD للدقة العالية" : "وضع الجودة المتوازنة السريعة",
                    Toast.LENGTH_SHORT).show();
            }
        });

        btnHelpGuide.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showHelpDialog();
            }
        });

        btnMoreSettings.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showSettingsDialog();
            }
        });

        btnModeSingle.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                selectCameraMode(DocumentScannerEngine.SCAN_MODE_SINGLE);
            }
        });
        btnModeBatch.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                selectCameraMode(DocumentScannerEngine.SCAN_MODE_BATCH);
            }
        });
        btnModeBook.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                selectCameraMode(DocumentScannerEngine.SCAN_MODE_BOOK);
            }
        });
        btnModeIdCard.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                selectCameraMode(DocumentScannerEngine.SCAN_MODE_ID_CARD);
            }
        });
        btnModeQr.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                selectCameraMode(DocumentScannerEngine.SCAN_MODE_QR);
            }
        });

        btnAllFeatures.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showAllFeaturesDialog();
            }
        });

        btnImportImages.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openGalleryImagePicker();
            }
        });

        btnImportFiles.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openDocumentFilePicker();
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

        btnQrCopy.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (lastDecodedQrText != null && !lastDecodedQrText.isEmpty()) {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) {
                        cm.setPrimaryClip(ClipData.newPlainText("QR_Content", lastDecodedQrText));
                        Toast.makeText(DocumentScannerActivity.this, "تم نسخ المحتوى إلى الحافظة", Toast.LENGTH_SHORT).show();
                    }
                }
            }
        });

        btnQrRescan.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                lastDecodedQrText = null;
                qrPausedAfterMatch = false;
                qrResultCard.setVisibility(View.GONE);
                updateCameraStatusHint(false, false, false);
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

        btnDelete.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                deleteCurrentPage();
            }
        });

        btnManualCrop.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openManualCrop(selectedIndex);
            }
        });

        btnRotateRight90.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                rotateCurrentPage90(90);
            }
        });

        btnOpenSignature.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openSignatureDrawStep();
            }
        });

        btnOpenTimestamp.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openTimestampPreviewStep();
            }
        });

        btnToggleEditTools.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showEditDrawer = !showEditDrawer;
                layoutEditToolsDrawer.setVisibility(showEditDrawer ? View.VISIBLE : View.GONE);
                btnToggleEditTools.setText(showEditDrawer ? "إخفاء ▼" : "التحسين ▲");
            }
        });

        btnFilterColor.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                changeCurrentFilterMode(DocumentScannerEngine.FILTER_ORIGINAL_COLOR);
            }
        });
        btnFilterNatural.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                changeCurrentFilterMode(DocumentScannerEngine.FILTER_NATURAL);
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

        btnAddMore.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                retakeIndex = -1;
                switchToCapture();
            }
        });
        btnRetake.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                retakeIndex = selectedIndex;
                switchToCapture();
            }
        });

        btnGoToExport.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!pages.isEmpty()) switchToExport();
            }
        });

        // القص اليدوي
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

        // رسم التوقيع وتحريكه
        btnSigInkBlue.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                selectSignatureInk(Color.parseColor("#1D4ED8"), btnSigInkBlue, "أزرق");
            }
        });
        btnSigInkBlack.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                selectSignatureInk(Color.parseColor("#0F172A"), btnSigInkBlack, "أسود");
            }
        });
        btnSigInkRed.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                selectSignatureInk(Color.parseColor("#B91C1C"), btnSigInkRed, "أحمر");
            }
        });
        btnSigUndo.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                signaturePadView.undoLastStroke();
            }
        });
        btnSigClear.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                signaturePadView.clear();
            }
        });
        btnSigDrawCancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                switchToReview();
            }
        });
        btnSigDrawNext.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                proceedToSignaturePlacement();
            }
        });

        seekSignatureSize.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser) {
                    float frac = 0.10f + (progress / 100f);
                    signaturePlacementView.setWidthFraction(frac);
                }
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) {}
            @Override public void onStopTrackingTouch(SeekBar seekBar) {}
        });
        btnSigPlaceCancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                releaseSignatureTempBitmaps();
                switchToReview();
            }
        });
        btnSigPlaceApply.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                applySignatureToCurrentPage();
            }
        });

        // الطابع الزمني بمعاينة
        btnTsPosBr.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                timestampCorner = TS_CORNER_BR;
                refreshTimestampPreview();
            }
        });
        btnTsPosBl.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                timestampCorner = TS_CORNER_BL;
                refreshTimestampPreview();
            }
        });
        btnTsPosTr.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                timestampCorner = TS_CORNER_TR;
                refreshTimestampPreview();
            }
        });
        btnTsToggleTime.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                timestampIncludeTime = !timestampIncludeTime;
                btnTsToggleTime.setText(timestampIncludeTime ? "تاريخ + وقت" : "تاريخ فقط");
                refreshTimestampPreview();
            }
        });
        btnTsCancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                releaseTimestampPreviewBitmaps();
                switchToReview();
            }
        });
        btnTsApply.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                applyTimestampToCurrentPage();
            }
        });

        // التصدير
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
                if ("images".equals(lastSavedKind)) savePdfOnly(false);
                else saveImagesOnly();
            }
        });
        btnStartNewScan.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startNewScanSession();
            }
        });
    }

    @Override
    public void onBackPressed() {
        handleBackNavigation();
    }

    private void handleBackNavigation() {
        if (currentStep == STEP_CROP) {
            closeCropScreenToReview();
        } else if (currentStep == STEP_SIGN_DRAW || currentStep == STEP_SIGN_PLACE) {
            releaseSignatureTempBitmaps();
            switchToReview();
        } else if (currentStep == STEP_TIMESTAMP) {
            releaseTimestampPreviewBitmaps();
            switchToReview();
        } else if (currentStep == STEP_EXPORT) {
            switchToReview();
        } else if (currentStep == STEP_REVIEW) {
            switchToCapture();
        } else {
            finish();
        }
    }

    // ==================== دورة حياة النشاط والكاميرا المحصّنة ====================
    @Override
    protected void onResume() {
        super.onResume();
        if (currentStep == STEP_CAPTURE && surfaceReady) {
            openCamera();
        }
    }

    @Override
    protected void onPause() {
        releaseCamera();
        super.onPause();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA_PERM) {
            if (grantResults != null && grantResults.length > 0 &&
                grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                if (currentStep == STEP_CAPTURE && surfaceReady) {
                    openCamera();
                }
            } else {
                Toast.makeText(this, "يمكنك استيراد الصور والملفات مباشرة أو منح إذن الكاميرا للتصوير", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    public void surfaceCreated(SurfaceHolder holder) {
        surfaceReady = true;
        if (currentStep == STEP_CAPTURE) {
            openCamera();
        }
    }

    @Override
    public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
        if (currentStep == STEP_CAPTURE && camera != null) {
            try {
                camera.stopPreview();
                camera.setPreviewDisplay(holder);
                camera.startPreview();
            } catch (Exception ignored) {}
        }
    }

    @Override
    public void surfaceDestroyed(SurfaceHolder holder) {
        surfaceReady = false;
        releaseCamera();
    }

    private void openCamera() {
        if (isActivityUnavailable() || !surfaceReady) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            checkSelfPermission("android.permission.CAMERA") != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        releaseCamera();
        try {
            camera = Camera.open();
            if (camera == null) {
                Toast.makeText(this, "لم يتم العثور على كاميرا خلفية متاحة", Toast.LENGTH_LONG).show();
                return;
            }
            camera.setDisplayOrientation(90);

            Camera.Parameters params = camera.getParameters();
            List<String> focusModes = params.getSupportedFocusModes();
            if (focusModes != null && focusModes.contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE)) {
                params.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            } else if (focusModes != null && focusModes.contains(Camera.Parameters.FOCUS_MODE_AUTO)) {
                params.setFocusMode(Camera.Parameters.FOCUS_MODE_AUTO);
            }

            Camera.Size bestPic = chooseBestPictureSize(params.getSupportedPictureSizes(), isHdEnabled ? 3264 : 2400);
            if (bestPic != null) {
                params.setPictureSize(bestPic.width, bestPic.height);
            }
            float targetRatio = (bestPic != null && bestPic.height > 0)
                ? (bestPic.width / (float) bestPic.height)
                : (4f / 3f);

            Camera.Size bestPrev = chooseBestPreviewSize(params.getSupportedPreviewSizes(), targetRatio);
            if (bestPrev != null) {
                params.setPreviewSize(bestPrev.width, bestPrev.height);
                activePreviewW = bestPrev.width;
                activePreviewH = bestPrev.height;
            } else {
                Camera.Size cur = params.getPreviewSize();
                activePreviewW = cur != null ? cur.width : 1280;
                activePreviewH = cur != null ? cur.height : 720;
            }

            params.setRotation(90);
            try {
                camera.setParameters(params);
            } catch (Exception ignored) {
                Camera.Size fallback = camera.getParameters().getPreviewSize();
                if (fallback != null) {
                    activePreviewW = fallback.width;
                    activePreviewH = fallback.height;
                }
            }

            matchPreviewSurfaceAspect(activePreviewW, activePreviewH);

            final int capturedPrevW = activePreviewW;
            final int capturedPrevH = activePreviewH;
            camera.setPreviewDisplay(surfaceHolder);
            camera.setPreviewCallback(new Camera.PreviewCallback() {
                @Override
                public void onPreviewFrame(final byte[] data, Camera cam) {
                    if (currentStep != STEP_CAPTURE || isCapturing || isAnalyzingFrame || data == null) return;
                    if (activeScanMode == DocumentScannerEngine.SCAN_MODE_QR && qrPausedAfterMatch) return;
                    long now = System.currentTimeMillis();
                    long interval = (activeScanMode == DocumentScannerEngine.SCAN_MODE_QR) ? 180L : 240L;
                    if (now - lastFrameCheckMs < interval) return;
                    lastFrameCheckMs = now;

                    if (capturedPrevW <= 0 || capturedPrevH <= 0 || data.length < capturedPrevW * capturedPrevH) return;

                    isAnalyzingFrame = true;
                    final int yLen = capturedPrevW * capturedPrevH;
                    final byte[] yCopy = new byte[yLen];
                    System.arraycopy(data, 0, yCopy, 0, yLen);

                    if (!previewExecutor.isShutdown()) {
                        previewExecutor.execute(new Runnable() {
                            @Override
                            public void run() {
                                try {
                                    if (activeScanMode == DocumentScannerEngine.SCAN_MODE_QR) {
                                        analyzeQrPreviewFrame(yCopy, capturedPrevW, capturedPrevH);
                                    } else {
                                        analyzeDocumentPreviewFrame(yCopy, capturedPrevW, capturedPrevH);
                                    }
                                } catch (Throwable ignored) {
                                } finally {
                                    isAnalyzingFrame = false;
                                }
                            }
                        });
                    } else {
                        isAnalyzingFrame = false;
                    }
                }
            });
            camera.startPreview();
            if (isFlashOn) {
                applyFlashTorchState(true);
            }
        } catch (Exception e) {
            releaseCamera();
            Toast.makeText(this, "تعذر تشغيل الكاميرا — يمكنك استخدام الاستيراد من الاستوديو", Toast.LENGTH_LONG).show();
        }
    }

    private void matchPreviewSurfaceAspect(final int camW, final int camH) {
        if (camW <= 0 || camH <= 0) return;
        stageContainer.post(new Runnable() {
            @Override
            public void run() {
                if (isActivityUnavailable()) return;
                int cw = stageContainer.getWidth();
                int ch = stageContainer.getHeight();
                if (cw <= 0 || ch <= 0) return;
                // الكاميرا بوضع عمودي displayOrientation=90 لذا أبعاد العرض هي camH x camW
                float previewRatio = camH / (float) camW;
                int targetW = cw;
                int targetH = Math.round(cw / previewRatio);
                if (targetH > ch) {
                    targetH = ch;
                    targetW = Math.round(ch * previewRatio);
                }
                FrameLayout.LayoutParams lpSurf = new FrameLayout.LayoutParams(targetW, targetH, Gravity.CENTER);
                surfaceView.setLayoutParams(lpSurf);
                FrameLayout.LayoutParams lpOver = new FrameLayout.LayoutParams(targetW, targetH, Gravity.CENTER);
                scannerOverlayView.setLayoutParams(lpOver);
            }
        });
    }

    private Camera.Size chooseBestPictureSize(List<Camera.Size> sizes, int maxLongEdge) {
        if (sizes == null || sizes.isEmpty()) return null;
        Camera.Size best = sizes.get(0);
        int bestPixels = 0;
        for (Camera.Size s : sizes) {
            int maxDim = Math.max(s.width, s.height);
            int px = s.width * s.height;
            if (maxDim <= maxLongEdge && px > bestPixels) {
                bestPixels = px;
                best = s;
            }
        }
        return best;
    }

    private Camera.Size chooseBestPreviewSize(List<Camera.Size> sizes, float targetRatio) {
        if (sizes == null || sizes.isEmpty()) return null;
        Camera.Size best = null;
        double minScore = Double.MAX_VALUE;
        for (Camera.Size s : sizes) {
            int maxDim = Math.max(s.width, s.height);
            if (maxDim > 1920 || maxDim < 480) continue;
            float ratio = s.width / (float) Math.max(1, s.height);
            double ratioDiff = Math.abs(ratio - targetRatio);
            double resPenalty = Math.abs(maxDim - 1280) / 4000.0;
            double score = ratioDiff * 10.0 + resPenalty;
            if (score < minScore) {
                minScore = score;
                best = s;
            }
        }
        return best != null ? best : sizes.get(0);
    }

    private void releaseCamera() {
        if (camera != null) {
            try { camera.setPreviewCallback(null); } catch (Exception ignored) {}
            try { camera.stopPreview(); } catch (Exception ignored) {}
            try { camera.release(); } catch (Exception ignored) {}
            camera = null;
        }
        isCapturing = false;
        isAnalyzingFrame = false;
    }

    private void analyzeQrPreviewFrame(byte[] yPlane, int srcW, int srcH) {
        final ScannerOfflineCodeReader.CodeScanResult decoded =
            offlineCodeReader.decodeFromNv21(yPlane, srcW, srcH, 90);
        if (decoded == null) return;

        qrPausedAfterMatch = true;
        lastDecodedQrText = decoded.text;
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (isActivityUnavailable() || currentStep != STEP_CAPTURE ||
                    activeScanMode != DocumentScannerEngine.SCAN_MODE_QR) return;
                tvQrFormat.setText("✓ " + decoded.formatLabel);
                tvQrContent.setText(decoded.text);
                tvQrKindHint.setText(decoded.contentKindLabel);
                qrResultCard.setVisibility(View.VISIBLE);
                tvStabilityHint.setText("تمت قراءة الرمز بنجاح — يمكنك النسخ أو مسح رمز آخر");
                tvStabilityHint.setTextColor(Color.parseColor("#4ADE80"));
            }
        });
    }

    private void analyzeDocumentPreviewFrame(byte[] yPlane, int srcW, int srcH) {
        final int sampleW = 120;
        final int sampleH = 160;
        byte[] gray = DocumentScannerEngine.sampleGrayFromNv21(yPlane, srcW, srcH, 90, sampleW, sampleH);
        float stabilityDiff = DocumentScannerEngine.computeStabilityDiff(prevSampleFrame, gray);
        prevSampleFrame = gray;

        final DocumentScannerEngine.DetectionResult res =
            DocumentScannerEngine.detectDocumentQuad(gray, sampleW, sampleH, stabilityDiff, activeScanMode);

        final long now = System.currentTimeMillis();
        final boolean isShakingHeavy = stabilityDiff >= 13.5f;
        final boolean isCalm = stabilityDiff < 6.5f;
        final boolean isSharp = res.sharpness >= 6.8f;

        if (!res.detected) {
            heavyShakeSinceMs = 0L;
            stableStreak = 0;
        } else if (isShakingHeavy) {
            if (heavyShakeSinceMs == 0L) heavyShakeSinceMs = now;
            stableStreak = 0;
        } else {
            heavyShakeSinceMs = 0L;
            if (isCalm && isSharp) stableStreak++;
            else stableStreak = 0;
        }

        final boolean readyForAuto = autoCaptureEnabled
            && activeScanMode != DocumentScannerEngine.SCAN_MODE_QR
            && res.detected && isCalm && isSharp && stableStreak >= 3
            && (now - lastAutoShotMs > 2500L) && !isCapturing && !isBusyProcessing;
        if (readyForAuto) {
            lastAutoShotMs = now;
            stableStreak = 0;
        }

        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (isActivityUnavailable() || currentStep != STEP_CAPTURE ||
                    activeScanMode == DocumentScannerEngine.SCAN_MODE_QR) return;
                scannerOverlayView.updateDetection(res.corners, res.detected, isCalm && isSharp);
                updateCameraStatusHint(
                    res.detected,
                    isShakingHeavy && (heavyShakeSinceMs > 0 && now - heavyShakeSinceMs > 1200L),
                    isSharp
                );
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
        if (activeScanMode == DocumentScannerEngine.SCAN_MODE_QR) {
            tvStabilityHint.setText(qrPausedAfterMatch
                ? "تمت القراءة — النص معروض بالأسفل فقط"
                : "وجّه الكاميرا نحو رمز QR أو الباركود");
            tvStabilityHint.setTextColor(qrPausedAfterMatch ? Color.parseColor("#4ADE80") : Color.parseColor("#5EEAD4"));
            return;
        }
        if (activeScanMode == DocumentScannerEngine.SCAN_MODE_ID_CARD && !detected) {
            tvStabilityHint.setText("ضع بطاقة الهوية أو الكارنيه داخل الإطار المخصص");
            tvStabilityHint.setTextColor(Color.parseColor("#FDE047"));
            return;
        }
        if (activeScanMode == DocumentScannerEngine.SCAN_MODE_BOOK && !detected) {
            tvStabilityHint.setText("صوّر صفحة كتاب واحدة باللقطة — سيتم تسطيح الانحناء تلقائياً");
            tvStabilityHint.setTextColor(Color.parseColor("#FDE047"));
            return;
        }
        if (!detected) {
            tvStabilityHint.setText(autoCaptureEnabled
                ? "وجّه الكاميرا نحو المستند للاكتشاف التلقائي"
                : "وجّه الكاميرا نحو المستند ثم اضغط التقاط");
            tvStabilityHint.setTextColor(Color.parseColor("#FDE047"));
        } else if (shakingNotice) {
            tvStabilityHint.setText("ثبّت الهاتف قليلاً للحصول على أوضح صورة");
            tvStabilityHint.setTextColor(Color.parseColor("#FCA5A5"));
        } else if (!sharp) {
            tvStabilityHint.setText("تم رصد الورقة — جارٍ ضبط التركيز...");
            tvStabilityHint.setTextColor(Color.parseColor("#5EEAD4"));
        } else if (autoCaptureEnabled) {
            tvStabilityHint.setText("تم اكتشاف الحدود ✓ ثبّت الهاتف للالتقاط التلقائي");
            tvStabilityHint.setTextColor(Color.parseColor("#4ADE80"));
        } else {
            tvStabilityHint.setText("تم اكتشاف الحدود ✓ اضغط زر الالتقاط");
            tvStabilityHint.setTextColor(Color.parseColor("#4ADE80"));
        }
    }

    private void selectCameraMode(int mode) {
        activeScanMode = mode;
        stableStreak = 0;
        qrPausedAfterMatch = false;
        qrResultCard.setVisibility(View.GONE);
        scannerOverlayView.setScanMode(mode);
        updateModeChipsUi();
        updateCameraStatusHint(false, false, false);
    }

    private void updateModeChipsUi() {
        styleModeChip(btnModeSingle, activeScanMode == DocumentScannerEngine.SCAN_MODE_SINGLE);
        styleModeChip(btnModeBatch, activeScanMode == DocumentScannerEngine.SCAN_MODE_BATCH);
        styleModeChip(btnModeBook, activeScanMode == DocumentScannerEngine.SCAN_MODE_BOOK);
        styleModeChip(btnModeIdCard, activeScanMode == DocumentScannerEngine.SCAN_MODE_ID_CARD);
        styleModeChip(btnModeQr, activeScanMode == DocumentScannerEngine.SCAN_MODE_QR);

        if (activeScanMode == DocumentScannerEngine.SCAN_MODE_QR) {
            btnCapture.setText("قراءة");
        } else {
            btnCapture.setText("التقاط");
        }
    }

    private void styleModeChip(Button b, boolean active) {
        b.setBackgroundResource(active ? R.drawable.bg_scanner_pill_active : R.drawable.bg_scanner_pill_dark);
        b.setTextColor(active ? Color.WHITE : Color.parseColor("#CBD5E1"));
    }

    private void updateHdUi() {
        btnHdToggle.setBackgroundResource(isHdEnabled ? R.drawable.bg_scanner_pill_active : R.drawable.bg_scanner_pill_dark);
        btnHdToggle.setTextColor(isHdEnabled ? Color.parseColor("#FDE047") : Color.parseColor("#94A3B8"));
    }

    private void updateFlashUi() {
        btnFlashToggle.setText(isFlashOn ? "فلاش: تشغيل" : "فلاش: إيقاف");
        btnFlashToggle.setBackgroundResource(isFlashOn ? R.drawable.bg_scanner_pill_active : R.drawable.bg_scanner_pill_dark);
        btnFlashToggle.setTextColor(isFlashOn ? Color.parseColor("#FDE047") : Color.parseColor("#E2E8F0"));
    }

    private void toggleFlash() {
        if (camera == null) {
            Toast.makeText(this, "الفلاش متاح أثناء تشغيل الكاميرا", Toast.LENGTH_SHORT).show();
            return;
        }
        applyFlashTorchState(!isFlashOn);
    }

    private void applyFlashTorchState(boolean enable) {
        if (camera == null) return;
        try {
            Camera.Parameters params = camera.getParameters();
            List<String> modes = params.getSupportedFlashModes();
            if (modes != null && modes.contains(Camera.Parameters.FLASH_MODE_TORCH)) {
                isFlashOn = enable;
                params.setFlashMode(isFlashOn ? Camera.Parameters.FLASH_MODE_TORCH : Camera.Parameters.FLASH_MODE_OFF);
                camera.setParameters(params);
                updateFlashUi();
            } else {
                isFlashOn = false;
                updateFlashUi();
                Toast.makeText(this, "الفلاش غير مدعوم على هذا الجهاز", Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            isFlashOn = false;
            updateFlashUi();
        }
    }

    private void captureWithAutofocus() {
        if (camera == null || isCapturing || isBusyProcessing) return;
        isCapturing = true;
        final AtomicBoolean pictureTriggered = new AtomicBoolean(false);
        final Runnable fallbackShot = new Runnable() {
            @Override
            public void run() {
                if (pictureTriggered.compareAndSet(false, true)) {
                    takeActualPicture();
                }
            }
        };
        mainHandler.postDelayed(fallbackShot, 1600L);
        try {
            camera.autoFocus(new Camera.AutoFocusCallback() {
                @Override
                public void onAutoFocus(boolean success, Camera cam) {
                    mainHandler.removeCallbacks(fallbackShot);
                    if (pictureTriggered.compareAndSet(false, true)) {
                        takeActualPicture();
                    }
                }
            });
        } catch (Exception e) {
            mainHandler.removeCallbacks(fallbackShot);
            if (pictureTriggered.compareAndSet(false, true)) {
                takeActualPicture();
            }
        }
    }

    private void takeActualPicture() {
        if (camera == null || isActivityUnavailable()) {
            isCapturing = false;
            return;
        }
        final int captureMode = activeScanMode;
        final boolean captureHd = isHdEnabled;
        try {
            camera.takePicture(null, null, new Camera.PictureCallback() {
                @Override
                public void onPictureTaken(final byte[] data, Camera cam) {
                    if (data == null || workerExecutor.isShutdown()) {
                        isCapturing = false;
                        return;
                    }
                    workerExecutor.execute(new Runnable() {
                        @Override
                        public void run() {
                            Bitmap normBmp = null;
                            try {
                                File orig = File.createTempFile("scan_orig_", ".jpg", getCacheDir());
                                FileOutputStream fos = new FileOutputStream(orig);
                                fos.write(data);
                                fos.close();

                                if (captureMode == DocumentScannerEngine.SCAN_MODE_QR) {
                                    normBmp = DocumentScannerEngine.decodeNormalizedOriginal(orig, 1280);
                                    final ScannerOfflineCodeReader.CodeScanResult qr =
                                        offlineCodeReader.decodeFromBitmap(normBmp);
                                    normBmp.recycle();
                                    normBmp = null;
                                    orig.delete();

                                    runOnUiThread(new Runnable() {
                                        @Override
                                        public void run() {
                                            if (isActivityUnavailable()) return;
                                            isCapturing = false;
                                            if (camera != null && currentStep == STEP_CAPTURE) {
                                                try { camera.startPreview(); } catch (Exception ignored) {}
                                            }
                                            if (qr != null) {
                                                qrPausedAfterMatch = true;
                                                lastDecodedQrText = qr.text;
                                                tvQrFormat.setText("✓ " + qr.formatLabel);
                                                tvQrContent.setText(qr.text);
                                                tvQrKindHint.setText(qr.contentKindLabel);
                                                qrResultCard.setVisibility(View.VISIBLE);
                                            } else {
                                                Toast.makeText(DocumentScannerActivity.this,
                                                    "لم يتم العثور على رمز QR أو باركود واضح — قرّب الرمز داخل الإطار",
                                                    Toast.LENGTH_SHORT).show();
                                            }
                                        }
                                    });
                                    return;
                                }

                                int workDim = captureHd ? MAX_DIM_HD : MAX_DIM_STANDARD;
                                normBmp = DocumentScannerEngine.decodeNormalizedOriginal(orig, workDim);
                                DocumentScannerEngine.DetectionResult det =
                                    DocumentScannerEngine.detectDocumentQuad(normBmp, 0f, captureMode);
                                normBmp.recycle();
                                normBmp = null;

                                final boolean detectedOnCapture = det.detected;
                                final float[] chosenCorners = detectedOnCapture
                                    ? det.corners
                                    : (captureMode == DocumentScannerEngine.SCAN_MODE_ID_CARD
                                        ? DocumentScannerEngine.defaultIdCardCorners()
                                        : DocumentScannerEngine.fullFrameCorners());
                                final int initialFilter = (captureMode == DocumentScannerEngine.SCAN_MODE_ID_CARD)
                                    ? DocumentScannerEngine.FILTER_NATURAL
                                    : defaultFilterMode;

                                final ScannedPage processed = processOriginalFile(
                                    orig,
                                    chosenCorners,
                                    detectedOnCapture,
                                    0,
                                    initialFilter,
                                    0,
                                    captureMode,
                                    workDim
                                );

                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (isActivityUnavailable()) return;
                                        lastSavedKind = null;
                                        lastSavedUri = null;
                                        if (retakeIndex >= 0 && retakeIndex < pages.size()) {
                                            deletePageTempFiles(pages.get(retakeIndex));
                                            pages.set(retakeIndex, processed);
                                            selectedIndex = retakeIndex;
                                            retakeIndex = -1;
                                            isCapturing = false;
                                            if (!detectedOnCapture && promptCropOnMiss) {
                                                openManualCrop(selectedIndex);
                                            } else {
                                                switchToReview();
                                            }
                                            return;
                                        }

                                        pages.add(processed);
                                        selectedIndex = pages.size() - 1;
                                        updateCaptureCounter();
                                        isCapturing = false;

                                        if (captureMode == DocumentScannerEngine.SCAN_MODE_BATCH) {
                                            Toast.makeText(DocumentScannerActivity.this,
                                                "✓ أُضيفت الصفحة رقم " + pages.size() + " إلى الدفعة",
                                                Toast.LENGTH_SHORT).show();
                                            if (currentStep == STEP_CAPTURE && camera != null) {
                                                try { camera.startPreview(); } catch (Exception ignored) {}
                                            }
                                        } else {
                                            if (!detectedOnCapture && promptCropOnMiss) {
                                                Toast.makeText(DocumentScannerActivity.this,
                                                    "اضبط حدود القص بالعدسة المكبرة",
                                                    Toast.LENGTH_SHORT).show();
                                                openManualCrop(selectedIndex);
                                            } else {
                                                switchToReview();
                                            }
                                        }
                                    }
                                });
                            } catch (final Throwable ex) {
                                if (normBmp != null && !normBmp.isRecycled()) normBmp.recycle();
                                runOnUiThread(new Runnable() {
                                    @Override
                                    public void run() {
                                        if (isActivityUnavailable()) return;
                                        isCapturing = false;
                                        if (currentStep == STEP_CAPTURE && camera != null) {
                                            try { camera.startPreview(); } catch (Exception ignored) {}
                                        }
                                        Toast.makeText(DocumentScannerActivity.this,
                                            "تعذر معالجة اللقطة — حاول مجدداً", Toast.LENGTH_SHORT).show();
                                    }
                                });
                            }
                        }
                    });
                }
            });
        } catch (Exception e) {
            isCapturing = false;
            if (camera != null) {
                try { camera.startPreview(); } catch (Exception ignored) {}
            }
        }
    }

    // ==================== استيراد الصور (فردية/متعددة) واستيراد الملفات (PDF/صور) ====================
    private void openGalleryImagePicker() {
        if (isBusyProcessing) return;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(intent, REQ_IMPORT_IMAGES);
        } catch (Exception e) {
            Toast.makeText(this, "تعذر فتح معرض الصور", Toast.LENGTH_SHORT).show();
        }
    }

    private void openDocumentFilePicker() {
        if (isBusyProcessing) return;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{ "application/pdf", "image/*" });
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(intent, REQ_IMPORT_FILES);
        } catch (Exception e) {
            Toast.makeText(this, "تعذر فتح مدير الملفات", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if ((requestCode == REQ_IMPORT_IMAGES || requestCode == REQ_IMPORT_FILES) &&
            resultCode == RESULT_OK && data != null) {
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
                importSelectedUris(uris);
            }
        }
    }

    private void importSelectedUris(final List<Uri> uris) {
        isBusyProcessing = true;
        Toast.makeText(this, "جارٍ استيراد وتحسين الملفات المختارة...", Toast.LENGTH_SHORT).show();
        final int workDim = isHdEnabled ? MAX_DIM_HD : MAX_DIM_STANDARD;
        final int modeHint = (activeScanMode == DocumentScannerEngine.SCAN_MODE_QR)
            ? DocumentScannerEngine.SCAN_MODE_SINGLE
            : activeScanMode;

        if (workerExecutor.isShutdown()) {
            isBusyProcessing = false;
            return;
        }
        workerExecutor.execute(new Runnable() {
            @Override
            public void run() {
                final List<ScannedPage> imported = new ArrayList<ScannedPage>();
                final List<String> skipped = new ArrayList<String>();
                final ScannerOfflineCodeReader.CodeScanResult[] foundQr = new ScannerOfflineCodeReader.CodeScanResult[1];
                ContentResolver resolver = getContentResolver();

                for (Uri uri : uris) {
                    if (isActivityUnavailable()) break;
                    String mime = resolver.getType(uri);
                    String displayName = queryDisplayName(resolver, uri);
                    boolean isPdf = (mime != null && mime.toLowerCase(Locale.US).contains("pdf"))
                        || (displayName != null && displayName.toLowerCase(Locale.US).endsWith(".pdf"));

                    if (isPdf) {
                        try {
                            importPdfUriToPages(resolver, uri, imported, workDim);
                        } catch (Throwable ex) {
                            skipped.add((displayName != null ? displayName : "PDF") + " (ملف تالف أو محمي)");
                        }
                    } else {
                        Bitmap normBmp = null;
                        try {
                            File orig = File.createTempFile("imp_img_", ".jpg", getCacheDir());
                            copyUriToFile(resolver, uri, orig);

                            if (activeScanMode == DocumentScannerEngine.SCAN_MODE_QR && uris.size() == 1) {
                                normBmp = DocumentScannerEngine.decodeNormalizedOriginal(orig, 1280);
                                foundQr[0] = offlineCodeReader.decodeFromBitmap(normBmp);
                                if (foundQr[0] != null) {
                                    normBmp.recycle();
                                    orig.delete();
                                    break;
                                }
                                normBmp.recycle();
                                normBmp = null;
                            }

                            normBmp = DocumentScannerEngine.decodeNormalizedOriginal(orig, workDim);
                            DocumentScannerEngine.DetectionResult det =
                                DocumentScannerEngine.detectDocumentQuad(normBmp, 0f, modeHint);
                            normBmp.recycle();
                            normBmp = null;

                            float[] corners = det.detected
                                ? det.corners
                                : DocumentScannerEngine.fullFrameCorners();
                            int filter = (modeHint == DocumentScannerEngine.SCAN_MODE_ID_CARD)
                                ? DocumentScannerEngine.FILTER_NATURAL
                                : defaultFilterMode;
                            ScannedPage p = processOriginalFile(
                                orig, corners, det.detected, 0, filter, 0, modeHint, workDim);
                            imported.add(p);
                        } catch (Throwable ex) {
                            if (normBmp != null && !normBmp.isRecycled()) normBmp.recycle();
                            skipped.add((displayName != null ? displayName : "صورة") + " (تعذر القراءة)");
                        }
                    }
                }

                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (isActivityUnavailable()) return;
                        isBusyProcessing = false;
                        if (foundQr[0] != null) {
                            qrPausedAfterMatch = true;
                            lastDecodedQrText = foundQr[0].text;
                            tvQrFormat.setText("✓ " + foundQr[0].formatLabel);
                            tvQrContent.setText(foundQr[0].text);
                            tvQrKindHint.setText(foundQr[0].contentKindLabel);
                            qrResultCard.setVisibility(View.VISIBLE);
                            return;
                        }
                        if (!imported.isEmpty()) {
                            pages.addAll(imported);
                            selectedIndex = pages.size() - imported.size();
                            lastSavedKind = null;
                            lastSavedUri = null;
                            updateCaptureCounter();
                            Toast.makeText(DocumentScannerActivity.this,
                                "✓ تم استيراد " + imported.size() + " صفحة بالترتيب", Toast.LENGTH_SHORT).show();
                            switchToReview();
                        }
                        if (!skipped.isEmpty()) {
                            Toast.makeText(DocumentScannerActivity.this,
                                "تعذر استيراد: " + skipped.get(0), Toast.LENGTH_LONG).show();
                        }
                    }
                });
            }
        });
    }

    private void copyUriToFile(ContentResolver resolver, Uri uri, File target) throws Exception {
        InputStream is = null;
        FileOutputStream fos = null;
        try {
            is = resolver.openInputStream(uri);
            if (is == null) throw new Exception("تعذر فتح الملف");
            fos = new FileOutputStream(target);
            byte[] buf = new byte[8192];
            int read;
            while ((read = is.read(buf)) != -1) {
                fos.write(buf, 0, read);
            }
            fos.flush();
        } finally {
            if (fos != null) try { fos.close(); } catch (Exception ignored) {}
            if (is != null) try { is.close(); } catch (Exception ignored) {}
        }
    }

    private void importPdfUriToPages(ContentResolver resolver, Uri uri, List<ScannedPage> out, int workDim) throws Exception {
        if (Build.VERSION.SDK_INT < 21) {
            throw new Exception("يتطلب Android 5+ لاستيراد PDF");
        }
        ParcelFileDescriptor pfd = resolver.openFileDescriptor(uri, "r");
        if (pfd == null) throw new Exception("تعذر فتح ملف PDF");
        PdfRenderer renderer = null;
        try {
            renderer = new PdfRenderer(pfd);
            int pageCount = renderer.getPageCount();
            if (pageCount <= 0) throw new Exception("ملف PDF فارغ");

            // تخفيض دقة التصيير للملفات الضخمة لحماية الذاكرة دون تغيير ترتيب الصفحات
            int targetDim = pageCount > 15 ? Math.min(workDim, 1300) : Math.min(workDim, 1650);

            for (int i = 0; i < pageCount; i++) {
                if (isActivityUnavailable()) break;
                PdfRenderer.Page page = renderer.openPage(i);
                int w = page.getWidth();
                int h = page.getHeight();
                float scale = Math.min(2.0f, targetDim / (float) Math.max(1, Math.max(w, h)));
                int rw = Math.max(240, Math.round(w * scale));
                int rh = Math.max(240, Math.round(h * scale));

                Bitmap bmp = Bitmap.createBitmap(rw, rh, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bmp);
                canvas.drawColor(Color.WHITE);
                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                page.close();

                File orig = File.createTempFile("imp_pdf_p_", ".jpg", getCacheDir());
                FileOutputStream fos = new FileOutputStream(orig);
                bmp.compress(Bitmap.CompressFormat.JPEG, 92, fos);
                fos.close();
                bmp.recycle();

                // الصفحات المستوردة من PDF تُحفظ مع الحفاظ على ترتيبها وبدون قص زائد يمس الهوامش
                ScannedPage sp = processOriginalFile(
                    orig,
                    DocumentScannerEngine.fullFrameCorners(),
                    true,
                    0,
                    DocumentScannerEngine.FILTER_NATURAL,
                    0,
                    DocumentScannerEngine.SCAN_MODE_SINGLE,
                    targetDim
                );
                out.add(sp);
            }
        } finally {
            if (renderer != null) try { renderer.close(); } catch (Exception ignored) {}
            try { pfd.close(); } catch (Exception ignored) {}
        }
    }

    private String queryDisplayName(ContentResolver resolver, Uri uri) {
        Cursor cursor = null;
        try {
            cursor = resolver.query(uri, new String[]{ OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
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
        int brightnessAdjust,
        int scanMode,
        int workDim
    ) throws Exception {
        Bitmap raw = DocumentScannerEngine.decodeNormalizedOriginal(origFile, workDim);
        Bitmap enhanced = null;
        byte[] outBytes;
        try {
            enhanced = DocumentScannerEngine.warpRotateAndEnhance(
                raw, corners, rotationDeg, filterMode, brightnessAdjust, workDim, scanMode);
            if (enhanced != raw && !raw.isRecycled()) raw.recycle();
            int initQ = isHdEnabled ? 92 : 87;
            outBytes = DocumentScannerEngine.compressBitmapUnderMaxBytes(enhanced, initQ, SAFE_TARGET_BYTES);
        } finally {
            if (raw != null && !raw.isRecycled()) raw.recycle();
            if (enhanced != null && !enhanced.isRecycled()) enhanced.recycle();
        }

        File procFile = File.createTempFile("scan_proc_", ".jpg", getCacheDir());
        FileOutputStream fos = new FileOutputStream(procFile);
        fos.write(outBytes);
        fos.flush();
        fos.close();

        ScannedPage page = new ScannedPage();
        page.originalTempFile = origFile;
        page.processedTempFile = procFile;
        page.processedSizeBytes = outBytes.length;
        page.corners = corners != null ? corners.clone() : DocumentScannerEngine.fullFrameCorners();
        page.autoDetected = autoDetected;
        page.rotationDeg = ((rotationDeg % 360) + 360) % 360;
        page.filterMode = filterMode;
        page.brightnessAdjust = Math.max(-35, Math.min(45, brightnessAdjust));
        page.scanMode = scanMode;
        return page;
    }

    // ==================== أدوات التعديل والمراجعة ====================
    private void rotateCurrentPage90(int deltaDeg) {
        if (pages.isEmpty() || isBusyProcessing) return;
        int targetIdx = selectedIndex;
        ScannedPage page = pages.get(targetIdx);
        int nextDeg = (page.rotationDeg + deltaDeg + 360) % 360;
        reprocessPageInBackground(targetIdx, page.corners, page.autoDetected, nextDeg,
            page.filterMode, page.brightnessAdjust, null);
    }

    private void changeCurrentFilterMode(int newFilterMode) {
        if (pages.isEmpty() || isBusyProcessing) return;
        int targetIdx = selectedIndex;
        ScannedPage page = pages.get(targetIdx);
        if (page.filterMode == newFilterMode) return;
        reprocessPageInBackground(targetIdx, page.corners, page.autoDetected, page.rotationDeg,
            newFilterMode, page.brightnessAdjust, null);
    }

    private void adjustCurrentBrightness(int delta) {
        if (pages.isEmpty() || isBusyProcessing) return;
        int targetIdx = selectedIndex;
        ScannedPage page = pages.get(targetIdx);
        int nextBrightness = Math.max(-30, Math.min(40, page.brightnessAdjust + delta));
        if (nextBrightness == page.brightnessAdjust) return;
        reprocessPageInBackground(targetIdx, page.corners, page.autoDetected, page.rotationDeg,
            page.filterMode, nextBrightness, null);
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
        if (targetIdx < 0 || targetIdx >= pages.size() || workerExecutor.isShutdown()) return;
        isBusyProcessing = true;
        final ScannedPage page = pages.get(targetIdx);
        final int workDim = isHdEnabled ? MAX_DIM_HD : MAX_DIM_STANDARD;

        workerExecutor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    final ScannedPage updated = processOriginalFile(
                        page.originalTempFile, corners, autoDetected, rotationDeg,
                        filterMode, brightnessAdjust, page.scanMode, workDim);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            isBusyProcessing = false;
                            if (isActivityUnavailable()) return;
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
                } catch (Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            isBusyProcessing = false;
                            if (!isActivityUnavailable()) {
                                Toast.makeText(DocumentScannerActivity.this, "تعذر تحديث الصفحة", Toast.LENGTH_SHORT).show();
                            }
                        }
                    });
                }
            }
        });
    }

    // ==================== القص اليدوي وعدسة التكبير ====================
    private void openManualCrop(int index) {
        if (index < 0 || index >= pages.size() || workerExecutor.isShutdown()) return;
        selectedIndex = index;
        final ScannedPage page = pages.get(index);
        currentStep = STEP_CROP;
        releaseCamera();
        hideAllStageViews();
        hideAllBottomPanels();

        cropOverlayView.setVisibility(View.VISIBLE);
        layoutCropControls.setVisibility(View.VISIBLE);
        tvTitle.setText("تحديد الحدود — اسحب الزوايا للتكبير الدقيق");

        workerExecutor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    final Bitmap raw = DocumentScannerEngine.decodeNormalizedOriginal(page.originalTempFile, 1450);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (isActivityUnavailable()) {
                                if (raw != null && !raw.isRecycled()) raw.recycle();
                                return;
                            }
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
                            if (!isActivityUnavailable()) {
                                Toast.makeText(DocumentScannerActivity.this, "تعذر فتح محرر القص", Toast.LENGTH_SHORT).show();
                                switchToReview();
                            }
                        }
                    });
                }
            }
        });
    }

    private void redetectCornersInCropView() {
        if (cropEditingBitmap == null || cropEditingBitmap.isRecycled() || selectedIndex >= pages.size()) return;
        ScannedPage p = pages.get(selectedIndex);
        DocumentScannerEngine.DetectionResult res =
            DocumentScannerEngine.detectDocumentQuad(cropEditingBitmap, 0f, p.scanMode);
        if (res.detected) {
            cropOverlayView.setImageAndCorners(cropEditingBitmap, res.corners);
            Toast.makeText(this, "✓ تم تحديد الحدود تلقائياً", Toast.LENGTH_SHORT).show();
        } else {
            cropOverlayView.setImageAndCorners(cropEditingBitmap, DocumentScannerEngine.fullFrameCorners());
            Toast.makeText(this, "لم تتضح حافة منفصلة — اسحب الزوايا يدوياً باستخدام العدسة", Toast.LENGTH_SHORT).show();
        }
    }

    private void applyManualCropCorners() {
        if (selectedIndex < 0 || selectedIndex >= pages.size() || workerExecutor.isShutdown() || isBusyProcessing) return;
        isBusyProcessing = true;
        final int targetIdx = selectedIndex;
        final ScannedPage page = pages.get(targetIdx);
        final float[] editedCorners = cropOverlayView.getCorners();
        final int workDim = isHdEnabled ? MAX_DIM_HD : MAX_DIM_STANDARD;

        workerExecutor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    final ScannedPage updated = processOriginalFile(
                        page.originalTempFile, editedCorners, true, page.rotationDeg,
                        page.filterMode, page.brightnessAdjust, page.scanMode, workDim);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            isBusyProcessing = false;
                            if (isActivityUnavailable()) return;
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
                            isBusyProcessing = false;
                            if (!isActivityUnavailable()) {
                                Toast.makeText(DocumentScannerActivity.this, "تعذر تطبيق القص", Toast.LENGTH_SHORT).show();
                            }
                        }
                    });
                }
            }
        });
    }

    private void closeCropScreenToReview() {
        cropOverlayView.setImageAndCorners(null, null);
        if (cropEditingBitmap != null && !cropEditingBitmap.isRecycled()) {
            cropEditingBitmap.recycle();
            cropEditingBitmap = null;
        }
        switchToReview();
    }

    // ==================== إضافة التوقيع محلياً 100% ====================
    private void openSignatureDrawStep() {
        if (pages.isEmpty()) return;
        currentStep = STEP_SIGN_DRAW;
        releaseCamera();
        hideAllStageViews();
        hideAllBottomPanels();

        signaturePadPanel.setVisibility(View.VISIBLE);
        layoutSigDrawControls.setVisibility(View.VISIBLE);
        tvTitle.setText("رسم التوقيع الإلكتروني");
    }

    private void selectSignatureInk(int color, Button activeBtn, String label) {
        signaturePadView.setInkColor(color);
        btnSigInkBlue.setBackgroundResource(R.drawable.bg_scanner_pill_dark);
        btnSigInkBlack.setBackgroundResource(R.drawable.bg_scanner_pill_dark);
        btnSigInkRed.setBackgroundResource(R.drawable.bg_scanner_pill_dark);
        btnSigInkBlue.setText("أزرق");
        btnSigInkBlack.setText("أسود");
        btnSigInkRed.setText("أحمر");
        activeBtn.setBackgroundResource(R.drawable.bg_scanner_pill_active);
        activeBtn.setText(label + " ✓");
    }

    private void proceedToSignaturePlacement() {
        if (!signaturePadView.hasSignature()) {
            Toast.makeText(this, "ارسم توقيعك أولاً داخل الإطار الأبيض", Toast.LENGTH_SHORT).show();
            return;
        }
        Bitmap sigBmp = signaturePadView.exportTrimmedBitmap();
        if (sigBmp == null) {
            Toast.makeText(this, "تعذر استخراج التوقيع", Toast.LENGTH_SHORT).show();
            return;
        }
        releaseSignatureTempBitmaps();
        pendingSignatureBitmap = sigBmp;

        ScannedPage cur = pages.get(selectedIndex);
        Bitmap pagePreview = DocumentScannerEngine.decodeSampledThumbnail(cur.processedTempFile, 1200);
        if (pagePreview == null) {
            Toast.makeText(this, "تعذر تحميل معاينة الصفحة", Toast.LENGTH_SHORT).show();
            return;
        }

        currentStep = STEP_SIGN_PLACE;
        hideAllStageViews();
        hideAllBottomPanels();
        signaturePlacementView.setVisibility(View.VISIBLE);
        layoutSigPlaceControls.setVisibility(View.VISIBLE);
        tvTitle.setText("اسحب التوقيع للموضع المطلوب وغيّر حجمه");

        replaceDisplayBitmap(pagePreview);
        signaturePlacementView.setBitmaps(pagePreview, pendingSignatureBitmap);
        seekSignatureSize.setProgress(20);
    }

    private void applySignatureToCurrentPage() {
        if (pages.isEmpty() || pendingSignatureBitmap == null || pendingSignatureBitmap.isRecycled() || isBusyProcessing) {
            return;
        }
        isBusyProcessing = true;
        final int targetIdx = selectedIndex;
        final ScannedPage page = pages.get(targetIdx);
        final float normX = signaturePlacementView.getCenterNormX();
        final float normY = signaturePlacementView.getCenterNormY();
        final float widthFrac = signaturePlacementView.getWidthFraction();
        final Bitmap sigCopy = pendingSignatureBitmap.copy(Bitmap.Config.ARGB_8888, false);

        workerExecutor.execute(new Runnable() {
            @Override
            public void run() {
                Bitmap base = null;
                try {
                    base = BitmapFactory.decodeFile(page.processedTempFile.getAbsolutePath());
                    if (base == null) throw new Exception("تعذر قراءة الصفحة");
                    Bitmap mutable = base.isMutable() ? base : base.copy(Bitmap.Config.ARGB_8888, true);
                    if (mutable != base) base.recycle();
                    base = mutable;

                    Canvas c = new Canvas(base);
                    float sigW = base.getWidth() * widthFrac;
                    float aspect = sigCopy.getHeight() / (float) Math.max(1, sigCopy.getWidth());
                    float sigH = sigW * aspect;
                    float cx = normX * base.getWidth();
                    float cy = normY * base.getHeight();
                    RectF dst = new RectF(cx - sigW * 0.5f, cy - sigH * 0.5f, cx + sigW * 0.5f, cy + sigH * 0.5f);
                    Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
                    c.drawBitmap(sigCopy, null, dst, p);

                    byte[] bytes = DocumentScannerEngine.compressBitmapUnderMaxBytes(base, isHdEnabled ? 92 : 87, SAFE_TARGET_BYTES);
                    File newProc = File.createTempFile("scan_sig_", ".jpg", getCacheDir());
                    FileOutputStream fos = new FileOutputStream(newProc);
                    fos.write(bytes);
                    fos.flush();
                    fos.close();

                    final File oldProc = page.processedTempFile;
                    final long newLen = bytes.length;
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            isBusyProcessing = false;
                            if (!sigCopy.isRecycled()) sigCopy.recycle();
                            releaseSignatureTempBitmaps();
                            if (isActivityUnavailable()) return;
                            page.processedTempFile = newProc;
                            page.processedSizeBytes = newLen;
                            if (oldProc != null && oldProc.exists()) oldProc.delete();
                            lastSavedKind = null;
                            lastSavedUri = null;
                            Toast.makeText(DocumentScannerActivity.this, "✓ تم إضافة التوقيع على الصفحة", Toast.LENGTH_SHORT).show();
                            switchToReview();
                        }
                    });
                } catch (Exception e) {
                    if (base != null && !base.isRecycled()) base.recycle();
                    if (!sigCopy.isRecycled()) sigCopy.recycle();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            isBusyProcessing = false;
                            if (!isActivityUnavailable()) {
                                Toast.makeText(DocumentScannerActivity.this, "تعذر دمج التوقيع", Toast.LENGTH_SHORT).show();
                            }
                        }
                    });
                }
            }
        });
    }

    private void releaseSignatureTempBitmaps() {
        signaturePlacementView.setBitmaps(null, null);
        if (pendingSignatureBitmap != null && !pendingSignatureBitmap.isRecycled()) {
            pendingSignatureBitmap.recycle();
            pendingSignatureBitmap = null;
        }
    }

    // ==================== الطابع الزمني بمعاينة حية قبل التطبيق ====================
    private void openTimestampPreviewStep() {
        if (pages.isEmpty()) return;
        ScannedPage cur = pages.get(selectedIndex);
        Bitmap base = DocumentScannerEngine.decodeSampledThumbnail(cur.processedTempFile, 1200);
        if (base == null) {
            Toast.makeText(this, "تعذر تحميل معاينة الصفحة", Toast.LENGTH_SHORT).show();
            return;
        }
        releaseTimestampPreviewBitmaps();
        timestampPreviewBaseBitmap = base;

        currentStep = STEP_TIMESTAMP;
        releaseCamera();
        hideAllStageViews();
        hideAllBottomPanels();
        ivPreview.setVisibility(View.VISIBLE);
        layoutTimestampControls.setVisibility(View.VISIBLE);
        tvTitle.setText("معاينة الطابع الزمني قبل تطبيقه");
        refreshTimestampPreview();
    }

    private String buildTimestampString() {
        SimpleDateFormat sdf = new SimpleDateFormat(
            timestampIncludeTime ? "yyyy/MM/dd  HH:mm" : "yyyy/MM/dd",
            Locale.US
        );
        return sdf.format(new Date());
    }

    private void refreshTimestampPreview() {
        btnTsPosBr.setBackgroundResource(timestampCorner == TS_CORNER_BR ? R.drawable.bg_scanner_pill_active : R.drawable.bg_scanner_pill_dark);
        btnTsPosBl.setBackgroundResource(timestampCorner == TS_CORNER_BL ? R.drawable.bg_scanner_pill_active : R.drawable.bg_scanner_pill_dark);
        btnTsPosTr.setBackgroundResource(timestampCorner == TS_CORNER_TR ? R.drawable.bg_scanner_pill_active : R.drawable.bg_scanner_pill_dark);

        if (timestampPreviewBaseBitmap == null || timestampPreviewBaseBitmap.isRecycled()) return;
        Bitmap copy = timestampPreviewBaseBitmap.copy(Bitmap.Config.ARGB_8888, true);
        drawTimestampOnBitmap(copy, buildTimestampString(), timestampCorner);
        ivPreview.setImageBitmap(copy);
        if (timestampPreviewWorkingBitmap != null && !timestampPreviewWorkingBitmap.isRecycled()) {
            timestampPreviewWorkingBitmap.recycle();
        }
        timestampPreviewWorkingBitmap = copy;
    }

    private static void drawTimestampOnBitmap(Bitmap bmp, String text, int corner) {
        Canvas canvas = new Canvas(bmp);
        int w = bmp.getWidth();
        int h = bmp.getHeight();
        float textSize = Math.max(18f, Math.min(w, h) * 0.026f);

        Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        textPaint.setColor(Color.parseColor("#0F172A"));
        textPaint.setTextSize(textSize);
        textPaint.setFakeBoldText(true);

        Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        bgPaint.setColor(Color.argb(215, 248, 250, 252));
        bgPaint.setStyle(Paint.Style.FILL);

        Paint borderPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        borderPaint.setColor(Color.parseColor("#0F766E"));
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(Math.max(1.5f, textSize * 0.08f));

        float tw = textPaint.measureText(text);
        Paint.FontMetrics fm = textPaint.getFontMetrics();
        float th = fm.descent - fm.ascent;
        float padX = textSize * 0.55f;
        float padY = textSize * 0.35f;
        float boxW = tw + padX * 2f;
        float boxH = th + padY * 2f;
        float margin = Math.max(14f, Math.min(w, h) * 0.028f);

        float left;
        float top;
        if (corner == TS_CORNER_BL) {
            left = margin;
            top = h - margin - boxH;
        } else if (corner == TS_CORNER_TR) {
            left = w - margin - boxW;
            top = margin;
        } else {
            left = w - margin - boxW;
            top = h - margin - boxH;
        }
        RectF box = new RectF(left, top, left + boxW, top + boxH);
        canvas.drawRoundRect(box, textSize * 0.3f, textSize * 0.3f, bgPaint);
        canvas.drawRoundRect(box, textSize * 0.3f, textSize * 0.3f, borderPaint);
        canvas.drawText(text, left + padX, top + padY - fm.ascent, textPaint);
    }

    private void applyTimestampToCurrentPage() {
        if (pages.isEmpty() || isBusyProcessing) return;
        isBusyProcessing = true;
        final int targetIdx = selectedIndex;
        final ScannedPage page = pages.get(targetIdx);
        final String stampText = buildTimestampString();
        final int corner = timestampCorner;

        workerExecutor.execute(new Runnable() {
            @Override
            public void run() {
                Bitmap base = null;
                try {
                    base = BitmapFactory.decodeFile(page.processedTempFile.getAbsolutePath());
                    if (base == null) throw new Exception("تعذر قراءة الصفحة");
                    Bitmap mutable = base.isMutable() ? base : base.copy(Bitmap.Config.ARGB_8888, true);
                    if (mutable != base) base.recycle();
                    base = mutable;

                    drawTimestampOnBitmap(base, stampText, corner);
                    byte[] bytes = DocumentScannerEngine.compressBitmapUnderMaxBytes(base, isHdEnabled ? 92 : 87, SAFE_TARGET_BYTES);
                    File newProc = File.createTempFile("scan_ts_", ".jpg", getCacheDir());
                    FileOutputStream fos = new FileOutputStream(newProc);
                    fos.write(bytes);
                    fos.flush();
                    fos.close();

                    final File oldProc = page.processedTempFile;
                    final long newLen = bytes.length;
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            isBusyProcessing = false;
                            releaseTimestampPreviewBitmaps();
                            if (isActivityUnavailable()) return;
                            page.processedTempFile = newProc;
                            page.processedSizeBytes = newLen;
                            if (oldProc != null && oldProc.exists()) oldProc.delete();
                            lastSavedKind = null;
                            lastSavedUri = null;
                            Toast.makeText(DocumentScannerActivity.this, "✓ تم تطبيق الطابع الزمني على الصفحة", Toast.LENGTH_SHORT).show();
                            switchToReview();
                        }
                    });
                } catch (Exception e) {
                    if (base != null && !base.isRecycled()) base.recycle();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            isBusyProcessing = false;
                            if (!isActivityUnavailable()) {
                                Toast.makeText(DocumentScannerActivity.this, "تعذر تطبيق الطابع الزمني", Toast.LENGTH_SHORT).show();
                            }
                        }
                    });
                }
            }
        });
    }

    private void releaseTimestampPreviewBitmaps() {
        if (timestampPreviewWorkingBitmap != null && !timestampPreviewWorkingBitmap.isRecycled()) {
            ivPreview.setImageBitmap(null);
            timestampPreviewWorkingBitmap.recycle();
            timestampPreviewWorkingBitmap = null;
        }
        if (timestampPreviewBaseBitmap != null && !timestampPreviewBaseBitmap.isRecycled()) {
            timestampPreviewBaseBitmap.recycle();
            timestampPreviewBaseBitmap = null;
        }
    }

    // ==================== المراجعة والترتيب والمعاينة الآمنة للذاكرة ====================
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
        // استخدام ListView مع BaseAdapter لفك المصغرات عند الطلب وإعادة تدوير الصفوف دون استهلاك الذاكرة
        ListView listView = new ListView(this);
        listView.setDividerHeight(16);
        listView.setPadding(20, 20, 20, 20);
        listView.setAdapter(new BaseAdapter() {
            @Override
            public int getCount() {
                return pages.size();
            }

            @Override
            public Object getItem(int position) {
                return pages.get(position);
            }

            @Override
            public long getItemId(int position) {
                return position;
            }

            @Override
            public View getView(int position, View convertView, ViewGroup parent) {
                LinearLayout row;
                TextView label;
                ImageView img;
                if (convertView instanceof LinearLayout) {
                    row = (LinearLayout) convertView;
                    label = (TextView) row.getChildAt(0);
                    img = (ImageView) row.getChildAt(1);
                } else {
                    row = new LinearLayout(DocumentScannerActivity.this);
                    row.setOrientation(LinearLayout.VERTICAL);
                    label = new TextView(DocumentScannerActivity.this);
                    label.setPadding(0, 8, 0, 8);
                    label.setTextColor(Color.parseColor("#0F172A"));
                    img = new ImageView(DocumentScannerActivity.this);
                    img.setAdjustViewBounds(true);
                    row.addView(label);
                    row.addView(img);
                }
                ScannedPage p = pages.get(position);
                label.setText(String.format(Locale.US, "صفحة %d • %.1f KB • %d°",
                    position + 1, p.processedSizeBytes / 1024f, p.rotationDeg));
                Bitmap thumb = DocumentScannerEngine.decodeSampledThumbnail(p.processedTempFile, 780);
                img.setImageBitmap(thumb);
                return row;
            }
        });

        new AlertDialog.Builder(this)
            .setTitle("معاينة الصفحات (" + pages.size() + ")")
            .setView(listView)
            .setPositiveButton("إغلاق", null)
            .show();
    }

    private void deleteCurrentPage() {
        if (pages.isEmpty()) return;
        ScannedPage removed = pages.remove(selectedIndex);
        deletePageTempFiles(removed);
        lastSavedKind = null;
        if (pages.isEmpty()) {
            updateCaptureCounter();
            switchToCapture();
        } else {
            selectedIndex = Math.min(selectedIndex, pages.size() - 1);
            updateCaptureCounter();
            updateReviewPreview();
        }
    }

    // ==================== التنقل بين المراحل ====================
    private void hideAllStageViews() {
        surfaceView.setVisibility(View.GONE);
        scannerOverlayView.setVisibility(View.GONE);
        ivPreview.setVisibility(View.GONE);
        cropOverlayView.setVisibility(View.GONE);
        signaturePlacementView.setVisibility(View.GONE);
        signaturePadPanel.setVisibility(View.GONE);
        scrollExportStage.setVisibility(View.GONE);
        tvStabilityHint.setVisibility(View.GONE);
        qrResultCard.setVisibility(View.GONE);
    }

    private void hideAllBottomPanels() {
        layoutCameraControls.setVisibility(View.GONE);
        layoutCropControls.setVisibility(View.GONE);
        layoutSigDrawControls.setVisibility(View.GONE);
        layoutSigPlaceControls.setVisibility(View.GONE);
        layoutTimestampControls.setVisibility(View.GONE);
        layoutReviewControls.setVisibility(View.GONE);
        layoutExportFooter.setVisibility(View.GONE);
    }

    private void switchToCapture() {
        currentStep = STEP_CAPTURE;
        hideAllStageViews();
        hideAllBottomPanels();

        surfaceView.setVisibility(View.VISIBLE);
        scannerOverlayView.setVisibility(View.VISIBLE);
        scannerOverlayView.setScanMode(activeScanMode);
        layoutCameraControls.setVisibility(View.VISIBLE);
        btnBack.setText("إغلاق");
        tvTitle.setText("سكانر ضغطة");
        updateCaptureCounter();
        updateCameraStatusHint(false, false, false);

        if (surfaceReady) {
            openCamera();
        }
    }

    private void switchToReview() {
        if (pages.isEmpty()) {
            switchToCapture();
            return;
        }
        currentStep = STEP_REVIEW;
        releaseCamera();
        hideAllStageViews();
        hideAllBottomPanels();

        ivPreview.setVisibility(View.VISIBLE);
        layoutReviewControls.setVisibility(View.VISIBLE);
        btnBack.setText("رجوع");
        updateReviewPreview();
    }

    private void switchToExport() {
        if (pages.isEmpty()) return;
        currentStep = STEP_EXPORT;
        releaseCamera();
        hideAllStageViews();
        hideAllBottomPanels();

        scrollExportStage.setVisibility(View.VISIBLE);
        layoutExportFooter.setVisibility(View.VISIBLE);
        btnBack.setText("رجوع");

        long totalBytes = 0L;
        for (ScannedPage p : pages) totalBytes += p.processedSizeBytes;

        tvTitle.setText("الحفظ والتصدير (" + pages.size() + " صفحات)");
        tvExportSummary.setText(String.format(Locale.US,
            "الصفحات الجاهزة للحفظ: %d صفحة (الحجم المقدر: %.1f KB)",
            pages.size(), totalBytes / 1024f));
        updateExportPostSaveUI();
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

    private void replaceDisplayBitmap(Bitmap newBmp) {
        if (currentDisplayBitmap == newBmp) return;
        ivPreview.setImageBitmap(newBmp);
        if (currentDisplayBitmap != null && !currentDisplayBitmap.isRecycled()) {
            currentDisplayBitmap.recycle();
        }
        currentDisplayBitmap = newBmp;
    }

    private void updateReviewPreview() {
        if (pages.isEmpty()) return;
        selectedIndex = Math.max(0, Math.min(pages.size() - 1, selectedIndex));
        ScannedPage cur = pages.get(selectedIndex);
        tvTitle.setText(String.format(Locale.US, "صفحة %d/%d • %.1f KB • %d°",
            selectedIndex + 1, pages.size(), cur.processedSizeBytes / 1024f, cur.rotationDeg));

        Bitmap previewBmp = DocumentScannerEngine.decodeSampledThumbnail(cur.processedTempFile, 1350);
        replaceDisplayBitmap(previewBmp);

        btnPrevPage.setEnabled(selectedIndex > 0);
        btnNextPage.setEnabled(selectedIndex < pages.size() - 1);
        btnMovePrev.setEnabled(selectedIndex > 0);
        btnMoveNext.setEnabled(selectedIndex < pages.size() - 1);
        tvBrightnessValue.setText(cur.brightnessAdjust == 0 ? "تلقائي"
            : (cur.brightnessAdjust > 0 ? "+" + cur.brightnessAdjust : String.valueOf(cur.brightnessAdjust)));
        updateFilterButtonStyles(cur.filterMode);
    }

    private void updateFilterButtonStyles(int mode) {
        styleFilterChip(btnFilterColor, mode == DocumentScannerEngine.FILTER_ORIGINAL_COLOR, "أصلي محسّن");
        styleFilterChip(btnFilterNatural, mode == DocumentScannerEngine.FILTER_NATURAL, "طبيعي");
        styleFilterChip(btnFilterGray, mode == DocumentScannerEngine.FILTER_GRAYSCALE, "رمادي");
        styleFilterChip(btnFilterBw, mode == DocumentScannerEngine.FILTER_BLACK_WHITE, "أبيض وأسود");
    }

    private void styleFilterChip(Button b, boolean active, String label) {
        b.setBackgroundResource(active ? R.drawable.bg_share_button : R.drawable.bg_scanner_pill_dark);
        b.setTextColor(active ? Color.parseColor("#09183B") : Color.WHITE);
        b.setText(active ? (label + " ✓") : label);
    }

    // ==================== قائمة كل المميزات (المعتمدة فقط) + المساعدة + الإعدادات ====================
    private void showAllFeaturesDialog() {
        final String[] items = new String[]{
            "1. مسح مستند فردي",
            "2. مسح دفعة صفحات متتالية",
            "3. مسح صفحة كتاب (تصحيح الانحناء)",
            "4. مسح بطاقات الهوية",
            "5. قراءة QR والباركود (محلي)",
            "6. استيراد صور من المعرض",
            "7. استيراد ملفات PDF وصور",
            "8. تبديل جودة HD (" + (isHdEnabled ? "مفعّلة" : "متوقفة") + ")",
            "9. إضافة التوقيع الإلكتروني (من المراجعة)",
            "10. إضافة الطابع الزمني (من المراجعة)",
            "11. إعدادات إضافية",
            "12. المساعدة والإرشادات"
        };

        new AlertDialog.Builder(this)
            .setTitle("كل مميزات السكانر")
            .setItems(items, new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    switch (which) {
                        case 0: selectCameraMode(DocumentScannerEngine.SCAN_MODE_SINGLE); break;
                        case 1: selectCameraMode(DocumentScannerEngine.SCAN_MODE_BATCH); break;
                        case 2: selectCameraMode(DocumentScannerEngine.SCAN_MODE_BOOK); break;
                        case 3: selectCameraMode(DocumentScannerEngine.SCAN_MODE_ID_CARD); break;
                        case 4: selectCameraMode(DocumentScannerEngine.SCAN_MODE_QR); break;
                        case 5: openGalleryImagePicker(); break;
                        case 6: openDocumentFilePicker(); break;
                        case 7: btnHdToggle.performClick(); break;
                        case 8:
                            if (pages.isEmpty()) Toast.makeText(DocumentScannerActivity.this, "التقط أو استورد صفحة أولاً ثم أضف التوقيع", Toast.LENGTH_SHORT).show();
                            else openSignatureDrawStep();
                            break;
                        case 9:
                            if (pages.isEmpty()) Toast.makeText(DocumentScannerActivity.this, "التقط أو استورد صفحة أولاً ثم أضف الطابع الزمني", Toast.LENGTH_SHORT).show();
                            else openTimestampPreviewStep();
                            break;
                        case 10: showSettingsDialog(); break;
                        case 11: showHelpDialog(); break;
                    }
                }
            })
            .setNegativeButton("إغلاق", null)
            .show();
    }

    private void showHelpDialog() {
        String guide =
            "• التصوير والقص: وجّه الكاميرا نحو الورقة أو البطاقة وسيتم تحديد الحدود تلقائياً.\n\n" +
            "• عدسة التكبير: عند سحب أي زاوية أو ضلع في شاشة القص ستظهر عدسة مكبرة فوق الإصبع لضبط حافة الورقة بدقة وتختفي عند الإفلات.\n\n" +
            "• الأوضاع المتاحة: فردي، دفعة متتالية، الكتب (صفحة واحدة مع تسطيح خفيف للانحناء)، بطاقات الهوية، وقارئ QR/الباركود أوفلاين.\n\n" +
            "• التوقيع والطابع الزمني: من شاشة المراجعة يمكنك رسم توقيعك وتحريكه وتكبيره فوق المستند، أو معاينة الطابع الزمني قبل تطبيقه.\n\n" +
            "• الحفظ: تصدير الصور بالمعرض أو ملف PDF موحد بالتنزيلات بحجم مضغوط يحافظ على وضوح الأختام والنصوص.";
        new AlertDialog.Builder(this)
            .setTitle("المساعدة وإرشادات الاستخدام")
            .setMessage(guide)
            .setPositiveButton("فهمت", null)
            .show();
    }

    private void showSettingsDialog() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(36, 20, 36, 10);

        final CheckBox cbAuto = new CheckBox(this);
        cbAuto.setText("الالتقاط التلقائي عند ثبات المستند");
        cbAuto.setChecked(autoCaptureEnabled);
        box.addView(cbAuto);

        final CheckBox cbHd = new CheckBox(this);
        cbHd.setText("تفعيل جودة HD افتراضياً عند فتح السكانر");
        cbHd.setChecked(isHdEnabled);
        box.addView(cbHd);

        final CheckBox cbCropMiss = new CheckBox(this);
        cbCropMiss.setText("فتح القص اليدوي تلقائياً إذا لم تتضح حدود الورقة");
        cbCropMiss.setChecked(promptCropOnMiss);
        box.addView(cbCropMiss);

        TextView filterLabel = new TextView(this);
        filterLabel.setText("الفلتر الافتراضي عند الالتقاط:");
        filterLabel.setPadding(0, 18, 0, 8);
        box.addView(filterLabel);

        final int[] chosenFilter = new int[]{ defaultFilterMode };
        final Button btnPickFilter = new Button(this);
        btnPickFilter.setText(filterNameArabic(chosenFilter[0]));
        btnPickFilter.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                chosenFilter[0] = (chosenFilter[0] + 1) % 4;
                btnPickFilter.setText(filterNameArabic(chosenFilter[0]));
            }
        });
        box.addView(btnPickFilter);

        new AlertDialog.Builder(this)
            .setTitle("إعدادات السكانر")
            .setView(box)
            .setNegativeButton("إلغاء", null)
            .setPositiveButton("حفظ", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    autoCaptureEnabled = cbAuto.isChecked();
                    isHdEnabled = cbHd.isChecked();
                    promptCropOnMiss = cbCropMiss.isChecked();
                    defaultFilterMode = chosenFilter[0];
                    prefs.edit()
                        .putBoolean(PREF_AUTO_CAPTURE, autoCaptureEnabled)
                        .putBoolean(PREF_DEFAULT_HD, isHdEnabled)
                        .putBoolean(PREF_CROP_ON_MISS, promptCropOnMiss)
                        .putInt(PREF_DEFAULT_FILTER, defaultFilterMode)
                        .apply();
                    updateHdUi();
                    updateCameraStatusHint(false, false, false);
                    Toast.makeText(DocumentScannerActivity.this, "✓ تم حفظ إعدادات السكانر", Toast.LENGTH_SHORT).show();
                }
            })
            .show();
    }

    private String filterNameArabic(int f) {
        if (f == DocumentScannerEngine.FILTER_NATURAL) return "طبيعي (يحفظ الصور والأختام)";
        if (f == DocumentScannerEngine.FILTER_GRAYSCALE) return "تدرج رمادي";
        if (f == DocumentScannerEngine.FILTER_BLACK_WHITE) return "أبيض وأسود";
        return "ألوان أصلية محسّنة";
    }

    // ==================== المرحلة 3: التصدير والحفظ الآمن من القرص ====================
    private byte[] readFileBytes(File file) throws Exception {
        FileInputStream fis = new FileInputStream(file);
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream((int) Math.max(1024, file.length()));
            byte[] buf = new byte[8192];
            int r;
            while ((r = fis.read(buf)) != -1) {
                baos.write(buf, 0, r);
            }
            return baos.toByteArray();
        } finally {
            try { fis.close(); } catch (Exception ignored) {}
        }
    }

    private byte[] ensurePageFileUnder500KB(ScannedPage page) throws Exception {
        byte[] current = readFileBytes(page.processedTempFile);
        if (current.length < STRICT_500KB) return current;
        Bitmap bmp = BitmapFactory.decodeByteArray(current, 0, current.length);
        if (bmp == null) throw new Exception("تعذر قراءة الصفحة للحفظ");
        try {
            return DocumentScannerEngine.compressBitmapUnderMaxBytes(bmp, 82, STRICT_500KB - 2048);
        } finally {
            if (!bmp.isRecycled()) bmp.recycle();
        }
    }

    private void saveImagesOnly() {
        if (pages.isEmpty() || workerExecutor.isShutdown()) return;
        btnSaveImagesOnly.setEnabled(false);
        btnSavePdfOnly.setEnabled(false);

        final String batchStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        workerExecutor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    Uri firstImageUri = null;
                    long maxImgBytes = 0L;
                    for (int i = 0; i < pages.size(); i++) {
                        ScannedPage page = pages.get(i);
                        byte[] bytesToSave = ensurePageFileUnder500KB(page);
                        maxImgBytes = Math.max(maxImgBytes, bytesToSave.length);
                        String name = String.format(Locale.US, "Daghta_%s_P%02d.jpg", batchStamp, i + 1);
                        Uri saved = saveImageGallery(bytesToSave, name);
                        if (firstImageUri == null) firstImageUri = saved;
                    }

                    final Uri resultUri = firstImageUri;
                    final String maxKb = String.format(Locale.US, "%.1f", maxImgBytes / 1024f);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (isActivityUnavailable()) return;
                            btnSaveImagesOnly.setEnabled(true);
                            btnSavePdfOnly.setEnabled(true);
                            lastSavedKind = "images";
                            if (resultUri != null) lastSavedUri = resultUri;
                            lastSavedMimeType = "image/jpeg";
                            tvPostSaveTitle.setText("✓ تم حفظ الصور بالمعرض بنجاح");
                            tvPostSaveDetails.setText("عدد الصفحات: " + pages.size()
                                + " صورة • أقصى حجم: " + maxKb + " KB (< 500 KB)\nمكان الحفظ: Pictures/ManzomaLawyer");
                            updateExportPostSaveUI();
                        }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (isActivityUnavailable()) return;
                            btnSaveImagesOnly.setEnabled(true);
                            btnSavePdfOnly.setEnabled(true);
                            Toast.makeText(DocumentScannerActivity.this,
                                "فشل حفظ الصور: " + e.getMessage(), Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        });
    }

    private void savePdfOnly(final boolean allowOversized) {
        if (pages.isEmpty() || workerExecutor.isShutdown()) return;
        btnSaveImagesOnly.setEnabled(false);
        btnSavePdfOnly.setEnabled(false);

        final String fileName = "Daghta_Scan_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date()) + ".pdf";
        workerExecutor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    final byte[] pdfBytes = buildCombinedPdfUnder500KB();
                    if (pdfBytes.length >= STRICT_500KB && !allowOversized) {
                        final String sizeKb = String.format(Locale.US, "%.1f", pdfBytes.length / 1024f);
                        runOnUiThread(new Runnable() {
                            @Override
                            public void run() {
                                if (isActivityUnavailable()) return;
                                btnSaveImagesOnly.setEnabled(true);
                                btnSavePdfOnly.setEnabled(true);
                                new AlertDialog.Builder(DocumentScannerActivity.this)
                                    .setTitle("تنبيه حجم ملف PDF")
                                    .setMessage("حجم ملف PDF الحالي (" + sizeKb + " KB) يتجاوز 500 KB للحفاظ على وضوح النصوص والأختام.\nهل توافق على الحفظ بهذا الحجم؟")
                                    .setNegativeButton("إلغاء", null)
                                    .setPositiveButton("حفظ PDF", new DialogInterface.OnClickListener() {
                                        @Override
                                        public void onClick(DialogInterface dialog, int which) {
                                            savePdfOnly(true);
                                        }
                                    }).show();
                            }
                        });
                        return;
                    }

                    final Uri savedUri = savePdfDownloads(pdfBytes, fileName);
                    final String pdfKb = String.format(Locale.US, "%.1f", pdfBytes.length / 1024f);
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (isActivityUnavailable()) return;
                            btnSaveImagesOnly.setEnabled(true);
                            btnSavePdfOnly.setEnabled(true);
                            lastSavedKind = "pdf";
                            if (savedUri != null) lastSavedUri = savedUri;
                            lastSavedMimeType = "application/pdf";
                            tvPostSaveTitle.setText("✓ تم حفظ ملف PDF بنجاح");
                            tvPostSaveDetails.setText(fileName + " • " + pages.size()
                                + " صفحات • " + pdfKb + " KB\nمكان الحفظ: مجلد التنزيلات (Downloads)");
                            updateExportPostSaveUI();
                        }
                    });
                } catch (final Exception e) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (isActivityUnavailable()) return;
                            btnSaveImagesOnly.setEnabled(true);
                            btnSavePdfOnly.setEnabled(true);
                            Toast.makeText(DocumentScannerActivity.this,
                                "فشل حفظ PDF: " + e.getMessage(), Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        });
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
        int baseDim = isHdEnabled ? 1950 : 1650;
        int maxDim = count == 1 ? baseDim : (count <= 3 ? Math.min(baseDim, 1480) : (count <= 6 ? 1240 : 1060));
        int quality = count == 1 ? 82 : (count <= 3 ? 74 : (count <= 6 ? 68 : 62));
        byte[] pdf = renderPagesToPdf(maxDim, quality);
        int tries = 0;
        while (pdf.length >= STRICT_500KB && tries < 6) {
            tries++;
            if (quality > 58) quality = Math.max(56, quality - 5);
            else maxDim = Math.max(840, Math.round(maxDim * 0.88f));
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
            Bitmap bmp = DocumentScannerEngine.decodeNormalizedOriginal(p.processedTempFile, maxDim);
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
        final Uri[] scannedUri = new Uri[1];
        MediaScannerConnection.scanFile(this, new String[]{ target.getAbsolutePath() }, new String[]{ "image/jpeg" },
            new MediaScannerConnection.OnScanCompletedListener() {
                @Override
                public void onScanCompleted(String path, final Uri uri) {
                    scannedUri[0] = uri;
                    if (uri != null) {
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                if (lastSavedUri == null && "images".equals(lastSavedKind)) {
                                    lastSavedUri = uri;
                                }
                            }
                        });
                    }
                }
            });
        return scannedUri[0];
    }

    private Uri savePdfDownloads(byte[] bytes, String fileName) throws Exception {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver r = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
            v.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
            v.put("relative_path", Environment.DIRECTORY_DOWNLOADS);
            Uri table = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            Uri u = null;
            try {
                u = r.insert(table, v);
            } catch (Exception ignored) {}
            if (u == null) {
                u = r.insert(MediaStore.Files.getContentUri("external"), v);
            }
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
        MediaScannerConnection.scanFile(this, new String[]{ target.getAbsolutePath() }, new String[]{ "application/pdf" },
            new MediaScannerConnection.OnScanCompletedListener() {
                @Override
                public void onScanCompleted(String path, final Uri uri) {
                    if (uri != null) {
                        mainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                if ("pdf".equals(lastSavedKind)) {
                                    lastSavedUri = uri;
                                }
                            }
                        });
                    }
                }
            });
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
        mainHandler.removeCallbacksAndMessages(null);
        releaseCamera();
        previewExecutor.shutdownNow();
        workerExecutor.shutdownNow();
        if (currentDisplayBitmap != null && !currentDisplayBitmap.isRecycled()) {
            ivPreview.setImageBitmap(null);
            currentDisplayBitmap.recycle();
            currentDisplayBitmap = null;
        }
        if (cropEditingBitmap != null && !cropEditingBitmap.isRecycled()) {
            cropEditingBitmap.recycle();
            cropEditingBitmap = null;
        }
        releaseSignatureTempBitmaps();
        releaseTimestampPreviewBitmaps();
        cleanupAllTempFiles();
        super.onDestroy();
    }
}
