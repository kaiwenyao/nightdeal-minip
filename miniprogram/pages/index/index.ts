import { getToken, getUserProfile, setToken, setUserProfile, clearToken, clearUserProfile, UserProfile } from '../../utils/auth'
import { request, UnauthorizedError } from '../../utils/request'
import { config } from '../../utils/config'

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

interface AvatarUploadResponse {
  avatarUrl: string
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

type ActionState = 'idle' | 'authorizing' | 'loggingIn' | 'updatingProfile' | 'creatingRoom' | 'joiningRoom'

const ROOM_CODE_LENGTH = 6
const LOGIN_REQUEST_TIMEOUT_MS = 12000
const AVATAR_UPLOAD_TIMEOUT_MS = 30000
const defaultAvatarUrl =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

Component({
  data: {
    userInfo: {
      avatarUrl: defaultAvatarUrl,
      nickName: '',
    },
    rawAvatarPath: '', // 微信临时头像文件路径，用于上传
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
        rawAvatarPath: avatarUrl,
      })
    },
    /**
     * 将本地头像文件上传到后端，后端压缩后上传到OSS
     */
    async uploadAvatarToServer(): Promise<string | null> {
      const { rawAvatarPath } = this.data
      if (!rawAvatarPath || rawAvatarPath === defaultAvatarUrl) {
        return null // 没有新头像需要上传
      }

      const token = getToken()
      if (!token) {
        throw new Error('未登录，无法上传头像')
      }

      return new Promise((resolve, reject) => {
        wx.uploadFile({
          url: `${config.baseUrl}/api/auth/avatar/upload`,
          filePath: rawAvatarPath,
          name: 'avatar',
          header: {
            Authorization: `Bearer ${token}`,
          },
          timeout: AVATAR_UPLOAD_TIMEOUT_MS,
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const response = JSON.parse(res.data) as { code: number; data: AvatarUploadResponse }
                if (response.code === 0 && response.data?.avatarUrl) {
                  resolve(response.data.avatarUrl)
                } else {
                  reject(new Error('头像上传响应缺少 avatarUrl'))
                }
              } catch {
                reject(new Error('头像上传响应解析失败'))
              }
              return
            }
            if (res.statusCode === 401) {
              reject(new UnauthorizedError())
              return
            }
            try {
              const data = JSON.parse(res.data) as { message?: string }
              reject(new Error(data.message || `头像上传失败 (${res.statusCode})`))
            } catch {
              reject(new Error(`头像上传失败 (${res.statusCode})`))
            }
          },
          fail: (error) => {
            reject(new Error(error.errMsg || '头像上传网络请求失败'))
          },
        })
      })
    },
    async tryUploadAvatar(): Promise<string | null> {
      if (!this.data.rawAvatarPath || this.data.rawAvatarPath === defaultAvatarUrl) {
        return null
      }
      try {
        const ossUrl = await this.uploadAvatarToServer()
        if (ossUrl) {
          this.setData({
            'userInfo.avatarUrl': ossUrl,
            rawAvatarPath: '',
          })
        }
        return ossUrl
      } catch {
        this.setData({ rawAvatarPath: '' })
        return null
      }
    },
    async handleWechatLogin() {
      if (this.isBusy()) {
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

        setToken(payload.token)

        const uploadedOssUrl = await this.tryUploadAvatar()

        const fallbackAvatar = payload.user.avatarUrl || defaultAvatarUrl

        const loginUser: UserProfile = {
          id: payload.user.id,
          nickName: this.data.userInfo.nickName || payload.user.nickName || '游客',
          avatarUrl: uploadedOssUrl || fallbackAvatar,
        }

        setUserProfile(loginUser)
        this.setData({ userInfo: loginUser, hasToken: true, actionState: 'idle' })

        // Best-effort push to backend (client → server direction)
        try {
          await request<UpdateProfileResponse, { nickName: string; avatarUrl: string }>({
            url: '/api/auth/update-profile',
            method: 'POST',
            data: {
              nickName: loginUser.nickName,
              avatarUrl: loginUser.avatarUrl,
            },
            timeout: LOGIN_REQUEST_TIMEOUT_MS,
          })
        } catch {
          // Non-fatal: profile saved locally, will sync on next "更新资料" tap
        }

        wx.showToast({ title: '登录成功', icon: 'success' })
      } catch (error) {
        const message = error instanceof Error ? error.message : '登录服务不可用，请稍后重试'
        this.setActionState('idle', message)
        wx.showToast({ title: message.includes('超时') ? '登录超时，请重试' : '登录失败', icon: 'none' })
      }
    },
    async handleUpdateProfile() {
      if (this.isBusy()) {
        return
      }

      this.setActionState('updatingProfile')
      try {
        // 如果有新头像，先上传到OSS
        let avatarUrl = this.data.userInfo.avatarUrl
        if (this.data.rawAvatarPath && this.data.rawAvatarPath !== defaultAvatarUrl) {
          const ossUrl = await this.uploadAvatarToServer()
          if (ossUrl) {
            avatarUrl = ossUrl
            this.setData({
              'userInfo.avatarUrl': ossUrl,
              rawAvatarPath: '',
            })
          }
        }

        const response = await request<UpdateProfileResponse, { nickName: string; avatarUrl: string }>({
          url: '/api/auth/update-profile',
          method: 'POST',
          data: {
            nickName: this.data.userInfo.nickName,
            avatarUrl,
          },
          timeout: LOGIN_REQUEST_TIMEOUT_MS,
        })

        const updatedUser: UserProfile = {
          id: response.user.id || this.data.userInfo.id,
          nickName: response.user.nickName ?? this.data.userInfo.nickName,
          avatarUrl: response.user.avatarUrl || avatarUrl || defaultAvatarUrl,
        }

        setUserProfile(updatedUser)
        this.setData({ userInfo: updatedUser, actionState: 'idle' })
        wx.showToast({ title: '资料已更新', icon: 'success' })
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          clearToken()
          clearUserProfile()
          this.setData({ hasToken: false, actionState: 'idle' })
          await this.handleWechatLogin()
          return
        }
        const message = error instanceof Error ? error.message : '更新失败，请稍后重试'
        this.setActionState('idle', message)
        wx.showToast({ title: message, icon: 'none' })
      }
    },
    async handleButtonTap() {
      if (this.isBusy()) {
        return
      }

      if (!this.data.hasToken) {
        await this.handleWechatLogin()
      } else {
        await this.handleUpdateProfile()
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
