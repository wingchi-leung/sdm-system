# 文档目录规范

本文档是 `docs/` 目录的索引规则。

## 目录结构

```
docs/
├── CLAUDE.md              # 本文件
├── ARCHITECTURE.md              # 技术架构总览
├── specs/                       # 产品规格目录（SPEC-NN_模块-专项.md）
│   └── SPEC-01_产品总规格.md     # 当前生效的产品总规格（动态维护）
├── archive/                     # 历史归档
│   └── *.md               # 历史的旧规格、审查报告
├── handover/             # 技术交接文档（按功能）
│   └── *.md
├── insights/             # 产品思考文档（按功能）
│   └── *.md
├── review/                # 代码审查报告
│   └── *.md
└── deploy/                # 部署相关文档
    └── *.md
```

## 文档规则

1. **先读 README**：每个子目录优先读该目录的 README 了解内容
2. **修改后更新索引**：新增文件后更新对应目录的索引表格
3. **双向链接**：handover 和 insights 文档必须互链
4. **归档而非删除**：废弃内容移到 `archive/`，不直接删除

## 文档同步

完成重大调整后必须：
1. 更新 `specs/SPEC-01_产品总规格.md` 的实现状态表格
2. 如涉及技术细节，创建 `docs/handover/<feature>.md`
3. 如涉及产品思考，创建 `docs/insights/<feature>.md`
 