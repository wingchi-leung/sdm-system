from sqlalchemy.orm import Session

from app.schemas import CommunityMediaModerationTask


def create_media_task(
    db: Session,
    *,
    tenant_id: int,
    item_type: str,
    item_id: int,
    media_url: str,
    trace_id: str | None,
    status: str,
    reason: str | None = None,
) -> CommunityMediaModerationTask:
    task = CommunityMediaModerationTask(
        tenant_id=tenant_id,
        item_type=item_type,
        item_id=item_id,
        media_url=media_url,
        trace_id=trace_id,
        status=status,
        reason=reason,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def get_media_task_by_trace_id(
    db: Session,
    *,
    tenant_id: int,
    trace_id: str,
) -> CommunityMediaModerationTask | None:
    return db.query(CommunityMediaModerationTask).filter(
        CommunityMediaModerationTask.tenant_id == tenant_id,
        CommunityMediaModerationTask.trace_id == trace_id,
    ).first()


def get_media_task_by_trace_id_global(
    db: Session,
    *,
    trace_id: str,
) -> CommunityMediaModerationTask | None:
    return db.query(CommunityMediaModerationTask).filter(
        CommunityMediaModerationTask.trace_id == trace_id,
    ).first()


def update_media_task_result(
    db: Session,
    *,
    task: CommunityMediaModerationTask,
    status: str,
    reason: str | None = None,
) -> CommunityMediaModerationTask:
    task.status = status
    task.reason = reason
    db.commit()
    db.refresh(task)
    return task


def list_media_tasks_by_item(
    db: Session,
    *,
    tenant_id: int,
    item_type: str,
    item_id: int,
) -> list[CommunityMediaModerationTask]:
    return db.query(CommunityMediaModerationTask).filter(
        CommunityMediaModerationTask.tenant_id == tenant_id,
        CommunityMediaModerationTask.item_type == item_type,
        CommunityMediaModerationTask.item_id == item_id,
    ).all()
