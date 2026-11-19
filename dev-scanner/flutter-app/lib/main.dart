import 'package:flutter/material.dart';
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
