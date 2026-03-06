import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/activity.dart';
import '../theme/app_theme.dart';
import 'register_screen.dart';

class ActivityDetailScreen extends StatelessWidget {
  final Activity activity;

  const ActivityDetailScreen({super.key, required this.activity});

  @override
  Widget build(BuildContext context) {
    final canEnroll = activity.status == 1 || activity.status == 2;
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: Text(
          activity.activityName,
          overflow: TextOverflow.ellipsis,
        ),
        backgroundColor: AppTheme.surface,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _InfoCard(
              activity: activity,
              statusColor: _statusColor(activity.status),
            ),
            const SizedBox(height: 24),
            if (canEnroll)
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
                icon: const Icon(Icons.person_add_rounded, size: 22),
                label: const Text('我要报名'),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                ),
              )
            else
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.divider.withOpacity(0.5),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.event_busy_rounded, size: 20, color: AppTheme.textSecondary),
                    const SizedBox(width: 8),
                    Text(
                      '活动已结束，无法报名',
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: AppTheme.textSecondary,
                          ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Color _statusColor(int status) {
    switch (status) {
      case 1:
        return AppTheme.statusNotStarted;
      case 2:
        return AppTheme.statusOngoing;
      default:
        return AppTheme.statusEnded;
    }
  }
}

class _InfoCard extends StatelessWidget {
  final Activity activity;
  final Color statusColor;

  const _InfoCard({required this.activity, required this.statusColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _InfoRow(
            label: '状态',
            value: activity.statusText,
            valueColor: statusColor,
          ),
          if (activity.startTime != null) ...[
            const SizedBox(height: 14),
            _InfoRow(
              label: '开始时间',
              value: DateFormat('yyyy年M月d日 HH:mm').format(activity.startTime!),
            ),
          ],
          if (activity.endTime != null) ...[
            const SizedBox(height: 14),
            _InfoRow(
              label: '结束时间',
              value: DateFormat('yyyy年M月d日 HH:mm').format(activity.endTime!),
            ),
          ],
          if (activity.tag != null && activity.tag!.isNotEmpty) ...[
            const SizedBox(height: 14),
            _InfoRow(label: '标签', value: activity.tag!),
          ],
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;

  const _InfoRow({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 76,
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: AppTheme.textSecondary,
                ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: valueColor ?? AppTheme.textPrimary,
                  fontWeight: valueColor != null ? FontWeight.w500 : null,
                ),
          ),
        ),
      ],
    );
  }
}
