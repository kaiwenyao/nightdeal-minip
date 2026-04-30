# 微信小程序登录授权 — 前端实现说明

> 调研对象：在小程序内完成"登录 + 获取昵称 + 获取头像"，并把头像 URL 持久化到后端数据库。
> 本文针对 **`nightdeal-minip`** 仓库，列出**需要实现的内容**。后端对应文档：`nightdeal-backend/docs/wechat-auth.md`。

---

## 1. 背景与政策约束（必读）

### 1.1 微信官方政策

| 时间 | 变更 |
|---|---|
| **2022-10-25** | `wx.getUserInfo` / `wx.getUserProfile` 对新版本小程序统一返回**灰色默认头像 + "微信用户" 昵称**（来源：微信开放社区官方公告） |
| 基础库 ≥ 2.21.2 | 启用"**头像昵称填写能力**"：`<button open-type="chooseAvatar">` + `<input type="nickname">` |
| 基础库 ≥ 2.24.4 | `<input type="nickname">` 在 onBlur 后异步执行违规检测 |

### 1.2 关键事实（与产品需求关系密切）

> **`chooseAvatar` 回调返回的是临时本地文件路径**（`wxfile://tmp/xxx.jpg` 或 `http://tmp/xxx.jpg`）。
>
> - 不是 `wx.qlogo.cn` 链接；
> - 不能跨设备访问；
> - 重启小程序后路径可能失效；
> - **绝不能直接当成 `avatarUrl` 提交给后端写库**。

因此本项目采用：**前端 `wx.uploadFile` 直传阿里云 OSS（PostObject 表单上传），拿到 CDN URL 再交给后端**。后端只接受白名单 OSS 域名下的 https URL。

### 1.3 用户路径（最终形态）

```
1) 进入首页 → 默认头像 + 空昵称（未登录）
2) 用户点击头像按钮 → chooseAvatar → 拿到临时路径，本地预览
3) 用户在 input type=nickname 中填昵称
4) 点"微信登录"：
   a. wx.login() → 拿 code
   b. POST /api/auth/login { code } → 拿 token + 空白 user
   c. setToken（写入 wx.storage）
   d. 若头像不是默认头像（即用户选过新图）：
      d1. POST /api/auth/avatar/credential → 拿 OSS PostObject 凭证（key/policy/signature 等）
      d2. wx.uploadFile（POST 表单到 OSS host）→ 拿 publicUrl
   e. POST /api/auth/update-profile { nickName, avatarUrl: publicUrl }
   f. 本地缓存 userProfile（用 publicUrl，不再用 wxfile://）
5) 后续启动 → 复用 storage 中的 token 与 publicUrl 头像
```

---

## 2. 现状（已完成）✅

| 模块 | 文件 | 现状 |
|---|---|---|
| 头像选择 | `miniprogram/pages/index/index.wxml` line 20–22 | ✅ `<button open-type="chooseAvatar" bind:chooseavatar>` |
| 昵称输入 | `miniprogram/pages/index/index.wxml` line 23–30 | ✅ `<input type="nickname">` |
| 选头像回调 | `miniprogram/pages/index/index.ts` `onChooseAvatar` | ✅ 把临时路径写入 `userInfo.avatarUrl` |
| 登录 | `miniprogram/pages/index/index.ts` `handleWechatLogin` | ✅ `wx.login → POST /api/auth/login` |
| Token 存取 | `miniprogram/utils/auth.ts` | ✅ `getToken/setToken/getUserProfile/setUserProfile` |
| 请求封装 | `miniprogram/utils/request.ts` | ✅ Bearer 注入，401 抛 `UnauthorizedError` |
| 配置 | `miniprogram/utils/config.ts` | ✅ baseUrl |
| TypeScript | `project.config.json` | ✅ 已开启 |

> **关键缺口**：当前 `handleWechatLogin` 把 `wxfile://tmp/...` 直接当作 `avatarUrl` 发给 `/api/auth/update-profile`。后端按计划加上白名单后，此路径会被拒（400）。所以**4.1 + 4.2 必须与后端 `/auth/avatar/credential` 同步上线**。

---

## 3. 小程序后台配置（运营动作 — 上线前必做）

| 项目 | 值 | 说明 |
|---|---|---|
| `request 合法域名` | `https://nightdeal.kaiwen.dev` | 已配置，保持 |
| **`uploadFile 合法域名`** | `https://<bucket>.oss-<region>.aliyuncs.com` | **新增**，否则 `wx.uploadFile` 报 `url not in domain list` |
| 用户隐私保护指引 | 勾选并填写"头像信息""昵称信息" | 否则首次调用相关 API 会触发隐私协议弹窗失败 |

> 这些配置在 mp.weixin.qq.com 后台完成，不在代码仓库内。开发期可在开发者工具 → 详情 → 本地设置 → 勾选"不校验合法域名"绕过，但**生产构建必须配置正确**。

---

## 4. 需实现的内容（TODO）

### 4.1 头像上传工具 `miniprogram/utils/avatarUpload.ts`（新增）

**文件位置**：`miniprogram/utils/avatarUpload.ts`

**导出**：

```ts
export interface OssCredential {
  accessKeyId: string;
  securityToken?: string;   // 后端方式 B（STS）才会返回
  policy: string;           // base64 字符串，原样塞进表单
  signature: string;        // base64 字符串
  key: string;              // avatars/<userId>/<ts>.jpg
  bucket: string;
  region: string;           // oss-cn-shanghai
  host: string;             // https://<bucket>.oss-<region>.aliyuncs.com
  expiredTime: number;
  publicUrl: string;        // `${host}/${key}`
}

export async function uploadAvatar(localPath: string): Promise<string>;
```

**实现要点**（OSS PostObject 表单上传）：

1. `request<OssCredential>('/api/auth/avatar/credential', { method: 'POST' })` — 拿凭证。
2. 调用 `wx.uploadFile`（注意：`wx.uploadFile` 默认就是 `multipart/form-data` POST，与 OSS PostObject 协议天然契合）：

   ```ts
   const credential = await request<OssCredential>({
     url: '/api/auth/avatar/credential',
     method: 'POST',
   });

   const formData: Record<string, string> = {
     key: credential.key,
     policy: credential.policy,
     OSSAccessKeyId: credential.accessKeyId,
     signature: credential.signature,
     // success_action_status=200 让 OSS 成功时返回 200 而不是默认 204，便于和小程序 statusCode 对齐
     success_action_status: '200',
   };
   if (credential.securityToken) {
     formData['x-oss-security-token'] = credential.securityToken;
   }

   await new Promise<void>((resolve, reject) => {
     wx.uploadFile({
       url: credential.host,            // 整个 bucket host，OSS 会从 form key 字段找路径
       filePath: localPath,
       name: 'file',                    // 必须叫 'file'，且必须放在表单最后一个字段（PostObject 协议要求）
       formData,
       timeout: 30000,
       success: (res) => {
         if (res.statusCode === 200 || res.statusCode === 204) resolve();
         else reject(new Error(`OSS upload failed: ${res.statusCode} ${res.data}`));
       },
       fail: (err) => reject(new Error(err.errMsg || 'OSS upload network error')),
     });
   });

   return credential.publicUrl;
   ```

3. PostObject 关键约束（与后端 Policy 同步）：
   - `Content-Type` 由 `wx.uploadFile` 自动按文件后缀识别，OSS 校验需 `image/*`，因此 chooseAvatar 出来的 jpg/png 是 OK 的。
   - 文件 ≤2MB，否则 OSS 直接 403。
4. 返回 `credential.publicUrl`，由调用方传给 `/auth/update-profile`。

**约束**：

- 不要先把图片读成 base64 再 JSON POST — 浪费带宽且 OSS PostObject 不接受这种形式。
- `name` 字段必须为 `'file'`；`formData` 中其它字段务必在 `name` 之前传入（小程序内部会按对象顺序拼，OSS 协议要求 file 最后）。
- 失败时把详细错误码（statusCode、errMsg、res.data）日志埋点。

### 4.2 接入登录主流程

**修改文件**：`miniprogram/pages/index/index.ts`

**改造点**：在 `handleWechatLogin` 中 setToken 之后、调 `update-profile` 之前插入：

```ts
const local = this.data.userInfo.avatarUrl;
const isLocalTempPath =
  local.startsWith('wxfile://') ||
  local.startsWith('http://tmp/') ||
  local.startsWith('http://usr/');

let avatarUrlForServer = '';
if (isLocalTempPath) {
  try {
    avatarUrlForServer = await uploadAvatar(local);
  } catch (e) {
    // 见 §4.7：头像上传失败不阻断登录
    wx.showToast({ title: '头像上传失败，已跳过', icon: 'none' });
    avatarUrlForServer = '';
  }
}

await request({
  url: '/api/auth/update-profile',
  method: 'POST',
  data: {
    nickName: loginUser.nickName,
    // 上传成功才传，否则空串让后端保留原值
    ...(avatarUrlForServer ? { avatarUrl: avatarUrlForServer } : {}),
  },
});
```

`handleUpdateProfile`（已登录后再次更新）需要做同样的判断 — 用户可能在已登录状态下再次换头像。

**重要**：`setUserProfile` 写本地缓存时，要写**已上传后的 publicUrl**，不能再写 `wxfile://...`，否则下次冷启动 `<image src>` 会渲染失败。

### 4.3 昵称安检 UX

**改造点**：`pages/index/index.wxml` 给 `<input type="nickname">` 加 `bindnicknamereview`：

```xml
<input
  class="text-input name-input"
  type="nickname"
  placeholder="请输入昵称"
  value="{{userInfo.nickName}}"
  bindinput="onInputChange"
  bindnicknamereview="onNicknameReview"
/>
```

`pages/index/index.ts` 实现：

```ts
onNicknameReview(e: WechatMiniprogram.CustomEvent<{ pass: boolean; timeout: boolean }>) {
  if (e.detail.timeout) return; // 安检超时按通过处理（与微信一致）
  if (!e.detail.pass) {
    this.setData({ 'userInfo.nickName': '' });
    wx.showToast({ title: '昵称含违规内容，请修改', icon: 'none' });
  }
}
```

**提交前再校验一次**：

```ts
const trimmed = this.data.userInfo.nickName.trim();
if (trimmed.length < 1 || trimmed.length > 20) {
  wx.showToast({ title: '昵称需 1-20 字', icon: 'none' });
  return;
}
```

后端 `security.msgSecCheck` v2 仍会做最后兜底，前端遇到 `422` 错误时也要清空 nickName 并提示。

### 4.4 默认头像降级

**问题**：`pages/index/index.ts` 中默认头像硬编码为微信公众平台 mmbiz 域名图片：

```ts
const defaultAvatarUrl = 'https://mmbiz.qpic.cn/...'
```

这并不稳定（域名可能变），且依赖外部 CDN。建议：

1. 改为本地图片资源，放在 `miniprogram/images/default-avatar.png`。
2. WXML：

   ```xml
   <image class="avatar" src="{{userInfo.avatarUrl || '/images/default-avatar.png'}}"></image>
   ```
3. 提交后端时：用户没选过头像 → `avatarUrl` 字段不发送（让后端 DTO 走 `@IsOptional()` 保留原值）。

### 4.5 类型补全

**新增文件**：`miniprogram/types/api.ts`（如不存在）

```ts
export interface OssCredential {
  accessKeyId: string;
  securityToken?: string;
  policy: string;
  signature: string;
  key: string;
  bucket: string;
  region: string;
  host: string;
  expiredTime: number;
  publicUrl: string;
}

export interface UpdateProfileRequest {
  nickName?: string;
  avatarUrl?: string;
}

export interface UpdateProfileResponse {
  user: { id: string; nickName?: string; avatarUrl?: string };
}
```

修复现有 `pages/index/index.ts` 的 `UpdateProfileResponse` 局部类型，统一引用 `types/api.ts`。

### 4.6 Storage Key 与跨设备一致性

`utils/auth.ts` 现有 storage key：

| Key | 内容 |
|---|---|
| `nd_token` | JWT |
| `nd_user` | `{ id, nickName, avatarUrl }`，**avatarUrl 必须是 publicUrl，不允许 wxfile://** |

每次 `setUserProfile` 之前断言：

```ts
if (profile.avatarUrl && /^(wxfile:\/\/|http:\/\/tmp\/|http:\/\/usr\/)/.test(profile.avatarUrl)) {
  // 防御式：永远不写临时路径到持久缓存
  profile.avatarUrl = '';
}
```

### 4.7 错误回退矩阵

| 失败步骤 | 错误来源 | 行为 |
|---|---|---|
| `wx.login` | `fail` 回调 | toast "微信登录失败"，停留在登录态 |
| `POST /auth/login` | network / 5xx | toast "登录服务不可用"，不写 token |
| `POST /auth/avatar/credential` | 4xx / network | toast "头像上传暂不可用"，跳过头像，**仍提交昵称** |
| `wx.uploadFile` | statusCode ≠ 200/204 | 同上，跳过头像 |
| `POST /auth/update-profile` 422 (nickName risky) | 后端安检命中 | toast "昵称含违规内容"，清空 nickName，停留 |
| `POST /auth/update-profile` 400 (avatarUrl 非法) | 后端白名单拒绝 | 这是开发期 bug，不应到达；上报埋点 |
| `POST /auth/update-profile` 401 | token 过期 | 走现有 `UnauthorizedError` 逻辑：清 token → 重新 `wx.login` |

---

## 5. 不做的事（明确边界）

- ❌ 不调 `wx.getUserProfile` / `wx.getUserInfo`（拿不到真头像，无意义）。
- ❌ 不在小程序端硬编码任何阿里云 AccessKey/SecretKey（必须走后端签名）。
- ❌ 不把头像存到本地相册（`wx.saveImageToPhotosAlbum`）。
- ❌ 不接手机号、订阅消息、unionId — 与本次任务无关。
- ❌ 不做"扫码登录""一键登录"等其它登录方式。

---

## 6. 引用资料

- 微信开放社区公告 _关于小程序 wx.getUserInfo 与 wx.getUserProfile 接口调整_（2022-10-25）
- 微信开发者文档 / 头像昵称填写能力（基础库 ≥ 2.21.2；2.24.4 起 `bindnicknamereview` 可用）
- 微信开发者文档 / `wx.uploadFile`、`uploadFile 合法域名`
- 阿里云 OSS / PostObject 上传 / 小程序直传 OSS 教程

---

## 7. 实施次序建议

1. 先与后端约定好 `/auth/avatar/credential` 的请求/响应格式（参考 `nightdeal-backend/docs/wechat-auth.md` §3.1）。
2. 实现 §4.1 `utils/avatarUpload.ts`，单独写 demo 页面跑通"选图 → 上传 → 拿 URL"。
3. 实现 §4.4 默认头像本地化（解耦外部 CDN，可独立合并）。
4. 实现 §4.2 接入主流程，**与后端 §3.1+§3.2 同一发布窗口上线**，否则会出现 wxfile 路径被后端 400 的故障。
5. 最后接 §4.3 昵称安检 UX。
