import 'package:flutter/material.dart';
import '../models/activity.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';
import 'activity_detail_screen.dart';
import 'create_activity_screen.dart';
import 'login_screen.dart';
import 'user_register_screen.dart';

/// 管理员「查看活动」：全部活动列表（从「我的」进入）
class ActivityListScreen extends StatefulWidget {
  const ActivityListScreen({super.key});

  @override
  State<ActivityListScreen> createState() => _ActivityListScreenState();
}

class _ActivityListScreenState extends State<ActivityListScreen> {
  final ApiService _api = ApiService();
  final AuthService _auth = AuthService.instance;
  List<Activity> _activities = [];
  int _total = 0;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _auth.loadToken().then((_) => setState(() {}));
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await _api.getActivities();
      setState(() {
        _activities = res.items;
        _total = res.total;
        _loading = false;
      });
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('活动列表'),
        backgroundColor: AppTheme.surface,
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline_rounded),
            tooltip: '发布活动',
            onPressed: () async {
              final ok = await Navigator.of(context).push<bool>(
                MaterialPageRoute(
                  builder: (context) => const CreateActivityScreen(),
                ),
              );
              if (ok == true && mounted) _load();
            },
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: '刷新',
            onPressed: _loading ? null : _load,
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert_rounded),
            onSelected: (value) async {
              if (value == 'logout') {
                await _auth.logout();
                if (mounted) setState(() {});
              } else if (value == 'login') {
                final ok = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(
                    builder: (context) => const LoginScreen(),
                  ),
                );
                if (ok == true && mounted) setState(() {});
              } else if (value == 'register') {
                await Navigator.of(context).push<bool>(
                  MaterialPageRoute(
                    builder: (context) => const UserRegisterScreen(),
                  ),
                );
              }
            },
            itemBuilder: (context) => [
              if (_auth.isAdmin)
                const PopupMenuItem(value: 'logout', child: Text('退出登录')),
              if (!_auth.isAdmin) ...[
                const PopupMenuItem(value: 'login', child: Text('登录')),
                const PopupMenuItem(value: 'register', child: Text('用户注册')),
              ],
            ],
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: AppTheme.primary, strokeWidth: 2),
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.error_outline_rounded,
                size: 48,
                color: Theme.of(context).colorScheme.error,
              ),
              const SizedBox(height: 16),
              Text(
                '加载失败',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppTheme.textSecondary,
                    ),
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh_rounded, size: 20),
                label: const Text('重试'),
              ),
            ],
          ),
        ),
      );
    }
    if (_activities.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.event_busy_rounded,
                size: 72,
                color: AppTheme.textTertiary,
              ),
              const SizedBox(height: 20),
              Text(
                '暂无活动',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: AppTheme.textSecondary,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                '点击右上角 + 发布活动，或下拉刷新',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppTheme.textTertiary,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: () async {
                  final ok = await Navigator.of(context).push<bool>(
                    MaterialPageRoute(
                      builder: (context) => const CreateActivityScreen(),
                    ),
                  );
                  if (ok == true && mounted) _load();
                },
                icon: const Icon(Icons.add_rounded, size: 20),
                label: const Text('发布活动'),
              ),
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      color: AppTheme.primary,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: _activities.length,
        itemBuilder: (context, index) {
          final a = _activities[index];
          final statusColor = _statusColor(a.status);
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Material(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(12),
              clipBehavior: Clip.antiAlias,
              child: ListTile(
                contentPadding: const EdgeInsets.all(16),
                leading: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.event_rounded, color: statusColor, size: 26),
                ),
                title: Text(
                  a.activityName,
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                ),
                subtitle: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (a.startTime != null)
                        Text(
                          _formatDate(a.startTime!),
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: AppTheme.textSecondary,
                              ),
                        ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: statusColor.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          a.statusText,
                          style: TextStyle(
                            fontSize: 12,
                            color: statusColor,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                trailing: Icon(
                  Icons.chevron_right_rounded,
                  color: AppTheme.textTertiary,
                  size: 22,
                ),
                onTap: () async {
                  final needRefresh = await Navigator.of(context).push<bool>(
                    MaterialPageRoute(
                      builder: (context) => ActivityDetailScreen(activity: a),
                    ),
                  );
                  if (needRefresh == true && mounted) _load();
                },
              ),
            ),
          );
        },
      ),
    );
  }

  Color _statusColor(int status) {
    switch (status) {
      case 1:
        return AppTheme.statusNotStarted;
      case 2:
        return AppTheme.statusOngoing;
      case 3:
        return AppTheme.statusEnded;
      default:
        return AppTheme.statusEnded;
    }
  }

  String _formatDate(DateTime d) {
    return '${d.month}月${d.day}日 ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }
}
