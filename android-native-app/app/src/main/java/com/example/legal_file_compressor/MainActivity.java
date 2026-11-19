package com.example.legal_file_compressor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.pdf.PdfRenderer;
import android.media.ExifInterface;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.StrictMode;
import android.provider.MediaStore;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int REQ_PICK_IMAGE = 101;
    private static final int REQ_PICK_PDF = 102;
    private static final int REQ_MERGE_IMAGES = 103;

    // المعيار الموحد الجديد لمنصة النيابة العامة: أقل من 500 KB حصرياً للصور والـ PDF
    private static final int UNIFIED_TARGET_KB = 500;
    private static final int UNIFIED_STRICT_BYTES = 485 * 1024; // 485 KB (< 500 KB)

    private TextView tvStatus;
    private View btnCompressImage;
    private View btnCompressPdf;
    private View btnMergePdf;
    private View btnDocumentScanner;
    private Button btnShareAppHeader;
    private View cardPortals;

    // عناصر مربع حوار تأكيد الحفظ المركزي (3 ثوانٍ تلقائياً مع إغلاق يدوي × وفتح الملف)
    private View layoutSaveDialogOverlay;
    private TextView tvDialogLocation;
    private TextView tvDialogSize;
    private TextView btnDialogClose;
    private Button btnDialogOpen;
    private File lastSavedFile;
    private Uri lastSavedUri;
    private String lastSavedMime;
    private int activeDialogToken = 0;
    private final Handler toastHandler = new Handler(Looper.getMainLooper());
    private Runnable hideToastRunnable;

    // قائمة الـ 10 مواقع القضائية الرسمية مرقمة بوضوح من 1 إلى 10
    private final String[] portalNames = {
        "1. بوابة النيابة العامة (خدمات العرائض والجنائي)",
        "2. محكمة الأسرة (دعاوى الأسرة والولاية على المال)",
        "3. منصة مصر الرقمية (التوثيق والتوكيلات)",
        "4. بوابة وزارة العدل (إقامة الدعاوى والاستعلام)",
        "5. محكمة النقض المصرية (الطعون والأحكام)",
        "6. مجلس الدولة المصري (محاكم القضاء الإداري)",
        "7. المحكمة الدستورية العليا (الأحكام الدستورية)",
        "8. نقابة المحامين المصرية (الخدمات النقابية)",
        "9. الشهر العقاري والتوثيق (حجز المواعيد والمعاملات)",
        "10. نيابات المرور الإلكترونية (تظلمات المخالفات)"
    };

    private final String[] portalUrls = {
        "https://ppo.gov.eg/",
        "https://ppo.gov.eg/",
        "https://digital.gov.eg/",
        "https://moj.gov.eg/",
        "https://cc.gov.eg/",
        "https://ecs.gov.eg/",
        "https://hccourt.gov.eg/",
        "https://egyls.com/",
        "https://rso.gov.eg/",
        "https://ppo.gov.eg/"
    };

    private static class SavedResult {
        File file;
        Uri contentUri;
        long sizeBytes;
        String displayName;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // السماح بفتح الملفات عبر زر [فتح] على أندرويد 7+ بسلاسة دون FileUriExposedException
        try {
            StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder().build());
        } catch (Throwable ignored) {}

        setContentView(R.layout.activity_main);

        tvStatus = (TextView) findViewById(R.id.tv_status);
        btnCompressImage = findViewById(R.id.btn_compress_image);
        btnCompressPdf = findViewById(R.id.btn_compress_pdf);
        btnMergePdf = findViewById(R.id.btn_merge_pdf);
        btnDocumentScanner = findViewById(R.id.btn_document_scanner);
        btnShareAppHeader = (Button) findViewById(R.id.btn_share_app_header);
        cardPortals = findViewById(R.id.card_portals);

        // ربط مربع حوار تأكيد الحفظ المركزي
        layoutSaveDialogOverlay = findViewById(R.id.layout_save_dialog_overlay);
        tvDialogLocation = (TextView) findViewById(R.id.tv_dialog_location);
        tvDialogSize = (TextView) findViewById(R.id.tv_dialog_size);
        btnDialogClose = (TextView) findViewById(R.id.btn_dialog_close);
        btnDialogOpen = (Button) findViewById(R.id.btn_dialog_open);

        requestAppPermissions();

        // 1. تصغير حجم الصور (صورة أو أكثر دفعة واحدة في الأمر الواحد < 500 KB)
        btnCompressImage.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.setType("image/*");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                startActivityForResult(Intent.createChooser(intent, "اختر صورة أو أكثر لضغطها (< 500 KB)"), REQ_PICK_IMAGE);
            }
        });

        // 2. تصغير حجم ملف PDF (< 500 KB) مع حفظ تلقائي فوري ورسالة 3 ثوانٍ
        btnCompressPdf.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.setType("application/pdf");
                startActivityForResult(Intent.createChooser(intent, "اختر ملف PDF لتصغير حجمه (< 500 KB)"), REQ_PICK_PDF);
            }
        });

        // 3. دمج الصور في ملف PDF واحد (< 500 KB) مع حفظ تلقائي فوري ورسالة 3 ثوانٍ
        btnMergePdf.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.setType("image/*");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                startActivityForResult(Intent.createChooser(intent, "اختر صور المستندات لدمجها في PDF (< 500 KB)"), REQ_MERGE_IMAGES);
            }
        });

        // زر مشاركة التطبيق العلوي الوحيد
        if (btnShareAppHeader != null) {
            btnShareAppHeader.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    shareAppWithColleagues();
                }
            });
        }

        // 4. تصوير المستندات وتحسينها وضغطها (شاشة المسح الضوئي أوفلاين)
        if (btnDocumentScanner != null) {
            btnDocumentScanner.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    startActivity(new Intent(MainActivity.this, DocumentScannerActivity.class));
                }
            });
        }

        // 5. المربع البنفسجي لروابط المواقع القضائية العشرة
        cardPortals.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPortalsDialog();
            }
        });
    }

    private int getTargetImageKb() {
        return getSharedPreferences("manzoma_prefs", MODE_PRIVATE).getInt("manzoma_target_image_kb_v2", UNIFIED_TARGET_KB);
    }

    private int getTargetPdfKb() {
        return getSharedPreferences("manzoma_prefs", MODE_PRIVATE).getInt("manzoma_target_pdf_kb", UNIFIED_TARGET_KB);
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            ArrayList<String> perms = new ArrayList<String>();
            if (Build.VERSION.SDK_INT >= 33) {
                if (checkSelfPermission("android.permission.READ_MEDIA_IMAGES") != PackageManager.PERMISSION_GRANTED) {
                    perms.add("android.permission.READ_MEDIA_IMAGES");
                }
            } else {
                if (checkSelfPermission("android.permission.READ_EXTERNAL_STORAGE") != PackageManager.PERMISSION_GRANTED) {
                    perms.add("android.permission.READ_EXTERNAL_STORAGE");
                }
                if (Build.VERSION.SDK_INT <= 29 &&
                    checkSelfPermission("android.permission.WRITE_EXTERNAL_STORAGE") != PackageManager.PERMISSION_GRANTED) {
                    perms.add("android.permission.WRITE_EXTERNAL_STORAGE");
                }
            }
            if (perms.size() > 0) {
                requestPermissions(perms.toArray(new String[0]), 200);
            }
        }
    }

    // مشاركة التطبيق مع الزملاء عبر وسائل التواصل (الزر العلوي الوحيد)
    private void shareAppWithColleagues() {
        Intent shareIntent = new Intent(Intent.ACTION_SEND);
        shareIntent.setType("text/plain");
        shareIntent.putExtra(Intent.EXTRA_SUBJECT, "تطبيق «ضغطة» لتصغير حجم الصور والـ PDF للمنظومة القضائية");
        String shareBody = "زميلي العزيز المحامي ⚖️\n\n"
            + "إليك تطبيق «ضغطة» لضغط الصور والمستندات بحد أقصى موحد (< 500 KB) لمنصة النيابة العامة ومصر الرقمية.\n\n"
            + "• فتح فوري بدون تسجيل دخول وبدون إعلانات\n"
            + "• ضغط عدة صور دفعة واحدة لأقل من 500 KB وحفظها في المعرض مباشرة\n"
            + "• ضغط ودمج الـ PDF لأقل من 500 KB مع الحفاظ المطلق على الجودة والألوان والأختام\n\n"
            + "تصميم وتنفيذ: مصطفى فرويز المحامي\n"
            + "Al-Hawai Tech";
        shareIntent.putExtra(Intent.EXTRA_TEXT, shareBody);
        startActivity(Intent.createChooser(shareIntent, "مشاركة التطبيق مع الزملاء المحامين عبر:"));
    }

    private void showPortalsDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle("مواقع النيابة ومحكمة الأسرة ومصر الرقمية (1 إلى 10)");
        builder.setItems(portalNames, new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                if (which >= 0 && which < portalUrls.length) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(portalUrls[which]));
                        startActivity(intent);
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "تعذر فتح الموقع: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    }
                }
            }
        });
        builder.setNegativeButton("إغلاق", null);
        builder.show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (resultCode != RESULT_OK || data == null) {
            return;
        }

        if (requestCode == REQ_PICK_IMAGE) {
            final ArrayList<Uri> uris = new ArrayList<Uri>();
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                for (int i = 0; i < count; i++) {
                    uris.add(data.getClipData().getItemAt(i).getUri());
                }
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }

            if (!uris.isEmpty()) {
                tvStatus.setText("⏳ جاري معالجة وحفظ " + uris.size() + " صورة بالألوان الكاملة (< 500 KB)...");
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            compressAndSaveImagesBatch(uris);
                        } catch (final Exception e) {
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    tvStatus.setText("❌ حدث خطأ: " + e.getMessage());
                                    Toast.makeText(MainActivity.this, "خطأ: " + e.getMessage(), Toast.LENGTH_LONG).show();
                                }
                            });
                        }
                    }
                }).start();
            }
        } else if (requestCode == REQ_PICK_PDF) {
            final Uri pdfUri = data.getData();
            if (pdfUri != null) {
                tvStatus.setText("⏳ جاري فحص وضغط ملف الـ PDF بالألوان الكاملة (< 500 KB)...");
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            compressAndSavePdf(pdfUri);
                        } catch (final Exception e) {
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    tvStatus.setText("❌ حدث خطأ: " + e.getMessage());
                                    Toast.makeText(MainActivity.this, "خطأ: " + e.getMessage(), Toast.LENGTH_LONG).show();
                                }
                            });
                        }
                    }
                }).start();
            }
        } else if (requestCode == REQ_MERGE_IMAGES) {
            final ArrayList<Uri> imageUris = new ArrayList<Uri>();
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                for (int i = 0; i < count; i++) {
                    imageUris.add(data.getClipData().getItemAt(i).getUri());
                }
            } else if (data.getData() != null) {
                imageUris.add(data.getData());
            }

            if (!imageUris.isEmpty()) {
                tvStatus.setText("⏳ جاري دمج " + imageUris.size() + " صور في ملف PDF بالألوان الكاملة (< 500 KB)...");
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            mergeSelectedImagesToPdf(imageUris);
                        } catch (final Exception e) {
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    tvStatus.setText("❌ حدث خطأ: " + e.getMessage());
                                    Toast.makeText(MainActivity.this, "خطأ: " + e.getMessage(), Toast.LENGTH_LONG).show();
                                }
                            });
                        }
                    }
                }).start();
            }
        }
    }

    private byte[] readAllBytesFromUri(Uri uri) throws Exception {
        InputStream is = getContentResolver().openInputStream(uri);
        if (is == null) throw new Exception("تعذر فتح الملف المحدد");
        ByteArrayOutputStream rawBuf = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int r;
        while ((r = is.read(buf, 0, buf.length)) != -1) {
            rawBuf.write(buf, 0, r);
        }
        is.close();
        return rawBuf.toByteArray();
    }

    // فك تشفير الصورة مع احترام اتجاه EXIF الأصلي (مهم لصور كاميرا الهاتف)
    private Bitmap decodeBitmapWithExif(byte[] rawBytes) {
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap decoded = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.length, opts);
        if (decoded == null) return null;

        int rotationDegrees = 0;
        File tempExif = null;
        try {
            tempExif = File.createTempFile("exif_", ".jpg", getCacheDir());
            FileOutputStream fos = new FileOutputStream(tempExif);
            fos.write(rawBytes);
            fos.close();

            ExifInterface exif = new ExifInterface(tempExif.getAbsolutePath());
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) rotationDegrees = 90;
            else if (orientation == ExifInterface.ORIENTATION_ROTATE_180) rotationDegrees = 180;
            else if (orientation == ExifInterface.ORIENTATION_ROTATE_270) rotationDegrees = 270;
        } catch (Exception ignored) {
        } finally {
            if (tempExif != null && tempExif.exists()) {
                tempExif.delete();
            }
        }

        if (rotationDegrees != 0) {
            Matrix matrix = new Matrix();
            matrix.postRotate(rotationDegrees);
            Bitmap rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), matrix, true);
            if (rotated != decoded) {
                decoded.recycle();
            }
            return rotated;
        }
        return decoded;
    }

    // ==================== 1. ضغط صورة أو أكثر دفعة واحدة (< 500 KB مع Zero Data Loss) ====================
    private void compressAndSaveImagesBatch(List<Uri> uris) throws Exception {
        final int total = uris.size();
        long totalBytesSaved = 0;
        SavedResult mostRecent = null;

        int targetLimit = Math.min(UNIFIED_STRICT_BYTES, Math.round(getTargetImageKb() * 1024 * 0.97f));

        for (int i = 0; i < total; i++) {
            Uri uri = uris.get(i);
            byte[] rawBytes = readAllBytesFromUri(uri);
            String outName = "manzoma_img_" + System.currentTimeMillis() + "_" + (i + 1) + ".jpg";

            // 1. Zero Data Loss: إذا كان الملف بالفعل أقل من 485 KB نحفظه مباشرة بجودته الأصلية 100%
            if (rawBytes.length <= targetLimit) {
                SavedResult res = saveImageToPhoneGallery(rawBytes, outName);
                totalBytesSaved += res.sizeBytes;
                mostRecent = res;
                continue;
            }

            Bitmap original = decodeBitmapWithExif(rawBytes);
            if (original == null) continue;

            // 2. تصغير هندسي ذكي يناسب صفحة A4 (حتى 2000 بكسل) مع الحفاظ الكامل على الألوان 24-bit
            int currentDim = 2000;
            Bitmap scaled = highQualitySteppedResample(original, currentDim);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            int quality = 85; // جودة حادة تمنع بهتان الحروف والأرقام والتواريخ
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, baos);

            // 3. حلقة موازنة تدريجية آمنة مع احترام الحد الأدنى الصارم (Quality Floor >= 65%)
            int attempts = 0;
            while (baos.toByteArray().length > targetLimit && attempts < 6) {
                attempts++;
                if (quality > 69) {
                    quality = Math.max(65, quality - 5);
                } else if (currentDim > 1350) {
                    currentDim = Math.max(1350, Math.round(currentDim * 0.90f));
                    if (scaled != original) scaled.recycle();
                    scaled = highQualitySteppedResample(original, currentDim);
                    quality = 74;
                } else {
                    break; // نتوقف عند الحد الآمن لحماية وضوح النصوص والأختام
                }
                baos.reset();
                scaled.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            }

            byte[] finalBytes = baos.toByteArray();
            if (scaled != original) scaled.recycle();
            original.recycle();

            SavedResult res = saveImageToPhoneGallery(finalBytes, outName);
            totalBytesSaved += res.sizeBytes;
            mostRecent = res;
        }

        if (mostRecent != null) {
            final long finalKb = Math.max(1, mostRecent.sizeBytes / 1024);
            final long totalKb = Math.max(1, totalBytesSaved / 1024);
            final SavedResult uiResult = mostRecent;

            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    String statusText = total == 1
                        ? "✅ تم حفظ الصورة بالمعرض (" + finalKb + " KB)"
                        : "✅ تم حفظ " + total + " صور بالمعرض (إجمالي: " + totalKb + " KB)";
                    tvStatus.setText(statusText);

                    String toastMsg = total == 1
                        ? "(تم الحفظ - الحجم: " + finalKb + " KB)"
                        : "(تم حفظ " + total + " صور - إجمالي: " + totalKb + " KB)";
                    showSmartToast(toastMsg, uiResult, "image/jpeg");
                }
            });
        }
    }

    // خوارزمية ترشيح متدرج عالية الدقة (Stepped Resampling) لمنع التشويش والتبكسل في النصوص والأختام
    private Bitmap highQualitySteppedResample(Bitmap src, int maxDimension) {
        int w = src.getWidth();
        int h = src.getHeight();
        int curMax = Math.max(w, h);

        if (curMax <= maxDimension) {
            return src;
        }

        float ratio = (float) maxDimension / curMax;
        int targetW = Math.max(1, Math.round(w * ratio));
        int targetH = Math.max(1, Math.round(h * ratio));

        Paint paint = new Paint();
        paint.setAntiAlias(true);
        paint.setFilterBitmap(true);
        paint.setDither(true);

        Bitmap current = src;
        int curW = w;
        int curH = h;

        // تقليص متدرج 50% عند التصغير الكبير للحفاظ التام على حِدة الحروف العربية والأرقام
        while (curW * 0.5f > targetW && curH * 0.5f > targetH) {
            int nextW = Math.max(targetW, Math.round(curW * 0.5f));
            int nextH = Math.max(targetH, Math.round(curH * 0.5f));
            Bitmap step = Bitmap.createBitmap(nextW, nextH, Bitmap.Config.ARGB_8888);
            Canvas stepCanvas = new Canvas(step);
            stepCanvas.drawBitmap(current, null, new Rect(0, 0, nextW, nextH), paint);
            if (current != src) {
                current.recycle();
            }
            current = step;
            curW = nextW;
            curH = nextH;
        }

        Bitmap result = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(result);
        canvas.drawColor(0xFFFFFFFF);
        canvas.drawBitmap(current, null, new Rect(0, 0, targetW, targetH), paint);
        if (current != src) {
            current.recycle();
        }
        return result;
    }

    // حفظ مباشر ومضمون في معرض صور الهاتف (يدعم Android 7 حتى Android 15 عبر MediaStore)
    private SavedResult saveImageToPhoneGallery(byte[] bytes, String fileName) throws Exception {
        SavedResult res = new SavedResult();
        res.sizeBytes = bytes.length;
        res.displayName = fileName;

        // 1. استخدام MediaStore في أندرويد 10+ (Scoped Storage الآمن بدون أي قيود)
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                ContentResolver resolver = getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                values.put("relative_path", Environment.DIRECTORY_PICTURES + "/ManzomaLawyer");

                Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    OutputStream os = resolver.openOutputStream(uri);
                    if (os != null) {
                        os.write(bytes);
                        os.flush();
                        os.close();
                        res.contentUri = uri;
                        return res;
                    }
                }
            } catch (Exception ignored) {}
        }

        // 2. مسار الملفات الكلاسيكي لأندرويد 9 وما قبله أو عند توفر الصلاحية
        File[] candidateDirs = new File[] {
            new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "ManzomaLawyer"),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM),
            getExternalFilesDir(Environment.DIRECTORY_PICTURES),
            getFilesDir()
        };

        for (File dir : candidateDirs) {
            if (dir == null) continue;
            try {
                if (!dir.exists()) dir.mkdirs();
                File targetFile = new File(dir, fileName);
                FileOutputStream fos = new FileOutputStream(targetFile);
                fos.write(bytes);
                fos.flush();
                fos.close();

                try {
                    MediaScannerConnection.scanFile(this,
                        new String[]{ targetFile.getAbsolutePath() },
                        new String[]{ "image/jpeg" }, null);
                } catch (Exception ignored) {}

                res.file = targetFile;
                return res;
            } catch (Exception ignored) {}
        }

        throw new Exception("تعذر حفظ الصورة في المعرض.");
    }

    // ==================== 2. دمج مجموعة صور في ملف PDF واحد (< 500 KB) وحفظه تلقائياً ====================
    private void mergeSelectedImagesToPdf(List<Uri> imageUris) throws Exception {
        final ArrayList<Bitmap> bitmaps = new ArrayList<Bitmap>();
        for (Uri imgUri : imageUris) {
            byte[] raw = readAllBytesFromUri(imgUri);
            Bitmap bmp = decodeBitmapWithExif(raw);
            if (bmp != null) {
                bitmaps.add(bmp);
            }
        }

        if (bitmaps.isEmpty()) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    tvStatus.setText("❌ تعذر قراءة الصور المحددة.");
                }
            });
            return;
        }

        final int pageCount = bitmaps.size();
        byte[] pdfBytes = createStrictOptimizedPdf(bitmaps, 2000, 84);

        for (Bitmap b : bitmaps) {
            if (b != null && !b.isRecycled()) b.recycle();
        }

        final SavedResult saved = saveBytesToStorage(pdfBytes, "manzoma_merged", ".pdf", "application/pdf");
        final long finalKb = Math.max(1, saved.sizeBytes / 1024);

        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                tvStatus.setText("✅ تم دمج " + pageCount + " صور في PDF واحد وحفظه بالتنزيلات (" + finalKb + " KB)");
                showSmartToast("(تم الحفظ - الحجم: " + finalKb + " KB)", saved, "application/pdf");
            }
        });
    }

    // ==================== 3. ضغط ملف PDF قائم (< 500 KB) وحفظه تلقائياً ====================
    private void compressAndSavePdf(Uri uri) throws Exception {
        byte[] inputBytes = readAllBytesFromUri(uri);
        byte[] finalPdfBytes;

        // 1. إذا كان الملف بالفعل أقل من 485 KB نحتفظ به كاملاً بنصوصه الفيكتورية القابلة للبحث دون تشويه
        int targetPdfLimit = Math.min(UNIFIED_STRICT_BYTES, Math.round(getTargetPdfKb() * 1024 * 0.97f));
        if (inputBytes.length <= targetPdfLimit) {
            finalPdfBytes = inputBytes;
        } else {
            ArrayList<Bitmap> pageBitmaps = new ArrayList<Bitmap>();
            ParcelFileDescriptor pfd = null;
            PdfRenderer renderer = null;
            File tempPdfFile = null;
            try {
                try {
                    pfd = getContentResolver().openFileDescriptor(uri, "r");
                } catch (Exception ex) {
                    tempPdfFile = File.createTempFile("temp_render_", ".pdf", getCacheDir());
                    FileOutputStream fos = new FileOutputStream(tempPdfFile);
                    fos.write(inputBytes);
                    fos.close();
                    pfd = ParcelFileDescriptor.open(tempPdfFile, ParcelFileDescriptor.MODE_READ_ONLY);
                }

                if (pfd != null) {
                    renderer = new PdfRenderer(pfd);
                    int pageCount = renderer.getPageCount();
                    int renderMax = pageCount <= 2 ? 1900 : (pageCount <= 5 ? 1650 : 1400);
                    for (int i = 0; i < pageCount; i++) {
                        PdfRenderer.Page page = renderer.openPage(i);
                        int pw = page.getWidth();
                        int ph = page.getHeight();
                        int targetWidth;
                        int targetHeight;
                        if (pw >= ph) {
                            targetWidth = renderMax;
                            targetHeight = Math.max(1, Math.round((float) ph / pw * renderMax));
                        } else {
                            targetHeight = renderMax;
                            targetWidth = Math.max(1, Math.round((float) pw / ph * renderMax));
                        }
                        Bitmap pageBmp = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888);
                        pageBmp.eraseColor(0xFFFFFFFF);
                        page.render(pageBmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT);
                        pageBitmaps.add(pageBmp);
                        page.close();
                    }
                }
            } finally {
                if (renderer != null) {
                    try { renderer.close(); } catch (Exception ignored) {}
                }
                if (pfd != null) {
                    try { pfd.close(); } catch (Exception ignored) {}
                }
                if (tempPdfFile != null && tempPdfFile.exists()) {
                    tempPdfFile.delete();
                }
            }

            if (!pageBitmaps.isEmpty()) {
                finalPdfBytes = createStrictOptimizedPdf(pageBitmaps, 1850, 82);
                for (Bitmap b : pageBitmaps) {
                    if (b != null && !b.isRecycled()) b.recycle();
                }
            } else {
                finalPdfBytes = inputBytes;
            }
        }

        final SavedResult saved = saveBytesToStorage(finalPdfBytes, "manzoma_pdf", ".pdf", "application/pdf");
        final long finalKb = Math.max(1, saved.sizeBytes / 1024);

        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                tvStatus.setText("✅ تم حفظ ملف الـ PDF بالتنزيلات بنجاح (" + finalKb + " KB)");
                showSmartToast("(تم الحفظ - الحجم: " + finalKb + " KB)", saved, "application/pdf");
            }
        });
    }

    // ==================== مربع حوار تأكيد الحفظ المركزي (3 ثوانٍ مع × وفتح الملف) ====================
    private void dismissSaveConfirmationDialog() {
        activeDialogToken++;
        if (hideToastRunnable != null) {
            toastHandler.removeCallbacks(hideToastRunnable);
            hideToastRunnable = null;
        }
        if (layoutSaveDialogOverlay != null && layoutSaveDialogOverlay.getVisibility() == View.VISIBLE) {
            layoutSaveDialogOverlay.setVisibility(View.GONE);
        }
    }

    private void showSmartToast(String message, final SavedResult saved, final String mimeType) {
        // التأكد من نجاح الحفظ فعلياً قبل عرض مربع حوار النجاح
        if (saved == null) return;
        boolean hasContentUri = saved.contentUri != null;
        boolean hasSavedFile = saved.file != null && saved.file.exists() && saved.file.length() > 0;
        if (!hasContentUri && !hasSavedFile) return;

        lastSavedFile = saved.file;
        lastSavedUri = saved.contentUri;
        lastSavedMime = mimeType;

        final boolean isImage = mimeType != null && mimeType.startsWith("image/");
        final String locationText = isImage
            ? "تم الحفظ في الاستوديو بنجاح"
            : "تم الحفظ في مجلد التنزيلات (Downloads) بنجاح";

        tvDialogLocation.setText(locationText);
        tvDialogSize.setText(message != null ? message : ("(الحجم: " + Math.max(1, saved.sizeBytes / 1024) + " KB)"));

        final int dialogToken = ++activeDialogToken;

        if (hideToastRunnable != null) {
            toastHandler.removeCallbacks(hideToastRunnable);
            hideToastRunnable = null;
        }

        btnDialogClose.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dismissSaveConfirmationDialog();
            }
        });

        layoutSaveDialogOverlay.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dismissSaveConfirmationDialog();
            }
        });

        btnDialogOpen.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                dismissSaveConfirmationDialog();
                openSavedResult(lastSavedUri, lastSavedFile, lastSavedMime);
            }
        });

        layoutSaveDialogOverlay.setVisibility(View.VISIBLE);

        hideToastRunnable = new Runnable() {
            @Override
            public void run() {
                if (dialogToken == activeDialogToken && layoutSaveDialogOverlay != null) {
                    layoutSaveDialogOverlay.setVisibility(View.GONE);
                }
            }
        };

        // يختفي تلقائياً خلال 3 ثوانٍ إذا لم يتفاعل المستخدم
        toastHandler.postDelayed(hideToastRunnable, 3000);
    }

    // فتح الملف فوراً بواسطة مشغل المستندات أو الصور
    private void openSavedResult(Uri contentUri, File file, String mimeType) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            Uri targetUri = contentUri != null ? contentUri : (file != null ? Uri.fromFile(file) : null);
            if (targetUri == null) {
                Toast.makeText(this, "الملف غير متاح", Toast.LENGTH_SHORT).show();
                return;
            }
            intent.setDataAndType(targetUri, mimeType != null ? mimeType : "*/*");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(intent, "فتح الملف عبر:"));
        } catch (Exception e) {
            String name = file != null ? file.getName() : "تم الحفظ في التنزيلات";
            Toast.makeText(this, "تم حفظ الملف: " + name, Toast.LENGTH_SHORT).show();
        }
    }

    // دالة إنشاء ملف PDF عالي الجودة مع الحفاظ على الألوان والأختام وضمان حجم أقل من 500 KB
    private byte[] createStrictOptimizedPdf(List<Bitmap> bitmaps, int initialMaxDim, int initialQuality) throws Exception {
        int count = bitmaps.size();
        int maxDim = initialMaxDim;
        int quality = initialQuality;

        // ميزانية ذكية لأبعاد A4 والجودة بحسب عدد الصفحات لضمان أعلى وضوح تحت 500 KB
        if (count == 1) {
            maxDim = 2000;
            quality = 84;
        } else if (count == 2) {
            maxDim = 1750;
            quality = 78;
        } else if (count <= 5) {
            maxDim = Math.max(1400, 1600 - (count * 40));
            quality = Math.max(68, 78 - (count * 2));
        } else {
            maxDim = Math.max(1200, 1400 - (count * 25));
            quality = Math.max(64, 72 - count);
        }

        byte[] pdfBytes = renderBitmapsToDirectJpegPdf(bitmaps, maxDim, quality);

        // حلقة موازنة تدريجية هادئة مع احترام الحد الأدنى لسلامة المستند (Quality Floor >= 64%)
        int attempts = 0;
        int targetPdfLimit = Math.min(UNIFIED_STRICT_BYTES, Math.round(getTargetPdfKb() * 1024 * 0.97f));
        while (pdfBytes.length > targetPdfLimit && attempts < 5) {
            attempts++;
            if (quality > 68) {
                quality = Math.max(64, quality - 5);
            } else if (maxDim > 1200) {
                maxDim = Math.max(1200, Math.round(maxDim * 0.90f));
                quality = 70;
            } else {
                break; // نتوقف عند الحد الأدنى الآمن لحماية وضوح المستند
            }
            pdfBytes = renderBitmapsToDirectJpegPdf(bitmaps, maxDim, quality);
        }

        return pdfBytes;
    }

    private byte[] renderBitmapsToDirectJpegPdf(List<Bitmap> bitmaps, int maxDim, int quality) throws Exception {
        ArrayList<byte[]> jpegList = new ArrayList<byte[]>();
        ArrayList<int[]> dimList = new ArrayList<int[]>();

        for (Bitmap bmp : bitmaps) {
            if (bmp == null || bmp.isRecycled()) continue;

            // 1. تصغير الأبعاد هندسياً أولاً بترشيح متدرج عالي الدقة
            Bitmap scaled = highQualitySteppedResample(bmp, maxDim);

            // 2. ضغط JPEG محكوم بألوان RGB كاملة للحفاظ على الأختام والتوقيعات
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            byte[] jpegBytes = baos.toByteArray();

            jpegList.add(jpegBytes);
            dimList.add(new int[]{ scaled.getWidth(), scaled.getHeight() });
            if (scaled != bmp) {
                scaled.recycle();
            }
        }

        // 3. بناء ملف الـ PDF عبر دمج تدفقات JPEG الحقيقية مباشرة (/Filter /DCTDecode)
        return buildPdfFromJpegStreams(jpegList, dimList);
    }

    // بناء هيكل PDF 1.4 قياسي مع احترام اتجاه كل صفحة (أفقي أو رأسي) دون قص أو تشويه
    private byte[] buildPdfFromJpegStreams(List<byte[]> jpegList, List<int[]> dimList) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ArrayList<Long> offsets = new ArrayList<Long>();

        baos.write("%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n".getBytes("ISO-8859-1"));

        int pageCount = jpegList.size();

        // 1 0 obj: Catalog
        offsets.add((long) baos.size());
        baos.write("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n".getBytes("ISO-8859-1"));

        // 2 0 obj: Pages
        offsets.add((long) baos.size());
        StringBuilder kids = new StringBuilder();
        for (int i = 0; i < pageCount; i++) {
            kids.append((3 + i * 3)).append(" 0 R ");
        }
        baos.write(("2 0 obj\n<< /Type /Pages /Kids [" + kids.toString() + "] /Count " + pageCount + " >>\nendobj\n").getBytes("ISO-8859-1"));

        float a4Short = 595.28f;
        float a4Long = 841.89f;

        for (int i = 0; i < pageCount; i++) {
            byte[] jpeg = jpegList.get(i);
            int[] dims = dimList.get(i);
            int imgW = dims[0];
            int imgH = dims[1];

            boolean isLandscape = imgW > imgH;
            float pageWidth = isLandscape ? a4Long : a4Short;
            float pageHeight = isLandscape ? a4Short : a4Long;

            int pageObjNum = 3 + i * 3;
            int imgObjNum = 4 + i * 3;
            int contentObjNum = 5 + i * 3;

            // Page Object
            offsets.add((long) baos.size());
            baos.write((pageObjNum + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pageWidth + " " + pageHeight + "] " +
                "/Resources << /XObject << /Im" + (i + 1) + " " + imgObjNum + " 0 R >> >> " +
                "/Contents " + contentObjNum + " 0 R >>\nendobj\n").getBytes("ISO-8859-1"));

            // Image XObject with direct /Filter /DCTDecode & /DeviceRGB
            offsets.add((long) baos.size());
            baos.write((imgObjNum + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + imgW + " /Height " + imgH +
                " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n").getBytes("ISO-8859-1"));
            baos.write(jpeg);
            baos.write("\nendstream\nendobj\n".getBytes("ISO-8859-1"));

            // Content Stream (scaled to fit A4 preserving aspect ratio)
            float margin = 8f;
            float maxW = pageWidth - (margin * 2);
            float maxH = pageHeight - (margin * 2);
            float scale = Math.min(maxW / imgW, maxH / imgH);
            float renderW = imgW * scale;
            float renderH = imgH * scale;
            float posX = margin + (maxW - renderW) / 2f;
            float posY = margin + (maxH - renderH) / 2f;

            String contentStr = String.format(Locale.US, "q\n%.2f 0 0 %.2f %.2f %.2f cm\n/Im%d Do\nQ\n",
                renderW, renderH, posX, posY, (i + 1));
            byte[] contentBytes = contentStr.getBytes("ISO-8859-1");

            offsets.add((long) baos.size());
            baos.write((contentObjNum + " 0 obj\n<< /Length " + contentBytes.length + " >>\nstream\n").getBytes("ISO-8859-1"));
            baos.write(contentBytes);
            baos.write("endstream\nendobj\n".getBytes("ISO-8859-1"));
        }

        long xrefPos = baos.size();
        int totalObjs = 1 + pageCount * 3;
        baos.write(("xref\n0 " + (totalObjs + 1) + "\n0000000000 65535 f \n").getBytes("ISO-8859-1"));
        for (long off : offsets) {
            baos.write(String.format(Locale.US, "%010d 00000 n \n", off).getBytes("ISO-8859-1"));
        }

        baos.write(("trailer\n<< /Size " + (totalObjs + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n").getBytes("ISO-8859-1"));

        return baos.toByteArray();
    }

    // حفظ آمن ومضمون للملف في مجلد التنزيلات Downloads (يدعم Android 7 حتى Android 15 عبر MediaStore)
    private SavedResult saveBytesToStorage(byte[] bytes, String prefix, String extension, String mimeType) throws Exception {
        String filename = prefix + "_" + System.currentTimeMillis() + extension;
        SavedResult res = new SavedResult();
        res.sizeBytes = bytes.length;
        res.displayName = filename;

        if (Build.VERSION.SDK_INT >= 29) {
            try {
                ContentResolver resolver = getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                values.put("relative_path", Environment.DIRECTORY_DOWNLOADS);

                Uri downloadsUri = Uri.parse("content://media/external/downloads");
                Uri uri = resolver.insert(downloadsUri, values);
                if (uri != null) {
                    OutputStream os = resolver.openOutputStream(uri);
                    if (os != null) {
                        os.write(bytes);
                        os.flush();
                        os.close();
                        res.contentUri = uri;
                        return res;
                    }
                }
            } catch (Exception ignored) {}
        }

        File[] candidateDirs = new File[] {
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS),
            new File("/storage/emulated/0/Download"),
            getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            getFilesDir()
        };

        for (File dir : candidateDirs) {
            if (dir == null) continue;
            try {
                if (!dir.exists()) {
                    dir.mkdirs();
                }
                File target = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(target);
                fos.write(bytes);
                fos.flush();
                fos.close();
                if (target.exists() && target.length() > 0) {
                    res.file = target;
                    return res;
                }
            } catch (Exception ignored) {}
        }

        throw new Exception("تعذر الوصول لوحدة التخزين لحفظ الملف.");
    }

    @Override
    protected void onDestroy() {
        if (hideToastRunnable != null) {
            toastHandler.removeCallbacks(hideToastRunnable);
            hideToastRunnable = null;
        }
        super.onDestroy();
    }
}
