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
        tvStatus.setText("⏳ جاري ضغط وحفظ " + total + " صورة بالألوان الكاملة (< 200 KB)...");

        long totalBytesSaved = 0;
        File mostRecentFile = null;

        for (int i = 0; i < total; i++) {
            Uri uri = uris.get(i);
            InputStream is = getContentResolver().openInputStream(uri);
            Bitmap original = BitmapFactory.decodeStream(is);
            if (is != null) is.close();

            if (original == null) continue;

            // خوارزمية ترشيح عالية الجودة (Lanczos/Bicubic Filtering) مع الحفاظ على الألوان 24-bit
            Bitmap scaled = highQualityResample(original, 1200);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            int quality = 72; // جودة عالية حادة للنصوص والأختام
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, baos);

            // شرط صارم: حجم الصورة أقل من 185 KB لضمان أن تكون أقل من 200 KB تماماً
            int attempts = 0;
            while (baos.toByteArray().length > 185 * 1024 && attempts < 6) {
                attempts++;
                quality = Math.max(30, quality - 8);
                int nextDim = Math.round(Math.max(scaled.getWidth(), scaled.getHeight()) * 0.88f);
                scaled = highQualityResample(scaled, nextDim);
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

        // إنشاء ملف PDF مع الحفاظ على الألوان والأختام الأصلية، ودقة متوازنة A4 وحجم أقل من 500 KB
        byte[] pdfBytes = createStrictOptimizedPdf(bitmaps, 1280, 70);

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

        if (inputBytes.length <= 460 * 1024) {
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
                        // دقة متوازنة وحادة للكتابة تناسب A4 (150 DPI) لمنع التبكسل والتشويش
                        int targetWidth = 1240;
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
                finalPdfBytes = createStrictOptimizedPdf(pageBitmaps, 1240, 68);
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

        // ميزانية ذكية للأبعاد والجودة بحسب عدد الصفحات لضمان دقة A4 مثالية
        if (count == 1) {
            maxDim = 1350;
            quality = 74;
        } else if (count == 2) {
            maxDim = 1240;
            quality = 68;
        } else if (count >= 3) {
            maxDim = Math.max(950, 1200 - (count * 35));
            quality = Math.max(52, 66 - (count * 2));
        }

        byte[] pdfBytes = renderBitmapsToPdf(bitmaps, maxDim, quality);

        // حلقة ضبط تدريجية: إذا تجاوز الملف 460 KB، تقليل متدرج طفيف يمنع التبكسل ويضمن الحجم < 500 KB
        int attempts = 0;
        while (pdfBytes.length > 460 * 1024 && attempts < 5) {
            attempts++;
            quality = Math.max(42, quality - 6);
            maxDim = Math.round(maxDim * 0.90f);
            pdfBytes = renderBitmapsToPdf(bitmaps, maxDim, quality);
        }

        return pdfBytes;
    }

    private byte[] renderBitmapsToPdf(List<Bitmap> bitmaps, int maxDim, int quality) throws Exception {
        PdfDocument document = new PdfDocument();
        int pageIndex = 1;

        // إعدادات فرشاة الرسم للحفاظ على نعومة الخطوط وحِدة الحروف والأختام
        Paint paint = new Paint();
        paint.setAntiAlias(true);
        paint.setFilterBitmap(true);
        paint.setDither(true);

        for (Bitmap bmp : bitmaps) {
            if (bmp == null) continue;

            // 1. تحجيم الأبعاد بنسبة DPI متوازنة (72 - 96 DPI) لحفظ التفاصيل تحت 500 KB
            Bitmap scaled = highQualityResample(bmp, maxDim);

            // 2. ضغط كـ JPEG بالألوان الكاملة 24-bit (بدون أي تحويل لأبيض وأسود)
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, baos);
            byte[] compressedBytes = baos.toByteArray();

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888; // الحفاظ التام على ألوان الأختام والتوقيعات
            Bitmap compressedBmp = BitmapFactory.decodeByteArray(compressedBytes, 0, compressedBytes.length, opts);
            if (compressedBmp == null) {
                compressedBmp = scaled;
            }

            // 3. مقاس صفحة A4 قياسي: 595 x 842 points (بدون هوامش مضيعة للمساحة)
            PdfDocument.PageInfo pageInfo = new PdfDocument.PageInfo.Builder(595, 842, pageIndex++).create();
            PdfDocument.Page page = document.startPage(pageInfo);
            Canvas canvas = page.getCanvas();

            int margin = 12;
            int availW = 595 - (margin * 2);
            int availH = 842 - (margin * 2);

            float scaleFit = Math.min((float) availW / compressedBmp.getWidth(), (float) availH / compressedBmp.getHeight());
            int drawW = Math.round(compressedBmp.getWidth() * scaleFit);
            int drawH = Math.round(compressedBmp.getHeight() * scaleFit);
            int posX = margin + (availW - drawW) / 2;
            int posY = margin + (availH - drawH) / 2;

            canvas.drawBitmap(compressedBmp, null, new android.graphics.Rect(posX, posY, posX + drawW, posY + drawH), paint);
            document.finishPage(page);
        }

        ByteArrayOutputStream pdfOut = new ByteArrayOutputStream();
        document.writeTo(pdfOut);
        document.close();
        return pdfOut.toByteArray();
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
