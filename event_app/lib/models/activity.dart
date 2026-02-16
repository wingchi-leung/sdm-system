/// 活动模型，与后端 GET /api/v1/activities 返回一致
class Activity {
  final int id;
  final String activityName;
  final DateTime? startTime;
  final DateTime? endTime;
  final int status; // 1-未开始 2-进行中 3-已结束
  final String? tag;
  final DateTime? createTime;
  final DateTime? updateTime;

  Activity({
    required this.id,
    required this.activityName,
    this.startTime,
    this.endTime,
    this.status = 1,
    this.tag,
    this.createTime,
    this.updateTime,
  });

  factory Activity.fromJson(Map<String, dynamic> json) {
    return Activity(
      id: json['id'] as int,
      activityName: json['activity_name'] as String? ?? '',
      startTime: json['start_time'] != null
          ? DateTime.tryParse(json['start_time'].toString())
          : null,
      endTime: json['end_time'] != null
          ? DateTime.tryParse(json['end_time'].toString())
          : null,
      status: json['status'] as int? ?? 1,
      tag: json['tag'] as String?,
      createTime: json['create_time'] != null
          ? DateTime.tryParse(json['create_time'].toString())
          : null,
      updateTime: json['update_time'] != null
          ? DateTime.tryParse(json['update_time'].toString())
          : null,
    );
  }

  String get statusText {
    switch (status) {
      case 1:
        return '未开始';
      case 2:
        return '进行中';
      case 3:
        return '已结束';
      default:
        return '未知';
    }
  }
}

/// 活动列表响应
class ActivityListResponse {
  final List<Activity> items;
  final int total;

  ActivityListResponse({required this.items, required this.total});

  factory ActivityListResponse.fromJson(Map<String, dynamic> json) {
    final list = json['items'] as List<dynamic>? ?? [];
    return ActivityListResponse(
      items: list.map((e) => Activity.fromJson(e as Map<String, dynamic>)).toList(),
      total: json['total'] as int? ?? 0,
    );
  }
}
