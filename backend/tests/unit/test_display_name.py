from app.core.display_name import normalize_display_name


def test_normalize_display_name_keeps_normal_name():
    assert normalize_display_name("张三", "用户") == "张三"


def test_normalize_display_name_falls_back_for_token_like_value():
    assert normalize_display_name("ggqVUNPuWq1xjf97PWVGPL9COOGnPo3pqZ8OIBYHJb", "微信用户") == "微信用户"


def test_normalize_display_name_falls_back_for_empty_value():
    assert normalize_display_name("   ", "微信用户") == "微信用户"
