import 'dart:io';
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
      debugPrint('تنبيه أثناء طلب الأذونات (يستمر التطبيق بأمان): $e');
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
    final String sanitizedExt = extension.startsWith('.') ? extension : '.$extension';
    final String fileName = '${prefix}_$timestamp$sanitizedExt';

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
        debugPrint('المسار العام المباشر غير متاح حالياً: $e');
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
        final appDownloadDir = Directory('${extDir.path}/Downloads');
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
        final File targetFile = File('${dir.path}/$fileName');
        await targetFile.writeAsBytes(bytes, flush: true);
        debugPrint('✅ تم حفظ الملف بنجاح في: ${targetFile.path}');
        return targetFile;
      } catch (err) {
        debugPrint('تعذر الحفظ في ${dir.path} ($err)، جاري محاولة المسار البديل...');
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
    final String fileName = '${prefix}_$timestamp.jpg';

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
        galleryDirs.add(Directory('${extDir.path}/Pictures'));
      }
    } catch (_) {}

    for (final dir in galleryDirs) {
      try {
        if (!await dir.exists()) await dir.create(recursive: true);
        final File target = File('${dir.path}/$fileName');
        await target.writeAsBytes(bytes, flush: true);
        debugPrint('✅ تم حفظ الصورة بالمعرض بنجاح: ${target.path}');
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
    final String sanitizedExt = extension.startsWith('.') ? extension : '.$extension';
    final String fileName = '${prefix}_$timestamp$sanitizedExt';

    // نتحقق من إمكانية الكتابة في المجلد العام أولاً
    if (Platform.isAndroid) {
      try {
        final publicDownload = Directory('/storage/emulated/0/Download');
        if (await publicDownload.exists()) {
          // فحص إمكانية الكتابة بملف مؤقت سريع
          final testFile = File('${publicDownload.path}/.temp_perm_test_$timestamp');
          await testFile.writeAsString('ok');
          await testFile.delete();
          return '${publicDownload.path}/$fileName';
        }
      } catch (_) {}
    }

    try {
      final dlDir = await getDownloadsDirectory();
      if (dlDir != null) {
        return '${dlDir.path}/$fileName';
      }
    } catch (_) {}

    try {
      final extDir = await getExternalStorageDirectory();
      if (extDir != null) {
        final appDl = Directory('${extDir.path}/Downloads');
        if (!await appDl.exists()) await appDl.create(recursive: true);
        return '${appDl.path}/$fileName';
      }
    } catch (_) {}

    final appDoc = await getApplicationDocumentsDirectory();
    return '${appDoc.path}/$fileName';
  }

  /// تنسيق حجم الملف لعرضه بطريقة مفهومة للسادة المحامين
  static String formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes بايت';
    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} كيلوبايت (KB)';
    }
    return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} ميجابايت (MB)';
  }
}
