import { getToken, clearToken, clearUserProfile } from './auth'
import { config } from './config'

export const ROOM_NOT_FOUND_CODE = 40401

export class UnauthorizedError extends Error {
  constructor(message = '登录态失效') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class HttpError extends Error {
  statusCode: number
  businessCode?: number

  constructor(message: string, statusCode: number, businessCode?: number) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.businessCode = businessCode
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

let isHandling401 = false

/** Map known error codes to user-friendly Chinese messages. */
function sanitizeServerMessage(statusCode: number, message: string): string {
  const knownMessages: Record<number, string> = {
    401: '登录态失效，请重新登录',
    403: '没有权限执行此操作',
    404: '请求的资源不存在',
    429: '请求过于频繁，请稍后再试',
    500: '服务器内部错误，请稍后再试',
    502: '服务暂时不可用，请稍后再试',
    503: '服务暂时不可用，请稍后再试',
  }
  return knownMessages[statusCode] || message
}

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

function resolveHttpError(statusCode: number, body: unknown): HttpError {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    const businessCode = typeof record.code === 'number' ? record.code : undefined
    if (businessCode === ROOM_NOT_FOUND_CODE) {
      const roomMsg = record.message
      if (typeof roomMsg === 'string' && roomMsg.trim()) {
        return new HttpError(roomMsg.trim(), statusCode, businessCode)
      }
      return new HttpError('房间不存在', statusCode, businessCode)
    }
    const raw = record.message
    if (typeof raw === 'string' && raw.trim()) {
      return new HttpError(raw.trim(), statusCode, businessCode)
    }
    // 后端有时将 message 返回为字符串数组（如 validation errors），取第一条展示
    if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim()) {
      return new HttpError(raw[0].trim(), statusCode, businessCode)
    }
  }
  return new HttpError(
    sanitizeServerMessage(statusCode, `Request failed with status ${statusCode}`),
    statusCode,
  )
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
      success: async (res) => {
        if (res.statusCode === 401) {
          if (isHandling401) {
            reject(new UnauthorizedError())
            return
          }
          isHandling401 = true
          await clearToken()
          await clearUserProfile()
          isHandling401 = false
          const currentRoute = getCurrentRoute()
          if (currentRoute !== 'pages/index/index') {
            wx.reLaunch({ url: '/pages/index/index' })
          }
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
        reject(resolveHttpError(res.statusCode, body))
      },
      fail: (error) => {
        reject(new Error(getRequestFailMessage(error.errMsg)))
      },
    })
  })
}
