/**
 * 阿瓦隆游戏页面
 * 支持完整的游戏流程：身份查看、组队、投票、任务执行、刺杀
 */

import { requireAuth, handleSessionExpired, handleKicked, isKickedRoomError } from '../../utils/auth-guard'
import { connectSocket, setSkipNextRoomStartedNav, SocketLike } from '../../utils/socket'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ==================== 类型定义 ====================

interface PlayerView {
  myId: string
  myRole?: string
  myFaction?: string
  phase: string
  round: number
  leaderId: string
  goodScore: number
  evilScore: number
  rejectedTeamVoteCount: number
  players: PlayerInfo[]
  proposedTeam: string[]
  currentQuestConfig: QuestConfig
  visibleInfo: VisibleInfo
  gameResult?: GameResult
  questHistory: QuestHistoryItem[]
  canProposeTeam: boolean
  canVote: boolean
  canPerformQuest: boolean
  canAssassinate: boolean
}

interface PlayerInfo {
  id: string
  name: string
  seatNo: number
  isHost: boolean
  isConnected: boolean
  isLeader: boolean
}

interface QuestConfig {
  round: number
  teamSize: number
  requiredFailCount: number
}

interface VisibleInfo {
  merlinSees?: string[]
  percivalSees?: string[]
  evilCompanions?: string[]
}

interface GameResult {
  winner: string
  reason: string
  assassinatedPlayerId?: string
}

interface QuestHistoryItem {
  round: number
  team: string[]
  successCount: number
  failCount: number
  requiredFailCount: number
  succeeded: boolean
}

type PlayerWithState = PlayerInfo & {
  isSelected: boolean
  isInTeam: boolean
  isLeader: boolean
}

function computePlayersWithState(
  players: PlayerInfo[],
  selectedPlayers: string[],
  proposedTeam: string[],
  leaderId: string,
): PlayerWithState[] {
  const selectedSet = new Set(selectedPlayers)
  const proposedSet = new Set(proposedTeam)
  return players.map(p => ({
    ...p,
    isSelected: selectedSet.has(p.id),
    isInTeam: proposedSet.has(p.id),
    isLeader: p.id === leaderId,
  }))
}

// ==================== 页面定义 ====================

Page({
  data: {
    // 基础信息
    roomCode: '',
    pageState: 'loading' as 'loading' | 'ready' | 'error',
    pageError: '',

    // 游戏状态
    phase: '',
    phaseName: '',
    round: 1,
    leaderId: '',
    goodScore: 0,
    evilScore: 0,
    rejectedTeamVoteCount: 0,

    // 玩家信息
    myId: '',
    myRole: '',
    myRoleName: '',
    myFaction: '',
    myRoleDesc: '',
    isHost: false,
    players: [] as PlayerInfo[],
    // 预计算的玩家状态（用于 WXML 渲染）
    playersWithState: [] as PlayerWithState[],

    // 组队相关
    proposedTeam: [] as string[],
    proposedTeamNames: [] as string[],
    selectedPlayers: [] as string[],
    teamSize: 0,

    // 投票相关
    myVote: '' as string,
    hasVoted: false,
    // 实时投票进度（来自后端 avalon:vote-updated，仅为交互反馈，非权威状态）
    votedCount: 0 as number,
    votedVoters: [] as string[],

    // 任务相关
    myQuestAction: '' as string,
    hasPerformedQuest: false,
    // 我是否在当前任务队伍中（由 proposedTeam 与 myId 预计算，供面板文案判断）
    amInQuestTeam: false,

    // 可见信息（预计算为名称数组）
    merlinSeeNames: [] as string[],
    percivalSeeNames: [] as string[],
    evilCompanionNames: [] as string[],

    // 游戏结果
    gameResult: null as GameResult | null,
    gameResultReasonText: '',
    assassinatedPlayerName: '',

    // 任务历史（预计算图标）
    questHistoryDisplay: [] as Array<QuestHistoryItem & { resultIcon: string }>,
    pendingQuests: [] as Array<{ round: number; resultIcon: string }>,

    // 操作权限
    canProposeTeam: false,
    canVote: false,
    canPerformQuest: false,
    canAssassinate: false,

    // 刺杀相关
    assassinationTarget: '' as string,
    assassinationTargetName: '',

    // UI 状态
    showRoleInfo: true,
    showVotingPanel: false,
    showQuestPanel: false,
    showAssassinationPanel: false,
  },

  socket: null as SocketLike | null,
  socketBindings: [] as Array<{ event: string; listener: (...args: unknown[]) => void }>,
  // 本局是否已被房主结束（room:ended）；结束后返回房间不应设置 skip 标志，与 game.ts 行为对齐
  gameEnded: false,

  // ==================== 生命周期 ====================

  async onLoad(query: Record<string, string>) {
    const auth = await requireAuth()
    if (!auth) return

    const roomCode = (query.roomCode || '').trim()
    if (!roomCode) {
      this.setData({
        pageState: 'error',
        pageError: '缺少房间信息',
      })
      return
    }

    this.setData({ roomCode, myId: auth.profile.id })
    this.initSocket()
  },

  onUnload() {
    // 仅"游戏进行中手动离开"才置位 skip：同一局内回到房间后不再被 room:started 拉走。
    // 若是 room:ended 触发的返回（gameEnded），skip 已由 socket 层在 room:ended 时清除。
    if (!this.gameEnded) {
      setSkipNextRoomStartedNav(true)
    }
    this.detachSocketListeners()
    if (this.socket) {
      this.socket.emit('avalon:leave', { roomCode: this.data.roomCode })
      this.socket = null
    }
  },

  // ==================== Socket 连接 ====================

  initSocket() {
    const socket = connectSocket(false)
    this.socket = socket

    this.bindSocketEvent('connect', () => {
      // 同时加入房间频道：断线重连后才能继续收到 room:ended / room:state / 踢人事件
      socket.emit('room:join', { roomCode: this.data.roomCode })
      socket.emit('avalon:join', { roomCode: this.data.roomCode })
    })

    // /avalon 命名空间单独连上后需再次发送 avalon:join：
    // 主 connect 事件在 /room ack 时触发，早于 /avalon ack，此时 avalon emit 尚未就绪。
    this.bindSocketEvent('avalon:connect', () => {
      socket.emit('avalon:join', { roomCode: this.data.roomCode })
    })

    this.bindSocketEvent('avalon:state', (data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        this.updateGameState(data as PlayerView)
      }
    })

    this.bindSocketEvent('avalon:phase-changed', (data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        const { phase } = data as { phase: string }
        this.setData({
          phase,
          hasVoted: false,
          hasPerformedQuest: false,
          myVote: '',
          myQuestAction: '',
          votedCount: 0,
          votedVoters: [],
          selectedPlayers: [],
          playersWithState: computePlayersWithState(
            this.data.players,
            [],
            this.data.proposedTeam,
            this.data.leaderId,
          ),
        })
        this.updateUIState()
      }
    })

    this.bindSocketEvent('avalon:vote-resolved', (data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        const result = data as { approved: boolean; approvals: number; rejections: number }
        wx.showModal({
          title: result.approved ? '队伍通过' : '队伍被否决',
          content: `同意: ${result.approvals} 票，反对: ${result.rejections} 票`,
          showCancel: false,
        })
      }
    })

    this.bindSocketEvent('avalon:vote-updated', (data: unknown) => {
      // 实时投票进度：仅用于交互反馈（决定结果以 avalon:vote-resolved 为准）。
      // 公开投票模式后端携带 voterId（去重计数）；匿名模式只带 message，退化为增量计数。
      if (typeof data !== 'object' || data === null) {
        return
      }
      const { voterId } = data as { voterId?: string }
      let { votedVoters, votedCount } = this.data
      if (typeof voterId === 'string' && voterId) {
        if (votedVoters.includes(voterId)) {
          return
        }
        votedVoters = [...votedVoters, voterId]
        votedCount = votedVoters.length
      } else {
        votedCount += 1
      }
      this.setData({ votedCount, votedVoters })
    })

    this.bindSocketEvent('avalon:quest-resolved', (data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        const result = data as { succeeded: boolean; successCount: number; failCount: number }
        wx.showModal({
          title: result.succeeded ? '任务成功' : '任务失败',
          content: `成功: ${result.successCount} 票，失败: ${result.failCount} 票`,
          showCancel: false,
        })
      }
    })

    this.bindSocketEvent('avalon:quest-action-updated', (data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        const { actedCount, totalRequired } = data as { actedCount: number; totalRequired: number }
        wx.showToast({ title: `${actedCount}/${totalRequired} 名队员已提交`, icon: 'none' })
      }
    })

    this.bindSocketEvent('avalon:assassination-resolved', (data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        const result = data as GameResult
        // 与 updateGameState 保持一致：同时更新结果文案与被刺杀玩家名
        this.setData({
          gameResult: result,
          gameResultReasonText: this.getResultReasonText(result.reason),
          assassinatedPlayerName: result.assassinatedPlayerId
            ? this.getPlayerName(result.assassinatedPlayerId)
            : '',
        })
      }
    })

    this.bindSocketEvent('avalon:game-finished', (data: unknown) => {
      if (typeof data === 'object' && data !== null) {
        const result = data as GameResult
        this.setData({ gameResult: result })
        wx.showModal({
          title: '游戏结束',
          content: result.winner === 'good' ? '好人阵营获胜！' : '邪恶阵营获胜！',
          showCancel: false,
        })
      }
    })

    this.bindSocketEvent('avalon:error', (data: unknown) => {
      if (!isRecord(data)) {
        return
      }
      if (data.code === 'UNAUTHORIZED') {
        void handleSessionExpired()
        return
      }
      if (typeof data.message === 'string' && data.message) {
        wx.showToast({ title: data.message, icon: 'none' })
      }
    })

    // ==================== 房间生命周期事件（与 game.ts 对齐） ====================

    this.bindSocketEvent('room:ended', () => {
      this.gameEnded = true
      wx.showToast({ title: '房主已结束游戏', icon: 'none' })
      wx.navigateBack()
    })

    this.bindSocketEvent('room:error', (data: unknown) => {
      if (!isRecord(data)) {
        return
      }
      if (data.code === 'UNAUTHORIZED') {
        void handleSessionExpired()
        return
      }
      if (typeof data.message !== 'string' || !data.message) {
        return
      }
      if (isKickedRoomError(data)) {
        handleKicked(data.message)
        return
      }
      wx.showToast({ title: data.message, icon: 'none' })
    })

    this.bindSocketEvent('reconnect_failed', () => {
      wx.showModal({
        title: '连接已断开',
        content: '无法重新连接到房间服务器，请返回房间重试',
        confirmText: '返回房间',
        showCancel: false,
        success: () => {
          setSkipNextRoomStartedNav(true)
          wx.navigateBack()
        },
      })
    })

    if (socket.connected) {
      socket.emit('room:join', { roomCode: this.data.roomCode })
      socket.emit('avalon:join', { roomCode: this.data.roomCode })
    } else {
      socket.connect()
    }
  },

  bindSocketEvent(event: string, listener: (...args: unknown[]) => void) {
    const socket = this.socket
    if (!socket) return
    socket.on(event, listener)
    this.socketBindings.push({ event, listener })
  },

  detachSocketListeners() {
    const socket = this.socket
    if (!socket) return
    for (const { event, listener } of this.socketBindings) {
      socket.off(event, listener)
    }
    this.socketBindings = []
  },

  // ==================== 状态更新 ====================

  /** 阶段切换后按当前操作权限刷新面板显隐 */
  updateUIState() {
    this.setData({
      showVotingPanel: this.data.canVote,
      showQuestPanel: this.data.canPerformQuest,
      showAssassinationPanel: this.data.canAssassinate,
    })
  },

  updateGameState(state: PlayerView) {
    // 入口判空兜底：一条缺字段的推送不应让整页崩溃
    const players = Array.isArray(state.players) ? state.players : []
    const proposedTeam = Array.isArray(state.proposedTeam) ? state.proposedTeam : []
    const questHistory = Array.isArray(state.questHistory) ? state.questHistory : []
    const questConfig = state.currentQuestConfig && typeof state.currentQuestConfig.teamSize === 'number'
      ? state.currentQuestConfig
      : { round: 1, teamSize: 0, requiredFailCount: 1 }
    const phase = typeof state.phase === 'string' ? state.phase : ''

    // 新投票轮开始：重置实时投票进度计数，避免跨轮脏数据。
    // 仅在真正“进入”投票轮时清零——若已处于 team_voting（如同一轮中因
    // 他人重连而广播的 avalon:state），不得清零，否则会把已投出的票数进度
    // 误清为 0（投票结果仍以 avalon:vote-resolved 为准，这里只是实时计数）。
    const isNewVoteRound = phase === 'team_voting' && this.data.phase !== 'team_voting'
    const voteRoundReset = isNewVoteRound ? { votedCount: 0 as number, votedVoters: [] as string[] } : {}

    const playersWithState = computePlayersWithState(
      players,
      this.data.selectedPlayers,
      proposedTeam,
      state.leaderId,
    )

    // 预计算可见信息名称
    const visibleInfo = state.visibleInfo || {}
    const merlinSeeNames = (visibleInfo.merlinSees || []).map(id => this.getPlayerName(id, players))
    const percivalSeeNames = (visibleInfo.percivalSees || []).map(id => this.getPlayerName(id, players))
    const evilCompanionNames = (visibleInfo.evilCompanions || []).map(id => this.getPlayerName(id, players))

    // 预计算组队成员名称
    const proposedTeamNames = proposedTeam.map(id => this.getPlayerName(id, players))

    // 预计算任务历史显示
    const questHistoryDisplay = questHistory.map(q => ({
      ...q,
      resultIcon: q.succeeded ? '✅' : '❌',
    }))
    // 防御：questHistory 不应超过 5 轮，但对异常数据做上界截断，避免 5 - length 为负导致 RangeError
    const completedRounds = Math.min(questHistory.length, 5)
    const pendingQuests = Array.from({ length: 5 - completedRounds }, (_, i) => ({
      round: completedRounds + i + 1,
      resultIcon: '?',
    }))

    // 预计算游戏结果
    let gameResultReasonText = ''
    let assassinatedPlayerName = ''
    if (state.gameResult) {
      gameResultReasonText = this.getResultReasonText(state.gameResult.reason)
      if (state.gameResult.assassinatedPlayerId) {
        assassinatedPlayerName = this.getPlayerName(state.gameResult.assassinatedPlayerId, players)
      }
    }

    const me = players.find(p => p.id === state.myId)

    this.setData({
      myId: state.myId,
      myRole: state.myRole || '',
      myRoleName: this.getRoleName(state.myRole || ''),
      myFaction: state.myFaction || '',
      isHost: me ? !!me.isHost : false,
      phase,
      phaseName: this.getPhaseName(phase),
      round: state.round,
      leaderId: state.leaderId,
      goodScore: state.goodScore,
      evilScore: state.evilScore,
      rejectedTeamVoteCount: state.rejectedTeamVoteCount,
      players,
      playersWithState,
      proposedTeam,
      proposedTeamNames,
      teamSize: questConfig.teamSize,
      merlinSeeNames,
      percivalSeeNames,
      evilCompanionNames,
      gameResult: state.gameResult || null,
      gameResultReasonText,
      assassinatedPlayerName,
      questHistoryDisplay,
      pendingQuests,
      amInQuestTeam: proposedTeam.includes(state.myId),
      canProposeTeam: !!state.canProposeTeam,
      canVote: !!state.canVote,
      canPerformQuest: !!state.canPerformQuest,
      canAssassinate: !!state.canAssassinate,
      pageState: 'ready',
      myRoleDesc: this.getRoleDesc(state.myRole || ''),
      showVotingPanel: !!state.canVote,
      showQuestPanel: !!state.canPerformQuest,
      showAssassinationPanel: !!state.canAssassinate,
      ...voteRoundReset,
    })
  },

  // ==================== 操作处理 ====================

  handleToggleRole() {
    this.setData({ showRoleInfo: !this.data.showRoleInfo })
  },

  handleSelectPlayer(e: WechatMiniprogram.TouchEvent) {
    const playerId = e.currentTarget.dataset.playerId as string
    if (!playerId) return
    if (this.data.phase !== 'team_building' || !this.data.canProposeTeam) {
      return
    }

    const { selectedPlayers, teamSize, players, proposedTeam, leaderId } = this.data
    const index = selectedPlayers.indexOf(playerId)
    let newSelected: string[]

    if (index > -1) {
      newSelected = [...selectedPlayers]
      newSelected.splice(index, 1)
    } else if (selectedPlayers.length < teamSize) {
      newSelected = [...selectedPlayers, playerId]
    } else {
      wx.showToast({ title: `只能选择 ${teamSize} 名队员`, icon: 'none' })
      return
    }

    this.setData({
      selectedPlayers: newSelected,
      playersWithState: computePlayersWithState(players, newSelected, proposedTeam, leaderId),
    })
  },

  handleProposeTeam() {
    const { roomCode, selectedPlayers, teamSize } = this.data

    if (selectedPlayers.length !== teamSize) {
      wx.showToast({ title: `需要选择 ${teamSize} 名队员`, icon: 'none' })
      return
    }

    const sent = this.socket?.emit('avalon:propose-team', {
      roomCode,
      selectedPlayerIds: selectedPlayers,
    })
    if (!sent) {
      wx.showToast({ title: '连接已断开，请稍后再试', icon: 'none' })
    }
  },

  handleBeginGame() {
    if (this.data.phase !== 'role_reveal' || !this.data.isHost) {
      return
    }
    const sent = this.socket?.emit('avalon:begin', { roomCode: this.data.roomCode })
    if (!sent) {
      wx.showToast({ title: '连接已断开，请稍后再试', icon: 'none' })
    }
  },

  handleTeamVote(e: WechatMiniprogram.TouchEvent) {
    const vote = e.currentTarget.dataset.vote as string
    // canVote 为服务端权威状态（未投过票才为 true）：重进页面时本地的
    // hasVoted 已丢失，仅靠它会向已投过票的用户展示按钮，投出去必然被
    // 服务端拒绝并把本地 myVote 写成与实际不符的值。
    if (!vote || this.data.hasVoted || !this.data.canVote) return

    // 先 emit 成功再锁定 UI：断线时不能乐观置位，否则票没发出去 UI 却锁死，该轮卡死
    const sent = this.socket?.emit('avalon:team-vote', {
      roomCode: this.data.roomCode,
      vote,
    })
    if (!sent) {
      wx.showToast({ title: '连接已断开，请稍后再试', icon: 'none' })
      return
    }

    this.setData({
      hasVoted: true,
      myVote: vote,
    })
  },

  handleQuestAction(e: WechatMiniprogram.TouchEvent) {
    const action = e.currentTarget.dataset.action as string
    // 同 handleTeamVote：以服务端 canPerformQuest 为准，防止重进页面后
    // 重复提交必然失败的任务票。
    if (!action || this.data.hasPerformedQuest || !this.data.canPerformQuest) return

    // 同 handleTeamVote：emit 失败不置位，避免任务票丢失且 UI 锁死
    const sent = this.socket?.emit('avalon:quest-action', {
      roomCode: this.data.roomCode,
      action,
    })
    if (!sent) {
      wx.showToast({ title: '连接已断开，请稍后再试', icon: 'none' })
      return
    }

    this.setData({
      hasPerformedQuest: true,
      myQuestAction: action,
    })
  },

  handleSelectAssassinationTarget(e: WechatMiniprogram.TouchEvent) {
    const targetId = e.currentTarget.dataset.playerId as string
    const targetName = this.getPlayerName(targetId)
    this.setData({
      assassinationTarget: targetId,
      assassinationTargetName: targetName,
    })
  },

  handleAssassinate() {
    const { roomCode, assassinationTarget, assassinationTargetName } = this.data

    if (!assassinationTarget) {
      wx.showToast({ title: '请选择刺杀目标', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认刺杀',
      content: `确定要刺杀 ${assassinationTargetName} 吗？`,
      success: (res) => {
        if (res.confirm) {
          const sent = this.socket?.emit('avalon:assassinate', {
            roomCode,
            targetPlayerId: assassinationTarget,
          })
          if (!sent) {
            wx.showToast({ title: '连接已断开，请稍后再试', icon: 'none' })
          }
        }
      },
    })
  },

  handleBackRoom() {
    // 手动返回房间：同一局内的 room:started（如重连补发）不再自动跳回游戏页
    setSkipNextRoomStartedNav(true)
    wx.navigateBack()
  },

  // ==================== 辅助函数 ====================

  /** 角色枚举值（英文）→ 界面展示名（中文），与全应用其余文案语言一致 */
  getRoleName(role: string): string {
    const names: Record<string, string> = {
      'Merlin': '梅林',
      'Percival': '派西维尔',
      'LoyalServant': '忠臣',
      'Morgana': '莫甘娜',
      'Assassin': '刺客',
      'Mordred': '莫德雷德',
      'Oberon': '奥伯伦',
      'Minion': '爪牙',
    }
    return names[role] || role
  },

  getRoleDesc(role: string): string {
    const descs: Record<string, string> = {
      'Merlin': '你知道所有坏人（除莫德雷德外）的身份，但要小心不要暴露自己！',
      'Percival': '你知道梅林候选人是谁，但不知道谁是真正的梅林。',
      'LoyalServant': '你是好人阵营，没有特殊能力，但可以通过推理找出坏人。',
      'Morgana': '你假装是梅林，迷惑派西维尔。与其他坏人互认。',
      'Assassin': '游戏结束后可以刺杀梅林，如果成功则坏人获胜。与其他坏人互认。',
      'Mordred': '梅林看不到你的身份。与其他坏人互认。',
      'Oberon': '你是坏人，但其他坏人不知道你的身份，你也不知道他们。',
      'Minion': '你是坏人阵营，与其他坏人互认。',
    }
    return descs[role] || ''
  },

  getPlayerName(playerId: string, players?: PlayerInfo[]): string {
    const list = players || this.data.players
    const player = list.find(p => p.id === playerId)
    return player ? player.name : '未知'
  },

  getPhaseName(phase: string): string {
    const names: Record<string, string> = {
      'role_reveal': '身份揭示',
      'team_building': '组队阶段',
      'team_voting': '投票阶段',
      'quest_action': '任务执行',
      'assassination': '刺杀阶段',
      'finished': '游戏结束',
    }
    return names[phase] || phase
  },

  getResultReasonText(reason: string): string {
    const reasons: Record<string, string> = {
      'three_success_quests': '好人完成了三个任务',
      'three_failed_quests': '邪恶破坏了三个任务',
      'merlin_assassinated': '梅林被刺杀',
      'assassination_failed': '刺杀失败',
      'five_rejected_teams': '连续五次组队被否决',
    }
    return reasons[reason] || reason
  },

  getQuestResultIcon(succeeded: boolean): string {
    return succeeded ? '✅' : '❌'
  },
})
