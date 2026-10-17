import React, { useState } from 'react';
import {
  Copy,
  Check,
  Download,
  FileCode,
  FolderTree,
  ExternalLink,
  Terminal,
  Layers,
  Package,
} from 'lucide-react';
import { FLUTTER_PROJECT_FILES, FlutterFile } from '../types/flutterCode';
import { downloadFlutterProjectZip, downloadRealApkDirectly } from '../utils/zipGenerator';

export const CodeViewer: React.FC = () => {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  const activeFile: FlutterFile = FLUTTER_PROJECT_FILES[activeFileIndex] || FLUTTER_PROJECT_FILES[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      await downloadFlutterProjectZip();
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[740px]">
      {/* الشريط العلوي */}
      <div className="bg-slate-950/80 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <FileCode size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">مستعرض ملفات كود فلاتر</h3>
              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-mono">
                Flutter 3.x • Dart
              </span>
            </div>
            <p className="text-xs text-slate-400">
              كود نظيف ومرتب ومنظم في فئات (Clean Architecture) جاهز للتشغيل فوراً.
            </p>
          </div>
        </div>

        {/* أزرار التحميل والنسخ */}
        <div className="flex items-center gap-2">
          <button
            onClick={downloadRealApkDirectly}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
          >
            <Package size={14} />
            <span>تنزيل APK المترجم (1.5 MB)</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all border border-slate-700 active:scale-95"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-400" />
                <span className="text-emerald-400">تم النسخ بنجاح!</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span>نسخ الملف الحالي</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
          >
            <Download size={14} />
            <span>{isZipping ? 'جاري تحزيم المشروع...' : 'تنزيل المشروع كاملاً (ZIP)'}</span>
          </button>
        </div>
      </div>

      {/* منطقة العرض: شجرة الملفات + محتوى الكود */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* شريط قائمة الملفات */}
        <div className="w-full md:w-72 bg-slate-950/50 border-b md:border-b-0 md:border-l border-slate-800 p-3 overflow-y-auto">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 py-2 flex items-center gap-1.5">
            <FolderTree size={14} className="text-blue-400" />
            <span>شجرة ملفات المشروع</span>
          </div>

          <div className="space-y-1">
            {FLUTTER_PROJECT_FILES.map((file, idx) => {
              const isActive = idx === activeFileIndex;
              return (
                <button
                  key={file.path}
                  onClick={() => setActiveFileIndex(idx)}
                  className={`w-full text-right px-3 py-2.5 rounded-xl text-xs flex flex-col gap-1 transition-all ${
                    isActive
                      ? 'bg-blue-600/15 border border-blue-500/30 text-blue-300 font-bold'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="font-mono text-[11px] ltr truncate" dir="ltr">
                      {file.name}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded ${
                        file.language === 'dart'
                          ? 'bg-indigo-500/20 text-indigo-300'
                          : file.language === 'yaml'
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {file.language}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 line-clamp-1">
                    {file.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* محرر الكود المصدري */}
        <div className="flex-1 flex flex-col bg-slate-950/90 overflow-hidden">
          {/* شريط مسار الملف الحالي */}
          <div className="bg-slate-900/60 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 font-mono text-slate-400 text-[11px]" dir="ltr">
              <span className="text-blue-400 font-bold">file_compressor_app/</span>
              <span className="text-slate-200">{activeFile.path}</span>
            </div>
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              {activeFile.description}
            </span>
          </div>

          {/* محتوى الكود الملون والمنسق */}
          <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-300 leading-relaxed selection:bg-blue-600 selection:text-white" dir="ltr">
            <pre className="whitespace-pre">
              <code>{activeFile.content}</code>
            </pre>
          </div>
        </div>
      </div>

      {/* الشريط السفلي: إحصائيات سريعة */}
      <div className="bg-slate-950 border-t border-slate-800 px-6 py-2.5 flex items-center justify-between text-[11px] text-slate-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Null Safety Enabled</span>
          </span>
          <span className="hidden sm:inline">Material 3 • Android SDK 34 Compatible</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-teal-400 font-semibold">فتح فوري بدون تسجيل دخول • حفظ آمن بالتنزيلات • بدون إعلانات</span>
        </div>
      </div>
    </div>
  );
};
