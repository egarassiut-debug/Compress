import 'dart:io';
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
            SnackBar(content: Text('تعذر اختيار الصور: $err')),
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
          SnackBar(backgroundColor: Colors.red, content: Text('فشل الدمج: $e')),
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
                                'الصور المحددة (${_selectedImages.length}):',
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
                                          'ورقة ${index + 1}',
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
                            'دمج ${_selectedImages.length} صور في PDF (< 500 KB)',
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
