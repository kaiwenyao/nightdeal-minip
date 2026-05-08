declare function atob(data: string): string

const TOKEN_KEY = 'nd_token'
const TOKEN_EXP_KEY = 'nd_token_exp'
const USER_KEY = 'nd_user'

export interface UserProfile {
  id: string
  nickName: string
  avatarUrl: string
}

function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }
    const payload = parts[1]
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    const json = atob(padded)
    const parsed = JSON.parse(json) as { exp?: unknown }
    return typeof parsed.exp === 'number' ? parsed.exp : null
  } catch {
    return null
  }
}

function getStorageAsync<T>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    wx.getStorage({
      key,
      encrypt: true,
      success: (res) => resolve(res.data as T),
      fail: () => resolve(null),
    })
  })
}

function setStorageAsync<T>(key: string, data: T): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.setStorage({
      key,
      data,
      encrypt: true,
      success: () => resolve(),
      fail: reject,
    })
  })
}

function removeStorageAsync(key: string): Promise<void> {
  return new Promise((resolve) => {
    wx.removeStorage({
      key,
      success: () => resolve(),
      fail: () => resolve(),
    })
  })
}

export async function getToken(): Promise<string | null> {
  const token = await getStorageAsync<string>(TOKEN_KEY)
  if (!token) {
    return null
  }
  let exp = await getStorageAsync<number>(TOKEN_EXP_KEY)
  if (!exp) {
    // Fallback: derive expiry from JWT payload if storage key is missing
    exp = decodeJwtExp(token)
  }
  if (!exp || Date.now() >= exp * 1000) {
    await clearToken()
    return null
  }
  return token
}

export async function setToken(token: string): Promise<void> {
  const exp = decodeJwtExp(token)
  await setStorageAsync(TOKEN_KEY, token)
  if (exp) {
    await setStorageAsync(TOKEN_EXP_KEY, exp)
  }
}

export async function clearToken(): Promise<void> {
  await removeStorageAsync(TOKEN_KEY)
  await removeStorageAsync(TOKEN_EXP_KEY)
}

export async function getUserProfile(): Promise<UserProfile | null> {
  return getStorageAsync<UserProfile>(USER_KEY)
}

export async function setUserProfile(profile: UserProfile): Promise<void> {
  await setStorageAsync(USER_KEY, profile)
}

export async function clearUserProfile(): Promise<void> {
  await removeStorageAsync(USER_KEY)
}
