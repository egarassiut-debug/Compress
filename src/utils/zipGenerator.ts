import JSZip from 'jszip';
import { FLUTTER_PROJECT_FILES } from '../types/flutterCode';

export async function downloadFlutterProjectZip(): Promise<void> {
  const zip = new JSZip();
  const root = zip.folder('legal_file_compressor');
  if (!root) return;

  // إضافة ملفات المشروع
  for (const file of FLUTTER_PROJECT_FILES) {
    root.file(file.path, file.content);
  }

  // محاولة تضمين ملف الـ APK الحقيقي والمترجم داخل الـ ZIP
  try {
    const apkResponse = await fetch('/app-debug.apk');
    if (apkResponse.ok) {
      const apkBuffer = await apkResponse.arrayBuffer();
      // تضمين الـ APK في المجلد الجذري للمشروع
      root.file('app-debug.apk', apkBuffer);
      // تضمين الـ APK في مجلد APK_DOWNLOAD المباشر داخل الـ ZIP
      const apkDownloadFolder = root.folder('APK_DOWNLOAD');
      if (apkDownloadFolder) {
        apkDownloadFolder.file('app-debug.apk', apkBuffer);
      }
      // وتضمينه في مسار مخرجات البناء القياسي لـ Flutter
      const apkBuildFolder = root.folder('build/app/outputs/flutter-apk');
      if (apkBuildFolder) {
        apkBuildFolder.file('app-debug.apk', apkBuffer);
      }
    }
  } catch (err) {
    console.warn('Could not fetch app-debug.apk for ZIP bundling:', err);
  }

  // إضافة build.gradle
  root.file('android/app/build.gradle', `plugins {
    id "com.android.application"
    id "kotlin-android"
    id "dev.flutter.flutter-gradle-plugin"
}

android {
    namespace = "com.example.legal_file_compressor"
    compileSdk = 34
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_1_8
    }

    defaultConfig {
        applicationId = "com.example.legal_file_compressor"
        minSdk = 21
        targetSdk = 34
        versionCode = flutter.versionCode
        versionName = flutter.versionName
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
    implementation 'androidx.multidex:multidex:2.0.1'
}
`);

  // إضافة README.md إرشادي متكامل باللغة العربية
  root.file('README.md', `# تطبيق "تصغير حجم الصور للمنظومة" ⚖️

تطبيق أندرويد خدمي متكامل مخصص للسادة المحامين لتسهيل التعامل مع منصات النيابة العامة وبوابة مصر الرقمية والمحاكم.

## 📦 ملف التطبيق الجاهز للتثبيت (Real Android Debug APK):
- تم تضمين ملف الـ APK المترجم والموقّع رسمياً داخل هذا الأرشيف باسم \`app-debug.apk\` بحجم ~1.5 MB.
- يمكنك تثبيته مباشرة على هاتفك الأندرويد واستخدامه فوراً!

## 📱 المميزات الأساسية:
1. **فتح فوري ومباشر دون شاشة تسجيل دخول (Instant Access)**:
   - يفتح التطبيق مباشرة على لوحة التحكم فور تشغيله دون طلب رقم هاتف أو كود تحقق أو SharedPreferences.
2. **أذونات تخزين متوافقة لجميع إصدارات أندرويد (Zero-Crash Permissions)**:
   - دعم كامل لأذونات التخزين في AndroidManifest.xml: READ/WRITE_EXTERNAL_STORAGE و MANAGE_EXTERNAL_STORAGE و READ_MEDIA_IMAGES.
   - نظام إنقاذ متعدد الطبقات يضمن حفظ الملفات في مجلد التنزيلات (Downloads) بسلاسة ودون إغلاق مفاجئ على أي إصدار أندرويد.
3. **تصغير حجم الصورة لأقل من 200 KB**:
   - ترشيح فائق الجودة (Lanczos/Stepped Resampling) بدون أي تحويل لأبيض وأسود مع الحفاظ التام على الألوان والأختام وحِدة الحروف.
   - حفظ مباشر في معرض الصور بالهاتف (\`Gallery / الاستوديو\`) لسرعة وسهولة التصفح.
4. **تصغير حجم ملف PDF لأقل من 500 KB**:
   - تقليص حجم المذكرات وعرائض الدعاوى مع الحفاظ على الألوان والأختام الأصلية.
5. **دمج الصور في ملف PDF واحد (< 500 KB)**:
   - دمج أوراق المحضر أو حافظة المستندات في ملف موحد بحجم لا يتجاوز 500 KB.
6. **زر مشاركة التطبيق العلوي واسم المصمم الأنيق**:
   - الاكتفاء بزر مشاركة التطبيق في شريط الترحيب العلوي فقط.
   - بقاء اسم المصمم بخط صغير وأنيق في الفوتر: "تصميم وتنفيذ: مصطفى فرويز المحامي".
7. **رسالة النجاح الذكية المؤقتة**:
   - إظهار رسالة فورية: (تم التحويل بنجاح - الحجم: X KB) وبجانبها زر صغير [ فتح ] يختفي تلقائياً بعد 3 ثوانٍ.
8. **دليل الـ 10 مواقع القضائية الرسمية (مرقمة من 1 إلى 10)**:
   - بطاقة تفاعلية لفتح مواقع النيابة العامة، محكمة الأسرة، مصر الرقمية، ووزارة العدل مباشرة.
9. **بدون أي إعلانات نهائياً**:
   - معالجة محلية 100% بدون أي أكواد إعلانية (AdMob Free).

## 🛠️ التشغيل السريع للمشروع:
\`\`\`bash
flutter pub get
flutter run
\`\`\`
`);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'manzoma_lawyer_compressor.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * تنزيل ملف الـ APK المترجم الحقيقي مباشرة بنقرة واحدة
 */
export function downloadRealApkDirectly(): void {
  const a = document.createElement('a');
  a.href = '/app-debug.apk';
  a.download = 'app-debug.apk';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
