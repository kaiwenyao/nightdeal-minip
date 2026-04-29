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
    this.setData({
      roomCode,
      isHost,
      currentUserId: user?.id || 'mock-user',
      pageState: 'loading',
    })
    this.loadRoomSnapshot()
  },
  onUnload() {
    disconnectSocket()
  },
  async loadRoomSnapshot() {
    try {
      const payload = await request<RoomSnapshot>({
        url: `/api/rooms/${this.data.roomCode}`,
      }).catch(() => {
        const user = getUserProfile()
        const current = {
          userId: user?.id || 'mock-user',
          nickName: user?.nickName || '游客',
          avatarUrl: user?.avatarUrl || '',
          seatNo: 1,
          online: true,
        }
        const teammate = {
          userId: 'mock-player-2',
          nickName: '队友A',
          avatarUrl: '',
          seatNo: 2,
          online: true,
        }
        return {
          roomCode: this.data.roomCode,
          hostUserId: this.data.isHost ? current.userId : teammate.userId,
          players: this.data.isHost ? [current, teammate] : [teammate, current],
        } as RoomSnapshot
      })

      this.setData({
        roomCode: payload.roomCode,
        hostUserId: payload.hostUserId,
        players: payload.players,
        pageState: 'ready',
      })
      this.initSocket()
    } catch {
      this.setData({ pageState: 'error', pageError: '房间加载失败，请返回重试' })
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
      }).catch(() => Promise.resolve())
      wx.navigateTo({
        url: `/pages/game/game?roomCode=${this.data.roomCode}`,
      })
    } catch {
      wx.showToast({ title: '开局失败，请重试', icon: 'none' })
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
    await request({
      url: `/api/rooms/${this.data.roomCode}/kick`,
      method: 'POST',
      data: { userId },
    }).catch(() => Promise.resolve())
    this.setData({
      players: this.data.players.filter((item) => item.userId !== userId),
    })
  },
})
