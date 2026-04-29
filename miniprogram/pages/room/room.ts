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

Page({
  data: {
    roomCode: '',
    hostId: '',
    currentUserId: '',
    players: [] as Player[],
    pageState: 'loading',
    pageError: '',
    connectionStatus: 'idle',
    isHost: false,
  },
  socket: null as SocketLike | null,
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
    })
    this.loadRoomSnapshot()
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
    this.setData({ connectionStatus: 'connecting' })

    socket.on('connect', () => {
      this.setData({ connectionStatus: 'connected' })
      this.joinRoomViaSocket()
    })

    socket.on('disconnect', () => {
      this.setData({ connectionStatus: 'reconnecting' })
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

    socket.on('room:started', () => {
      wx.navigateTo({
        url: `/pages/game/game?roomCode=${this.data.roomCode}`,
      })
    })

    socket.on('room:error', (data: unknown) => {
      const payload = data as { message: string }
      if (payload.message) {
        wx.showToast({ title: payload.message, icon: 'none' })
      }
    })

    if (socket.connected) {
      this.setData({ connectionStatus: 'connected' })
      this.joinRoomViaSocket()
      return
    }
    socket.connect()
  },
  async handleStartGame() {
    if (!this.data.isHost) {
      wx.showToast({ title: '仅房主可开始', icon: 'none' })
      return
    }
    try {
      await request({
        url: `/api/rooms/${this.data.roomCode}/start`,
        method: 'POST',
      })
      wx.navigateTo({
        url: `/pages/game/game?roomCode=${this.data.roomCode}`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '开局失败，请重试'
      wx.showToast({ title: message, icon: 'none' })
    }
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
