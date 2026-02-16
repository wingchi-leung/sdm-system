# 活动报名  （Flutter）

纯 **C 端 App**：活动列表 → 活动详情 → 报名表单，对接现有后端 API。

**发布活动、管理人员等由后台完成**：本 App 内无「发布活动」、无管理员入口；管理员在 Web 后台或内部管理端操作，用户只看到活动与报名。

## 怎么启动 Flutter

Flutter 同一套代码可以跑在 **Web、iOS 模拟器、iPhone 真机、Android** 等，任选一种即可。

### 1. 先启动后端（必须）

后端和手机/浏览器要在同一局域网，或本机跑 Web/模拟器时用本机地址。

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
   
### 2. 安装依赖（首次或拉代码后执行一次）

```bash
cd event_app
flutter pub get
```

### 3. 选一种方式运行

**方式 A：用浏览器看（最简单）**

```bash
cd event_app
flutter run -d chrome
```

会打开 Chrome，直接看 Web 版。此时 API 地址用本机即可（见下方「改 API 地址」）。

**方式 B：用 iPhone 真机**

1. 用数据线连 iPhone，手机信任电脑，必要时在 Xcode 里登录 Apple ID 并信任设备。
2. 改 API 地址：iPhone 要访问你**电脑**上的后端，所以要把 `lib/services/api_service.dart` 里的 `baseUrl` 改成你电脑的**局域网 IP**（如 `http://192.168.1.100:8000/api/v1`）。在 Mac 上终端执行 `ipconfig getifaddr en0` 可看本机 IP。
3. 运行并选 iPhone：
   ```bash
   cd event_app
   flutter run
   ```
   出现设备列表后输入前面带 `iPhone` 的编号；或先看设备 ID：`flutter devices`，再执行 `flutter run -d <设备ID>`。

**方式 C：iOS 模拟器**

先打开模拟器（Xcode → Open Developer Tool → Simulator），再在项目里执行：

```bash
cd event_app
flutter run
```
选 iOS 模拟器即可。模拟器访问本机后端用 `http://localhost:8000/api/v1` 即可。

### 改 API 地址（按你用的方式改一处）

打开 `lib/services/api_service.dart`，改第 6 行左右的 `baseUrl`：

| 运行方式           | baseUrl 填什么 |
|--------------------|----------------|
| Web（Chrome）      | `http://localhost:8000/api/v1` |
| iOS 模拟器         | `http://localhost:8000/api/v1` |
| **iPhone 真机**    | `http://你电脑的局域网IP:8000/api/v1`，例如 `http://192.168.1.100:8000/api/v1` |
| Android 模拟器     | `http://10.0.2.2:8000/api/v1` |

## 功能

- **活动列表**：拉取 `/api/v1/activities`，下拉刷新
- **活动详情**：点击进入，显示状态、时间、标签
- **报名**：未结束的活动可点「我要报名」，填姓名、手机号、证件号（选填），提交到 `POST /api/v1/participants/`

## 目录结构

- `lib/main.dart` - 入口
- `lib/models/activity.dart` - 活动模型
- `lib/services/api_service.dart` - 请求封装（改 baseUrl）
- `lib/screens/` - 活动列表、详情、报名页

## 常见问题

### "Cannot connect directly to the VM service as a DDS instance has taken control"

说明已经有**另一个 Flutter 调试/运行会话**在占用 VM 服务（例如 Cursor/VS Code 的调试、或之前没关掉的 `flutter run`）。

**处理方式（任选其一）：**

1. **先关掉其他会话**  
   - 在 Cursor/VS Code 里停止当前调试（红色停止按钮）。  
   - 在终端里若有正在跑的 `flutter run`，按 `q` 退出，或关掉该终端。  
   - 再重新执行 `flutter run` 或 `flutter run -d chrome`。

2. **不用 IDE 调试、只跑起来看效果时**，可禁用 DDS，避免冲突：  
   ```bash
   flutter run -d chrome --no-dds
   # 或
   flutter run --no-dds
   ```  
   这样热重载仍可用，只是不再通过 DDS 让 IDE 连上去调试。
