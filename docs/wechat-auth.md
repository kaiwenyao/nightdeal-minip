# WeChat Auth Frontend Guide

本文档描述当前小程序端微信登录、昵称头像采集、头像上传和本地登录态实现。

## 1. 当前范围

已实现能力：

- `wx.login` 换取后端 JWT
- `<button open-type="chooseAvatar">` 选择微信头像
- `<input type="nickname">` 采集昵称
- `bindnicknamereview` 处理昵称审核结果
- `wx.uploadFile` 上传头像到后端
- `POST /api/auth/update-profile` 同步昵称和头像 URL
- token、token 过期时间和用户资料加密存储
- 401 自动清理登录态并回到首页

当前不使用的方案：

- 前端直传 OSS
- `POST /api/auth/avatar/credential`
- 独立 `utils/avatarUpload.ts`
- 客户端保存或处理微信 `session_key`

## 2. 相关文件

| 文件 | 说明 |
| --- | --- |
| `miniprogram/pages/index/index.ts` | 登录、头像选择、头像上传、资料同步 |
| `miniprogram/pages/index/index.wxml` | 头像选择按钮和昵称输入 |
| `miniprogram/utils/auth.ts` | token、过期时间和用户资料 storage |
| `miniprogram/utils/request.ts` | HTTP 请求封装和 401 处理 |
| `miniprogram/utils/config.ts` | 后端地址配置 |

后端对应文档：

```text
nightdeal-backend/docs/wechat-auth.md
```

## 3. 微信头像和昵称约束

微信当前推荐使用：

- `<button open-type="chooseAvatar">`
- `<input type="nickname">`

`chooseAvatar` 返回的是本地临时文件路径，例如：

```text
wxfile://tmp/xxx.jpg
http://tmp/xxx.jpg
```

这些路径不能跨设备访问，也不能直接写入后端数据库。当前实现会先用本地路径预览，登录后再通过后端上传接口换成公开 HTTPS URL。

## 4. 登录流程

入口方法：

```text
pages/index/index.ts -> handleWechatLogin
```

流程：

1. 读取并规范化当前昵称
2. 调用 `wx.login`
3. `POST /api/auth/login`
4. `setToken(payload.token)`
5. 如果有新头像，调用 `tryUploadAvatar`
6. 组装 `UserProfile`
7. `setUserProfile(loginUser)`；没有后端头像 URL 时本地展示默认头像
8. 尝试调用 `POST /api/auth/update-profile`；头像字段只发送后端已有 URL、上传后的 URL 或空字符串，不发送默认占位头像

资料同步失败不会阻断登录。前端会保留本地登录态，用户之后可以再次点击更新资料。

## 5. 昵称处理

当前昵称规范化逻辑：

- 移除零宽字符和部分不可见字符
- `trim`
- 截断到 20 个字符

相关方法：

| 方法 | 说明 |
| --- | --- |
| `normalizeNickName` | 规范化昵称 |
| `onInputChange` | 输入时更新昵称 |
| `onNicknameBlur` | 失焦时再次规范化 |
| `onNicknameReview` | 微信昵称审核不通过时清空并提示 |
| `getCurrentNickName` | 提交前校验昵称 |

后端仍会执行最终校验。前端不要假设本地校验等于服务端通过。

## 6. 头像处理

### 6.1 选择头像

入口方法：

```text
onChooseAvatar
```

行为：

- 将临时路径写入 `userInfo.avatarUrl` 用于本地预览
- 将临时路径写入 `rawAvatarPath`，等待后续上传

默认头像仍使用代码中的 `defaultAvatarUrl`，但它只是 UI 占位图，不作为最终 `avatarUrl` 同步到后端。

### 6.2 上传头像

入口方法：

```text
uploadAvatarToServer
```

请求：

```http
POST /api/auth/avatar/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

`wx.uploadFile` 参数：

| 字段 | 值 |
| --- | --- |
| `url` | `${config.baseUrl}/api/auth/avatar/upload` |
| `filePath` | `rawAvatarPath` |
| `name` | `avatar` |
| `Authorization` | `Bearer <token>` |
| `timeout` | 30000ms |

成功响应需要满足：

```json
{
  "code": 0,
  "data": {
    "avatarUrl": "https://..."
  }
}
```

上传成功后：

- `userInfo.avatarUrl` 更新为后端返回的 HTTPS URL
- `rawAvatarPath` 清空
- 后续资料同步使用该 HTTPS URL；没有上传结果时发送空字符串或后端已有头像 URL

上传失败时：

- 登录流程中不阻断登录
- 更新资料流程中会提示错误

## 7. 本地登录态

`utils/auth.ts` 使用微信加密 storage：

| Key | 内容 |
| --- | --- |
| `nd_token` | JWT |
| `nd_token_exp` | JWT `exp` |
| `nd_user` | `UserProfile` |

`getToken` 会：

1. 读取 token
2. 读取或从 JWT payload 解析 `exp`
3. 如果已过期，清理 token 并返回 `null`

前端不保存微信 `session_key`。

## 8. HTTP 401 处理

`utils/request.ts` 中的统一行为：

1. 收到 HTTP 401
2. 清理 token 和用户资料
3. 如果当前页面不是首页，`wx.reLaunch` 到首页
4. 抛出 `UnauthorizedError`

页面如果捕获到 `UnauthorizedError`，可以触发重新登录或让首页接管。

## 9. 域名配置

当前头像上传走 NightDeal 后端接口，不直连 OSS。因此上线前需要配置：

| 类型 | 域名 |
| --- | --- |
| request 合法域名 | 后端 HTTPS 域名 |
| uploadFile 合法域名 | 后端 HTTPS 域名 |
| socket 合法域名 | 后端 WSS 域名 |

如果未来改回前端直传 OSS，才需要额外配置 OSS bucket 域名，并重新启用后端 credential 接口。

## 10. 测试重点

- 未登录点击创建/加入，提示先登录
- 昵称为空时允许登录，但更新资料时要求 1 到 20 字
- 昵称审核不通过时清空昵称并提示
- 选择头像后登录，应先上传头像再同步资料
- 头像上传 401：`request()`、资料更新路径与登录流程内的 `tryUploadAvatar` 都会清登录态并提示重新登录
- 头像上传失败时，登录流程仍能完成
- token 过期后再次请求，应回到首页
- 本地缓存中不能保存 `wxfile://` 作为最终头像 URL
