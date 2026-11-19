import 'dart:io';
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
          SnackBar(content: Text('تعذر اختيار ملف PDF: $e')),
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
          SnackBar(backgroundColor: Colors.red, content: Text('فشل الضغط: $e')),
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
                                          'الحجم الحالي: ${FileStorageService.formatBytes(_originalSize)}',
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
