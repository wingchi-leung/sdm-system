import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _keyToken = 'access_token';
const _keyRole = 'user_role';
const _keyUserId = 'user_id';
const _keyUserName = 'user_name';

/// 统一登录状态管理：支持 admin（管理员）和 user（普通用户）两种角色
class AuthService extends ChangeNotifier {
  AuthService._();
  static final AuthService instance = AuthService._();

  String? _token;
  String? _role;
  int? _userId;
  String? _userName;
  bool _loaded = false;

  String? get token => _token;
  String? get role => _role;
  int? get userId => _userId;
  String? get userName => _userName;
  bool get isLoaded => _loaded;

  bool get isLoggedIn => _token != null && _token!.isNotEmpty;
  bool get isAdmin => isLoggedIn && _role == 'admin';
  bool get isUser => isLoggedIn && _role == 'user';

  Future<void> loadToken() async {
    if (_loaded) return;
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_keyToken);
    _role = prefs.getString(_keyRole);
    _userId = prefs.getInt(_keyUserId);
    _userName = prefs.getString(_keyUserName);
    _loaded = true;
    notifyListeners();
  }

  /// 管理员登录后保存
  Future<void> saveAdminToken(String accessToken) async {
    _token = accessToken;
    _role = 'admin';
    _userId = null;
    _userName = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyToken, accessToken);
    await prefs.setString(_keyRole, 'admin');
    await prefs.remove(_keyUserId);
    await prefs.remove(_keyUserName);
    notifyListeners();
  }

  /// 普通用户登录后保存
  Future<void> saveUserToken({
    required String accessToken,
    required int userId,
    required String userName,
  }) async {
    _token = accessToken;
    _role = 'user';
    _userId = userId;
    _userName = userName;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyToken, accessToken);
    await prefs.setString(_keyRole, 'user');
    await prefs.setInt(_keyUserId, userId);
    await prefs.setString(_keyUserName, userName);
    notifyListeners();
  }

  /// 退出登录
  Future<void> logout() async {
    _token = null;
    _role = null;
    _userId = null;
    _userName = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyToken);
    await prefs.remove(_keyRole);
    await prefs.remove(_keyUserId);
    await prefs.remove(_keyUserName);
    notifyListeners();
  }
}
