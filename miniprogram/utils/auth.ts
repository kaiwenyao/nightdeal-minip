const TOKEN_KEY = 'nd_token'
const TOKEN_EXP_KEY = 'nd_token_exp'
const USER_KEY = 'nd_user'

export interface UserProfile {
  id: string
  nickName: string
  avatarUrl: string
}

/**
 * Decode base64url to string without depending on global atob,
 * which may not be available in all WeChat mini program runtimes.
 */
function base64urlDecode(str: string): string {
  const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4
  if (pad) base64 += '='.repeat(4 - pad)

  let result = ''
  const len = base64.length
  for (let i = 0; i < len; i += 4) {
    const b0 = lookup.indexOf(base64[i])
    const b1 = lookup.indexOf(base64[i + 1])
    const b2 = base64[i + 2] === '=' ? 0 : lookup.indexOf(base64[i + 2])
    const b3 = base64[i + 3] === '=' ? 0 : lookup.indexOf(base64[i + 3])
    result += String.fromCharCode((b0 << 2) | (b1 >> 4))
    if (base64[i + 2] !== '=') result += String.fromCharCode(((b1 & 0xf) << 4) | (b2 >> 2))
    if (base64[i + 3] !== '=') result += String.fromCharCode(((b2 & 0x3) << 6) | b3)
  }
  return decodeURIComponent(
    result
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  )
}

function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }
    const payload = base64urlDecode(parts[1])
    const parsed = JSON.parse(payload) as { exp?: unknown }
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
