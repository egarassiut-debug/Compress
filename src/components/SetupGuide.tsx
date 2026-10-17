import React, { useState } from 'react';
import {
  Terminal,
  ShieldCheck,
  Smartphone,
  CheckCircle2,
  Copy,
  Check,
  FolderDown,
  Gavel,
  HardDrive,
  FileCheck2,
  ShieldAlert,
  Compass,
  UploadCloud,
  FileImage,
  SlidersHorizontal,
  Eye,
  Share2,
  Send,
  Sparkles,
  Scale,
} from 'lucide-react';

export const SetupGuide: React.FC = () => {
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* بطاقة المقدمة */}
      <div className="bg-gradient-to-r from-blue-950/60 via-slate-900/80 to-blue-950/60 border border-blue-500/30 rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-2 text-teal-400 font-bold text-xs mb-2">
          <Gavel size={16} />
          <span>تطبيق قانوني خدمي للسادة المحامين</span>
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
          دليل تشغيل تطبيق &quot;تصغير حجم الصور للمنظومة&quot; خطوة بخطوة ⚖️
        </h3>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          دليل شامل لإعداد المشروع وتشغيله فوراً على هواتف الأندرويد، مع ضبط أذونات التخزين الشاملة (Storage & Manage External Storage) في AndroidManifest.xml، وحفظ الملفات مباشرة في مجلد التنزيلات (Downloads) بأمان تام وبدون أي إغلاق مفاجئ (Crash).
        </p>
      </div>

      {/* ==================== قسم كيفية الاستخدام للسادة المحامين ==================== */}
      <div className="bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-950/20">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-6 pb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold shadow-inner">
              <Compass size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-lg sm:text-xl font-bold text-white">
                  كيفية الاستخدام (دليل السادة المحامين السريع) ⚖️
                </h4>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2.5 py-0.5 rounded-full border border-amber-500/30">
                  3 خطوات بسيطة
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                شرح توضيحي بالخطوات والأيقونات لكيفية اختيار الملفات، ضبط جودة الضغط، ومشاركة المستندات المعالجة فوراً.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 shadow-sm">
            <ShieldCheck size={16} className="text-teal-400" />
            <span>معالجة محلية 100% بدون إنترنت وبدون إعلانات</span>
          </div>
        </div>

        {/* شبكة الخطوات الثلاث الرئيسية */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* 1. اختيار الملفات */}
          <div className="bg-slate-950/80 border border-blue-500/30 rounded-2xl p-5 flex flex-col justify-between hover:border-blue-400/50 transition-all group shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                  <UploadCloud size={24} />
                </div>
                <span className="text-xs font-black text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-xl border border-blue-500/20">
                  الخطوة الأولى
                </span>
              </div>

              <h5 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <FileImage size={16} className="text-blue-400" />
                <span>اختيار الملفات (فردي أو متعدد)</span>
              </h5>

              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                اضغط على الأداة المناسبة من الشاشة الرئيسية للهاتف:
              </p>

              <ul className="text-[11px] text-slate-400 space-y-2.5">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">تصغير الصور:</strong> اختر صورة واحدة أو حدد عدة صور توكيلات وبطاقات دفعة واحدة في الأمر الواحد.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">تصغير PDF:</strong> اختر عريضة الدعوى أو المذكرة المطلوب تقليص حجمها.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">دمج الصور:</strong> حدد أوراق الحافظة أو المحضر لدمجها في ملف PDF واحد متكامل.
                  </span>
                </li>
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-blue-300 font-medium">
              <Sparkles size={13} className="text-amber-400" />
              <span>يتوفر زر &quot;تجربة نموذج ملون&quot; للاختبار الفوري</span>
            </div>
          </div>

          {/* 2. ضبط جودة الضغط والحفاظ على الألوان */}
          <div className="bg-slate-950/80 border border-teal-500/30 rounded-2xl p-5 flex flex-col justify-between hover:border-teal-400/50 transition-all group shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                  <SlidersHorizontal size={24} />
                </div>
                <span className="text-xs font-black text-teal-400 bg-teal-500/10 px-2.5 py-1 rounded-xl border border-teal-500/20">
                  الخطوة الثانية
                </span>
              </div>

              <h5 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Eye size={16} className="text-teal-400" />
                <span>ضبط جودة الضغط ونقاء الأختام</span>
              </h5>

              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                خوارزمية ذكية تتكفل بالنسب الرياضية تلقائياً دون أي تعقيد:
              </p>

              <ul className="text-[11px] text-slate-400 space-y-2.5">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-teal-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">الحفاظ الكامل على الألوان:</strong> منع تحويل الأبيض والأسود نهائياً للحفاظ على حيوية أختام النسر الحمراء والتوقيعات الزرقاء.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-teal-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">ترشيح فائق الحدة:</strong> استخدام دقة 72-96 DPI وتنعيم متدرج (Lanczos High-Quality Resampling) يمنع التشويش والتبكسل في الخطوط الدقيقة.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-teal-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">مؤشر الشفافية التفاعلي (جانبي واختياري):</strong> يعرض النسبة المئوية اللحظية لإتمام الضغط والحجم الحالي المتناقص للملف مع خيار التصغير أو التعطيل بضغطة زر.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-teal-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">ضمان صارم للمنظومة:</strong> أقل من 200 KB للصور الفردية، وأقل من 500 KB لملفات الـ PDF.
                  </span>
                </li>
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-teal-300 font-medium">
              <CheckCircle2 size={13} className="text-teal-400" />
              <span>موافقة تامة لاشتراطات النيابة ومصر الرقمية</span>
            </div>
          </div>

          {/* 3. الحفظ المباشر والمشاركة */}
          <div className="bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-5 flex flex-col justify-between hover:border-emerald-400/50 transition-all group shadow-sm">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                  <Share2 size={24} />
                </div>
                <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                  الخطوة الثالثة
                </span>
              </div>

              <h5 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <FolderDown size={16} className="text-emerald-400" />
                <span>الحفظ التلقائي ومشاركة الملفات</span>
              </h5>

              <p className="text-xs text-slate-300 leading-relaxed mb-3">
                تنفيذ بضغطة واحدة وحفظ فوري بدون نوافذ معلقة:
              </p>

              <ul className="text-[11px] text-slate-400 space-y-2.5">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">حفظ فوري في المعرض:</strong> تُحفظ الصور المضغوطة تلقائياً في معرض صور هاتفك (Gallery / Pictures).
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">حفظ PDF في التنزيلات:</strong> تُحفظ المستندات في مجلد التنزيلات (Downloads) مباشرة.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">رسالة الـ 3 ثوانٍ مع [ فتح ]:</strong> تظهر رسالة خفيفة تعرض الحجم الجديد مع زر [ فتح ]، وتختفي خلال 3 ثوانٍ ليعود التطبيق جاهزاً.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-slate-200">مشاركة التطبيق:</strong> زر المشاركة العلوي يتيح إرسال التطبيق لزملائك المحامين عبر واتساب وغيره.
                  </span>
                </li>
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-emerald-300 font-medium">
              <Send size={13} className="text-emerald-400" />
              <span>مشاركة سريعة عبر واتساب وتطبيقات الهاتف</span>
            </div>
          </div>
        </div>

        {/* شريط الإرشادات القانونية الإضافية */}
        <div className="mt-6 bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400/10 text-amber-400 flex items-center justify-center shrink-0">
              <Scale size={16} />
            </div>
            <div>
              <span className="font-bold text-white block">بوابة الـ 10 مواقع القضائية الرسمية:</span>
              <span className="text-[11px] text-slate-400">
                من خلال المربع الأزرق في أسفل الشاشة، يمكنك الانتقال المباشر لبوابة النيابة العامة، محكمة الأسرة، ومصر الرقمية لرفع المستندات فور ضغطها.
              </span>
            </div>
          </div>

          <div className="shrink-0 text-[11px] font-bold text-amber-400 bg-amber-400/10 px-3 py-1.5 rounded-xl border border-amber-400/20">
            تصميم وتنفيذ: مصطفى فرويز المحامي ⚖️
          </div>
        </div>
      </div>

      {/* الخطوة 1: إنشاء المشروع وتثبيت الحزم */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm">
            1
          </div>
          <h4 className="text-base font-bold text-white">إنشاء مشروع Flutter وتثبيت الحزم المطلوبة</h4>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          قم بتشغيل الأوامر التالية في سطر الأوامر (Terminal) لإنشاء التطبيق وتحميل الحزم الرسمية المعتمدة:
        </p>
        <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/80 relative font-mono text-xs text-slate-200" dir="ltr">
          <button
            onClick={() =>
              copyToClipboard(
                `flutter create --org com.example legal_file_compressor\ncd legal_file_compressor\nflutter pub get`,
                'step1'
              )
            }
            className="absolute top-3 right-3 p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
          >
            {copiedText === 'step1' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
          <div className="space-y-1">
            <p className="text-emerald-400"># 1. إنشاء المشروع</p>
            <p>flutter create --org com.example legal_file_compressor</p>
            <p className="text-emerald-400 pt-2"># 2. الانتقال للمجلد وتثبيت الحزم المطلوبة</p>
            <p>cd legal_file_compressor</p>
            <p>flutter pub get</p>
          </div>
        </div>
      </div>

      {/* الخطوة 2: ضبط أذونات التخزين الشاملة والتشغيل الفوري */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-sm">
            2
          </div>
          <h4 className="text-base font-bold text-white">
            ضبط أذونات التخزين الشاملة في AndroidManifest.xml (بدون Crash)
          </h4>
        </div>

        <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
          <p>
            تم تزويد التطبيق بمنظومة أذونات متطورة تضمن عمل حفظ الملفات بسلاسة وتمنع أي إغلاق مفاجئ (Crash) على جميع أجيال أندرويد (أندرويد 7 حتى 15):
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div className="text-blue-400 font-bold mb-1.5 flex items-center gap-1.5">
                <HardDrive size={15} />
                <span>أذونات التخزين والوسائط الكاملة</span>
              </div>
              <ul className="text-slate-400 text-[11px] space-y-1 list-disc list-inside">
                <li><code className="text-teal-300">READ_EXTERNAL_STORAGE</code> و <code className="text-teal-300">WRITE_EXTERNAL_STORAGE</code></li>
                <li><code className="text-teal-300">MANAGE_EXTERNAL_STORAGE</code> لأندرويد 11 فما فوق (API 30+)</li>
                <li><code className="text-teal-300">READ_MEDIA_IMAGES</code> لأندرويد 13+ و 14+</li>
                <li>تفعيل <code className="text-teal-300">requestLegacyExternalStorage=&quot;true&quot;</code></li>
              </ul>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div className="text-emerald-400 font-bold mb-1.5 flex items-center gap-1.5">
                <ShieldCheck size={15} />
                <span>حفظ آمن بنظام الطبقات البديلة (Multi-Tier)</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                في فئة <code className="text-teal-300 font-mono">FileStorageService</code> تتم تجربة مجلد Downloads العام أولاً؛ وإذا منعت قيود أمان الهاتف الكتابة المباشرة، ينتقل تلقائياً للمسار المخصص دون أن يصدر أي خطأ أو يتوقف التطبيق، ثم يقدم خيار فتح الملف مباشرة للمحامي.
              </p>
            </div>
          </div>

          <div className="bg-blue-950/30 border border-blue-500/20 rounded-2xl p-3.5 text-xs text-blue-200 mt-2">
            <span className="font-bold text-white block mb-1">⚡ فتح فوري مباشر بدون شاشة دخول:</span>
            يفتح التطبيق مباشرة على لوحة التحكم الرئيسية فور النقر على أيقونته، دون طلب رقم هاتف أو كود تحقق أو SharedPreferences، ليكون متاحاً للاستخدام الفوري أثناء انعقاد الجلسات ومكاتب المحاكم.
          </div>
        </div>
      </div>

      {/* الخطوة 3: معايير منظومة النيابة العامة ومصر الرقمية */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm">
            3
          </div>
          <h4 className="text-base font-bold text-white">
            حدود الأحجام القياسية لمنظومة النيابة العامة
          </h4>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="pb-2 font-bold">نوع المستند</th>
                <th className="pb-2 font-bold">الحد الأقصى المسموح بالمنظومة</th>
                <th className="pb-2 font-bold">المعالجة البرمجية في التطبيق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              <tr>
                <td className="py-2.5 font-semibold text-white">الصور الفردية (توكيل، بطاقة، شهادة)</td>
                <td className="py-2.5 text-blue-400 font-bold">&lt; 200 KB صارماً</td>
                <td className="py-2.5 text-slate-400">
                  ترشيح فائق الجودة (Lanczos/Stepped Resampling) بدون أي تحويل لأبيض وأسود مع الحفاظ التام على الألوان والأختام، وضمان خروج الصورة حتماً أقل من 200 KB وحفظها بالمعرض.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 font-semibold text-white">ملفات PDF (صحف وعرائض)</td>
                <td className="py-2.5 text-orange-400 font-bold">&lt; 500 KB (شرط 450 KB)</td>
                <td className="py-2.5 text-slate-400">
                  إعادة تشفير التيارات وفحص تلقائي: إذا تجاوز الملف 450 KB يُعاد ضغطه تلقائياً ليكون تحت 450 KB.
                </td>
              </tr>
              <tr>
                <td className="py-2.5 font-semibold text-white">دمج الصور في ملف PDF واحد</td>
                <td className="py-2.5 text-emerald-400 font-bold">&lt; 500 KB (شرط 450 KB)</td>
                <td className="py-2.5 text-slate-400">
                  تحجيم كل صورة داخل الـ PDF إلى أقصى أبعاد 800px وجودة 40%-50%، مع إعادة ضغط إجباري عند 450 KB.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* الخطوة 4: الحفظ في مجلد التنزيلات (Downloads) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm">
            4
          </div>
          <h4 className="text-base font-bold text-white">
            آلية الحفظ التلقائي في مجلد التنزيلات (Downloads)
          </h4>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed mb-3">
          يتم الحفظ في المسار القياسي العام للتنزيلات في أندرويد:
          <br />
          <code className="text-teal-300 font-mono bg-slate-950 px-2.5 py-1 rounded-lg inline-block mt-1">
            /storage/emulated/0/Download
          </code>
        </p>
        <div className="bg-teal-950/40 border border-teal-500/20 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-teal-200">
          <CheckCircle2 size={16} className="text-teal-400 shrink-0 mt-0.5" />
          <span>
            <strong>بدون إعلانات نهائياً:</strong> بمجرد ضغط زر &quot;ضغط وحفظ في Downloads&quot;، تتم المعالجة محلياً في ثوانٍ معدودة ويتم حفظ الملف فوراً بدون أي نوافذ إعلانية أو فترات انتظار، لتمكين المحامي من رفع الملفات بسرعة في الجلسات ومكاتب النيابة.
          </span>
        </div>
      </div>

      {/* الخطوة 5: تشغيل التطبيق */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
            5
          </div>
          <h4 className="text-base font-bold text-white">تشغيل وتجربة التطبيق على الهاتف</h4>
        </div>
        <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/80 relative font-mono text-xs text-slate-200" dir="ltr">
          <button
            onClick={() => copyToClipboard('flutter run', 'step5')}
            className="absolute top-3 right-3 p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
          >
            {copiedText === 'step5' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
          <p className="text-emerald-400"># تشغيل التطبيق على الهاتف أو المحاكي</p>
          <p>flutter run</p>
        </div>
      </div>
    </div>
  );
};
