import pytest

import create_admin


@pytest.mark.unit
def test_get_bootstrap_password_from_settings(monkeypatch):
    monkeypatch.setattr(
        create_admin.settings,
        "BOOTSTRAP_ADMIN_PASSWORD",
        "  secure-bootstrap-password  ",
        raising=False,
    )

    assert create_admin._get_bootstrap_password() == "secure-bootstrap-password"


@pytest.mark.unit
def test_get_bootstrap_password_requires_explicit_configuration(monkeypatch):
    monkeypatch.setattr(
        create_admin.settings,
        "BOOTSTRAP_ADMIN_PASSWORD",
        None,
        raising=False,
    )

    with pytest.raises(RuntimeError, match="BOOTSTRAP_ADMIN_PASSWORD"):
        create_admin._get_bootstrap_password()

