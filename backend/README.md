# SDM 活动报名/签到后端

## 用 uv 启动（推荐）

项目用 [uv](https://docs.astral.sh/uv/) 管理虚拟环境和依赖。**MySQL 8 需要 `cryptography` 才能连**，已在 `pyproject.toml` 里配好，用 `uv sync` 会一起装上。

### 首次 / 拉代码后

在 **backend 目录** 下：

```bash
cd backend
uv venv
uv sync
```

### 启动后端

```bash
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

`uv run` 会用当前项目的 `.venv` 和依赖，不用再 `source .venv/bin/activate`。

---

## 不用 uv 时（pip 备用）

若本机没装 uv，用系统 Python 建 venv 并装依赖。**必须用 `.venv` 里的 uvicorn 启动**，否则会报 `cryptography' package is required for sha256_password or caching_sha2_password`。

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

以后每次启动：

```bash
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

或用脚本（会检查并安装依赖再启动）：`./run.sh`

---

## 管理员登录（App 内发布活动用）

- **鉴权用哪张表？** 用 **admin_user** 表（username + password_hash），**不是 user 表**。user 表没有密码字段，是存报名用户/黑名单的。
- 接口：`POST /api/v1/auth/login`，body：`{"username":"xxx","password":"xxx"}`，成功返回 `access_token`（JWT）。
- 创建活动 `POST /api/v1/activities` 需在请求头带 `Authorization: Bearer <access_token>`，仅管理员可调用。

**首次使用**：建表并插入一个管理员（密码示例：mysql123456）。

1. 建表：执行 `table.sql` 里的 `CREATE TABLE admin_user` 部分，或整份 `table.sql`。
2. 生成密码 hash（**必须用你要登录的密码**）：
   ```bash
   python scripts/hash_admin_password.py mysql123456
   ```
   复制输出的整段 hash（形如 `$2b$12$...`）。
3. 在库里插入管理员（把 `<hash>` 换成上一步的整段输出）：
   ```sql
   INSERT INTO admin_user (username, password_hash) VALUES ('admin', '<hash>');
   ```
4. 前端用 **用户名 admin**、**密码 mysql123456** 登录。

若仍报「用户名或密码错误」，请看 `docs/鉴权说明.md` 逐项排查。生产环境请在 `.env` 中设置 `JWT_SECRET`。

---

## 微信小程序授权登录（可选）

- 接口：`POST /api/v1/auth/wechat-login`，Body：`{ "code": "小程序 wx.login() 返回的 code" }`，成功返回与 `user-login` 相同的 `access_token`、`user_id`、`user_name`。
- 需在 **user 表** 增加字段：执行 `table.sql` 末尾的 `ALTER TABLE user ADD COLUMN wx_openid ...` 及唯一索引。
- 在 `.env` 中配置 **WECHAT_APPID**、**WECHAT_SECRET**（小程序后台「开发 → 开发管理 → 开发设置」）。不配置时该接口返回 503。

---

依赖以 **`pyproject.toml`** 为准；`requirements.txt` 与之同步，供 pip 使用。
