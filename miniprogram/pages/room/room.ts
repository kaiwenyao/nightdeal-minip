import { getUserProfile } from '../../utils/auth'
import { request } from '../../utils/request'
import { connectSocket, disconnectSocket, SocketLike } from '../../utils/socket'

interface PlayerUser {
  id: string
  nickName: string
  avatarUrl: string
}

interface Player {
  id: string
  seatNo: number
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
  roleConfig: unknown
  maxPlayers: number
  host: RoomHost | null
  players: Player[]
  createdAt: string
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
  },
  socket: null as SocketLike | null,
  navigatingToGame: false,
  onLoad(query: Record<string, string>) {
    const roomCode = query.roomCode || ''
    const isHost = query.isHost === '1'
    const user = getUserProfile()
    const currentUserId = user && user.id ? user.id : 'mock-user'
    this.setData({
      roomCode,
      isHost,
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
  },
  onUnload() {
    disconnectSocket()
  },
  async loadRoomSnapshot() {
    this.setData({ pageState: 'loading', pageError: '' })
    try {
      const payload = await request<RoomSnapshot>({
        url: `/api/rooms/${this.data.roomCode}`,
      })

      this.setData({
        roomCode: payload.code,
        hostId: payload.host?.id || '',
        maxPlayers: payload.maxPlayers,
        players: payload.players,
        pageState: 'ready',
      })
      this.initSocket()
    } catch (error) {
      const message = error instanceof Error ? error.message : '房间加载失败，请返回重试'
      this.setData({ pageState: 'error', pageError: message })
    }
  },
  initSocket() {
    const socket = connectSocket(false)
    this.socket = socket
    this.setConnectionStatus('connecting')

    socket.on('connect', () => {
      this.setConnectionStatus('connected')
      this.joinRoomViaSocket()
    })

    socket.on('disconnect', () => {
      this.setConnectionStatus('reconnecting')
    })

    socket.on('connect_error', (error: unknown) => {
      this.setConnectionStatus('reconnecting')
      wx.showToast({ title: getSocketErrorMessage(error), icon: 'none' })
    })

    socket.on('room:state', (data: unknown) => {
      const state = data as { room: unknown; players: Player[] }
      if (state.players) {
        this.setData({ players: state.players })
      }
    })

    socket.on('room:player-joined', (data: unknown) => {
      const payload = data as { player: Player; playerCount: number }
      if (payload.player) {
        const players = [...this.data.players, payload.player]
        this.setData({ players })
      }
    })

    socket.on('room:player-left', (data: unknown) => {
      const payload = data as { userId: string; playerCount: number }
      if (payload.userId) {
        const players = this.data.players.filter((p) => p.user.id !== payload.userId)
        this.setData({ players })
      }
    })

    socket.on('room:reconnected', (data: unknown) => {
      const payload = data as { userId: string }
      if (payload.userId) {
        const players = this.data.players.map((p) => {
          if (p.user.id === payload.userId) {
            return { ...p, online: true }
          }
          return p
        })
        this.setData({ players })
      }
    })

    socket.on('room:offline', (data: unknown) => {
      const payload = data as { userId: string }
      if (payload.userId) {
        const players = this.data.players.map((p) => {
          if (p.user.id === payload.userId) {
            return { ...p, online: false }
          }
          return p
        })
        this.setData({ players })
      }
    })

    // NEW: handle real-time player updates (nickName/avatar changes)
    socket.on('player:updated', (data: unknown) => {
      const payload = data as { userId: string; nickName?: string; avatarUrl?: string }
      if (payload && payload.userId) {
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

    socket.on('room:started', () => {
      this.navigateToGame()
    })

    socket.on('room:error', (data: unknown) => {
      const payload = data as { message: string }
      if (payload.message) {
        wx.showToast({ title: payload.message, icon: 'none' })
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
  navigateToGame() {
    if (this.navigatingToGame) {
      return
    }

    this.navigatingToGame = true
    this.setData({ startingGame: true })

    wx.navigateTo({
      url: `/pages/game/game?roomCode=${this.data.roomCode}`,
      fail: (error) => {
        this.navigatingToGame = false
        this.setData({ startingGame: false })
        const message = error.errMsg.includes('already exist webviewId') ? '正在进入游戏' : '进入游戏失败'
        wx.showToast({ title: message, icon: 'none' })
      },
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
  joinRoomViaSocket() {
    if (this.socket) {
      this.socket.emit('room:join', { roomCode: this.data.roomCode })
    }
  },
})
