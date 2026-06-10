from sqlalchemy import text


def test_get_notifications_config(client, user_token):
    response = client.get(
        "/api/v1/notifications/config",
        headers={"Authorization": f"Bearer {user_token}"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "enabled" in payload
    assert payload["retry_max"] == 5


def test_upsert_subscribe_consent(client, user_token):
    response = client.post(
        "/api/v1/notifications/subscribe-consent",
        headers={"Authorization": f"Bearer {user_token}"},
        json={
            "template_id": "tpl_refund_success",
            "accept_status": "accept",
            "source_page": "pages/register/register",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["template_id"] == "tpl_refund_success"
    assert data["accept_status"] == "accept"


def test_retry_message_task_requires_admin(client, db_session, activity_admin_token, default_tenant):
    db_session.execute(
        text(
            """
            INSERT INTO message_task (
                tenant_id, scene, biz_id, user_id, openid, template_id, payload_json, status, retry_count, max_retry, create_time, update_time
            ) VALUES (:tenant_id, 'refund_failed', 1, 1, 'openid_x', 'tpl_x', '{"thing1":{"value":"x"}}', 'failed', 1, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """
        ),
        {"tenant_id": default_tenant.id},
    )
    db_session.commit()
    task_id = db_session.execute(text("SELECT id FROM message_task ORDER BY id DESC LIMIT 1")).scalar_one()

    response = client.post(
        f"/api/v1/notifications/tasks/{task_id}/retry",
        headers={"Authorization": f"Bearer {activity_admin_token}"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "pending"
