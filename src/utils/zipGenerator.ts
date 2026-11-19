import JSZip from 'jszip';
import { FLUTTER_PROJECT_FILES } from '../types/flutterCode';
import { FLUTTER_SCANNER_DEV_FILES } from '../types/flutterScannerDevCode';

export async function downloadFlutterProjectZip(): Promise<void> {
  const zip = new JSZip();
  const root = zip.folder('legal_file_compressor');
  if (!root) return;

  // إضافة ملفات المشروع
  for (const file of FLUTTER_PROJECT_FILES) {
    root.file(file.path, file.content);
  }

  // تضمين الأصول الرسمية لتطبيق «ضغطة» (الصورة المرفقة + Adaptive Icons لجميع الكثافات)
  const assetFetches: Array<{ url: string; targetPath: string }> = [
    {
      url: '/assets/brand/ic_launcher_foreground.png',
      targetPath: 'assets/images/welcome_logo.png',
    },
    {
      url: '/assets/brand/ic_launcher_foreground.png',
      targetPath: 'android/app/src/main/res/drawable/ic_launcher_foreground.png',
    },
    ...(['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'] as const).flatMap((density) => [
      {
        url: `/assets/brand/mipmap-${density}/ic_launcher.png`,
        targetPath: `android/app/src/main/res/mipmap-${density}/ic_launcher.png`,
      },
      {
        url: `/assets/brand/mipmap-${density}/ic_launcher_round.png`,
        targetPath: `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`,
      },
    ]),
  ];

  await Promise.all(
    assetFetches.map(async ({ url, targetPath }) => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          root.file(targetPath, await res.arrayBuffer());
        }
      } catch (err) {
        console.warn(`Could not fetch ${url} for ZIP:`, err);
      }
    }),
  );

  // إضافة ملفات Adaptive Icon XML لأندرويد 8.0+ (API 26+)
  root.file(
    'android/app/src/main/res/drawable/ic_launcher_background.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#060E24" />
</shape>
`,
  );

  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
  root.file('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', adaptiveXml);
  root.file('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', adaptiveXml);

  // محاولة تضمين ملف الـ APK الحقيقي والمترجم داخل الـ ZIP
  try {
    const apkResponse = await fetch('/app-debug.apk');
    if (apkResponse.ok) {
      const apkBuffer = await apkResponse.arrayBuffer();
      // تضمين الـ APK حصرياً في مجلد APK_DOWNLOAD المباشر داخل الـ ZIP
      const apkDownloadFolder = root.folder('APK_DOWNLOAD');
      if (apkDownloadFolder) {
        apkDownloadFolder.file('app-debug.apk', apkBuffer);
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
  root.file('README.md', `# تطبيق «ضغطة» — تصغير حجم الصور والـ PDF للمنظومة

تطبيق أندرويد خدمي متكامل مخصص للسادة المحامين لتسهيل التعامل مع منصات النيابة العامة وبوابة مصر الرقمية والمحاكم.

## 📦 ملف التطبيق الجاهز للتثبيت (Real Android Debug APK):
- تم تضمين ملف الـ APK المترجم والموقّع رسمياً حصرياً داخل مجلد \`APK_DOWNLOAD/app-debug.apk\` بحجم 2.1 MB (v3.1.0).
- يتضمن الأيقونة الرسمية لتطبيق **«ضغطة»** على سطح مكتب الهاتف بجميع المقاسات وشعار بطاقة الترحيب المرفق داخل الشاشة الرئيسية.

## 📱 الهوية البصرية والمميزات الأساسية:
1. **هوية بصرية قضائية فاخرة ومضغوطة**:
   - كحلي ملكي (\`#0F2557\`) مع أبيض ناصع ولمسات ذهبية رفيعة (\`#D4AF37\`).
   - ترتيب رأسي مضغوط للخدمات الخمس بألوانها المميزة وأرقامها (1 الأزرق للصور، 2 البرتقالي للـ PDF، 3 الأخضر للدمج، 4 التركواز لتصوير المستندات، 5 البنفسجي للبوابات القانونية).
2. **فتح فوري ومباشر دون شاشة تسجيل دخول**:
   - يفتح التطبيق مباشرة على الشاشة الرئيسية فور تشغيله.
3. **معيار موحد < 500 KB للصور والـ PDF (Zero Data Loss)**:
   - تحجيم هندسي ذكي يناسب صفحة A4 وترشيح فائق الجودة مع الحفاظ التام على الألوان والأختام وحِدة الحروف والأرقام.
4. **خدمة تصوير المستندات وتحسينها وضغطها (أوفلاين 100%)**:
   - تصوير متتالي (تلقائي/يدوي)، اكتشاف وقص يدوي، تصحيح المنظور، تدوير يدوي 45°، تحسين الإضاءة والظلال بالألوان الطبيعية الكاملة، مراجعة وترتيب وحذف وإعادة تصوير، ثم حفظ مزدوج لصور \`Scan_001..\` بالمعرض و \`Scanned_Document.pdf\` بالتنزيلات (< 500 KB).
5. **مربع حوار تأكيد الحفظ المركزي (3 ثوانٍ)**:
   - يظهر في منتصف الشاشة فور تأكيد الحفظ الفعلي لعرض مكان الحفظ (الاستوديو للصور / Downloads للمستندات) مع زر [ فتح الملف ] وزر × للإغلاق اليدوي واختفاء تلقائي بعد 3 ثوانٍ.
6. **دليل الـ 10 مواقع القضائية الرسمية**:
   - الوصول المباشر لبوابة النيابة العامة، محكمة الأسرة، مصر الرقمية، ووزارة العدل.
7. **تذييل هادئ**:
   - تصميم وتنفيذ: مصطفى فرويز المحامي
   - Al-Hawai Tech

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
 * تنزيل ملف الـ APK المترجم الحقيقي مباشرة بنقرة واحدة (النسخة المستقرة)
 */
export function downloadRealApkDirectly(): void {
  const a = document.createElement('a');
  a.href = '/app-debug.apk';
  a.download = 'app-debug.apk';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * تنزيل حزمة مشروع Flutter المعزولة لنسخة التطوير (مع خدمة تصوير المستندات ومعرف .dev منفصل)
 */
export async function downloadScannerDevFlutterZip(): Promise<void> {
  const zip = new JSZip();
  const root = zip.folder('daghta_scanner_dev_flutter');
  if (!root) return;

  for (const file of FLUTTER_SCANNER_DEV_FILES) {
    root.file(file.path, file.content);
  }

  const assetFetches: Array<{ url: string; targetPath: string }> = [
    {
      url: '/assets/brand/ic_launcher_foreground.png',
      targetPath: 'assets/images/welcome_logo.png',
    },
    {
      url: '/assets/brand/ic_launcher_foreground.png',
      targetPath: 'android/app/src/main/res/drawable/ic_launcher_foreground.png',
    },
    ...(['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'] as const).flatMap((density) => [
      {
        url: `/assets/brand/mipmap-${density}/ic_launcher.png`,
        targetPath: `android/app/src/main/res/mipmap-${density}/ic_launcher.png`,
      },
      {
        url: `/assets/brand/mipmap-${density}/ic_launcher_round.png`,
        targetPath: `android/app/src/main/res/mipmap-${density}/ic_launcher_round.png`,
      },
    ]),
  ];

  await Promise.all(
    assetFetches.map(async ({ url, targetPath }) => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          root.file(targetPath, await res.arrayBuffer());
        }
      } catch (err) {
        console.warn(`Could not fetch ${url} for Dev ZIP:`, err);
      }
    }),
  );

  root.file(
    'android/app/src/main/res/drawable/ic_launcher_background.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <solid android:color="#060E24" />
</shape>
`,
  );

  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
  root.file('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', adaptiveXml);
  root.file('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', adaptiveXml);

  root.file(
    'APK_OUTPUT_TARGET.txt',
    `Dev APK Output Path: dev-scanner/apk/daghta-scanner-dev.apk
Application ID: com.example.legal_file_compressor.dev
App Label: ضغطة (تجريبي)
Does NOT overwrite stable com.example.legal_file_compressor or public/app-debug.apk.
No prebuilt APK is bundled inside this ZIP.
Build from Android Phone Only: see BUILD_FROM_PHONE.md (.github/workflows/build_dev_apk.yml & codemagic.yaml).
`,
  );

  root.file(
    'README.md',
    `# نسخة التطوير المعزولة — تطبيق «ضغطة (تجريبي)» + خدمة تصوير المستندات

هذه الحزمة معزولة تماماً عن النسخة المستقرة لتطبيق «ضغطة»:
- **معرف الحزمة (Application ID):** \`com.example.legal_file_compressor.dev\` (لن يكتب فوق النسخة المستقرة على هاتفك).
- **اسم التطبيق:** \`ضغطة (تجريبي)\`
- **مسار الـ APK المستهدف بعد البناء:** \`daghta-scanner-dev.apk\`
- **خوارزميات الضغط القديمة:** لم تُمس أي إعدادات أو نسب ضغط سابقة.
- **لا تحتوي الحزمة على أي ملف APK قديم:** هذا مشروع Flutter كامل جاهز للبناء.

## 📱 البناء من هاتف Android فقط (بدون كمبيوتر):
راجع ملف \`BUILD_FROM_PHONE.md\` المرفق داخل الحزمة لتفاصيل البناء السحابي المجاني عبر **GitHub Actions** (\`.github/workflows/build_dev_apk.yml\`) أو **Codemagic** (\`codemagic.yaml\`) مباشرة من متصفح الهاتف.
`,
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'daghta_scanner_dev_flutter.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

