"""
支付 API 测试
"""
from datetime import datetime, timedelta
import base64

import pytest
from fastapi import status
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding

from app.crud import crud_credential, crud_payment
from app.core.config import settings
from app.core import sensitive_field_crypto
from app.schemas import ActivityParticipant, PaymentOrder
from app.tasks import scheduler
from tests.conftest import auth_headers

_TEST_RSA_PUBLIC_KEY = None


@pytest.fixture(autouse=True)
def setup_sensitive_rsa_keys(monkeypatch):
    global _TEST_RSA_PUBLIC_KEY
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    monkeypatch.setattr(settings, "SENSITIVE_RSA_KEY_ID", "v1", raising=False)
    monkeypatch.setattr(settings, "SENSITIVE_RSA_PRIVATE_KEY", private_pem, raising=False)
    monkeypatch.setattr(settings, "SENSITIVE_RSA_PUBLIC_KEY", public_pem, raising=False)
    monkeypatch.setattr(settings, "SENSITIVE_RSA_PRIVATE_KEYS_JSON", None, raising=False)
    monkeypatch.setattr(settings, "SENSITIVE_RSA_PUBLIC_KEYS_JSON", None, raising=False)
    sensitive_field_crypto._load_private_key_map.cache_clear()
    sensitive_field_crypto._load_private_key_by_kid.cache_clear()
    sensitive_field_crypto._load_public_key_map.cache_clear()
    _TEST_RSA_PUBLIC_KEY = public_key
    yield


def _payment_request_payload(activity_id: int) -> dict:
    payload = {
        "activity_id": activity_id,
        "participant_name": "支付报名用户",
        "phone": "13900139111",
        "identity_type": "mainland",
        "identity_number": "110101199001011234",
        "sex": "M",
        "age": 30,
        "occupation": "工程师",
        "email": "pay@example.com",
        "industry": "教育",
        "why_join": "想系统学习",
        "channel": "朋友推荐",
        "expectation": "提升能力",
        "activity_understanding": "有基础了解",
        "has_questions": "暂无",
        "actual_fee": 1000,
    }
    phone_plain = payload.get("phone")
    if phone_plain:
        payload["phone_encrypted"] = base64.b64encode(
            _TEST_RSA_PUBLIC_KEY.encrypt(phone_plain.encode("utf-8"), padding.PKCS1v15())
        ).decode("utf-8")
        payload["encryption_kid"] = "v1"
    identity_plain = payload.get("identity_number")
    if identity_plain:
        payload["identity_number_encrypted"] = base64.b64encode(
            _TEST_RSA_PUBLIC_KEY.encrypt(identity_plain.encode("utf-8"), padding.PKCS1v15())
        ).decode("utf-8")
    return payload


def _bind_wechat_openid(db_session, user, openid: str) -> None:
    crud_credential.bind_wechat_credential(
        db_session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        openid=openid,
    )
    db_session.commit()


def _create_pending_participant(db_session, activity, user, payload: dict) -> ActivityParticipant:
    participant = ActivityParticipant(
        tenant_id=user.tenant_id,
        activity_id=activity.id,
        user_id=user.id,
        participant_name=payload["participant_name"],
        phone=payload["phone"],
        identity_number=payload["identity_number"],
        identity_type=payload["identity_type"],
        sex=payload["sex"],
        age=payload["age"],
        occupation=payload["occupation"],
        email=payload["email"],
        industry=payload["industry"],
        why_join=payload["why_join"],
        channel=payload["channel"],
        expectation=payload["expectation"],
        activity_understanding=payload["activity_understanding"],
        has_questions=payload["has_questions"],
        enroll_status=1,
        payment_status=1,
        paid_amount=0,
    )
    db_session.add(participant)
    db_session.commit()
    db_session.refresh(participant)
    return participant


@pytest.mark.api
class TestPaymentEndpoints:
    def test_create_payment_order_stores_encrypted_participant_only(
        self,
        client,
        db_session,
        sample_activity,
        sample_user,
        user_token,
        monkeypatch,
    ):
        sample_activity.require_payment = 1
        sample_activity.suggested_fee = 1000
        _bind_wechat_openid(db_session, sample_user, "wx_openid_payment_create")
        sample_user.name = "资料库用户"
        sample_user.phone = "13800138000"
        sample_user.identity_number = "110101199001011234"
        sample_user.identity_type = "mainland"
        sample_user.sex = "F"
        sample_user.age = 28
        sample_user.occupation = "产品经理"
        sample_user.email = "profile@example.com"
        sample_user.industry = "教育"
        db_session.commit()

        class FakePayService:
            def generate_order_no(self):
                return "SDMTESTORDER001"

            def create_jsapi_order(self, **kwargs):
                return 200, {"prepay_id": "prepay_test_001"}

            def get_mini_program_payment_params(self, prepay_id):
                return {
                    "timeStamp": "1710000000",
                    "nonceStr": "nonce",
                    "package": f"prepay_id={prepay_id}",
                    "signType": "RSA",
                    "paySign": "signature",
                }

        monkeypatch.setattr(
            "app.api.v1.endpoints.payments.get_wechat_pay_service",
            lambda: FakePayService(),
        )

        payload = _payment_request_payload(sample_activity.id)
        payload.update({
            "participant_name": "伪造支付报名用户",
            "phone": "13900139999",
            "identity_number": "110101199001019999",
            "sex": "M",
            "age": 18,
            "occupation": "伪造职业",
            "email": "fake@example.com",
            "industry": "伪造行业",
        })

        response = client.post(
            "/api/v1/payments/create",
            headers=auth_headers(user_token),
            json=payload,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["order_no"] == "SDMTESTORDER001"
        assert data["payment_params"]["package"] == "prepay_id=prepay_test_001"

        order = db_session.query(PaymentOrder).filter(
            PaymentOrder.order_no == "SDMTESTORDER001"
        ).first()
        assert order is not None
        assert order.participant_id is not None

        participant = db_session.get(ActivityParticipant, order.participant_id)
        assert participant is not None
        assert participant.participant_name == "资料库用户"
        assert participant.phone == "13800138000"
        assert participant.identity_number is None
        assert participant.identity_type is None
        assert participant.payment_status == 1
        assert participant.why_join == "想系统学习"
        assert participant.channel == "朋友推荐"
        assert participant.expectation == "提升能力"
        assert participant._participant_name_ciphertext != "资料库用户"
        assert participant._phone_ciphertext != "13800138000"
        assert participant._identity_number_ciphertext != "110101199001011234"

    def test_admin_can_create_payment_order_when_has_user_identity(
        self,
        client,
        db_session,
        sample_activity,
        super_admin_token,
        super_admin,
        monkeypatch,
    ):
        sample_activity.require_payment = 1
        sample_activity.suggested_fee = 1000
        _bind_wechat_openid(db_session, super_admin, "wx_openid_admin_pay")

        class FakePayService:
            def generate_order_no(self):
                return "SDMADMINPAY001"

            def create_jsapi_order(self, **kwargs):
                return 200, {"prepay_id": "prepay_admin_pay_001"}

            def get_mini_program_payment_params(self, prepay_id):
                return {
                    "timeStamp": "1710000010",
                    "nonceStr": "nonce_admin_pay",
                    "package": f"prepay_id={prepay_id}",
                    "signType": "RSA",
                    "paySign": "signature_admin_pay",
                }

        monkeypatch.setattr(
            "app.api.v1.endpoints.payments.get_wechat_pay_service",
            lambda: FakePayService(),
        )

        response = client.post(
            "/api/v1/payments/create",
            headers=auth_headers(super_admin_token),
            json=_payment_request_payload(sample_activity.id),
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["order_no"] == "SDMADMINPAY001"

    def test_ended_activity_rejects_payment_order(
        self,
        client,
        db_session,
        sample_activity,
        sample_user,
        user_token,
    ):
        sample_activity.require_payment = 1
        sample_activity.suggested_fee = 1000
        sample_activity.status = 3
        _bind_wechat_openid(db_session, sample_user, "wx_openid_ended_payment")

        response = client.post(
            "/api/v1/payments/create",
            headers=auth_headers(user_token),
            json=_payment_request_payload(sample_activity.id),
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "不可报名" in response.json()["detail"]

    def test_create_payment_order_rejects_blocked_user(
        self,
        client,
        db_session,
        sample_activity,
        blocked_user,
    ):
        from app.core.security import create_access_token

        sample_activity.require_payment = 1
        sample_activity.suggested_fee = 1000
        _bind_wechat_openid(db_session, blocked_user, "wx_openid_blocked_payment")

        blocked_token = create_access_token(
            sub=str(blocked_user.id),
            role="user",
            tenant_id=blocked_user.tenant_id,
        )

        response = client.post(
            "/api/v1/payments/create",
            headers=auth_headers(blocked_token),
            json=_payment_request_payload(sample_activity.id),
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "无法报名" in response.json()["detail"]

    def test_create_payment_order_reuses_pending_order(
        self,
        client,
        db_session,
        sample_activity,
        sample_user,
        user_token,
        monkeypatch,
    ):
        sample_activity.require_payment = 1
        sample_activity.suggested_fee = 1000
        _bind_wechat_openid(db_session, sample_user, "wx_openid_pending")

        class FakePayService:
            def get_mini_program_payment_params(self, prepay_id):
                return {
                    "timeStamp": "1710000003",
                    "nonceStr": "nonce_pending",
                    "package": f"prepay_id={prepay_id}",
                    "signType": "RSA",
                    "paySign": "signature_pending",
                }

        monkeypatch.setattr(
            "app.api.v1.endpoints.payments.get_wechat_pay_service",
            lambda: FakePayService(),
        )

        payload = _payment_request_payload(sample_activity.id)
        participant = _create_pending_participant(db_session, sample_activity, sample_user, payload)
        crud_payment.create_payment_order(
            db=db_session,
            order_no="SDMPENDING001",
            activity_id=sample_activity.id,
            user_id=sample_user.id,
            participant_id=participant.id,
            openid="wx_openid_pending",
            suggested_fee=1000,
            actual_fee=1000,
            prepay_id="prepay_pending",
            tenant_id=sample_user.tenant_id,
        )

        response = client.post(
            "/api/v1/payments/create",
            headers=auth_headers(user_token),
            json=_payment_request_payload(sample_activity.id),
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["order_no"] == "SDMPENDING001"
        assert data["payment_params"]["package"] == "prepay_id=prepay_pending"

    def test_query_payment_order_recovers_success_from_wechat(
        self,
        client,
        db_session,
        sample_activity,
        sample_user,
        user_token,
        monkeypatch,
    ):
        from app.api.v1.endpoints import payments as payments_endpoint

        sample_activity.require_payment = 1
        sample_activity.suggested_fee = 1000
        _bind_wechat_openid(db_session, sample_user, "wx_openid_query_recover")

        payload = _payment_request_payload(sample_activity.id)
        participant = _create_pending_participant(db_session, sample_activity, sample_user, payload)
        order = crud_payment.create_payment_order(
            db=db_session,
            order_no="SDMQUERYRECOVER001",
            activity_id=sample_activity.id,
            user_id=sample_user.id,
            participant_id=participant.id,
            openid="wx_openid_query_recover",
            suggested_fee=1000,
            actual_fee=1000,
            prepay_id="prepay_query_recover",
            tenant_id=sample_user.tenant_id,
        )

        monkeypatch.setattr(payments_endpoint.settings, "WECHAT_APPID", "wx-test-app")
        monkeypatch.setattr(payments_endpoint.settings, "WECHAT_PAY_MCH_ID", "mch-test")

        class FakePayService:
            def query_order(self, order_no):
                return 200, {
                    "out_trade_no": order_no,
                    "transaction_id": "wx_txn_query_recover",
                    "trade_state": "SUCCESS",
                    "appid": "wx-test-app",
                    "mchid": "mch-test",
                    "amount": {"total": 1000},
                    "payer": {"openid": "wx_openid_query_recover"},
                }

        monkeypatch.setattr(
            "app.api.v1.endpoints.payments.get_wechat_pay_service",
            lambda: FakePayService(),
        )

        response = client.get(
            f"/api/v1/payments/order/{order.order_no}",
            headers=auth_headers(user_token),
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == crud_payment.PAYMENT_STATUS_SUCCESS
        assert data["participant_id"] == participant.id

        db_session.refresh(participant)
        assert participant.payment_status == 2
        assert participant.payment_order_id == order.id

    def test_create_payment_order_retries_stuck_creating_order(
        self,
        client,
        db_session,
        sample_activity,
        sample_user,
        user_token,
        monkeypatch,
    ):
        sample_activity.require_payment = 1
        sample_activity.suggested_fee = 1000
        _bind_wechat_openid(db_session, sample_user, "wx_openid_creating")

        payload = _payment_request_payload(sample_activity.id)
        participant = _create_pending_participant(db_session, sample_activity, sample_user, payload)
        stale_order = crud_payment.create_payment_order(
            db=db_session,
            order_no="SDMCREATING001",
            activity_id=sample_activity.id,
            user_id=sample_user.id,
            participant_id=participant.id,
            openid="wx_openid_creating",
            suggested_fee=1000,
            actual_fee=1000,
            prepay_id=None,
            tenant_id=sample_user.tenant_id,
            status=crud_payment.PAYMENT_STATUS_CREATING,
        )

        class FakePayService:
            def generate_order_no(self):
                return "SDMCREATING002"

            def create_jsapi_order(self, **kwargs):
                return 200, {"prepay_id": "prepay_creating_002"}

            def get_mini_program_payment_params(self, prepay_id):
                return {
                    "timeStamp": "1710000004",
                    "nonceStr": "nonce_creating",
                    "package": f"prepay_id={prepay_id}",
                    "signType": "RSA",
                    "paySign": "signature_creating",
                }

        monkeypatch.setattr(
            "app.api.v1.endpoints.payments.get_wechat_pay_service",
            lambda: FakePayService(),
        )

        response = client.post(
            "/api/v1/payments/create",
            headers=auth_headers(user_token),
            json=_payment_request_payload(sample_activity.id),
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["order_no"] == "SDMCREATING002"

        db_session.refresh(stale_order)
        assert stale_order.status == crud_payment.PAYMENT_STATUS_FAILED

    def test_create_payment_order_closes_remote_order_when_db_save_fails(
        self,
        client,
        db_session,
        sample_activity,
        sample_user,
        user_token,
        monkeypatch,
    ):
        sample_activity.require_payment = 1
        sample_activity.suggested_fee = 1000
        _bind_wechat_openid(db_session, sample_user, "wx_openid_db_fail")

        closed_orders: list[str] = []

        class FakePayService:
            def generate_order_no(self):
                return "SDMDBFAIL001"

            def create_jsapi_order(self, **kwargs):
                return 200, {"prepay_id": "prepay_db_fail"}

            def close_order(self, order_no):
                closed_orders.append(order_no)
                return 200, {"status": "closed"}

            def get_mini_program_payment_params(self, prepay_id):
                return {
                    "timeStamp": "1710000002",
                    "nonceStr": "nonce_db_fail",
                    "package": f"prepay_id={prepay_id}",
                    "signType": "RSA",
                    "paySign": "signature_db_fail",
                }

        monkeypatch.setattr(
            "app.api.v1.endpoints.payments.get_wechat_pay_service",
            lambda: FakePayService(),
        )

        def raise_db_error(*args, **kwargs):
            raise RuntimeError("db activate failed")

        monkeypatch.setattr(
            "app.api.v1.endpoints.payments.crud_payment.mark_payment_order_pending",
            raise_db_error,
        )

        response = client.post(
            "/api/v1/payments/create",
            headers=auth_headers(user_token),
            json=_payment_request_payload(sample_activity.id),
        )

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert response.json()["detail"] == "创建支付订单失败"
        assert closed_orders == ["SDMDBFAIL001"]

        order = db_session.query(PaymentOrder).filter(
            PaymentOrder.order_no == "SDMDBFAIL001"
        ).first()
        assert order is None or order.status == crud_payment.PAYMENT_STATUS_FAILED

    def test_payment_notify_updates_waitlist_participant(
        self,
        client,
        db_session,
        sample_activity,
        sample_user,
        user_token,
        monkeypatch,
    ):
        from app.api.v1.endpoints import payments as payments_endpoint

        sample_activity.require_payment = 1
        sample_activity.suggested_fee = 1000
        sample_activity.max_participants = 1
        _bind_wechat_openid(db_session, sample_user, "wx_openid_notify")
        db_session.add(
            ActivityParticipant(
                tenant_id=sample_user.tenant_id,
                activity_id=sample_activity.id,
                user_id=999,
                participant_name="已占位用户",
                phone="13900139113",
                identity_number="110101199001011235",
                enroll_status=1,
            )
        )
        db_session.commit()

        payload = _payment_request_payload(sample_activity.id)
        participant = _create_pending_participant(db_session, sample_activity, sample_user, payload)
        participant.enroll_status = 2
        db_session.commit()

        order = crud_payment.create_payment_order(
            db=db_session,
            order_no="SDMNOTIFY001",
            activity_id=sample_activity.id,
            user_id=sample_user.id,
            participant_id=participant.id,
            openid="wx_openid_notify",
            suggested_fee=1000,
            actual_fee=1000,
            prepay_id="prepay_notify",
            tenant_id=sample_user.tenant_id,
        )

        monkeypatch.setattr(payments_endpoint.settings, "WECHAT_APPID", "wx-test-app")
        monkeypatch.setattr(payments_endpoint.settings, "WECHAT_PAY_MCH_ID", "mch-test")

        class FakePayService:
            def decrypt_callback(self, headers, body):
                return {
                    "resource": {
                        "out_trade_no": order.order_no,
                        "transaction_id": "wx_txn_001",
                        "trade_state": "SUCCESS",
                        "appid": "wx-test-app",
                        "mchid": "mch-test",
                        "amount": {"total": 1000},
                        "payer": {"openid": "wx_openid_notify"},
                    }
                }

        monkeypatch.setattr(
            "app.api.v1.endpoints.payments.get_wechat_pay_service",
            lambda: FakePayService(),
        )

        notify_response = client.post(
            "/api/v1/payments/notify",
            content=b"{}",
            headers={"Content-Type": "application/json"},
        )

        assert notify_response.status_code == status.HTTP_200_OK
        assert notify_response.json()["code"] == "SUCCESS"

        db_session.refresh(order)
        db_session.refresh(participant)
        assert order.status == crud_payment.PAYMENT_STATUS_SUCCESS
        assert participant.enroll_status == 2
        assert participant.payment_status == 2
        assert participant.paid_amount == 1000
        assert participant.why_join == "想系统学习"
        assert participant.channel == "朋友推荐"
        assert participant.expectation == "提升能力"
        assert participant.activity_understanding == "有基础了解"
        assert participant.has_questions == "暂无"

        order_detail_response = client.get(
            f"/api/v1/payments/order/{order.order_no}",
            headers=auth_headers(user_token),
        )
        assert order_detail_response.status_code == status.HTTP_200_OK
        assert order_detail_response.json()["participant_enroll_status"] == 2

    def test_payment_notify_rejects_amount_mismatch(
        self,
        client,
        db_session,
        sample_activity,
        sample_user,
        monkeypatch,
    ):
        from app.api.v1.endpoints import payments as payments_endpoint

        sample_activity.require_payment = 1
        sample_activity.suggested_fee = 1000
        _bind_wechat_openid(db_session, sample_user, "wx_openid_mismatch")

        payload = _payment_request_payload(sample_activity.id)
        participant = _create_pending_participant(db_session, sample_activity, sample_user, payload)
        order = crud_payment.create_payment_order(
            db=db_session,
            order_no="SDMMISMATCH001",
            activity_id=sample_activity.id,
            user_id=sample_user.id,
            participant_id=participant.id,
            openid="wx_openid_mismatch",
            suggested_fee=1000,
            actual_fee=1000,
            prepay_id="prepay_mismatch",
            tenant_id=sample_user.tenant_id,
        )
        order_id = order.id
        participant_id = participant.id

        monkeypatch.setattr(payments_endpoint.settings, "WECHAT_APPID", "wx-test-app")
        monkeypatch.setattr(payments_endpoint.settings, "WECHAT_PAY_MCH_ID", "mch-test")

        class FakePayService:
            def decrypt_callback(self, headers, body):
                return {
                    "resource": {
                        "out_trade_no": order.order_no,
                        "transaction_id": "wx_txn_002",
                        "trade_state": "SUCCESS",
                        "appid": "wx-test-app",
                        "mchid": "mch-test",
                        "amount": {"total": 1},
                        "payer": {"openid": "wx_openid_mismatch"},
                    }
                }

        monkeypatch.setattr(
            "app.api.v1.endpoints.payments.get_wechat_pay_service",
            lambda: FakePayService(),
        )

        notify_response = client.post(
            "/api/v1/payments/notify",
            content=b"{}",
            headers={"Content-Type": "application/json"},
        )

        assert notify_response.status_code == status.HTTP_200_OK
        assert notify_response.json()["code"] == "FAIL"


    def test_payment_notify_without_identity_number_uses_user_uniqueness(
        self,
        client,
        db_session,
        sample_activity,
        sample_user,
        user_token,
        monkeypatch,
    ):
        from app.api.v1.endpoints import payments as payments_endpoint

        sample_activity.require_payment = 1
        sample_activity.suggested_fee = 1000
        _bind_wechat_openid(db_session, sample_user, "wx_openid_no_identity")
        sample_user.identity_number = None
        db_session.commit()

        payload = _payment_request_payload(sample_activity.id)
        payload["identity_number"] = None
        payload["identity_type"] = None
        payload["identity_number_encrypted"] = None

        class FakePayService:
            def __init__(self):
                self.order_no = "SDMNOIDENTITY001"

            def generate_order_no(self):
                return self.order_no

            def create_jsapi_order(self, **kwargs):
                return 200, {"prepay_id": "prepay_no_identity"}

            def get_mini_program_payment_params(self, prepay_id):
                return {
                    "timeStamp": "1710000001",
                    "nonceStr": "nonce_no_identity",
                    "package": f"prepay_id={prepay_id}",
                    "signType": "RSA",
                    "paySign": "signature_no_identity",
                }

            def decrypt_callback(self, headers, body):
                return {
                    "resource": {
                        "out_trade_no": self.order_no,
                        "transaction_id": "wx_txn_no_identity",
                        "trade_state": "SUCCESS",
                        "appid": "wx-test-app",
                        "mchid": "mch-test",
                        "amount": {"total": 1000},
                        "payer": {"openid": "wx_openid_no_identity"},
                    }
                }

        fake_pay_service = FakePayService()

        monkeypatch.setattr(payments_endpoint.settings, "WECHAT_APPID", "wx-test-app")
        monkeypatch.setattr(payments_endpoint.settings, "WECHAT_PAY_MCH_ID", "mch-test")
        monkeypatch.setattr(
            "app.api.v1.endpoints.payments.get_wechat_pay_service",
            lambda: fake_pay_service,
        )

        create_response = client.post(
            "/api/v1/payments/create",
            headers=auth_headers(user_token),
            json=payload,
        )
        assert create_response.status_code == status.HTTP_200_OK

        notify_response = client.post(
            "/api/v1/payments/notify",
            content=b"{}",
            headers={"Content-Type": "application/json"},
        )
        assert notify_response.status_code == status.HTTP_200_OK
        assert notify_response.json()["code"] == "SUCCESS"

        participant = db_session.query(ActivityParticipant).filter(
            ActivityParticipant.activity_id == sample_activity.id,
            ActivityParticipant.user_id == sample_user.id,
        ).one()
        assert participant.identity_number is None
        assert participant.payment_status == 2

        duplicate_response = client.post(
            "/api/v1/payments/create",
            headers=auth_headers(user_token),
            json=payload,
        )
        assert duplicate_response.status_code == status.HTTP_400_BAD_REQUEST
        assert "已报名" in duplicate_response.json()["detail"]


@pytest.mark.api
class TestPaymentScheduler:
    def test_close_expired_payment_orders_keeps_pending_when_remote_is_success(
        self,
        db_session,
        sample_activity,
        sample_user,
        monkeypatch,
    ):
        sample_activity.require_payment = 1
        _bind_wechat_openid(db_session, sample_user, "wx_openid_scheduler_success")

        payload = _payment_request_payload(sample_activity.id)
        participant = _create_pending_participant(db_session, sample_activity, sample_user, payload)
        order = crud_payment.create_payment_order(
            db=db_session,
            order_no="SDMSCHEDSUCCESS001",
            activity_id=sample_activity.id,
            user_id=sample_user.id,
            participant_id=participant.id,
            openid="wx_openid_scheduler_success",
            suggested_fee=1000,
            actual_fee=1000,
            prepay_id="prepay_scheduler_success",
            tenant_id=sample_user.tenant_id,
        )
        order.expire_at = datetime.now() - timedelta(minutes=1)
        db_session.commit()

        class FakePayService:
            def close_order(self, order_no):
                raise RuntimeError("close failed")

            def query_order(self, order_no):
                return 200, {"trade_state": "SUCCESS"}

        monkeypatch.setattr(scheduler, "SessionLocal", lambda: db_session)
        monkeypatch.setattr(db_session, "close", lambda: None)
        monkeypatch.setattr(
            scheduler,
            "get_wechat_pay_service",
            lambda: FakePayService(),
        )

        scheduler.close_expired_payment_orders()

        refreshed = db_session.get(PaymentOrder, order.id)
        assert refreshed is not None
        assert refreshed.status == crud_payment.PAYMENT_STATUS_PENDING

    def test_close_expired_payment_orders_marks_closed_when_remote_notpay(
        self,
        db_session,
        sample_activity,
        sample_user,
        monkeypatch,
    ):
        sample_activity.require_payment = 1
        _bind_wechat_openid(db_session, sample_user, "wx_openid_scheduler_notpay")

        payload = _payment_request_payload(sample_activity.id)
        participant = _create_pending_participant(db_session, sample_activity, sample_user, payload)
        order = crud_payment.create_payment_order(
            db=db_session,
            order_no="SDMSCHEDNOTPAY001",
            activity_id=sample_activity.id,
            user_id=sample_user.id,
            participant_id=participant.id,
            openid="wx_openid_scheduler_notpay",
            suggested_fee=1000,
            actual_fee=1000,
            prepay_id="prepay_scheduler_notpay",
            tenant_id=sample_user.tenant_id,
        )
        order.expire_at = datetime.now() - timedelta(minutes=1)
        db_session.commit()

        class FakePayService:
            def close_order(self, order_no):
                raise RuntimeError("close failed")

            def query_order(self, order_no):
                return 200, {"trade_state": "NOTPAY"}

        monkeypatch.setattr(scheduler, "SessionLocal", lambda: db_session)
        monkeypatch.setattr(db_session, "close", lambda: None)
        monkeypatch.setattr(
            scheduler,
            "get_wechat_pay_service",
            lambda: FakePayService(),
        )

        scheduler.close_expired_payment_orders()

        refreshed = db_session.get(PaymentOrder, order.id)
        assert refreshed is not None
        assert refreshed.status == crud_payment.PAYMENT_STATUS_CLOSED
