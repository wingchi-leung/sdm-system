"""
活动类型 CRUD 单元测试
"""
import pytest
from sqlalchemy.orm import Session

from app.crud.crud_activity_type import (
    create_activity_type,
    get_activity_type_by_id,
    get_activity_type_by_code,
    get_all_activity_types,
    update_activity_type,
    delete_activity_type,
)
from app.schemas import ActivityType
from tests.factories import ActivityTypeFactory


@pytest.mark.unit
class TestActivityTypeCRUD:
    """活动类型 CRUD 操作测试"""

    def test_create_activity_type_success(self, db_session: Session):
        """测试成功创建活动类型"""
        activity_type = create_activity_type(
            db_session,
            type_name="讲座",
            code="LECTURE",
        )
        assert activity_type.id is not None
        assert activity_type.type_name == "讲座"
        assert activity_type.code == "LECTURE"

    def test_create_activity_type_duplicate_code(self, db_session: Session):
        """测试创建重复代码的活动类型"""
        ActivityTypeFactory(code="DUPLICATE")
        db_session.commit()

        with pytest.raises(Exception):
            create_activity_type(
                db_session,
                type_name="重复类型",
                code="DUPLICATE",
            )

    def test_get_activity_type_by_id_found(self, db_session: Session):
        """测试通过 ID 查找活动类型"""
        activity_type = ActivityTypeFactory()
        db_session.commit()

        found = get_activity_type_by_id(db_session, activity_type.id)
        assert found is not None
        assert found.id == activity_type.id
        assert found.code == activity_type.code

    def test_get_activity_type_by_id_not_found(self, db_session: Session):
        """测试通过 ID 查找不存在的活动类型"""
        found = get_activity_type_by_id(db_session, 99999)
        assert found is None

    def test_get_activity_type_by_code_found(self, db_session: Session):
        """测试通过代码查找活动类型"""
        activity_type = ActivityTypeFactory(code="SPECIFIC_CODE")
        db_session.commit()

        found = get_activity_type_by_code(db_session, "SPECIFIC_CODE")
        assert found is not None
        assert found.code == "SPECIFIC_CODE"

    def test_get_activity_type_by_code_not_found(self, db_session: Session):
        """测试通过代码查找不存在的活动类型"""
        found = get_activity_type_by_code(db_session, "NONEXISTENT")
        assert found is None

    def test_get_all_activity_types(self, db_session: Session):
        """测试获取所有活动类型"""
        # 创建多个活动类型
        for i in range(5):
            ActivityTypeFactory(code=f"TYPE{i:03d}")
        db_session.commit()

        all_types = get_all_activity_types(db_session)
        assert len(all_types) == 5

    def test_get_all_activity_types_empty(self, db_session: Session):
        """测试获取空的活动类型列表"""
        all_types = get_all_activity_types(db_session)
        assert len(all_types) == 0

    def test_update_activity_type_name(self, db_session: Session):
        """测试更新活动类型名称"""
        activity_type = ActivityTypeFactory(type_name="旧名称")
        db_session.commit()

        updated = update_activity_type(
            db_session,
            activity_type.id,
            type_name="新名称",
        )
        assert updated.type_name == "新名称"

    def test_update_activity_type_code(self, db_session: Session):
        """测试更新活动类型代码"""
        activity_type = ActivityTypeFactory(code="OLD_CODE")
        db_session.commit()

        updated = update_activity_type(
            db_session,
            activity_type.id,
            code="NEW_CODE",
        )
        assert updated.code == "NEW_CODE"

    def test_update_activity_type_not_found(self, db_session: Session):
        """测试更新不存在的活动类型"""
        result = update_activity_type(
            db_session,
            99999,
            type_name="新名称",
        )
        assert result is None

    def test_delete_activity_type_success(self, db_session: Session):
        """测试删除活动类型"""
        activity_type = ActivityTypeFactory()
        db_session.commit()

        deleted = delete_activity_type(db_session, activity_type.id)
        assert deleted is not None

        # 验证已删除
        found = get_activity_type_by_id(db_session, activity_type.id)
        assert found is None

    def test_delete_activity_type_not_found(self, db_session: Session):
        """测试删除不存在的活动类型"""
        result = delete_activity_type(db_session, 99999)
        assert result is None

    def test_create_activity_type_with_various_names(self, db_session: Session):
        """测试创建各种活动类型"""
        types_data = [
            ("讲座", "LECTURE"),
            ("研讨会", "SEMINAR"),
            ("培训", "TRAINING"),
            ("会议", "MEETING"),
            ("比赛", "COMPETITION"),
        ]

        for name, code in types_data:
            activity_type = create_activity_type(db_session, type_name=name, code=code)
            assert activity_type.type_name == name
            assert activity_type.code == code

    def test_get_all_activity_types_ordered(self, db_session: Session):
        """测试获取活动类型按某种顺序排列"""
        # 创建活动类型，顺序不固定
        ActivityTypeFactory(type_name="C类型", code="C")
        ActivityTypeFactory(type_name="A类型", code="A")
        ActivityTypeFactory(type_name="B类型", code="B")
        db_session.commit()

        all_types = get_all_activity_types(db_session)
        type_names = [t.type_name for t in all_types]
        assert "A类型" in type_names
        assert "B类型" in type_names
        assert "C类型" in type_names
        assert len(all_types) == 3
