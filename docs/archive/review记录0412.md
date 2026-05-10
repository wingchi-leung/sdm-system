第一轮 Review：链路型审查 + 后端规则一致性
🔴 P1 - 高危 Finding（主链路断点）
Finding 1：满员判断双标准——前后端逻辑不一致，候补报名可绕过支付
位置： participants.py:54-62 × register.js:492-503

后端判断（满员 → 允许候补报名不收费）：


# participants.py 第54-61行
if activity.require_payment == 1:
    is_full = (
        max_participants is not None
        and crud_participant.get_enrolled_count(...) >= max_participants
    )
    if not is_full:
        raise HTTPException(400, "该活动需要先完成支付后才能报名")
这段逻辑的语义是：付费活动，只有在满员时，才允许直接走免费候补通道（不满员时强制付费）。但反过来读意味着：一旦满员，任何人都能绕过支付直接进候补。

前端判断（满员 → 跳过支付）：


// register.js 第492-503行
if (isFull) {
    this.doRegister();  // 直接免费报名
} else if (requirePayment) {
    this.doPaymentRegister();
}
问题：

isFull 来自 loadEnrollmentInfo()（异步、有时序风险，getEnrollmentInfo 可能比 loadActivity 晚返回甚至失败）。若 enrollmentInfo 未加载完，isFull 默认 false，付费活动会走支付流程，没问题；但若网络失败 isFull 保持 false，实际上已满员的活动不会提示用户。
更严重的是，付费活动满员后，用户可以直接调用 /participants/ 接口不带任何支付信息就完成候补注册——候补参与者的 payment_status 默认 0（无需支付），但实际上这个人参与了一个付费活动。如果将来满员名额释放，这个人从候补晋升正式参与者时，不需要补交费用，这是一个业务漏洞。
Finding 2：/participants/ 报名接口可匿名调用，黑名单拦截有盲区
位置： participants.py:36-85


# 使用 get_current_user_optional，ctx 可以为 None
ctx: deps.TenantContext | None = Depends(deps.get_current_user_optional)
...
tenant_id = ctx.tenant_id if ctx else 1  # 未登录默认租户1
问题：

未登录用户可以直接报名，仅靠手机号拦截黑名单（第70-74行）。但 check_participant_exists 依赖 identity_number，若匿名用户不填证件号（前端过滤掉 undefined），identity_number 为空，check_participant_exists 直接返回 False（第206行），重复报名检测失效。
黑名单拦截顺序有问题：先 _merge_profile_fields 合并（可能覆盖 user_id），再检查 isblock，但对于未登录用户，只通过手机号查黑名单，如果黑名单用户换了手机号，就绕过了。
未登录报名进来的数据 user_id = None，但 ActivityParticipant 表上有 UniqueConstraint('activity_id', 'user_id', 'tenant_id')，多个匿名报名的 user_id 都是 NULL，MySQL 中 NULL != NULL，约束实际上对 NULL 值不生效，可以无限重复报名（只要证件号不同或为空）。
Finding 3：支付成功回调中重复报名校验缺失，参与者在事务中创建前没有再次检查
位置： payments.py:374-406（payment_notify 回调）


if trade_state == "SUCCESS":
    snapshot = crud_payment.parse_participant_snapshot(order)
    participant_in = ParticipantCreate.model_validate(snapshot)
    participant = crud_participant.create_participant(  # 内部有检查
        db=db, participant=participant_in, tenant_id=tenant_id, commit=False,
    )
create_participant 内部确实有重复检查（第118-128行），这是正确的。但有一个状态机漏洞：

当支付回调在两个并发请求中同时到达时（微信会在回调失败时重试）：

第一个请求获取行锁 with_for_update() 成功，进入处理
第一个请求 create_participant 用 commit=False → flush() 落库，但回调函数返回之前，第二个请求正在等行锁
第一个请求提交（db.commit()），order.status 变 SUCCESS
第二个请求获得行锁，检查 order.status == PAYMENT_STATUS_SUCCESS 直接返回，这是正确的
实际这里逻辑正确，但有另一个问题：create_participant 在 commit=False 时用的是 flush()，如果 flush() 抛出 IntegrityError（重复），会被第155-157行捕获，然后 db.rollback()，但整个外层支付回调的 try-except 也会捕获这个 rollback 后的状态，不返回 SUCCESS，导致微信会重试回调。微信最终会在幂等检查时停止，但这会产生多余的重试日志和延迟。

Finding 4：_login_attempts 是进程内字典，多 worker 部署下限速完全失效
位置： auth.py:23


_login_attempts: dict[str, list[float]] = defaultdict(list)
这是一个模块级变量。在 Gunicorn/Uvicorn 多 worker 模式下，每个 worker 有独立的内存，每个 worker 各自统计，限速次数相当于被乘以 worker 数。例如配置限速 5 次，实际可以打 5 × workers 次。

同样问题存在于 _wechat_access_token_cache，多 worker 下每个 worker 各自维护缓存，会产生多余的微信 token 请求，可能导致并发刷新 token（幂等的但浪费）。

Finding 5：路由注册顺序冲突——/users/admin/all 会被 /{user_id} 捕获
位置： users.py:79-99 和 users.py:101-137


@router.get("/{user_id}")      # 第79行
def read_user(user_id: int, ...)

@router.get("/")               # 第92行  
def get_users(...)

@router.get("/admin/all")      # 第101行
def get_all_users_for_super_admin(...)
FastAPI 路由是按注册顺序匹配的。GET /users/admin/all 中的 admin 会尝试被 /{user_id} 的 int 类型参数解析——由于 admin 不是整数，FastAPI 会正确跳过并匹配 /admin/all，这里实际上不会出问题（FastAPI 的类型验证保护了这里）。

⚠️ 但是存在另一个问题：GET /users/ 使用 get_current_admin（管理员），GET /users/{user_id} 也是管理员，但 GET /users/me（第24行）是 get_current_user（任意用户）。如果 /me 在路由注册时晚于 /{user_id}，GET /users/me 会先被 /{user_id} 尝试匹配——由于 me 不是整数，仍然会正确匹配 /me。类型系统保护了这里，不是 bug，但要留意不要改成 user_id: str。

🟡 P2 - 中危 Finding
Finding 6：小程序 submit() 防抖与 submitting 状态在支付成功后重置时序有误
位置： register.js:466-504


submit() {
    if (this.data.submitting) return;
    ...
    this.setData({ submitting: true });
    ...
    // 支付成功后
    this.setData({ submitting: false });  // 第405行
}
在 doPaymentRegister() → wx.requestPayment → 用户支付成功后，链路是：

confirmPaymentResult(orderNo) 轮询最多 8 次（8×1.5s = 12秒）
12 秒内 submitting: true，页面卡住，用户无法操作
超时后 submitting: false 但 recoverPendingPayment: true，页面显示"继续支付"
问题：在 confirmPaymentResult 轮询期间，用户若关闭小程序再重开，submitting 状态会重置为 false，但 paymentOrderNo 也被重置为空（因为 onLoad 不恢复历史状态），用户无法恢复订单。需要将 paymentOrderNo 持久化到 Storage。

Finding 7：绑定信息页验证通过后，后端没有做身份证格式二次校验
位置： users.py:46-61（bind_user_info） + crud_user.py:206-247（update_user_bind_info）

前端 bind-user-info.js 有完整的格式校验（正则），但后端 update_user_bind_info 对 identity_number 和 identity_type 没有任何格式校验，直接写库。若通过 API 工具绕过前端，可以写入任意格式的证件号，之后 check_participant_exists 就会以这个非法证件号做唯一性判断，产生错误的重复报名检测结果。

Finding 8：支付成功回调 participant_snapshot 中的用户字段可能已过时
位置： payments.py:239 + payments.py:377-386

下单时 _build_participant_snapshot 截取了一份快照。但若用户在下单后、支付回调前修改了绑定信息（/users/bind-info），回调会用旧的快照创建参与者，导致参与者的姓名/手机号和用户当前资料不一致。

🟠 P3 - 低危但需记录
Finding 9：is_user_profile_incomplete 中 name == "微信用户" 的判断是脆弱字符串匹配
crud_user.py:187


if not user.name or user.name == "微信用户":
    return True
若后续代码或数据迁移中修改了默认名（如改为"微信用户0001"），这个判断会静默失效。建议增加一个 profile_complete 字段或通过 wx_openid is not None and phone is None 来判断是否是未完善的微信新用户。

Finding 10：close_expired_orders 没有被任何调度器调用
crud_payment.py:182-214


def close_expired_orders(db, tenant_id=None): ...
整个后端代码库中 grep close_expired_orders 没有被定时任务或后台任务调用的痕迹。过期订单永远是 status=0/4（PENDING/CREATING），get_pending_payment_order_for_user_activity 过滤条件包含 expire_at > now，所以不会误复用。但这些僵尸订单永远不会被清理，数据库里会积累大量状态异常的历史订单，影响查询性能和运营数据统计。

优先修复清单（建议顺序）
优先级	Finding	影响	修复难度
🔴 P1	Finding 2：匿名报名 + 空证件号绕过重复检测	数据污染 + 刷票	中
🔴 P1	Finding 1：付费活动满员候补绕过支付，晋正无需补费	业务漏洞	中
🔴 P1	Finding 4：限速在多worker下失效	安全风险	中（需引入Redis）
🟡 P2	Finding 7：后端不校验证件号格式	数据质量	低
🟡 P2	Finding 6：支付超时后订单号不持久化	UX断点	低
🟡 P2	Finding 8：快照用户信息可能过时	数据一致性	中
🟠 P3	Finding 9：is_user_profile_incomplete 脆弱判断	隐性 bug	低
🟠 P3	Finding 10：过期订单不自动清理	数据库膨胀	低
请确认：

Finding 1（候补绕支付）：业务上候补是否本来就设计为免费？还是候补晋正后应补缴费用？
Finding 2（匿名报名）：这个功能是有意设计的（支持访客报名）还是应该强制登录？
Finding 4（限速）：目前是单 worker 还是多 worker 部署？是否有 Redis 可用？