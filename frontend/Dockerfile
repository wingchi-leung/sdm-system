FROM docker.m.daocloud.io/library/node:18-alpine

WORKDIR /app

# 先复制 package 文件，利用 Docker 缓存层
COPY package*.json ./

# 安装依赖
RUN npm config set registry https://registry.npmmirror.com && npm ci

# 复制其他源代码
COPY . .

# 构建检查
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
