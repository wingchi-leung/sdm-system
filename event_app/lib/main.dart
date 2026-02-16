import 'package:flutter/material.dart';
import 'screens/activity_list_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const EventApp());
}

class EventApp extends StatelessWidget {
  const EventApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '活动报名',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal),
        useMaterial3: true,
      ),
      home: const ActivityListScreen(),
    );
  }
}
