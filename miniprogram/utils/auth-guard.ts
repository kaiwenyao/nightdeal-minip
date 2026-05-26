import { getToken, getUserProfile, UserProfile } from './auth'

interface AuthRedirectParams {
  roomCode?: string
  gameType?: string
}

export async function requireAuth(redirectParams?: AuthRedirectParams): Promise<{ token: string; profile: UserProfile } | null> {
  const [token, profile] = await Promise.all([getToken(), getUserProfile()])
  if (!token || !profile?.id) {
    wx.showToast({ title: '请先登录', icon: 'none' })
    const params = new URLSearchParams()
    if (redirectParams?.roomCode) params.set('roomCode', redirectParams.roomCode)
    if (redirectParams?.gameType) params.set('gameType', redirectParams.gameType)
    const queryString = params.toString()
    const url = queryString ? `/pages/index/index?${queryString}` : '/pages/index/index'
    setTimeout(() => {
      wx.reLaunch({ url })
    }, 400)
    return null
  }
  return { token, profile }
}
