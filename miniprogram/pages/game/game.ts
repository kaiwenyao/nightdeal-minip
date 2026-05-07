import { request } from '../../utils/request'
import { connectSocket, isSocketDomainListError, setSkipNextRoomStartedNav, SocketLike } from '../../utils/socket'

interface MyRoleResponse {
  role: string
  seatNo: number
}

const ROLE_LOAD_WATCHDOG_MS = 23000

function titleForGameType(gameType: string): string {
  if (gameType === 'SGS') {
    return '三国杀'
  }
  if (gameType === 'AVALON') {
    return '阿瓦隆'
  }
  return '房间'
}

Page({
  data: {
    roomCode: '',
    pageState: 'loadingRole',
    pageError: '',
    roleHidden: true,
    myRole: '',
    mySeatNo: 0,
    camp: '' as string,
    gameType: 'AVALON' as string,
    gameTitle: '阿瓦隆' as string,
  },
  socket: null as SocketLike | null,
  gameSocketBindings: [] as Array<{ event: string; listener: (...args: unknown[]) => void }>,
  loadRoleWatchdog: null as number | null,
  onLoad(query: Record<string, string>) {
    const roomCode = (query.roomCode || '').trim()
    const gameType = query.gameType || 'AVALON'
    const gameTitle = titleForGameType(gameType)
    if (!roomCode) {
      this.setData({
        roomCode: '',
        gameType,
        gameTitle,
        pageState: 'error',
        pageError: '缺少房间信息，请从房间页重新进入',
      })
      return
    }
    this.setData({ roomCode, gameType, gameTitle })
    this.startRoleLoadWatchdog()
    this.loadMyRole()
    this.initSocket()
  },
  onUnload() {
    setSkipNextRoomStartedNav(true)
    // 房间生命周期由 room 页持有：game→room（navigateBack）时不应 leave/disconnect，
    // 否则会把仍在房间页面栈上的用户从房间踢出，且 room 页只跑 onShow，不会重连。
    this.clearRoleLoadWatchdog()
    this.detachGameSocketListeners()
    this.socket = null
  },
  startRoleLoadWatchdog() {
    this.clearRoleLoadWatchdog()
    this.loadRoleWatchdog = setTimeout(() => {
      this.loadRoleWatchdog = null
      if (this.data.pageState !== 'loadingRole') {
        return
      }
      this.setData({
        pageState: 'error',
        pageError: '身份加载超时，请检查网络或返回房间后重试',
      })
    }, ROLE_LOAD_WATCHDOG_MS)
  },
  clearRoleLoadWatchdog() {
    if (this.loadRoleWatchdog != null) {
      clearTimeout(this.loadRoleWatchdog)
      this.loadRoleWatchdog = null
    }
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
    if (!this.data.roomCode) {
      return
    }
    this.detachGameSocketListeners()
    const socket = connectSocket(false)
    this.socket = socket

    this.bindGameSocketEvent('connect', () => {
      socket.emit('room:join', { roomCode: this.data.roomCode })
    })

    this.bindGameSocketEvent('room:ended', () => {
      if (this.data.pageState !== 'ready') {
        return
      }
      wx.showToast({ title: '房主已结束游戏', icon: 'none' })
      setSkipNextRoomStartedNav(true)
      wx.navigateBack()
    })

    this.bindGameSocketEvent('room:started', () => {
      this.setData({ roleHidden: true })
      this.startRoleLoadWatchdog()
      this.loadMyRole()
    })

    this.bindGameSocketEvent('connect_error', (error: unknown) => {
      if (this.data.pageState === 'loadingRole') {
        wx.showToast({
          title: isSocketDomainListError(error)
            ? '实时连接不可用，身份仍可从服务器加载'
            : '实时连接异常，身份仍可从服务器加载',
          icon: 'none',
          duration: 2500,
        })
      }
    })

    if (socket.connected) {
      socket.emit('room:join', { roomCode: this.data.roomCode })
      return
    }
    socket.connect()
  },
  async loadMyRole() {
    if (!this.data.roomCode) {
      this.clearRoleLoadWatchdog()
      this.setData({
        pageState: 'error',
        pageError: '缺少房间信息，请从房间页重新进入',
      })
      return
    }
    this.setData({ pageState: 'loadingRole', pageError: '' })
    try {
      const payload = await request<MyRoleResponse>({
        url: `/api/rooms/${this.data.roomCode}/my-role`,
      })
      this.clearRoleLoadWatchdog()
      const camp = this.inferCamp(payload.role)
      this.setData({
        myRole: payload.role,
        mySeatNo: payload.seatNo,
        camp,
        pageState: 'ready',
      })
    } catch (error) {
      this.clearRoleLoadWatchdog()
      const message = error instanceof Error ? error.message : '角色信息加载失败，请返回房间重试'
      this.setData({
        pageState: 'error',
        pageError: message,
      })
    }
  },
  handleToggleRole() {
    if (this.data.pageState !== 'ready') {
      return
    }
    this.setData({ roleHidden: !this.data.roleHidden })
  },
  inferCamp(role: string): string {
    const evilRoles = ['刺客', '莫甘娜', '奥伯伦', '莫德雷德', '爪牙', '反贼', '内奸']
    const goodRoles = ['梅林', '派西维尔', '亚瑟的忠臣', '湖中妖女', '主公', '忠臣']
    if (evilRoles.includes(role)) {
      return 'evil'
    }
    if (goodRoles.includes(role)) {
      return 'good'
    }
    return ''
  },
  handleBackRoom() {
    setSkipNextRoomStartedNav(true)
    wx.navigateBack()
  },
  handleRetryLoad() {
    this.startRoleLoadWatchdog()
    this.loadMyRole()
  },
})
