# 前端开发规范

本目录是 SDM System 的 Web 前端（Next.js）。

## 技术栈

- **框架**: Next.js (Pages Router)
- **语言**: TypeScript
- **样式**: CSS Modules / 内联样式（禁止引入 Tailwind 等额外 CSS 框架）
- **UI 组件**: 自研组件放在 `src/components/ui/`

## 组件规范

| 类型 | 存放位置 | 规则 |
|------|----------|------|
| 业务组件 | `src/components/` | 按功能页命名，如 `ActivityList.tsx` |
| 通用 UI | `src/components/ui/` | 基础原子组件（button、input、card 等） |
| 页面入口 | `src/components/` | 作为子路由组件 |

## 状态管理

- 组件内部状态：`useState` / `useReducer`
- 跨组件共享：Props drilling 或 Context（禁止 Redux/MobX 等重型方案）
- **严禁直接操作全局 Data**（小程序端规则，Web 端参照执行）

## API 调用

- 封装在 `utils/api.ts` 中
- 请求统一携带 `credentials: include`（Cookie 认证）
- 网络异常时展示中文友好提示，包含 `REACT_APP_API_URL` 与 CORS 排障信息

## 提交前自检

```bash
cd frontend && npm run build
npm run test   # typecheck + unit
```

## 多语言

i18n 文件：
- `src/i18n/en.ts`
- `src/i18n/zh.ts`

修改业务文案时必须同步两个文件。

## 环境配置

- 开发环境: `.env.development`
- 生产环境: `.env.production`
- 关键变量: `REACT_APP_API_URL`, `REACT_APP_STATIC_URL`

禁止在代码中硬编码生产域名。