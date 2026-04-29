# NightDeal Mini Program

用户端微信小程序工程，覆盖登录、创建/加入房间、房间页、游戏页主流程。

## 1. 环境要求

- 微信开发者工具（建议最新版稳定版）
- Node.js 18+（仅用于安装类型依赖和本地检查）

## 2. 本地安装

在项目根目录执行：

```bash
npm install
```

当前主要依赖是小程序 TypeScript 类型包 `miniprogram-api-typings`。

## 3. 本地构建与运行

1. 打开微信开发者工具。
2. 选择「导入项目」，目录指向本仓库根目录（`nightdeal-minip`）。
3. AppID 使用项目内配置或测试号。
4. 等待开发者工具自动编译（本项目为小程序原生工程，不需要单独 `npm run build`）。
5. 在模拟器中进入首页，执行：
   - 微信登录
   - 创建房间/加入房间
   - 进入房间后开始游戏
   - 游戏页翻牌查看身份

## 4. 后端联调配置

默认请求地址在 `miniprogram/utils/request.ts`：

- `BASE_URL = 'http://localhost:3000'`

如果你的后端地址不同，请按实际环境修改该值。

微信小程序联调时需注意：

- 在微信公众平台配置合法 `request`/`socket` 域名。
- 本地开发可在微信开发者工具勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。

## 5. 测试建议

### 5.1 手动测试（功能流）

- 登录流程
  - 未登录点击创建/加入，应提示先登录。
  - 登录成功后可进入创建/加入路径。
- 房间流程
  - 创建房间后进入房间页并看到玩家列表。
  - 房主可点击开始游戏。
  - 房主可踢除其他玩家（当前为前端演示逻辑）。
- 游戏流程
  - 页面加载后可点击翻牌显示身份与阵营。
  - 返回房间按钮可回退到房间页。

### 5.2 异常测试

- 断网后尝试登录、创建房间、加入房间，应出现错误提示。
- 在后端不可用时，当前前端会进入本地 mock 回退，确保页面流程可继续验证。

### 5.3 代码检查

在 Cursor/IDE 中执行 TypeScript 检查或读取诊断，确保无新增类型错误。

## 6. 目录说明

- `miniprogram/pages/index`：登录 + 创建/加入房间
- `miniprogram/pages/room`：房间与玩家管理
- `miniprogram/pages/game`：身份展示与翻牌
- `miniprogram/utils/auth.ts`：登录态本地存储
- `miniprogram/utils/request.ts`：HTTP 请求封装
- `miniprogram/utils/socket.ts`：Socket 管理（当前为 mock 实现）
