import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../theme/app_theme.dart';
import 'user_register_screen.dart';

/// 登录页：默认普通用户（手机+密码），可切换到管理员（用户名+密码）
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _accountController = TextEditingController();
  final _passwordController = TextEditingController();
  final _api = ApiService();
  final _auth = AuthService.instance;

  bool _submitting = false;
  bool _isAdminMode = false;
  bool _obscurePassword = true;
  String? _error;

  @override
  void dispose() {
    _accountController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _toggleMode() {
    setState(() {
      _isAdminMode = !_isAdminMode;
      _accountController.clear();
      _passwordController.clear();
      _error = null;
    });
  }

  Future<void> _submit() async {
    _error = null;
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);

    try {
      if (_isAdminMode) {
        final res = await _api.adminLogin(
          _accountController.text.trim(),
          _passwordController.text.trim(),
        );
        final token = res['access_token'] as String?;
        if (token != null) {
          await _auth.saveAdminToken(token);
        }
      } else {
        final res = await _api.userLogin(
          _accountController.text.trim(),
          _passwordController.text.trim(),
        );
        final token = res['access_token'] as String?;
        if (token != null) {
          await _auth.saveUserToken(
            accessToken: token,
            userId: res['user_id'] as int,
            userName: res['user_name'] as String? ?? '',
          );
        }
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('登录成功'), backgroundColor: Colors.green),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _submitting = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: Text(_isAdminMode ? '管理员登录' : '登录'),
        backgroundColor: AppTheme.surface,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 32),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 16),
              // 顶部图标
              Icon(
                _isAdminMode
                    ? Icons.admin_panel_settings_rounded
                    : Icons.person_rounded,
                size: 64,
                color: AppTheme.primary,
              ),
              const SizedBox(height: 12),
              Text(
                _isAdminMode ? '管理员登录' : '欢迎回来',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 4),
              Text(
                _isAdminMode ? '请输入管理员账号和密码' : '使用手机号和密码登录',
                textAlign: TextAlign.center,
                style: Theme.of(context)
                    .textTheme
                    .bodySmall
                    ?.copyWith(color: AppTheme.textSecondary),
              ),
              const SizedBox(height: 32),

              // 安全提示
              if (_api.isUnsafeBaseUrl)
                Container(
                  margin: const EdgeInsets.only(bottom: 16),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFF9500).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                        color: const Color(0xFFFF9500).withOpacity(0.3)),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.warning_amber_rounded,
                          color: Colors.orange.shade800, size: 22),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '当前使用非加密连接，请仅在可信网络下使用。',
                          style: TextStyle(
                              color: Colors.orange.shade900, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),

              // 账号输入
              TextFormField(
                controller: _accountController,
                decoration: InputDecoration(
                  labelText: _isAdminMode ? '用户名' : '手机号',
                  hintText: _isAdminMode ? '请输入管理员账号' : '请输入手机号',
                  prefixIcon: Icon(_isAdminMode
                      ? Icons.person_outline_rounded
                      : Icons.phone_outlined),
                ),
                keyboardType:
                    _isAdminMode ? TextInputType.text : TextInputType.phone,
                validator: (v) {
                  if (v == null || v.trim().isEmpty) {
                    return _isAdminMode ? '请输入用户名' : '请输入手机号';
                  }
                  return null;
                },
                textInputAction: TextInputAction.next,
              ),
              const SizedBox(height: 16),

              // 密码输入
              TextFormField(
                controller: _passwordController,
                obscureText: _obscurePassword,
                decoration: InputDecoration(
                  labelText: '密码',
                  hintText: '请输入密码',
                  prefixIcon: const Icon(Icons.lock_outline_rounded),
                  suffixIcon: IconButton(
                    icon: Icon(
                      _obscurePassword
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                      size: 20,
                      color: AppTheme.textSecondary,
                    ),
                    onPressed: () =>
                        setState(() => _obscurePassword = !_obscurePassword),
                  ),
                ),
                validator: (v) {
                  if (v == null || v.isEmpty) return '请输入密码';
                  return null;
                },
                onFieldSubmitted: (_) => _submit(),
              ),

              // 错误提示
              if (_error != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFF3B30).withOpacity(0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                        color: const Color(0xFFFF3B30).withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.error_outline_rounded,
                          color: Theme.of(context).colorScheme.error,
                          size: 22),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                              fontSize: 14),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 28),

              // 登录按钮
              FilledButton(
                onPressed: _submitting ? null : _submit,
                style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  textStyle: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w600),
                ),
                child: _submitting
                    ? const SizedBox(
                        height: 24,
                        width: 24,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('登录'),
              ),
              const SizedBox(height: 16),

              // 底部操作区
              if (!_isAdminMode) ...[
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      '还没有账号？',
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: AppTheme.textSecondary),
                    ),
                    TextButton(
                      onPressed: () async {
                        final ok =
                            await Navigator.of(context).push<bool>(
                          MaterialPageRoute(
                            builder: (context) => const UserRegisterScreen(),
                          ),
                        );
                        if (ok == true && mounted) {
                          Navigator.of(context).pop(true);
                        }
                      },
                      style: TextButton.styleFrom(
                        foregroundColor: AppTheme.primary,
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                      ),
                      child: const Text('立即注册'),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 8),

              // 切换登录模式
              Center(
                child: TextButton(
                  onPressed: _toggleMode,
                  style: TextButton.styleFrom(
                    foregroundColor: AppTheme.textSecondary,
                  ),
                  child: Text(_isAdminMode ? '← 普通用户登录' : '管理员登录 →'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
