# Docker + Cloudflare Tunnel 部署操作文档

本文档描述如何使用 Docker 和 Cloudflare Tunnel 在个人笔记本上部署 SDM System（后端 + 前端 + 小程序），并实现公网访问。适用于预演环境和未来一键迁移到新笔记本。

---

## 一、整体架构

```
公网用户
    ↓ HTTPS
Cloudflare Edge (免费 CDN + HTTPS)
    ↓ Tunnel (cloudflared)
Cloudflare Tunnel 客户端 (你的笔记本，Docker 容器内运行)
    ↓
Docker Network (sdm-network)
├── cloudflared (隧道客户端)
├── mysql (MySQL 8.0, :3306)
├── backend (FastAPI, :8000)
└── frontend (Next.js, :3000)
```

**为什么选 Cloudflare Tunnel：**
- 不需要公网 IP / DDNS / 路由器端口转发
- 自动 HTTPS
- 完全穿透 NAT
- 迁移时只需重新认证（~1 分钟）

---

## 二、预演环境部署（约 60 分钟）

### 阶段 1：准备工作

#### 1.1 安装 Docker Desktop

1. 下载 [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
2. 安装并启动（可能需要 WSL2，Windows 10/11 自动提示安装）
3. 验证：`docker --version`

#### 1.2 Cloudflare 账号准备

你的电脑已经有 `C:\Users\g0132\.cloudflared\cert.pem`，说明已经完成 `cloudflared tunnel login`。

#### 1.3 创建隧道（如果还没创建）

```bash
# 在笔记本命令行运行
cloudflared tunnel create sdm-tunnel
```

成功后会生成：
- 隧道 ID
- 凭证文件：`C:\Users\g0132\.cloudflared\credentials.json`
- 访问地址：`xxxxxxxx.xxxxxx.trycloudflare.com`

#### 1.4 配置隧道

在 `C:\Users\g0132\.cloudflared\` 目录下创建 `config.yml`：

```yaml
tunnel: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
credentials-file: C:\Users\g0132\.cloudflared\credentials.json

ingress:
  - hostname: api.你的域名.com
    service: http://localhost:8000
  - hostname: web.你的域名.com
    service: http://localhost:3000
  - service: http_status:404
```

#### 1.5 添加 DNS 记录

在 Cloudflare Dashboard 中添加两条 CNAME 记录，指向你创建隧道后获得的地址（如 `xxxxxxxx.xxxxxx.trycloudflare.com`）。

---

### 阶段 2：配置 Docker

#### 2.1 复制并编辑环境变量文件

```bash
# 在项目根目录
copy .env.example .env
```

编辑 `.env`，填入实际值：

```env
# 数据库（本地 Docker MySQL）
MYSQL_ROOT_PASSWORD=你的强密码
MYSQL_USER=sdm_user
MYSQL_PASSWORD=你的MySQL密码
MYSQL_DB=sdm_db

# JWT
JWT_SECRET=请使用强随机字符串（至少32位）

# Cloudflare Tunnel（从 Cloudflare Dashboard 获取）
TUNNEL_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# API 访问地址
API_BASE_URL=https://api.你的域名.com
CORS_ORIGINS=https://web.你的域名.com,https://api.你的域名.com

# 微信配置（可选）
WECHAT_APPID=wx4157e7ad044df60a
WECHAT_SECRET=你的小程序Secret
```

#### 2.2 启动 Docker 服务

```bash
# 构建并启动所有服务
docker compose up -d

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f
```

#### 2.3 初始化数据库

MySQL 容器启动后，需要执行建表 SQL：

```bash
# 进入 MySQL 容器
docker exec -it sdm-mysql mysql -u root -p

# 执行建表（在你的主机上执行，也可以用以下命令）
docker exec -i sdm-mysql mysql -u root -p${MYSQL_ROOT_PASSWORD} < backend/table.sql
```

#### 2.4 验证部署

| 服务 | 本机访问 | 公网访问 |
|------|----------|----------|
| 后端 API | http://localhost:8000/docs | https://api.你的域名.com/docs |
| 前端 Web | http://localhost:3000 | https://web.你的域名.com |
| MySQL | localhost:3306 | - |

---

## 三、小程序配置

### 3.1 修改 baseUrl

在 `miniprogram/config/index.js` 的 `production` 环境：

```javascript
production: {
  baseUrl: 'https://api.你的域名.com/api/v1',
  staticBaseUrl: 'https://api.你的域名.com',
  // ...
}
```

### 3.2 配置微信公众平台

1. 登录 [微信公众平台](https://mp.weixinqq.com/)
2. 进入你的小程序 → 开发 → 开发管理 → 开发设置
3. 在「服务器域名」中添加：
   - request 合法域名：`https://api.你的域名.com`

### 3.3 验证

- 在微信开发者工具中上传体验版
- 真机测试：列表、登录、报名等流程

---

## 四、未来迁移到新笔记本（一键部署）

### 迁移步骤

1. **在新笔记本上装 Docker Desktop**（约 10 分钟）

2. **复制项目文件**
   ```bash
   # 整个项目目录复制到新笔记本
   ```

3. **重新认证 Cloudflare Tunnel**
   ```bash
   # 在新笔记本上运行
   cloudflared tunnel login
   ```
   浏览器授权，约 1 分钟完成。

4. **启动所有服务**
   ```bash
   docker compose up -d
   ```

**完成。** 总共约 15-20 分钟。

---

### 迁移检查清单

- [ ] Docker Desktop 已安装
- [ ] 项目文件已复制
- [ ] cloudflared 已认证
- [ ] `.env` 文件已配置（数据库、JWT_SECRET、TUNNEL_TOKEN）
- [ ] `docker compose up -d` 执行成功
- [ ] 公网访问验证（后端 + 前端）

---

## 五、环境变量说明

### .env 文件完整配置

```env
# ============ 数据库（本地 Docker MySQL）============
MYSQL_ROOT_PASSWORD=你的MySQL root密码
MYSQL_USER=sdm_user
MYSQL_PASSWORD=你的MySQL密码
MYSQL_DB=sdm_db

# ============ JWT ============
JWT_SECRET=请使用强随机字符串（至少32位）

# ============ Cloudflare Tunnel ============
TUNNEL_TOKEN=你的隧道Token（在 Cloudflare Dashboard 创建隧道后获取）

# ============ API 访问地址（前端用） ============
API_BASE_URL=https://api.你的域名.com
CORS_ORIGINS=https://web.你的域名.com,https://api.你的域名.com

# ============ 微信配置 ============
WECHAT_APPID=wx4157e7ad044df60a
WECHAT_SECRET=你的小程序Secret
WECHAT_PAY_MCH_ID=1609691882
WECHAT_PAY_API_V3_KEY=kQ1C6ORvqaJnjuK0hoFfGihwPvb2e5E1
WECHAT_PAY_SERIAL_NO=7C99C423F531D4AB49D64ADF9FA9250DAFE16986
WECHAT_PAY_NOTIFY_URL=https://api.你的域名.com/api/v1/payments/notify
```

---

## 六、故障排查

### 后端启动失败

```bash
# 查看后端日志
docker compose logs backend

# 常见问题：
# - 数据库连接失败：检查 MYSQL_HOST 是否为 mysql
# - 端口被占用：docker compose ps 查看
```

### 前端启动失败

```bash
# 查看前端日志
docker compose logs frontend

# 常见问题：
# - 构建失败：检查 Dockerfile 和依赖
# - 环境变量未生效：重新 build
```

### Tunnel 连接失败

```bash
# 查看 tunnel 日志
docker compose logs cloudflared

# 常见问题：
# - Token 无效：重新从 Cloudflare Dashboard 获取
# - 网络问题：确认笔记本可访问互联网
```

### MySQL 启动失败

```bash
# 查看 MySQL 日志
docker compose logs mysql

# 常见问题：
# - 端口被占用：检查主机是否有其他 MySQL
# - 数据卷权限：docker compose down -v 删除数据卷重新启动
```

### 公网无法访问

1. 确认 cloudflared 容器正在运行：`docker compose ps`
2. 确认 DNS 解析正确：在 [dnschecker.org](https://dnschecker.org) 检查你的域名 CNAME
3. 查看 cloudflared 日志检查连接状态：`docker compose logs cloudflared`

---

## 七、相关命令速查

```bash
# 启动所有服务
docker compose up -d

# 停止所有服务
docker compose down

# 查看服务状态
docker compose ps

# 查看日志（所有服务）
docker compose logs -f

# 查看特定服务日志
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mysql
docker compose logs -f cloudflared

# 重启服务
docker compose restart backend

# 重新构建
docker compose build --no-cache backend

# 进入容器（调试）
docker exec -it sdm-backend /bin/sh
docker exec -it sdm-mysql mysql -u root -p

# 删除数据卷（重置数据库）
docker compose down -v
```

---

**文档版本**：1.1
**适用**：SDM System 后端 + 前端 + 小程序，个人笔记本 Docker 部署。