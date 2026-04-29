import { request } from '../../utils/request'

interface Player {
  userId: string
  nickName: string
}

interface MyRoleResponse {
  role: string
  camp: 'good' | 'evil'
  players: Player[]
}

Page({
  data: {
    roomCode: '',
    pageState: 'loadingRole',
    pageError: '',
    roleHidden: true,
    myRole: '',
    myCamp: 'good',
    players: [] as Player[],
  },
  onLoad(query: Record<string, string>) {
    this.setData({ roomCode: query.roomCode || '' })
    this.loadMyRole()
  },
  async loadMyRole() {
    this.setData({ pageState: 'loadingRole', pageError: '' })
    try {
      const payload = await request<MyRoleResponse>({
        url: `/api/rooms/${this.data.roomCode}/my-role`,
      })
      this.setData({
        myRole: payload.role,
        myCamp: payload.camp,
        players: payload.players,
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
