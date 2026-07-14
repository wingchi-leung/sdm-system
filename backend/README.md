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


## Teams 社区归档导入

可将 `tools/teams-community-crawler` 生成的批次目录导入本机社区频道。Teams 主帖会成为频道帖子，筛选出的回复会成为该帖评论，图片复制到本机社区上传目录。回复只保留原文字和图片，纯图片回复不额外显示作者、时间或“图片回复”占位文字。命令默认仅校验，提供 `--apply` 才会写入数据库。

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\import_teams_community.py `
  "D:\下载\TeamsCommunity\PPP-20260714-130044" `
  --channel-id 3 `
  --limit 1

# 确认校验结果后实际导入
.\.venv\Scripts\python.exe scripts\import_teams_community.py `
  "D:\下载\TeamsCommunity\PPP-20260714-130044" `
  --channel-id 3 `
  --limit 1 `
  --apply
```

每个帖子正文带有不可见的 Teams 来源标记，并记录已经导入的回复 ID；同一批次可重复运行，已有帖子和回复不会重复创建。当前命令仅支持 `STORAGE_TYPE=local`。
