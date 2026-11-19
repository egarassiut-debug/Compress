import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'compress_image_screen.dart';
import 'compress_pdf_screen.dart';
import 'images_to_pdf_screen.dart';
import 'document_scanner_screen.dart';
import 'legal_portals_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _targetImageKB = 500;
  int _targetPdfKB = 500;

  @override
  void initState() {
    super.initState();
    _loadPreferences();
  }

  Future<void> _loadPreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      setState(() {
        _targetImageKB = prefs.getInt('manzoma_target_image_kb_v2') ?? 500;
        _targetPdfKB = prefs.getInt('manzoma_target_pdf_kb') ?? 500;
      });
    } catch (_) {}
  }

  Future<void> _savePreference(String key, int value) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(key, value);
    } catch (_) {}
  }

  void _showEditTargetDialog(bool isImage) {
    final currentVal = isImage ? _targetImageKB : _targetPdfKB;
    final controller = TextEditingController(text: currentVal.toString());
    String? errorText;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          title: Row(
            children: [
              Icon(
                isImage ? Icons.image_rounded : Icons.picture_as_pdf_rounded,
                color: isImage ? const Color(0xFF2563EB) : const Color(0xFFEA580C),
              ),
              const SizedBox(width: 8),
              Text(
                isImage ? 'تعديل حجم الصور المستهدف' : 'تعديل حجم PDF المستهدف',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'القيمة الافتراضية الموحدة: 500 KB',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: controller,
                keyboardType: TextInputType.number,
                autofocus: true,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                decoration: InputDecoration(
                  suffixText: 'KB',
                  errorText: errorText,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () async {
                const def = 500;
                setState(() {
                  if (isImage) _targetImageKB = def;
                  else _targetPdfKB = def;
                });
                await _savePreference(
                  isImage ? 'manzoma_target_image_kb_v2' : 'manzoma_target_pdf_kb',
                  def,
                );
                if (mounted) Navigator.pop(ctx);
              },
              child: const Text(
                'استعادة الافتراضي (500 KB)',
                style: TextStyle(color: Colors.grey),
              ),
            ),
            ElevatedButton(
              onPressed: () async {
                final text = controller.text.trim();
                final val = int.tryParse(text);
                if (val == null || val <= 0) {
                  setDialogState(() {
                    errorText = 'أدخل رقماً صحيحاً موجباً';
                  });
                  return;
                }
                setState(() {
                  if (isImage) _targetImageKB = val;
                  else _targetPdfKB = val;
                });
                await _savePreference(
                  isImage ? 'manzoma_target_image_kb_v2' : 'manzoma_target_pdf_kb',
                  val,
                );
                if (mounted) Navigator.pop(ctx);
              },
              child: const Text('حفظ وتطبيق'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F2557),
        titleSpacing: 16,
        title: Row(
          children: [
            const Text(
              'ضغطة',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                color: Colors.white,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xFF14B8A6).withOpacity(0.22),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFF2DD4BF).withOpacity(0.55)),
              ),
              child: const Text(
                'تجريبي • التصوير',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF5EEAD4),
                ),
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(left: 8),
            child: IconButton(
              icon: const Icon(Icons.share_rounded, color: Color(0xFFFDE047)),
              tooltip: 'مشاركة التطبيق مع الزملاء',
              onPressed: () {
                Share.share(
                  'تطبيق ضغطة (تجريبي) مع خدمة تصوير المستندات ضوئياً بحد أقصى 500 KB - تصميم وتنفيذ: مصطفى فرويز المحامي - Al-Hawai Tech',
                );
              },
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(2),
          child: Container(
            height: 1.5,
            color: const Color(0xFFD4AF37).withOpacity(0.45),
          ),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF0F2557), Color(0xFF09183B)],
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                ),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFD4AF37).withOpacity(0.45), width: 1),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF0F2557).withOpacity(0.20),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            Flexible(
                              child: Text(
                                'أهلاً بك زميلي المحامي',
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 14,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            SizedBox(width: 6),
                            Icon(Icons.balance_rounded, color: Color(0xFFFDE047), size: 16),
                          ],
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'اضغط مستنداتك وصورك بضغطة واحدة، بدون إنترنت، وبجودة عالية واجعلها جاهزة لتقديم الطلبات على منظومه النيابة والمحاكم.',
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Color(0xFFCBD5E1),
                            fontSize: 10.5,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    width: 62,
                    height: 62,
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF060E24),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFFD4AF37).withOpacity(0.5), width: 1),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.asset(
                        'assets/images/welcome_logo.png',
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 10),

            const Text(
              'اضغط على الخدمة التي تريدها',
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w900,
                color: Color(0xFF0F2557),
              ),
            ),
            const SizedBox(height: 8),

            // 1 - تصغير حجم الصور
            _ServiceCard(
              number: '1',
              title: 'تصغير حجم الصور',
              subtitle: 'ضغط صور التوكيلات والبطاقات لأقل من $_targetImageKB KB وحفظها بالمعرض.',
              badgeText: '< $_targetImageKB KB',
              cardColor: const Color(0xFF1D4ED8),
              cardGradientEnd: const Color(0xFF1E40AF),
              icon: Icons.photo_size_select_small_rounded,
              onBadgeTap: () => _showEditTargetDialog(true),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const CompressImageScreen()),
                );
              },
            ),

            const SizedBox(height: 8),

            // 2 - تصغير حجم ملفات PDF
            _ServiceCard(
              number: '2',
              title: 'تصغير حجم ملفات PDF',
              subtitle: 'تقليص حجم العرائض والمذكرات لأقل من $_targetPdfKB KB بوضوح تام.',
              badgeText: '< $_targetPdfKB KB',
              cardColor: const Color(0xFFD94E0B),
              cardGradientEnd: const Color(0xFFC2410C),
              icon: Icons.picture_as_pdf_rounded,
              onBadgeTap: () => _showEditTargetDialog(false),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const CompressPdfScreen()),
                );
              },
            ),

            const SizedBox(height: 8),

            // 3 - دمج الصور في ملف PDF واحد
            _ServiceCard(
              number: '3',
              title: 'دمج الصور في ملف PDF واحد',
              subtitle: 'تجميع أوراق الدعوى في ملف موحد أقل من $_targetPdfKB KB بالألوان الكاملة.',
              badgeText: '< $_targetPdfKB KB',
              cardColor: const Color(0xFF047857),
              cardGradientEnd: const Color(0xFF065F46),
              icon: Icons.collections_bookmark_rounded,
              onBadgeTap: () => _showEditTargetDialog(false),
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const ImagesToPdfScreen()),
                );
              },
            ),

            const SizedBox(height: 8),

            // 4 - تصوير المستندات وتحسينها وضغطها
            _ServiceCard(
              number: '4',
              title: 'تصوير المستندات وتحسينها وضغطها',
              subtitle: 'تصوير الكاميرا مع قص تلقائي وتحسين الألوان وحفظ صور وPDF < 500 KB.',
              badgeText: 'ماسح ضوئي',
              cardColor: const Color(0xFF0F766E),
              cardGradientEnd: const Color(0xFF0D9488),
              icon: Icons.document_scanner_rounded,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const DocumentScannerScreen()),
                );
              },
            ),

            const SizedBox(height: 6),

            // 5 - البوابات القانونية
            _ServiceCard(
              number: '5',
              title: 'البوابات القانونية',
              subtitle: 'دخول مباشر لمنصات النيابة العامة ومحكمة الأسرة ومصر الرقمية.',
              badgeText: '10 بوابات',
              cardColor: const Color(0xFF6D28D9),
              cardGradientEnd: const Color(0xFF5B21B6),
              icon: Icons.language_rounded,
              onTap: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const LegalPortalsScreen()),
                );
              },
            ),

            const SizedBox(height: 8),

            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: const Row(
                children: [
                  Icon(Icons.verified_user_rounded, color: Color(0xFF0F2557), size: 16),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'معالجة محلية 100% تحفظ الصور بالاستوديو والـ PDF بالتنزيلات تلقائياً.',
                      style: TextStyle(fontSize: 10.5, color: Color(0xFF475569), fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 10),

            Column(
              children: [
                Text(
                  'تصميم وتنفيذ: مصطفى فرويز المحامي',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade400,
                    fontWeight: FontWeight.w400,
                    height: 1.35,
                  ),
                ),
                Text(
                  'Al-Hawai Tech',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade400,
                    fontWeight: FontWeight.w400,
                    height: 1.35,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
          ],
        ),
      ),
    );
  }
}

class _ServiceCard extends StatelessWidget {
  final String number;
  final String title;
  final String subtitle;
  final String badgeText;
  final Color cardColor;
  final Color cardGradientEnd;
  final IconData icon;
  final VoidCallback onTap;
  final VoidCallback? onBadgeTap;

  const _ServiceCard({
    required this.number,
    required this.title,
    required this.subtitle,
    required this.badgeText,
    required this.cardColor,
    required this.cardGradientEnd,
    required this.icon,
    required this.onTap,
    this.onBadgeTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: 56),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [cardColor, cardGradientEnd],
          begin: Alignment.centerRight,
          end: Alignment.centerLeft,
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: cardColor.withOpacity(0.22),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            child: Row(
              children: [
                Container(
                  width: 30,
                  height: 30,
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      number,
                      style: TextStyle(
                        color: cardColor,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 9),
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.16),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, color: Colors.white, size: 20),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          GestureDetector(
                            onTap: onBadgeTap,
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.18),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.white.withOpacity(0.28)),
                              ),
                              child: Text(
                                badgeText,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 10.5,
                          color: Colors.white.withOpacity(0.88),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                Icon(
                  Icons.chevron_left_rounded,
                  color: Colors.white.withOpacity(0.85),
                  size: 18,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
