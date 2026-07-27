import { getToken, getUserProfile, clearToken, clearUserProfile, UserProfile } from './auth'
import { disconnectSocket, setLastRoomCode } from './socket'

interface AuthRedirectParams {
  roomCode?: string
  gameType?: string
}

export async function requireAuth(redirectParams?: AuthRedirectParams): Promise<{ token: string; profile: UserProfile } | null> {
  const [token, profile] = await Promise.all([getToken(), getUserProfile()])
  if (!token || !profile?.id) {
    wx.showToast({ title: '请先登录', icon: 'none' })
    // 手工拼 query，避免依赖老 JSCore 可能不支持的 URLSearchParams
    const parts: string[] = []
    if (redirectParams?.roomCode) parts.push(`roomCode=${encodeURIComponent(redirectParams.roomCode)}`)
    if (redirectParams?.gameType) parts.push(`gameType=${encodeURIComponent(redirectParams.gameType)}`)
    const queryString = parts.join('&')
    const url = queryString ? `/pages/index/index?${queryString}` : '/pages/index/index'
    setTimeout(() => {
      wx.reLaunch({ url })
    }, 400)
    return null
  }
  return { token, profile }
}

let isHandlingSessionExpired = false

/**
 * 服务端通过 room:error / avalon:error 返回 code=UNAUTHORIZED 时调用：
 * 清本地登录态、停止 socket 自动重连（避免反复重连刷错误提示）、回首页重新登录。
 */
export async function handleSessionExpired(): Promise<void> {
  if (isHandlingSessionExpired) {
    return
  }
  isHandlingSessionExpired = true
  await clearToken()
  await clearUserProfile()
  setLastRoomCode(null)
  disconnectSocket()
  wx.showToast({ title: '登录态失效，请重新登录', icon: 'none' })
  setTimeout(() => {
    isHandlingSessionExpired = false
    wx.reLaunch({ url: '/pages/index/index' })
  }, 800)
}
