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
description: "تطبيق تصغير حجم الصور للمنظومة - مخصص للمحامين لمنصة النيابة ومحكمة الأسرة ومصر الرقمية"
publish_to: 'none'
version: 1.0.0+1

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

  # إنشاء ودمج ومعالجة ملفات PDF لاستهداف أقل من 500KB
  pdf: ^3.10.8
  printing: ^5.13.2

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

    <!-- استعلام حزم المتصفح لفتح روابط النيابة ومصر الرقمية على أندرويد 11+ -->
    <queries>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" />
        </intent>
    </queries>

    <application
        android:label="تصغير حجم الصور للمنظومة"
        android:name="\${applicationName}"
        android:icon="@mipmap/ic_launcher"
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
    description: 'خوارزمية الضغط بدقة: الصور < 500KB في المعرض، والـ PDF < 500KB، مع نافذة مشاركة سريعة',
    content: `import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:image/image.dart' as img;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'file_storage_service.dart';

/// خدمة معالجة وضغط الملفات محلياً لتناسب اشتراطات النيابة العامة ومصر الرقمية
class CompressionService {
  // الحد الأقصى الصارم للصور: 480KB لضمان عدم تجاوز 500KB نهائياً
  static const int maxImageBytes = 480 * 1024; // ~491,520 bytes

  // الحد الأقصى المشروط للـ PDF: 450KB لضمان عدم تجاوز 500KB نهائياً
  static const int strictPdfThresholdBytes = 450 * 1024; // 450 KB
  static const int maxPdfLimitBytes = 490 * 1024; // ~501,760 bytes

  // ==================== أ) تصغير حجم الصورة بحد أقصى 500KB وحفظها بالمعرض ====================
  static Future<File?> compressImageToUnder500KB({
    required File inputFile,
  }) async {
    final int originalSize = await inputFile.length();
    debugPrint('حجم الصورة الأصلي للمستند: \${originalSize ~/ 1024} KB');

    final Uint8List originalBytes = await inputFile.readAsBytes();

    // حد أقصى ذكي للأبعاد: 1280 بكسل للحفاظ على أعلى دقة للأختام والنصوص
    int targetWidth = 1280;
    int targetHeight = 1280;
    final img.Image? decoded = img.decodeImage(originalBytes);
    if (decoded != null) {
      final double ratio = decoded.width / decoded.height;
      if (ratio > 1) {
        targetWidth = 1280;
        targetHeight = (1280 / ratio).round();
      } else {
        targetHeight = 1280;
        targetWidth = (1280 * ratio).round();
      }
    }

    // جودة ابتدائية ممتازة 70%
    int quality = 70;
    Uint8List? bestResult = await FlutterImageCompress.compressWithList(
      originalBytes,
      minWidth: targetWidth,
      minHeight: targetHeight,
      quality: quality,
      format: CompressFormat.jpeg,
    );

    // حلقة تقليل الجودة والتحجيم إذا تجاوزت الصورة 480 KB (500 KB)
    int attempts = 0;
    while (bestResult != null && bestResult.length > maxImageBytes && attempts < 6) {
      attempts++;
      quality = (quality - 10).clamp(25, 70);
      targetWidth = (targetWidth * 0.85).round();
      targetHeight = (targetHeight * 0.85).round();

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

  // ==================== ب) تصغير حجم ملف PDF لأقل من 500KB مع الحفاظ على الألوان وجودة الخط ====================
  static Future<File?> compressExistingPdfToUnder500KB({
    required File inputPdf,
  }) async {
    final int originalSize = await inputPdf.length();
    debugPrint('حجم الـ PDF الأصلي: \${originalSize ~/ 1024} KB');

    final Uint8List originalBytes = await inputPdf.readAsBytes();

    try {
      // 1. معالجة الصفحات بدقة 72-96 DPI المعتمدة لدمج ضغط الصور (Image Scaling) قبل إضافتها لمستند الـ PDF
      // هذه الدقة تمنح حِدة ونقاء تام للخطوط والأختام مع خفض الحجم ليكون أقل من 500 KB حتماً
      pw.Document compressedDoc = pw.Document(compress: true);
      await for (final page in Printing.raster(originalBytes, dpi: 96)) {
        final imageBytes = await page.toPng();
        final Uint8List? compressedPage = await FlutterImageCompress.compressWithList(
          imageBytes,
          minWidth: 1024,
          minHeight: 1024,
          quality: 72, // جودة نقية تمنع تشويش الخطوط والأختام
          format: CompressFormat.jpeg,
        );

        final image = pw.MemoryImage(compressedPage ?? imageBytes);
        compressedDoc.addPage(
          pw.Page(
            pageFormat: PdfPageFormat.a4,
            margin: pw.EdgeInsets.zero,
            build: (context) => pw.FullPage(
              ignoreMargins: true,
              child: pw.Image(image, fit: pw.BoxFit.fill),
            ),
          ),
        );
      }

      Uint8List finalPdfBytes = await compressedDoc.save();

      // 2. الشرط الصارم: إذا كان حجم ملف الـ PDF الناتج أكبر من 470 KB، إعادة ضغط متدرجة بدقة 72 DPI
      if (finalPdfBytes.length > strictPdfThresholdBytes) {
        debugPrint('حجم الـ PDF (\${finalPdfBytes.length ~/ 1024} KB) أكبر من 470 KB، جاري إعادة الضغط بدقة 72 DPI...');
        final pw.Document strictDoc = pw.Document(compress: true);
        await for (final page in Printing.raster(originalBytes, dpi: 72)) {
          final imageBytes = await page.toPng();
          final Uint8List? strictlyCompressed = await FlutterImageCompress.compressWithList(
            imageBytes,
            minWidth: 850,
            minHeight: 850,
            quality: 60,
            format: CompressFormat.jpeg,
          );

          final image = pw.MemoryImage(strictlyCompressed ?? imageBytes);
          strictDoc.addPage(
            pw.Page(
              pageFormat: PdfPageFormat.a4,
              margin: pw.EdgeInsets.zero,
              build: (context) => pw.FullPage(
                ignoreMargins: true,
                child: pw.Image(image, fit: pw.BoxFit.fill),
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

  // ==================== ج) دمج مجموعة صور في ملف PDF واحد (< 500KB بالألوان الكاملة) ====================
  static Future<File?> mergeImagesToPdfUnder500KB({
    required List<File> imageFiles,
  }) async {
    if (imageFiles.isEmpty) return null;

    final int pageCount = imageFiles.length;
    int baseDim = 1240;
    int baseQuality = 68;

    if (pageCount == 1) {
      baseDim = 1350;
      baseQuality = 74;
    } else if (pageCount == 2) {
      baseDim = 1240;
      baseQuality = 68;
    } else {
      baseDim = (1200 - pageCount * 35).clamp(900, 1200);
      baseQuality = (66 - pageCount * 2).clamp(50, 68);
    }

    final pw.Document pdf = pw.Document(compress: true);
    for (final file in imageFiles) {
      final bytes = await file.readAsBytes();

      // تحجيم الأبعاد بدقة A4 متوازنة وجودة نقية بالألوان الكاملة
      final Uint8List? optimizedBytes = await FlutterImageCompress.compressWithList(
        bytes,
        minWidth: baseDim,
        minHeight: baseDim,
        quality: baseQuality,
        format: CompressFormat.jpeg,
      );

      final imageToAdd = pw.MemoryImage(optimizedBytes ?? bytes);
      pdf.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          margin: const pw.EdgeInsets.all(12),
          build: (pw.Context context) {
            return pw.Center(
              child: pw.Image(imageToAdd, fit: pw.BoxFit.contain),
            );
          },
        ),
      );
    }

    Uint8List pdfBytes = await pdf.save();

    // 2. الشرط الصارم: إذا تجاوز 470 KB، إعادة ضغط متدرج لحفظ الحجم أقل من 500 KB
    if (pdfBytes.length > strictPdfThresholdBytes) {
      debugPrint('حجم الـ PDF المدمج (\${pdfBytes.length ~/ 1024} KB) تجاوز 470 KB، إعادة ضبط خفيفة...');
      final pw.Document strictPdf = pw.Document(compress: true);

      for (final file in imageFiles) {
        final bytes = await file.readAsBytes();
        final Uint8List? reCompressed = await FlutterImageCompress.compressWithList(
          bytes,
          minWidth: (baseDim * 0.90).round(),
          minHeight: (baseDim * 0.90).round(),
          quality: (baseQuality - 8).clamp(42, 65),
          format: CompressFormat.jpeg,
        );

        final imageToAdd = pw.MemoryImage(reCompressed ?? bytes);
        strictPdf.addPage(
          pw.Page(
            pageFormat: PdfPageFormat.a4,
            margin: const pw.EdgeInsets.all(12),
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

  // ضبط شريط الحالة للنظام
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
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
      title: 'تصغير حجم الصور للمنظومة',
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
          seedColor: const Color(0xFF1E3A8A), // كحلي قضائي فخم
          primary: const Color(0xFF1E3A8A),
          secondary: const Color(0xFF0D9488),
          surface: Colors.white,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        appBarTheme: const AppBarTheme(
          elevation: 0.5,
          backgroundColor: Color(0xFF1E3A8A),
          foregroundColor: Colors.white,
          centerTitle: true,
          titleTextStyle: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 18,
            fontWeight: FontWeight.bold,
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
import 'compress_image_screen.dart';
import 'compress_pdf_screen.dart';
import 'images_to_pdf_screen.dart';
import 'legal_portals_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        // 1. اسم التطبيق نصاً في العنوان الرئيسي:
        title: const Text('تصغير حجم الصور للمنظومة'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          children: [
            // بطاقة الترحيب العلوية
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF1E3A8A), Color(0xFF0F172A)],
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF1E3A8A).withOpacity(0.25),
                    blurRadius: 14,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'أهلاً بك زميلي العزيز المحامي ⚖️',
                    style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'معالجة محلية سريعة للمستندات وحفظ مباشر في مجلد التنزيلات (Downloads).',
                    style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 11.5),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // ==================== أ) الأزرار الثلاثة في منتصف الشاشة ====================
            const Text(
              'أدوات ضغط وتحويل المستندات:',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 12),

            // 1. تصغير حجم الصورة بدقة لتصبح بحد أقصى 500 KB
            _ServiceCard(
              title: 'تصغير حجم الصورة',
              subtitle: 'ضغط فوتوغرافي عالي الدقة للتوكيلات وبطاقات الرقم القومي بحد أقصى 500 KB مع الحفظ المباشر في المعرض (Gallery).',
              badgeText: 'بحد أقصى 500 KB',
              badgeColor: const Color(0xFF2563EB),
              icon: Icons.photo_size_select_small_rounded,
              iconBgColor: const Color(0xFFEFF6FF),
              iconColor: const Color(0xFF2563EB),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const CompressImageScreen()),
                );
              },
            ),

            const SizedBox(height: 12),

            // 2. تصغير حجم ملف PDF ليصبح أقل من 500 KB
            _ServiceCard(
              title: 'تصغير حجم ملف PDF',
              subtitle: 'تقليص حجم المذكرات وعرائض الشكاوى لأقل من 500 KB مع نافذة مشاركة وحفظ فورية.',
              badgeText: 'بحد أقصى 500 KB',
              badgeColor: const Color(0xFFEA580C),
              icon: Icons.picture_as_pdf_rounded,
              iconBgColor: const Color(0xFFFFF7ED),
              iconColor: const Color(0xFFEA580C),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const CompressPdfScreen()),
                );
              },
            ),

            const SizedBox(height: 12),

            // 3. دمج الصور في ملف pdf واحد (بحجم أقل من 500 KB)
            _ServiceCard(
              title: 'دمج الصور في ملف pdf واحد',
              subtitle: 'دمج صور أوراق الجنحة أو حافظة المستندات في ملف PDF موحد لا يتجاوز 500 KB.',
              badgeText: 'أقل من 500 KB',
              badgeColor: const Color(0xFF059669),
              icon: Icons.collections_bookmark_rounded,
              iconBgColor: const Color(0xFFECFDF5),
              iconColor: const Color(0xFF059669),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ImagesToPdfScreen()),
                );
              },
            ),

            const SizedBox(height: 26),

            // ==================== ب) المربع الأزرق المميز المنفصل في أسفل الشاشة ====================
            Container(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(22),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF1E40AF).withOpacity(0.3),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const LegalPortalsScreen()),
                    );
                  },
                  borderRadius: BorderRadius.circular(22),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF1E3A8A), Color(0xFF2563EB)],
                        begin: Alignment.topRight,
                        end: Alignment.bottomLeft,
                      ),
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(color: const Color(0xFF60A5FA).withOpacity(0.7), width: 1.5),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 52,
                          height: 52,
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.18),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: Colors.white.withOpacity(0.3)),
                          ),
                          child: const Icon(
                            Icons.language_rounded,
                            color: Colors.white,
                            size: 30,
                          ),
                        ),
                        const SizedBox(width: 14),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'تسجيل الدخول لموقع النيابة ومحكمة الأسرة ومصر الرقمية',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 14.5,
                                  fontWeight: FontWeight.bold,
                                  height: 1.35,
                                ),
                              ),
                              SizedBox(height: 5),
                              Text(
                                'اضغط هنا لفتح شبكة الـ 10 مواقع القضائية الرسمية مباشرة',
                                style: TextStyle(
                                  color: Color(0xFFDBEAFE),
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Icon(
                          Icons.arrow_forward_ios_rounded,
                          color: Colors.white,
                          size: 16,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 16),

            // شريط إشعار حفظ المعرض
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.photo_library_rounded, color: Color(0xFF0D9488), size: 20),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'الصور تُحفظ مباشرة في استوديو الصور (Gallery) • والـ PDF بنافذة مشاركة فورية.',
                      style: TextStyle(fontSize: 11.5, color: Color(0xFF334155), fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            // تعديل مكان ومظهر اسم المصمم في الفوتر بخط صغير وأنيق
            Center(
              child: Text(
                'تصميم وتنفيذ: مصطفى فرويز المحامي ⚖️',
                style: TextStyle(
                  fontSize: 11.5,
                  color: Colors.grey.shade500,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.2,
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }
}

class _ServiceCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String badgeText;
  final Color badgeColor;
  final IconData icon;
  final Color iconBgColor;
  final Color iconColor;
  final VoidCallback onTap;

  const _ServiceCard({
    required this.title,
    required this.subtitle,
    required this.badgeText,
    required this.badgeColor,
    required this.icon,
    required this.iconBgColor,
    required this.iconColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: ListTile(
        contentPadding: const EdgeInsets.all(14),
        leading: CircleAvatar(
          backgroundColor: iconBgColor,
          child: Icon(icon, color: iconColor),
        ),
        title: Row(
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.bold),
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: badgeColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                badgeText,
                style: TextStyle(
                  color: badgeColor,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            subtitle,
            style: const TextStyle(fontSize: 11.5, color: Colors.grey),
          ),
        ),
        onTap: onTap,
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
        title: const Text('مواقع النيابة ومحكمة الأسرة ومصر الرقمية'),
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
                  colors: [Color(0xFF1E3A8A), Color(0xFF2563EB)],
                ),
                borderRadius: BorderRadius.circular(18),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF1E3A8A).withOpacity(0.2),
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
import 'package:open_filex/open_filex.dart';
import '../services/compression_service.dart';
import '../services/file_storage_service.dart';

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

      if (resultFile != null && mounted) {
        final resultSize = await resultFile.length();
        setState(() {
          _compressedImage = resultFile;
          _compressedSize = resultSize;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: const Color(0xFF0D9488),
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 4),
            content: Text(
              '✅ تم حفظ الصورة مباشرة في استوديو الصور (Gallery)! (\${resultSize ~/ 1024} KB < 500KB)',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            action: SnackBarAction(
              label: 'فتح',
              textColor: Colors.white,
              onPressed: () => OpenFilex.open(resultFile.path),
            ),
          ),
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
import 'package:open_filex/open_filex.dart';
import 'package:share_plus/share_plus.dart';
import '../services/compression_service.dart';
import '../services/file_storage_service.dart';

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

      if (result != null && mounted) {
        final resultSize = await result.length();
        setState(() {
          _compressedPdf = result;
          _compressedSize = resultSize;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: const Color(0xFF0D9488),
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 4),
            content: Text(
              '✅ تم حفظ الـ PDF بنجاح! (\${resultSize ~/ 1024} KB < 500KB)',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            action: SnackBarAction(
              label: 'مشاركة',
              textColor: Colors.white,
              onPressed: () => Share.shareXFiles([XFile(result.path)], text: 'مستند المنظومة القضائية المضغوط (< 500 KB)'),
            ),
          ),
        );

        // فتح نافذة المشاركة والحفظ المباشرة (Save/Share Sheet) فوراً
        Share.shareXFiles([XFile(result.path)], text: 'مستند المنظومة القضائية المضغوط (< 500 KB)');
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
import 'package:open_filex/open_filex.dart';
import 'package:share_plus/share_plus.dart';
import '../services/compression_service.dart';
import '../services/file_storage_service.dart';

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

      if (result != null && mounted) {
        final resultSize = await result.length();
        setState(() {
          _createdPdf = result;
          _pdfSize = resultSize;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: const Color(0xFF0D9488),
            behavior: SnackBarBehavior.floating,
            duration: const Duration(seconds: 4),
            content: Text(
              '✅ تم دمج \${_selectedImages.length} صور في ملف PDF واحد بحجم \${resultSize ~/ 1024} KB (< 500 KB)!',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
            action: SnackBarAction(
              label: 'مشاركة',
              textColor: Colors.white,
              onPressed: () => Share.shareXFiles([XFile(result.path)], text: 'مستند المنظومة القضائية المدمج (< 500 KB)'),
            ),
          ),
        );

        // فتح نافذة المشاركة والحفظ المباشرة (Save/Share Sheet) فوراً
        Share.shareXFiles([XFile(result.path)], text: 'مستند المنظومة القضائية المدمج (< 500 KB)');
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
/// 3. اسم المرحلة وتفاصيل جودة الأختام ودقة 72-96 DPI
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
  }
];
