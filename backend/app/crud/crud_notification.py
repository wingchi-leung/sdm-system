import json
from datetime import datetime, timedelta

from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas import MessageTask, SubscribeConsent

TASK_STATUS_PENDING = "pending"
TASK_STATUS_SENDING = "sending"
TASK_STATUS_SUCCESS = "success"
TASK_STATUS_FAILED = "failed"
TASK_STATUS_DEAD = "dead"


def upsert_subscribe_consent(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    template_id: str,
    accept_status: str,
    source_page: str | None,
) -> SubscribeConsent:
    record = db.query(SubscribeConsent).filter(
        SubscribeConsent.tenant_id == tenant_id,
        SubscribeConsent.user_id == user_id,
        SubscribeConsent.template_id == template_id,
    ).first()

    if record is None:
        record = SubscribeConsent(
            tenant_id=tenant_id,
            user_id=user_id,
            template_id=template_id,
            accept_status=accept_status,
            accept_time=datetime.now(),
            source_page=source_page,
        )
        db.add(record)
    else:
        record.accept_status = accept_status
        record.accept_time = datetime.now()
        record.source_page = source_page

    db.commit()
    db.refresh(record)
    return record


def enqueue_message_task(
    db: Session,
    *,
    tenant_id: int,
    scene: str,
    biz_id: int,
    user_id: int,
    openid: str,
    template_id: str,
    payload: dict,
    page_path: str | None = None,
    max_retry: int | None = None,
) -> MessageTask:
    task = MessageTask(
        tenant_id=tenant_id,
        scene=scene,
        biz_id=biz_id,
        user_id=user_id,
        openid=openid,
        template_id=template_id,
        page_path=page_path,
        payload_json=json.dumps(payload, ensure_ascii=False),
        status=TASK_STATUS_PENDING,
        retry_count=0,
        max_retry=max_retry if max_retry is not None else settings.WECHAT_SUBSCRIBE_RETRY_MAX,
        next_retry_at=datetime.now(),
    )
    db.add(task)
    try:
        db.commit()
        db.refresh(task)
        return task
    except IntegrityError:
        db.rollback()
        return db.query(MessageTask).filter(
            MessageTask.tenant_id == tenant_id,
            MessageTask.scene == scene,
            MessageTask.biz_id == biz_id,
            MessageTask.user_id == user_id,
        ).first()


def get_retryable_tasks(db: Session, *, limit: int = 50) -> list[MessageTask]:
    now = datetime.now()
    return db.query(MessageTask).filter(
        or_(
            MessageTask.status == TASK_STATUS_PENDING,
            and_(
                MessageTask.status == TASK_STATUS_FAILED,
                MessageTask.retry_count < MessageTask.max_retry,
            ),
        ),
        or_(MessageTask.next_retry_at.is_(None), MessageTask.next_retry_at <= now),
    ).order_by(MessageTask.id.asc()).limit(limit).all()


def try_mark_task_sending(db: Session, task_id: int) -> MessageTask | None:
    task = db.query(MessageTask).filter(
        MessageTask.id == task_id,
    ).with_for_update().first()
    if task is None:
        return None
    if task.status not in {TASK_STATUS_PENDING, TASK_STATUS_FAILED}:
        return None
    if task.retry_count >= task.max_retry:
        task.status = TASK_STATUS_DEAD
        db.commit()
        return None

    task.status = TASK_STATUS_SENDING
    db.commit()
    db.refresh(task)
    return task


def mark_task_success(db: Session, task: MessageTask) -> MessageTask:
    task.status = TASK_STATUS_SUCCESS
    task.sent_at = datetime.now()
    task.last_error = None
    db.commit()
    db.refresh(task)
    return task


def mark_task_failed(db: Session, task: MessageTask, error_msg: str) -> MessageTask:
    task.retry_count += 1
    task.last_error = error_msg[:255]
    if task.retry_count >= task.max_retry:
        task.status = TASK_STATUS_DEAD
        task.next_retry_at = None
    else:
        task.status = TASK_STATUS_FAILED
        backoff_seconds = min(900, 60 * (2 ** (task.retry_count - 1)))
        task.next_retry_at = datetime.now() + timedelta(seconds=backoff_seconds)
    db.commit()
    db.refresh(task)
    return task


def get_message_task(db: Session, task_id: int, tenant_id: int) -> MessageTask | None:
    return db.query(MessageTask).filter(
        MessageTask.id == task_id,
        MessageTask.tenant_id == tenant_id,
    ).first()


def retry_message_task(db: Session, task: MessageTask) -> MessageTask:
    task.status = TASK_STATUS_PENDING
    task.next_retry_at = datetime.now()
    task.last_error = None
    db.commit()
    db.refresh(task)
    return task
