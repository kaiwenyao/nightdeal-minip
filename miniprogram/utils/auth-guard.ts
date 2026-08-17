import { getToken, getUserProfile, clearToken, clearUserProfile, UserProfile } from './auth'
import { disconnectSocket, setLastRoomCode, setSkipNextRoomStartedNav, setRoomStartedNavConsumed } from './socket'

/** 与后端 `room:error` 踢人文案保持一致；优先使用 payload.code === 'KICKED'。 */
export const ROOM_ERROR_KICKED_MESSAGE = '你已被房主踢出房间'

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

export function isKickedRoomError(data: Record<string, unknown>): boolean {
  return data.code === 'KICKED' || data.message === ROOM_ERROR_KICKED_MESSAGE
}

let isHandlingKicked = false

/**
 * 被房主踢出：清房间导航标志、toast、reLaunch 回首页。
 * 进游戏页后 room 监听已卸掉，游戏页必须自己调用；用标志防止与 room 页重复处理。
 */
export function handleKicked(message: string = ROOM_ERROR_KICKED_MESSAGE): void {
  if (isHandlingKicked) {
    return
  }
  isHandlingKicked = true
  setLastRoomCode(null)
  setSkipNextRoomStartedNav(false)
  setRoomStartedNavConsumed(false)
  wx.showToast({ title: message, icon: 'none' })
  setTimeout(() => {
    isHandlingKicked = false
    wx.reLaunch({ url: '/pages/index/index' })
  }, 1500)
}
