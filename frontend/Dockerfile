# 前端 Dockerfile (craco/react-scripts)
FROM node:18-alpine

WORKDIR /app

# 先复制 package 文件，利用 Docker 缓存层
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制其他源代码
COPY . .

# 构建
RUN npm run build

# 启动（生产模式）
EXPOSE 3000
CMD ["npm", "start"]