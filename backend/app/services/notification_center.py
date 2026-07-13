import json
import re
from copy import deepcopy
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.crud import crud_notification
from app.schemas import (
    Activity,
    ActivityNotificationConfig,
    ActivityParticipant,
    NotificationSceneConfig,
    UserCredential,
)

WECHAT_CREDENTIAL_TYPE = "wechat"

SCENE_REFUND_SUCCESS = "refund_success"
SCENE_REFUND_FAILED = "refund_failed"
SCENE_ACTIVITY_REMIND_30M = "activity_remind_30m"
SCENE_REGISTRATION_SUCCESS = "registration_success"
SCENE_REGISTRATION_RECEIVED = "registration_received"
SCENE_REVIEW_RESULT = "review_result"

_PLACEHOLDER_PATTERN = re.compile(r"{{\s*([a-zA-Z0-9_]+)\s*}}")


def _get_env_template_id(scene: str) -> str | None:
    if scene == SCENE_REFUND_SUCCESS:
        return settings.WECHAT_SUBSCRIBE_REFUND_SUCCESS_TEMPLATE_ID
    if scene == SCENE_REFUND_FAILED:
        return settings.WECHAT_SUBSCRIBE_REFUND_FAILED_TEMPLATE_ID
    if scene == SCENE_ACTIVITY_REMIND_30M:
        return settings.WECHAT_SUBSCRIBE_ACTIVITY_REMIND_TEMPLATE_ID
    return None


def _build_default_config(scene: str) -> dict[str, Any]:
    defaults: dict[str, dict[str, Any]] = {
        SCENE_REFUND_SUCCESS: {
            "scene": SCENE_REFUND_SUCCESS,
            "name": "退款成功通知",
            "description": "退款成功后通知用户到账结果",
            "enabled": bool(settings.WECHAT_SUBSCRIBE_ENABLED and _get_env_template_id(SCENE_REFUND_SUCCESS)),
            "template_id": _get_env_template_id(SCENE_REFUND_SUCCESS),
            "page_path": "pages/my-orders/my-orders",
            "payload_template_json": {
                "thing1": {"value": "订单{{order_no}}"},
                "amount2": {"value": "{{amount_yuan}}元"},
                "phrase3": {"value": "退款成功"},
            },
        },
        SCENE_REFUND_FAILED: {
            "scene": SCENE_REFUND_FAILED,
            "name": "退款失败通知",
            "description": "退款失败后通知用户处理结果",
            "enabled": bool(settings.WECHAT_SUBSCRIBE_ENABLED and _get_env_template_id(SCENE_REFUND_FAILED)),
            "template_id": _get_env_template_id(SCENE_REFUND_FAILED),
            "page_path": "pages/my-orders/my-orders",
            "payload_template_json": {
                "thing1": {"value": "订单{{order_no}}"},
                "amount2": {"value": "{{amount_yuan}}元"},
                "phrase3": {"value": "退款失败"},
            },
        },
        SCENE_ACTIVITY_REMIND_30M: {
            "scene": SCENE_ACTIVITY_REMIND_30M,
            "name": "活动开场提醒",
            "description": "活动开始前 30 分钟提醒已报名用户",
            "enabled": bool(settings.WECHAT_SUBSCRIBE_ENABLED and _get_env_template_id(SCENE_ACTIVITY_REMIND_30M)),
            "template_id": _get_env_template_id(SCENE_ACTIVITY_REMIND_30M),
            "page_path": "pages/my-activities/my-activities",
            "payload_template_json": {
                "thing1": {"value": "{{activity_name}}"},
                "time2": {"value": "{{start_time}}"},
                "thing3": {"value": "{{location}}"},
            },
        },
        SCENE_REGISTRATION_SUCCESS: {
            "scene": SCENE_REGISTRATION_SUCCESS,
            "name": "报名成功通知",
            "description": "报名成功后通知用户查看活动详情",
            "enabled": False,
            "template_id": None,
            "page_path": "pages/my-activities/my-activities",
            "payload_template_json": {
                "thing1": {"value": "{{activity_name}}"},
                "phrase2": {"value": "报名成功"},
                "time3": {"value": "{{start_time}}"},
            },
        },
        SCENE_REGISTRATION_RECEIVED: {
            "scene": SCENE_REGISTRATION_RECEIVED,
            "name": "报名确认通知",
            "description": "用户首次报名后发送已收到报名的确认通知",
            "enabled": False,
            "template_id": None,
            "page_path": "pages/my-activities/my-activities",
            "payload_template_json": {
                "thing1": {"value": "{{activity_name}}"},
                "phrase2": {"value": "已收到报名"},
                "thing3": {"value": "我们会尽快完成审核"},
            },
        },
        SCENE_REVIEW_RESULT: {
            "scene": SCENE_REVIEW_RESULT,
            "name": "审核结果通知",
            "description": "报名审核后通知用户审核结果和后续信息",
            "enabled": False,
            "template_id": None,
            "page_path": "pages/my-activities/my-activities",
            "payload_template_json": {
                "thing1": {"value": "{{activity_name}}"},
                "phrase2": {"value": "{{review_result_text}}"},
                "thing3": {"value": "{{detail_text}}"},
            },
        },
    }
    return deepcopy(defaults[scene])


def list_scene_configs(db: Session, tenant_id: int) -> list[dict[str, Any]]:
    config_rows = db.query(NotificationSceneConfig).filter(
        NotificationSceneConfig.tenant_id == tenant_id,
    ).all()
    config_map = {item.scene: item for item in config_rows}

    scenes = [
        SCENE_REFUND_SUCCESS,
        SCENE_REFUND_FAILED,
        SCENE_ACTIVITY_REMIND_30M,
        SCENE_REGISTRATION_SUCCESS,
        SCENE_REGISTRATION_RECEIVED,
        SCENE_REVIEW_RESULT,
    ]
    merged: list[dict[str, Any]] = []
    for scene in scenes:
        base = _build_default_config(scene)
        row = config_map.get(scene)
        if row:
            base.update(
                {
                    "name": row.name,
                    "description": row.description,
                    "enabled": bool(row.enabled),
                    "template_id": row.template_id,
                    "page_path": row.page_path,
                    "payload_template_json": json.loads(row.payload_template_json or "{}"),
                }
            )
        merged.append(base)
    return merged


def get_scene_config(db: Session, tenant_id: int, scene: str) -> dict[str, Any]:
    for item in list_scene_configs(db, tenant_id):
        if item["scene"] == scene:
            return item
    raise KeyError(scene)


def _normalize_activity_config_record(record: ActivityNotificationConfig) -> dict[str, Any]:
    return {
        "activity_id": record.activity_id,
        "scene": record.scene,
        "enabled": bool(record.enabled),
        "template_id": record.template_id,
        "page_path": record.page_path,
        "payload_template_json": json.loads(record.payload_template_json or "{}"),
    }


def get_activity_scene_config(
    db: Session,
    *,
    tenant_id: int,
    activity_id: int,
    scene: str,
) -> dict[str, Any]:
    base = get_scene_config(db, tenant_id, scene)
    record = db.query(ActivityNotificationConfig).filter(
        ActivityNotificationConfig.tenant_id == tenant_id,
        ActivityNotificationConfig.activity_id == activity_id,
        ActivityNotificationConfig.scene == scene,
    ).first()
    if not record:
        return {
            "activity_id": activity_id,
            "scene": scene,
            "enabled": bool(base.get("enabled")),
            "template_id": base.get("template_id"),
            "page_path": base.get("page_path"),
            "payload_template_json": base.get("payload_template_json") or {},
        }

    normalized = _normalize_activity_config_record(record)
    return normalized


def upsert_activity_scene_config(
    db: Session,
    *,
    tenant_id: int,
    activity_id: int,
    scene: str,
    enabled: bool,
    template_id: str | None,
    page_path: str | None,
    payload_template_json: dict[str, Any],
) -> ActivityNotificationConfig:
    record = db.query(ActivityNotificationConfig).filter(
        ActivityNotificationConfig.tenant_id == tenant_id,
        ActivityNotificationConfig.activity_id == activity_id,
        ActivityNotificationConfig.scene == scene,
    ).first()
    if record is None:
        record = ActivityNotificationConfig(
            tenant_id=tenant_id,
            activity_id=activity_id,
            scene=scene,
            enabled=1 if enabled else 0,
            template_id=template_id,
            page_path=page_path,
            payload_template_json=json.dumps(payload_template_json, ensure_ascii=False),
        )
        db.add(record)
    else:
        record.enabled = 1 if enabled else 0
        record.template_id = template_id
        record.page_path = page_path
        record.payload_template_json = json.dumps(payload_template_json, ensure_ascii=False)
    db.commit()
    db.refresh(record)
    return record


def upsert_scene_config(
    db: Session,
    *,
    tenant_id: int,
    scene: str,
    name: str,
    description: str | None,
    enabled: bool,
    template_id: str | None,
    page_path: str | None,
    payload_template_json: dict[str, Any],
) -> NotificationSceneConfig:
    record = db.query(NotificationSceneConfig).filter(
        NotificationSceneConfig.tenant_id == tenant_id,
        NotificationSceneConfig.scene == scene,
    ).first()
    if record is None:
        record = NotificationSceneConfig(
            tenant_id=tenant_id,
            scene=scene,
            name=name,
            description=description,
            enabled=1 if enabled else 0,
            template_id=template_id,
            page_path=page_path,
            payload_template_json=json.dumps(payload_template_json, ensure_ascii=False),
        )
        db.add(record)
    else:
        record.name = name
        record.description = description
        record.enabled = 1 if enabled else 0
        record.template_id = template_id
        record.page_path = page_path
        record.payload_template_json = json.dumps(payload_template_json, ensure_ascii=False)

    db.commit()
    db.refresh(record)
    return record


def _render_string(template: str, context: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = context.get(key)
        return "" if value is None else str(value)

    return _PLACEHOLDER_PATTERN.sub(replace, template)


def _render_value(value: Any, context: dict[str, Any]) -> Any:
    if isinstance(value, str):
        return _render_string(value, context)
    if isinstance(value, dict):
        return {key: _render_value(item, context) for key, item in value.items()}
    if isinstance(value, list):
        return [_render_value(item, context) for item in value]
    return value


def render_scene_message(
    db: Session,
    *,
    tenant_id: int,
    scene: str,
    context: dict[str, Any],
    activity_id: int | None = None,
) -> dict[str, Any] | None:
    config = get_activity_scene_config(
        db,
        tenant_id=tenant_id,
        activity_id=activity_id,
        scene=scene,
    ) if activity_id is not None else get_scene_config(db, tenant_id, scene)
    template_id = (config.get("template_id") or "").strip()
    if not settings.WECHAT_SUBSCRIBE_ENABLED or not config.get("enabled") or not template_id:
        return None

    payload_template = config.get("payload_template_json") or {}
    page_path = config.get("page_path") or None
    return {
        "scene": scene,
        "template_id": template_id,
        "page_path": _render_string(page_path, context) if page_path else None,
        "payload": _render_value(payload_template, context),
    }


def get_user_wechat_openid(db: Session, *, tenant_id: int, user_id: int) -> str | None:
    credential = db.query(UserCredential).filter(
        UserCredential.user_id == user_id,
        UserCredential.tenant_id == tenant_id,
        UserCredential.credential_type == WECHAT_CREDENTIAL_TYPE,
        UserCredential.status == 1,
    ).first()
    if not credential:
        return None
    return credential.identifier


def build_registration_success_context(participant: ActivityParticipant, activity_name: str, start_time: str) -> dict[str, Any]:
    return {
        "participant_id": participant.id,
        "activity_id": participant.activity_id,
        "activity_name": activity_name,
        "start_time": start_time,
    }


def build_registration_received_context(
    participant: ActivityParticipant,
    activity_name: str,
    participant_name: str,
) -> dict[str, Any]:
    return {
        "participant_id": participant.id,
        "activity_id": participant.activity_id,
        "activity_name": activity_name,
        "participant_name": participant_name,
    }


def build_review_result_context(
    participant: ActivityParticipant,
    activity_name: str,
    approved: bool,
    review_reason: str | None = None,
) -> dict[str, Any]:
    review_result_text = "审核通过" if approved else "审核未通过"
    detail_text = review_reason.strip() if review_reason and review_reason.strip() else ""
    if approved and not detail_text:
        detail_text = "请查看后续通知"
    return {
        "participant_id": participant.id,
        "activity_id": participant.activity_id,
        "activity_name": activity_name,
        "review_result_text": review_result_text,
        "detail_text": detail_text,
        "review_reason": detail_text,
    }


def is_first_time_participant(
    db: Session,
    *,
    tenant_id: int,
    user_id: int,
    participant_id: int | None = None,
) -> bool:
    query = db.query(ActivityParticipant).filter(
        ActivityParticipant.tenant_id == tenant_id,
        ActivityParticipant.user_id == user_id,
    )
    if participant_id is not None:
        query = query.filter(ActivityParticipant.id != participant_id)
    return query.count() == 0


def _enqueue_rendered_message(
    db: Session,
    *,
    tenant_id: int,
    scene: str,
    user_id: int,
    openid: str,
    participant_id: int,
    rendered_message: dict[str, Any],
) -> None:
    crud_notification.enqueue_message_task(
        db,
        tenant_id=tenant_id,
        scene=scene,
        biz_id=participant_id,
        user_id=user_id,
        openid=openid,
        template_id=rendered_message["template_id"],
        payload=rendered_message["payload"],
        page_path=rendered_message["page_path"],
        max_retry=settings.WECHAT_SUBSCRIBE_RETRY_MAX,
    )


def enqueue_registration_received_message(
    db: Session,
    *,
    tenant_id: int,
    user_id: int | None,
    participant: ActivityParticipant,
    activity: Activity,
) -> None:
    if not user_id or participant.enroll_status != 1:
        return
    if not is_first_time_participant(db, tenant_id=tenant_id, user_id=user_id, participant_id=participant.id):
        return

    openid = get_user_wechat_openid(db, tenant_id=tenant_id, user_id=user_id)
    if not openid:
        return

    rendered_message = render_scene_message(
        db,
        tenant_id=tenant_id,
        scene=SCENE_REGISTRATION_RECEIVED,
        context=build_registration_received_context(
            participant,
            activity.activity_name[:20],
            participant.participant_name[:20],
        ),
        activity_id=activity.id,
    )
    if not rendered_message:
        return

    _enqueue_rendered_message(
        db,
        tenant_id=tenant_id,
        scene=SCENE_REGISTRATION_RECEIVED,
        user_id=user_id,
        openid=openid,
        participant_id=participant.id,
        rendered_message=rendered_message,
    )


def enqueue_review_result_message(
    db: Session,
    *,
    tenant_id: int,
    user_id: int | None,
    participant: ActivityParticipant,
    activity: Activity,
    approved: bool,
    review_reason: str | None = None,
) -> None:
    if not user_id:
        return

    openid = get_user_wechat_openid(db, tenant_id=tenant_id, user_id=user_id)
    if not openid:
        return

    rendered_message = render_scene_message(
        db,
        tenant_id=tenant_id,
        scene=SCENE_REVIEW_RESULT,
        context=build_review_result_context(
            participant,
            activity.activity_name[:20],
            approved=approved,
            review_reason=review_reason,
        ),
        activity_id=activity.id,
    )
    if not rendered_message:
        return

    _enqueue_rendered_message(
        db,
        tenant_id=tenant_id,
        scene=SCENE_REVIEW_RESULT,
        user_id=user_id,
        openid=openid,
        participant_id=participant.id,
        rendered_message=rendered_message,
    )


def enqueue_registration_success_message(
    db: Session,
    *,
    tenant_id: int,
    user_id: int | None,
    participant: ActivityParticipant,
    activity: Activity,
) -> None:
    if not user_id or participant.enroll_status != 1:
        return

    openid = get_user_wechat_openid(db, tenant_id=tenant_id, user_id=user_id)
    if not openid:
        return

    rendered_message = render_scene_message(
        db,
        tenant_id=tenant_id,
        scene=SCENE_REGISTRATION_SUCCESS,
        context=build_registration_success_context(
            participant,
            activity.activity_name[:20],
            activity.start_time.strftime("%Y-%m-%d %H:%M") if isinstance(activity.start_time, datetime) else "",
        ),
        activity_id=activity.id,
    )
    if not rendered_message:
        return

    crud_notification.enqueue_message_task(
        db,
        tenant_id=tenant_id,
        scene=SCENE_REGISTRATION_SUCCESS,
        biz_id=participant.id,
        user_id=user_id,
        openid=openid,
        template_id=rendered_message["template_id"],
        payload=rendered_message["payload"],
        page_path=rendered_message["page_path"],
        max_retry=settings.WECHAT_SUBSCRIBE_RETRY_MAX,
    )
