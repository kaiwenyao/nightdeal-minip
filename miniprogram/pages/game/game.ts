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
    try {
      const payload = await request<MyRoleResponse>({
        url: `/api/rooms/${this.data.roomCode}/my-role`,
      }).catch(() => {
        return {
          role: '梅林',
          camp: 'good',
          players: [
            { userId: 'u_1', nickName: '你' },
            { userId: 'u_2', nickName: '队友A' },
            { userId: 'u_3', nickName: '队友B' },
          ],
        } as MyRoleResponse
      })
      this.setData({
        myRole: payload.role,
        myCamp: payload.camp,
        players: payload.players,
        pageState: 'ready',
      })
    } catch {
      this.setData({
        pageState: 'error',
        pageError: '角色信息加载失败，请返回房间重试',
      })
    }
  },
  handleRevealRole() {
    this.setData({ roleHidden: false })
  },
  handleBackRoom() {
    wx.navigateBack()
  },
})
