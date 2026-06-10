#!/usr/bin/env bash
set -euo pipefail

# ========== 配置区（按你的实际情况修改） ==========
SERVER_USER="wingchi"
SERVER_IP="192.168.1.14"
SERVER_PORT="22221"
SERVER_PATH="~/sdm-deploy"
BACKEND_IMAGE="wingchileung/sdm:backend-2026.05.19.1"
FRONTEND_IMAGE="wingchileung/sdm:frontend-2026.05.19.1"
# =================================================

echo "==> 1. 构建后端镜像"
docker build -t "${BACKEND_IMAGE}" ./backend || echo "后端无 Dockerfile，跳过构建"

echo "==> 2. 构建前端镜像"
docker build -t "${FRONTEND_IMAGE}" ./frontend || echo "前端无 Dockerfile，跳过构建"

echo "==> 3. 保存镜像为 tar 文件"
BACKEND_TAR="sdm-backend-$(date +%Y%m%d-%H%M%S).tar"
FRONTEND_TAR="sdm-frontend-$(date +%Y%m%d-%H%M%S).tar"

docker save -o "${BACKEND_TAR}" "${BACKEND_IMAGE}" 2>/dev/null && echo "已保存后端镜像" || echo "后端镜像未找到，跳过保存"
docker save -o "${FRONTEND_TAR}" "${FRONTEND_IMAGE}" 2>/dev/null && echo "已保存前端镜像" || echo "前端镜像未找到，跳过保存"

echo "==> 4. 上传到服务器"
for TAR_FILE in "${BACKEND_TAR}" "${FRONTEND_TAR}"; do
  if [[ -f "${TAR_FILE}" ]]; then
    echo "  上传 ${TAR_FILE}..."
    scp -P "${SERVER_PORT}" "${TAR_FILE}" "${SERVER_USER}@${SERVER_IP}:${SERVER_PATH}/"
    rm "${TAR_FILE}"  # 上传完删除本地临时文件
  fi
done

echo "==> 5. 在服务器上加载镜像并重启服务"
ssh -p "${SERVER_PORT}" "${SERVER_USER}@${SERVER_IP}" << 'ENDSSH'
cd ~/sdm-deploy
echo "加载新上传的镜像..."
for TAR in sdm-backend-*.tar sdm-frontend-*.tar; do
  if [[ -f "${TAR}" ]]; then
    docker load -i "${TAR}" && rm "${TAR}"
  fi
done
echo "重启服务..."
./scripts/deploy-from-registry.sh --no-pull
echo "当前服务状态:"
docker compose ps
ENDSSH

echo "==> 全部完成！"