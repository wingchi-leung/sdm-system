#!/bin/bash
# 用当前目录的 .venv 启动后端，确保用到已安装的 cryptography
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "未找到 .venv，请先执行: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

echo "检查依赖（cryptography 为 MySQL 8 认证必需）..."
.venv/bin/python -c "import cryptography; import pymysql; print('OK: cryptography 与 pymysql 已就绪')" || {
  echo "缺少依赖，正在安装..."
  .venv/bin/pip install -r requirements.txt -q
}

echo "启动后端 (uvicorn)..."
exec .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
