import 'dart:io';
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
          SnackBar(content: Text('تعذر اختيار الصورة: $e')),
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
          SnackBar(backgroundColor: Colors.red, content: Text('حدث خطأ أثناء الحفظ: $e')),
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
