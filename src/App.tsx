import React, { useState } from 'react';
import {
  Smartphone,
  Code2,
  BookOpen,
  Download,
  FolderArchive,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Target,
  ArrowUpRight,
  Gavel,
  Scale,
  KeyRound,
  Package,
} from 'lucide-react';
import { PhoneSimulator } from './components/PhoneSimulator';
import { CodeViewer } from './components/CodeViewer';
import { SetupGuide } from './components/SetupGuide';
import { downloadFlutterProjectZip, downloadRealApkDirectly } from './utils/zipGenerator';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'guide' | 'specs'>('simulator');
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  const handleDownloadZip = async () => {
    setIsDownloadingZip(true);
    try {
      await downloadFlutterProjectZip();
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Cairo',sans-serif]">
      {/* الشريط العلوي للعنوان والتحكم */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center text-white shadow-lg shadow-blue-900/40 ring-1 ring-white/20">
              <Gavel size={22} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                  تصغير حجم الصور للمنظومة ⚖️
                </h1>
                <span className="text-[10px] bg-teal-500/15 text-teal-300 font-bold px-2 py-0.5 rounded-full border border-teal-500/25 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                  منظومة النيابة العامة ومصر الرقمية
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                تطبيق خدمي مخصص للسادة المحامين: صور أقل من 200 KB وملفات PDF أقل من 500 KB مع ألوان كاملة وترشيح فائق الجودة.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={downloadRealApkDirectly}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-emerald-900/30 transition-all active:scale-95"
            >
              <Package size={16} />
              <span>تنزيل ملف APK المترجم (1.5 MB)</span>
            </button>

            <button
              onClick={handleDownloadZip}
              disabled={isDownloadingZip}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-900/30 transition-all active:scale-95 disabled:opacity-50"
            >
              <Download size={16} />
              <span>{isDownloadingZip ? 'جاري التجهيز...' : 'مشروع فلاتر (.ZIP مع APK)'}</span>
            </button>
          </div>
        </div>

        {/* شريط التبويبات الرئيسي */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-2 overflow-x-auto py-1">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === 'simulator'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone size={16} />
            <span>المحاكي التفاعلي المباشر (استخدام فوري بدون شاشة تسجيل دخول)</span>
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === 'code'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 size={16} />
            <span>مستعرض ملفات الكود المصدري (Flutter Clean Code)</span>
          </button>

          <button
            onClick={() => setActiveTab('guide')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === 'guide'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen size={16} />
            <span>دليل التثبيت والتشغيل خطوة بخطوة</span>
          </button>

          <button
            onClick={() => setActiveTab('specs')}
            className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-xs sm:text-sm font-bold transition-all shrink-0 ${
              activeTab === 'specs'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10 rounded-t-xl'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target size={16} />
            <span>معايير منظومة النيابة العامة (&lt; 200 KB للصور و &lt; 500 KB للـ PDF)</span>
          </button>
        </div>
      </header>

      {/* المحتوى الرئيسي حسب التبويب */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* الهاتف الذكي المحاكي */}
            <div className="lg:col-span-5 flex justify-center">
              <PhoneSimulator />
            </div>

            {/* تفاصيل وتوضيحات التطبيق والمميزات */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-7">
                <div className="flex items-center gap-2 text-teal-400 font-bold text-xs mb-2">
                  <Scale size={16} />
                  <span>تطبيق مهني خدمي متوافق مع بوابة النيابة ومصر الرقمية</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white mb-3">
                  تطبيق &quot;تصغير حجم الصور للمنظومة&quot;
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
                  تم تصميم وتطوير التطبيق لخدمة السادة المحامين عند رفع أوراق القضايا، والتوكيلات، وبطاقات الرقم القومي، ومذكرات الدفاع على بوابات العدالة الإلكترونية ومصر الرقمية دون أن ترفض المنظومة المستندات بسبب تجاوز الحجم المسموح.
                </p>

                {/* شرح الميزات الأساسية */}
                <div className="space-y-3">
                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 font-bold text-xs">
                      1
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">
                        فتح فوري مباشر بدون شاشة دخول (Instant Access)
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        يفتح التطبيق مباشرة على لوحة التحكم والأزرار الرئيسية فور تشغيله دون طلب رقم هاتف أو كود تحقق أو SharedPreferences، ليكون متاحاً للمحامي للاستخدام الفوري بدون أي تعطيل.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 font-bold text-xs">
                      2
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">
                        أذونات تخزين متوافقة لجميع إصدارات أندرويد (Zero Crash)
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        تضمين كامل لأذونات التخزين في AndroidManifest.xml (READ/WRITE EXTERNAL STORAGE, MANAGE_EXTERNAL_STORAGE, READ_MEDIA_IMAGES) مع نظام إنقاذ متعدد الطبقات يضمن حفظ الملفات في مجلد التنزيلات (Downloads) بسلاسة تامة دون إغلاق مفاجئ.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0 font-bold text-xs">
                      3
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">
                        أ) تصغير حجم الصورة بحد أقصى 200 KB وحفظها بالمعرض
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        ترشيح فائق الجودة (Lanczos/Stepped Resampling) مع الحفاظ التام على الألوان والأختام وحِدة الخطوط، وضمان حجم صارم أقل من 200 KB مع الحفظ المباشر في ألبوم الصور (Gallery).
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0 font-bold text-xs">
                      4
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">
                        ب) تصغير حجم ملف PDF بحد أقصى 500 KB مع نافذة مشاركة فورية
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        فحص حجم ملف الـ PDF الناتج تلقائياً: إذا تجاوز 450 كيلوبايت يتم إعادة ضغطه وخفض جودته تلقائياً حتى يقل حتماً عن 500 KB مع فتح نافذة الحفظ والمشاركة المباشرة (Save/Share Sheet).
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold text-xs">
                      5
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">
                        ج) دمج الصور في ملف PDF واحد (&lt; 500 KB)
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        تحجيم أبعاد كل صورة داخل المستند لأقصى 800 بكسل وضغط جودتها مع إعادة ضغط تلقائي عند 450 KB لضمان ملف موحد لا يتجاوز 500 KB مع إمكانية إرساله فوراً للمنظومة أو عبر واتساب.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* بطاقة تأكيد خلو التطبيق من الإعلانات */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      تطبيق خدمي بدون أي إعلانات نهائياً 🚫📢
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed mt-1">
                      تم استبعاد أي أكواد أو حزم إعلانية (Google AdMob) لضمان تجربة عمل سريعة ومريحة للمحامي أثناء الجلسات ومكاتب المحاكم.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'code' && <CodeViewer />}

        {activeTab === 'guide' && <SetupGuide />}

        {activeTab === 'specs' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8">
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
                شروط وضوابط الرفع على منظومة النيابة العامة وبوابة مصر الرقمية 🏛️
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-6">
                تضع النيابة العامة المصرية وبوابة مصر الرقمية اشتراطات تقنية دقيقة لقبول العرائض والشكاوى والتوكيلات والطلبات القضائية الإلكترونية:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                  <div className="text-blue-400 font-bold text-sm mb-2">صور التوكيل والبطاقة (&lt; 200 KB صارماً)</div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    يقوم التطبيق بضغط وتحجيم الصور الفردية لتكون دائماً أقل من 200 KB مع الحفاظ التام على الألوان والأختام وحِدة الخطوط وحفظها مباشرة في المعرض.
                  </p>
                </div>

                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                  <div className="text-orange-400 font-bold text-sm mb-2">ملف العريضة أو المذكرة (&lt; 500 KB)</div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    الحد الأقصى لملفات PDF المرفوعة هو 500 كيلوبايت. يتم ضغط صفحات الـ PDF الناتجة عن الماسح الضوئي لتناسب الحد الأقصى دون استبعاد أي صفحة مع نافذة مشاركة وحفظ فورية.
                  </p>
                </div>

                <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800">
                  <div className="text-emerald-400 font-bold text-sm mb-2">حفظ في المعرض ومشاركة سريعة</div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    تُحفظ الصور مباشرة في استوديو الصور (Gallery)، وتظهر نافذة مشاركة وحفظ فورية لملفات الـ PDF لإرسالها للمنظومة القضائية أو عبر واتساب بضغطة زر.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6">
              <h4 className="text-base font-bold text-white mb-2">
                لماذا معالجة محلية بالكامل أوفلاين؟
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                أوراق القضايا والتوكيلات تتضمن بيانات شخصية وأسرار موكلين مشمولة بحماية السر المهني؛ لذلك تتم جميع عمليات الضغط والدمج والتحويل محلياً 100% داخل معالج الهاتف دون إرسال أي صورة إلى سيرفرات خارجية أو طرف ثالث.
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => setActiveTab('code')}
                  className="inline-flex items-center gap-1.5 text-xs text-blue-400 font-bold hover:underline"
                >
                  <span>استعراض ملفات كود المشروع</span>
                  <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* شريط التذييل */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>
            تطبيق &quot;تصغير حجم الصور للمنظومة&quot; • تصميم وتنفيذ: مصطفى فرويز المحامي
          </span>
          <div className="flex items-center gap-4 text-[11px] text-slate-400">
            <span>فتح فوري بدون تسجيل دخول</span>
            <span>•</span>
            <span>&lt; 200 KB للصور • &lt; 500 KB للـ PDF</span>
            <span>•</span>
            <span>حفظ بالمعرض ومشاركة فورية</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
