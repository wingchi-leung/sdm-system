import pytest
from fastapi import status

from app.core.security import create_access_token
from app.schemas import (
    Activity,
    CommunityChannel,
    CommunityChannelCalendarEvent,
    CommunityChannelMember,
    User,
)
from tests.conftest import auth_headers


@pytest.mark.api
class TestCommunityCalendar:
    """社区频道日历 API 测试。"""

    def _create_channel(self, db_session, tenant_id, admin_user_id, name="日历频道"):
        ch = CommunityChannel(
            tenant_id=tenant_id,
            name=name,
            description=None,
            admin_user_id=admin_user_id,
            status=1,
        )
        db_session.add(ch)
        db_session.flush()
        db_session.add(
            CommunityChannelMember(
                tenant_id=tenant_id,
                channel_id=ch.id,
                user_id=admin_user_id,
                role="admin",
                status="active",
            )
        )
        db_session.commit()
        db_session.refresh(ch)
        return ch

    def _add_member(self, db_session, tenant_id, channel_id, user_id, role="member"):
        db_session.add(
            CommunityChannelMember(
                tenant_id=tenant_id,
                channel_id=channel_id,
                user_id=user_id,
                role=role,
                status="active",
            )
        )
        db_session.commit()

    def _create_calendar_event(
        self,
        db_session,
        *,
        tenant_id,
        channel_id,
        author_user_id,
        title,
        start_time,
        event_type="activity",
        content="<p>x</p>",
        activity_id=None,
    ):
        event = CommunityChannelCalendarEvent(
            tenant_id=tenant_id,
            channel_id=channel_id,
            author_user_id=author_user_id,
            title=title,
            event_type=event_type,
            content=content,
            location="北京市",
            cover_url="/uploads/community/calendar/cover.jpg",
            activity_id=activity_id,
            start_time=start_time,
            end_time=None,
            status=1,
        )
        db_session.add(event)
        db_session.commit()
        db_session.refresh(event)
        return event

    def test_create_list_detail_update_delete_calendar_event(
        self,
        client,
        db_session,
        super_admin,
        super_admin_token,
        sample_activity,
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)

        create_resp = client.post(
            f"/api/v1/community/channels/{channel.id}/calendar/events",
            headers=auth_headers(super_admin_token),
            json={
                "title": "周六分享会",
                "event_type": "activity",
                "content": "提前 10 分钟签到",
                "location": "北京朝阳",
                "cover_url": "/uploads/community/calendar/cover.jpg",
                "activity_id": sample_activity.id,
                "start_time": "2026-06-21T10:00:00+08:00",
                "end_time": "2026-06-21T12:00:00+08:00",
            },
        )
        assert create_resp.status_code == status.HTTP_200_OK
        data = create_resp.json()
        assert data["title"] == "周六分享会"
        assert data["activity_id"] == sample_activity.id
        assert data["activity_name"] == sample_activity.activity_name

        list_resp = client.get(
            f"/api/v1/community/channels/{channel.id}/calendar/events?year=2026&month=6",
            headers=auth_headers(super_admin_token),
        )
        assert list_resp.status_code == status.HTTP_200_OK
        assert list_resp.json()["total"] == 1
        assert list_resp.json()["items"][0]["title"] == "周六分享会"

        month_summary = client.get(
            f"/api/v1/community/channels/{channel.id}/calendar/month-summary?year=2026&month=6",
            headers=auth_headers(super_admin_token),
        )
        assert month_summary.status_code == status.HTTP_200_OK
        summary = month_summary.json()
        assert summary["total"] == 1
        assert summary["day_counts"][0]["date"] == "2026-06-21"

        event_id = data["id"]
        detail_resp = client.get(
            f"/api/v1/community/channels/{channel.id}/calendar/events/{event_id}",
            headers=auth_headers(super_admin_token),
        )
        assert detail_resp.status_code == status.HTTP_200_OK
        assert detail_resp.json()["id"] == event_id

        update_resp = client.put(
            f"/api/v1/community/channels/{channel.id}/calendar/events/{event_id}",
            headers=auth_headers(super_admin_token),
            json={
                "title": "更新后的分享会",
                "location": "上海浦东",
            },
        )
        assert update_resp.status_code == status.HTTP_200_OK
        assert update_resp.json()["title"] == "更新后的分享会"
        assert update_resp.json()["location"] == "上海浦东"

        delete_resp = client.delete(
            f"/api/v1/community/channels/{channel.id}/calendar/events/{event_id}",
            headers=auth_headers(super_admin_token),
        )
        assert delete_resp.status_code == status.HTTP_200_OK

        after_list = client.get(
            f"/api/v1/community/channels/{channel.id}/calendar/events?year=2026&month=6",
            headers=auth_headers(super_admin_token),
        )
        assert after_list.json()["total"] == 0

    def test_member_cannot_create_calendar_event(
        self,
        client,
        db_session,
        super_admin,
        super_admin_token,
        sample_user,
        user_token,
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        self._add_member(db_session, super_admin.tenant_id, channel.id, sample_user.id, role="member")

        resp = client.post(
            f"/api/v1/community/channels/{channel.id}/calendar/events",
            headers=auth_headers(user_token),
            json={
                "title": "普通成员尝试",
                "event_type": "meeting",
                "start_time": "2026-06-21T10:00:00+08:00",
            },
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_non_member_cannot_read_calendar(
        self,
        client,
        db_session,
        super_admin,
        super_admin_token,
        sample_user,
        user_token,
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        self._create_calendar_event(
            db_session,
            tenant_id=channel.tenant_id,
            channel_id=channel.id,
            author_user_id=super_admin.id,
            title="内部事件",
            start_time=super_admin.create_time,
        )

        resp = client.get(
            f"/api/v1/community/channels/{channel.id}/calendar/events",
            headers=auth_headers(user_token),
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_channel_cascades_calendar_events(
        self,
        client,
        db_session,
        super_admin,
        super_admin_token,
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        channel_id = channel.id
        for index in range(3):
            self._create_calendar_event(
                db_session,
                tenant_id=channel.tenant_id,
                channel_id=channel_id,
                author_user_id=super_admin.id,
                title=f"事件 {index}",
                start_time=super_admin.create_time,
            )

        before = db_session.query(CommunityChannelCalendarEvent).filter(
            CommunityChannelCalendarEvent.channel_id == channel_id
        ).count()
        assert before == 3

        delete_resp = client.delete(
            f"/api/v1/community/channels/{channel_id}",
            headers=auth_headers(super_admin_token),
        )
        assert delete_resp.status_code == status.HTTP_200_OK
        assert delete_resp.json()["deleted_calendar_events"] == 3

        db_session.expunge_all()
        after = db_session.query(CommunityChannelCalendarEvent).filter(
            CommunityChannelCalendarEvent.channel_id == channel_id
        ).count()
        assert after == 0

    def test_cross_tenant_calendar_lookup_is_blocked(
        self,
        client,
        db_session,
        super_admin,
        super_admin_token,
    ):
        channel = self._create_channel(db_session, super_admin.tenant_id, super_admin.id)
        event = self._create_calendar_event(
            db_session,
            tenant_id=channel.tenant_id,
            channel_id=channel.id,
            author_user_id=super_admin.id,
            title="跨租户测试",
            start_time=super_admin.create_time,
        )

        other_token = create_access_token(
            sub="99999",
            role="admin",
            tenant_id=999,
        )
        resp = client.get(
            f"/api/v1/community/channels/{channel.id}/calendar/events/{event.id}",
            headers=auth_headers(other_token),
        )
        assert resp.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND,
        )
