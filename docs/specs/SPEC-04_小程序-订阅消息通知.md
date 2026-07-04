# 小程序订阅消息通知专项规格（Spec）

> 文档类型：独立专项规格  
> 适用范围：SDM 小程序活动报名与支付链路  
> 状态：已实施（退款通知、活动提醒、报名成功通知已接入）  
> 更新时间：2026-07-03

---

## 0. 实施看板（2026-05-27）

| 模块 | 状态 | 说明 |
|------|------|------|
| 订阅授权上报接口 | ✅ 已完成 | 已实现 `POST /api/v1/notifications/subscribe-consent` |
| 通知配置查询接口 | ✅ 已完成 | 已实现 `GET /api/v1/notifications/config` |
| 通知任务表与幂等去重 | ✅ 已完成 | 已落库 `message_task`，含 `uk_scene_biz_user` 唯一约束 |
| 失败重试机制 | ✅ 已完成 | 指数退避重试，最大重试次数已按确认值配置为 5 |
| 人工重试接口 | ✅ 已完成 | 已实现 `POST /api/v1/notifications/tasks/{task_id}/retry` |
| 活动前30分钟提醒入队 | ✅ 已完成 | 已接入调度器，筛选规则为“审核通过 + 已支付/免支付” |
| 退款结果自动通知入队 | ✅ 已完成 | 已按 `payment_order.refund_status` 自动入队成功/失败通知 |
| 报名成功通知入队 | ✅ 已完成 | 免费报名成功、支付报名确认成功后均可按配置入队 |
| 订阅消息实际发送 | ✅ 已完成 | 已实现微信订阅消息发送服务与任务派发 |
| 租户级通知配置表 | ✅ 已完成 | 已新增 `notification_scene_config`，支持模板 ID、跳转页与消息体模板配置 |
| 活动级通知配置表 | ✅ 已完成 | 已新增 `activity_notification_config`，支持按活动覆盖报名成功通知配置 |
| 报名页订阅授权弹窗 | ✅ 已完成 | 小程序报名页已接入 `wx.requestSubscribeMessage` 并上报授权结果 |
| 退款业务闭环（审核+执行退款+微信退款回调） | ✅ 已完成 | 已覆盖审核拒绝、管理员发起退款、微信回调与结果通知 |
| 管理端退款按钮与审核操作页联动 | ✅ 已完成 | 报名管理页已接入退款操作入口 |

> 备注：本看板用于同步“规格 vs 实现”现状。当前退款通知能力与退款主流程已联通，后续重点转向补单与财务对账。

---

## 1. 背景

当前系统已具备活动报名、支付、审核与订单查询能力，但缺少用户侧微信通知闭环。为提升服务体验与减少客服压力，新增两类订阅消息能力：

1. 退款结果通知：审核拒绝并退款后，及时通知用户退款状态。  
2. 活动提醒通知：活动开始前 30 分钟推送提醒，降低缺席率。
3. 报名成功通知：用户报名成功后，及时通知用户报名结果与活动时间。

---

## 2. 目标

1. 支持小程序订阅消息授权、发送、失败重试与审计。  
2. 退款状态变化时向用户发送通知（成功/失败）。  
3. 活动开始前 30 分钟向已通过且已支付（或无需支付）的参与用户发送提醒。  
4. 报名成功后向已授权用户发送报名结果通知。  
5. 保证并发安全与幂等，避免重复推送。

---

## 3. 官方能力与接口

### 3.1 小程序订阅消息（官方）

- 前端授权：`wx.requestSubscribeMessage`  
- 服务端发送：小程序订阅消息发送接口（需 access_token）

### 3.2 微信支付退款回调（现有支付能力）

- 由微信支付异步回调触发退款结果落库。  
- 本专项在回调后触发“退款结果订阅消息发送任务”。

---

## 4. 业务范围

### 4.1 退款通知

触发条件：
1. 订单退款状态变更为 `退款成功`。  
2. 订单退款状态变更为 `退款失败`（可选，建议开启）。

通知对象：
- 对应报名用户（按 `user_id` 找小程序 `openid`）。

通知时机：
- 状态变更后异步发送，不阻塞主交易流程。

### 4.2 活动前 30 分钟提醒

触发条件：
- 当前时间到达 `activity.start_time - 30 分钟`。

通知对象（建议一期规则）：
1. `review_status=1`（审核通过）  
2. `payment_status in (0,2)`（无需支付或已支付）
3. 用户存在有效 `openid`  
4. 未被拉黑（`user.isblock=0`）

### 4.3 报名成功通知

触发条件：
1. 免费活动报名成功且 `enroll_status=1`。  
2. 付费活动支付确认成功且 `enroll_status=1`。

通知对象：
- 已绑定微信 openid 的报名用户。

配置说明：
- 通过 `notification_scene_config.scene=registration_success` 维护模板 ID、跳转页和消息体模板。
- 小程序报名页在提交前调用 `wx.requestSubscribeMessage` 请求一次性授权，并上报到 `subscribe_consent`。
- 若活动发布时填写了活动级通知配置，则优先读取 `activity_notification_config(scene=registration_success)`；未填写时回退到租户默认配置。

---

## 5. 状态与数据设计

### 5.1 新增通知任务表（建议）`message_task`

字段建议：
- `id`  
- `tenant_id`  
- `scene`：`refund_success` / `refund_failed` / `activity_remind_30m`  
- `biz_id`：业务主键（退款可用 `payment_order_id`，活动提醒可用 `participant_id`）  
- `user_id`  
- `openid`  
- `template_id`  
- `payload_json`  
- `status`：`pending/sending/success/failed/dead`  
- `retry_count`  
- `max_retry`（默认 3）  
- `next_retry_at`  
- `last_error`  
- `sent_at`  
- `create_time` / `update_time`

索引/约束建议：
- 唯一键：`uk_scene_biz_user (tenant_id, scene, biz_id, user_id)`，防止同场景重复入队。

### 5.2 用户订阅授权记录（建议）`subscribe_consent`

字段建议：
- `id`  
- `tenant_id`  
- `user_id`  
- `template_id`  
- `accept_status`：`accept/reject/ban`  
- `accept_time`  
- `source_page`  
- `create_time` / `update_time`

说明：
- 订阅消息是“一次性授权语义”，此表用于运营分析与失败诊断，不作为唯一发送前置条件。

### 5.3 通知场景配置表 `notification_scene_config`

字段说明：
- `tenant_id`
- `scene`：如 `registration_success` / `refund_success` / `refund_failed` / `activity_remind_30m`
- `name`
- `description`
- `enabled`
- `template_id`
- `page_path`
- `payload_template_json`

说明：
- 支持按租户覆盖默认通知配置。
- `payload_template_json` 采用微信订阅消息原始字段结构，字段值可使用 `{{activity_name}}`、`{{start_time}}` 等占位符。

### 5.4 活动级通知配置表 `activity_notification_config`

字段说明：
- `tenant_id`
- `activity_id`
- `scene`
- `enabled`
- `template_id`
- `page_path`
- `payload_template_json`

说明：
- 当前用于 `registration_success` 场景。
- 发送顺序：先查活动级配置，再回退到租户级默认配置。
- 小程序管理员可在“发布活动页”直接填写，也可在“编辑活动 -> 通知配置”页单独维护。

---

## 6. 并发与幂等

### 6.1 入队幂等

1. 所有通知均先“写任务表”再异步发送。  
2. 依赖 `uk_scene_biz_user` 去重，同一业务事件只生成一条有效任务。  
3. 并发入队时若唯一键冲突，视为幂等成功。

### 6.2 发送幂等

1. worker 拉任务时先将 `pending -> sending`（带条件更新），抢占成功者才可发送。  
2. 若发送超时，按重试策略回退到 `pending` 并递增 `retry_count`。  
3. 达到 `max_retry` 后置 `dead`，进入人工处理队列。

### 6.3 退款回调与通知解耦

1. 退款回调只负责状态落库与事件入队，不直接同步调用通知接口。  
2. 回调重复投递时，通知入队依赖唯一键去重，避免重复推送。

---

## 7. 接口设计（草案）

### 7.1 小程序端：订阅授权采集

- `POST /notifications/subscribe-consent`
- 入参：
- `template_id`  
- `accept_status`（`accept/reject/ban`）  
- `source_page`
- 说明：前端调用 `wx.requestSubscribeMessage` 后上报结果。

### 7.2 管理端：通知配置查询

- `GET /notifications/config`
- 返回：
- 退款成功模板 ID  
- 退款失败模板 ID  
- 活动提醒模板 ID  
- 报名成功模板 ID
- 场景配置列表（含模板 ID、页面路径、消息体模板）

### 7.3 管理端：通知场景配置

- `GET /notifications/scene-configs`
- `PUT /notifications/scene-configs/{scene}`
- 说明：管理员可按租户维护报名成功、退款成功/失败、活动提醒的模板配置。

### 7.4 管理端：通知重发（可选）

- `POST /notifications/tasks/{task_id}/retry`
- 仅允许 `failed/dead` 状态重试。

---

## 8. 定时任务设计（活动前 30 分钟）

### 8.1 调度频率

- 建议每 1 分钟扫描一次，窗口：`now ~ now+60s` 对应的 `start_time-30m`。

### 8.2 扫描规则

1. 查询符合窗口的活动。  
2. 查询符合通知条件的参与人。  
3. 按 `scene=activity_remind_30m` 批量幂等入队。

### 8.3 时间与时区

- 服务端统一使用 `Asia/Shanghai`。  
- `start_time` 必须为明确时区语义的本地时间。

---

## 9. 通知模板字段建议

### 9.1 退款成功通知

字段建议：
- 活动名称  
- 退款金额  
- 退款单号/订单号  
- 结果时间  
- 温馨提示（到账时效）

### 9.2 退款失败通知（可选）

字段建议：
- 活动名称  
- 退款状态（失败）  
- 失败原因（友好文案）  
- 联系方式

### 9.3 活动前 30 分钟提醒

字段建议：
- 活动名称  
- 开始时间  
- 活动地点/线上入口  
- 提醒语

---

## 10. 失败处理与补偿

1. access_token 失效：自动刷新后重试。  
2. 用户未订阅或额度限制：记录错误码并按规则终止/降级。  
3. 网络异常：指数退避重试（如 1m/5m/15m）。  
4. `dead` 任务进入管理端“通知失败列表”供人工重发。

---

## 11. 权限与审计

1. 仅具备通知管理权限的管理员可查看失败任务与触发重发。  
2. 记录通知审计日志：
- 场景  
- 模板 ID  
- 用户 ID/openid（脱敏展示）  
- 请求时间  
- 发送结果  
- 错误码/错误信息

---

## 12. 验收标准

1. 退款成功后，用户在可接受延迟内收到订阅消息。  
2. 审核拒绝触发退款失败时（若开启失败通知）可收到失败提醒。  
3. 活动开始前 30 分钟提醒不重复发送（同用户同活动仅一次）。  
4. 并发与回调重放场景下无重复推送。  
5. 管理员可查询失败原因并执行重试。

---

## 13. 测试清单（必须）

### 13.1 后端测试

1. 通知任务唯一键去重测试。  
2. worker 抢占发送并发测试。  
3. 退款回调重复投递仅入队一次。  
4. 活动提醒定时任务窗口扫描准确性测试。  
5. 发送失败重试与 dead 终态测试。

### 13.2 小程序测试

1. `wx.requestSubscribeMessage` 授权结果上报测试。  
2. 用户拒绝订阅时的降级提示测试。  
3. 报名页在存在 `registration_success` 模板配置时可正常拉起订阅授权弹窗。  
4. 活动详情/报名页提醒引导文案展示测试。

---

## 14. 实施顺序建议

1. 数据库迁移：新增通知任务与授权记录表。  
2. 后端能力：入队服务、发送 worker、退款回调联动、30 分钟调度。  
3. 小程序：订阅授权交互与上报。  
4. 管理端：通知配置页、失败任务列表、重发按钮。  
5. 联调与压测：重点验证并发、幂等、重试。

---

## 15. 待确认项

1. 是否一期就开启“退款失败通知”（建议开启）。  
2. 活动提醒是否只给“审核通过+已支付/免支付”人群（建议是）。  
3. 通知失败人工重试最大次数（建议 5 次）。
