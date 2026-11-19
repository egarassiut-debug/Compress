# دليل بناء ملف APK لنسخة «ضغطة (تجريبي)» من هاتف Android فقط (بدون كمبيوتر)

هذه الحزمة مكتملة وجاهزة للبناء السحابي المجاني من متصفح هاتفك مباشرةً دون الحاجة إلى كمبيوتر، وتُخرج تطبيقاً مستقلاً بالبيانات التالية:
- **معرف الحزمة (Application ID):** `com.example.legal_file_compressor.dev`
- **اسم التطبيق على الهاتف:** `ضغطة (تجريبي)`
- **مخرج الـ APK:** `daghta-scanner-dev.apk`
- **حماية النسخة المستقرة:** لن يكتب فوق تطبيق «ضغطة» الأصلي المثبت على هاتفك ولن يمس إعدادات الضغط السابقة.

> **تنبيه مهم:** هذه الحزمة تحتوي على **الكود المصدري الكامل الجاهز للبناء** ولا تحتوي على APK مترجم مسبقاً؛ يجب تنفيذ خطوة البناء السحابي بالأسفل لإنتاج `daghta-scanner-dev.apk`.

---

## الطريقة الأولى (المجانية والأسهل عبر متصفح الهاتف): GitHub Actions

### الخطوة 1: تنزيل وفك ضغط الحزمة على الهاتف
1. حمّل ملف `daghta_scanner_dev_flutter.zip` على هاتفك.
2. افتح تطبيق **ZArchiver** (مجاني على Google Play) أو مدير الملفات وفك الضغط إلى مجلد واضح مثل `Download/daghta-dev`.
3. تأكد داخل الإعدادات في ZArchiver من تفعيل خيار **إظهار الملفات المخفية (Show hidden files)** حتى ترى مجلد `.github`.

### الخطوة 2: رفع المشروع إلى GitHub من الهاتف
- **الخيار أ (عن طريق تطبيق Termux على الهاتف — يرفع كل الملفات والمجلدات المخفية دفعة واحدة):**
  1. ثبّت تطبيق **Termux** من F-Droid.
  2. أنشئ مستودعاً جديداً (New repository) على حسابك في [github.com](https://github.com) من متصفح الهاتف.
  3. في Termux نفّذ الأوامر التالية (لإدارة git والرفع فقط، وليس لبناء Gradle):
     ```bash
     pkg update && pkg install -y git
     termux-setup-storage
     cd ~/storage/downloads/daghta-dev
     git init
     git branch -M main
     git add .
     git commit -m "Daghta dev scanner"
     git remote add origin https://github.com/USERNAME/REPO_NAME.git
     git push -u origin main
     ```
     *(استبدل `USERNAME/REPO_NAME` باسم مستودعك، واستخدم Personal Access Token ككلمة مرور عند الطلب).*

- **الخيار ب (من متصفح Chrome على الهاتف بدون Termux):**
  1. أنشئ مستودعاً جديداً على [github.com](https://github.com).
  2. اضغط **uploading an existing file** وارفع ملفات المشروع ومجلداته (`lib`, `android`, `assets`, `pubspec.yaml`, `codemagic.yaml`).
  3. لأن متصفح الهاتف قد يتجاهل المجلدات التي تبدأ بنقطة مثل `.github`: اضغط **Add file → Create new file** في GitHub واكتب في خانة الاسم:
     `.github/workflows/build_dev_apk.yml`
     ثم انسخ محتوى ملف `.github/workflows/build_dev_apk.yml` الموجود داخل الحزمة والصقه واحفظ (**Commit changes**).

### الخطوة 3: تشغيل البناء وتنزيل الـ APK على هاتفك
1. افتح تبويب **Actions** داخل المستودع في متصفح الهاتف.
2. اختر **Build Daghta Dev Scanner APK** ثم اضغط **Run workflow** (أو انتظر التشغيل التلقائي بعد الرفع).
3. بعد ~3 دقائق ستظهر علامة صح خضراء ✅؛ افتح التشغيل واضغط على **Artifacts → daghta-scanner-dev-apk** لتنزيل الملف.
4. فك ضغط الملف المُنزَّل بـ ZArchiver وثبّت `daghta-scanner-dev.apk` على هاتفك. سيظهر باسم **«ضغطة (تجريبي)»** بأمان بجانب نسختك المستقرة.

---

## الطريقة الثانية (بديلة من متصفح الهاتف بدون أي ملفات مخفية): Codemagic
1. ارفع المشروع على GitHub (ملف `codemagic.yaml` مرئي ولا يبدأ بنقطة).
2. افتح [codemagic.io](https://codemagic.io) من متصفح الهاتف وسجّل بحساب GitHub.
3. اختر المستودع واضغط **Start new build** واختر Workflow باسم **android-dev-scanner**.
4. عند انتهاء البناء اضغط على ملف `daghta-scanner-dev.apk` لتحميله مباشرة على هاتفك وتثبيته.

---

## ملاحظة تقنية بخصوص البناء المحلي داخل الهاتف (Termux)
لا يُنصح بمحاولة ترجمة Flutter/Gradle محلياً داخل Termux على الهاتف لأنها تتطلب 8–12 جيجابايت من المساحة وقد تفشل بسبب عدم توافق ثنائيات `aapt2` الخاصة بـ Android SDK على معمارية ARM64؛ لذا فإن **GitHub Actions** أو **Codemagic** من متصفح الهاتف هما المساران الرسميان والمضمونان.
