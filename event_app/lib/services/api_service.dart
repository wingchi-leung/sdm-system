import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/activity.dart';

/// API 基础地址：真机请改为电脑局域网 IP，模拟器可用 10.0.2.2:8000 (Android) 或 localhost (iOS)
const String baseUrl = 'http://localhost:8000/api/v1';

class ApiService {
  static final ApiService _instance = ApiService._();
  factory ApiService() => _instance;

  ApiService._();

  String get base => baseUrl;

  bool get isUnsafeBaseUrl {
    try {
      final u = Uri.parse(baseUrl);
      if (u.scheme != 'http') return false;
      final h = u.host.toLowerCase();
      return h != 'localhost' && h != '127.0.0.1' && h != '10.0.2.2';
    } catch (_) {
      return false;
    }
  }

  // ─── 活动相关 ───

  Future<ActivityListResponse> getActivities({
    int skip = 0,
    int limit = 100,
    int? status,
  }) async {
    var uri = Uri.parse('$baseUrl/activities?skip=$skip&limit=$limit');
    if (status != null) {
      uri = Uri.parse(
          '$baseUrl/activities?skip=$skip&limit=$limit&status=$status');
    }
    final resp = await http.get(uri);
    if (resp.statusCode != 200) {
      throw ApiException(resp.statusCode, resp.body);
    }
    return ActivityListResponse.fromJson(
      jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>,
    );
  }

  Future<ActivityListResponse> getEnrollableActivities({
    int skip = 0,
    int limit = 100,
  }) async {
    final res = await getActivities(skip: skip, limit: limit);
    final enrollable =
        res.items.where((a) => a.status == 1 || a.status == 2).toList();
    return ActivityListResponse(items: enrollable, total: enrollable.length);
  }

  Future<ActivityListResponse> getUnstartedActivities() async {
    final uri = Uri.parse('$baseUrl/activities/unstarted/');
    final resp = await http.get(uri);
    if (resp.statusCode != 200) {
      throw ApiException(resp.statusCode, resp.body);
    }
    return ActivityListResponse.fromJson(
      jsonDecode(utf8.decode(resp.bodyBytes)) as Map<String, dynamic>,
    );
  }

  Future<Map<String, dynamic>> createActivity({
    required String activityName,
    required String tag,
    required DateTime startTime,
    List<Map<String, dynamic>>? participants,
    String? accessToken,
  }) async {
    final uri = Uri.parse('$baseUrl/activities/');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (accessToken != null && accessToken.isNotEmpty) {
      headers['Authorization'] = 'Bearer $accessToken';
    }
    final body = {
      'activity_name': activityName,
      'tag': tag.isEmpty ? '' : tag,
      'start_time': startTime.toIso8601String(),
      'participants': participants ?? [],
    };
    final resp = await http.post(uri, headers: headers, body: jsonEncode(body));
    return _parseResponse(resp);
  }

  // ─── 认证相关 ───

  /// 管理员登录
  Future<Map<String, dynamic>> adminLogin(
      String username, String password) async {
    final uri = Uri.parse('$baseUrl/auth/login');
    final resp = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': username, 'password': password}),
    );
    return _parseResponse(resp);
  }

  /// 普通用户登录：手机 + 密码
  Future<Map<String, dynamic>> userLogin(String phone, String password) async {
    final uri = Uri.parse('$baseUrl/auth/user-login');
    final resp = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'phone': phone, 'password': password}),
    );
    return _parseResponse(resp);
  }

  // ─── 用户相关 ───

  /// 用户注册：姓名、手机、密码必填，邮箱选填
  Future<Map<String, dynamic>> registerUser({
    required String name,
    required String phone,
    required String password,
    String? email,
  }) async {
    final uri = Uri.parse('$baseUrl/users/register');
    final body = <String, dynamic>{
      'name': name,
      'phone': phone,
      'password': password,
    };
    if (email != null && email.isNotEmpty) {
      body['email'] = email;
    }
    final resp = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(body),
    );
    return _parseResponse(resp);
  }

  /// 获取当前用户个人信息（需要 user token）
  Future<Map<String, dynamic>> getUserProfile(String accessToken) async {
    final uri = Uri.parse('$baseUrl/users/me');
    final resp = await http.get(uri, headers: {
      'Authorization': 'Bearer $accessToken',
    });
    return _parseResponse(resp);
  }

  // ─── 报名相关 ───

  Future<Map<String, dynamic>> registerParticipant({
    required int activityId,
    required String participantName,
    required String phone,
    String? identityNumber,
    String? accessToken,
  }) async {
    final uri = Uri.parse('$baseUrl/participants/');
    final body = <String, dynamic>{
      'activity_id': activityId,
      'participant_name': participantName,
      'phone': phone,
      if (identityNumber != null && identityNumber.isNotEmpty)
        'identity_number': identityNumber,
    };
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (accessToken != null && accessToken.isNotEmpty) {
      headers['Authorization'] = 'Bearer $accessToken';
    }
    final resp = await http.post(uri, headers: headers, body: jsonEncode(body));
    return _parseResponse(resp);
  }

  // ─── 工具方法 ───

  Map<String, dynamic> _parseResponse(http.Response resp) {
    final data = jsonDecode(utf8.decode(resp.bodyBytes));
    if (resp.statusCode >= 200 && resp.statusCode < 300) {
      return data as Map<String, dynamic>;
    }
    final detail = data is Map ? (data['detail'] ?? resp.body) : resp.body;
    throw ApiException(resp.statusCode, detail.toString());
  }
}

class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';
}
