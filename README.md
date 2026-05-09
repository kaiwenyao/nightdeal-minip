# NightDeal Mini Program

NightDeal 用户端微信小程序，覆盖游戏选择、微信登录、创建/加入房间、房间设置、实时房间同步和身份查看。

## 1. 技术栈

| 组件 | 当前实现 |
| --- | --- |
| 平台 | 微信小程序原生工程 |
| 语言 | TypeScript |
| 渲染 | Skyline |
| 组件框架 | glass-easel |
| HTTP | `wx.request` 封装 |
| Realtime | 基于 `wx.connectSocket` 的 Socket.IO 协议封装 |
| 本地状态 | 微信加密 storage |

## 2. 本地运行

### 2.1 前置条件

- 微信开发者工具
- Node.js 18+，仅用于安装类型依赖和本地检查

### 2.2 安装依赖

```bash
npm install
```

当前主要依赖是 `miniprogram-api-typings` 和 TypeScript。

### 2.3 在微信开发者工具中打开

1. 打开微信开发者工具
2. 导入项目，目录选择 `nightdeal-minip`
3. AppID 使用项目配置或测试号
4. 等待开发者工具自动编译

本项目没有独立构建脚本，开发者工具负责小程序编译。

## 3. 后端联调

后端地址配置在：

```text
miniprogram/utils/config.ts
```

当前配置：

| 字段 | 值 |
| --- | --- |
| `baseUrl` | `https://nightdeal.kaiwen.dev` |
| `socketUrl` | `wss://nightdeal.kaiwen.dev/room` |

`config.ts` 根据 `__wxConfig.envVersion` 在开发/体验和生产配置之间切换。两套配置当前指向同一服务。

本地联调时可以临时改为：

```ts
baseUrl: 'http://localhost:3000'
socketUrl: 'ws://localhost:3000/room'
```

同时需要在微信开发者工具中勾选“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”。

## 4. 主要页面

| 页面 | 说明 |
| --- | --- |
| `pages/game-select` | 选择 Avalon 或 SGS |
| `pages/index` | 登录、资料更新、创建/加入房间 |
| `pages/room` | 房间成员、实时状态、开始/结束、踢人、设置入口 |
| `pages/room-settings` | 房主配置人数和角色 |
| `pages/game` | 获取并展示当前用户身份 |
| `pages/logs` | 微信模板示例页，当前不是业务主流程 |

## 5. 工具模块

| 文件 | 说明 |
| --- | --- |
| `miniprogram/utils/config.ts` | HTTP 和 WebSocket 服务地址 |
| `miniprogram/utils/auth.ts` | token、过期时间和用户资料的加密 storage |
| `miniprogram/utils/auth-guard.ts` | 页面进入前登录态检查 |
| `miniprogram/utils/request.ts` | HTTP 请求、统一响应解包、401 清理登录态 |
| `miniprogram/utils/socket.ts` | Socket.IO over `wx.connectSocket` 封装、重连和域名错误识别 |
| `miniprogram/utils/role-config.ts` | Avalon / SGS 默认角色配置、人数边界和展示文案 |

## 6. 当前业务流程

### 6.1 登录和资料

1. 首页通过 `wx.login` 获取 code
2. `POST /api/auth/login` 换取 token 和用户信息
3. token 和用户资料写入加密 storage
4. 如果用户选择了头像，使用 `wx.uploadFile` 上传到 `POST /api/auth/avatar/upload`
5. 调用 `POST /api/auth/update-profile` 同步昵称和头像 URL

当前小程序不使用前端直传 OSS，也没有 `utils/avatarUpload.ts`。

### 6.2 创建/加入房间

- 创建房间：`POST /api/rooms`
- 加入房间：`POST /api/rooms/:code/join`
- 创建成功或加入成功后进入 `pages/room`

Avalon 默认 5 人，SGS 默认 2 人。

### 6.3 房间实时同步

房间页先通过 REST 拉取房间快照，再连接 `/room` Socket.IO namespace。

客户端发送：

| 事件 | Payload |
| --- | --- |
| `room:join` | `{ roomCode }` |
| `room:leave` | `{ roomCode }` |

后端支持 `player:update`，但当前小程序资料同步主路径是 REST `POST /api/auth/update-profile`。

房主操作主要通过 REST 执行：

| 操作 | 接口 |
| --- | --- |
| 开始游戏 | `POST /api/rooms/:code/start` |
| 结束游戏 | `POST /api/rooms/:code/end` |
| 踢人 | `POST /api/rooms/:code/kick` |
| 更新设置 | `PUT /api/rooms/:code/settings` |

房间页监听：

| 事件 | 用途 |
| --- | --- |
| `room:state` | 全量房间状态 |
| `room:player-joined` | 增量加入 |
| `room:player-left` | 玩家离开或被踢 |
| `room:offline` | 玩家离线 |
| `room:reconnected` | 玩家重连 |
| `room:settings-updated` | 设置更新 |
| `room:started` | 游戏开始，进入游戏页 |
| `room:ended` | 游戏结束提示 |
| `room:error` | WebSocket 业务错误 |
| `player:updated` | 玩家昵称或头像更新 |

### 6.4 游戏页

游戏页通过：

```text
GET /api/rooms/:code/my-role
```

获取当前用户自己的角色。身份默认隐藏，用户点击后翻开。页面也会监听 `room:started` 重新拉取身份，监听 `room:ended` 返回房间页。

## 7. 域名配置

上线前需要在微信公众平台配置：

| 类型 | 域名 |
| --- | --- |
| request 合法域名 | `https://nightdeal.kaiwen.dev` |
| uploadFile 合法域名 | `https://nightdeal.kaiwen.dev` |
| socket 合法域名 | `wss://nightdeal.kaiwen.dev` |

如果后端头像上传接口继续走 NightDeal 后端域名，`uploadFile` 只需要配置后端域名；不需要配置 OSS bucket 域名。

## 8. 手动测试建议

- 未登录时创建/加入房间，应提示先登录
- 登录后可创建 Avalon 房间和 SGS 房间
- 输入 6 位房间码可加入房间
- 房主可打开设置页调整人数和角色配置
- 房主可开始和结束游戏
- 游戏页只展示当前用户自己的身份
- 断开网络后房间页进入重连状态
- token 过期或后端返回 401 时应清理登录态并回到首页

## 9. 开发文档

| 文档 | 内容 |
| --- | --- |
| [FRONTEND-DESIGN.md](./FRONTEND-DESIGN.md) | 当前页面、状态和事件设计 |
| [docs/wechat-auth.md](./docs/wechat-auth.md) | 微信登录、头像和资料同步 |
