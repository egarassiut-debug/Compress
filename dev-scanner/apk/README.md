# مجلد مخرجات APK لنسخة التطوير (معزول عن النسخة المستقرة)

- **اسم ملف APK المستهدف لنسخة التطوير:** `daghta-scanner-dev.apk`
- **المسار الكامل:** `dev-scanner/apk/daghta-scanner-dev.apk`
- **معرف الحزمة (Package / applicationId):** `com.example.legal_file_compressor.dev`
- **اسم التطبيق على الهاتف:** `ضغطة (تجريبي)`
- **الإصدار:** `3.2.0-dev` (`versionCode = 5`)

> ملاحظة: بيئة التشغيل الحالية (Linux container) لا تتضمن أدوات بناء الأندرويد (`flutter`, `javac`, `gradle`, `aapt2`, `d8`, `apksigner`)، لذلك يتم بناء `daghta-scanner-dev.apk` على جهاز التطوير المحلي عبر Flutter أو Android SDK مع ضمان عدم المساس بملفات النسخة المستقرة (`public/app-debug.apk` و `APK_DOWNLOAD/app-debug.apk`) إطلاقاً وبمعرف حزمة منفصل تماماً حتى لا يتم التثبيت فوق التطبيق المستقر.
