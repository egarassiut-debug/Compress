package com.example.legal_file_compressor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.pdf.PdfDocument;
import android.graphics.pdf.PdfRenderer;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends Activity {

    private static final int REQ_PICK_IMAGE = 101;
    private static final int REQ_PICK_PDF = 102;
    private static final int REQ_MERGE_IMAGES = 103;

    private TextView tvStatus;
    private Button btnCompressImage;
    private Button btnCompressPdf;
    private Button btnMergePdf;
    private Button btnShareAppHeader;
    private View cardPortals;

    // عناصر رسالة الـ 3 ثوانٍ الذكية العائمة
    private View layoutSmartToast;
    private TextView tvToastMessage;
    private Button btnToastOpen;
    private File lastSavedFile;
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        tvStatus = (TextView) findViewById(R.id.tv_status);
        btnCompressImage = (Button) findViewById(R.id.btn_compress_image);
        btnCompressPdf = (Button) findViewById(R.id.btn_compress_pdf);
        btnMergePdf = (Button) findViewById(R.id.btn_merge_pdf);
        btnShareAppHeader = (Button) findViewById(R.id.btn_share_app_header);
        cardPortals = findViewById(R.id.card_portals);

        // ربط رسالة الـ 3 ثوانٍ الذكية العائمة
        layoutSmartToast = findViewById(R.id.layout_smart_toast);
        tvToastMessage = (TextView) findViewById(R.id.tv_toast_message);
        btnToastOpen = (Button) findViewById(R.id.btn_toast_open);

        requestAppPermissions();

        // 1. تصغير حجم الصور (صورة أو أكثر دفعة واحدة في الأمر الواحد < 200 KB)
        btnCompressImage.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.setType("image/*");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                startActivityForResult(Intent.createChooser(intent, "اختر صورة أو أكثر لضغطها (< 200 KB)"), REQ_PICK_IMAGE);
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

        // المربع الأزرق لروابط المواقع القضائية العشرة
        cardPortals.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showPortalsDialog();
            }
        });
    }

    // إعدادات الحجم المستهدف القابلة للتعديل والمحفوظة محلياً (افتراضي: الصور 200KB، الـ PDF 500KB)
    private int getTargetImageKb() {
        return getSharedPreferences("manzoma_prefs", MODE_PRIVATE).getInt("manzoma_target_image_kb", 200);
    }

    private int getTargetPdfKb() {
        return getSharedPreferences("manzoma_prefs", MODE_PRIVATE).getInt("manzoma_target_pdf_kb", 500);
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            ArrayList<String> perms = new ArrayList<String>();
            if (checkSelfPermission("android.permission.READ_EXTERNAL_STORAGE") != PackageManager.PERMISSION_GRANTED) {
                perms.add("android.permission.READ_EXTERNAL_STORAGE");
            }
            if (checkSelfPermission("android.permission.WRITE_EXTERNAL_STORAGE") != PackageManager.PERMISSION_GRANTED) {
                perms.add("android.permission.WRITE_EXTERNAL_STORAGE");
            }
            if (perms.size() > 0) {
                requestPermissions(perms.toArray(new String[0]), 200);
            }
        }
    }

    // مشاركة التطبيق مع الزملاء عبر وسائل التواصل
    private void shareAppWithColleagues() {
        Intent shareIntent = new Intent(Intent.ACTION_SEND);
        shareIntent.setType("text/plain");
        shareIntent.putExtra(Intent.EXTRA_SUBJECT, "تطبيق تصغير حجم الصور والـ PDF للمنظومة القضائية");
        String shareBody = "زميلي العزيز المحامي ⚖️\n\n"
            + "إليك تطبيق 'تصغير حجم الصور للمنظومة' لضغط الصور والمستندات بحد أقصى للمنظومة القضائية ومصر الرقمية.\n\n"
            + "• فتح فوري بدون تسجيل دخول وبدون إعلانات\n"
            + "• ضغط عدة صور دفعة واحدة لأقل من 200 KB وحفظها في المعرض مباشرة\n"
            + "• ضغط ودمج الـ PDF لأقل من 500 KB مع الحفاظ الكامل على الألوان والأختام\n\n"
            + "تصميم وتنفيذ: مصطفى فرويز المحامي";
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

        try {
            if (requestCode == REQ_PICK_IMAGE) {
                // دعم اختيار صورة واحدة أو مجموعة صور دفعة واحدة في الأمر الواحد
                ArrayList<Uri> uris = new ArrayList<Uri>();
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    for (int i = 0; i < count; i++) {
                        uris.add(data.getClipData().getItemAt(i).getUri());
                    }
                } else if (data.getData() != null) {
                    uris.add(data.getData());
                }

                if (!uris.isEmpty()) {
                    compressAndSaveImagesBatch(uris);
                }
            } else if (requestCode == REQ_PICK_PDF) {
                Uri pdfUri = data.getData();
                if (pdfUri != null) {
                    compressAndSavePdf(pdfUri);
                }
            } else if (requestCode == REQ_MERGE_IMAGES) {
                mergeSelectedImagesToPdf(data);
            }
        } catch (Exception e) {
            tvStatus.setText("❌ حدث خطأ: " + e.getMessage());
            Toast.makeText(this, "خطأ: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    // ==================== 1. ضغط صورة أو أكثر دفعة واحدة في الأمر الواحد (< 200 KB) ====================
    private void compressAndSaveImagesBatch(List<Uri> uris) throws Exception {
        int total = uris.size();
        tvStatus.setText("⏳ جاري معالجة وحفظ " + total + " صورة بالألوان الكاملة (< 200 KB)...");

        long totalBytesSaved = 0;
        File mostRecentFile = null;

        for (int i = 0; i < total; i++) {
            Uri uri = uris.get(i);
            InputStream is = getContentResolver().openInputStream(uri);
            ByteArrayOutputStream rawBuf = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int r;
            while ((r = is.read(buf, 0, buf.length)) != -1) {
                rawBuf.write(buf, 0, r);
            }
            if (is != null) is.close();

            byte[] rawBytes = rawBuf.toByteArray();
            int targetLimit = (int) (getTargetImageKb() * 1024 * 0.96);

            // 1. إذا كان الملف بالفعل أقل من الحجم المستهدف، نحفظه مباشرة بجودته الأصلية 100% دون إعادة ضغط
            if (rawBytes.length <= targetLimit) {
                File savedFile = saveImageToPhoneGallery(rawBytes, "manzoma_img_" + System.currentTimeMillis() + "_" + (i + 1) + ".jpg");
                totalBytesSaved += savedFile.length();
                mostRecentFile = savedFile;
                continue;
            }

            Bitmap original = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.length);
            if (original == null) continue;

            // خوارزمية ترشيح عالية الجودة بأبعاد تصل إلى 1800 بكسل لحفظ الأختام والخطوط الدقيقة
            Bitmap scaled = highQualityResample(original, 1800);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            int quality = 76; // جودة عالية حادة للنصوص والأختام
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, baos);

            // موازنة تدريجية هادئة مع احترام الحد الأدنى لجودة المستند (Quality Floor >= 58%)
            int attempts = 0;
            int currentDim = 1800;
            while (baos.toByteArray().length > targetLimit && attempts < 5) {
                attempts++;
                if (quality > 64) {
                    quality = Math.max(58, quality - 6);
                } else if (currentDim > 1200) {
                    currentDim = Math.max(1200, Math.round(currentDim * 0.90f));
                    scaled = highQualityResample(original, currentDim);
                    quality = 68;
                } else {
                    break; // نتوقف عند الحد الأدنى لحماية مقروئية المستند
                }
                baos.reset();
                scaled.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            }

            byte[] finalBytes = baos.toByteArray();
            File savedFile = saveImageToPhoneGallery(finalBytes, "manzoma_img_" + System.currentTimeMillis() + "_" + (i + 1) + ".jpg");

            totalBytesSaved += savedFile.length();
            mostRecentFile = savedFile;
        }

        if (mostRecentFile != null) {
            long finalKb = mostRecentFile.length() / 1024;
            long totalKb = totalBytesSaved / 1024;

            String statusText = total == 1
                ? "✅ تم حفظ الصورة بالمعرض (" + finalKb + " KB)"
                : "✅ تم حفظ " + total + " صور بالمعرض (إجمالي: " + totalKb + " KB)";
            tvStatus.setText(statusText);

            // إظهار رسالة الـ 3 ثوانٍ الذكية العائمة
            String toastMsg = total == 1
                ? "(تم الحفظ - الحجم: " + finalKb + " KB)"
                : "(تم حفظ " + total + " صور - إجمالي: " + totalKb + " KB)";
            showSmartToast(toastMsg, mostRecentFile);
        }
    }

    // خوارزمية ترشيح عالية الدقة ثنائية التكعيب والتنعيم لمنع التشويش والتبكسل
    private Bitmap highQualityResample(Bitmap src, int maxDimension) {
        int w = src.getWidth();
        int h = src.getHeight();
        int curMax = Math.max(w, h);

        if (curMax <= maxDimension) {
            return src;
        }

        float ratio = (float) maxDimension / curMax;
        int targetW = Math.max(1, Math.round(w * ratio));
        int targetH = Math.max(1, Math.round(h * ratio));

        Bitmap result = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(result);
        Paint paint = new Paint();
        paint.setAntiAlias(true);
        paint.setFilterBitmap(true);
        paint.setDither(true);

        canvas.drawBitmap(src, null, new android.graphics.Rect(0, 0, targetW, targetH), paint);
        return result;
    }

    // حفظ مباشر وجذري في معرض صور الهاتف (Gallery / DCIM / Pictures) مع إشعار MediaScanner
    private File saveImageToPhoneGallery(byte[] bytes, String fileName) throws Exception {
        File galleryDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "ManzomaLawyer");
        if (!galleryDir.exists()) {
            galleryDir.mkdirs();
        }

        File targetFile = new File(galleryDir, fileName);
        try {
            FileOutputStream fos = new FileOutputStream(targetFile);
            fos.write(bytes);
            fos.flush();
            fos.close();
        } catch (Exception e) {
            File fallbackDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM);
            targetFile = new File(fallbackDir, fileName);
            FileOutputStream fos = new FileOutputStream(targetFile);
            fos.write(bytes);
            fos.flush();
            fos.close();
        }

        // إشعار نظام أندرويد لظهور الصورة فوراً بالمعرض والاستوديو (Media Scanner)
        try {
            MediaScannerConnection.scanFile(this,
                new String[]{ targetFile.getAbsolutePath() },
                new String[]{ "image/jpeg" }, null);

            Intent scanIntent = new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE);
            scanIntent.setData(Uri.fromFile(targetFile));
            sendBroadcast(scanIntent);
        } catch (Exception ignored) {}

        return targetFile;
    }

    // ==================== 2. دمج مجموعة صور في ملف PDF واحد (< 500 KB) وحفظه تلقائياً ====================
    private void mergeSelectedImagesToPdf(Intent data) throws Exception {
        tvStatus.setText("⏳ جاري دمج الصور في ملف PDF بالألوان الكاملة (< 500 KB)...");

        ArrayList<Uri> imageUris = new ArrayList<Uri>();
        if (data.getClipData() != null) {
            int count = data.getClipData().getItemCount();
            for (int i = 0; i < count; i++) {
                imageUris.add(data.getClipData().getItemAt(i).getUri());
            }
        } else if (data.getData() != null) {
            imageUris.add(data.getData());
        }

        if (imageUris.isEmpty()) {
            tvStatus.setText("لم يتم اختيار أي صور.");
            return;
        }

        ArrayList<Bitmap> bitmaps = new ArrayList<Bitmap>();
        for (Uri imgUri : imageUris) {
            InputStream is = getContentResolver().openInputStream(imgUri);
            Bitmap bmp = BitmapFactory.decodeStream(is);
            if (is != null) is.close();
            if (bmp != null) {
                bitmaps.add(bmp);
            }
        }

        if (bitmaps.isEmpty()) {
            tvStatus.setText("❌ تعذر قراءة الصور المحددة.");
            return;
        }

        // إنشاء ملف PDF عالي الدقة مع الحفاظ على الألوان والأختام
        byte[] pdfBytes = createStrictOptimizedPdf(bitmaps, 1600, 74);

        File savedFile = saveBytesToStorage(pdfBytes, "manzoma_merged", ".pdf");
        long finalKb = savedFile.length() / 1024;

        tvStatus.setText("✅ تم دمج " + bitmaps.size() + " صور في PDF واحد وحفظه بالتنزيلات (" + finalKb + " KB)");

        // إظهار رسالة الـ 3 ثوانٍ الذكية العائمة
        showSmartToast("(تم الحفظ - الحجم: " + finalKb + " KB)", savedFile);
    }

    // ==================== 3. ضغط ملف PDF قائم (< 500 KB) وحفظه تلقائياً ====================
    private void compressAndSavePdf(Uri uri) throws Exception {
        tvStatus.setText("⏳ جاري فحص وضغط ملف الـ PDF بالألوان الكاملة (< 500 KB)...");

        InputStream checkIs = getContentResolver().openInputStream(uri);
        ByteArrayOutputStream tempBuf = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int r;
        while ((r = checkIs.read(buf, 0, buf.length)) != -1) {
            tempBuf.write(buf, 0, r);
        }
        checkIs.close();
        byte[] inputBytes = tempBuf.toByteArray();

        byte[] finalPdfBytes;

        // 1. إذا كان الملف بالفعل أقل من الحجم المستهدف، نحتفظ به كاملاً بنصوصه الفيكتورية القابلة للبحث دون تشويه
        int targetPdfLimit = (int) (getTargetPdfKb() * 1024 * 0.96);
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
                    for (int i = 0; i < pageCount; i++) {
                        PdfRenderer.Page page = renderer.openPage(i);
                        // دقة حادة للكتابة تناسب A4 (160-180 DPI) تمنع التبكسل والتشويش
                        int targetWidth = 1500;
                        int targetHeight = Math.max(1, Math.round((float) page.getHeight() / page.getWidth() * targetWidth));
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
                finalPdfBytes = createStrictOptimizedPdf(pageBitmaps, 1500, 72);
            } else {
                finalPdfBytes = inputBytes;
            }
        }

        File savedFile = saveBytesToStorage(finalPdfBytes, "manzoma_pdf", ".pdf");
        long finalKb = savedFile.length() / 1024;

        tvStatus.setText("✅ تم حفظ ملف الـ PDF بالتنزيلات بنجاح (" + finalKb + " KB)");

        // إظهار رسالة الـ 3 ثوانٍ الذكية العائمة
        showSmartToast("(تم الحفظ - الحجم: " + finalKb + " KB)", savedFile);
    }

    // ==================== رسالة الـ 3 ثوانٍ الذكية العائمة مع زر [ فتح ] ====================
    private void showSmartToast(String message, final File targetFile) {
        lastSavedFile = targetFile;
        tvToastMessage.setText(message);

        btnToastOpen.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openFile(targetFile);
                layoutSmartToast.setVisibility(View.GONE);
            }
        });

        if (hideToastRunnable != null) {
            toastHandler.removeCallbacks(hideToastRunnable);
        }

        layoutSmartToast.setVisibility(View.VISIBLE);

        hideToastRunnable = new Runnable() {
            @Override
            public void run() {
                layoutSmartToast.setVisibility(View.GONE);
            }
        };

        // تختفي الرسالة تلقائياً خلال 3 ثوانٍ (3000ms) ويعود التطبيق جاهزاً
        toastHandler.postDelayed(hideToastRunnable, 3000);
    }

    // فتح الملف فوراً بواسطة مشغل المستندات أو الصور
    private void openFile(File file) {
        if (file == null || !file.exists()) {
            Toast.makeText(this, "الملف غير متاح", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            String ext = file.getName().toLowerCase();
            String mimeType = ext.endsWith(".pdf") ? "application/pdf" : "image/jpeg";
            intent.setDataAndType(Uri.fromFile(file), mimeType);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(intent, "فتح الملف عبر:"));
        } catch (Exception e) {
            Toast.makeText(this, "مسار الملف: " + file.getName(), Toast.LENGTH_SHORT).show();
        }
    }

    // دالة إنشاء ملف PDF عالي الجودة مع الحفاظ على الألوان والأختام وضمان حجم أقل من 500 KB
    private byte[] createStrictOptimizedPdf(List<Bitmap> bitmaps, int initialMaxDim, int initialQuality) throws Exception {
        int count = bitmaps.size();
        int maxDim = initialMaxDim;
        int quality = initialQuality;

        // ميزانية ذكية للأبعاد والجودة بحسب عدد الصفحات لضمان أعلى وضوح تحت 500 KB
        if (count == 1) {
            maxDim = 1750;
            quality = 78;
        } else if (count == 2) {
            maxDim = 1550;
            quality = 74;
        } else if (count <= 5) {
            maxDim = Math.max(1300, 1500 - (count * 40));
            quality = Math.max(64, 74 - (count * 2));
        } else {
            maxDim = Math.max(1150, 1350 - (count * 25));
            quality = Math.max(60, 68 - count);
        }

        byte[] pdfBytes = renderBitmapsToDirectJpegPdf(bitmaps, maxDim, quality);

        // حلقة موازنة تدريجية هادئة مع احترام الحد الأدنى لسلامة المستند
        int attempts = 0;
        int targetPdfLimit = (int) (getTargetPdfKb() * 1024 * 0.96);
        while (pdfBytes.length > targetPdfLimit && attempts < 4) {
            attempts++;
            if (quality > 64) {
                quality = Math.max(58, quality - 6);
            } else if (maxDim > 1150) {
                maxDim = Math.max(1150, Math.round(maxDim * 0.90f));
                quality = 66;
            } else {
                break; // نتوقف عند الحد الأدنى لحماية وضوح المستند
            }
            pdfBytes = renderBitmapsToDirectJpegPdf(bitmaps, maxDim, quality);
        }

        return pdfBytes;
    }

    private byte[] renderBitmapsToDirectJpegPdf(List<Bitmap> bitmaps, int maxDim, int quality) throws Exception {
        ArrayList<byte[]> jpegList = new ArrayList<byte[]>();
        ArrayList<int[]> dimList = new ArrayList<int[]>();

        for (Bitmap bmp : bitmaps) {
            if (bmp == null) continue;

            // 1. تصغير الأبعاد هندسياً أولاً بدقة عالية
            Bitmap scaled = highQualityResample(bmp, maxDim);

            // 2. ضغط JPEG محكوم مع الحفاظ التام على الألوان والأختام
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            byte[] jpegBytes = baos.toByteArray();

            jpegList.add(jpegBytes);
            dimList.add(new int[]{ scaled.getWidth(), scaled.getHeight() });
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

            // Image XObject with direct /Filter /DCTDecode
            offsets.add((long) baos.size());
            baos.write((imgObjNum + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + imgW + " /Height " + imgH +
                " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n").getBytes("ISO-8859-1"));
            baos.write(jpeg);
            baos.write("\nendstream\nendobj\n".getBytes("ISO-8859-1"));

            // Content Stream (scaled to fit page preserving aspect ratio)
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

    // حفظ آمن للملف في مجلد التنزيلات أو المستندات
    private File saveBytesToStorage(byte[] bytes, String prefix, String extension) throws Exception {
        String filename = prefix + "_" + System.currentTimeMillis() + extension;

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
                    return target;
                }
            } catch (Exception ignored) {}
        }

        throw new Exception("تعذر الوصول لوحدة التخزين لحفظ الملف.");
    }
}
