const TOKEN_KEY = 'nd_token'
const USER_KEY = 'nd_user'

export interface UserProfile {
  id: string
  nickName: string
  avatarUrl: string
}

export function getToken(): string {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

export function setToken(token: string): void {
  wx.setStorageSync(TOKEN_KEY, token)
}

export function clearToken(): void {
  wx.removeStorageSync(TOKEN_KEY)
}

export function getUserProfile(): UserProfile | null {
  const value = wx.getStorageSync(USER_KEY)
  return value || null
}

export function setUserProfile(profile: UserProfile): void {
  wx.setStorageSync(USER_KEY, profile)
}

export function clearUserProfile(): void {
  wx.removeStorageSync(USER_KEY)
}
