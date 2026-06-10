from app.database import SessionLocal
from app.schemas import User, Tenant
from app.crud import crud_credential, crud_rbac

USERNAME = "wechatadmin"
PASSWORD = "sdm@1234561"
TENANT_CODE = "default"
NAME = "超级管理员"
PHONE = "13900000001"

db = SessionLocal()
try:
    tenant = db.query(Tenant).filter(Tenant.code == TENANT_CODE).first()
    if not tenant:
        raise RuntimeError(f"租户不存在: {TENANT_CODE}")

    user = db.query(User).filter(User.tenant_id == tenant.id, User.phone == PHONE).first()
    if not user:
        user = User(
            tenant_id=tenant.id,
            name=NAME,
            phone=PHONE,
            sex="M",
        )
        db.add(user)
        db.flush()

    crud_credential.create_password_credential(
        db=db,
        user_id=user.id,
        tenant_id=tenant.id,
        identifier=USERNAME,
        password=PASSWORD,
        must_reset=False,
    )

    try:
        crud_rbac.assign_user_role(
            db=db,
            user_id=user.id,
            role_id=1,
            tenant_id=tenant.id,
            scope_type=None,
            scope_id=None,
        )
    except ValueError as e:
        if "已分配" not in str(e):
            raise

    db.commit()
    print(f"OK: 已创建/更新超级管理员 username={USERNAME}, tenant_code={TENANT_CODE}")
finally:
    db.close()
EOF

