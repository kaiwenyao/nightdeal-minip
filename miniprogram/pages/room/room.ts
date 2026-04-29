import { getUserProfile } from '../../utils/auth'
import { request } from '../../utils/request'
import { connectSocket, disconnectSocket, SocketLike } from '../../utils/socket'

interface Player {
  userId: string
  nickName: string
  avatarUrl: string
  seatNo: number
  online: boolean
}

interface RoomSnapshot {
  roomCode: string
  hostUserId: string
  players: Player[]
}

Page({
  data: {
    roomCode: '',
    hostUserId: '',
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
        roomCode: payload.roomCode,
        hostUserId: payload.hostUserId,
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
    socket.on('connect', () => this.setData({ connectionStatus: 'connected' }))
    socket.on('disconnect', () => this.setData({ connectionStatus: 'reconnecting' }))
    if (socket.connected) {
      this.setData({ connectionStatus: 'connected' })
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
        players: this.data.players.filter((item) => item.userId !== userId),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '踢出失败，请重试'
      wx.showToast({ title: message, icon: 'none' })
    }
  },
  handleRetryLoad() {
    this.loadRoomSnapshot()
  },
})
