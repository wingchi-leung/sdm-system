# Ubuntu 镜像部署（Docker Hub 免费版单私有仓库）

本文档适用于 Docker Hub Personal（1 个私有仓库）场景。  
后端和前端使用同一个私有仓库，通过不同 tag 区分。

## 1. 镜像命名约定

- 仓库：`docker.io/<你的用户名>/sdm`（私有）
- 后端：`docker.io/<你的用户名>/sdm:backend-<版本号>`
- 前端：`docker.io/<你的用户名>/sdm:frontend-<版本号>`

示例版本号：`2026.05.15.1`

## 2. 本地发布（构建并推送）

1. 登录 Docker Hub

```bash
docker login
```

2. 执行发布脚本

```bash
chmod +x scripts/release-images.sh
./scripts/release-images.sh <dockerhub用户名> <版本号>
```

示例：

```bash
./scripts/release-images.sh wingchileung 2026.05.19.1
```

## 3. Ubuntu 服务器部署（仅拉镜像）

1. 在服务器登录 Docker Hub

```bash
docker login
```

2. 配置根目录 `.env`

```env
BACKEND_IMAGE=docker.io/wingchileung/sdm:backend-2026.05.15.1
FRONTEND_IMAGE=docker.io/wingchileung/sdm:frontend-2026.05.15.1
```

3. 启动/更新服务

# 只拉镜像，不动服务
./scripts/deploy-from-registry.sh --pull-only

# 确认没问题后再启动
./scripts/deploy-from-registry.sh --no-pull


```bash
chmod +x scripts/deploy-from-registry.sh
./scripts/deploy-from-registry.sh
```

## 4. 回滚

当新版本异常时，只需把 `.env` 的 `BACKEND_IMAGE` / `FRONTEND_IMAGE` 改回旧 tag，然后执行：

```bash
./scripts/deploy-from-registry.sh
```

## 5. 持续迭代建议

- 禁止使用 `latest`，只用可追溯版本号。
- 每次发布至少保留最近 5~10 个 tag，便于回滚。
- 服务器不存放业务源码，仅存放 `docker-compose.yml`、`.env`、`secrets/`、`uploads/`、`tunnel/`。
