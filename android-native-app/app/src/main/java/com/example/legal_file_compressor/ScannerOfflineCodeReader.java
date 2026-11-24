package com.example.legal_file_compressor;

import android.graphics.Bitmap;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.LuminanceSource;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.GlobalHistogramBinarizer;
import com.google.zxing.common.HybridBinarizer;

import java.util.Arrays;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * قارئ رموز QR والباركود محلياً 100% أوفلاين باستخدام ZXing Core 3.5.3.
 * يعرض المحتوى المفكوك للمستخدم فقط دون فتح روابط أو تنفيذ أوامر تلقائية.
 */
public final class ScannerOfflineCodeReader {

    public static final class CodeScanResult {
        public final String text;
        public final String formatLabel;
        public final String contentKindLabel;

        public CodeScanResult(String text, String formatLabel, String contentKindLabel) {
            this.text = text;
            this.formatLabel = formatLabel;
            this.contentKindLabel = contentKindLabel;
        }
    }

    private final MultiFormatReader reader;

    public ScannerOfflineCodeReader() {
        reader = new MultiFormatReader();
        Map<DecodeHintType, Object> hints = new EnumMap<DecodeHintType, Object>(DecodeHintType.class);
        List<BarcodeFormat> formats = Arrays.asList(
            BarcodeFormat.QR_CODE,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.CODE_93,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.ITF,
            BarcodeFormat.CODABAR,
            BarcodeFormat.DATA_MATRIX,
            BarcodeFormat.AZTEC,
            BarcodeFormat.PDF_417
        );
        hints.put(DecodeHintType.POSSIBLE_FORMATS, formats);
        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        hints.put(DecodeHintType.CHARACTER_SET, "UTF-8");
        reader.setHints(hints);
    }

    /**
     * فك رمز QR أو باركود من إطار الكاميرا الحي (NV21 YUV).
     */
    public CodeScanResult decodeFromNv21(byte[] nv21, int srcWidth, int srcHeight, int displayDeg) {
        if (nv21 == null || srcWidth <= 0 || srcHeight <= 0 || nv21.length < srcWidth * srcHeight) {
            return null;
        }

        // اقتصاص منطقة التركيز المركزية (68% من الإطار) لرفع سرعة ودقة القراءة وتقليل الضوضاء
        int cropW = Math.max(160, Math.round(srcWidth * 0.68f));
        int cropH = Math.max(160, Math.round(srcHeight * 0.68f));
        int left = Math.max(0, (srcWidth - cropW) / 2);
        int top = Math.max(0, (srcHeight - cropH) / 2);

        PlanarYUVLuminanceSource centerSrc = new PlanarYUVLuminanceSource(
            nv21, srcWidth, srcHeight, left, top, cropW, cropH, false);
        Result result = tryDecodeSource(centerSrc);

        // محاولة تدوير 90° في الذاكرة لالتقاط الباركود الطولي عند الإمساك العمودي بالهاتف
        if (result == null && (((displayDeg % 180) + 180) % 180) == 90) {
            byte[] rotatedCrop = rotateCenterYPlane90(nv21, srcWidth, srcHeight, left, top, cropW, cropH);
            PlanarYUVLuminanceSource rotatedSrc = new PlanarYUVLuminanceSource(
                rotatedCrop, cropH, cropW, 0, 0, cropH, cropW, false);
            result = tryDecodeSource(rotatedSrc);
        }

        if (result == null) {
            PlanarYUVLuminanceSource fullSrc = new PlanarYUVLuminanceSource(
                nv21, srcWidth, srcHeight, 0, 0, srcWidth, srcHeight, false);
            result = tryDecodeSource(fullSrc);
        }

        return wrapResult(result);
    }

    /**
     * فك رمز QR أو باركود من صورة مستوردة أو ملتقطة.
     */
    public CodeScanResult decodeFromBitmap(Bitmap src) {
        if (src == null || src.isRecycled()) return null;
        Bitmap working = src;
        boolean scaledLocally = false;
        int maxDim = Math.max(src.getWidth(), src.getHeight());
        if (maxDim > 1280) {
            float scale = 1280f / maxDim;
            working = Bitmap.createScaledBitmap(
                src,
                Math.max(120, Math.round(src.getWidth() * scale)),
                Math.max(120, Math.round(src.getHeight() * scale)),
                true
            );
            scaledLocally = (working != src);
        }

        try {
            int w = working.getWidth();
            int h = working.getHeight();
            int[] pixels = new int[w * h];
            working.getPixels(pixels, 0, w, 0, 0, w, h);
            RGBLuminanceSource rgbSource = new RGBLuminanceSource(w, h, pixels);
            Result res = tryDecodeSource(rgbSource);
            return wrapResult(res);
        } catch (Throwable ignored) {
            return null;
        } finally {
            if (scaledLocally && !working.isRecycled()) {
                working.recycle();
            }
        }
    }

    private Result tryDecodeSource(LuminanceSource source) {
        if (source == null) return null;
        try {
            return reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(source)));
        } catch (Exception ignored) {
        } finally {
            reader.reset();
        }
        try {
            return reader.decodeWithState(new BinaryBitmap(new GlobalHistogramBinarizer(source)));
        } catch (Exception ignored) {
        } finally {
            reader.reset();
        }
        return null;
    }

    private static byte[] rotateCenterYPlane90(
        byte[] nv21, int srcW, int srcH, int left, int top, int cropW, int cropH
    ) {
        byte[] out = new byte[cropW * cropH];
        for (int y = 0; y < cropH; y++) {
            int sy = top + y;
            for (int x = 0; x < cropW; x++) {
                int sx = left + x;
                int dstX = cropH - 1 - y;
                int dstY = x;
                out[dstY * cropH + dstX] = nv21[sy * srcW + sx];
            }
        }
        return out;
    }

    private static CodeScanResult wrapResult(Result result) {
        if (result == null || result.getText() == null) return null;
        String text = result.getText().trim();
        if (text.isEmpty()) return null;

        String formatLabel = formatToArabic(result.getBarcodeFormat());
        String lower = text.toLowerCase(Locale.US);
        String kindLabel;
        if (lower.startsWith("http://") || lower.startsWith("https://")) {
            kindLabel = "رابط إلكتروني (يُعرض كنص فقط دون فتح تلقائي)";
        } else if (lower.startsWith("wifi:")) {
            kindLabel = "بيانات شبكة واي فاي (عرض نصي فقط)";
        } else if (lower.startsWith("begin:vcard") || lower.startsWith("mecard:")) {
            kindLabel = "بطاقة جهة اتصال";
        } else if (text.matches("\\d{8,14}")) {
            kindLabel = "رقم باركود / منتج / مرجع رقمي";
        } else {
            kindLabel = "نص / بيانات";
        }
        return new CodeScanResult(text, formatLabel, kindLabel);
    }

    private static String formatToArabic(BarcodeFormat format) {
        if (format == null) return "رمز ضوئي";
        switch (format) {
            case QR_CODE: return "رمز QR";
            case CODE_128: return "باركود Code 128";
            case CODE_39: return "باركود Code 39";
            case CODE_93: return "باركود Code 93";
            case EAN_13: return "باركود EAN-13";
            case EAN_8: return "باركود EAN-8";
            case UPC_A: return "باركود UPC-A";
            case UPC_E: return "باركود UPC-E";
            case DATA_MATRIX: return "رمز Data Matrix";
            case PDF_417: return "رمز PDF417";
            case AZTEC: return "رمز Aztec";
            case ITF: return "باركود ITF";
            case CODABAR: return "باركود Codabar";
            default: return "رمز " + format.name();
        }
    }
}
