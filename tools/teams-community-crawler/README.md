# Teams 社区内容导出器

这是一个 Manifest V3 Chrome 扩展，用当前 Chrome 中已经登录的 Microsoft Teams 会话抓取社区内容。

当前筛选规则：

- 保留作者名称包含 `Inc` 的主帖；
- 检查所有遍历到的主帖对话，保留作者名称包含 `Inc` 的回复；
- 其他作者的主帖和回复不会写入导出结果；
- 提取标题、正文、作者、发布时间、回复关系和图片；视频与普通文件暂不下载。

## 安装

1. 在 Chrome 地址栏打开 `chrome://extensions/`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本目录：`tools/teams-community-crawler`。
5. 回到 Teams 标签页并刷新一次，让抓取脚本进入页面。

扩展只申请 Teams 页面读取、Teams 图片域名访问和 Chrome 下载权限。请只导出当前账号有权访问且允许迁移的社区内容。

## 使用

1. 在 `https://teams.live.com/v2/` 打开目标社区并进入“帖子”页。
2. 点击 Chrome 工具栏中的“Teams 社区内容导出器”。
3. “作者包含”保持 `Inc`。
4. 首次验证可把“最多检查主帖”设为 `2`；正式导出设为 `0`。
5. 点击“开始抓取并下载”，期间不要切换社区或关闭扩展弹窗。

扩展也会在 Teams 页面右下角显示“Teams 社区导出器”浮动面板，可直接选择“导出 2 条样本”或“导出全部”，无需再次打开工具栏弹窗。

程序会逐条打开帖子对话并滚动回复列表。回复很多时耗时较长；网络较慢可把滚动等待从 `800` 调为 `1200` 毫秒。

## 输出

文件保存在 Chrome 默认下载目录：

```text
TeamsCommunity/
└── <社区名>-<导出时间>/
    ├── teams-raw.json
    ├── miniprogram-import.json
    ├── README.md
    ├── images/                 # Inc 主帖图片
    ├── reply-images/           # Inc 回复图片
    └── download-failures.json  # 仅下载失败时生成
```

- `teams-raw.json`：保留 Teams 来源字段、主帖与回复层级、原始图片地址和本地图片路径。
- `miniprogram-import.json`：按 SDM 小程序现有 `title`、`content`、`content_format`、`images` 字段生成的导入草稿。回复会标记为 `entry_type: "reply"` 并保留父帖 ID。
- `README.md`：方便人工浏览和抽查。

图片优先下载 `data-gallery-src` 原图；如果 Chrome 报错，会自动退回网页当前显示、可以右击保存的 `currentSrc` 地址。所有候选地址都失败时，会生成 `download-failures.json`，不会静默跳过。

## 测试

```powershell
node --test tools/teams-community-crawler/tests/crawler-core.test.js
```

扩展脚本语法检查：

```powershell
node --check tools/teams-community-crawler/crawler-core.js
node --check tools/teams-community-crawler/content.js
node --check tools/teams-community-crawler/service-worker.js
node --check tools/teams-community-crawler/popup.js
```
