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
  onLoad(query: Record<string, string>) {
    const gameType = query.gameType || 'AVALON'
    const gameTitle = gameType === 'SGS' ? '三国杀' : '阿瓦隆'
    this.setData({ roomCode: query.roomCode || '', gameType, gameTitle })
    this.loadMyRole()
    this.initSocket()
  },
  onUnload() {
    if (this.socket) {
      this.socket.emit('room:leave', { roomCode: this.data.roomCode })
      disconnectSocket()
      this.socket = null
    }
  },
  initSocket() {
    const socket = connectSocket(false)
    this.socket = socket

    socket.on('connect', () => {
      socket.emit('room:join', { roomCode: this.data.roomCode })
    })

    socket.on('room:restarted', () => {
      this.setData({ roleHidden: true })
      this.loadMyRole()
    })

    socket.on('room:started', () => {
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
