import { getToken } from './auth'
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

export function request<
  TResponse,
  TBody extends WechatMiniprogram.IAnyObject | string | ArrayBuffer = WechatMiniprogram.IAnyObject
>(
  options: RequestOptions<TBody>,
): Promise<TResponse> {
  const token = getToken()

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
          reject(new UnauthorizedError())
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const payload = res.data as ApiEnvelope<TResponse> | TResponse
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
        const payload = res.data as { message?: string } | undefined
        reject(new Error(payload?.message || `Request failed with status ${res.statusCode}`))
      },
      fail: (error) => {
        reject(new Error(getRequestFailMessage(error.errMsg)))
      },
    })
  })
}
