import 'package:flutter/material.dart';

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
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(2)} MB';
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
                '${widget.percent}%',
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
              '${widget.stage} (${widget.percent}%)\n${widget.detail}',
              style: const TextStyle(color: Colors.white70, fontSize: 9.5),
            ),
          ),
        ],
      ),
    );
  }
}
