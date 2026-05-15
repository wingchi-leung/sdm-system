#!/usr/bin/env bash
set -euo pipefail

echo "==> 拉取最新镜像"
docker compose pull backend frontend

echo "==> 启动/更新服务"
docker compose up -d mysql backend frontend

echo "==> 当前状态"
docker compose ps
