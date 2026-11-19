import 'dart:async';
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
              '(الحجم: $sizeKb KB)',
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
