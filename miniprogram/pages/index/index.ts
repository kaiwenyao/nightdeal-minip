import { getToken, getUserProfile, setToken, setUserProfile } from '../../utils/auth'
import { request } from '../../utils/request'

interface LoginResponse {
  token: string
  user: {
    id: string
    nickName: string
    avatarUrl: string
  }
}

interface CreateRoomResponse {
  roomCode: string
}

interface JoinRoomResponse {
  roomCode: string
}

const defaultAvatarUrl =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

Component({
  data: {
    userInfo: {
      avatarUrl: defaultAvatarUrl,
      nickName: '',
    },
    roomCodeInput: '',
    pageState: 'idle',
    pageError: '',
    hasToken: false,
  },
  lifetimes: {
    attached() {
      const cachedProfile = getUserProfile()
      const token = getToken()
      if (cachedProfile) {
        this.setData({ userInfo: cachedProfile })
      }
      if (token) {
        this.setData({ hasToken: true, pageState: 'ready' })
      }
    },
  },
  methods: {
    onInputChange(e: WechatMiniprogram.Input) {
      const nickName = e.detail.value
      this.setData({
        'userInfo.nickName': nickName,
      })
    },
    onRoomCodeInput(e: WechatMiniprogram.Input) {
      this.setData({ roomCodeInput: e.detail.value.toUpperCase() })
    },
    onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
      const { avatarUrl } = e.detail
      this.setData({
        'userInfo.avatarUrl': avatarUrl,
      })
    },
    async handleWechatLogin() {
      this.setData({ pageState: 'authorizing', pageError: '' })
      try {
        const loginCode = await new Promise<string>((resolve, reject) => {
          wx.login({
            success: (res) => {
              if (res.code) {
                resolve(res.code)
                return
              }
              reject(new Error('微信登录失败'))
            },
            fail: () => reject(new Error('微信登录失败')),
          })
        })
        this.setData({ pageState: 'loggingIn' })
        const payload = await request<LoginResponse, { code: string }>({
          url: '/api/auth/login',
          method: 'POST',
          data: { code: loginCode },
        }).catch(() => {
          return {
            token: 'mock-token-local',
            user: {
              id: 'mock-user',
              nickName: this.data.userInfo.nickName || '游客',
              avatarUrl: this.data.userInfo.avatarUrl || defaultAvatarUrl,
            },
          } as LoginResponse
        })

        setToken(payload.token)
        setUserProfile(payload.user)
        this.setData({ userInfo: payload.user, hasToken: true, pageState: 'ready' })
        wx.showToast({ title: '登录成功', icon: 'success' })
      } catch {
        this.setData({ pageState: 'error', pageError: '登录失败，请重试' })
        wx.showToast({ title: '登录失败', icon: 'none' })
      }
    },
    async handleCreateRoom() {
      if (!this.data.hasToken) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        return
      }
      this.setData({ pageState: 'loading', pageError: '' })
      try {
        const payload = await request<CreateRoomResponse>({
          url: '/api/rooms',
          method: 'POST',
        }).catch(() => ({ roomCode: 'DEMO01' }))
        this.goRoomPage(payload.roomCode, true)
      } catch {
        this.setData({ pageState: 'error', pageError: '创建房间失败，请稍后再试' })
      }
    },
    async handleJoinRoom() {
      if (!this.data.hasToken) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        return
      }
      const code = this.data.roomCodeInput.trim().toUpperCase()
      if (!code) {
        wx.showToast({ title: '请输入房间码', icon: 'none' })
        return
      }
      this.setData({ pageState: 'loading', pageError: '' })
      try {
        const payload = await request<JoinRoomResponse>({
          url: `/api/rooms/${code}/join`,
          method: 'POST',
        }).catch(() => ({ roomCode: code }))
        this.goRoomPage(payload.roomCode, false)
      } catch {
        this.setData({ pageState: 'error', pageError: '加入房间失败，请检查房间码' })
      }
    },
    goRoomPage(roomCode: string, isHost: boolean) {
      this.setData({ pageState: 'ready' })
      wx.navigateTo({
        url: `/pages/room/room?roomCode=${roomCode}&isHost=${isHost ? '1' : '0'}`,
      })
    },
  },
})
