import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/activity.dart';
import 'register_screen.dart';

class ActivityDetailScreen extends StatelessWidget {
  final Activity activity;

  const ActivityDetailScreen({super.key, required this.activity});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(activity.activityName),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _InfoRow(
              label: '状态',
              value: activity.statusText,
            ),
            if (activity.startTime != null)
              _InfoRow(
                label: '开始时间',
                value: DateFormat('yyyy-MM-dd HH:mm').format(activity.startTime!),
              ),
            if (activity.endTime != null)
              _InfoRow(
                label: '结束时间',
                value: DateFormat('yyyy-MM-dd HH:mm').format(activity.endTime!),
              ),
            if (activity.tag != null && activity.tag!.isNotEmpty)
              _InfoRow(label: '标签', value: activity.tag!),
            const SizedBox(height: 32),
            if (activity.status == 1 || activity.status == 2)
              FilledButton.icon(
                onPressed: () async {
                  final ok = await Navigator.of(context).push<bool>(
                    MaterialPageRoute(
                      builder: (context) => RegisterScreen(activity: activity),
                    ),
                  );
                  if (ok == true && context.mounted) {
                    Navigator.of(context).pop(true);
                  }
                },
                icon: const Icon(Icons.person_add),
                label: const Text('我要报名'),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  textStyle: const TextStyle(fontSize: 16),
                ),
              )
            else
              Card(
                color: Colors.grey.shade200,
                child: const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(
                    child: Text('活动已结束，无法报名'),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: TextStyle(
                color: Colors.grey[600],
                fontSize: 14,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 15),
            ),
          ),
        ],
      ),
    );
  }
}
