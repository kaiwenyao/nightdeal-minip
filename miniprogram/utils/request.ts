import { getToken, clearToken, clearUserProfile } from './auth'
import { config } from './config'

export class UnauthorizedError extends Error {
  constructor(message = '登录态失效') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

interface RequestOptions<TBody extends WechatMiniprogram.IAnyObject | string | ArrayBuffer> {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: TBody
  timeout?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20000

/** 部分环境下 wx.request 的 res.data 为 JSON 字符串，统一解析避免后续判型/解包异常 */
function normalizeWxResponseBody(raw: unknown): unknown {
  if (raw == null) {
    return raw
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) {
      return {}
    }
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      return raw
    }
  }
  return raw
}

function getRequestFailMessage(errMsg?: string): string {
  const message = errMsg || ''

  if (/timeout/i.test(message)) {
    return '请求超时，请检查网络后重试'
  }

  if (message.startsWith('request:fail')) {
    return message.replace(/^request:fail\s*/, '') || '网络请求失败'
  }

  return message || '网络请求失败'
}

function getCurrentRoute(): string {
  const pages = getCurrentPages()
  if (pages.length === 0) {
    return ''
  }
  const top = pages[pages.length - 1] as { route?: string }
  return typeof top.route === 'string' ? top.route : ''
}

export async function request<
  TResponse,
  TBody extends WechatMiniprogram.IAnyObject | string | ArrayBuffer = WechatMiniprogram.IAnyObject
>(
  options: RequestOptions<TBody>,
): Promise<TResponse> {
  const token = await getToken()

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.baseUrl}${options.url}`,
      method: options.method || 'GET',
      data: options.data,
      timeout: options.timeout || DEFAULT_REQUEST_TIMEOUT_MS,
      header: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success: (res) => {
        if (res.statusCode === 401) {
          void Promise.all([clearToken(), clearUserProfile()]).then(() => {
            const currentRoute = getCurrentRoute()
            if (currentRoute !== 'pages/index/index') {
              wx.reLaunch({ url: '/pages/index/index' })
            }
          })
          reject(new UnauthorizedError())
          return
        }
        const body = normalizeWxResponseBody(res.data)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const payload = body as ApiEnvelope<TResponse> | TResponse
          if (payload && typeof payload === 'object' && 'code' in payload && 'data' in payload) {
            const envelope = payload as ApiEnvelope<TResponse>
            if (envelope.code === 0) {
              resolve(envelope.data)
              return
            }
            reject(new Error(envelope.message || '请求失败'))
            return
          }
          resolve(payload as TResponse)
          return
        }
        const payload = body as { message?: string } | undefined
        reject(new Error(payload?.message || `Request failed with status ${res.statusCode}`))
      },
      fail: (error) => {
        reject(new Error(getRequestFailMessage(error.errMsg)))
      },
    })
  })
}
