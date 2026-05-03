import { request } from '../../utils/request'
import { connectSocket, disconnectSocket, SocketLike } from '../../utils/socket'

interface MyRoleResponse {
  role: string
  seatNo: number
}

Page({
  data: {
    roomCode: '',
    pageState: 'loadingRole',
    pageError: '',
    roleHidden: true,
    myRole: '',
    mySeatNo: 0,
    gameType: 'AVALON' as string,
    gameTitle: '阿瓦隆' as string,
  },
  socket: null as SocketLike | null,
  gameSocketBindings: [] as Array<{ event: string; listener: (...args: unknown[]) => void }>,
  onLoad(query: Record<string, string>) {
    const gameType = query.gameType || 'AVALON'
    const gameTitle = gameType === 'SGS' ? '三国杀' : '阿瓦隆'
    this.setData({ roomCode: query.roomCode || '', gameType, gameTitle })
    this.loadMyRole()
    this.initSocket()
  },
  onUnload() {
    this.detachGameSocketListeners()
    if (this.socket?.connected && this.data.roomCode) {
      this.socket.emit('room:leave', { roomCode: this.data.roomCode })
    }
    const roomCode = this.data.roomCode
    if (roomCode) {
      void request({
        url: `/api/rooms/${roomCode}/leave`,
        method: 'POST',
      }).catch(() => {})
    }
    setTimeout(() => {
      disconnectSocket()
      this.socket = null
    }, 200)
  },
  detachGameSocketListeners() {
    const sock = this.socket
    if (!sock) {
      this.gameSocketBindings = []
      return
    }
    for (const { event, listener } of this.gameSocketBindings) {
      sock.off(event, listener)
    }
    this.gameSocketBindings = []
  },
  bindGameSocketEvent(event: string, listener: (...args: unknown[]) => void) {
    const sock = this.socket
    if (!sock) {
      return
    }
    sock.on(event, listener)
    this.gameSocketBindings.push({ event, listener })
  },
  initSocket() {
    this.detachGameSocketListeners()
    const socket = connectSocket(false)
    this.socket = socket

    this.bindGameSocketEvent('connect', () => {
      socket.emit('room:join', { roomCode: this.data.roomCode })
    })

    this.bindGameSocketEvent('room:restarted', () => {
      this.setData({ roleHidden: true })
      this.loadMyRole()
    })

    this.bindGameSocketEvent('room:started', () => {
      this.setData({ roleHidden: true })
      this.loadMyRole()
    })

    if (socket.connected) {
      socket.emit('room:join', { roomCode: this.data.roomCode })
      return
    }
    socket.connect()
  },
  async loadMyRole() {
    this.setData({ pageState: 'loadingRole', pageError: '' })
    try {
      const payload = await request<MyRoleResponse>({
        url: `/api/rooms/${this.data.roomCode}/my-role`,
      })
      this.setData({
        myRole: payload.role,
        mySeatNo: payload.seatNo,
        pageState: 'ready',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '角色信息加载失败，请返回房间重试'
      this.setData({
        pageState: 'error',
        pageError: message,
      })
    }
  },
  handleRevealRole() {
    this.setData({ roleHidden: false })
  },
  handleBackRoom() {
    wx.navigateBack()
  },
  handleRetryLoad() {
    this.loadMyRole()
  },
})
