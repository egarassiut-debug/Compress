import 'dart:async';
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
        setState(() => _cameraError = 'تعذر تشغيل الكاميرا (تحقق من منح إذن الكاميرا): $e');
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
        '${tmpDir.path}/orig_${DateTime.now().millisecondsSinceEpoch}.jpg',
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
          SnackBar(content: Text('تعذر التقاط الورقة: $e (الصفحات السابقة محفوظة)')),
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
        '${tmpDir.path}/pick_${DateTime.now().millisecondsSinceEpoch}.jpg',
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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('خطأ: $e')));
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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('تعذر التدوير: $e')));
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
              'تعذر ضغط ملف Scanned_Document.pdf بالكامل لأقل من 500 KB دون الإضرار بوضوح النصوص والأختام.\nالحجم الفعلي: $sizeKb KB\nهل ترغب في الحفظ بهذا الحجم؟',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('إلغاء ومراجعة الصفحات'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text('حفظ رغم ذلك ($sizeKb KB)'),
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
            content: Text('تعذر الحفظ (الصفحات المؤقتة محفوظة لإعادة المحاولة): $e'),
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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('تعذر القص اليدوي: $e')));
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
    if (_step == _ScannerStep.review) title = 'مراجعة المستند (${_pages.length})';
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
                      child: Text('مراجعة (${_pages.length})'),
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
                '${_pages.length} صفحة',
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
                      'صفحة ${idx + 1} (Scan_${(idx + 1).toString().padLeft(3, '0')}.jpg) - ${FileStorageService.formatBytes(_pages[idx].processedSizeBytes)}',
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
                label: Text('تدوير 45° (${current.rotationDeg}°)'),
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
                'حفظ Scan_001.. و Scanned_Document.pdf (< 500 KB) • ${FileStorageService.formatBytes(current.processedSizeBytes)}',
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
