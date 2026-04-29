import { getToken } from './auth'

const BASE_URL = 'http://localhost:3000'

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
          resolve(res.data as TResponse)
          return
        }
        reject(new Error(`Request failed with status ${res.statusCode}`))
      },
      fail: () => {
        reject(new Error('Network error'))
      },
    })
  })
}
