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

 