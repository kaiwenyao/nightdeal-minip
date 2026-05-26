import { requireAuth } from '../../utils/auth-guard'
import { request } from '../../utils/request'
import { connectSocket, isSocketDomainListError, setSkipNextRoomStartedNav, SocketLike } from '../../utils/socket'

interface MyRoleResponse {
  role: string
  seatNo: number
}

const ROLE_LOAD_WATCHDOG_MS = 23000

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

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
    campName: '' as string,
    campHint: '' as string,
    roleDesc: '' as string,
    gameType: 'AVALON' as string,
    gameTitle: '阿瓦隆' as string,
  },
  socket: null as SocketLike | null,
  gameSocketBindings: [] as Array<{ event: string; listener: (...args: unknown[]) => void }>,
  loadRoleWatchdog: null as number | null,
  async onLoad(query: Record<string, string>) {
    const auth = await requireAuth()
    if (!auth) return

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

    this.bindGameSocketEvent('reconnect_failed', () => {
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

    this.bindGameSocketEvent('room:error', (data: unknown) => {
      if (!isRecord(data) || typeof data.message !== 'string' || !data.message) {
        return
      }
      const kicked = data.code === 'KICKED' || data.message === '你已被房主踢出房间'
      if (kicked) {
        wx.showModal({
          title: '被踢出房间',
          content: '你已被房主踢出',
          confirmText: '返回首页',
          showCancel: false,
          success: () => {
            wx.reLaunch({ url: '/pages/index/index' })
          },
        })
      } else {
        wx.showToast({ title: data.message, icon: 'none' })
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
      const campName = this.getCampName(camp)
      const campHint = this.getCampHint(camp, this.data.gameType)
      const roleDesc = this.getRoleDesc(payload.role, this.data.gameType)
      this.setData({
        myRole: payload.role,
        mySeatNo: payload.seatNo,
        camp,
        campName,
        campHint,
        roleDesc,
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
    const evilRoles = ['刺客', '莫甘娜', '奥伯伦', '莫德雷德', '爪牙', '反贼']
    const goodRoles = ['梅林', '派西维尔', '忠臣', '亚瑟的忠臣', '湖中妖女', '主公']
    const traitorRoles = ['内奸']
    if (evilRoles.includes(role)) {
      return 'evil'
    }
    if (goodRoles.includes(role)) {
      return 'good'
    }
    if (traitorRoles.includes(role)) {
      return 'traitor'
    }
    return ''
  },
  getCampName(camp: string): string {
    if (camp === 'good') return '好人阵营'
    if (camp === 'evil') return '坏人阵营'
    if (camp === 'traitor') return '内奸阵营'
    return ''
  },
  getCampHint(camp: string, gameType: string): string {
    if (gameType === 'SGS') {
      if (camp === 'good') return '你的目标是消灭所有反贼和内奸，保护主公。'
      if (camp === 'evil') return '你的目标是消灭主公。'
      if (camp === 'traitor') return '你的目标是成为最后的存活者。需要先消灭反贼，再消灭主公。'
      return ''
    }
    if (camp === 'good') return '好人阵营需要完成任务或找出刺客。梅林知道谁是坏人，但不能暴露身份。'
    if (camp === 'evil') return '坏人阵营需要阻止任务成功或在任务成功后刺杀梅林。'
    return ''
  },
  getCampName(camp: string): string {
    if (camp === 'good') return '好人阵营'
    if (camp === 'evil') return '坏人阵营'
    return ''
  },
  getCampHint(camp: string, gameType: string): string {
    if (gameType === 'SGS') {
      return '主公和忠臣需要消灭所有反贼和内奸；反贼需要消灭主公；内奸需要成为最后的存活者。'
    }
    if (camp === 'good') return '好人阵营需要完成任务或找出刺客。梅林知道谁是坏人，但不能暴露身份。'
    if (camp === 'evil') return '坏人阵营需要阻止任务成功或在任务成功后刺杀梅林。'
    return ''
  },
  getRoleDesc(role: string, gameType: string): string {
    if (gameType === 'SGS') {
      const sgsDescs: Record<string, string> = {
        '主公': '明身份，拥有主公技能。胜利条件：消灭所有反贼和内奸。',
        '忠臣': '暗身份，保护主公。胜利条件：消灭所有反贼和内奸。',
        '反贼': '暗身份，需要消灭主公。胜利条件：主公死亡。',
        '内奸': '暗身份，独自作战。胜利条件：成为最后的存活者。',
      }
      return sgsDescs[role] || ''
    }
    const avalonDescs: Record<string, string> = {
      '梅林': '知道所有坏人身份，但不能暴露自己，否则会被刺杀。',
      '派西维尔': '知道梅林是谁，需要保护梅林不被暴露。',
      '莫甘娜': '假装是梅林，迷惑派西维尔。',
      '莫德雷德': '梅林看不到的坏人。',
      '奥伯伦': '其他坏人不知道他是坏人，他也不知道其他坏人。',
      '刺客': '游戏结束后可以刺杀梅林，如果成功则坏人获胜。',
      '忠臣': '好人阵营，没有特殊能力。',
      '爪牙': '坏人阵营，知道其他坏人身份。',
    }
    return avalonDescs[role] || ''
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
