import { getToken } from './auth'

const BASE_URL = 'http://localhost:3000'

interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

interface RequestOptions<TBody extends WechatMiniprogram.IAnyObject | string | ArrayBuffer> {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: TBody
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
      url: `${BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data: options.data,
      timeout: 10000,
      header: {
        'content-type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success: (res) => {
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
        reject(new Error(error.errMsg || 'Network error'))
      },
    })
  })
}
