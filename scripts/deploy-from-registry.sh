#!/usr/bin/env bash
set -euo pipefail

PULL_IMAGES="${PULL_IMAGES:-1}"

if [[ "${1:-}" == "--no-pull" ]]; then
  PULL_IMAGES=0
elif [[ "${1:-}" == "--pull" ]]; then
  PULL_IMAGES=1
fi

if [[ "$PULL_IMAGES" == "1" ]]; then
  echo "==> 拉取最新镜像"
  docker compose pull backend frontend
else
  echo "==> 跳过拉取镜像（仅应用 .env / compose 变更）"
fi

echo "==> 启动/更新服务"
docker compose up -d mysql backend frontend

echo "==> 当前状态"
docker compose ps
