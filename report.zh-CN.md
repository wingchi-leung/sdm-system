# 安全审查报告：sdm-system

## 扫描范围

本次仓库级安全扫描聚焦于 `backend` 与 `miniprogram` 目录；`frontend`、`docs` 与 `event_app` 仅在与可达安全路径直接相关时才纳入分析。

- 扫描模式：仓库扫描
- 目标类型：`git_worktree`
- 目标 ID：`target_sha256_9ccf268bb8e107b1312a014d4714d8835926d177c6ac660be5c062cad9eddeb1`
- 修订版本：`760637645d56a8a2ae11722b6fcdf506d6f919ce`
- 快照摘要：`codex-security-snapshot/v1:sha256:af1c821aac0e81f5fa6e75763b8b3ff2ebce97be08731ed531d03be021d769e4`
- 盘点策略：仓库级
- 包含路径：`.`
- 排除路径：无
- 运行/测试状态：仅执行静态源码审查，未运行运行时利用 PoC 或攻击脚本
- 已审阅工件：`artifacts/01_context/threat_model.md`、`artifacts/02_discovery/finding_discovery_report.md`、`artifacts/03_coverage/repository_coverage_ledger.md`
- 扫描上下文：威胁模型在本次扫描过程中生成，发现阶段覆盖了全部 222 行在 scope 内的工作清单

限制与排除说明：

- 仍有部分延后项未完全关闭，主要集中在部分客户端信任假设，以及 1 个内容审核回调路由问题，尚需补充可达性证明
- 本次扫描未执行运行时 PoC，也未验证部署环境中的反向代理配置
- `frontend/`：根据用户要求默认排除，除非与可达安全路径直接相关
- `docs/`：默认不作为代码路径分析对象
- `event_app/`：根据用户要求，本次不纳入扫描

### 扫描摘要

| 字段 | 值 |
| --- | --- |
| 可报告发现数 | 10 |
| 严重性分布 | high: 5, medium: 5 |
| 置信度分布 | high: 6, medium: 4 |
| 覆盖状态 | partial |
| 验证方式 | 基于静态源码追踪，并为候选项保留候选级验证与攻击路径凭证 |

规范化产物：`scan-manifest.json`、`findings.json`、`coverage.json`。本报告是基于这些文件的确定性投影结果。

## 威胁模型

该仓库暴露了多租户后端 API 与微信小程序，安全关键路径主要集中在认证、RBAC、租户隔离、支付、社区内容、上传能力，以及与微信相关的外部集成。

### 关键资产

- 按租户隔离的用户与活动数据
- 支付与退款状态
- 社区内容与成员关系控制
- 管理员账号凭据与角色分配能力

### 信任边界

- 未认证 HTTP 与微信入口
- 基于 JWT 的租户/用户请求
- 支付与退款 webhook 回调
- 小程序本地持久化认证状态
- 社区用户生成内容

### 攻击者能力假设

- 未认证远程调用者
- 已认证低权限用户
- 恶意租户成员或管理员
- 可在本地执行初始化脚本的运维人员或自动化流程

### 安全目标

- 保持租户隔离
- 强制执行稳健的凭据与管理员初始化控制
- 确保支付状态变更与本地存储的业务上下文绑定
- 限制外部内容持久化与敏感状态变更

### 前提假设

- 即使小程序页面做了本地权限控制，真正权威的权限校验仍应在服务端
- 仅校验微信回调来源不足以保证安全，还需要校验业务字段绑定关系

## 安全发现

| 编号 | 标题 | 严重性 | 置信度 |
| --- | --- | --- | --- |
| 1 | 退款幂等依赖易竞争的查询逻辑，缺少数据库唯一约束兜底 | high | medium |
| 2 | 非成功支付回调在未做绑定校验时即可下调本地订单状态 | high | medium |
| 3 | 初始化管理员脚本会把超级管理员密码重置为仓库内硬编码值 | high | high |
| 4 | 角色分配会把目标用户密码重置为可预测默认值，且该密码可直接登录 | high | high |
| 5 | 退款回调在未校验业务字段绑定的情况下修改本地退款与订单状态 | high | medium |
| 6 | 自助清空资料字段接口可将 `User` 上的敏感字段置空 | medium | high |
| 7 | 社区页面会持久化并渲染攻击者控制的外部媒体 URL | medium | medium |
| 8 | 社区邀请码在过期时间之后仍可继续使用 | medium | high |
| 9 | 可伪造的 `X-Forwarded-Proto` 可绕过仅 HTTPS 登录限制 | medium | high |
| 10 | 可伪造的 `X-Forwarded-For` 会削弱登录限流效果 | medium | high |

### 置信度说明

| 标签 | 含义 |
| --- | --- |
| high | 直接代码证据充分，未发现实质性阻断因素 |
| medium | 代码证据支持该问题存在，但仍有部分运行时或可达性证明缺口 |
| low | 证据不足，仅适合作为后续跟进项保留 |

### [1] 退款幂等依赖易竞争的查询逻辑，缺少数据库唯一约束兜底

- 严重性：high
- 置信度：medium
- 类别：并发/幂等性缺陷
- CWE：`CWE-362`, `CWE-703`
- 影响位置：`backend/app/crud/crud_refund.py:34-45`、`backend/app/crud/crud_refund.py:48-77`、`backend/app/schemas.py:306-324`、`backend/sql/table.sql:192-214`

摘要：
同一订单与同一幂等键组合下，系统可能创建多条退款记录。并发重试时，多个请求都可能绕过“先查后写”的最佳努力校验，造成重复退款记录，进一步污染下游退款处理与资金状态。

验证结论：
`crud_refund.py` 存在先查询再插入的流程；`schemas.py` 与 `table.sql` 中未看到与该幂等元组对应的唯一约束。

修复建议：
为 `(tenant_id, payment_order_id, idempotency_key)` 增加数据库唯一约束，并将重复键冲突视为幂等成功处理。

### [2] 非成功支付回调在未做绑定校验时即可下调本地订单状态

- 严重性：high
- 置信度：medium
- 类别：Webhook 完整性缺陷
- CWE：`CWE-345`, `CWE-354`
- 影响位置：`backend/app/api/v1/endpoints/payments.py:320-405`、`backend/app/api/v1/endpoints/payments.py:383-389`、`backend/app/services/wechat_pay.py:202-211`

摘要：
支付成功分支做了业务字段绑定校验，但支付失败分支没有应用同样的校验逻辑。这样会导致一个“来源合法但业务字段不匹配”的回调，把本地订单错误地置为失败状态。

验证结论：
`payments.py` 明确区分了成功路径与失败路径，失败路径直接提交状态变更；`wechat_pay.py` 中的 `decrypt_callback` 只负责验签/解密，没有补充业务绑定校验。

修复建议：
在非成功支付回调分支中，同样执行 `_validate_notify_resource()` 级别的业务字段校验，再允许修改本地订单状态。

### [3] 初始化管理员脚本会把超级管理员密码重置为仓库内硬编码值

- 严重性：high
- 置信度：high
- 类别：硬编码高权限凭据
- CWE：`CWE-798`, `CWE-259`
- 影响位置：`backend/create_admin.py:103-139`、`backend/create_admin.py:18-24`、`backend/create_admin.py:73-84`、`backend/app/crud/crud_credential.py:155-181`

摘要：
每次重新执行初始化脚本时，默认超级管理员账号都会被重置为仓库中固定的已知密码。这意味着只要有人能在生产或准生产环境执行该脚本，就会重新打开一个可预测的高权限登录入口。

验证结论：
`create_admin.py` 里存在硬编码常量，并且每次运行都会无条件刷新凭据；真正的密码落库逻辑位于 `create_password_credential`。

修复建议：
移除仓库内硬编码的初始化密码，改为部署时注入一次性密钥或采用一次性初始化流程；同时阻止重复执行时静默覆盖现有管理员凭据。

### [4] 角色分配会把目标用户密码重置为可预测默认值，且该密码可直接登录

- 严重性：high
- 置信度：high
- 类别：可预测凭据
- CWE：`CWE-521`, `CWE-798`
- 影响位置：`backend/app/api/v1/endpoints/roles.py:42-81`、`backend/app/api/v1/endpoints/roles.py:64-71`、`backend/app/crud/crud_credential.py:155-181`、`backend/app/crud/crud_credential.py:39-50`、`backend/app/api/v1/endpoints/auth.py:95-139`

摘要：
当管理员给用户分配角色时，系统会为目标手机号创建或重置一个固定默认密码，例如 `123456`。而登录流程并不会强制阻断“必须改密”的账户，只是把它作为提示信息返回，因此该默认密码在改密前可直接用于登录。

验证结论：
`roles.py`、`crud_credential.py` 与 `auth.py` 形成了完整证据链：固定默认密码被创建，正常认证链路可接受该密码，而 `must_reset_password` 没有在登录前被强制执行。

修复建议：
停止在角色分配时生成可预测默认密码；或者强制走重置流程，并在认证阶段严格拦截未完成改密的账号。

### [5] 退款回调在未校验业务字段绑定的情况下修改本地退款与订单状态

- 严重性：high
- 置信度：medium
- 类别：Webhook 完整性缺陷
- CWE：`CWE-345`, `CWE-354`
- 影响位置：`backend/app/api/v1/endpoints/payments.py:499-577`、`backend/app/api/v1/endpoints/payments.py:511-526`、`backend/app/api/v1/endpoints/payments.py:534-571`、`backend/app/services/wechat_pay.py:202-211`

摘要：
退款回调在通过 `out_refund_no` 找到本地退款记录后，就会继续修改退款与订单状态，但没有进一步校验回调中的关键业务字段是否与本地 `PaymentRefund` / `PaymentOrder` 绑定一致。这会带来退款状态被错误写入的风险。

验证结论：
`payments.py` 中展示了查到退款单后直接修改状态的逻辑；`wechat_pay.py` 只完成验签与解密，不承担本地业务绑定校验。

修复建议：
在写入本地退款/订单状态之前，补充与支付成功回调一致的业务字段绑定校验，至少校验商户、订单、金额等关键字段。

### [6] 自助清空资料字段接口可将 `User` 上的敏感字段置空

- 严重性：medium
- 置信度：high
- 类别：批量赋值 / Mass Assignment
- CWE：`CWE-915`
- 影响位置：`backend/app/crud/crud_user.py:379-393`、`backend/app/api/v1/endpoints/users.py:280-297`、`backend/app/schemas.py:95-108`、`backend/app/schemas.py:133-159`、`backend/app/schemas.py:173-201`

摘要：
用户自助清理资料字段的接口接受调用方传入的字段名，然后对 `User` 对象上的对应属性做置空处理。如果没有明确 allowlist，攻击者可能清空本应只允许内部变更的敏感字段，甚至触发带副作用的凭据相关属性逻辑。

验证结论：
接口入口、`clear_user_profile_fields_self()` 以及 `User` 模型上的敏感字段定义可串联出完整证据链。

修复建议：
对允许用户自助清空的字段建立显式 allowlist，禁止触碰认证、租户、封禁状态、角色、凭据等敏感属性。

### [7] 社区页面会持久化并渲染攻击者控制的外部媒体 URL

- 严重性：medium
- 置信度：medium
- 类别：不可信外部内容引入
- CWE：`CWE-829`, `CWE-200`
- 影响位置：`backend/app/models/community.py:35-47`、`backend/app/models/community.py:157-166`、`backend/app/models/community.py:467-475`、`miniprogram/utils/community-editor.js:347-365` 等

摘要：
社区创建与编辑流程允许成员或管理员提交任意外部媒体 URL，并在后续详情页中直接渲染。这样会导致其他用户在可信社区界面中请求攻击者控制的远程资源，带来客户端元数据泄露与内容信任边界削弱问题。

验证结论：
静态链路覆盖了前端提交、后端模型校验与查看页渲染路径。

修复建议：
只允许受控上传域名或显式白名单域名；在入库前统一拒绝任意外部 `http(s)` 媒体地址，或完成严格归一化与校验。

### [8] 社区邀请码在过期时间之后仍可继续使用

- 严重性：medium
- 置信度：high
- 类别：授权控制缺陷
- CWE：`CWE-285`, `CWE-613`
- 影响位置：`backend/app/crud/crud_community_channel.py:626-641`、`backend/app/crud/crud_community_channel.py:645-656`

摘要：
邀请码生成时虽然记录了 `invite_code_expire_at`，但加入逻辑在校验邀请码时并未检查该时间是否已过期。因此，只要邀请码泄露或被旧成员保留，它就可能在预期失效后仍长期可用。

验证结论：
`crud_community_channel.py` 显示邀请码生成阶段会持久化过期时间，而 `join_by_invite_code()` 并未执行对应的过期检查。

修复建议：
在兑换邀请码前强制检查 `invite_code_expire_at`，过期则拒绝；邀请码使用后或过期后应及时轮换或清除。

### [9] 可伪造的 `X-Forwarded-Proto` 可绕过仅 HTTPS 登录限制

- 严重性：medium
- 置信度：high
- 类别：传输安全绕过
- CWE：`CWE-346`
- 影响位置：`backend/app/api/v1/endpoints/auth.py:26-40`、`backend/app/api/v1/endpoints/auth.py:165-204`

摘要：
如果服务能被 HTTP 直连，或上游代理未正确清洗转发头，攻击者可以伪造 `X-Forwarded-Proto`，让系统误以为请求来自 HTTPS，从而通过仅 HTTPS 登录限制并获取 JWT。

验证结论：
`auth.py` 中可直接看到对该头的信任以及后续令牌发放逻辑；剩余不确定性主要在部署层代理是否足够可靠。

修复建议：
只有在可信代理明确重写并规范化该头时才信任它；否则应改为基于真实连接元数据或受信代理白名单来判断 HTTPS。

### [10] 可伪造的 `X-Forwarded-For` 会削弱登录限流效果

- 严重性：medium
- 置信度：high
- 类别：限流绕过
- CWE：`CWE-307`, `CWE-346`
- 影响位置：`backend/app/api/v1/endpoints/auth.py:20-24`、`backend/app/api/v1/endpoints/auth.py:68-79`、`backend/app/api/v1/endpoints/auth.py:165-204`、`backend/app/api/v1/endpoints/auth.py:318-370`

摘要：
限流身份如果直接取自不可信的 `X-Forwarded-For`，攻击者就可以通过伪造或轮换该头来逃逸每 IP 限流，甚至对受害者 IP 配额进行定向耗尽，造成登录链路上的拒绝服务或暴力尝试放大。

验证结论：
`auth.py` 中显示限流键依赖 `X-Forwarded-For`，同时当前审阅路径里未看到可靠的账号级兜底限流。

修复建议：
限流应优先绑定可信客户端身份，例如受信代理校验后的真实 IP，并增加账号维度的兜底限流；除非请求一定来自可信代理，否则不要直接信任转发头。

## 已审阅安全面

以下是原报告中 `Reviewed Surfaces` 的中文概括版：

- 已确认并形成正式发现的面：登录传输安全、登录限流、退款回调、支付失败回调、角色分配默认密码、管理员初始化脚本、社区邀请码、退款幂等、自助资料清理、社区外部媒体 URL
- 已审阅但判定未形成漏洞的面：认证后租户隔离、支付成功回调绑定校验、上传路径选择、真实姓名校验、平台租户管理、任务调度、云存储适配器等
- 仍需继续跟进的面：图片上传后的更广泛媒体渲染链路、社区回调/审核链路、`LocalStorage.delete/exists()` 路径规范化、小程序本地权限快照依赖、小程序导航目标控制等

## 后续跟进问题

- 小程序端基于本地管理员状态的权限控制，是否能与具体后端授权缺口组合成真正可利用路径？
- 社区内容审核里的全局 `trace_id` 查找，是否存在跨租户可达回调路径？
- 上传内容与图片渲染链路中，是否还存在更强的主动内容风险而不只是外链追踪？
- `LocalStorage.delete/exists()` 在当前可达调用链中，是否能被构造成真实路径穿越或任意删除？
- 小程序页面中依赖 `admin_permissions` 或 `auth.isAdmin()` 的入口，后端是否每条对应 API 都做了严格服务端校验？

## 说明

本文件为原始英文安全报告的中文新增版，用于阅读和沟通，不替代原始规范化扫描产物。若后续需要修复工作，请仍以 `findings.json`、`coverage.json` 与英文原报告中的精确路径、行号和证据为准。
