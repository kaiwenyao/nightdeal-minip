import { getToken, getUserProfile } from '../../utils/auth'
import { request } from '../../utils/request'
import { connectSocket, disconnectSocket, isSocketDomainListError, SocketLike } from '../../utils/socket'
import { formatRoleSummary, formatSgsRoleSummary, RoleConfig, SgsRoleConfig } from '../../utils/role-config'

interface PlayerUser {
  id: string
  nickName: string
  avatarUrl: string
}

interface Player {
  id: string
  seatNo: number
  isOnline?: boolean
  user: PlayerUser
  joinedAt: string
}

interface RoomHost {
  id: string
  nickName: string
  avatarUrl: string
}

interface RoomSnapshot {
  id: string
  code: string
  status: string
  gameType?: string
  roleConfig: unknown
  maxPlayers: number
  host: RoomHost | null
  players: Player[]
  createdAt: string
}

interface RoomStatePayload {
  room?: {
    code?: string
    hostId?: string
    maxPlayers?: number
    roleConfig?: unknown
    status?: string
    gameType?: string
  }
  players?: Player[]
}

/** 与后端 `room:error` 踢人文案保持一致；优先使用 payload.code === 'KICKED'。 */
const ROOM_ERROR_KICKED_MESSAGE = '你已被房主踢出房间'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parsePlayerUser(u: unknown): PlayerUser | null {
  if (!isRecord(u)) {
    return null
  }
  if (typeof u.id !== 'string' || typeof u.nickName !== 'string') {
    return null
  }
  const avatarUrl = typeof u.avatarUrl === 'string' ? u.avatarUrl : ''
  return { id: u.id, nickName: u.nickName, avatarUrl }
}

function parsePlayer(p: unknown): Player | null {
  if (!isRecord(p)) {
    return null
  }
  const user = parsePlayerUser(p.user)
  if (!user) {
    return null
  }
  if (typeof p.id !== 'string' || typeof p.seatNo !== 'number' || typeof p.joinedAt !== 'string') {
    return null
  }
  const isOnline = typeof p.isOnline === 'boolean' ? p.isOnline : undefined
  return { id: p.id, seatNo: p.seatNo, isOnline, user, joinedAt: p.joinedAt }
}

function parseRoomStatePayload(data: unknown): RoomStatePayload {
  if (!isRecord(data)) {
    return {}
  }
  const out: RoomStatePayload = {}
  if (isRecord(data.room)) {
    const r = data.room
    out.room = {}
    if (typeof r.code === 'string') {
      out.room.code = r.code
    }
    if (typeof r.hostId === 'string') {
      out.room.hostId = r.hostId
    }
    if (typeof r.maxPlayers === 'number') {
      out.room.maxPlayers = r.maxPlayers
    }
    if ('roleConfig' in r) {
      out.room.roleConfig = r.roleConfig
    }
    if (typeof r.status === 'string') {
      out.room.status = r.status
    }
    if (typeof r.gameType === 'string') {
      out.room.gameType = r.gameType
    }
  }
  if (Array.isArray(data.players)) {
    out.players = data.players.map(parsePlayer).filter((x): x is Player => x !== null)
  }
  return out
}

function parsePlayerJoinedPayload(data: unknown): { player: Player } | null {
  if (!isRecord(data)) {
    return null
  }
  const player = parsePlayer(data.player)
  if (!player) {
    return null
  }
  return { player }
}

function parseUserIdPayload(data: unknown): { userId: string } | null {
  if (!isRecord(data) || typeof data.userId !== 'string' || !data.userId) {
    return null
  }
  return { userId: data.userId }
}

function parsePlayerUpdatedPayload(data: unknown): { userId: string; nickName?: string; avatarUrl?: string } | null {
  if (!isRecord(data) || typeof data.userId !== 'string' || !data.userId) {
    return null
  }
  const nickName = typeof data.nickName === 'string' ? data.nickName : undefined
  const avatarUrl = typeof data.avatarUrl === 'string' ? data.avatarUrl : undefined
  return { userId: data.userId, nickName, avatarUrl }
}

function parseRoomSettingsUpdatedPayload(data: unknown): { maxPlayers?: number; roleConfig?: unknown } | null {
  if (!isRecord(data)) {
    return null
  }
  const maxPlayers = typeof data.maxPlayers === 'number' ? data.maxPlayers : undefined
  const roleConfig = 'roleConfig' in data ? data.roleConfig : undefined
  if (maxPlayers === undefined && roleConfig === undefined) {
    return null
  }
  return { maxPlayers, roleConfig }
}

function getSocketErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '')
    if (message) {
      return message
    }
  }

  if (error && typeof error === 'object' && 'errMsg' in error) {
    const errMsg = String((error as { errMsg?: unknown }).errMsg || '')
    if (/timeout/i.test(errMsg)) {
      return '房间连接超时，正在重连'
    }
    return errMsg.replace(/^socket:fail\s*/, '') || '房间连接异常，正在重连'
  }

  return '房间连接异常，正在重连'
}

Page({
  data: {
    roomCode: '',
    hostId: '',
    maxPlayers: 0,
    currentUserId: '',
    players: [] as Player[],
    pageState: 'loading',
    pageError: '',
    connectionStatus: 'idle',
    connectionStatusText: '未连接',
    isHost: false,
    startingGame: false,
    restartingGame: false,
    roleConfigSummary: '',
    roleConfig: null as unknown,
    gameType: 'AVALON' as string,
    gameTitle: '阿瓦隆' as string,
  },
  socket: null as SocketLike | null,
  roomSocketBindings: [] as Array<{ event: string; listener: (...args: unknown[]) => void }>,
  navigatingToGame: false,
  onLoad(query: Record<string, string>) {
    const user = getUserProfile()
    const token = getToken()
    if (!user?.id || !token) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' })
      }, 400)
      return
    }

    const roomCode = query.roomCode || ''
    const isHost = query.isHost === '1'
    const gameType = query.gameType || 'AVALON'
    const currentUserId = user.id
    const gameTitle = gameType === 'SGS' ? '三国杀' : gameType === 'AVALON' ? '阿瓦隆' : '房间'
    this.setData({
      roomCode,
      isHost,
      gameType,
      gameTitle,
      currentUserId,
      pageState: 'loading',
      connectionStatus: 'idle',
      connectionStatusText: '未连接',
    })
    this.loadRoomSnapshot()
  },
  onShow() {
    this.navigatingToGame = false
    this.setData({ startingGame: false })
    if (
      this.data.roomCode
      && this.data.pageState === 'ready'
      && this.roomSocketBindings.length === 0
    ) {
      this.initSocket()
    }
  },
  onUnload() {
    this.detachRoomSocketListeners()
    if (!this.navigatingToGame) {
      const roomCode = this.data.roomCode
      if (roomCode) {
        void request({
          url: `/api/rooms/${roomCode}/leave`,
          method: 'POST',
        })
          .catch(() => {
            // Leaving the page should not surface a stale network error to the next page.
          })
          .finally(() => {
            if (this.socket?.connected) {
              this.socket.emit('room:leave', { roomCode })
            }
            this.socket = null
            disconnectSocket()
          })
      } else {
        this.socket = null
        disconnectSocket()
      }
      return
    }
    this.socket = null
    disconnectSocket()
  },
  async loadRoomSnapshot() {
    this.setData({ pageState: 'loading', pageError: '' })
    try {
      const payload = await request<RoomSnapshot>({
        url: `/api/rooms/${this.data.roomCode}`,
      })

      const gameType = typeof payload.gameType === 'string' && payload.gameType
        ? payload.gameType
        : this.data.gameType
      const gameTitle = gameType === 'SGS' ? '三国杀' : gameType === 'AVALON' ? '阿瓦隆' : '房间'

      this.setData({
        roomCode: payload.code,
        hostId: payload.host?.id || '',
        maxPlayers: payload.maxPlayers,
        players: payload.players,
        roleConfig: payload.roleConfig,
        gameType,
        gameTitle,
        pageState: 'ready',
      })
      this.updateRoleConfigSummary()
      this.initSocket()
    } catch (error) {
      const message = error instanceof Error ? error.message : '房间加载失败，请返回重试'
      this.setData({ pageState: 'error', pageError: message })
    }
  },
  detachRoomSocketListeners() {
    const sock = this.socket
    if (!sock) {
      this.roomSocketBindings = []
      return
    }
    for (const { event, listener } of this.roomSocketBindings) {
      sock.off(event, listener)
    }
    this.roomSocketBindings = []
  },

  bindRoomSocketEvent(event: string, listener: (...args: unknown[]) => void) {
    const sock = this.socket
    if (!sock) {
      return
    }
    sock.on(event, listener)
    this.roomSocketBindings.push({ event, listener })
  },

  initSocket() {
    this.detachRoomSocketListeners()
    const socket = connectSocket(false)
    this.socket = socket
    this.setConnectionStatus('connecting')

    this.bindRoomSocketEvent('connect', () => {
      this.setConnectionStatus('connected')
      this.joinRoomViaSocket()
    })

    this.bindRoomSocketEvent('disconnect', () => {
      this.setConnectionStatus('reconnecting')
    })

    this.bindRoomSocketEvent('connect_error', (error: unknown) => {
      if (isSocketDomainListError(error)) {
        this.setConnectionStatus('unavailable')
        wx.showToast({
          title: '实时连接不可用：WebSocket域名未配置。请在微信公众平台后台将 nightdeal.kaiwen.dev 添加到socket合法域名列表。',
          icon: 'none',
          duration: 6000,
        })
        return
      }
      this.setConnectionStatus('reconnecting')
      wx.showToast({ title: getSocketErrorMessage(error), icon: 'none' })
    })

    this.bindRoomSocketEvent('room:state', (data: unknown) => {
      this.applyRoomState(parseRoomStatePayload(data))
    })

    this.bindRoomSocketEvent('room:player-joined', (data: unknown) => {
      const payload = parsePlayerJoinedPayload(data)
      if (payload) {
        this.upsertPlayer(payload.player)
      }
    })

    this.bindRoomSocketEvent('room:player-left', (data: unknown) => {
      const payload = parseUserIdPayload(data)
      if (payload) {
        const players = this.data.players.filter((p) => p.user.id !== payload.userId)
        this.setData({ players })
      }
    })

    this.bindRoomSocketEvent('room:reconnected', (data: unknown) => {
      const payload = parseUserIdPayload(data)
      if (payload) {
        const players = this.data.players.map((p) => {
          if (p.user.id === payload.userId) {
            return { ...p, isOnline: true }
          }
          return p
        })
        this.setData({ players })
      }
    })

    this.bindRoomSocketEvent('room:offline', (data: unknown) => {
      const payload = parseUserIdPayload(data)
      if (payload) {
        const players = this.data.players.map((p) => {
          if (p.user.id === payload.userId) {
            return { ...p, isOnline: false }
          }
          return p
        })
        this.setData({ players })
      }
    })

    this.bindRoomSocketEvent('player:updated', (data: unknown) => {
      const payload = parsePlayerUpdatedPayload(data)
      if (payload) {
        const players = this.data.players.map((p) => {
          if (p.user.id === payload.userId) {
            const updatedUser = {
              ...p.user,
              nickName: payload.nickName ?? p.user.nickName,
              avatarUrl: payload.avatarUrl ?? p.user.avatarUrl,
            }
            return { ...p, user: updatedUser }
          }
          return p
        })
        this.setData({ players })
      }
    })

    this.bindRoomSocketEvent('room:settings-updated', (data: unknown) => {
      const payload = parseRoomSettingsUpdatedPayload(data)
      if (!payload) {
        return
      }
      if (typeof payload.maxPlayers === 'number') {
        this.setData({ maxPlayers: payload.maxPlayers })
      }
      if (payload.roleConfig !== undefined && payload.roleConfig !== null) {
        this.setData({ roleConfig: payload.roleConfig })
        this.updateRoleConfigSummary()
      }
    })

    this.bindRoomSocketEvent('room:started', () => {
      this.navigateToGame()
    })

    this.bindRoomSocketEvent('room:restarted', () => {
      this.navigateToGame()
    })

    this.bindRoomSocketEvent('room:error', (data: unknown) => {
      if (!isRecord(data) || typeof data.message !== 'string' || !data.message) {
        return
      }
      wx.showToast({ title: data.message, icon: 'none' })
      const kicked = data.code === 'KICKED' || data.message === ROOM_ERROR_KICKED_MESSAGE
      if (kicked) {
        setTimeout(() => {
          wx.navigateBack({
            fail: () => {
              wx.reLaunch({ url: '/pages/index/index' })
            },
          })
        }, 1500)
      }
    })

    if (socket.connected) {
      this.setConnectionStatus('connected')
      this.joinRoomViaSocket()
      return
    }
    socket.connect()
  },
  setConnectionStatus(status: string) {
    const textMap: Record<string, string> = {
      idle: '未连接',
      connecting: '连接中',
      connected: '已连接',
      reconnecting: '重连中',
      unavailable: '实时连接不可用',
    }

    this.setData({
      connectionStatus: status,
      connectionStatusText: textMap[status] || status,
    })
  },
  async handleStartGame() {
    if (!this.data.isHost) {
      wx.showToast({ title: '仅房主可开始', icon: 'none' })
      return
    }
    if (this.data.startingGame || this.navigatingToGame) {
      return
    }
    this.setData({ startingGame: true })
    try {
      await request({
        url: `/api/rooms/${this.data.roomCode}/start`,
        method: 'POST',
      })
      this.navigateToGame()
    } catch (error) {
      const message = error instanceof Error ? error.message : '开局失败，请重试'
      this.setData({ startingGame: false })
      wx.showToast({ title: message, icon: 'none' })
    }
  },
  async handleRestartGame() {
    if (!this.data.isHost) {
      wx.showToast({ title: '仅房主可重开', icon: 'none' })
      return
    }
    if (this.data.restartingGame) {
      return
    }
    this.setData({ restartingGame: true })
    try {
      await request({
        url: `/api/rooms/${this.data.roomCode}/restart`,
        method: 'POST',
      })
      this.navigateToGame()
    } catch (error) {
      const message = error instanceof Error ? error.message : '重开失败，请重试'
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      // room 页仍在栈上，game 页 back 后必须复位，否则按钮永久 loading
      this.setData({ restartingGame: false })
    }
  },
  navigateToGame() {
    if (this.navigatingToGame) {
      return
    }

    this.detachRoomSocketListeners()
    this.navigatingToGame = true
    this.setData({ startingGame: true })

    wx.navigateTo({
      url: `/pages/game/game?roomCode=${this.data.roomCode}&gameType=${this.data.gameType}`,
      fail: (error) => {
        this.navigatingToGame = false
        this.setData({ startingGame: false })
        const message = error.errMsg.includes('already exist webviewId') ? '正在进入游戏' : '进入游戏失败'
        wx.showToast({ title: message, icon: 'none' })
        if (this.data.roomCode && this.data.pageState === 'ready') {
          this.initSocket()
        }
      },
    })
  },
  updateRoleConfigSummary() {
    const rc = this.data.roleConfig
    if (!rc || typeof rc !== 'object') {
      this.setData({ roleConfigSummary: '' })
      return
    }
    if (this.data.gameType === 'SGS') {
      const summary = formatSgsRoleSummary(rc as SgsRoleConfig)
      this.setData({ roleConfigSummary: summary })
    } else {
      const summary = formatRoleSummary(rc as RoleConfig)
      this.setData({ roleConfigSummary: summary })
    }
  },

  handleOpenSettings() {
    if (!this.data.isHost) {
      return
    }
    wx.navigateTo({
      url: `/pages/room-settings/room-settings?roomCode=${this.data.roomCode}&gameType=${this.data.gameType}`,
    })
  },

  async handleKickPlayer(e: WechatMiniprogram.CustomEvent<{ userId: string }>) {
    if (!this.data.isHost) {
      return
    }
    const { userId } = e.currentTarget.dataset as { userId: string }
    if (!userId || userId === this.data.currentUserId) {
      return
    }
    try {
      await request({
        url: `/api/rooms/${this.data.roomCode}/kick`,
        method: 'POST',
        data: { userId },
      })
      this.setData({
        players: this.data.players.filter((item) => item.user.id !== userId),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '踢出失败，请重试'
      wx.showToast({ title: message, icon: 'none' })
    }
  },
  handleRetryLoad() {
    this.loadRoomSnapshot()
  },
  applyRoomState(state: RoomStatePayload) {
    const updates: Record<string, unknown> = {}

    if (state.room) {
      if (state.room.code) updates.roomCode = state.room.code
      if (state.room.hostId) updates.hostId = state.room.hostId
      if (typeof state.room.maxPlayers === 'number') updates.maxPlayers = state.room.maxPlayers
      if (typeof state.room.roleConfig !== 'undefined') updates.roleConfig = state.room.roleConfig
      if (typeof state.room.gameType === 'string' && state.room.gameType) {
        updates.gameType = state.room.gameType
        updates.gameTitle = state.room.gameType === 'SGS'
          ? '三国杀'
          : state.room.gameType === 'AVALON'
            ? '阿瓦隆'
            : '房间'
      }
    }
    if (state.players) {
      updates.players = state.players
    }

    if (Object.keys(updates).length > 0) {
      this.setData(updates)
      if (typeof updates.roleConfig !== 'undefined' || typeof updates.gameType !== 'undefined') {
        this.updateRoleConfigSummary()
      }
    }
  },
  upsertPlayer(player: Player) {
    const players = this.data.players
      .filter((item) => item.user.id !== player.user.id)
      .concat(player)
      .sort((a, b) => a.seatNo - b.seatNo)
    this.setData({ players })
  },
  joinRoomViaSocket() {
    if (this.socket) {
      this.socket.emit('room:join', { roomCode: this.data.roomCode })
    }
  },
})
