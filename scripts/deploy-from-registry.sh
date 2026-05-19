#!/usr/bin/env bash
set -euo pipefail

PULL_IMAGES="${PULL_IMAGES:-1}"
PULL_ONLY=0

if [[ "${1:-}" == "--no-pull" ]]; then
  PULL_IMAGES=0
elif [[ "${1:-}" == "--pull" ]]; then
  PULL_IMAGES=1
elif [[ "${1:-}" == "--pull-only" ]]; then
  PULL_ONLY=1
fi

if [[ "$PULL_IMAGES" == "1" || "$PULL_ONLY" == "1" ]]; then
  echo "==> 拉取最新镜像"
  docker compose pull backend frontend
else
  echo "==> 跳过拉取镜像（仅应用 .env / compose 变更）"
fi

if [[ "$PULL_ONLY" == "1" ]]; then
  echo "==> 镜像已拉取，未启动服务（运行不带参数的脚本以启动）"
  exit 0
fi

echo "==> 启动/更新服务"
docker compose up -d mysql backend frontend

echo "==> 当前状态"
docker compose ps
