import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _keyToken = 'admin_access_token';

/// 管理员登录状态：未登录为普通用户，登录后为管理员（可见发布活动等）
class AuthService extends ChangeNotifier {
  AuthService._();
  static final AuthService instance = AuthService._();

  String? _token;
  bool _loaded = false;

  String? get token => _token;
  bool get isAdmin => _token != null && _token!.isNotEmpty;
  bool get isLoaded => _loaded;

  /// 启动时从本地加载 token
  Future<void> loadToken() async {
    if (_loaded) return;
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_keyToken);
    _loaded = true;
    notifyListeners();
  }

  /// 登录成功后保存 token
  Future<void> saveToken(String accessToken) async {
    _token = accessToken;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyToken, accessToken);
    notifyListeners();
  }

  /// 退出：清除 token
  Future<void> logout() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyToken);
    notifyListeners();
  }
}
