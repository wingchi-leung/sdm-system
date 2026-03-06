"""
活动类型 CRUD 单元测试
"""
import pytest
from sqlalchemy.orm import Session

from app.crud.crud_activity_type import (
    get_by_id,
    get_by_name,
    get_or_create_by_name,
    list_all,
)
from app.schemas import ActivityType


@pytest.mark.unit
class TestActivityTypeCRUD:
    """活动类型 CRUD 操作测试"""

    def test_get_by_id_found(self, db_session: Session):
        """测试通过 ID 查找活动类型"""
        activity_type = ActivityType(
            type_name="测试类型",
            code="TEST001",
            tenant_id=1,
        )
        db_session.add(activity_type)
        db_session.commit()
        db_session.refresh(activity_type)

        found = get_by_id(db_session, activity_type.id, tenant_id=1)
        assert found is not None
        assert found.id == activity_type.id
        assert found.code == "TEST001"

    def test_get_by_id_not_found(self, db_session: Session):
        """测试通过 ID 查找不存在的活动类型"""
        found = get_by_id(db_session, 99999, tenant_id=1)
        assert found is None

    def test_get_by_id_different_tenant(self, db_session: Session):
        """测试跨租户隔离"""
        activity_type = ActivityType(
            type_name="租户1类型",
            code="T1",
            tenant_id=1,
        )
        db_session.add(activity_type)
        db_session.commit()
        db_session.refresh(activity_type)

        # 租户2 查询不到租户1的数据
        found = get_by_id(db_session, activity_type.id, tenant_id=2)
        assert found is None

    def test_get_by_name_found(self, db_session: Session):
        """测试通过名称查找活动类型"""
        activity_type = ActivityType(
            type_name="讲座",
            code="LECTURE",
            tenant_id=1,
        )
        db_session.add(activity_type)
        db_session.commit()

        found = get_by_name(db_session, "讲座", tenant_id=1)
        assert found is not None
        assert found.type_name == "讲座"

    def test_get_by_name_not_found(self, db_session: Session):
        """测试通过名称查找不存在的活动类型"""
        found = get_by_name(db_session, "不存在的类型", tenant_id=1)
        assert found is None

    def test_get_by_name_empty_string(self, db_session: Session):
        """测试空字符串名称"""
        found = get_by_name(db_session, "", tenant_id=1)
        assert found is None

        found = get_by_name(db_session, "   ", tenant_id=1)
        assert found is None

    def test_get_or_create_by_name_existing(self, db_session: Session):
        """测试获取已存在的活动类型"""
        activity_type = ActivityType(
            type_name="研讨会",
            code="SEMINAR",
            tenant_id=1,
        )
        db_session.add(activity_type)
        db_session.commit()
        db_session.refresh(activity_type)

        result = get_or_create_by_name(db_session, "研讨会", tenant_id=1)
        assert result.id == activity_type.id
        assert result.code == "SEMINAR"

    def test_get_or_create_by_name_new(self, db_session: Session):
        """测试创建新的活动类型"""
        result = get_or_create_by_name(
            db_session, "新类型", tenant_id=1, code="NEW"
        )
        assert result is not None
        assert result.type_name == "新类型"
        assert result.code == "NEW"

    def test_get_or_create_by_name_empty(self, db_session: Session):
        """测试空名称创建"""
        with pytest.raises(ValueError):
            get_or_create_by_name(db_session, "", tenant_id=1)

    def test_list_all(self, db_session: Session):
        """测试获取所有活动类型"""
        # 创建多个活动类型
        types = [
            ActivityType(type_name="A类型", code="A", tenant_id=1),
            ActivityType(type_name="B类型", code="B", tenant_id=1),
            ActivityType(type_name="C类型", code="C", tenant_id=1),
        ]
        for t in types:
            db_session.add(t)
        db_session.commit()

        all_types = list_all(db_session, tenant_id=1)
        assert len(all_types) == 3

        # 应该按名称排序
        type_names = [t.type_name for t in all_types]
        assert type_names == ["A类型", "B类型", "C类型"]

    def test_list_all_empty(self, db_session: Session):
        """测试获取空活动类型列表"""
        all_types = list_all(db_session, tenant_id=1)
        assert len(all_types) == 0

    def test_list_all_tenant_isolation(self, db_session: Session):
        """测试租户隔离"""
        # 租户1的类型
        type1 = ActivityType(type_name="租户1类型", code="T1", tenant_id=1)
        db_session.add(type1)

        # 租户2的类型
        type2 = ActivityType(type_name="租户2类型", code="T2", tenant_id=2)
        db_session.add(type2)
        db_session.commit()

        # 租户1只能看到自己的类型
        tenant1_types = list_all(db_session, tenant_id=1)
        assert len(tenant1_types) == 1
        assert tenant1_types[0].code == "T1"

        # 租户2只能看到自己的类型
        tenant2_types = list_all(db_session, tenant_id=2)
        assert len(tenant2_types) == 1
        assert tenant2_types[0].code == "T2"

    def test_get_or_create_by_name_trim_whitespace(self, db_session: Session):
        """测试名称自动去除空格"""
        result = get_or_create_by_name(
            db_session, "  测试类型  ", tenant_id=1, code="TEST"
        )
        assert result.type_name == "测试类型"

    def test_get_by_name_trim_whitespace(self, db_session: Session):
        """测试查询时去除空格"""
        activity_type = ActivityType(
            type_name="测试",
            code="TEST",
            tenant_id=1,
        )
        db_session.add(activity_type)
        db_session.commit()

        found = get_by_name(db_session, "  测试  ", tenant_id=1)
        assert found is not None
        assert found.code == "TEST"
