/**
 * 阿瓦隆游戏页面
 * 支持完整的游戏流程：身份查看、组队、投票、任务执行、刺杀
 */

import { requireAuth } from '../../utils/auth-guard'
import { connectSocket, SocketLike } from '../../utils/socket'

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
    myFaction: '',
    myRoleDesc: '',
    players: [] as PlayerInfo[],
    // 预计算的玩家状态（用于 WXML 渲染）
    playersWithState: [] as Array<PlayerInfo & {
      isSelected: boolean
      isInTeam: boolean
      isLeader: boolean
    }>,

    // 组队相关
    proposedTeam: [] as string[],
    proposedTeamNames: [] as string[],
    selectedPlayers: [] as string[],
    teamSize: 0,

    // 投票相关
    myVote: '' as string,
    hasVoted: false,

    // 任务相关
    myQuestAction: '' as string,
    hasPerformedQuest: false,

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
          selectedPlayers: [],
        })
        this.updateUIState()
      }
    })

    this.bindSocketEvent('avalon:vote-updated', () => {
      wx.showToast({ title: '有玩家完成了投票', icon: 'none' })
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
        const result = data as { winner: string; reason: string }
        this.setData({ gameResult: result })
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
      if (typeof data === 'object' && data !== null) {
        const { message } = data as { message: string }
        wx.showToast({ title: message, icon: 'none' })
      }
    })

    if (socket.connected) {
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

  updateGameState(state: PlayerView) {
    // 预计算玩家状态（用于 WXML 渲染）
    const selectedSet = new Set(this.data.selectedPlayers)
    const proposedSet = new Set(state.proposedTeam)
    const playersWithState = state.players.map(p => ({
      ...p,
      isSelected: selectedSet.has(p.id),
      isInTeam: proposedSet.has(p.id),
      isLeader: p.id === state.leaderId,
    }))

    // 预计算可见信息名称
    const visibleInfo = state.visibleInfo || {}
    const merlinSeeNames = (visibleInfo.merlinSees || []).map(id => this.getPlayerName(id, state.players))
    const percivalSeeNames = (visibleInfo.percivalSees || []).map(id => this.getPlayerName(id, state.players))
    const evilCompanionNames = (visibleInfo.evilCompanions || []).map(id => this.getPlayerName(id, state.players))

    // 预计算组队成员名称
    const proposedTeamNames = state.proposedTeam.map(id => this.getPlayerName(id, state.players))

    // 预计算任务历史显示
    const questHistoryDisplay = state.questHistory.map(q => ({
      ...q,
      resultIcon: q.succeeded ? '✅' : '❌',
    }))
    const pendingQuests = Array.from({ length: 5 - state.questHistory.length }, (_, i) => ({
      round: state.questHistory.length + i + 1,
      resultIcon: '?',
    }))

    // 预计算游戏结果
    let gameResultReasonText = ''
    let assassinatedPlayerName = ''
    if (state.gameResult) {
      gameResultReasonText = this.getResultReasonText(state.gameResult.reason)
      if (state.gameResult.assassinatedPlayerId) {
        assassinatedPlayerName = this.getPlayerName(state.gameResult.assassinatedPlayerId, state.players)
      }
    }

    this.setData({
      myId: state.myId,
      myRole: state.myRole || '',
      myFaction: state.myFaction || '',
      phase: state.phase,
      phaseName: this.getPhaseName(state.phase),
      round: state.round,
      leaderId: state.leaderId,
      goodScore: state.goodScore,
      evilScore: state.evilScore,
      rejectedTeamVoteCount: state.rejectedTeamVoteCount,
      players: state.players,
      playersWithState,
      proposedTeam: state.proposedTeam,
      proposedTeamNames,
      teamSize: state.currentQuestConfig.teamSize,
      merlinSeeNames,
      percivalSeeNames,
      evilCompanionNames,
      gameResult: state.gameResult || null,
      gameResultReasonText,
      assassinatedPlayerName,
      questHistoryDisplay,
      pendingQuests,
      canProposeTeam: state.canProposeTeam,
      canVote: state.canVote,
      canPerformQuest: state.canPerformQuest,
      canAssassinate: state.canAssassinate,
      pageState: 'ready',
      myRoleDesc: this.getRoleDesc(state.myRole || ''),
      showVotingPanel: state.canVote,
      showQuestPanel: state.canPerformQuest,
      showAssassinationPanel: state.canAssassinate,
    })
  },

  // ==================== 操作处理 ====================

  handleToggleRole() {
    this.setData({ showRoleInfo: !this.data.showRoleInfo })
  },

  handleSelectPlayer(e: WechatMiniprogram.TouchEvent) {
    const playerId = e.currentTarget.dataset.playerId as string
    if (!playerId) return

    const { selectedPlayers, teamSize } = this.data
    const index = selectedPlayers.indexOf(playerId)

    if (index > -1) {
      // 取消选择
      const newSelected = [...selectedPlayers]
      newSelected.splice(index, 1)
      this.setData({ selectedPlayers: newSelected })
    } else if (selectedPlayers.length < teamSize) {
      // 选择
      this.setData({ selectedPlayers: [...selectedPlayers, playerId] })
    } else {
      wx.showToast({ title: `只能选择 ${teamSize} 名队员`, icon: 'none' })
    }
  },

  handleProposeTeam() {
    const { roomCode, selectedPlayers, teamSize } = this.data

    if (selectedPlayers.length !== teamSize) {
      wx.showToast({ title: `需要选择 ${teamSize} 名队员`, icon: 'none' })
      return
    }

    this.socket?.emit('avalon:propose-team', {
      roomCode,
      selectedPlayerIds: selectedPlayers,
    })
  },

  handleTeamVote(e: WechatMiniprogram.TouchEvent) {
    const vote = e.currentTarget.dataset.vote as string
    if (!vote || this.data.hasVoted) return

    this.socket?.emit('avalon:team-vote', {
      roomCode: this.data.roomCode,
      vote,
    })

    this.setData({
      hasVoted: true,
      myVote: vote,
    })
  },

  handleQuestAction(e: WechatMiniprogram.TouchEvent) {
    const action = e.currentTarget.dataset.action as string
    if (!action || this.data.hasPerformedQuest) return

    this.socket?.emit('avalon:quest-action', {
      roomCode: this.data.roomCode,
      action,
    })

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
          this.socket?.emit('avalon:assassinate', {
            roomCode,
            targetPlayerId: assassinationTarget,
          })
        }
      },
    })
  },

  handleBackRoom() {
    wx.navigateBack()
  },

  // ==================== 辅助函数 ====================

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

  isPlayerSelected(playerId: string): boolean {
    return this.data.selectedPlayers.includes(playerId)
  },

  isPlayerInTeam(playerId: string): boolean {
    return this.data.proposedTeam.includes(playerId)
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
