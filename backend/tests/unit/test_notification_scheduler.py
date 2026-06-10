from datetime import datetime, timedelta

from sqlalchemy import text

from app.schemas import Activity, ActivityParticipant, User, UserCredential
from app.tasks import scheduler


def test_queue_activity_remind_tasks_filters_participants(db_session, monkeypatch):
    monkeypatch.setattr(scheduler.settings, "WECHAT_SUBSCRIBE_ENABLED", True)
    monkeypatch.setattr(scheduler.settings, "WECHAT_SUBSCRIBE_ACTIVITY_REMIND_TEMPLATE_ID", "tpl_remind")
    monkeypatch.setattr(scheduler.settings, "WECHAT_SUBSCRIBE_RETRY_MAX", 5)
    monkeypatch.setattr(scheduler, "SessionLocal", lambda: db_session)

    tenant_id = 1
    activity = Activity(
        tenant_id=tenant_id,
        activity_name="测试活动",
        start_time=datetime.now() + timedelta(minutes=30, seconds=20),
        status=1,
        suggested_fee=0,
        require_payment=0,
    )
    db_session.add(activity)
    db_session.flush()

    user_ids: list[int] = []
    for idx in range(1, 5):
        user = User(tenant_id=tenant_id, phone=f"1380000000{idx}", name=f"用户{idx}", sex="男")
        db_session.add(user)
        db_session.flush()
        db_session.add(
            UserCredential(
                user_id=user.id,
                tenant_id=tenant_id,
                credential_type="wechat",
                identifier=f"openid_{idx}",
                status=1,
            )
        )
        user_ids.append(user.id)

    # 符合条件：审核通过 + 免支付
    db_session.add(
        ActivityParticipant(
            tenant_id=tenant_id,
            activity_id=activity.id,
            user_id=user_ids[0],
            participant_name="用户1",
            review_status=1,
            payment_status=0,
        )
    )
    # 审核拒绝
    db_session.add(
        ActivityParticipant(
            tenant_id=tenant_id,
            activity_id=activity.id,
            user_id=user_ids[1],
            participant_name="用户2",
            review_status=2,
            payment_status=2,
        )
    )
    # 待支付
    db_session.add(
        ActivityParticipant(
            tenant_id=tenant_id,
            activity_id=activity.id,
            user_id=user_ids[2],
            participant_name="用户3",
            review_status=1,
            payment_status=1,
        )
    )
    # 拉黑
    blocked_user = db_session.query(User).filter(User.id == user_ids[3]).first()
    blocked_user.isblock = 1
    db_session.add(
        ActivityParticipant(
            tenant_id=tenant_id,
            activity_id=activity.id,
            user_id=user_ids[3],
            participant_name="用户4",
            review_status=1,
            payment_status=2,
        )
    )
    db_session.commit()

    scheduler.queue_activity_remind_tasks(lookahead_seconds=120)

    tasks = db_session.execute(text("SELECT scene, user_id FROM message_task")).fetchall()
    assert len(tasks) == 1
    assert tasks[0][0] == "activity_remind_30m"
    assert tasks[0][1] == user_ids[0]


def test_dispatch_message_tasks_marks_success(db_session, monkeypatch):
    monkeypatch.setattr(scheduler.settings, "WECHAT_SUBSCRIBE_ENABLED", True)
    monkeypatch.setattr(scheduler, "SessionLocal", lambda: db_session)

    db_session.execute(
        text(
            """
        INSERT INTO message_task (
            tenant_id, scene, biz_id, user_id, openid, template_id, payload_json, status, retry_count, max_retry, create_time, update_time
        ) VALUES (1, 'activity_remind_30m', 11, 22, 'openid', 'tpl', '{"thing1":{"value":"A"}}', 'pending', 0, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
        )
    )
    db_session.commit()

    monkeypatch.setattr(scheduler, "send_subscribe_message", lambda **kwargs: {"errcode": 0})

    scheduler.dispatch_message_tasks(batch_size=10)

    status = db_session.execute(text("SELECT status FROM message_task LIMIT 1")).scalar_one()
    assert status == "success"


def test_queue_refund_notify_tasks_auto_enqueue(db_session, monkeypatch):
    monkeypatch.setattr(scheduler.settings, "WECHAT_SUBSCRIBE_ENABLED", True)
    monkeypatch.setattr(scheduler.settings, "WECHAT_SUBSCRIBE_REFUND_SUCCESS_TEMPLATE_ID", "tpl_refund_success")
    monkeypatch.setattr(scheduler.settings, "WECHAT_SUBSCRIBE_REFUND_FAILED_TEMPLATE_ID", "tpl_refund_failed")
    monkeypatch.setattr(scheduler.settings, "WECHAT_SUBSCRIBE_RETRY_MAX", 5)
    monkeypatch.setattr(scheduler, "SessionLocal", lambda: db_session)

    user = User(tenant_id=1, phone="13900000000", name="退款用户", sex="女")
    db_session.add(user)
    db_session.flush()
    user_id = user.id
    db_session.add(
        UserCredential(
            user_id=user_id,
            tenant_id=1,
            credential_type="wechat",
            identifier="openid_refund",
            status=1,
        )
    )
    db_session.execute(
        text(
            """
            INSERT INTO payment_order (
                tenant_id, order_no, activity_id, user_id, suggested_fee, actual_fee, status, refund_status, refund_amount, openid, expire_at, create_time, update_time
            ) VALUES (
                1, 'PO_REFUND_OK_001', 1, :user_id, 1000, 1000, 1, 3, 1000, 'openid_refund', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            """
        ),
        {"user_id": user_id},
    )
    db_session.commit()

    scheduler.queue_refund_notify_tasks(limit=20)

    row = db_session.execute(
        text("SELECT scene, template_id FROM message_task WHERE user_id=:user_id ORDER BY id DESC LIMIT 1"),
        {"user_id": user_id},
    ).fetchone()
    assert row is not None
    assert row[0] == "refund_success"
    assert row[1] == "tpl_refund_success"
