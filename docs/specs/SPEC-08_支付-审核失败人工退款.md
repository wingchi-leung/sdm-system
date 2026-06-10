# 支付后审核失败人工退款专项规格（Spec）

> 文档类型：独立专项规格  
> 适用范围：小程序活动报名（先支付后审核）  
> 状态：可开发版（待实施）  
> 更新时间：2026-05-28

---

## 0. 实施看板（2026-05-28）

| 模块 | 状态 | 说明 |
|------|------|------|
| 报名审核状态字段 | ✅ 已有字段 | `activity_participants.review_status/review_reason/reviewed_by/reviewed_at` 已在库结构中 |
| 退款状态字段 | ✅ 已有字段 | `payment_order.refund_status/refund_amount/...` 已在库结构中 |
| 退款主流程接口（管理员发起退款） | ⏳ 未开始 | 本文定义接口与事务要求 |
| 报名审核接口（approve/reject） | ⏳ 未开始 | 拒绝后需进入待退款状态 |
| 微信退款申请调用 | ⏳ 未开始 | 需要接入 APIv3 退款能力 |
| 微信退款回调处理 | ⏳ 未开始 | 需要幂等更新退款状态 |
| 管理端退款按钮 | ⏳ 未开始 | 审核拒绝且已支付时可操作 |
| 退款结果通知 | ✅ 已完成 | 已有订阅消息任务队列与发送能力，可复用 |

---

## 1. 背景与目标

当前链路是“先支付再审核”。当审核不通过时，需要支持管理员可控、可追踪、可重试的退款流程，避免重复退款与财务对账风险。

本专项目标：
1. 审核拒绝后进入待退款，由管理员手工点击退款。  
2. 退款接口具备并发安全与幂等能力。  
3. 微信回调重复投递不造成重复状态流转。  
4. 退款结果与通知系统联动。  
5. 全链路有审计可追溯。

---

## 2. 业务规则

1. 活动报名策略：先支付后审核。  
2. 审核通过：报名进入可参与状态。  
3. 审核拒绝：
- 未支付：直接拒绝完成。  
- 已支付：标记“待退款”，由管理员执行退款。  
4. 退款操作必须填写原因。  
5. 一期仅支持全额退款（`refund_amount = actual_fee`）。

---

## 3. 状态模型

### 3.1 报名审核状态（`activity_participants.review_status`）

- `0`：待审核  
- `1`：审核通过  
- `2`：审核拒绝

### 3.2 支付状态（`activity_participants.payment_status`，沿用）

- `0`：无需支付  
- `1`：待支付  
- `2`：已支付

### 3.3 退款状态（`payment_order.refund_status`）

- `0`：无退款  
- `1`：待退款  
- `2`：退款处理中  
- `3`：退款成功  
- `4`：退款失败（可重试）  
- `5`：退款关闭（人工关闭终态）

### 3.4 核心流转

1. 支付成功后：`review_status=0, refund_status=0`  
2. 审核拒绝且已支付：`review_status=2, refund_status=1`  
3. 管理员点退款：`refund_status=2`  
4. 微信回调成功：`refund_status=3`  
5. 微信回调失败：`refund_status=4`  
6. 多次失败人工关闭：`refund_status=5`

---

## 4. 并发与幂等（强制）

### 4.1 并发控制

1. `POST /payments/{order_no}/refund` 必须在事务内锁定订单：`SELECT ... FOR UPDATE`。  
2. 锁内再次校验当前状态是否可退款：
- 订单支付成功（`status=1`）
- 退款状态为 `1` 或 `4`
3. 不满足条件时返回可读错误，不调用微信退款。

### 4.2 接口幂等

1. 发起退款接口必须传 `Idempotency-Key`（Header）。  
2. 服务端保存幂等记录（推荐 24h），同 key 重放返回首次结果。  
3. 客户端超时重试必须复用同 key。

### 4.3 微信侧幂等

1. 每次退款生成唯一 `out_refund_no`。  
2. 建议规则：`RF{tenant_id}{payment_order_id}{seq}`。  
3. 回调以 `out_refund_no` 作为幂等键，重复回调不重复记账。

---

## 5. 数据模型（一期）

> 现有字段已支持基础状态管理，建议补充退款流水表，避免回调和审计信息挤在订单主表。

### 5.1 已有字段（已在库）

- `activity_participants.review_status/review_reason/reviewed_by/reviewed_at`  
- `payment_order.refund_status/refund_amount/refund_apply_by/refund_apply_at/refund_success_at/refund_fail_reason`

### 5.2 新增表（建议，必须）`payment_refund`

字段建议：
- `id`  
- `tenant_id`  
- `payment_order_id`  
- `participant_id`  
- `out_refund_no`（唯一）  
- `wechat_refund_id`  
- `amount`  
- `status`（`pending/processing/success/failed/closed`）  
- `idempotency_key`  
- `operator_id`  
- `reason`  
- `request_raw`  
- `callback_raw`  
- `fail_reason`  
- `create_time` / `update_time`

唯一约束建议：
- `uk_refund_out_refund_no (tenant_id, out_refund_no)`

---

## 6. 接口规格

### 6.1 报名审核

- `POST /participants/{participant_id}/review`
- 入参：
- `action`: `approve | reject`
- `reason`: `reject` 时必填

业务行为：
1. `approve`：`review_status=1`  
2. `reject` 且 `payment_status=2`：`review_status=2 + refund_status=1`  
3. `reject` 且未支付：仅 `review_status=2`

权限：
- 仅活动管理员/具备审核权限角色可操作。

### 6.2 管理员发起退款

- `POST /payments/{order_no}/refund`
- Header：`Idempotency-Key`（必填）
- Body：
- `reason`（必填）

服务端流程（强制顺序）：
1. 校验权限、参数。  
2. 事务内锁订单。  
3. 状态校验。  
4. 创建/复用 `payment_refund` 记录。  
5. 调用微信退款 API。  
6. 更新 `payment_order.refund_status=2`。  
7. 返回“退款处理中”。

### 6.3 查询退款状态

- `GET /payments/{order_no}/refund`
- 返回：
- 退款状态
- 失败原因
- 操作人
- 申请/完成时间
- `out_refund_no`

### 6.4 微信退款回调

- `POST /payments/refund/notify`

处理要求：
1. 验签 + 解密。  
2. 以 `out_refund_no` 锁定退款记录并幂等处理。  
3. 更新 `payment_refund.status` 与 `payment_order.refund_status`：
- 成功 -> `3`
- 失败 -> `4`
4. 成功 ACK，避免微信重复轰炸回调。

---

## 7. 管理端交互

1. 报名审核列表新增审核状态列。  
2. 审核拒绝且已支付时展示 `待退款` 标签。  
3. 显示 `执行退款` 按钮：
- 二次确认弹窗（订单号/金额/风险提示）
- 退款原因必填
- 提交中禁用按钮防重复点击
4. 支持查看退款历史（状态、失败原因、操作人）。

---

## 8. 与通知系统联动

1. 退款成功（`refund_status=3`）自动触发退款成功通知。  
2. 退款失败（`refund_status=4`）自动触发退款失败通知（若模板已配置）。  
3. 通知发送失败使用现有队列重试机制（最大 5 次）。

---

## 9. 失败处理与补偿

1. 退款申请接口超时：
- 保持 `refund_status=2`，定时任务轮询查询微信退款结果。  
2. 退款失败：
- 置 `refund_status=4`，管理员可重试。  
3. 重试上限（退款主流程）建议：3 次。超过后可人工关闭为 `5`。

---

## 10. 安全与审计

1. 退款相关接口仅管理员可用。  
2. 审计日志必须记录：
- 操作人
- 时间
- 订单号
- 金额
- 原因
- 状态前后变化
- 请求 IP
3. 日志中不得输出完整 openid/交易敏感信息。

---

## 11. 验收标准

1. 审核拒绝后已支付订单可进入待退款。  
2. 并发点击退款仅产生一次有效退款申请。  
3. 相同 `Idempotency-Key` 重放不重复申请微信退款。  
4. 退款回调重复投递不重复流转状态。  
5. 退款结果可在管理端查看并可追溯。  
6. 退款结果通知可自动发送并遵循 5 次重试上限。

---

## 12. 测试清单（必须）

### 12.1 后端测试

1. 审核拒绝 + 已支付 -> `refund_status=1`。  
2. 发起退款并发测试（双击/多管理员并发）。  
3. `Idempotency-Key` 重放测试。  
4. 微信回调重复投递幂等测试。  
5. 退款失败重试与关闭终态测试。  
6. 退款状态变化后自动通知入队测试。

### 12.2 前端测试

1. 退款按钮显隐条件正确。  
2. 按钮防重复点击。  
3. 退款失败提示与重试路径可用。

---

## 13. 实施顺序

1. 新增 `payment_refund` 表与必要索引。  
2. 实现审核接口与退款状态切换。  
3. 实现退款申请接口（并发+幂等）。  
4. 接入微信退款回调。  
5. 管理端接入审核与退款按钮。  
6. 联调与压测。

---

## 14. 待确认项

1. 退款失败后是否允许跨天自动重试（建议允许）。  
2. 人工关闭退款时是否必须填写关闭原因（建议必须）。  
3. 是否支持部分退款（二期再做）。
