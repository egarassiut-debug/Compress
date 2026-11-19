import { FLUTTER_PROJECT_FILES, FlutterFile } from './flutterCode';

const DEV_PUBSPEC_FILE: FlutterFile = {
  name: 'pubspec.yaml',
  path: 'pubspec.yaml',
  language: 'yaml',
  description: 'ملف الحزم لنسخة التطوير التجريبية (يشمل حزمة الكاميرا camera للمسح الضوئي)',
  content: `name: legal_file_compressor_dev
description: "ضغطة (تجريبي) - نسخة التطوير المعزولة لخدمة تصوير المستندات بحد أقصى 500 KB"
publish_to: 'none'
version: 3.2.0+5

environment:
  sdk: '>=3.3.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter

  # واجهة المستخدم والأيقونات
  cupertino_icons: ^1.0.8

  # فتح روابط مواقع النيابة والمحاكم في المتصفح الخارجي
  url_launcher: ^6.3.0

  # اختيار الملفات والصور من ذاكرة الهاتف والكاميرا
  file_picker: ^8.1.4
  image_picker: ^1.1.2

  # ضغط الصور محلياً بدقة فائقة لاستهداف بحد أقصى 500KB
  flutter_image_compress: ^2.3.0
  image: ^4.2.0

  # كاميرا مباشرة لخدمة تصوير المستندات ضوئياً (تلقائي/يدوي + فلاش + تركيز تلقائي + كشف حدود الورقة)
  camera: ^0.11.0+2

  # إنشاء ودمج ومعالجة ملفات PDF لاستهداف أقل من 500KB
  pdf: ^3.10.8
  printing: ^5.13.2

  # حفظ الإعدادات محلياً
  shared_preferences: ^2.3.2

  # مسارات حفظ الملفات وأذونات التخزين في Downloads
  path_provider: ^2.1.4
  permission_handler: ^11.3.1
  open_filex: ^4.5.0
  share_plus: ^10.1.2

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^4.0.0

flutter:
  uses-material-design: true
  assets:
    - assets/images/welcome_logo.png
`,
};

const DEV_MANIFEST_FILE: FlutterFile = {
  name: 'AndroidManifest.xml',
  path: 'android/app/src/main/AndroidManifest.xml',
  language: 'xml',
  description: 'إعدادات نسخة التطوير بمعرف حزمة مستقل (.dev) لمنع استبدال النسخة المستقرة على الهاتف',
  content: `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <!-- 1. أذونات الإنترنت والشبكة لفتح مواقع المحاكم والنيابة ومصر الرقمية -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- 2. أذونات قراءة وكتابة وحدة التخزين الكلاسيكية لأندرويد 10 وما قبله (API <= 29) -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="29"
        tools:ignore="ScopedStorage" />

    <!-- 3. إذن إدارة التخزين الخارجي الشامل لأندرويد 11 فما فوق (API 30+) للوصول المباشر لمجلد التنزيلات Downloads -->
    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE"
        tools:ignore="ScopedStorage" />

    <!-- 4. أذونات الوسائط للصور والمستندات لأندرويد 13 فما فوق (API 33+) -->
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
    <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
    <uses-permission android:name="android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
        android:minSdkVersion="34" />

    <!-- 5. إذن الكاميرا لتصوير التوكيلات والمستندات الورقية مباشرة -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

    <!-- استعلام حزم المتصفح لفتح روابط النيابة ومصر الرقمية على أندرويد 11+ -->
    <queries>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" />
        </intent>
    </queries>

    <application
        android:label="ضغطة (تجريبي)"
        android:name="\${applicationName}"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:requestLegacyExternalStorage="true"
        android:preserveLegacyExternalStorage="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:theme="@style/LaunchTheme"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"
            android:hardwareAccelerated="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>

        <meta-data
            android:name="flutterEmbedding"
            android:value="2" />
    </application>
</manifest>
`,
};

const DEV_MAIN_FILE: FlutterFile = {
  name: 'main.dart',
  path: 'lib/main.dart',
  language: 'dart',
  description: 'نقطة انطلاق نسخة التطوير التجريبية المستقلة لخدمة التصوير',
  content: `import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'screens/home_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Color(0xFF09183B),
      statusBarIconBrightness: Brightness.light,
    ),
  );

  runApp(const LawyerFileCompressorDevApp());
}

class LawyerFileCompressorDevApp extends StatelessWidget {
  const LawyerFileCompressorDevApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ضغطة (تجريبي)',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar', 'EG'),
      supportedLocales: const [
        Locale('ar', 'EG'),
        Locale('en', 'US'),
      ],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        fontFamily: 'Cairo',
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F2557),
          primary: const Color(0xFF0F2557),
          secondary: const Color(0xFFD4AF37),
          surface: Colors.white,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        appBarTheme: const AppBarTheme(
          elevation: 0,
          backgroundColor: Color(0xFF0F2557),
          foregroundColor: Colors.white,
          centerTitle: false,
          titleTextStyle: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 20,
            fontWeight: FontWeight.w900,
            color: Colors.white,
          ),
        ),
      ),
      home: const HomeScreen(),
    );
  }
}
`,
};

const DEV_HOME_SCREEN_FILE: FlutterFile = {
  name: 'home_screen.dart',
  path: 'lib/screens/home_screen.dart',
  language: 'dart',
  description: 'الشاشة الرئيسية لنسخة التطوير: تحافظ على الخدمات القائمة دون تغيير وتضيف خدمة تصوير المستندات (4)',
  content: `import 'package:flutter/material.dart';
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
`,
};

const DEV_SCANNER_SERVICE_FILE: FlutterFile = {
  name: 'document_scanner_service.dart',
  path: 'lib/services/document_scanner_service.dart',
  language: 'dart',
  description: 'خدمة الماسح الضوئي المستقلة لتصوير المستندات أوفلاين (قص ذكي، تصحيح منظور، تدوير 45°، تحسين ألوان بدون أبيض وأسود، وحفظ مزدوج < 500KB)',
  content: `import 'dart:io';
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
    final String id = 'scan_\${DateTime.now().millisecondsSinceEpoch}_\${math.Random().nextInt(9999)}';
    final File processedFile = File('\${cacheDir.path}/\$id.jpg');
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
        throw Exception('تعذر تقليص الصورة \${i + 1} لأقل من 500 KB');
      }
      final String idxStr = (i + 1).toString().padLeft(3, '0');
      final File savedImg = await FileStorageService.saveImageToGallerySafely(
        bytes: bytes,
        prefix: 'Scan_\$idxStr',
      );
      if (!await savedImg.exists() || await savedImg.length() >= strictMaxBytes) {
        throw Exception('فشل التحقق من حفظ الصورة Scan_\$idxStr');
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
`,
};

const DEV_SCANNER_SCREEN_FILE: FlutterFile = {
  name: 'document_scanner_screen.dart',
  path: 'lib/screens/document_scanner_screen.dart',
  language: 'dart',
  description: 'شاشة تصوير المستندات أوفلاين (كاميرا مباشرة، التقاط تلقائي/يدوي، تدوير 45°، تعديل قص يدوي، مراجعة وترتيب وحذف وإعادة تصوير، وحفظ مزدوج)',
  content: `import 'dart:async';
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
        setState(() => _cameraError = 'تعذر تشغيل الكاميرا (تحقق من منح إذن الكاميرا): \$e');
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
        '\${tmpDir.path}/orig_\${DateTime.now().millisecondsSinceEpoch}.jpg',
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
          SnackBar(content: Text('تعذر التقاط الورقة: \$e (الصفحات السابقة محفوظة)')),
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
        '\${tmpDir.path}/pick_\${DateTime.now().millisecondsSinceEpoch}.jpg',
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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('خطأ: \$e')));
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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('تعذر التدوير: \$e')));
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
              'تعذر ضغط ملف Scanned_Document.pdf بالكامل لأقل من 500 KB دون الإضرار بوضوح النصوص والأختام.\\nالحجم الفعلي: \$sizeKb KB\\nهل ترغب في الحفظ بهذا الحجم؟',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('إلغاء ومراجعة الصفحات'),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text('حفظ رغم ذلك (\$sizeKb KB)'),
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
            content: Text('تعذر الحفظ (الصفحات المؤقتة محفوظة لإعادة المحاولة): \$e'),
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
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('تعذر القص اليدوي: \$e')));
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
    if (_step == _ScannerStep.review) title = 'مراجعة المستند (\${_pages.length})';
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
                      child: Text('مراجعة (\${_pages.length})'),
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
                '\${_pages.length} صفحة',
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
                      'صفحة \${idx + 1} (Scan_\${(idx + 1).toString().padLeft(3, '0')}.jpg) - \${FileStorageService.formatBytes(_pages[idx].processedSizeBytes)}',
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
                label: Text('تدوير 45° (\${current.rotationDeg}°)'),
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
                'حفظ Scan_001.. و Scanned_Document.pdf (< 500 KB) • \${FileStorageService.formatBytes(current.processedSizeBytes)}',
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
`,
};

const DEV_BUILD_SUPPORT_FILES: FlutterFile[] = [
  {
    name: 'build.gradle (root)',
    path: 'android/build.gradle',
    language: 'groovy',
    description: 'ملف Gradle الرئيسي لتهيئة مستودعات Google و Maven لبناء APK',
    content: `allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.buildDir = "../build"
subprojects {
    project.buildDir = "\${rootProject.buildDir}/\${project.name}"
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register("clean", Delete) {
    delete rootProject.buildDir
}
`,
  },
  {
    name: 'settings.gradle',
    path: 'android/settings.gradle',
    language: 'groovy',
    description: 'إعدادات محمل إضافات Flutter وإصدارات Android Gradle Plugin و Kotlin',
    content: `pluginManagement {
    def flutterSdkPath = {
        def properties = new Properties()
        file("local.properties").withInputStream { properties.load(it) }
        def flutterSdkPath = properties.getProperty("flutter.sdk")
        assert flutterSdkPath != null, "flutter.sdk not set in local.properties"
        return flutterSdkPath
    }()

    includeBuild("\$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id "dev.flutter.flutter-plugin-loader" version "1.0.0"
    id "com.android.application" version "8.2.1" apply false
    id "org.jetbrains.kotlin.android" version "1.9.22" apply false
}

include ":app"
`,
  },
  {
    name: 'gradle.properties',
    path: 'android/gradle.properties',
    language: 'properties',
    description: 'إعدادات ذاكرة Gradle و AndroidX المطلوبة لبناء التطبيق',
    content: `org.gradle.jvmargs=-Xmx4G -XX:MaxMetaspaceSize=2G -XX:+HeapDumpOnOutOfMemoryError
android.useAndroidX=true
android.enableJetifier=true
`,
  },
  {
    name: 'gradle-wrapper.properties',
    path: 'android/gradle/wrapper/gradle-wrapper.properties',
    language: 'properties',
    description: 'تحديد إصدار Gradle 8.3 المتوافق مع AGP 8.2.1 و Flutter الحديث',
    content: `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.3-all.zip
`,
  },
  {
    name: 'app/build.gradle',
    path: 'android/app/build.gradle',
    language: 'groovy',
    description: 'إعدادات تطبيق الأندرويد التجريبي بالمعرف المستقل com.example.legal_file_compressor.dev',
    content: `plugins {
    id "com.android.application"
    id "kotlin-android"
    id "dev.flutter.flutter-gradle-plugin"
}

android {
    namespace = "com.example.legal_file_compressor.dev"
    compileSdk = 34
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = "1.8"
    }

    defaultConfig {
        applicationId = "com.example.legal_file_compressor.dev"
        minSdk = 21
        targetSdk = 34
        versionCode = 5
        versionName = "3.2.0-dev"
        multiDexEnabled = true
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.debug
            minifyEnabled = false
            shrinkResources = false
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    implementation "androidx.multidex:multidex:2.0.1"
}
`,
  },
  {
    name: 'debug/AndroidManifest.xml',
    path: 'android/app/src/debug/AndroidManifest.xml',
    language: 'xml',
    description: 'صلاحيات بناء Debug للتطوير',
    content: `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
</manifest>
`,
  },
  {
    name: 'MainActivity.kt',
    path: 'android/app/src/main/kotlin/com/example/legal_file_compressor/dev/MainActivity.kt',
    language: 'kotlin',
    description: 'نقطة الدخول الأصلية لتطبيق Flutter تحت حزمة .dev المستقلة',
    content: `package com.example.legal_file_compressor.dev

import io.flutter.embedding.android.FlutterActivity

class MainActivity: FlutterActivity()
`,
  },
  {
    name: 'styles.xml',
    path: 'android/app/src/main/res/values/styles.xml',
    language: 'xml',
    description: 'سمة الإطلاق والتشغيل LaunchTheme و NormalTheme المطلوبة من AndroidManifest.xml',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="LaunchTheme" parent="@android:style/Theme.Light.NoTitleBar">
        <item name="android:windowBackground">@drawable/launch_background</item>
    </style>
    <style name="NormalTheme" parent="@android:style/Theme.Light.NoTitleBar">
        <item name="android:windowBackground">?android:colorBackground</item>
    </style>
</resources>
`,
  },
  {
    name: 'values-night/styles.xml',
    path: 'android/app/src/main/res/values-night/styles.xml',
    language: 'xml',
    description: 'سمة الإطلاق للوضع الليلي',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="LaunchTheme" parent="@android:style/Theme.Black.NoTitleBar">
        <item name="android:windowBackground">@drawable/launch_background</item>
    </style>
    <style name="NormalTheme" parent="@android:style/Theme.Black.NoTitleBar">
        <item name="android:windowBackground">?android:colorBackground</item>
    </style>
</resources>
`,
  },
  {
    name: 'launch_background.xml',
    path: 'android/app/src/main/res/drawable/launch_background.xml',
    language: 'xml',
    description: 'خلفية شاشة الإطلاق الرسمية باللون الكحلي الملكي وشعار ضغطة',
    content: `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#060E24" />
        </shape>
    </item>
    <item>
        <bitmap
            android:gravity="center"
            android:src="@drawable/ic_launcher_foreground" />
    </item>
</layer-list>
`,
  },
  {
    name: 'drawable-v21/launch_background.xml',
    path: 'android/app/src/main/res/drawable-v21/launch_background.xml',
    language: 'xml',
    description: 'خلفية شاشة الإطلاق لإصدارات Android API 21+',
    content: `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#060E24" />
        </shape>
    </item>
    <item>
        <bitmap
            android:gravity="center"
            android:src="@drawable/ic_launcher_foreground" />
    </item>
</layer-list>
`,
  },
  {
    name: 'analysis_options.yaml',
    path: 'analysis_options.yaml',
    language: 'yaml',
    description: 'إعدادات التحليل الساكن لـ Dart و Flutter',
    content: `include: package:flutter_lints/flutter.yaml

linter:
  rules:
    prefer_const_constructors: false
    avoid_print: false
    use_build_context_synchronously: false
`,
  },
  {
    name: '.gitignore',
    path: '.gitignore',
    language: 'text',
    description: 'استثناء ملفات البناء المؤقتة عند الرفع إلى GitHub من الهاتف',
    content: `.dart_tool/
.packages
build/
.flutter-plugins
.flutter-plugins-dependencies
android/.gradle/
android/local.properties
*.apk
`,
  },
  {
    name: 'build_dev_apk.yml',
    path: '.github/workflows/build_dev_apk.yml',
    language: 'yaml',
    description: 'ملف أتمتة GitHub Actions لبناء ملف daghta-scanner-dev.apk عبر متصفح الهاتف مجاناً',
    content: `name: Build Daghta Dev Scanner APK

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build-android-dev-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Flutter
        uses: subosito/flutter-action@v2
        with:
          flutter-version: '3.24.5'
          channel: 'stable'
          cache: true

      - name: Verify Dev Application ID & App Label
        run: |
          grep -q 'com.example.legal_file_compressor.dev' android/app/build.gradle
          grep -q 'ضغطة (تجريبي)' android/app/src/main/AndroidManifest.xml

      - name: Ensure Gradle Wrapper Exists
        run: |
          if [ ! -f android/gradlew ]; then
            cd android && gradle wrapper --gradle-version 8.3 && cd ..
          fi

      - name: Install Flutter Dependencies
        run: flutter pub get

      - name: Build Debug APK
        run: flutter build apk --debug

      - name: Rename Output APK to Dev Target
        run: |
          mkdir -p out
          cp build/app/outputs/flutter-apk/app-debug.apk out/daghta-scanner-dev.apk
          ls -lh out/daghta-scanner-dev.apk

      - name: Upload Dev APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: daghta-scanner-dev-apk
          path: out/daghta-scanner-dev.apk
          retention-days: 30
`,
  },
  {
    name: 'codemagic.yaml',
    path: 'codemagic.yaml',
    language: 'yaml',
    description: 'إعداد جاهز لبناء APK عبر متصفح الهاتف في منصة Codemagic بدون ملفات مخفية',
    content: `workflows:
  android-dev-scanner:
    name: ضغطة (تجريبي) — بناء APK لخدمة التصوير
    max_build_duration: 30
    instance_type: linux_x2
    environment:
      flutter: stable
      java: 17
    scripts:
      - name: Get Flutter packages
        script: flutter pub get
      - name: Ensure Gradle wrapper
        script: |
          if [ ! -f android/gradlew ]; then
            cd android && gradle wrapper --gradle-version 8.3 && cd ..
          fi
      - name: Build Dev Debug APK
        script: |
          flutter build apk --debug
          cp build/app/outputs/flutter-apk/app-debug.apk build/app/outputs/flutter-apk/daghta-scanner-dev.apk
    artifacts:
      - build/app/outputs/flutter-apk/daghta-scanner-dev.apk
`,
  },
  {
    name: 'BUILD_FROM_PHONE.md',
    path: 'BUILD_FROM_PHONE.md',
    language: 'markdown',
    description: 'دليل مفصل لبناء وتجربة ملف APK التجريبي باستخدام هاتف Android فقط بدون كمبيوتر',
    content: `# دليل بناء ملف APK لنسخة «ضغطة (تجريبي)» من هاتف Android فقط (بدون كمبيوتر)

هذه الحزمة مكتملة وجاهزة للبناء السحابي المجاني من متصفح هاتفك مباشرةً دون الحاجة إلى كمبيوتر، وتُخرج تطبيقاً مستقلاً بالبيانات التالية:
- **معرف الحزمة (Application ID):** \`com.example.legal_file_compressor.dev\`
- **اسم التطبيق على الهاتف:** \`ضغطة (تجريبي)\`
- **مخرج الـ APK:** \`daghta-scanner-dev.apk\`
- **حماية النسخة المستقرة:** لن يكتب فوق تطبيق «ضغطة» الأصلي المثبت على هاتفك ولن يمس إعدادات الضغط السابقة.

> **تنبيه مهم:** هذه الحزمة تحتوي على **الكود المصدري الكامل الجاهز للبناء** ولا تحتوي على APK مترجم مسبقاً؛ يجب تنفيذ خطوة البناء السحابي بالأسفل لإنتاج \`daghta-scanner-dev.apk\`.

---

## الطريقة الأولى (المجانية والأسهل عبر متصفح الهاتف): GitHub Actions

### الخطوة 1: تنزيل وفك ضغط الحزمة على الهاتف
1. حمّل ملف \`daghta_scanner_dev_flutter.zip\` على هاتفك.
2. افتح تطبيق **ZArchiver** (مجاني على Google Play) أو مدير الملفات وفك الضغط إلى مجلد واضح مثل \`Download/daghta-dev\`.
3. تأكد داخل الإعدادات في ZArchiver من تفعيل خيار **إظهار الملفات المخفية (Show hidden files)** حتى ترى مجلد \`.github\`.

### الخطوة 2: رفع المشروع إلى GitHub من الهاتف
- **الخيار أ (عن طريق تطبيق Termux على الهاتف — يرفع كل الملفات والمجلدات المخفية دفعة واحدة):**
  1. ثبّت تطبيق **Termux** من F-Droid.
  2. أنشئ مستودعاً جديداً (New repository) على حسابك في [github.com](https://github.com) من متصفح الهاتف.
  3. في Termux نفّذ الأوامر التالية (لإدارة git والرفع فقط، وليس لبناء Gradle):
     \`\`\`bash
     pkg update && pkg install -y git
     termux-setup-storage
     cd ~/storage/downloads/daghta-dev
     git init
     git branch -M main
     git add .
     git commit -m "Daghta dev scanner"
     git remote add origin https://github.com/USERNAME/REPO_NAME.git
     git push -u origin main
     \`\`\`
     *(استبدل \`USERNAME/REPO_NAME\` باسم مستودعك، واستخدم Personal Access Token ككلمة مرور عند الطلب).*

- **الخيار ب (من متصفح Chrome على الهاتف بدون Termux):**
  1. أنشئ مستودعاً جديداً على [github.com](https://github.com).
  2. اضغط **uploading an existing file** وارفع ملفات المشروع ومجلداته (\`lib\`, \`android\`, \`assets\`, \`pubspec.yaml\`, \`codemagic.yaml\`).
  3. لأن متصفح الهاتف قد يتجاهل المجلدات التي تبدأ بنقطة مثل \`.github\`: اضغط **Add file → Create new file** في GitHub واكتب في خانة الاسم:
     \`.github/workflows/build_dev_apk.yml\`
     ثم انسخ محتوى ملف \`.github/workflows/build_dev_apk.yml\` الموجود داخل الحزمة والصقه واحفظ (**Commit changes**).

### الخطوة 3: تشغيل البناء وتنزيل الـ APK على هاتفك
1. افتح تبويب **Actions** داخل المستودع في متصفح الهاتف.
2. اختر **Build Daghta Dev Scanner APK** ثم اضغط **Run workflow** (أو انتظر التشغيل التلقائي بعد الرفع).
3. بعد ~3 دقائق ستظهر علامة صح خضراء ✅؛ افتح التشغيل واضغط على **Artifacts → daghta-scanner-dev-apk** لتنزيل الملف.
4. فك ضغط الملف المُنزَّل بـ ZArchiver وثبّت \`daghta-scanner-dev.apk\` على هاتفك. سيظهر باسم **«ضغطة (تجريبي)»** بأمان بجانب نسختك المستقرة.

---

## الطريقة الثانية (بديلة من متصفح الهاتف بدون أي ملفات مخفية): Codemagic
1. ارفع المشروع على GitHub (ملف \`codemagic.yaml\` مرئي ولا يبدأ بنقطة).
2. افتح [codemagic.io](https://codemagic.io) من متصفح الهاتف وسجّل بحساب GitHub.
3. اختر المستودع واضغط **Start new build** واختر Workflow باسم **android-dev-scanner**.
4. عند انتهاء البناء اضغط على ملف \`daghta-scanner-dev.apk\` لتحميله مباشرة على هاتفك وتثبيته.

---

## ملاحظة تقنية بخصوص البناء المحلي داخل الهاتف (Termux)
لا يُنصح بمحاولة ترجمة Flutter/Gradle محلياً داخل Termux على الهاتف لأنها تتطلب 8–12 جيجابايت من المساحة وقد تفشل بسبب عدم توافق ثنائيات \`aapt2\` الخاصة بـ Android SDK على معمارية ARM64؛ لذا فإن **GitHub Actions** أو **Codemagic** من متصفح الهاتف هما المساران الرسميان والمضمونان.
`,
  },
];

const sharedStableFiles = FLUTTER_PROJECT_FILES.filter(
  (f) =>
    f.name !== 'pubspec.yaml' &&
    f.name !== 'AndroidManifest.xml' &&
    f.name !== 'main.dart' &&
    f.name !== 'home_screen.dart' &&
    f.name !== 'document_scanner_service.dart' &&
    f.name !== 'document_scanner_screen.dart',
);

export const FLUTTER_SCANNER_DEV_FILES: FlutterFile[] = [
  DEV_PUBSPEC_FILE,
  DEV_MANIFEST_FILE,
  ...sharedStableFiles.filter((f) => f.path.startsWith('lib/services/')),
  DEV_SCANNER_SERVICE_FILE,
  DEV_MAIN_FILE,
  DEV_HOME_SCREEN_FILE,
  ...sharedStableFiles.filter((f) => f.path.startsWith('lib/screens/')),
  DEV_SCANNER_SCREEN_FILE,
  ...sharedStableFiles.filter((f) => f.path.startsWith('lib/widgets/')),
  ...DEV_BUILD_SUPPORT_FILES,
];
