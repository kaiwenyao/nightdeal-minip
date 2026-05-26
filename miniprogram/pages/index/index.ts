import { getToken, getUserProfile, setToken, setUserProfile, clearToken, clearUserProfile, UserProfile } from '../../utils/auth'
import { request, UnauthorizedError } from '../../utils/request'
import { config } from '../../utils/config'
import { getLastRoomCode, setLastRoomCode } from '../../utils/socket'
import { getDefaultConfig } from '../../utils/role-config'
import { isRoomMissingError, isPermissionError, ROOM_GONE_USER_MESSAGE } from '../../utils/room-errors'

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

interface NicknameReviewDetail {
  pass: boolean
  timeout: boolean
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

type ActionState =
  | 'idle'
  | 'authorizing'
  | 'loggingIn'
  | 'updatingProfile'
  | 'creatingRoom'
  | 'joiningRoom'
  | 'returningToRoom'
  | 'leavingRoom'

const ROOM_CODE_LENGTH = 6
const NICKNAME_MAX_LENGTH = 20
const LOGIN_REQUEST_TIMEOUT_MS = 12000
const AVATAR_UPLOAD_TIMEOUT_MS = 30000
const defaultAvatarUrl =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

function normalizeNickName(value: string): string {
  return value
    .replace(/[\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/g, '')
    .trim()
    .slice(0, NICKNAME_MAX_LENGTH)
}

function getDisplayAvatarUrl(avatarUrl: string): string {
  return avatarUrl || defaultAvatarUrl
}

function getBackendAvatarUrl(avatarUrl: string): string {
  if (!avatarUrl || avatarUrl === defaultAvatarUrl) {
    return ''
  }
  if (/^(wxfile|file):\/\//.test(avatarUrl) || /^https?:\/\/tmp\//.test(avatarUrl)) {
    return ''
  }
  return avatarUrl
}

Component({
  data: {
    userInfo: {
      id: '',
      avatarUrl: defaultAvatarUrl,
      nickName: '',
    },
    rawAvatarPath: '', // 微信临时头像文件路径，用于上传
    roomCodeInput: '',
    actionState: 'idle' as ActionState,
    pageError: '',
    hasToken: false,
    isNavigatingToRoom: false,
    gameType: 'AVALON' as string,
    pageTitle: '阿瓦隆房间助手',
    currentRoomCode: '',
    pendingRoomCode: '',
    pendingGameType: '',
  },
  lifetimes: {
    async attached() {
      const [cachedProfile, token] = await Promise.all([getUserProfile(), getToken()])
      if (cachedProfile) {
        this.setData({ userInfo: cachedProfile })
      }
      if (token) {
        this.setData({ hasToken: true })
      }
    },
  },
  pageLifetimes: {
    async show() {
      const page = getCurrentPages().pop()
      const gameType = page?.options?.gameType || 'AVALON'
      const pageTitle = gameType === 'SGS' ? '三国杀房间助手' : '阿瓦隆房间助手'
      const currentRoomCode = getLastRoomCode() || ''
      // Only read share params from page options once; clear after consuming
      // to prevent repeated auto-join on subsequent show() calls
      const pendingRoomCode = page?.options?.roomCode || ''
      const pendingGameType = page?.options?.gameType || ''
      if (pendingRoomCode && page?.options) {
        // Clear consumed share params to prevent re-triggering
        delete page.options.roomCode
        delete page.options.gameType
      }
      this.setData({
        isNavigatingToRoom: false,
        actionState: 'idle',
        gameType,
        pageTitle,
        currentRoomCode,
        pendingRoomCode: pendingRoomCode || this.data.pendingRoomCode,
        pendingGameType: pendingGameType || this.data.pendingGameType,
      })
      await this.refreshHasToken()
      if (this.data.pendingRoomCode) {
        if (this.data.hasToken) {
          const roomCode = this.data.pendingRoomCode
          const consumedGameType = this.data.pendingGameType
          this.setData({ pendingRoomCode: '', pendingGameType: '' })
          if (consumedGameType) {
            this.setData({ gameType: consumedGameType })
          }
          this.setData({ roomCodeInput: roomCode })
          wx.showToast({ title: '正在加入房间...', icon: 'loading', duration: 2000 })
          await this.handleJoinRoom(true)
        } else {
          wx.showToast({ title: '请先登录后加入房间', icon: 'none', duration: 2000 })
          await this.handleWechatLogin()
        }
      }
    },
  },
  methods: {
    async refreshHasToken() {
      const token = await getToken()
      this.setData({ hasToken: Boolean(token) })
    },
    isBusy() {
      return this.data.actionState !== 'idle' || this.data.isNavigatingToRoom
    },
    setActionState(actionState: ActionState, pageError = '') {
      this.setData({ actionState, pageError })
    },
    onInputChange(e: WechatMiniprogram.Input) {
      const nickName = normalizeNickName(e.detail.value)
      this.setData({
        'userInfo.nickName': nickName,
        pageError: '',
      })
    },
    onNicknameBlur(e: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const nickName = normalizeNickName(e.detail.value || this.data.userInfo.nickName)
      this.setData({
        'userInfo.nickName': nickName,
        pageError: '',
      })
    },
    onNicknameReview(e: WechatMiniprogram.CustomEvent<NicknameReviewDetail>) {
      if (e.detail.timeout) {
        console.warn('Nickname review timed out; continue with backend validation.')
        return
      }
      if (!e.detail.pass) {
        this.setData({ 'userInfo.nickName': '', pageError: '昵称含违规内容，请修改' })
        wx.showToast({ title: '昵称含违规内容，请修改', icon: 'none' })
      }
    },
    getCurrentNickName(allowEmpty = false): string | null {
      const nickName = normalizeNickName(this.data.userInfo.nickName)
      if (nickName !== this.data.userInfo.nickName) {
        this.setData({ 'userInfo.nickName': nickName })
      }
      if (!allowEmpty && nickName.length === 0) {
        this.setData({ pageError: '昵称需 1-20 字' })
        wx.showToast({ title: '昵称需 1-20 字', icon: 'none' })
        return null
      }
      return nickName
    },
    onRoomCodeInput(e: WechatMiniprogram.Input) {
      const value = e.detail.value.replace(/[^a-zA-Z]/g, '').slice(0, ROOM_CODE_LENGTH).toUpperCase()
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

      const token = await getToken()
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
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          await clearToken()
          await clearUserProfile()
          this.setData({ hasToken: false, rawAvatarPath: '' })
          throw error
        }
        console.warn('Avatar upload failed:', error)
        this.setData({ rawAvatarPath: '' })
        return null
      }
    },
    async handleWechatLogin() {
      if (this.isBusy()) {
        return
      }

      const currentNickName = this.getCurrentNickName(true)
      if (currentNickName === null) {
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

        await setToken(payload.token)

        let uploadedOssUrl: string | null = null
        try {
          uploadedOssUrl = await this.tryUploadAvatar()
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            this.setActionState('idle')
            wx.showToast({ title: '登录态失效，请重新登录', icon: 'none' })
            return
          }
          throw error
        }
        const backendAvatarUrl = uploadedOssUrl || payload.user.avatarUrl || ''

        const loginUser: UserProfile = {
          id: payload.user.id,
          nickName: currentNickName || payload.user.nickName || '游客',
          avatarUrl: getDisplayAvatarUrl(backendAvatarUrl),
        }

        await setUserProfile(loginUser)
        this.setData({ userInfo: loginUser, hasToken: true, actionState: 'idle' })

        // Best-effort push to backend (client → server direction)
        try {
          await request<UpdateProfileResponse, { nickName: string; avatarUrl: string }>({
            url: '/api/auth/update-profile',
            method: 'POST',
            data: {
              nickName: loginUser.nickName,
              avatarUrl: backendAvatarUrl,
            },
            timeout: LOGIN_REQUEST_TIMEOUT_MS,
          })
        } catch (error) {
          console.warn('Profile sync failed after login:', error)
          // Non-fatal: profile saved locally, will sync on next "更新资料" tap
        }

        wx.showToast({ title: '登录成功', icon: 'success' })

        if (this.data.pendingRoomCode) {
          const roomCode = this.data.pendingRoomCode
          const pendingGameType = this.data.pendingGameType
          this.setData({ pendingRoomCode: '', pendingGameType: '' })
          if (pendingGameType) {
            this.setData({ gameType: pendingGameType })
          }
          this.setData({ roomCodeInput: roomCode })
          await this.handleJoinRoom(true)
        }
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

      const nickName = this.getCurrentNickName()
      if (!nickName) {
        return
      }

      this.setActionState('updatingProfile')
      try {
        // 如果有新头像，先上传到OSS
        let avatarUrl = getBackendAvatarUrl(this.data.userInfo.avatarUrl)
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
            nickName,
            avatarUrl,
          },
          timeout: LOGIN_REQUEST_TIMEOUT_MS,
        })

        const updatedUser: UserProfile = {
          id: response.user.id || this.data.userInfo.id,
          nickName: response.user.nickName ?? nickName,
          avatarUrl: getDisplayAvatarUrl(response.user.avatarUrl || avatarUrl),
        }

        await setUserProfile(updatedUser)
        this.setData({ userInfo: updatedUser, actionState: 'idle' })
        wx.showToast({ title: '资料已更新', icon: 'success' })
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          await clearToken()
          await clearUserProfile()
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
      if (this.data.currentRoomCode) {
        const { confirm } = await wx.showModal({
          title: '确认创建新房间',
          content: '你已在一个房间中，创建新房间将离开之前的房间',
        })
        if (!confirm) {
          return
        }
      }
      this.setActionState('creatingRoom')
      try {
        const defaultMaxPlayers = this.data.gameType === 'SGS' ? 2 : 5
        const payload = await request<CreateRoomResponse>({
          url: '/api/rooms',
          method: 'POST',
          data: {
            gameType: this.data.gameType,
            maxPlayers: defaultMaxPlayers,
            roleConfig: this.data.gameType === 'SGS' ? undefined : getDefaultConfig(defaultMaxPlayers),
          },
        })
        this.goRoomPage(payload.code, true)
      } catch (error) {
        const message = error instanceof Error ? error.message : '创建房间失败，请稍后再试'
        this.setActionState('idle', message)
      }
    },
    async handleJoinRoom(fromShareLink = false) {
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
        this.goRoomPage(payload.code, false, fromShareLink)
      } catch (error) {
        const message = isRoomMissingError(error)
          ? ROOM_GONE_USER_MESSAGE
          : error instanceof Error ? error.message : '加入房间失败，请检查房间码'
        this.setActionState('idle', message)
        wx.showToast({ title: message, icon: 'none', duration: 3000 })
      }
    },
    goRoomPage(roomCode: string, isHost: boolean, replace = false) {
      if (this.data.isNavigatingToRoom) {
        return
      }

      this.setData({ actionState: 'idle', pageError: '', isNavigatingToRoom: true })
      const url = `/pages/room/room?roomCode=${roomCode}&isHost=${isHost ? '1' : '0'}&gameType=${this.data.gameType}`
      const navigateFn = replace ? wx.redirectTo : wx.navigateTo
      navigateFn({
        url,
        fail: (error) => {
          this.setData({ isNavigatingToRoom: false, actionState: 'idle' })
          const message = error.errMsg.includes('already exist webviewId') ? '正在进入房间' : '进入房间失败'
          wx.showToast({ title: message, icon: 'none' })
        },
      })
    },
    async handleReturnToRoom() {
      if (this.isBusy()) {
        return
      }
      const roomCode = this.data.currentRoomCode
      if (!roomCode) {
        return
      }
      this.setActionState('returningToRoom')
      try {
        await request<{ code: string }>({
          url: `/api/rooms/${roomCode}`,
        })
        this.goRoomPage(roomCode, false)
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          await clearToken()
          await clearUserProfile()
          this.setData({ hasToken: false, currentRoomCode: '' })
          setLastRoomCode(null)
          wx.showToast({ title: '登录态失效，请重新登录', icon: 'none' })
          return
        }
        if (isRoomMissingError(error) || isPermissionError(error)) {
          setLastRoomCode(null)
          this.setData({ currentRoomCode: '' })
          wx.showToast({ title: ROOM_GONE_USER_MESSAGE, icon: 'none' })
          return
        }
        const message = error instanceof Error ? error.message : '进入房间失败'
        wx.showToast({ title: message, icon: 'none' })
      } finally {
        if (this.data.actionState === 'returningToRoom') {
          this.setActionState('idle')
        }
      }
    },
    async handleLeaveRoom() {
      if (this.isBusy()) {
        return
      }
      const roomCode = this.data.currentRoomCode
      if (!roomCode) {
        return
      }
      this.setActionState('leavingRoom')
      const { confirm } = await wx.showModal({
        title: '确认离开',
        content: '离开房间后将无法继续参与当前游戏',
      })
      if (!confirm) {
        this.setActionState('idle')
        return
      }
      // 防御性检查：弹窗期间若被其他流程（如登录失效踢回首页）修改了 actionState，
      // 则静默返回，由接管方负责状态复位
      if (this.data.actionState !== 'leavingRoom') {
        return
      }
      try {
        await request({
          url: `/api/rooms/${roomCode}/leave`,
          method: 'POST',
        })
        setLastRoomCode(null)
        this.setData({ currentRoomCode: '' })
        wx.showToast({ title: '已离开房间', icon: 'success' })
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          await clearToken()
          await clearUserProfile()
          this.setData({ hasToken: false, currentRoomCode: '' })
          setLastRoomCode(null)
          this.setActionState('idle')
          wx.showToast({ title: '登录态失效，请重新登录', icon: 'none' })
          return
        }
        const message = error instanceof Error ? error.message : '离开房间失败'
        // 如果房间不存在或没有权限，说明用户已不在房间中，同步清除本地状态
        if (message.includes('不存在') || message.includes('没有权限')) {
          setLastRoomCode(null)
          this.setData({ currentRoomCode: '' })
        }
        wx.showToast({ title: message, icon: 'none' })
      } finally {
        if (this.data.actionState === 'leavingRoom') {
          this.setActionState('idle')
        }
      }
    },
  },
})
