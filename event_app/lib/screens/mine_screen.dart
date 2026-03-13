import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import 'activity_list_screen.dart';
import 'create_activity_screen.dart';
import 'login_screen.dart';

/// 「我的」Tab：未登录显示引导，普通用户显示个人信息，管理员显示管理功能
class MineScreen extends StatefulWidget {
  const MineScreen({super.key});

  @override
  State<MineScreen> createState() => _MineScreenState();
}

class _MineScreenState extends State<MineScreen> {
  final AuthService _auth = AuthService.instance;

  @override
  void initState() {
    super.initState();
    _auth.loadToken().then((_) => setState(() {}));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _auth,
      builder: (context, _) {
        if (_auth.isAdmin) return const _AdminMineContent();
        if (_auth.isUser) return const _UserMineContent();
        return const _GuestMineContent();
      },
    );
  }
}

// ─── 管理员 ───

class _AdminMineContent extends StatelessWidget {
  const _AdminMineContent();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('我的'), backgroundColor: AppTheme.surface),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // 头像区
          _ProfileHeader(
            icon: Icons.admin_panel_settings_rounded,
            title: '管理员',
            subtitle: '拥有活动发布与管理权限',
          ),
          const SizedBox(height: 20),

          _SectionCard(children: [
            _ListTile(
              icon: Icons.add_circle_outline_rounded,
              title: '发布活动',
              subtitle: '创建新的活动',
              onTap: () async {
                final ok = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(builder: (_) => const CreateActivityScreen()),
                );
                if (ok == true && context.mounted) {}
              },
            ),
            const Divider(height: 1),
            _ListTile(
              icon: Icons.list_rounded,
              title: '查看活动',
              subtitle: '管理全部活动',
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ActivityListScreen()),
                );
              },
            ),
          ]),
          const SizedBox(height: 20),

          _SectionCard(children: [
            _ListTile(
              icon: Icons.logout_rounded,
              title: '退出登录',
              onTap: () => _logout(context),
              titleColor: AppTheme.textSecondary,
            ),
          ]),
        ],
      ),
    );
  }
}

// ─── 普通用户 ───

class _UserMineContent extends StatefulWidget {
  const _UserMineContent();

  @override
  State<_UserMineContent> createState() => _UserMineContentState();
}

class _UserMineContentState extends State<_UserMineContent> {
  final _auth = AuthService.instance;
  final _api = ApiService();
  Map<String, dynamic>? _profile;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    if (_auth.token == null) return;
    setState(() => _loading = true);
    try {
      final data = await _api.getUserProfile(_auth.token!);
      if (!mounted) return;
      setState(() {
        _profile = data;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final userName = _profile?['name'] as String? ?? _auth.userName ?? '用户';
    final phone = _profile?['phone'] as String? ?? '';
    final email = _profile?['email'] as String? ?? '';

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('我的'), backgroundColor: AppTheme.surface),
      body: _loading
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primary))
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
              children: [
                // 头像区
                _ProfileHeader(
                  icon: Icons.person_rounded,
                  title: userName,
                  subtitle: phone.isNotEmpty ? phone : '普通用户',
                ),
                const SizedBox(height: 20),

                // 个人信息卡片
                _SectionCard(children: [
                  _InfoTile(label: '姓名', value: userName),
                  const Divider(height: 1),
                  _InfoTile(label: '手机', value: phone.isNotEmpty ? phone : '-'),
                  if (email.isNotEmpty) ...[
                    const Divider(height: 1),
                    _InfoTile(label: '邮箱', value: email),
                  ],
                ]),
                const SizedBox(height: 20),

                _SectionCard(children: [
                  _ListTile(
                    icon: Icons.logout_rounded,
                    title: '退出登录',
                    onTap: () => _logout(context),
                    titleColor: AppTheme.textSecondary,
                  ),
                ]),
              ],
            ),
    );
  }
}

// ─── 未登录 ───

class _GuestMineContent extends StatelessWidget {
  const _GuestMineContent();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('我的'), backgroundColor: AppTheme.surface),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.person_outline_rounded, size: 80, color: AppTheme.textTertiary),
              const SizedBox(height: 24),
              Text(
                '登录后使用更多功能',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(color: AppTheme.textSecondary),
              ),
              const SizedBox(height: 8),
              Text(
                '登录后可以更方便地报名活动、查看记录',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppTheme.textTertiary),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: () async {
                  await Navigator.of(context).push<bool>(
                    MaterialPageRoute(builder: (_) => const LoginScreen()),
                  );
                },
                icon: const Icon(Icons.login_rounded, size: 20),
                label: const Text('登录'),
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── 公共退出方法 ───

Future<void> _logout(BuildContext context) async {
  await AuthService.instance.logout();
  if (context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('已退出'), behavior: SnackBarBehavior.floating),
    );
  }
}

// ─── 公共组件 ───

class _ProfileHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _ProfileHeader({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppTheme.primary.withOpacity(0.12),
              borderRadius: BorderRadius.circular(28),
            ),
            child: Icon(icon, size: 30, color: AppTheme.primary),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppTheme.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoTile extends StatelessWidget {
  final String label;
  final String value;

  const _InfoTile({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          SizedBox(
            width: 64,
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppTheme.textSecondary),
            ),
          ),
          Expanded(
            child: Text(value, style: Theme.of(context).textTheme.bodyMedium),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final List<Widget> children;
  const _SectionCard({required this.children});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTheme.surface,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: Column(children: children),
    );
  }
}

class _ListTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final Color? titleColor;

  const _ListTile({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.onTap,
    this.titleColor,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 24, color: titleColor ?? AppTheme.primary),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context)
                        .textTheme
                        .titleSmall
                        ?.copyWith(color: titleColor ?? AppTheme.textPrimary),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppTheme.textSecondary),
                    ),
                  ],
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, size: 22, color: AppTheme.textTertiary),
          ],
        ),
      ),
    );
  }
}
