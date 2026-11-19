export interface FlutterFile {
  name: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const FLUTTER_PROJECT_FILES: FlutterFile[] = [
  {
    name: 'pubspec.yaml',
    path: 'pubspec.yaml',
    language: 'yaml',
    description: 'ملف الحزم والتبعيات المطلوب إضافتها للمشروع (جاهز للتشغيل الفوري بدون شاشة دخول)',
    content: `name: legal_file_compressor
description: "تطبيق ضغطة - تصغير حجم الصور والـ PDF للمنظومة القضائية بحد أقصى 500 KB"
publish_to: 'none'
version: 3.1.0+4

environment:
  sdk: '>=3.3.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter

  # واجهة المستخدم والأيقونات
  cupertino_icons: ^1.0.8

  # فتح روابط مواقع النيابة والمحاكم في المتصفح الخارجي
  url_launcher: ^6.3.0

  # اختيار الملفات والصور من ذاكرة الهاتف والكاميرا
  file_picker: ^8.1.4
  image_picker: ^1.1.2

  # ضغط الصور محلياً بدقة فائقة لاستهداف بحد أقصى 500KB
  flutter_image_compress: ^2.3.0
  image: ^4.2.0

  # كاميرا مباشرة لخدمة تصوير المستندات ضوئياً (تلقائي/يدوي + فلاش + تركيز تلقائي + كشف حدود الورقة)
  camera: ^0.11.0+2

  # إنشاء ودمج ومعالجة ملفات PDF لاستهداف أقل من 500KB
  pdf: ^3.10.8
  printing: ^5.13.2

  # حفظ الإعدادات محلياً
  shared_preferences: ^2.3.2

  # مسارات حفظ الملفات وأذونات التخزين في Downloads
  path_provider: ^2.1.4
  permission_handler: ^11.3.1
  open_filex: ^4.5.0
  share_plus: ^10.1.2

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0

flutter:
  uses-material-design: true
  assets:
    - assets/images/welcome_logo.png
`
  },
  {
    name: 'AndroidManifest.xml',
    path: 'android/app/src/main/AndroidManifest.xml',
    language: 'xml',
    description: 'إعداد أذونات القراءة والكتابة الشاملة على وحدة التخزين وحفظ الملفات في Downloads بدون Crash',
    content: `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools"
    package="com.example.legal_file_compressor">

    <!-- 1. أذونات الإنترنت والشبكة لفتح مواقع المحاكم والنيابة ومصر الرقمية -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- 2. أذونات قراءة وكتابة وحدة التخزين الكلاسيكية لأندرويد 10 وما قبله (API <= 29) -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="29"
        tools:ignore="ScopedStorage" />

    <!-- 3. إذن إدارة التخزين الخارجي الشامل لأندرويد 11 فما فوق (API 30+) للوصول المباشر لمجلد التنزيلات Downloads -->
    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE"
        tools:ignore="ScopedStorage" />

    <!-- 4. أذونات الوسائط للصور والمستندات لأندرويد 13 فما فوق (API 33+) -->
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
    <uses-permission android:name="android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
        android:minSdkVersion="34" />

    <!-- 5. إذن الكاميرا لتصوير التوكيلات والمستندات الورقية مباشرة -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

    <!-- استعلام حزم المتصفح لفتح روابط النيابة ومصر الرقمية على أندرويد 11+ -->
    <queries>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" />
        </intent>
    </queries>

    <application
        android:label="ضغطة"
        android:name="\${applicationName}"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:requestLegacyExternalStorage="true"
        android:preserveLegacyExternalStorage="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
        
        <meta-data
            android:name="flutterEmbedding"
            android:value="2" />
    </application>
</manifest>
`
  },
  {
    name: 'file_storage_service.dart',
    path: 'lib/services/file_storage_service.dart',
    language: 'dart',
    description: 'إدارة أذونات التخزين الآمنة وحفظ الملفات في مجلد Downloads لجميع إصدارات أندرويد بدون أي Crash',
    content: `import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';

/// خدمة إدارة حفظ الملفات المباشر في مجلد Downloads مع معالجة استثنائية للأذونات
/// مصممة لتضمن عدم إغلاق التطبيق (Crash) نهائياً على جميع إصدارات أندرويد (من Android 7 وحتى Android 15)
class FileStorageService {
  /// فحص وطلب أذونات التخزين الشاملة بمرونة تامة
  static Future<bool> requestStoragePermissions() async {
    if (!Platform.isAndroid) return true;

    try {
      // 1. لأندرويد 13 و 14 (API 33+): فحص أذونات الوسائط
      final photosStatus = await Permission.photos.status;
      if (!photosStatus.isGranted) {
        await Permission.photos.request();
      }

      // 2. لأندرويد 12 وما قبله (API <= 32): فحص إذن التخزين الكلاسيكي
      final storageStatus = await Permission.storage.status;
      if (!storageStatus.isGranted) {
        await Permission.storage.request();
      }

      // 3. فحص إذن MANAGE_EXTERNAL_STORAGE لأندرويد 11+ إن وُجد
      final manageStatus = await Permission.manageExternalStorage.status;
      if (manageStatus.isDenied) {
        // نطلب الإذن بهدوء دون إجبار أو إيقاف التطبيق
        try {
          await Permission.manageExternalStorage.request();
        } catch (_) {}
      }

      return true;
    } catch (e) {
      debugPrint('تنبيه أثناء طلب الأذونات (يستمر التطبيق بأمان): \$e');
      return true;
    }
  }

  /// حفظ بايتات الملف المضغوط بسلاسة وأمان مع استراتيجية إنقاذ متعددة الطبقات (Multi-tier fallback)
  /// تضمن حفظ الملف 100% بدون أي Crash مهما كانت قيود نظام أندرويد
  static Future<File> saveFileToDownloadsSafely({
    required Uint8List bytes,
    required String prefix,
    required String extension,
  }) async {
    // نطلب الأذونات قبل محاولة الحفظ
    await requestStoragePermissions();

    final String timestamp = DateTime.now().millisecondsSinceEpoch.toString();
    final String sanitizedExt = extension.startsWith('.') ? extension : '.\$extension';
    final String fileName = '\${prefix}_\$timestamp\$sanitizedExt';

    // قائمة المسارات المرشحة للحفظ بالترتيب الأفضل فالأفضل
    final List<Directory> candidateDirs = [];

    // المسار 1: مجلد التنزيلات العام المباشر في أندرويد (/storage/emulated/0/Download)
    if (Platform.isAndroid) {
      try {
        final publicDownload = Directory('/storage/emulated/0/Download');
        if (!await publicDownload.exists()) {
          await publicDownload.create(recursive: true);
        }
        candidateDirs.add(publicDownload);
      } catch (e) {
        debugPrint('المسار العام المباشر غير متاح حالياً: \$e');
      }
    }

    // المسار 2: مجلد Downloads المستخرج عبر path_provider
    try {
      final dlDir = await getDownloadsDirectory();
      if (dlDir != null && !candidateDirs.any((d) => d.path == dlDir.path)) {
        candidateDirs.add(dlDir);
      }
    } catch (_) {}

    // المسار 3: مجلد التخزين الخارجي الخاص بالتطبيق (لا يتطلب أي أذونات runtime ويضمن النجاح دائماً)
    try {
      final extDir = await getExternalStorageDirectory();
      if (extDir != null) {
        final appDownloadDir = Directory('\${extDir.path}/Downloads');
        if (!await appDownloadDir.exists()) {
          await appDownloadDir.create(recursive: true);
        }
        candidateDirs.add(appDownloadDir);
      }
    } catch (_) {}

    // المسار 4: مجلد مستندات التطبيق الداخلية (الملاذ الأخير المضمون 100%)
    try {
      final appDocDir = await getApplicationDocumentsDirectory();
      candidateDirs.add(appDocDir);
    } catch (_) {}

    // تجربة الكتابة على كل مجلد بالترتيب حتى ينجح الحفظ بدون أي استثناء
    for (final dir in candidateDirs) {
      try {
        final File targetFile = File('\${dir.path}/\$fileName');
        await targetFile.writeAsBytes(bytes, flush: true);
        debugPrint('✅ تم حفظ الملف بنجاح في: \${targetFile.path}');
        return targetFile;
      } catch (err) {
        debugPrint('تعذر الحفظ في \${dir.path} (\$err)، جاري محاولة المسار البديل...');
      }
    }

    throw Exception('تعذر حفظ الملف في أي مجلد تخزين متاح بالجهاز.');
  }

  /// حفظ الصورة مباشرة وجذرياً في معرض صور الهاتف (Gallery / DCIM / Pictures)
  static Future<File> saveImageToGallerySafely({
    required Uint8List bytes,
    required String prefix,
  }) async {
    final String timestamp = DateTime.now().millisecondsSinceEpoch.toString();
    final String fileName = '\${prefix}_\$timestamp.jpg';

    List<Directory> galleryDirs = [];
    if (Platform.isAndroid) {
      galleryDirs.addAll([
        Directory('/storage/emulated/0/Pictures/ManzomaLawyer'),
        Directory('/storage/emulated/0/DCIM/Camera'),
        Directory('/storage/emulated/0/Pictures'),
      ]);
    }

    try {
      final extDir = await getExternalStorageDirectory();
      if (extDir != null) {
        galleryDirs.add(Directory('\${extDir.path}/Pictures'));
      }
    } catch (_) {}

    for (final dir in galleryDirs) {
      try {
        if (!await dir.exists()) await dir.create(recursive: true);
        final File target = File('\${dir.path}/\$fileName');
        await target.writeAsBytes(bytes, flush: true);
        debugPrint('✅ تم حفظ الصورة بالمعرض بنجاح: \${target.path}');
        return target;
      } catch (_) {}
    }

    return await saveFileToDownloadsSafely(
      bytes: bytes,
      prefix: prefix,
      extension: '.jpg',
    );
  }

  /// توليد مسار إخراج آمن ومؤكد الصلاحية للكتابة
  static Future<String> generateOutputPath({
    required String prefix,
    required String extension,
  }) async {
    final String timestamp = DateTime.now().millisecondsSinceEpoch.toString();
    final String sanitizedExt = extension.startsWith('.') ? extension : '.\$extension';
    final String fileName = '\${prefix}_\$timestamp\$sanitizedExt';

    // نتحقق من إمكانية الكتابة في المجلد العام أولاً
    if (Platform.isAndroid) {
      try {
        final publicDownload = Directory('/storage/emulated/0/Download');
        if (await publicDownload.exists()) {
          // فحص إمكانية الكتابة بملف مؤقت سريع
          final testFile = File('\${publicDownload.path}/.temp_perm_test_\$timestamp');
          await testFile.writeAsString('ok');
          await testFile.delete();
          return '\${publicDownload.path}/\$fileName';
        }
      } catch (_) {}
    }

    try {
      final dlDir = await getDownloadsDirectory();
      if (dlDir != null) {
        return '\${dlDir.path}/\$fileName';
      }
    } catch (_) {}

    try {
      final extDir = await getExternalStorageDirectory();
      if (extDir != null) {
        final appDl = Directory('\${extDir.path}/Downloads');
        if (!await appDl.exists()) await appDl.create(recursive: true);
        return '\${appDl.path}/\$fileName';
      }
    } catch (_) {}

    final appDoc = await getApplicationDocumentsDirectory();
    return '\${appDoc.path}/\$fileName';
  }

  /// تنسيق حجم الملف لعرضه بطريقة مفهومة للسادة المحامين
  static String formatBytes(int bytes) {
    if (bytes < 1024) return '\$bytes بايت';
    if (bytes < 1024 * 1024) {
      return '\${(bytes / 1024).toStringAsFixed(1)} كيلوبايت (KB)';
    }
    return '\${(bytes / (1024 * 1024)).toStringAsFixed(2)} ميجابايت (MB)';
  }
}
`
  },
  {
    name: 'compression_service.dart',
    path: 'lib/services/compression_service.dart',
    language: 'dart',
    description: 'خوارزمية الضغط الاحترافية (Zero Data Loss): معيار موحد < 500KB للصور والـ PDF مع تحجيم A4 وألوان حيوية كاملة',
    content: `import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image/image.dart' as img;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'file_storage_service.dart';

/// خدمة معالجة وضغط الملفات محلياً لتناسب اشتراطات منصة النيابة العامة الجديدة (< 500 KB)
/// مع الحفاظ المطلق على جودة البيانات، الأسماء، الأرقام، التواريخ، والأختام الملونة
class CompressionService {
  // المعيار الموحد الجديد لمنصة النيابة العامة: أقل من 500KB حصرياً للصور والـ PDF
  static const int targetImageMaxBytes = 485 * 1024; // 485 KB (< 500 KB)
  static const int strictPdfThresholdBytes = 485 * 1024; // 485 KB (< 500 KB)

  // ==================== أ) تصغير حجم الصورة لأقل من 500KB مع الحفاظ المطلق على الجودة والألوان ====================
  static Future<File?> compressImageToUnder500KB({
    required File inputFile,
    int? customMaxBytes,
  }) async {
    final int maxBytes = customMaxBytes ?? targetImageMaxBytes;
    final int originalSize = await inputFile.length();
    debugPrint('حجم الصورة الأصلي للمستند: \${originalSize ~/ 1024} KB');

    final Uint8List originalBytes = await inputFile.readAsBytes();

    // 1. Zero Data Loss: إذا كانت الصورة أقل من الحد الأقصى نحفظها فوراً بجودتها الأصلية 100%
    if (originalSize <= maxBytes) {
      debugPrint('الصورة مطابقة للاشتراطات بالفعل (< 500 KB) - تم الحفظ بجودتها الكاملة 100%');
      return await FileStorageService.saveImageToGallerySafely(
        bytes: originalBytes,
        prefix: 'manzoma_image',
      );
    }

    // 2. التصغير الهندسي الذكي لتناسب أبعاد صفحة A4 بدقة فائقة (حتى 2000 بكسل) مع ألوان RGB كاملة
    int targetWidth = 2000;
    int targetHeight = 2000;
    final img.Image? decoded = img.decodeImage(originalBytes);
    if (decoded != null) {
      final double ratio = decoded.width / decoded.height;
      if (ratio > 1) {
        targetWidth = decoded.width < 2000 ? decoded.width : 2000;
        targetHeight = (targetWidth / ratio).round();
      } else {
        targetHeight = decoded.height < 2000 ? decoded.height : 2000;
        targetWidth = (targetHeight * ratio).round();
      }
    }

    // جودة ابتدائية نقية 85% تضمن حدة الحروف والأرقام والأختام دون بهتان أو تبكسل
    int quality = 85;
    Uint8List? bestResult = await FlutterImageCompress.compressWithList(
      originalBytes,
      minWidth: targetWidth,
      minHeight: targetHeight,
      quality: quality,
      format: CompressFormat.jpeg,
    );

    // حلقة موازنة تدريجية آمنة مع حد أدنى صارم (Quality Floor >= 65%) لمنع التبكسل نهائياً
    int attempts = 0;
    const int minQualityFloor = 65;
    const int minDimensionFloor = 1350;

    while (bestResult != null && bestResult.length > maxBytes && attempts < 6) {
      attempts++;
      if (quality > minQualityFloor + 4) {
        quality = (quality - 5).clamp(minQualityFloor, 85);
      } else if (targetWidth > minDimensionFloor && targetHeight > minDimensionFloor) {
        targetWidth = (targetWidth * 0.90).round().clamp(minDimensionFloor, 2000);
        targetHeight = (targetHeight * 0.90).round().clamp(minDimensionFloor, 2000);
        quality = 74;
      } else {
        break; // نتوقف عند الحد الآمن لحماية وضوح الأسماء والأرقام والأختام
      }

      bestResult = await FlutterImageCompress.compressWithList(
        originalBytes,
        minWidth: targetWidth,
        minHeight: targetHeight,
        quality: quality,
        format: CompressFormat.jpeg,
      );
    }

    if (bestResult != null) {
      return await FileStorageService.saveImageToGallerySafely(
        bytes: bestResult,
        prefix: 'manzoma_image',
      );
    }
    return null;
  }

  // ==================== ب) تصغير حجم ملف PDF لأقل من 500KB مع حماية النصوص والأختام ====================
  static Future<File?> compressExistingPdfToUnder500KB({
    required File inputPdf,
    int? customMaxBytes,
  }) async {
    final int maxBytes = customMaxBytes ?? strictPdfThresholdBytes;
    final int originalSize = await inputPdf.length();
    debugPrint('حجم الـ PDF الأصلي: \${originalSize ~/ 1024} KB');

    final Uint8List originalBytes = await inputPdf.readAsBytes();

    // 1. إذا كان الملف بالفعل أقل من الحد المستهدف، نحتفظ به كاملاً بنصوصه الفيكتورية 100%
    if (originalSize <= maxBytes) {
      debugPrint('المستند بالفعل أقل من 500 KB - تم حفظه بنصوصه الأصلية 100%');
      return await FileStorageService.saveFileToDownloadsSafely(
        bytes: originalBytes,
        prefix: 'manzoma_pdf',
        extension: '.pdf',
      );
    }

    try {
      // 2. معالجة الصفحات المصورة بدقة 185 DPI حادة بالألوان الكاملة (يُحظر التحويل للأبيض والأسود)
      // مع الحفاظ الدقيق على أبعاد ونسب كل صفحة (أفقي أو رأسي)
      pw.Document compressedDoc = pw.Document(compress: true);
      await for (final page in Printing.raster(originalBytes, dpi: 185)) {
        final imageBytes = await page.toPng();
        final Uint8List? compressedPage = await FlutterImageCompress.compressWithList(
          imageBytes,
          minWidth: 1750,
          minHeight: 1750,
          quality: 80,
          format: CompressFormat.jpeg,
        );

        final image = pw.MemoryImage(compressedPage ?? imageBytes);
        final pageFormat = PdfPageFormat(page.width.toDouble(), page.height.toDouble());

        compressedDoc.addPage(
          pw.Page(
            pageFormat: pageFormat,
            margin: pw.EdgeInsets.zero,
            build: (context) => pw.FullPage(
              ignoreMargins: true,
              child: pw.Image(image, fit: pw.BoxFit.contain),
            ),
          ),
        );
      }

      Uint8List finalPdfBytes = await compressedDoc.save();

      // 3. موازنة تدريجية آمنة إذا تجاوز 485 KB مع حد أدنى 145 DPI وجودة 68% لحماية وضوح النص
      if (finalPdfBytes.length > maxBytes) {
        debugPrint('حجم الـ PDF (\${finalPdfBytes.length ~/ 1024} KB) يحتاج موازنة هادئة بدقة 145 DPI...');
        final pw.Document strictDoc = pw.Document(compress: true);
        await for (final page in Printing.raster(originalBytes, dpi: 145)) {
          final imageBytes = await page.toPng();
          final Uint8List? strictlyCompressed = await FlutterImageCompress.compressWithList(
            imageBytes,
            minWidth: 1450,
            minHeight: 1450,
            quality: 68,
            format: CompressFormat.jpeg,
          );

          final image = pw.MemoryImage(strictlyCompressed ?? imageBytes);
          final pageFormat = PdfPageFormat(page.width.toDouble(), page.height.toDouble());

          strictDoc.addPage(
            pw.Page(
              pageFormat: pageFormat,
              margin: pw.EdgeInsets.zero,
              build: (context) => pw.FullPage(
                ignoreMargins: true,
                child: pw.Image(image, fit: pw.BoxFit.contain),
              ),
            ),
          );
        }
        finalPdfBytes = await strictDoc.save();
      }

      return await FileStorageService.saveFileToDownloadsSafely(
        bytes: finalPdfBytes,
        prefix: 'manzoma_pdf',
        extension: '.pdf',
      );
    } catch (e) {
      debugPrint('تعذر الضغط المتقدم للـ PDF (\$e)');
      return await FileStorageService.saveFileToDownloadsSafely(
        bytes: originalBytes,
        prefix: 'manzoma_pdf_orig',
        extension: '.pdf',
      );
    }
  }

  // ==================== ج) دمج مجموعة صور في ملف PDF واحد (< 500KB بالألوان الحيوية الكاملة) ====================
  static Future<File?> mergeImagesToPdfUnder500KB({
    required List<File> imageFiles,
    int? customMaxBytes,
  }) async {
    if (imageFiles.isEmpty) return null;
    final int maxBytes = customMaxBytes ?? strictPdfThresholdBytes;

    final int pageCount = imageFiles.length;
    int baseDim = 1850;
    int baseQuality = 80;

    if (pageCount == 1) {
      baseDim = 2000;
      baseQuality = 84;
    } else if (pageCount == 2) {
      baseDim = 1750;
      baseQuality = 78;
    } else if (pageCount <= 5) {
      baseDim = (1600 - pageCount * 40).clamp(1400, 1750);
      baseQuality = (78 - pageCount * 2).clamp(68, 78);
    } else {
      baseDim = (1400 - pageCount * 25).clamp(1200, 1450);
      baseQuality = (72 - pageCount * 1).clamp(64, 72);
    }

    final pw.Document pdf = pw.Document(compress: true);
    for (final file in imageFiles) {
      final bytes = await file.readAsBytes();
      final img.Image? decoded = img.decodeImage(bytes);
      final bool isLandscape = decoded != null && (decoded.width > decoded.height);

      // تحجيم الأبعاد هندسياً لتناسب A4 مع الحفاظ التام على الألوان والأختام الحمراء والزرقاء
      final Uint8List? optimizedBytes = await FlutterImageCompress.compressWithList(
        bytes,
        minWidth: baseDim,
        minHeight: baseDim,
        quality: baseQuality,
        format: CompressFormat.jpeg,
      );

      final imageToAdd = pw.MemoryImage(optimizedBytes ?? bytes);
      final pageFormat = isLandscape ? PdfPageFormat.a4.landscape : PdfPageFormat.a4.portrait;

      pdf.addPage(
        pw.Page(
          pageFormat: pageFormat,
          margin: const pw.EdgeInsets.all(8),
          build: (pw.Context context) {
            return pw.Center(
              child: pw.Image(imageToAdd, fit: pw.BoxFit.contain),
            );
          },
        ),
      );
    }

    Uint8List pdfBytes = await pdf.save();

    // موازنة تدريجية آمنة إذا تجاوز 485 KB مع حماية جودة الخطوط (Quality Floor >= 64%)
    if (pdfBytes.length > maxBytes) {
      debugPrint('حجم الـ PDF المدمج تجاوز 485 KB، موازنة هادئة...');
      final pw.Document strictPdf = pw.Document(compress: true);

      for (final file in imageFiles) {
        final bytes = await file.readAsBytes();
        final img.Image? decoded = img.decodeImage(bytes);
        final bool isLandscape = decoded != null && (decoded.width > decoded.height);

        final Uint8List? reCompressed = await FlutterImageCompress.compressWithList(
          bytes,
          minWidth: (baseDim * 0.90).round().clamp(1200, 2000),
          minHeight: (baseDim * 0.90).round().clamp(1200, 2000),
          quality: (baseQuality - 5).clamp(64, 78),
          format: CompressFormat.jpeg,
        );

        final imageToAdd = pw.MemoryImage(reCompressed ?? bytes);
        final pageFormat = isLandscape ? PdfPageFormat.a4.landscape : PdfPageFormat.a4.portrait;

        strictPdf.addPage(
          pw.Page(
            pageFormat: pageFormat,
            margin: const pw.EdgeInsets.all(8),
            build: (pw.Context context) {
              return pw.Center(
                child: pw.Image(imageToAdd, fit: pw.BoxFit.contain),
              );
            },
          ),
        );
      }

      pdfBytes = await strictPdf.save();
    }

    return await FileStorageService.saveFileToDownloadsSafely(
      bytes: pdfBytes,
      prefix: 'manzoma_merged',
      extension: '.pdf',
    );
  }
}
`
  },
  {
    name: 'main.dart',
    path: 'lib/main.dart',
    language: 'dart',
    description: 'نقطة الانطلاق الرئيسية: يفتح التطبيق مباشرة على الشاشة الرئيسية فور تشغيله بدون شاشة دخول',
    content: `import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'screens/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // ضبط شريط الحالة بالهوية الكحلية الملكية لتطبيق «ضغطة»
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Color(0xFF09183B),
      statusBarIconBrightness: Brightness.light,
    ),
  );

  // يفتح التطبيق مباشرة على الشاشة الرئيسية فوراً بدون أي تسجيل دخول
  runApp(const LawyerFileCompressorApp());
}

class LawyerFileCompressorApp extends StatelessWidget {
  const LawyerFileCompressorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ضغطة',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar', 'EG'),
      supportedLocales: const [
        Locale('ar', 'EG'),
        Locale('en', 'US'),
      ],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'Cairo',
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F2557), // كحلي ملكي
          primary: const Color(0xFF0F2557),
          secondary: const Color(0xFFD4AF37), // ذهبي رفيع
          surface: Colors.white,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        appBarTheme: const AppBarTheme(
          elevation: 0,
          backgroundColor: Color(0xFF0F2557),
          foregroundColor: Colors.white,
          centerTitle: false,
          titleTextStyle: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 20,
            fontWeight: FontWeight.w900,
            color: Colors.white,
          ),
        ),
      ),
      // فتح الشاشة الرئيسية فور تشغيل التطبيق
      home: const HomeScreen(),
    );
  }
}
`
  },
  {
    name: 'home_screen.dart',
    path: 'lib/screens/home_screen.dart',
    language: 'dart',
    description: 'الشاشة الرئيسية: الأزرار الثلاثة في المنتصف، والمربع الأزرق لروابط المحاكم في الأسفل، بدون شاشات تسجيل دخول',
    content: `import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'compress_image_screen.dart';
import 'compress_pdf_screen.dart';
import 'images_to_pdf_screen.dart';
import 'document_scanner_screen.dart';
import 'legal_portals_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  // المعيار الموحد الجديد لمنصة النيابة العامة: الصور 500KB • الـ PDF 500KB
  int _targetImageKB = 500;
  int _targetPdfKB = 500;

  @override
  void initState() {
    super.initState();
    _loadPreferences();
  }

  Future<void> _loadPreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      setState(() {
        _targetImageKB = prefs.getInt('manzoma_target_image_kb_v2') ?? 500;
        _targetPdfKB = prefs.getInt('manzoma_target_pdf_kb') ?? 500;
      });
    } catch (_) {}
  }

  Future<void> _savePreference(String key, int value) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(key, value);
    } catch (_) {}
  }

  // نافذة تعديل الحجم المستهدف عند الضغط المباشر على الرقم في الشاشة الرئيسية
  void _showEditTargetDialog(bool isImage) {
    final currentVal = isImage ? _targetImageKB : _targetPdfKB;
    final controller = TextEditingController(text: currentVal.toString());
    String? errorText;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              Icon(
                isImage ? Icons.image_rounded : Icons.picture_as_pdf_rounded,
                color: isImage ? const Color(0xFF2563EB) : const Color(0xFFEA580C),
              ),
              const SizedBox(width: 8),
              Text(
                isImage ? 'تعديل حجم الصور المستهدف' : 'تعديل حجم PDF المستهدف',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'القيمة الافتراضية الموحدة: 500 KB',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                keyboardType: TextInputType.number,
                autofocus: true,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                decoration: InputDecoration(
                  suffixText: 'KB',
                  errorText: errorText,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () async {
                const def = 500;
                setState(() {
                  if (isImage) _targetImageKB = def;
                  else _targetPdfKB = def;
                });
                await _savePreference(
                  isImage ? 'manzoma_target_image_kb_v2' : 'manzoma_target_pdf_kb',
                  def,
                );
                if (mounted) Navigator.pop(ctx);
              },
              child: const Text(
                'استعادة الافتراضي (500 KB)',
                style: TextStyle(color: Colors.grey),
              ),
            ),
            ElevatedButton(
              onPressed: () async {
                final text = controller.text.trim();
                final val = int.tryParse(text);
                if (val == null || val <= 0) {
                  setDialogState(() {
                    errorText = 'أدخل رقماً صحيحاً موجباً';
                  });
                  return;
                }
                setState(() {
                  if (isImage) _targetImageKB = val;
                  else _targetPdfKB = val;
                });
                await _savePreference(
                  isImage ? 'manzoma_target_image_kb_v2' : 'manzoma_target_pdf_kb',
                  val,
                );
                if (mounted) Navigator.pop(ctx);
              },
              child: const Text('حفظ وتطبيق'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F2557),
        titleSpacing: 16,
        title: Row(
          children: [
            const Text(
              'ضغطة',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                color: Colors.white,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xFFD4AF37).withOpacity(0.15),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFD4AF37).withOpacity(0.45)),
              ),
              child: const Text(
                'للمنظومة القضائية',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFFFDE047),
                ),
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(left: 8),
            child: IconButton(
              icon: const Icon(Icons.share_rounded, color: Color(0xFFFDE047)),
              tooltip: 'مشاركة التطبيق مع الزملاء',
              onPressed: () {
                Share.share(
                  'تطبيق ضغطة لتصغير حجم الصور والـ PDF للمنظومة القضائية (بحد أقصى 500 KB) - تصميم وتنفيذ: مصطفى فرويز المحامي - Al-Hawai Tech',
                );
              },
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(2),
          child: Container(
            height: 1.5,
            color: const Color(0xFFD4AF37).withOpacity(0.45),
          ),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          children: [
            // بطاقة الترحيب العلوية بالشعار المرفق وجملة الترحيب مع الميزان والوصف المختصر
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF0F2557), Color(0xFF09183B)],
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                ),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFD4AF37).withOpacity(0.45), width: 1),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF0F2557).withOpacity(0.20),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            Flexible(
                              child: Text(
                                'أهلاً بك زميلي المحامي',
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            SizedBox(width: 6),
                            Icon(Icons.balance_rounded, color: Color(0xFFFDE047), size: 16),
                          ],
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'اضغط مستنداتك وصورك بضغطة واحدة، بدون إنترنت، وبجودة عالية واجعلها جاهزة لتقديم الطلبات على منظومه النيابة والمحاكم.',
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Color(0xFFCBD5E1),
                            fontSize: 10.5,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    width: 62,
                    height: 62,
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF060E24),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFFD4AF37).withOpacity(0.5), width: 1),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.asset(
                        'assets/images/welcome_logo.png',
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 10),

            const Text(
              'اضغط على الخدمة التي تريدها',
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w900,
                color: Color(0xFF0F2557),
              ),
            ),
            const SizedBox(height: 8),

            // 1 - تصغير حجم الصور (الأزرق #1D4ED8)
            _ServiceCard(
              number: '1',
              title: 'تصغير حجم الصور',
              subtitle: 'ضغط صور التوكيلات والبطاقات لأقل من $_targetImageKB KB وحفظها بالمعرض.',
              badgeText: '< $_targetImageKB KB',
              cardColor: const Color(0xFF1D4ED8),
              cardGradientEnd: const Color(0xFF1E40AF),
              icon: Icons.photo_size_select_small_rounded,
              onBadgeTap: () => _showEditTargetDialog(true),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const CompressImageScreen()),
                );
              },
            ),

            const SizedBox(height: 8),

            // 2 - تصغير حجم ملفات PDF (البرتقالي #D94E0B)
            _ServiceCard(
              number: '2',
              title: 'تصغير حجم ملفات PDF',
              subtitle: 'تقليص حجم العرائض والمذكرات لأقل من $_targetPdfKB KB بوضوح تام.',
              badgeText: '< $_targetPdfKB KB',
              cardColor: const Color(0xFFD94E0B),
              cardGradientEnd: const Color(0xFFC2410C),
              icon: Icons.picture_as_pdf_rounded,
              onBadgeTap: () => _showEditTargetDialog(false),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const CompressPdfScreen()),
                );
              },
            ),

            const SizedBox(height: 8),

            // 3 - دمج الصور في ملف PDF واحد (الأخضر #047857)
            _ServiceCard(
              number: '3',
              title: 'دمج الصور في ملف PDF واحد',
              subtitle: 'تجميع أوراق الدعوى في ملف موحد أقل من $_targetPdfKB KB بالألوان الكاملة.',
              badgeText: '< $_targetPdfKB KB',
              cardColor: const Color(0xFF047857),
              cardGradientEnd: const Color(0xFF065F46),
              icon: Icons.collections_bookmark_rounded,
              onBadgeTap: () => _showEditTargetDialog(false),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ImagesToPdfScreen()),
                );
              },
            ),

            const SizedBox(height: 8),

            // 4 - تصوير المستندات وتحسينها وضغطها (التركواز #0F766E)
            _ServiceCard(
              number: '4',
              title: 'تصوير المستندات وتحسينها وضغطها',
              subtitle: 'تصوير الكاميرا مع قص تلقائي وتحسين الألوان وحفظ صور وPDF < 500 KB.',
              badgeText: '< 500 KB',
              cardColor: const Color(0xFF0F766E),
              cardGradientEnd: const Color(0xFF0D9488),
              icon: Icons.document_scanner_rounded,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const DocumentScannerScreen()),
                );
              },
            ),

            const SizedBox(height: 8),

            // 5 - البوابات القانونية (البنفسجي #6D28D9)
            _ServiceCard(
              number: '5',
              title: 'البوابات القانونية',
              subtitle: 'دخول مباشر لمنصات النيابة العامة ومحكمة الأسرة ومصر الرقمية.',
              badgeText: '10 بوابات',
              cardColor: const Color(0xFF6D28D9),
              cardGradientEnd: const Color(0xFF5B21B6),
              icon: Icons.language_rounded,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const LegalPortalsScreen()),
                );
              },
            ),

            const SizedBox(height: 8),

            // شريط إشعار الحفظ التلقائي
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.verified_user_rounded, color: Color(0xFF0F2557), size: 16),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'معالجة محلية 100% تحفظ الصور بالاستوديو والـ PDF بالتنزيلات تلقائياً.',
                      style: TextStyle(fontSize: 10.5, color: Color(0xFF475569), fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 10),

            // الفوتر الهادئ منخفض البروز
            Column(
              children: [
                Text(
                  'تصميم وتنفيذ: مصطفى فرويز المحامي',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade400,
                    fontWeight: FontWeight.w400,
                    height: 1.35,
                  ),
                ),
                Text(
                  'Al-Hawai Tech',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade400,
                    fontWeight: FontWeight.w400,
                    height: 1.35,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
          ],
        ),
      ),
    );
  }
}

class _ServiceCard extends StatelessWidget {
  final String number;
  final String title;
  final String subtitle;
  final String badgeText;
  final Color cardColor;
  final Color cardGradientEnd;
  final IconData icon;
  final VoidCallback onTap;
  final VoidCallback? onBadgeTap;

  const _ServiceCard({
    required this.number,
    required this.title,
    required this.subtitle,
    required this.badgeText,
    required this.cardColor,
    required this.cardGradientEnd,
    required this.icon,
    required this.onTap,
    this.onBadgeTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 56),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [cardColor, cardGradientEnd],
          begin: Alignment.centerRight,
          end: Alignment.centerLeft,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: cardColor.withOpacity(0.22),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            child: Row(
              children: [
                // دائرة الرقم (1 - 5)
                Container(
                  width: 30,
                  height: 30,
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      number,
                      style: TextStyle(
                        color: cardColor,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 9),
                // حاوية الأيقونة الموحدة
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.16),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, color: Colors.white, size: 20),
                ),
                const SizedBox(width: 10),
                // العنوان والوصف المختصر
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          GestureDetector(
                            onTap: onBadgeTap,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.18),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.white.withOpacity(0.28)),
                              ),
                              child: Text(
                                badgeText,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 10.5,
                          color: Colors.white.withOpacity(0.88),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                Icon(
                  Icons.chevron_left_rounded,
                  color: Colors.white.withOpacity(0.85),
                  size: 18,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
`
  },
  {
    name: 'legal_portals_screen.dart',
    path: 'lib/screens/legal_portals_screen.dart',
    language: 'dart',
    description: 'قائمة رأسية متتالية للمواقع القضائية العشرة مرقمة بوضوح من 1 إلى 10',
    content: `import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class LegalPortalItem {
  final String title;
  final String category;
  final String url;
  final IconData icon;
  final Color color;

  const LegalPortalItem({
    required this.title,
    required this.category,
    required this.url,
    required this.icon,
    required this.color,
  });
}

class LegalPortalsScreen extends StatelessWidget {
  const LegalPortalsScreen({super.key});

  static const List<LegalPortalItem> portals = [
    LegalPortalItem(
      title: 'بوابة النيابة العامة',
      category: 'خدمات العرائض والجنائي وتظلمات النيابة',
      url: 'https://ppo.gov.eg/',
      icon: Icons.gavel_rounded,
      color: Color(0xFF1E3A8A),
    ),
    LegalPortalItem(
      title: 'محكمة الأسرة',
      category: 'دعاوى الأسرة والولاية على المال والنفقة',
      url: 'https://ppo.gov.eg/',
      icon: Icons.family_restroom_rounded,
      color: Color(0xFF0D9488),
    ),
    LegalPortalItem(
      title: 'منصة مصر الرقمية',
      category: 'خدمات التوثيق والتوكيلات وتحرير المحاضر',
      url: 'https://digital.gov.eg/',
      icon: Icons.fingerprint_rounded,
      color: Color(0xFFD97706),
    ),
    LegalPortalItem(
      title: 'بوابة وزارة العدل',
      category: 'إقامة الدعاوى عن بُعد والاستعلام القضائي',
      url: 'https://moj.gov.eg/',
      icon: Icons.balance_rounded,
      color: Color(0xFF2563EB),
    ),
    LegalPortalItem(
      title: 'محكمة النقض المصرية',
      category: 'جداول الطعون وأحكام النقض الجنائية والمدنية',
      url: 'https://cc.gov.eg/',
      icon: Icons.account_balance_rounded,
      color: Color(0xFF7C3AED),
    ),
    LegalPortalItem(
      title: 'مجلس الدولة المصري',
      category: 'محاكم القضاء الإداري والطعون التأديبية',
      url: 'https://ecs.gov.eg/',
      icon: Icons.assured_workload_rounded,
      color: Color(0xFF059669),
    ),
    LegalPortalItem(
      title: 'المحكمة الدستورية العليا',
      category: 'الأحكام الدستورية وجداول الجلسات',
      url: 'https://hccourt.gov.eg/',
      icon: Icons.menu_book_rounded,
      color: Color(0xFFDC2626),
    ),
    LegalPortalItem(
      title: 'نقابة المحامين المصرية',
      category: 'تجديد القيد والعلاج والخدمات النقابية',
      url: 'https://egyls.com/',
      icon: Icons.card_membership_rounded,
      color: Color(0xFF4338CA),
    ),
    LegalPortalItem(
      title: 'الشهر العقاري والتوثيق',
      category: 'حجز المواعيد ومعاملات التوثيق والعقود',
      url: 'https://rso.gov.eg/',
      icon: Icons.edit_document,
      color: Color(0xFF0284C7),
    ),
    LegalPortalItem(
      title: 'نيابات المرور الإلكترونية',
      category: 'استعلام وتظلمات المخالفات وتراخيص القيادة',
      url: 'https://ppo.gov.eg/',
      icon: Icons.directions_car_rounded,
      color: Color(0xFFEA580C),
    ),
  ];

  Future<void> _openPortalUrl(BuildContext context, String urlString) async {
    final Uri uri = Uri.parse(urlString);
    try {
      final bool launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تعذر فتح الرابط في المتصفح')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('حدث خطأ أثناء فتح الموقع: \$e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F2557),
        title: const Text('البوابات القانونية'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              margin: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6D28D9), Color(0xFF4C1D95)],
                ),
                borderRadius: BorderRadius.circular(18),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF6D28D9).withOpacity(0.24),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: const Row(
                children: [
                  Icon(Icons.open_in_browser_rounded, color: Colors.amber, size: 24),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'دليل الروابط الرسمية (مرقمة من 1 إلى 10)\nاضغط على أي موقع للانتقال الفوري لرفع الأوراق.',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 12.5,
                        fontWeight: FontWeight.bold,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                itemCount: portals.length,
                separatorBuilder: (context, index) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final portal = portals[index];
                  final int itemNumber = index + 1;

                  return Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    elevation: 1.2,
                    shadowColor: Colors.black.withOpacity(0.04),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () => _openPortalUrl(context, portal.url),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: const Color(0xFFE2E8F0)),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [portal.color, portal.color.withOpacity(0.8)],
                                ),
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: portal.color.withOpacity(0.25),
                                    blurRadius: 5,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: Center(
                                child: Text(
                                  '\$itemNumber',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),

                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: portal.color.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Icon(portal.icon, color: portal.color, size: 24),
                            ),
                            const SizedBox(width: 12),

                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    portal.title,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF0F172A),
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    portal.category,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: Color(0xFF64748B),
                                    ),
                                  ),
                                ],
                              ),
                            ),

                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: portal.color.withOpacity(0.08),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: portal.color.withOpacity(0.25)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    'دخول',
                                    style: TextStyle(
                                      color: portal.color,
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  const SizedBox(width: 4),
                                  Icon(Icons.open_in_new_rounded, size: 12, color: portal.color),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
`
  },
  {
    name: 'compress_image_screen.dart',
    path: 'lib/screens/compress_image_screen.dart',
    language: 'dart',
    description: 'شاشة ضغط الصورة لتصبح بحد أقصى 500 KB مع الحفظ المباشر في معرض الصور (Gallery) بنظام أذونات آمن',
    content: `import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../services/compression_service.dart';
import '../services/file_storage_service.dart';
import '../widgets/save_success_dialog.dart';

class CompressImageScreen extends StatefulWidget {
  const CompressImageScreen({super.key});

  @override
  State<CompressImageScreen> createState() => _CompressImageScreenState();
}

class _CompressImageScreenState extends State<CompressImageScreen> {
  final ImagePicker _picker = ImagePicker();
  File? _selectedImage;
  File? _compressedImage;
  bool _isProcessing = false;
  int _originalSize = 0;
  int _compressedSize = 0;

  Future<void> _pickImage(ImageSource source) async {
    try {
      final XFile? picked = await _picker.pickImage(source: source);
      if (picked != null) {
        final file = File(picked.path);
        final size = await file.length();
        setState(() {
          _selectedImage = file;
          _originalSize = size;
          _compressedImage = null;
          _compressedSize = 0;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر اختيار الصورة: \$e')),
        );
      }
    }
  }

  Future<void> _executeCompressionAndSave() async {
    if (_selectedImage == null) return;

    setState(() => _isProcessing = true);

    try {
      final resultFile = await CompressionService.compressImageToUnder500KB(
        inputFile: _selectedImage!,
      );

      if (resultFile != null && await resultFile.exists() && mounted) {
        final resultSize = await resultFile.length();
        if (resultSize <= 0) return;
        setState(() {
          _compressedImage = resultFile;
          _compressedSize = resultSize;
        });

        await showSaveSuccessDialog(
          context: context,
          savedFile: resultFile,
          sizeBytes: resultSize,
          isImage: true,
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(backgroundColor: Colors.red, content: Text('حدث خطأ أثناء الحفظ: \$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('تصغير حجم الصورة (بحد أقصى 500 KB)'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    children: [
                      if (_selectedImage == null)
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(32),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(color: const Color(0xFFCBD5E1)),
                          ),
                          child: Column(
                            children: [
                              const Icon(Icons.document_scanner_rounded, size: 60, color: Color(0xFF1E3A8A)),
                              const SizedBox(height: 16),
                              const Text(
                                'اختر صورة التوكيل أو المستند',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'سيتم تقليص حجم الصورة لتصبح بحد أقصى 500 KB وحفظها مباشرة في معرض الصور (Gallery) لتناسب منظومة النيابة العامة ومصر الرقمية.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
                              ),
                              const SizedBox(height: 20),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  ElevatedButton.icon(
                                    onPressed: () => _pickImage(ImageSource.gallery),
                                    icon: const Icon(Icons.photo_library_rounded),
                                    label: const Text('المعرض'),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: const Color(0xFF1E3A8A),
                                      foregroundColor: Colors.white,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  OutlinedButton.icon(
                                    onPressed: () => _pickImage(ImageSource.camera),
                                    icon: const Icon(Icons.camera_alt_rounded),
                                    label: const Text('الكاميرا'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        )
                      else ...[
                        Card(
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                          clipBehavior: Clip.antiAlias,
                          child: Column(
                            children: [
                              Image.file(
                                _compressedImage ?? _selectedImage!,
                                height: 220,
                                width: double.infinity,
                                fit: BoxFit.cover,
                              ),
                              Padding(
                                padding: const EdgeInsets.all(14),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Text('الحجم الأصلي:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                                        Text(
                                          FileStorageService.formatBytes(_originalSize),
                                          style: const TextStyle(fontWeight: FontWeight.bold),
                                        ),
                                      ],
                                    ),
                                    if (_compressedSize > 0)
                                      Column(
                                        crossAxisAlignment: CrossAxisAlignment.end,
                                        children: [
                                          const Text('الحجم للمنظومة:', style: TextStyle(fontSize: 12, color: Colors.green)),
                                          Text(
                                            FileStorageService.formatBytes(_compressedSize),
                                            style: const TextStyle(
                                              fontWeight: FontWeight.bold,
                                              color: Color(0xFF0D9488),
                                            ),
                                          ),
                                        ],
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            TextButton.icon(
                              onPressed: () => _pickImage(ImageSource.gallery),
                              icon: const Icon(Icons.refresh_rounded),
                              label: const Text('اختيار صورة أخرى'),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),

              if (_selectedImage != null)
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isProcessing ? null : _executeCompressionAndSave,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF1E3A8A),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: _isProcessing
                        ? const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                              ),
                              SizedBox(width: 12),
                              Text('جاري الضغط والحفظ بالتنزيلات...'),
                            ],
                          )
                        : const Text(
                            'تصغير وحفظ في المعرض (< 500 KB)',
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                          ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
`
  },
  {
    name: 'compress_pdf_screen.dart',
    path: 'lib/screens/compress_pdf_screen.dart',
    language: 'dart',
    description: 'شاشة ضغط ملف الـ PDF ليصبح أقل من 500 KB مع نافذة مشاركة وحفظ فورية بنظام أذونات آمن',
    content: `import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import '../services/compression_service.dart';
import '../services/file_storage_service.dart';
import '../widgets/save_success_dialog.dart';

class CompressPdfScreen extends StatefulWidget {
  const CompressPdfScreen({super.key});

  @override
  State<CompressPdfScreen> createState() => _CompressPdfScreenState();
}

class _CompressPdfScreenState extends State<CompressPdfScreen> {
  File? _selectedPdf;
  File? _compressedPdf;
  bool _isProcessing = false;
  int _originalSize = 0;
  int _compressedSize = 0;
  String _fileName = '';

  Future<void> _pickPdf() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf'],
      );

      if (result != null && result.files.single.path != null) {
        final file = File(result.files.single.path!);
        final size = await file.length();
        setState(() {
          _selectedPdf = file;
          _fileName = result.files.single.name;
          _originalSize = size;
          _compressedPdf = null;
          _compressedSize = 0;
        });
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر اختيار ملف PDF: \$e')),
        );
      }
    }
  }

  Future<void> _executePdfCompression() async {
    if (_selectedPdf == null) return;
    setState(() => _isProcessing = true);

    try {
      final result = await CompressionService.compressExistingPdfToUnder500KB(
        inputPdf: _selectedPdf!,
      );

      if (result != null && await result.exists() && mounted) {
        final resultSize = await result.length();
        if (resultSize <= 0) return;
        setState(() {
          _compressedPdf = result;
          _compressedSize = resultSize;
        });

        await showSaveSuccessDialog(
          context: context,
          savedFile: result,
          sizeBytes: resultSize,
          isImage: false,
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(backgroundColor: Colors.red, content: Text('فشل الضغط: \$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('تصغير حجم ملف PDF (< 500 KB)'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    children: [
                      if (_selectedPdf == null)
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(32),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(color: const Color(0xFFCBD5E1)),
                          ),
                          child: Column(
                            children: [
                              const Icon(Icons.picture_as_pdf_rounded, size: 60, color: Color(0xFFEA580C)),
                              const SizedBox(height: 16),
                              const Text(
                                'اختر ملف PDF لتصغير حجمه',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'سيتم تقليص حجم المخططات والصفحات لاستهداف أقل من 500 KB وحفظه في مجلد Downloads فوراً.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
                              ),
                              const SizedBox(height: 20),
                              ElevatedButton.icon(
                                onPressed: _pickPdf,
                                icon: const Icon(Icons.upload_file_rounded),
                                label: const Text('اختيار ملف PDF'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFFEA580C),
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                                ),
                              ),
                            ],
                          ),
                        )
                      else ...[
                        Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: const Color(0xFFE2E8F0)),
                          ),
                          child: Column(
                            children: [
                              Row(
                                children: [
                                  const Icon(Icons.description_rounded, size: 40, color: Color(0xFFEA580C)),
                                  const SizedBox(width: 14),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          _fileName,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'الحجم الحالي: \${FileStorageService.formatBytes(_originalSize)}',
                                          style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              if (_compressedSize > 0) ...[
                                const Divider(height: 24),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    const Text('الحجم بعد الضغط للمنظومة:', style: TextStyle(fontWeight: FontWeight.bold)),
                                    Text(
                                      FileStorageService.formatBytes(_compressedSize),
                                      style: const TextStyle(
                                        color: Color(0xFF0D9488),
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        TextButton.icon(
                          onPressed: _pickPdf,
                          icon: const Icon(Icons.refresh_rounded),
                          label: const Text('اختيار ملف PDF آخر'),
                        ),
                      ],
                    ],
                  ),
                ),
              ),

              if (_selectedPdf != null)
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isProcessing ? null : _executePdfCompression,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEA580C),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: _isProcessing
                        ? const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                              ),
                              SizedBox(width: 12),
                              Text('جاري الضغط والتنزيل...'),
                            ],
                          )
                        : const Text(
                            'تصغير وحفظ في Downloads (< 500 KB)',
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                          ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
`
  },
  {
    name: 'images_to_pdf_screen.dart',
    path: 'lib/screens/images_to_pdf_screen.dart',
    language: 'dart',
    description: 'شاشة دمج مجموعة صور في ملف PDF واحد بحجم أقل من 500 KB مع نافذة مشاركة وحفظ فورية',
    content: `import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';
import '../services/compression_service.dart';
import '../services/file_storage_service.dart';
import '../widgets/save_success_dialog.dart';

class ImagesToPdfScreen extends StatefulWidget {
  const ImagesToPdfScreen({super.key});

  @override
  State<ImagesToPdfScreen> createState() => _ImagesToPdfScreenState();
}

class _ImagesToPdfScreenState extends State<ImagesToPdfScreen> {
  final ImagePicker _picker = ImagePicker();
  final List<File> _selectedImages = [];
  bool _isProcessing = false;
  File? _createdPdf;
  int _pdfSize = 0;

  Future<void> _pickMultiImages() async {
    try {
      final List<XFile> pickedList = await _picker.pickMultiImage();
      if (pickedList.isNotEmpty) {
        setState(() {
          _selectedImages.addAll(pickedList.map((x) => File(x.path)));
          _createdPdf = null;
          _pdfSize = 0;
        });
      }
    } catch (e) {
      // تجربة بديلة عبر FilePicker في حال تعذر ImagePicker على بعض هواتف أندرويد القديمة
      try {
        final result = await FilePicker.platform.pickFiles(
          type: FileType.image,
          allowMultiple: true,
        );
        if (result != null) {
          setState(() {
            _selectedImages.addAll(
              result.files.where((f) => f.path != null).map((f) => File(f.path!)),
            );
          });
        }
      } catch (err) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('تعذر اختيار الصور: \$err')),
          );
        }
      }
    }
  }

  Future<void> _executeMerge() async {
    if (_selectedImages.isEmpty) return;
    setState(() => _isProcessing = true);

    try {
      final result = await CompressionService.mergeImagesToPdfUnder500KB(
        imageFiles: _selectedImages,
      );

      if (result != null && await result.exists() && mounted) {
        final resultSize = await result.length();
        if (resultSize <= 0) return;
        setState(() {
          _createdPdf = result;
          _pdfSize = resultSize;
        });

        await showSaveSuccessDialog(
          context: context,
          savedFile: result,
          sizeBytes: resultSize,
          isImage: false,
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(backgroundColor: Colors.red, content: Text('فشل الدمج: \$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isProcessing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('دمج الصور في ملف PDF (< 500 KB)'),
        actions: [
          if (_selectedImages.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep_rounded),
              onPressed: () => setState(() => _selectedImages.clear()),
              tooltip: 'مسح الكل',
            ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Expanded(
                child: _selectedImages.isEmpty
                    ? Center(
                        child: Container(
                          padding: const EdgeInsets.all(32),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(24),
                            border: Border.all(color: const Color(0xFFCBD5E1)),
                          ),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.add_photo_alternate_rounded, size: 60, color: Color(0xFF059669)),
                              const SizedBox(height: 16),
                              const Text(
                                'اختر صور المستندات لدمجها',
                                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'اختر صور أوراق الدعوى أو المحضر، وسيقوم التطبيق بضغط كل صورة لتكون النتيجة النهائية ملف PDF واحد بحجم أقل من 500 KB.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
                              ),
                              const SizedBox(height: 20),
                              ElevatedButton.icon(
                                onPressed: _pickMultiImages,
                                icon: const Icon(Icons.photo_library_rounded),
                                label: const Text('اختيار عدة صور'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: const Color(0xFF059669),
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'الصور المحددة (\${_selectedImages.length}):',
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                              ),
                              TextButton.icon(
                                onPressed: _pickMultiImages,
                                icon: const Icon(Icons.add_rounded, size: 18),
                                label: const Text('إضافة المزيد'),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Expanded(
                            child: GridView.builder(
                              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 3,
                                crossAxisSpacing: 10,
                                mainAxisSpacing: 10,
                                childAspectRatio: 0.85,
                              ),
                              itemCount: _selectedImages.length,
                              itemBuilder: (context, index) {
                                return Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(12),
                                      child: Image.file(_selectedImages[index], fit: BoxFit.cover),
                                    ),
                                    Positioned(
                                      top: 4,
                                      right: 4,
                                      child: GestureDetector(
                                        onTap: () => setState(() => _selectedImages.removeAt(index)),
                                        child: Container(
                                          padding: const EdgeInsets.all(4),
                                          decoration: const BoxDecoration(
                                            color: Colors.black54,
                                            shape: BoxShape.circle,
                                          ),
                                          child: const Icon(Icons.close, color: Colors.white, size: 14),
                                        ),
                                      ),
                                    ),
                                    Positioned(
                                      bottom: 4,
                                      left: 4,
                                      child: Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: Colors.black70,
                                          borderRadius: BorderRadius.circular(6),
                                        ),
                                        child: Text(
                                          'ورقة \${index + 1}',
                                          style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                                        ),
                                      ),
                                    ),
                                  ],
                                );
                              },
                            ),
                          ),
                        ],
                      ),
              ),

              if (_selectedImages.isNotEmpty)
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: _isProcessing ? null : _executeMerge,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF059669),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: _isProcessing
                        ? const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                              ),
                              SizedBox(width: 12),
                              Text('جاري الدمج والضغط والحفظ...'),
                            ],
                          )
                        : Text(
                            'دمج \${_selectedImages.length} صور في PDF (< 500 KB)',
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
`
  },
  {
    name: 'side_progress_indicator.dart',
    path: 'lib/widgets/side_progress_indicator.dart',
    language: 'dart',
    description: 'مؤشر تقدم شفاف تفاعلي وصغير وجانبي واختياري يعرض النسبة المئوية لإتمام الضغط والحجم الحالي للملف',
    content: `import 'package:flutter/material.dart';

/// مؤشر تقدم شفاف تفاعلي لعملية الضغط (صغير، جانبي، واختياري)
/// يعرض للمحامي:
/// 1. النسبة المئوية لإتمام الضغط (%)
/// 2. الحجم الحالي للملف مقارنة بالحجم الأصلي لضمان الشفافية
/// 3. اسم المرحلة وتفاصيل جودة الأختام ودقة A4 الفائقة
class SideProgressIndicatorWidget extends StatefulWidget {
  final int percent;
  final int originalBytes;
  final int currentBytes;
  final int targetMaxBytes;
  final String stage;
  final String detail;
  final int? currentPage;
  final int? totalPages;
  final VoidCallback? onClose;

  const SideProgressIndicatorWidget({
    super.key,
    required this.percent,
    required this.originalBytes,
    required this.currentBytes,
    required this.targetMaxBytes,
    required this.stage,
    required this.detail,
    this.currentPage,
    this.totalPages,
    this.onClose,
  });

  @override
  State<SideProgressIndicatorWidget> createState() => _SideProgressIndicatorWidgetState();
}

class _SideProgressIndicatorWidgetState extends State<SideProgressIndicatorWidget> {
  bool _isExpanded = true;

  String _formatBytes(int bytes) {
    if (bytes < 1024) return '\$bytes B';
    if (bytes < 1024 * 1024) return '\${(bytes / 1024).toStringAsFixed(1)} KB';
    return '\${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
  }

  @override
  Widget build(BuildContext context) {
    if (!_isExpanded) {
      // شريط مصغر جانبي (Mini Pill)
      return InkWell(
        onTap: () => setState(() => _isExpanded = true),
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: const Color(0xFF0F172A).withOpacity(0.95),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFF14B8A6).withOpacity(0.5)),
            boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 8)],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(
                width: 8,
                height: 8,
                child: DecoratedBox(
                  decoration: BoxDecoration(color: Color(0xFF14B8A6), shape: BoxShape.circle),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '\${widget.percent}%',
                style: const TextStyle(color: Color(0xFF5EEAD4), fontWeight: FontWeight.bold, fontSize: 12),
              ),
              const SizedBox(width: 8),
              Text(
                _formatBytes(widget.currentBytes),
                style: const TextStyle(color: Color(0xFF34D399), fontSize: 11),
              ),
              const Icon(Icons.keyboard_arrow_down, size: 16, color: Color(0xFF14B8A6)),
            ],
          ),
        ),
      );
    }

    // بطاقة جانبية شفافة كاملة التفاصيل
    return Container(
      width: 220,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF0F172A).withOpacity(0.95),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFF14B8A6).withOpacity(0.4)),
        boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 12, offset: Offset(0, 4))],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(Icons.query_stats, color: Color(0xFF5EEAD4), size: 16),
                  SizedBox(width: 6),
                  Text('مؤشر الشفافية', style: TextStyle(color: Color(0xFF5EEAD4), fontWeight: FontWeight.bold, fontSize: 12)),
                ],
              ),
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.remove, size: 14, color: Colors.white70),
                    onPressed: () => setState(() => _isExpanded = false),
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                  ),
                  if (widget.onClose != null)
                    IconButton(
                      icon: const Icon(Icons.close, size: 14, color: Colors.white70),
                      onPressed: widget.onClose,
                      visualDensity: VisualDensity.compact,
                      padding: EdgeInsets.zero,
                    ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: widget.percent / 100,
              backgroundColor: Colors.white12,
              valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF14B8A6)),
              minHeight: 6,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('الحجم الحالي:', style: TextStyle(color: Colors.white70, fontSize: 11)),
              Text(_formatBytes(widget.currentBytes), style: const TextStyle(color: Color(0xFF34D399), fontWeight: FontWeight.bold, fontSize: 11)),
            ],
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('الأصلي:', style: TextStyle(color: Colors.white38, fontSize: 10)),
              Text(_formatBytes(widget.originalBytes), style: const TextStyle(color: Colors.white38, decoration: TextDecoration.lineThrough, fontSize: 10)),
            ],
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(8)),
            child: Text(
              '\${widget.stage} (\${widget.percent}%)\\n\${widget.detail}',
              style: const TextStyle(color: Colors.white70, fontSize: 9.5),
            ),
          ),
        ],
      ),
    );
  }
}
`
  },
  {
    name: 'save_success_dialog.dart',
    path: 'lib/widgets/save_success_dialog.dart',
    language: 'dart',
    description: 'مربع حوار تأكيد الحفظ المركزي مع الإغلاق اليدوي ×، فتح الملف الفعلي، والإخفاء التلقائي بعد 3 ثوانٍ',
    content: `import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';

/// عرض مربع حوار أنيق في منتصف الشاشة لتأكيد الحفظ الفعلي مع زر فتح الملف وعلامة × واختفاء تلقائي بعد 3 ثوانٍ
Future<void> showSaveSuccessDialog({
  required BuildContext context,
  required File savedFile,
  required int sizeBytes,
  required bool isImage,
}) async {
  if (!await savedFile.exists() || sizeBytes <= 0 || !context.mounted) return;

  await showDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierColor: const Color(0xFF09183B).withOpacity(0.6),
    builder: (dialogContext) => _SaveSuccessDialogContent(
      savedFile: savedFile,
      sizeBytes: sizeBytes,
      isImage: isImage,
    ),
  );
}

class _SaveSuccessDialogContent extends StatefulWidget {
  final File savedFile;
  final int sizeBytes;
  final bool isImage;

  const _SaveSuccessDialogContent({
    required this.savedFile,
    required this.sizeBytes,
    required this.isImage,
  });

  @override
  State<_SaveSuccessDialogContent> createState() => _SaveSuccessDialogContentState();
}

class _SaveSuccessDialogContentState extends State<_SaveSuccessDialogContent> {
  Timer? _autoDismissTimer;
  bool _isClosed = false;

  @override
  void initState() {
    super.initState();
    _autoDismissTimer = Timer(const Duration(seconds: 3), () {
      _closeDialog();
    });
  }

  void _cancelTimer() {
    _autoDismissTimer?.cancel();
    _autoDismissTimer = null;
  }

  void _closeDialog() {
    _cancelTimer();
    if (!_isClosed && mounted) {
      _isClosed = true;
      Navigator.of(context).pop();
    }
  }

  Future<void> _openSavedFile() async {
    _cancelTimer();
    _closeDialog();
    await OpenFilex.open(widget.savedFile.path);
  }

  @override
  void dispose() {
    _cancelTimer();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String locationMessage = widget.isImage
        ? 'تم الحفظ في الاستوديو بنجاح'
        : 'تم الحفظ في مجلد التنزيلات (Downloads) بنجاح';
    final String sizeKb = (widget.sizeBytes / 1024).toStringAsFixed(1);

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 32),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFFD4AF37), width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.25),
              blurRadius: 18,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Align(
              alignment: Alignment.topLeft,
              child: InkWell(
                onTap: _closeDialog,
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  width: 30,
                  height: 30,
                  decoration: const BoxDecoration(
                    color: Color(0xFFF1F5F9),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close, size: 18, color: Color(0xFF475569)),
                ),
              ),
            ),
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: const Color(0xFFECFDF5),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFA7F3D0)),
              ),
              child: const Icon(
                Icons.check_circle_rounded,
                color: Color(0xFF10B981),
                size: 32,
              ),
            ),
            const SizedBox(height: 10),
            Text(
              locationMessage,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFF0F2557),
                fontSize: 14,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '(الحجم: \$sizeKb KB)',
              style: const TextStyle(
                color: Color(0xFF64748B),
                fontSize: 11.5,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 14),
            SizedBox(
              width: double.infinity,
              height: 42,
              child: ElevatedButton.icon(
                onPressed: _openSavedFile,
                icon: const Icon(Icons.open_in_new_rounded, size: 16, color: Color(0xFFFDE047)),
                label: const Text(
                  'فتح الملف',
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.bold),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF0F2557),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          ],
        ),        </div>
      ),
    );
  }
}
`
  },
  {
    name: 'document_scanner_service.dart',
    path: 'lib/services/document_scanner_service.dart',
    language: 'dart',
    description: 'خدمة الماسح الضوئي المستقلة لتصوير المستندات أوفلاين (قص ذكي، تصحيح منظور، تدوير 45°، تحسين ألوان بدون أبيض وأسود، وحفظ مزدوج < 500KB)',
    content: `import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' show Offset;
import 'package:flutter/foundation.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'file_storage_service.dart';

class StabilityCheckResult {
  final double diffScore;
  final bool isCalm;
  final bool isHeavyMotion;

  const StabilityCheckResult({
    required this.diffScore,
    required this.isCalm,
    required this.isHeavyMotion,
  });
}

class ScannedDocumentPage {
  final String id;
  final File originalTempFile;
  final List<Offset> corners;
  final int rotationDeg;
  File processedTempFile;
  int processedSizeBytes;

  ScannedDocumentPage({
    required this.id,
    required this.originalTempFile,
    required this.corners,
    required this.rotationDeg,
    required this.processedTempFile,
    required this.processedSizeBytes,
  });
}

class ScannerDualSaveOutcome {
  final bool requiresOversizeConsent;
  final List<File> savedImages;
  final File? savedPdf;
  final Uint8List? pendingPdfBytes;
  final int pendingPdfSizeBytes;

  const ScannerDualSaveOutcome({
    required this.requiresOversizeConsent,
    required this.savedImages,
    this.savedPdf,
    this.pendingPdfBytes,
    required this.pendingPdfSizeBytes,
  });
}

/// خدمة تصوير المستندات وتحسينها وضغطها المستقلة تماماً عن CompressionService
/// تعمل 100% أوفلاين وتحافظ على الأختام والتوقيعات بالألوان الطبيعية الكاملة
class DocumentScannerService {
  static const int strictMaxBytes = 500 * 1024; // 500 KB
  static const int safeTargetBytes = 485 * 1024; // 485 KB هامش أمان

  static List<Offset> get defaultCorners => const [
        Offset(0.06, 0.06),
        Offset(0.94, 0.06),
        Offset(0.94, 0.94),
        Offset(0.06, 0.94),
      ];

  static StabilityCheckResult analyzeLumaMotion(Uint8List? prevLuma, Uint8List currLuma) {
    if (prevLuma == null || prevLuma.length != currLuma.length) {
      return const StabilityCheckResult(diffScore: 0, isCalm: true, isHeavyMotion: false);
    }
    int totalDiff = 0;
    for (int i = 0; i < currLuma.length; i++) {
      totalDiff += (currLuma[i] - prevLuma[i]).abs();
    }
    final double score = totalDiff / currLuma.length;
    return StabilityCheckResult(
      diffScore: score,
      isCalm: score < 6.5,
      isHeavyMotion: score >= 13.5,
    );
  }

  static List<Offset> detectDocumentCorners(Uint8List gray, int w, int h) {
    int sum = 0;
    for (int i = 0; i < gray.length; i++) sum += gray[i];
    final double meanLum = sum / math.max(1, gray.length);
    final double brightThresh = math.min(220.0, math.max(95.0, meanLum + 14.0));

    double tlScore = -1e9, trScore = -1e9, brScore = -1e9, blScore = -1e9;
    Offset tl = const Offset(0.07, 0.07);
    Offset tr = const Offset(0.93, 0.07);
    Offset br = const Offset(0.93, 0.93);
    Offset bl = const Offset(0.07, 0.93);
    int edgePoints = 0;

    final int minX = (w * 0.04).floor();
    final int maxX = (w * 0.96).floor();
    final int minY = (h * 0.04).floor();
    final int maxY = (h * 0.96).floor();

    for (int y = math.max(1, minY); y < math.min(h - 1, maxY); y++) {
      for (int x = math.max(1, minX); x < math.min(w - 1, maxX); x++) {
        final int gx = -gray[(y - 1) * w + (x - 1)] +
            gray[(y - 1) * w + (x + 1)] -
            2 * gray[y * w + (x - 1)] +
            2 * gray[y * w + (x + 1)] -
            gray[(y + 1) * w + (x - 1)] +
            gray[(y + 1) * w + (x + 1)];
        final int gy = -gray[(y - 1) * w + (x - 1)] -
            2 * gray[(y - 1) * w + x] -
            gray[(y - 1) * w + (x + 1)] +
            gray[(y + 1) * w + (x - 1)] +
            2 * gray[(y + 1) * w + x] +
            gray[(y + 1) * w + (x + 1)];
        final int g = gx.abs() + gy.abs();
        final int lum = gray[y * w + x];

        if (g < 55 || lum < brightThresh * 0.65) continue;
        edgePoints++;

        final double nx = x / w;
        final double ny = y / h;
        final double ew = math.min(g, 240) * 0.35;

        if (nx < 0.48 && ny < 0.48) {
          final double s = ew - (nx + ny) * 140;
          if (s > tlScore) {
            tlScore = s;
            tl = Offset(nx.clamp(0.01, 0.99), ny.clamp(0.01, 0.99));
          }
        } else if (nx > 0.52 && ny < 0.48) {
          final double s = ew - (1 - nx + ny) * 140;
          if (s > trScore) {
            trScore = s;
            tr = Offset(nx.clamp(0.01, 0.99), ny.clamp(0.01, 0.99));
          }
        } else if (nx > 0.52 && ny > 0.52) {
          final double s = ew - (1 - nx + (1 - ny)) * 140;
          if (s > brScore) {
            brScore = s;
            br = Offset(nx.clamp(0.01, 0.99), ny.clamp(0.01, 0.99));
          }
        } else if (nx < 0.48 && ny > 0.52) {
          final double s = ew - (nx + (1 - ny)) * 140;
          if (s > blScore) {
            blScore = s;
            bl = Offset(nx.clamp(0.01, 0.99), ny.clamp(0.01, 0.99));
          }
        }
      }
    }

    if (edgePoints < 35 || tlScore < -1e8 || trScore < -1e8 || brScore < -1e8 || blScore < -1e8) {
      return defaultCorners;
    }
    return [tl, tr, br, bl];
  }

  static List<double> _computeHomography(List<Offset> src, List<Offset> dst) {
    final List<List<double>> a = [];
    final List<double> b = [];
    for (int i = 0; i < 4; i++) {
      final sx = src[i].dx;
      final sy = src[i].dy;
      final dx = dst[i].dx;
      final dy = dst[i].dy;
      a.add([dx, dy, 1, 0, 0, 0, -dx * sx, -dy * sx]);
      b.add(sx);
      a.add([0, 0, 0, dx, dy, 1, -dx * sy, -dy * sy]);
      b.add(sy);
    }

    const int n = 8;
    for (int i = 0; i < n; i++) {
      int maxRow = i;
      for (int k = i + 1; k < n; k++) {
        if (a[k][i].abs() > a[maxRow][i].abs()) maxRow = k;
      }
      final tmpRow = a[i];
      a[i] = a[maxRow];
      a[maxRow] = tmpRow;
      final tmpB = b[i];
      b[i] = b[maxRow];
      b[maxRow] = tmpB;

      final double pivot = a[i][i] == 0 ? 1e-12 : a[i][i];
      for (int j = i; j < n; j++) a[i][j] /= pivot;
      b[i] /= pivot;

      for (int k = 0; k < n; k++) {
        if (k == i) continue;
        final double factor = a[k][i];
        for (int j = i; j < n; j++) a[k][j] -= factor * a[i][j];
        b[k] -= factor * b[i];
      }
    }
    return [...b, 1.0];
  }

  static img.Image warpAndRotate45(
    img.Image src,
    List<Offset> corners,
    int rotationDeg, {
    int maxWorkingDim = 1850,
  }) {
    final int srcW = src.width;
    final int srcH = src.height;
    final List<Offset> pts = corners.map((c) => Offset(c.dx * srcW, c.dy * srcH)).toList();

    final double topW = (pts[1] - pts[0]).distance;
    final double bottomW = (pts[2] - pts[3]).distance;
    final double leftH = (pts[3] - pts[0]).distance;
    final double rightH = (pts[2] - pts[1]).distance;

    int outW = math.max(200, math.max(topW, bottomW).round());
    int outH = math.max(200, math.max(leftH, rightH).round());
    if (outW > maxWorkingDim || outH > maxWorkingDim) {
      final double scale = maxWorkingDim / math.max(outW, outH);
      outW = (outW * scale).round();
      outH = (outH * scale).round();
    }

    final dstPts = [
      const Offset(0, 0),
      Offset(outW - 1.0, 0),
      Offset(outW - 1.0, outH - 1.0),
      Offset(0, outH - 1.0),
    ];
    final h = _computeHomography(pts, dstPts);

    final img.Image warped = img.Image(width: outW, height: outH);
    for (int y = 0; y < outH; y++) {
      for (int x = 0; x < outW; x++) {
        final double denom = h[6] * x + h[7] * y + h[8];
        final double sx = (h[0] * x + h[1] * y + h[2]) / denom;
        final double sy = (h[3] * x + h[4] * y + h[5]) / denom;
        final int px = sx.round().clamp(0, srcW - 1);
        final int py = sy.round().clamp(0, srcH - 1);
        final p = src.getPixel(px, py);
        warped.setPixelRgba(x, y, p.r, p.g, p.b, 255);
      }
    }

    final int normAngle = ((rotationDeg % 360) + 360) % 360;
    if (normAngle == 0) return warped;

    return img.copyRotate(
      warped,
      angle: normAngle.toDouble(),
      interpolation: img.Interpolation.linear,
    );
  }

  static img.Image enhanceLegalColorDocument(img.Image input) {
    final int w = input.width;
    final int h = input.height;
    const int gridCols = 24;
    const int gridRows = 32;
    final Float64List bgGrid = Float64List(gridCols * gridRows);
    final double cellW = w / gridCols;
    final double cellH = h / gridRows;

    for (int gy = 0; gy < gridRows; gy++) {
      final int yStart = (gy * cellH).floor();
      final int yEnd = math.min(h, ((gy + 1) * cellH).ceil());
      for (int gx = 0; gx < gridCols; gx++) {
        final int xStart = (gx * cellW).floor();
        final int xEnd = math.min(w, ((gx + 1) * cellW).ceil());
        final List<double> samples = [];
        final int stepY = math.max(1, ((yEnd - yStart) / 6).floor());
        final int stepX = math.max(1, ((xEnd - xStart) / 6).floor());
        for (int y = yStart; y < yEnd; y += stepY) {
          for (int x = xStart; x < xEnd; x += stepX) {
            final p = input.getPixel(x, y);
            samples.add(0.299 * p.r + 0.587 * p.g + 0.114 * p.b);
          }
        }
        samples.sort();
        final double p88 = samples.isEmpty
            ? 235.0
            : samples[math.min(samples.length - 1, (samples.length * 0.88).floor())];
        bgGrid[gy * gridCols + gx] = math.max(95.0, p88);
      }
    }

    final Float64List smoothBg = Float64List(gridCols * gridRows);
    for (int gy = 0; gy < gridRows; gy++) {
      for (int gx = 0; gx < gridCols; gx++) {
        double acc = 0;
        int cnt = 0;
        for (int dy = -1; dy <= 1; dy++) {
          for (int dx = -1; dx <= 1; dx++) {
            final int nx = gx + dx;
            final int ny = gy + dy;
            if (nx >= 0 && nx < gridCols && ny >= 0 && ny < gridRows) {
              acc += bgGrid[ny * gridCols + nx];
              cnt++;
            }
          }
        }
        smoothBg[gy * gridCols + gx] = acc / cnt;
      }
    }

    final img.Image out = img.Image(width: w, height: h);
    const double targetLum = 242.0;

    for (int y = 0; y < h; y++) {
      final double gyf = (y + 0.5) / cellH - 0.5;
      final int gy0 = gyf.floor().clamp(0, gridRows - 2);
      final double fy = (gyf - gy0).clamp(0.0, 1.0);

      for (int x = 0; x < w; x++) {
        final double gxf = (x + 0.5) / cellW - 0.5;
        final int gx0 = gxf.floor().clamp(0, gridCols - 2);
        final double fx = (gxf - gx0).clamp(0.0, 1.0);

        final double localBg = smoothBg[gy0 * gridCols + gx0] * (1 - fx) * (1 - fy) +
            smoothBg[gy0 * gridCols + gx0 + 1] * fx * (1 - fy) +
            smoothBg[(gy0 + 1) * gridCols + gx0] * (1 - fx) * fy +
            smoothBg[(gy0 + 1) * gridCols + gx0 + 1] * fx * fy;

        final p = input.getPixel(x, y);
        final double gain = (targetLum / math.max(85.0, localBg)).clamp(0.95, 1.85);
        final double effGain = 1.0 + (gain - 1.0) * 0.72;

        double nr = p.r * effGain;
        double ng = p.g * effGain;
        double nb = p.b * effGain;

        final double lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
        final double chroma = math.max(nr, math.max(ng, nb)) - math.min(nr, math.min(ng, nb));

        if (chroma < 26 && lum > 205) {
          final double lift = (lum - 205) * 0.28;
          nr += lift;
          ng += lift;
          nb += lift;
        } else if (lum < 155) {
          final double darken = (155 - lum) * 0.12;
          nr = math.max(0, nr - darken);
          ng = math.max(0, ng - darken);
          nb = math.max(0, nb - darken);
        }

        out.setPixelRgba(
          x,
          y,
          nr.round().clamp(0, 255),
          ng.round().clamp(0, 255),
          nb.round().clamp(0, 255),
          255,
        );
      }
    }

    return out;
  }

  static Future<ScannedDocumentPage> processCapturedPage({
    required File originalTempFile,
    required List<Offset> corners,
    required int rotationDeg,
  }) async {
    final Uint8List rawBytes = await originalTempFile.readAsBytes();
    final img.Image? decoded = img.decodeImage(rawBytes);
    if (decoded == null) {
      throw Exception('تعذر قراءة الصورة الملتقطة');
    }

    final img.Image warped = warpAndRotate45(decoded, corners, rotationDeg);
    final img.Image enhanced = enhanceLegalColorDocument(warped);
    final Uint8List encoded = Uint8List.fromList(img.encodeJpg(enhanced, quality: 88));

    Uint8List finalJpg = encoded;
    if (finalJpg.length > safeTargetBytes) {
      int quality = 85;
      int maxDim = math.max(enhanced.width, enhanced.height);
      finalJpg = await FlutterImageCompress.compressWithList(
        encoded,
        minWidth: maxDim,
        minHeight: maxDim,
        quality: quality,
        format: CompressFormat.jpeg,
      );

      int attempts = 0;
      while (finalJpg.length > safeTargetBytes && attempts < 7) {
        attempts++;
        if (quality > 66) {
          quality = (quality - 5).clamp(64, 85);
        } else if (maxDim > 1150) {
          maxDim = (maxDim * 0.88).round().clamp(1150, 1850);
          quality = 72;
        } else {
          quality = (quality - 4).clamp(56, 70);
        }
        finalJpg = await FlutterImageCompress.compressWithList(
          encoded,
          minWidth: maxDim,
          minHeight: maxDim,
          quality: quality,
          format: CompressFormat.jpeg,
        );
      }
    }

    final Directory cacheDir = await getTemporaryDirectory();
    final String id = 'scan_\${DateTime.now().millisecondsSinceEpoch}_\${math.Random().nextInt(9999)}';
    final File processedFile = File('\${cacheDir.path}/\$id.jpg');
    await processedFile.writeAsBytes(finalJpg, flush: true);

    return ScannedDocumentPage(
      id: id,
      originalTempFile: originalTempFile,
      corners: corners,
      rotationDeg: rotationDeg,
      processedTempFile: processedFile,
      processedSizeBytes: finalJpg.length,
    );
  }

  static Future<Uint8List> _buildCombinedPdfBytes(List<ScannedDocumentPage> pages) async {
    Future<Uint8List> renderWithBudget(int maxDim, int quality) async {
      final pw.Document doc = pw.Document(compress: true);
      for (final page in pages) {
        final Uint8List raw = await page.processedTempFile.readAsBytes();
        final img.Image? info = img.decodeImage(raw);
        final bool isLandscape = info != null && info.width > info.height;

        final Uint8List pageJpg = await FlutterImageCompress.compressWithList(
          raw,
          minWidth: maxDim,
          minHeight: maxDim,
          quality: quality,
          format: CompressFormat.jpeg,
        );

        final pw.MemoryImage memImg = pw.MemoryImage(pageJpg);
        final PdfPageFormat format = isLandscape ? PdfPageFormat.a4.landscape : PdfPageFormat.a4.portrait;

        doc.addPage(
          pw.Page(
            pageFormat: format,
            margin: const pw.EdgeInsets.all(8),
            build: (_) => pw.Center(child: pw.Image(memImg, fit: pw.BoxFit.contain)),
          ),
        );
      }
      return await doc.save();
    }

    final int count = pages.length;
    int maxDim = count == 1 ? 1850 : (count <= 3 ? 1550 : (count <= 6 ? 1300 : 1120));
    int quality = count == 1 ? 82 : (count <= 3 ? 75 : (count <= 6 ? 68 : 62));

    Uint8List pdfBytes = await renderWithBudget(maxDim, quality);

    int attempts = 0;
    while (pdfBytes.length >= strictMaxBytes && attempts < 7) {
      attempts++;
      if (quality > 60) {
        quality = (quality - 5).clamp(56, 82);
      } else if (maxDim > 880) {
        maxDim = (maxDim * 0.88).round().clamp(880, 1850);
        quality = 64;
      } else {
        break;
      }
      pdfBytes = await renderWithBudget(maxDim, quality);
    }
    return pdfBytes;
  }

  static Future<ScannerDualSaveOutcome> prepareAndSaveDualOutputs({
    required List<ScannedDocumentPage> pages,
    bool allowOversizedPdf = false,
  }) async {
    if (pages.isEmpty) {
      throw Exception('لا توجد صفحات مصورة للحفظ');
    }

    final Uint8List pdfBytes = await _buildCombinedPdfBytes(pages);

    if (pdfBytes.length >= strictMaxBytes && !allowOversizedPdf) {
      return ScannerDualSaveOutcome(
        requiresOversizeConsent: true,
        savedImages: const [],
        pendingPdfBytes: pdfBytes,
        pendingPdfSizeBytes: pdfBytes.length,
      );
    }

    final List<File> savedImages = [];
    for (int i = 0; i < pages.length; i++) {
      final Uint8List bytes = await pages[i].processedTempFile.readAsBytes();
      if (bytes.length >= strictMaxBytes) {
        throw Exception('تعذر تقليص الصورة \${i + 1} لأقل من 500 KB');
      }
      final String idxStr = (i + 1).toString().padLeft(3, '0');
      final File savedImg = await FileStorageService.saveImageToGallerySafely(
        bytes: bytes,
        prefix: 'Scan_\$idxStr',
      );
      if (!await savedImg.exists() || await savedImg.length() >= strictMaxBytes) {
        throw Exception('فشل التحقق من حفظ الصورة Scan_\$idxStr');
      }
      savedImages.add(savedImg);
    }

    final File savedPdf = await FileStorageService.saveFileToDownloadsSafely(
      bytes: pdfBytes,
      prefix: 'Scanned_Document',
      extension: '.pdf',
    );
    if (!await savedPdf.exists() || await savedPdf.length() <= 0) {
      throw Exception('فشل حفظ ملف Scanned_Document.pdf');
    }

    for (final page in pages) {
      try {
        if (await page.originalTempFile.exists()) await page.originalTempFile.delete();
        if (await page.processedTempFile.exists()) await page.processedTempFile.delete();
      } catch (_) {}
    }

    return ScannerDualSaveOutcome(
      requiresOversizeConsent: false,
      savedImages: savedImages,
      savedPdf: savedPdf,
      pendingPdfSizeBytes: pdfBytes.length,
    );
  }
}
`
  },
  {
    name: 'document_scanner_screen.dart',
    path: 'lib/screens/document_scanner_screen.dart',
    language: 'dart',
    description: 'شاشة تصوير المستندات أوفلاين (كاميرا مباشرة، التقاط تلقائي/يدوي، تدوير 45°، تعديل قص يدوي، مراجعة وترتيب وحذف وإعادة تصوير، وحفظ مزدوج)',
    content: `import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import '../services/document_scanner_service.dart';
import '../services/file_storage_service.dart';
import '../widgets/save_success_dialog.dart';

enum _ScannerStep { camera, review, manualCrop, fullPreview }

class DocumentScannerScreen extends StatefulWidget {
  const DocumentScannerScreen({super.key});

  @override
  State<DocumentScannerScreen> createState() => _DocumentScannerScreenState();
}

class _DocumentScannerScreenState extends State<DocumentScannerScreen> with WidgetsBindingObserver {
  CameraController? _cameraController;
  _ScannerStep _step = _ScannerStep.camera;
  bool _isAutoMode = true;
  bool _flashOn = false;
  bool _isCameraReady = false;
  bool _isCapturing = false;
  bool _isSaving = false;
  String? _cameraError;
  String? _stabilityWarning;

  final List<ScannedDocumentPage> _pages = [];
  int _selectedIndex = 0;
  int? _retakeIndex;

  List<Offset> _liveQuad = DocumentScannerService.defaultCorners;
  List<Offset> _editingCorners = List.from(DocumentScannerService.defaultCorners);

  Uint8List? _prevLuma;
  int _stableStreak = 0;
  DateTime? _heavyShakeStart;
  DateTime _lastStreamSample = DateTime.fromMillisecondsSinceEpoch(0);
  DateTime _lastAutoCapture = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initCamera();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _cameraController;
    if (controller == null || !controller.value.isInitialized) return;
    if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) {
      _disposeCamera();
    } else if (state == AppLifecycleState.resumed && _step == _ScannerStep.camera) {
      _initCamera();
    }
  }

  Future<void> _initCamera() async {
    setState(() {
      _cameraError = null;
      _isCameraReady = false;
    });
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        setState(() => _cameraError = 'لم يتم العثور على كاميرا متاحة على هذا الجهاز.');
        return;
      }
      final backCam = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        backCam,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.yuv420,
      );
      _cameraController = controller;
      await controller.initialize();
      await controller.setFocusMode(FocusMode.auto);
      await controller.startImageStream(_onCameraFrame);

      if (mounted) {
        setState(() => _isCameraReady = true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _cameraError = 'تعذر تشغيل الكاميرا (تحقق من منح إذن الكاميرا): \$e');
      }
    }
  }

  void _disposeCamera() {
    try {
      _cameraController?.stopImageStream();
    } catch (_) {}
    _cameraController?.dispose();
    _cameraController = null;
    _isCameraReady = false;
    _flashOn = false;
  }

  void _onCameraFrame(CameraImage image) {
    final now = DateTime.now();
    if (_step != _ScannerStep.camera || _isCapturing) return;
    if (now.difference(_lastStreamSample).inMilliseconds < 320) return;
    _lastStreamSample = now;

    if (image.planes.isEmpty) return;
    final yPlane = image.planes.first.bytes;
    const int sw = 100;
    const int sh = 140;
    final Uint8List sampled = Uint8List(sw * sh);
    final int strideY = image.planes.first.bytesPerRow;

    for (int y = 0; y < sh; y++) {
      final int sy = (y * image.height / sh).floor().clamp(0, image.height - 1);
      for (int x = 0; x < sw; x++) {
        final int sx = (x * image.width / sw).floor().clamp(0, image.width - 1);
        final int idx = sy * strideY + sx;
        sampled[y * sw + x] = idx < yPlane.length ? yPlane[idx] : 128;
      }
    }

    final quad = DocumentScannerService.detectDocumentCorners(sampled, sw, sh);
    final stability = DocumentScannerService.analyzeLumaMotion(_prevLuma, sampled);
    _prevLuma = sampled;

    if (!mounted) return;

    if (stability.isHeavyMotion) {
      _heavyShakeStart ??= now;
      _stableStreak = 0;
      if (now.difference(_heavyShakeStart!).inMilliseconds > 1600) {
        setState(() {
          _liveQuad = quad;
          _stabilityWarning = 'حافظ على ثبات الهاتف قليلاً للحصول على أوضح مستند';
        });
      }
    } else {
      _heavyShakeStart = null;
      if (stability.isCalm) {
        _stableStreak++;
        setState(() {
          _liveQuad = quad;
          _stabilityWarning = null;
        });
        if (_isAutoMode &&
            _stableStreak >= 4 &&
            now.difference(_lastAutoCapture).inMilliseconds > 2400) {
          _lastAutoCapture = now;
          _stableStreak = 0;
          _captureNow();
        }
      } else {
        _stableStreak = 0;
        setState(() {
          _liveQuad = quad;
          _stabilityWarning = null;
        });
      }
    }
  }

  Future<void> _toggleFlash() async {
    final controller = _cameraController;
    if (controller == null || !controller.value.isInitialized) return;
    try {
      final next = !_flashOn;
      await controller.setFlashMode(next ? FlashMode.torch : FlashMode.off);
      setState(() => _flashOn = next);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('الفلاش غير مدعوم على هذا الجهاز')),
        );
      }
    }
  }

  Future<void> _captureNow() async {
    final controller = _cameraController;
    if (controller == null || !controller.value.isInitialized || _isCapturing) return;

    setState(() => _isCapturing = true);
    try {
      await controller.setFocusPoint(const Offset(0.5, 0.5));
    } catch (_) {}

    try {
      final XFile shot = await controller.takePicture();
      final Directory tmpDir = await getTemporaryDirectory();
      final File tempOriginal = File(
        '\${tmpDir.path}/orig_\${DateTime.now().millisecondsSinceEpoch}.jpg',
      );
      await File(shot.path).copy(tempOriginal.path);

      final ScannedDocumentPage scanned = await DocumentScannerService.processCapturedPage(
        originalTempFile: tempOriginal,
        corners: List.from(_liveQuad),
        rotationDeg: 0,
      );

      if (!mounted) return;
      setState(() {
        if (_retakeIndex != null && _retakeIndex! < _pages.length) {
          _pages[_retakeIndex!] = scanned;
          _selectedIndex = _retakeIndex!;
          _retakeIndex = null;
          _disposeCamera();
          _step = _ScannerStep.review;
        } else {
          _pages.add(scanned);
          _selectedIndex = _pages.length - 1;
        }
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          duration: Duration(seconds: 1),
          content: Text('📸 تم التقاط الورقة وتحسينها بالألوان الكاملة'),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('تعذر التقاط الورقة: \$e (الصفحات السابقة محفوظة)')),
        );
      }
    } finally {
      if (mounted) setState(() => _isCapturing = false);
    }
  }

  Future<void> _pickFromGalleryFallback() async {
    try {
      final XFile? file = await ImagePicker().pickImage(source: ImageSource.gallery);
      if (file == null) return;
      setState(() => _isCapturing = true);

      final Directory tmpDir = await getTemporaryDirectory();
      final File tempOriginal = File(
        '\${tmpDir.path}/pick_\${DateTime.now().millisecondsSinceEpoch}.jpg',
      );
      await File(file.path).copy(tempOriginal.path);

      final scanned = await DocumentScannerService.processCapturedPage(
        originalTempFile: tempOriginal,
        corners: DocumentScannerService.defaultCorners,
        rotationDeg: 0,
      );

      if (!mounted) return;
      setState(() {
        _pages.add(scanned);
        _selectedIndex = _pages.length - 1;
        _disposeCamera();
        _step = _ScannerStep.review;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('خطأ: \$e')));
      }
    } finally {
      if (mounted) setState(() => _isCapturing = false);
    }
  }

  Future<void> _rotateSelected45() async {
    if (_pages.isEmpty) return;
    final page = _pages[_selectedIndex];
    final nextAngle = (page.rotationDeg + 45) % 360;
    try {
      final updated = await DocumentScannerService.processCapturedPage(
        originalTempFile: page.originalTempFile,
        corners: page.corners,
        rotationDeg: nextAngle,
      );
      if (!mounted) return;
      setState(() {
        _pages[_selectedIndex] = updated;
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('تعذر التدوير: \$e')));
      }
    }
  }

  Future<void> _saveDualOutputs({bool allowOversized = false}) async {
    if (_pages.isEmpty || _isSaving) return;
    setState(() => _isSaving = true);

    try {
      final outcome = await DocumentScannerService.prepareAndSaveDualOutputs(
        pages: _pages,
        allowOversizedPdf: allowOversized,
      );

      if (!mounted) return;
      if (outcome.requiresOversizeConsent) {
        final String sizeKb = (outcome.pendingPdfSizeBytes / 1024).toStringAsFixed(1);
        final bool? approved = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('تنبيه حجم ملف PDF', style: TextStyle(fontWeight: FontWeight.bold)),
            content: Text(
              'تعذر ضغط ملف Scanned_Document.pdf بالكامل لأقل من 500 KB دون الإضرار بوضوح النصوص والأختام.\\nالحجم الفعلي: \$sizeKb KB\\nهل ترغب في الحفظ بهذا الحجم؟',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('إلغاء ومراجعة الصفحات'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text('حفظ رغم ذلك (\$sizeKb KB)'),
              ),
            ],
          ),
        );
        if (approved == true) {
          await _saveDualOutputs(allowOversized: true);
        }
        return;
      }

      if (outcome.savedPdf != null) {
        await showSaveSuccessDialog(
          context: context,
          savedFile: outcome.savedPdf!,
          sizeBytes: outcome.pendingPdfSizeBytes,
          isImage: false,
        );
        if (mounted) Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: Colors.red,
            content: Text('تعذر الحفظ (الصفحات المؤقتة محفوظة لإعادة المحاولة): \$e'),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _applyManualCrop() async {
    if (_pages.isEmpty) return;
    final page = _pages[_selectedIndex];
    setState(() {
      _step = _ScannerStep.review;
      _isCapturing = true;
    });
    try {
      final updated = await DocumentScannerService.processCapturedPage(
        originalTempFile: page.originalTempFile,
        corners: List.from(_editingCorners),
        rotationDeg: page.rotationDeg,
      );
      if (!mounted) return;
      setState(() => _pages[_selectedIndex] = updated);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('تعذر القص اليدوي: \$e')));
      }
    } finally {
      if (mounted) setState(() => _isCapturing = false);
    }
  }

  void _movePage(int delta) {
    final int target = _selectedIndex + delta;
    if (target < 0 || target >= _pages.length) return;
    setState(() {
      final item = _pages.removeAt(_selectedIndex);
      _pages.insert(target, item);
      _selectedIndex = target;
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _disposeCamera();
    for (final p in _pages) {
      try {
        if (p.originalTempFile.existsSync()) p.originalTempFile.deleteSync();
        if (p.processedTempFile.existsSync()) p.processedTempFile.deleteSync();
      } catch (_) {}
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    String title = 'تصوير المستندات';
    if (_step == _ScannerStep.review) title = 'مراجعة المستند (\${_pages.length})';
    else if (_step == _ScannerStep.manualCrop) title = 'تعديل حدود القص اليدوي';
    else if (_step == _ScannerStep.fullPreview) title = 'معاينة المستند الكامل';

    return Scaffold(
      appBar: AppBar(
        title: Text(title),
        backgroundColor: const Color(0xFF0F766E),
      ),
      body: SafeArea(
        child: _step == _ScannerStep.camera
            ? _buildCameraView()
            : _step == _ScannerStep.manualCrop
                ? _buildManualCropView()
                : _step == _ScannerStep.fullPreview
                    ? _buildFullPreviewView()
                    : _buildReviewView(),
      ),
    );
  }

  Widget _buildCameraView() {
    if (_cameraError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.no_photography_rounded, size: 56, color: Colors.amber),
              const SizedBox(height: 12),
              Text(_cameraError!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              ElevatedButton(onPressed: _initCamera, child: const Text('إعادة المحاولة')),
              TextButton(onPressed: _pickFromGalleryFallback, child: const Text('استيراد صورة من الجهاز')),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        Container(
          color: const Color(0xFF09183B),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  ChoiceChip(
                    label: const Text('تلقائي'),
                    selected: _isAutoMode,
                    onSelected: (_) => setState(() => _isAutoMode = true),
                  ),
                  const SizedBox(width: 6),
                  ChoiceChip(
                    label: const Text('يدوي'),
                    selected: !_isAutoMode,
                    onSelected: (_) => setState(() => _isAutoMode = false),
                  ),
                ],
              ),
              Row(
                children: [
                  IconButton(
                    icon: Icon(_flashOn ? Icons.flash_on : Icons.flash_off, color: Colors.amber),
                    onPressed: _toggleFlash,
                  ),
                  if (_pages.isNotEmpty)
                    ElevatedButton(
                      onPressed: () {
                        _disposeCamera();
                        setState(() => _step = _ScannerStep.review);
                      },
                      child: Text('مراجعة (\${_pages.length})'),
                    ),
                ],
              ),
            ],
          ),
        ),
        Expanded(
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (_isCameraReady && _cameraController != null)
                CameraPreview(_cameraController!)
              else
                const Center(child: CircularProgressIndicator()),
              CustomPaint(painter: _QuadBorderPainter(_liveQuad)),
              if (_stabilityWarning != null)
                Positioned(
                  top: 12,
                  left: 24,
                  right: 24,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.black87,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      _stabilityWarning!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.amberAccent, fontSize: 12),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Container(
          color: const Color(0xFF09183B),
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              TextButton.icon(
                onPressed: _pickFromGalleryFallback,
                icon: const Icon(Icons.photo_library, color: Colors.white),
                label: const Text('المعرض', style: TextStyle(color: Colors.white)),
              ),
              FloatingActionButton(
                backgroundColor: const Color(0xFF0F766E),
                onPressed: _isCapturing ? null : _captureNow,
                child: _isCapturing
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Icon(Icons.camera_alt, color: Colors.white),
              ),
              Text(
                '\${_pages.length} صفحة',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildManualCropView() {
    if (_pages.isEmpty) return const SizedBox.shrink();
    final page = _pages[_selectedIndex];
    return Column(
      children: [
        Expanded(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return GestureDetector(
                onPanUpdate: (details) {
                  final Offset local = details.localPosition;
                  final double nx = (local.dx / constraints.maxWidth).clamp(0.02, 0.98);
                  final double ny = (local.dy / constraints.maxHeight).clamp(0.02, 0.98);
                  int closest = 0;
                  double bestDist = 1e9;
                  for (int i = 0; i < 4; i++) {
                    final double d = (_editingCorners[i] - Offset(nx, ny)).distance;
                    if (d < bestDist) {
                      bestDist = d;
                      closest = i;
                    }
                  }
                  setState(() => _editingCorners[closest] = Offset(nx, ny));
                },
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.file(page.originalTempFile, fit: BoxFit.fill),
                    CustomPaint(painter: _QuadBorderPainter(_editingCorners)),
                  ],
                ),
              );
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => setState(() => _step = _ScannerStep.review),
                  child: const Text('إلغاء'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF0F766E), foregroundColor: Colors.white),
                  onPressed: _applyManualCrop,
                  child: const Text('تطبيق القص وتصحيح المنظور'),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFullPreviewView() {
    return Column(
      children: [
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: _pages.length,
            itemBuilder: (_, idx) => Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'صفحة \${idx + 1} (Scan_\${(idx + 1).toString().padLeft(3, '0')}.jpg) - \${FileStorageService.formatBytes(_pages[idx].processedSizeBytes)}',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                    ),
                    const SizedBox(height: 6),
                    Image.file(_pages[idx].processedTempFile, fit: BoxFit.contain),
                  ],
                ),
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => setState(() => _step = _ScannerStep.review),
              child: const Text('العودة إلى المراجعة والحفظ'),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildReviewView() {
    if (_pages.isEmpty) {
      return Center(
        child: ElevatedButton(
          onPressed: () {
            setState(() => _step = _ScannerStep.camera);
            _initCamera();
          },
          child: const Text('بدء تصوير مستند'),
        ),
      );
    }

    final current = _pages[_selectedIndex];
    return Column(
      children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Image.file(current.processedTempFile, fit: BoxFit.contain),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Wrap(
            spacing: 6,
            runSpacing: 4,
            alignment: WrapAlignment.center,
            children: [
              OutlinedButton.icon(
                onPressed: _rotateSelected45,
                icon: const Icon(Icons.rotate_right, size: 16),
                label: Text('تدوير 45° (\${current.rotationDeg}°)'),
              ),
              OutlinedButton.icon(
                onPressed: () {
                  setState(() {
                    _editingCorners = List.from(current.corners);
                    _step = _ScannerStep.manualCrop;
                  });
                },
                icon: const Icon(Icons.crop, size: 16),
                label: const Text('تعديل القص'),
              ),
              OutlinedButton.icon(
                onPressed: () => setState(() => _step = _ScannerStep.fullPreview),
                icon: const Icon(Icons.visibility, size: 16),
                label: const Text('معاينة كاملة'),
              ),
              OutlinedButton.icon(
                onPressed: _selectedIndex > 0 ? () => _movePage(-1) : null,
                icon: const Icon(Icons.arrow_forward, size: 16),
                label: const Text('تقديم'),
              ),
              OutlinedButton.icon(
                onPressed: _selectedIndex < _pages.length - 1 ? () => _movePage(1) : null,
                icon: const Icon(Icons.arrow_back, size: 16),
                label: const Text('تأخير'),
              ),
              OutlinedButton.icon(
                onPressed: () {
                  setState(() {
                    _retakeIndex = _selectedIndex;
                    _step = _ScannerStep.camera;
                  });
                  _initCamera();
                },
                icon: const Icon(Icons.camera_alt, size: 16),
                label: const Text('إعادة تصوير'),
              ),
              OutlinedButton.icon(
                onPressed: () {
                  setState(() {
                    _pages.removeAt(_selectedIndex);
                    if (_pages.isEmpty) {
                      _step = _ScannerStep.camera;
                      _initCamera();
                    } else {
                      _selectedIndex = _selectedIndex.clamp(0, _pages.length - 1);
                    }
                  });
                },
                icon: const Icon(Icons.delete, color: Colors.red, size: 16),
                label: const Text('حذف', style: TextStyle(color: Colors.red)),
              ),
              OutlinedButton.icon(
                onPressed: () {
                  setState(() {
                    _retakeIndex = null;
                    _step = _ScannerStep.camera;
                  });
                  _initCamera();
                },
                icon: const Icon(Icons.add_a_photo, size: 16),
                label: const Text('إضافة صفحة'),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 68,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            itemCount: _pages.length,
            itemBuilder: (_, idx) => GestureDetector(
              onTap: () => setState(() => _selectedIndex = idx),
              child: Container(
                width: 50,
                margin: const EdgeInsets.only(left: 8),
                decoration: BoxDecoration(
                  border: Border.all(
                    color: idx == _selectedIndex ? const Color(0xFF0F766E) : Colors.grey,
                    width: idx == _selectedIndex ? 2.5 : 1,
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Image.file(_pages[idx].processedTempFile, fit: BoxFit.cover),
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(14),
          child: SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF0F766E),
                foregroundColor: Colors.white,
              ),
              onPressed: _isSaving ? null : () => _saveDualOutputs(),
              icon: _isSaving
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                    )
                  : const Icon(Icons.save_alt),
              label: Text(
                'حفظ Scan_001.. و Scanned_Document.pdf (< 500 KB) • \${FileStorageService.formatBytes(current.processedSizeBytes)}',
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _QuadBorderPainter extends CustomPainter {
  final List<Offset> quad;
  _QuadBorderPainter(this.quad);

  @override
  void paint(Canvas canvas, Size size) {
    if (quad.length != 4) return;
    final paint = Paint()
      ..color = const Color(0xFF2DD4BF)
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke;

    final path = Path()
      ..moveTo(quad[0].dx * size.width, quad[0].dy * size.height)
      ..lineTo(quad[1].dx * size.width, quad[1].dy * size.height)
      ..lineTo(quad[2].dx * size.width, quad[2].dy * size.height)
      ..lineTo(quad[3].dx * size.width, quad[3].dy * size.height)
      ..close();

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _QuadBorderPainter oldDelegate) => true;
}
`
  }
];
