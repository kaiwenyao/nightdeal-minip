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

interface UpdateProfileResponse {
  user: {
    id: string
    nickName?: string
    avatarUrl?: string
  }
}

interface CreateRoomResponse {
  id: string
  code: string
  status: string
  roleConfig: unknown
  maxPlayers: number
  createdAt: string
}

interface JoinRoomResponse {
  id: string
  code: string
  status: string
  roleConfig: unknown
  maxPlayers: number
  host: { id: string; nickName: string; avatarUrl: string } | null
  players: Array<{ id: string; seatNo: number; user: { id: string; nickName: string; avatarUrl: string } }>
  createdAt: string
}

type ActionState = 'idle' | 'authorizing' | 'loggingIn' | 'creatingRoom' | 'joiningRoom'

const ROOM_CODE_LENGTH = 6
const LOGIN_REQUEST_TIMEOUT_MS = 12000
const defaultAvatarUrl =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

Component({
  data: {
    userInfo: {
      avatarUrl: defaultAvatarUrl,
      nickName: '',
    },
    roomCodeInput: '',
    actionState: 'idle' as ActionState,
    pageError: '',
    hasToken: false,
    isNavigatingToRoom: false,
  },
  lifetimes: {
    attached() {
      const cachedProfile = getUserProfile()
      const token = getToken()
      if (cachedProfile) {
        this.setData({ userInfo: cachedProfile })
      }
      if (token) {
        this.setData({ hasToken: true })
      }
    },
  },
  pageLifetimes: {
    show() {
      this.setData({ isNavigatingToRoom: false, actionState: 'idle' })
    },
  },
  methods: {
    isBusy() {
      return this.data.actionState !== 'idle' || this.data.isNavigatingToRoom
    },
    setActionState(actionState: ActionState, pageError = '') {
      this.setData({ actionState, pageError })
    },
    onInputChange(e: WechatMiniprogram.Input) {
      const nickName = e.detail.value
      this.setData({
        'userInfo.nickName': nickName,
      })
    },
    onRoomCodeInput(e: WechatMiniprogram.Input) {
      const value = e.detail.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH).toUpperCase()
      this.setData({ roomCodeInput: value })
    },
    onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
      const { avatarUrl } = e.detail
      this.setData({
        'userInfo.avatarUrl': avatarUrl,
      })
    },
    async handleWechatLogin() {
      if (this.isBusy()) {
        return
      }
      if (!this.data.userInfo.nickName) {
        wx.showToast({ title: '请先输入昵称', icon: 'none' })
        return
      }

      this.setActionState('authorizing')
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

        this.setActionState('loggingIn')
        const payload = await request<LoginResponse, { code: string }>({
          url: '/api/auth/login',
          method: 'POST',
          data: { code: loginCode },
          timeout: LOGIN_REQUEST_TIMEOUT_MS,
        })

        const loginUser = {
          ...payload.user,
          nickName: payload.user.nickName || this.data.userInfo.nickName || '游客',
          avatarUrl: payload.user.avatarUrl || this.data.userInfo.avatarUrl || defaultAvatarUrl,
        }

        setToken(payload.token)

        await request<UpdateProfileResponse, { nickName: string; avatarUrl: string }>({
          url: '/api/auth/update-profile',
          method: 'POST',
          data: {
            nickName: loginUser.nickName,
            avatarUrl: loginUser.avatarUrl,
          },
          timeout: LOGIN_REQUEST_TIMEOUT_MS,
        })
        setUserProfile(loginUser)
        this.setData({ userInfo: loginUser, hasToken: true, actionState: 'idle' })
        wx.showToast({ title: '登录成功', icon: 'success' })
      } catch (error) {
        const message = error instanceof Error ? error.message : '登录服务不可用，请稍后重试'
        this.setActionState('idle', message)
        wx.showToast({ title: message.includes('超时') ? '登录超时，请重试' : '登录失败', icon: 'none' })
      }
    },
    async handleCreateRoom() {
      if (this.isBusy()) {
        return
      }
      if (!this.data.hasToken) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        return
      }
      this.setActionState('creatingRoom')
      try {
        const payload = await request<CreateRoomResponse>({
          url: '/api/rooms',
          method: 'POST',
        })
        this.goRoomPage(payload.code, true)
      } catch (error) {
        const message = error instanceof Error ? error.message : '创建房间失败，请稍后再试'
        this.setActionState('idle', message)
      }
    },
    async handleJoinRoom() {
      if (this.isBusy()) {
        return
      }
      if (!this.data.hasToken) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        return
      }
      const code = this.data.roomCodeInput.trim().toUpperCase()
      if (code.length !== ROOM_CODE_LENGTH) {
        wx.showToast({ title: `请输入${ROOM_CODE_LENGTH}位房间码`, icon: 'none' })
        return
      }
      this.setActionState('joiningRoom')
      try {
        const payload = await request<JoinRoomResponse>({
          url: `/api/rooms/${code}/join`,
          method: 'POST',
        })
        this.goRoomPage(payload.code, false)
      } catch (error) {
        const message = error instanceof Error ? error.message : '加入房间失败，请检查房间码'
        this.setActionState('idle', message)
      }
    },
    goRoomPage(roomCode: string, isHost: boolean) {
      if (this.data.isNavigatingToRoom) {
        return
      }

      this.setData({ actionState: 'idle', pageError: '', isNavigatingToRoom: true })
      wx.navigateTo({
        url: `/pages/room/room?roomCode=${roomCode}&isHost=${isHost ? '1' : '0'}`,
        fail: (error) => {
          this.setData({ isNavigatingToRoom: false, actionState: 'idle' })
          const message = error.errMsg.includes('already exist webviewId') ? '正在进入房间' : '进入房间失败'
          wx.showToast({ title: message, icon: 'none' })
        },
      })
    },
  },
})
