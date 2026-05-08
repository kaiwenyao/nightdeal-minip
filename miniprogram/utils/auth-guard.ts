import { getToken, getUserProfile, UserProfile } from './auth'

/**
 * Require authentication before accessing a protected page.
 * If the user is not authenticated, redirects to the index page.
 * Returns token and profile if authenticated, or null if redirected.
 */
export async function requireAuth(): Promise<{ token: string; profile: UserProfile } | null> {
  const [token, profile] = await Promise.all([getToken(), getUserProfile()])
  if (!token || !profile?.id) {
    wx.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/index/index' })
    }, 400)
    return null
  }
  return { token, profile }
}
