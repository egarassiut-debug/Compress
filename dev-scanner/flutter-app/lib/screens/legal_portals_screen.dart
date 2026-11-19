import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class LegalPortalItem {
  final String title;
  final String category;
  final String url;
  final IconData icon;
  final Color color;

  const LegalPortalItem({
    required this.title,
    required this.category,
    required this.url,
    required this.icon,
    required this.color,
  });
}

class LegalPortalsScreen extends StatelessWidget {
  const LegalPortalsScreen({super.key});

  static const List<LegalPortalItem> portals = [
    LegalPortalItem(
      title: 'بوابة النيابة العامة',
      category: 'خدمات العرائض والجنائي وتظلمات النيابة',
      url: 'https://ppo.gov.eg/',
      icon: Icons.gavel_rounded,
      color: Color(0xFF1E3A8A),
    ),
    LegalPortalItem(
      title: 'محكمة الأسرة',
      category: 'دعاوى الأسرة والولاية على المال والنفقة',
      url: 'https://ppo.gov.eg/',
      icon: Icons.family_restroom_rounded,
      color: Color(0xFF0D9488),
    ),
    LegalPortalItem(
      title: 'منصة مصر الرقمية',
      category: 'خدمات التوثيق والتوكيلات وتحرير المحاضر',
      url: 'https://digital.gov.eg/',
      icon: Icons.fingerprint_rounded,
      color: Color(0xFFD97706),
    ),
    LegalPortalItem(
      title: 'بوابة وزارة العدل',
      category: 'إقامة الدعاوى عن بُعد والاستعلام القضائي',
      url: 'https://moj.gov.eg/',
      icon: Icons.balance_rounded,
      color: Color(0xFF2563EB),
    ),
    LegalPortalItem(
      title: 'محكمة النقض المصرية',
      category: 'جداول الطعون وأحكام النقض الجنائية والمدنية',
      url: 'https://cc.gov.eg/',
      icon: Icons.account_balance_rounded,
      color: Color(0xFF7C3AED),
    ),
    LegalPortalItem(
      title: 'مجلس الدولة المصري',
      category: 'محاكم القضاء الإداري والطعون التأديبية',
      url: 'https://ecs.gov.eg/',
      icon: Icons.assured_workload_rounded,
      color: Color(0xFF059669),
    ),
    LegalPortalItem(
      title: 'المحكمة الدستورية العليا',
      category: 'الأحكام الدستورية وجداول الجلسات',
      url: 'https://hccourt.gov.eg/',
      icon: Icons.menu_book_rounded,
      color: Color(0xFFDC2626),
    ),
    LegalPortalItem(
      title: 'نقابة المحامين المصرية',
      category: 'تجديد القيد والعلاج والخدمات النقابية',
      url: 'https://egyls.com/',
      icon: Icons.card_membership_rounded,
      color: Color(0xFF4338CA),
    ),
    LegalPortalItem(
      title: 'الشهر العقاري والتوثيق',
      category: 'حجز المواعيد ومعاملات التوثيق والعقود',
      url: 'https://rso.gov.eg/',
      icon: Icons.edit_document,
      color: Color(0xFF0284C7),
    ),
    LegalPortalItem(
      title: 'نيابات المرور الإلكترونية',
      category: 'استعلام وتظلمات المخالفات وتراخيص القيادة',
      url: 'https://ppo.gov.eg/',
      icon: Icons.directions_car_rounded,
      color: Color(0xFFEA580C),
    ),
  ];

  Future<void> _openPortalUrl(BuildContext context, String urlString) async {
    final Uri uri = Uri.parse(urlString);
    try {
      final bool launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched && context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('تعذر فتح الرابط في المتصفح')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('حدث خطأ أثناء فتح الموقع: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F2557),
        title: const Text('البوابات القانونية'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
              margin: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6D28D9), Color(0xFF4C1D95)],
                ),
                borderRadius: BorderRadius.circular(18),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF6D28D9).withOpacity(0.24),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: const Row(
                children: [
                  Icon(Icons.open_in_browser_rounded, color: Colors.amber, size: 24),
                  SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'دليل الروابط الرسمية (مرقمة من 1 إلى 10)
اضغط على أي موقع للانتقال الفوري لرفع الأوراق.',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 12.5,
                        fontWeight: FontWeight.bold,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                itemCount: portals.length,
                separatorBuilder: (context, index) => const SizedBox(height: 10),
                itemBuilder: (context, index) {
                  final portal = portals[index];
                  final int itemNumber = index + 1;

                  return Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    elevation: 1.2,
                    shadowColor: Colors.black.withOpacity(0.04),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () => _openPortalUrl(context, portal.url),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(color: const Color(0xFFE2E8F0)),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [portal.color, portal.color.withOpacity(0.8)],
                                ),
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: portal.color.withOpacity(0.25),
                                    blurRadius: 5,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: Center(
                                child: Text(
                                  '$itemNumber',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),

                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: portal.color.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Icon(portal.icon, color: portal.color, size: 24),
                            ),
                            const SizedBox(width: 12),

                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    portal.title,
                                    style: const TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF0F172A),
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    portal.category,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: Color(0xFF64748B),
                                    ),
                                  ),
                                ],
                              ),
                            ),

                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                color: portal.color.withOpacity(0.08),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: portal.color.withOpacity(0.25)),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    'دخول',
                                    style: TextStyle(
                                      color: portal.color,
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  const SizedBox(width: 4),
                                  Icon(Icons.open_in_new_rounded, size: 12, color: portal.color),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
