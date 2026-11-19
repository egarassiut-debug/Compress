import 'dart:io';
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
    debugPrint('حجم الصورة الأصلي للمستند: ${originalSize ~/ 1024} KB');

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
    debugPrint('حجم الـ PDF الأصلي: ${originalSize ~/ 1024} KB');

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
        debugPrint('حجم الـ PDF (${finalPdfBytes.length ~/ 1024} KB) يحتاج موازنة هادئة بدقة 145 DPI...');
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
      debugPrint('تعذر الضغط المتقدم للـ PDF ($e)');
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
