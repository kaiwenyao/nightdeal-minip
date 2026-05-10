# Avalon Frontend Guide (v1)

本文档是阿瓦隆（Avalon）游戏功能在小程序端的开发文档。规则与协议以**后端**文档为权威，前端只负责呈现 + 操作 + 错误兜底，**不在客户端做任何规则裁决**。

> 配套后端文档（规则 / Prisma / REST / WS / 错误码权威源）：[`nightdeal-backend/docs/AVALON-DEVELOPMENT.md`](https://github.com/kaiwenyao/nightdeal/blob/main/nightdeal-backend/docs/AVALON-DEVELOPMENT.md)

---

## 1. 范围声明

### 1.1 v1 包含

- 经典版 + 刺杀梅林，5–10 人桌
- 8 个角色（参见后端文档 §2.2）
- 5 轮任务的完整 UI：组队 → 公投 → 任务执行 → 计分 → 刺杀
- 断线重连：杀进程重启后通过 `GET avalon/state` 自动恢复本人视角
- 多设备登录同账号下单一设备操作其他设备实时更新

### 1.2 v1 不包含

- 湖中仙女、王者之剑、目标牌
- 观战席
- 战绩页 / 历史回放
- 任意"客户端裁决"逻辑（包括客户端判断胜负 / 客户端校验角色配置合法性）

### 1.3 关键原则

- **服务端为权威**：所有规则判定（队长是谁、本轮派几人、谁能投失败、谁赢）由后端决定，前端只显示
- **永不缓存敏感信息**：身份 / 视野不写入 `wx.setStorageSync`，进程被杀后必须重新拉 `GET avalon/state`
- **永不展示未公开信息**：任务投票揭晓后 UI **只显示**「成功 X 失败 Y」，不显示具体投票人

---

## 2. 页面拆分

### 2.1 现有页面改造

| 页面 | 路径 | 改造点 |
| --- | --- | --- |
| `pages/game/game` | 已有 | 改造为「身份揭示 + 等待开局」单一职责。监听 `avalon:role-revealed`（取代旧 `room:started`），`onShow` 时拉一次 `GET avalon/state`。若发现 `phase !== ROLE_REVEAL`，立即 `wx.redirectTo` 到 `pages/avalon-play` |
| `pages/room/room` | 已有 | 监听 `room:state`，若 `status === PLAYING` 且 `gameType === AVALON`，自动 `wx.redirectTo({ url: '/pages/game/game?roomCode=...' })`（已有逻辑确认） |
| `pages/room-settings/room-settings` | 已有 | 复用现有 RoleConfig 编辑能力，**不**新增 UI；后端会在 `start` 阶段拒绝非法配置（参见后端 §5），前端展示后端返回的错误 message |

### 2.2 新增页面

#### `pages/avalon-play/avalon-play`

| 项 | 值 |
| --- | --- |
| 路径 | `miniprogram/pages/avalon-play/avalon-play.{ts,wxml,wxss,json}` |
| 注册 | 在 `app.json` 的 `pages` 数组**末尾**追加 `pages/avalon-play/avalon-play` |
| 进入方式 | `pages/game` 检测到 `phase` 已离开 `ROLE_REVEAL` 时 `wx.redirectTo` 进入；不是 navigateTo（避免页面栈过深） |
| 退出方式 | 收到 `avalon:game-over` 后展示结算遮罩 → 房主点击"返回房间"调用 `room:end` → 服务端广播 `room:ended` → `wx.redirectTo` 回 `pages/room` |
| 默认 onLoad | 拉一次 `GET avalon/state` + 注册全部 `avalon:*` socket 监听（不在 onShow，避免重复绑） |
| onUnload | 调用 `detachListeners()`，**不**断开 socket（统一由 `pages/room` 管理） |
| onHide | 不做事；切后台时 socket 由 utils 自身管理重连 |
| onShow | 仅在 `data.pageState === 'error'` 时重试拉 state；正常情况靠 socket 持续推送 |

### 2.3 路由总览

```
game-select → index → room ──(开局)──> game (身份揭示) ──(自动)──> avalon-play
                                          ↑                            │
                                          └────(end / room:ended)──────┘
```

---

## 3. 组件清单

所有组件放在 `miniprogram/components/avalon/<name>/`，每个组件四件套（`.ts` / `.wxml` / `.wxss` / `.json`）。沿用既有 `ui-card` / `ui-button` / `ui-state-panel` 样式风格，CSS 变量见 §8。

| 组件 | 路径 | 职责 | 关键属性 / 事件 |
| --- | --- | --- | --- |
| `<seat-circle>` | `components/avalon/seat-circle/` | 圆桌座位布局，高亮队长、候选人、已投状态 | `players`, `leaderSeat`, `selectedSeats`, `votedSeats`, `mode`('view'\|'pick'), `bind:select` |
| `<scoreboard>` | `components/avalon/scoreboard/` | 5 个任务格子，显示蓝/红/未开始/进行中 | `rounds: AvalonRoundResult[]`, `currentRound` |
| `<vote-card>` | `components/avalon/vote-card/` | 公投赞成/反对大按钮，已投后禁用 | `disabled`, `myVote: 'approve'\|'reject'\|null`, `bind:vote` |
| `<mission-card>` | `components/avalon/mission-card/` | 任务投票卡，蓝方只能"成功"，红方两个按钮 | `mySide`, `disabled`, `myVote`, `bind:vote` |
| `<role-reveal-overlay>` | `components/avalon/role-reveal-overlay/` | 开局首次身份揭示遮罩，需"长按查看" | `role`, `side`, `vision`, `bind:close` |
| `<assassinate-panel>` | `components/avalon/assassinate-panel/` | 仅刺客可见的刺杀面板（全屏遮罩 + 候选人头像列表 + 二次确认） | `players`, `bind:confirm` |
| `<phase-banner>` | `components/avalon/phase-banner/` | 顶部阶段提示条 (`PROPOSAL` / `PUBLIC_VOTE` / `MISSION` 等中文化) | `phase`, `round`, `attemptNo`, `leaderName` |
| `<vote-progress>` | `components/avalon/vote-progress/` | 进度条 `{voted, total}` | `voted`, `total`, `label` |
| `<history-trail>` | `components/avalon/history-trail/` | 历史轨迹（每轮折叠展示提案 + 公投揭晓） | `history` |

> `<role-reveal-overlay>` 的「长按查看」是 UX 约定（不是安全机制），用 `bindlongpress` + `bindtouchend` 控制 `data.peeking`。截屏防护小程序无可靠 API，文档仅提示用户。

---

## 4. Socket 事件订阅清单与生命周期

### 4.1 注册 / 解绑模式（沿用现有约定）

```ts
// pages/avalon-play/avalon-play.ts
import { connectSocket, SocketLike } from '../../utils/socket'

Page({
  socket: null as SocketLike | null,
  bindings: [] as Array<{ event: string, listener: (...args: any[]) => void }>,

  onLoad(query) {
    this.socket = connectSocket(false)
    if (!this.socket.connected) this.socket.connect()
    this.bindAll()
    this.fetchState(query.roomCode)
  },

  onUnload() {
    this.detachListeners()
    // 不 disconnectSocket，由 pages/room 统一管理
  },

  bindEvent(event: string, listener: (...args: any[]) => void) {
    this.socket?.on(event, listener)
    this.bindings.push({ event, listener })
  },

  detachListeners() {
    for (const { event, listener } of this.bindings) {
      this.socket?.off(event, listener)
    }
    this.bindings = []
  },

  bindAll() {
    this.bindEvent('avalon:role-revealed', this.onRoleRevealed.bind(this))
    this.bindEvent('avalon:phase', this.onPhase.bind(this))
    this.bindEvent('avalon:proposal', this.onProposal.bind(this))
    this.bindEvent('avalon:public-vote:progress', this.onPublicVoteProgress.bind(this))
    this.bindEvent('avalon:public-vote:result', this.onPublicVoteResult.bind(this))
    this.bindEvent('avalon:mission-vote:progress', this.onMissionVoteProgress.bind(this))
    this.bindEvent('avalon:mission-vote:result', this.onMissionVoteResult.bind(this))
    this.bindEvent('avalon:assassinate:result', this.onAssassinateResult.bind(this))
    this.bindEvent('avalon:game-over', this.onGameOver.bind(this))
    this.bindEvent('avalon:error', this.onAvalonError.bind(this))
  },
})
```

### 4.2 事件 → setData 映射

| 事件 | 关键 setData 字段 |
| --- | --- |
| `avalon:role-revealed` | `myRole`, `mySide`, `myVision`, `showRoleReveal: true` |
| `avalon:phase` | `phase`, `round`, `attemptNo`, `leaderSeat`, `failedProposalsInRound`, `score` |
| `avalon:proposal` | `currentProposal: { leaderSeat, memberSeats, attemptNo }`，并清空 `myMissionVote` |
| `avalon:public-vote:progress` | `publicVoteProgress: { voted, total }` |
| `avalon:public-vote:result` | `currentProposal.publicVoteResult: { approved, votes }`，并将本轮历史 push 到 `history` |
| `avalon:mission-vote:progress` | `missionVoteProgress: { voted, total }` |
| `avalon:mission-vote:result` | `currentRoundResult: { success, failVoteCount, requiredFails }` |
| `avalon:assassinate:result` | `assassinateResult: { targetSeat, isMerlin }` |
| `avalon:game-over` | `gameOver: { winnerSide, reason }`, `pageState: 'game-over'` |
| `avalon:error` | 见 §6 错误处理 |

### 4.3 客户端发射的事件

| UI 触发 | 发射事件 | Payload | 后端文档 § |
| --- | --- | --- | --- |
| 队长 `<seat-circle>` 选完点"提交提案" | `avalon:proposal:submit` | `{ roomCode, memberSeats }` | 6.2 |
| `<vote-card>` 点击 | `avalon:vote:public` | `{ roomCode, approve }` | 6.3 |
| `<mission-card>` 点击 | `avalon:vote:mission` | `{ roomCode, success }` | 6.4 |
| `<assassinate-panel>` 二次确认 | `avalon:assassinate` | `{ roomCode, targetSeat }` | 6.5 |

发射前必须 `setData({ submitting: true })` 禁用按钮，收到对应 progress / result 事件后再恢复。

---

## 5. 状态机映射 (Phase → UI)

| 后端 phase | 顶部 banner 文案 | 中央组件 | 底部组件 | 哪些人可操作 |
| --- | --- | --- | --- | --- |
| `ROLE_REVEAL` | "正在揭示身份..." | `<role-reveal-overlay>` | – | 所有人（仅查看自己的） |
| `PROPOSAL` | "队长 X 号正在组队 (第 N 轮 第 K 次提案)" | `<seat-circle mode="pick">`（仅队长可点） | `<ui-button>提交提案</ui-button>`（仅队长） | 队长 |
| `PUBLIC_VOTE` | "全体公投中" | `<seat-circle mode="view">` 高亮候选人 | `<vote-card>` + `<vote-progress>` | 全体玩家 |
| `MISSION` | "任务执行中" | `<seat-circle>` 高亮候选人 | 候选人见 `<mission-card>`，其他人见 `<vote-progress>` | 候选人 |
| `ROUND_RESULT` | "本轮结果揭晓" (短暂 3s 自动进入下一阶段) | `<scoreboard>` 高亮当前轮 | – | – |
| `ASSASSINATE` | "刺客正在选择刺杀目标..." | 刺客见 `<assassinate-panel>`，其他人见全屏遮罩 | – | 刺客 |
| `GAME_OVER` | "游戏结束 — 蓝方/红方胜利" | 结算面板：每轮结果 + 角色公开 + 失败原因 | 房主见"返回房间"按钮 | 房主 |

---

## 6. 网络层与错误处理

### 6.1 REST 调用沿用 `utils/request.ts`

```ts
import { request } from '../../utils/request'

interface AvalonStateResponse { /* 见后端 §6.1 */ }

const state = await request<AvalonStateResponse>({
  url: `/api/rooms/${roomCode}/avalon/state`,
  method: 'GET',
})
```

不要新建 `utils/avalon-request.ts`。所有 token 注入 / 401 处理 / envelope 拆包 / 超时 / 错误本地化都已在 `utils/request.ts` 里。

### 6.2 WS 调用沿用 `utils/socket.ts`

```ts
this.socket?.emit('avalon:vote:public', { roomCode: this.data.roomCode, approve: true })
```

不要在小程序自行实现 ack/promise 包装；socket 是 fire-and-forget，结果通过广播 / 单播事件回来。

### 6.3 `avalon:error` 处理表

| `code` | 处理 |
| --- | --- |
| `PHASE_MISMATCH` | **静默自动纠正**：调用 `fetchState()` 拉一次 `GET avalon/state` 覆盖本地阶段；不弹 toast |
| `NOT_LEADER` / `NOT_MEMBER` / `NOT_ASSASSIN` | 弹 `wx.showToast({ title: '操作不允许', icon: 'none' })`；同时拉一次 state 防止 UI 已经过期 |
| `INVALID_TEAM_SIZE` | 弹 toast `请选择 N 人` (N 来自当前 round 的 teamSize) |
| `EVIL_REQUIRED_FOR_FAIL` | **不应触发**（前端 `<mission-card>` 蓝方就没有"失败"按钮）；若触发说明 bug，用 `console.warn` 记录 |
| `ALREADY_VOTED` | 静默吞掉。属于双击 / 网络重发 / 多设备同步，不打扰用户 |
| `GAME_ENDED` | `wx.redirectTo` 回 `pages/room` |

### 6.4 401 与断线

完全复用既有逻辑：

- `request.ts` 收到 401 自动清理 token + redirect 到首页（已实现，见 `utils/request.ts:84-142`）
- `socket.ts` 自动指数退避重连（最多 10 次，500ms → 15s）
- 重连成功后**前端必须**主动 `fetchState()` 一次（避免错过断线期间的事件）

```ts
this.bindEvent('connect', () => {
  if (this.data.pageState === 'ready') this.fetchState(this.data.roomCode)
})
```

### 6.5 多设备同步

同账号在多设备登录时，后端会向所有 socket 都广播事件。前端不需要做额外去重；`(proposalId, userId)` 唯一约束保证同一用户的多设备投票服务端只接受第一次（其余返回 `ALREADY_VOTED`，按 §6.3 静默处理）。

---

## 7. 类型定义

新增到 `typings/types/index.d.ts`（与后端协议字段一一对应）：

```ts
// typings/types/index.d.ts

export type AvalonPhase =
  | 'ROLE_REVEAL'
  | 'PROPOSAL'
  | 'PUBLIC_VOTE'
  | 'MISSION'
  | 'ROUND_RESULT'
  | 'ASSASSINATE'
  | 'GAME_OVER'

export type AvalonSide = 'GOOD' | 'EVIL'

export type AvalonRoundResult = 'SUCCESS' | 'FAIL' | null

export interface AvalonVisionEntry {
  seatNo: number
  /** 'EVIL' = 确认红方; 'MERLIN_OR_MORGANA' = 派西维尔看到的二人之一 */
  label: 'EVIL' | 'MERLIN_OR_MORGANA'
}

export interface AvalonProposalView {
  leaderSeat: number
  memberSeats: number[]
  attemptNo: number
  iAmMember?: boolean
  myMissionVote?: boolean | null
  publicVoteResult?: AvalonPublicVoteResult
}

export interface AvalonPublicVoteResult {
  approved: boolean
  votes: Array<{ seat: number; approve: boolean }>
}

export interface AvalonMissionVoteResult {
  round: number
  success: boolean
  failVoteCount: number
  requiredFails: number
}

export interface AvalonHistoryRound {
  round: number
  result: AvalonRoundResult
  failVoteCount: number | null
  proposals: Array<{
    attemptNo: number
    leaderSeat: number
    memberSeats: number[]
    approved: boolean | null
    votes: Array<{ seat: number; approve: boolean }>
  }>
}

export interface AvalonStateSnapshot {
  phase: AvalonPhase
  round: number
  attemptNo: number
  currentLeaderSeat: number
  failedProposalsInRound: number
  score: { good: number; evil: number }
  myRole: string                      // '梅林' | '派西维尔' | '忠臣' | ...
  mySide: AvalonSide
  myVision: AvalonVisionEntry[]
  currentProposal: AvalonProposalView | null
  history: AvalonHistoryRound[]
}

export type AvalonErrorCode =
  | 'PHASE_MISMATCH'
  | 'NOT_LEADER'
  | 'NOT_MEMBER'
  | 'NOT_ASSASSIN'
  | 'INVALID_TEAM_SIZE'
  | 'EVIL_REQUIRED_FOR_FAIL'
  | 'ALREADY_VOTED'
  | 'GAME_ENDED'

export interface AvalonErrorPayload {
  code: AvalonErrorCode
  message: string
  phase?: AvalonPhase
  expectedPhase?: AvalonPhase
}
```

页面 `data` 类型示例（写在 `pages/avalon-play/avalon-play.ts` 顶部，**不要**导出到 typings）：

```ts
interface AvalonPlayPageData {
  pageState: 'loading' | 'ready' | 'error' | 'game-over'
  pageError: string
  roomCode: string
  myUserId: string
  mySeatNo: number
  players: Player[]            // 复用 utils 已有 Player 类型

  phase: AvalonPhase
  round: number
  attemptNo: number
  leaderSeat: number
  failedProposalsInRound: number
  score: { good: number; evil: number }

  myRole: string
  mySide: AvalonSide
  myVision: AvalonVisionEntry[]
  showRoleReveal: boolean

  currentProposal: AvalonProposalView | null
  publicVoteProgress: { voted: number; total: number } | null
  missionVoteProgress: { voted: number; total: number } | null
  currentRoundResult: AvalonMissionVoteResult | null
  history: AvalonHistoryRound[]

  assassinateResult: { targetSeat: number; isMerlin: boolean } | null
  gameOver: { winnerSide: AvalonSide; reason: string } | null

  submitting: boolean
}
```

---

## 8. 样式约定

### 8.1 完全使用 `app.wxss` 的 CSS 变量

| 用途 | 变量 |
| --- | --- |
| 蓝方任务格、蓝方按钮 | `--color-teal` / `--color-teal-light` |
| 红方任务格、红方按钮、刺杀面板 | `--color-danger` / `--color-danger-bg` |
| 队长头像描边、当前阶段强调 | `--color-accent` / `--color-accent-light` |
| 卡片背景、遮罩 | `--color-surface` / `--color-bg` |
| 文字主 / 次 / 弱 | `--color-text-primary` / `--color-text-secondary` / `--color-text-muted` |
| 圆角、间距、阴影 | `--radius-md` / `--space-5` / `--shadow-sm` |
| 过渡 | `var(--transition-normal)` |

**禁止**硬编码颜色 / 字号 / 间距。如果配色不够，新增 CSS 变量到 `app.wxss`，不要在组件内 hard code。

### 8.2 `<scoreboard>` 示例

```css
/* components/avalon/scoreboard/scoreboard.wxss */
.scoreboard {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.scoreboard__cell {
  flex: 1;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-weight: 600;
  background: var(--color-bg);
  color: var(--color-text-muted);
  transition: background var(--transition-normal);
}
.scoreboard__cell--success {
  background: var(--color-teal-light);
  color: var(--color-teal);
}
.scoreboard__cell--fail {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}
.scoreboard__cell--current {
  box-shadow: var(--shadow-gold);
}
```

### 8.3 `<seat-circle>` 布局

用 CSS `transform: rotate(...) translateY(-50%)` 把座位均匀分布在圆周上。**不要**用 wx.canvas 绘制；用 wxml + wxss 才能保留点击区与无障碍焦点。

---

## 9. 必须复用的现有 utils 清单（不要重写）

| # | 文件 / 资产 | 用途 |
| --- | --- | --- |
| A | `utils/request.ts` | REST 调用（envelope 拆包、token 注入、401 处理、超时） |
| B | `utils/socket.ts` | WebSocket（自动重连、命名空间、bindEvent / detachListeners 模式） |
| C | `utils/auth.ts` | token / userProfile 加密存储、JWT 过期检测 |
| D | `utils/auth-guard.ts` | `requireAuth()` 页面登录守卫 |
| E | `utils/role-config.ts` | RoleConfig / ROLE_LABELS（角色中文文案） |
| F | `utils/util.ts` | 时间格式化（`formatTime`） |
| G | `utils/config.ts` | `baseUrl` / `socketUrl` 环境配置 |
| H | `components/navigation-bar/` | 自定义顶部导航 |
| I | `components/ui-button/` | 主要按钮 (`primary` / `secondary` / `danger` / `accent`) |
| J | `components/ui-card/` | 卡片容器 |
| K | `components/ui-state-panel/` | loading / error / empty / success 占位面板 |

如发现 utils 缺能力（例如需要新的 hash / shuffle / debounce），优先在 `utils/` 下新增独立小文件，不要在页面内嵌。

---

## 10. UX 兜底要求

### 10.1 防双击 / 防误触

```ts
async submitProposal() {
  if (this.data.submitting) return
  this.setData({ submitting: true })
  try {
    this.socket?.emit('avalon:proposal:submit', { roomCode, memberSeats })
  } catch (err) {
    this.setData({ submitting: false })
  }
  // submitting 在收到 avalon:proposal 广播后由 onProposal 重置
}
```

### 10.2 阶段切换反馈

```ts
onPhase(payload: AvalonPhasePayload) {
  this.setData({ phase: payload.phase, round: payload.round })
  wx.vibrateShort({ type: 'light' })
  if (payload.phase === 'PUBLIC_VOTE') wx.showToast({ title: '请投票', icon: 'none', duration: 1200 })
}
```

### 10.3 刺杀阶段全屏遮罩

刺客点开 `<assassinate-panel>` 后，点选目标必须有"二次确认 modal"，避免误触一锤定音的错误。其他玩家在 `ASSASSINATE` 阶段全屏显示遮罩 + 文案"刺客正在选择刺杀目标，请等待...."，禁所有可点元素。

### 10.4 断线遮罩

复用 `pages/room/room.ts` 已有的 `connectionStatusText` 模式：

| `connectionStatus` | UI |
| --- | --- |
| `connected` | 无遮罩 |
| `connecting` / `reconnecting` | 顶部细黄条 + 文案 "网络重连中..." |
| `unavailable` | 全屏遮罩 + "网络断开，请检查后重试" + 重试按钮 |

重连成功后**前端必须**调用 `fetchState()` 一次（参见 §6.4）。

### 10.5 视觉细节

- 当前队长头像描金边（`box-shadow: 0 0 0 4rpx var(--color-accent)`）
- 候选人头像加蓝色光晕
- 已投玩家头像变灰
- mission 投票揭晓时，失败票数用红色徽章动画显示，**永远不显示具体投票人头像**

---

## 11. 验收标准（DoD）

实现 PR 合入前必须通过以下勾选清单：

- [ ] 真机 5 人测试一局走完不卡阶段（含 1 次否决、1 次成功任务、1 次失败任务、刺杀）
- [ ] 杀进程后重启 → 进入房间 → 自动恢复到正确的阶段与本人视角（包括 `myRole` / `myVision`）
- [ ] 任务投票揭晓界面在 DOM 中**搜索不到**任何"已投赞成"/"已投反对"的具体投票人字段
- [ ] 任意收到 `avalon:error` 不会让页面崩溃，会自动按 §6.3 表格处理
- [ ] 切到后台 30s+ 再切回前台 socket 重连后状态正确（必须主动 `fetchState`）
- [ ] 不调用任何 `wx.*` 私有 / 已废弃 API
- [ ] 不出现硬编码颜色 / 字号 / 间距，全部用 CSS 变量（grep `#[0-9a-f]{3,6}` 在新增文件应为 0 命中）
- [ ] 蓝方角色在 mission 阶段 UI 上**没有**"失败"按钮（按钮根本不渲染，不是 disabled）
- [ ] 刺客点选刺杀目标必须二次确认
- [ ] 多设备同账号登录：A 设备投票后 B 设备 `<vote-progress>` 立即更新
- [ ] 首次加载 `pages/avalon-play` 不超过 1.5s（基于 `getNetworkType: wifi`）
- [ ] 主流机型（iOS 16+ / Android 12+）真机自测无 wxml 排版问题
- [ ] 遵循 `coding-style.md`：组件 < 200 行，单文件 < 800 行，函数 < 50 行

---

## 12. 相关文档

- [`nightdeal-backend/docs/AVALON-DEVELOPMENT.md`](https://github.com/kaiwenyao/nightdeal/blob/main/nightdeal-backend/docs/AVALON-DEVELOPMENT.md) — 后端权威文档（规则 / Prisma / REST / WS / 错误码）
- [`docs/wechat-auth.md`](./wechat-auth.md) — 微信登录与 token 流程
- 源码参考：
  - `utils/socket.ts` — WS 封装与 bindEvent/detachListeners 模式
  - `utils/request.ts` — REST 封装与 401 处理
  - `utils/role-config.ts` — RoleConfig / ROLE_LABELS / 角色中文文案
  - `pages/room/room.ts` — 现有页面 / WS 模式范本
  - `app.wxss` — 设计 token (CSS 变量)
