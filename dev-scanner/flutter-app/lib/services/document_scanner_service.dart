import 'dart:io';
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
  final List<Offset> corners; // TL, TR, BR, BL normalized (0..1)
  final int rotationDeg; // multiples of 45 degrees
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

  /// تحليل ذكي لثبات الإطار يتجاهل الاهتزاز البسيط لليد ولا ينبه إلا عند الحركة المؤثرة
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

  /// اكتشاف تلقائي لأطراف الورقة داخل مصفوفة رمادية مصغرة
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

    int quality = 85;
    int maxDim = math.max(enhanced.width, enhanced.height);
    Uint8List finalJpg = await FlutterImageCompress.compressWithList(
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

    final Directory cacheDir = await getTemporaryDirectory();
    final String id = 'scan_${DateTime.now().millisecondsSinceEpoch}_${math.Random().nextInt(9999)}';
    final File processedFile = File('${cacheDir.path}/$id.jpg');
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
        throw Exception('تعذر تقليص الصورة ${i + 1} لأقل من 500 KB');
      }
      final String idxStr = (i + 1).toString().padLeft(3, '0');
      final File savedImg = await FileStorageService.saveImageToGallerySafely(
        bytes: bytes,
        prefix: 'Scan_$idxStr',
      );
      if (!await savedImg.exists() || await savedImg.length() >= strictMaxBytes) {
        throw Exception('فشل التحقق من حفظ الصورة Scan_$idxStr');
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
