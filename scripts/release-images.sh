#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "用法: $0 <dockerhub用户名> <版本号>"
  echo "示例: $0 alice 2026.05.15.1"
  exit 1
fi

DOCKER_USER="$1"
VERSION="$2"
REPO="docker.io/${DOCKER_USER}/sdm"

BACKEND_TAG="backend-${VERSION}"
FRONTEND_TAG="frontend-${VERSION}"

echo "==> 构建后端镜像: ${REPO}:${BACKEND_TAG}"
docker build -t "${REPO}:${BACKEND_TAG}" ./backend

echo "==> 构建前端镜像: ${REPO}:${FRONTEND_TAG}"
docker build -t "${REPO}:${FRONTEND_TAG}" ./frontend

echo "==> 推送后端镜像"
docker push "${REPO}:${BACKEND_TAG}"

echo "==> 推送前端镜像"
docker push "${REPO}:${FRONTEND_TAG}"

echo ""
echo "发布完成，请在服务器 .env 中更新:"
echo "BACKEND_IMAGE=${REPO}:${BACKEND_TAG}"
echo "FRONTEND_IMAGE=${REPO}:${FRONTEND_TAG}"
