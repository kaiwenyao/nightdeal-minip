import { getToken } from './auth'
import { config } from './config'

type Listener = (...args: unknown[]) => void
type EventMap = Record<string, Listener[]>

interface ParsedSocketUrl {
  url: string
  namespace: string
}

interface EngineHandshake {
  pingInterval?: number
  pingTimeout?: number
}

export interface SocketLike {
  connected: boolean
  on: (event: string, listener: Listener) => void
  off: (event: string, listener?: Listener) => void
  emit: (event: string, payload?: unknown) => void
  connect: () => void
  disconnect: () => void
}

const SOCKET_IO_PATH = '/socket.io'
const RECONNECT_DELAY_MS = 1000
const RECONNECT_DELAY_MAX_MS = 5000
const MAX_RECONNECT_ATTEMPTS = 10
const SOCKET_CONNECT_TIMEOUT_MS = 15000

function parseSocketUrl(rawUrl: string, token: string): ParsedSocketUrl {
  const match = rawUrl.match(/^(https?|wss?):\/\/([^/?#]+)(\/[^?#]*)?/)
  if (!match) {
    throw new Error(`Invalid socket url: ${rawUrl}`)
  }

  const protocol = match[1] === 'https' || match[1] === 'wss' ? 'wss' : 'ws'
  const host = match[2]
  const namespace = normalizeNamespace(match[3] || '/')
  const query = [`EIO=4`, `transport=websocket`]

  if (token) {
    query.push(`token=${encodeURIComponent(token)}`)
  }

  return {
    url: `${protocol}://${host}${SOCKET_IO_PATH}/?${query.join('&')}`,
    namespace,
  }
}

function normalizeNamespace(namespace: string): string {
  if (!namespace || namespace === '/') {
    return '/'
  }
  return namespace.startsWith('/') ? namespace : `/${namespace}`
}

function namespacePrefix(namespace: string): string {
  return namespace === '/' ? '' : `${namespace},`
}

function parseNamespaceAndPayload(packet: string): { namespace: string; payload: string } {
  if (!packet.startsWith('/')) {
    return { namespace: '/', payload: packet }
  }

  const commaIndex = packet.indexOf(',')
  if (commaIndex === -1) {
    return { namespace: packet, payload: '' }
  }

  return {
    namespace: packet.slice(0, commaIndex),
    payload: packet.slice(commaIndex + 1),
  }
}

class WeappSocket implements SocketLike {
  private task: WechatMiniprogram.SocketTask | null = null
  private listeners: EventMap = {}
  private namespace = '/'
  private isConnected = false
  private manuallyClosed = false
  private reconnectAttempts = 0
  private reconnectTimer: number | null = null
  private connectTimeoutTimer: number | null = null
  private pingTimeoutTimer: number | null = null
  private pingInterval = 0
  private pingTimeout = 0

  get connected(): boolean {
    return this.isConnected
  }

  on(event: string, listener: Listener): void {
    const list = this.listeners[event] || []
    list.push(listener)
    this.listeners[event] = list
  }

  off(event: string, listener?: Listener): void {
    if (!listener) {
      this.listeners[event] = []
      return
    }
    this.listeners[event] = (this.listeners[event] || []).filter((cb) => cb !== listener)
  }

  emit(event: string, payload?: unknown): void {
    if (!this.task || !this.isConnected) {
      console.warn('Socket not connected, cannot emit:', event)
      return
    }

    const args = payload === undefined ? [event] : [event, payload]
    this.sendSocketPacket('2', JSON.stringify(args))
  }

  connect(): void {
    const token = getToken()
    const parsed = parseSocketUrl(config.socketUrl, token)

    this.clearReconnectTimer()
    this.clearConnectTimeoutTimer()
    this.clearPingTimeoutTimer()
    this.closeTask()

    this.namespace = parsed.namespace
    this.isConnected = false
    this.manuallyClosed = false

    const task = wx.connectSocket({
      url: parsed.url,
      timeout: SOCKET_CONNECT_TIMEOUT_MS,
      fail: (error) => {
        this.emitLocal('connect_error', error)
        this.scheduleReconnect()
      },
    })

    this.task = task
    this.connectTimeoutTimer = setTimeout(() => {
      if (this.task !== task || this.isConnected) {
        return
      }
      this.emitLocal('connect_error', { errMsg: 'socket:fail timeout' })
      task.close({})
    }, SOCKET_CONNECT_TIMEOUT_MS + 1000)

    task.onMessage((event) => {
      if (this.task !== task) {
        return
      }
      if (typeof event.data === 'string') {
        this.handleEnginePacket(event.data)
      }
    })
    task.onError((error) => {
      if (this.task !== task) {
        return
      }
      this.emitLocal('connect_error', error)
    })
    task.onClose(() => {
      if (this.task !== task) {
        return
      }
      this.handleClose()
    })
  }

  disconnect(): void {
    this.manuallyClosed = true
    this.clearReconnectTimer()
    this.clearConnectTimeoutTimer()
    this.clearPingTimeoutTimer()

    if (this.task && this.isConnected) {
      this.sendSocketPacket('1', '')
    }

    this.closeTask()
    this.isConnected = false
  }

  private handleEnginePacket(packet: string): void {
    const engineType = packet.charAt(0)
    const payload = packet.slice(1)

    switch (engineType) {
      case '0':
        this.handleEngineOpen(payload)
        break
      case '2':
        this.sendRaw('3')
        this.schedulePingTimeout()
        break
      case '4':
        this.handleSocketPacket(payload)
        break
      case '1':
        this.disconnect()
        break
      default:
        break
    }
  }

  private handleEngineOpen(payload: string): void {
    try {
      const handshake = JSON.parse(payload) as EngineHandshake
      this.pingInterval = handshake.pingInterval || 0
      this.pingTimeout = handshake.pingTimeout || 0
      this.schedulePingTimeout()
    } catch (error) {
      console.warn('Invalid socket handshake:', error)
    }

    const token = getToken()
    const authPayload = token ? JSON.stringify({ token }) : '{}'
    this.sendSocketPacket('0', authPayload)
  }

  private handleSocketPacket(packet: string): void {
    const packetType = packet.charAt(0)
    const parsed = parseNamespaceAndPayload(packet.slice(1))

    if (parsed.namespace !== this.namespace) {
      return
    }

    switch (packetType) {
      case '0':
        this.isConnected = true
        this.clearConnectTimeoutTimer()
        this.reconnectAttempts = 0
        this.emitLocal('connect')
        break
      case '1':
        this.isConnected = false
        this.emitLocal('disconnect')
        break
      case '2':
        this.handleSocketEvent(parsed.payload)
        break
      case '4':
        this.emitLocal('connect_error', safeJsonParse(parsed.payload))
        break
      default:
        break
    }
  }

  private handleSocketEvent(payload: string): void {
    const args = safeJsonParse(payload)
    if (!Array.isArray(args) || typeof args[0] !== 'string') {
      return
    }

    this.emitLocal(args[0], ...args.slice(1))
  }

  private sendSocketPacket(packetType: string, payload: string): void {
    this.sendRaw(`4${packetType}${namespacePrefix(this.namespace)}${payload}`)
  }

  private sendRaw(data: string): void {
    this.task?.send({
      data,
      fail: (error) => {
        this.emitLocal('connect_error', error)
      },
    })
  }

  private emitLocal(event: string, ...args: unknown[]): void {
    const callbacks = this.listeners[event] || []
    for (const cb of callbacks.slice()) {
      cb(...args)
    }
  }

  private handleClose(): void {
    const wasConnected = this.isConnected
    this.isConnected = false
    this.clearConnectTimeoutTimer()
    this.clearPingTimeoutTimer()
    this.task = null

    if (wasConnected) {
      this.emitLocal('disconnect')
    }

    if (!this.manuallyClosed) {
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return
    }

    this.reconnectAttempts += 1
    const delay = Math.min(RECONNECT_DELAY_MS * this.reconnectAttempts, RECONNECT_DELAY_MAX_MS)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private schedulePingTimeout(): void {
    this.clearPingTimeoutTimer()

    if (!this.pingInterval || !this.pingTimeout) {
      return
    }

    this.pingTimeoutTimer = setTimeout(() => {
      this.task?.close({})
    }, this.pingInterval + this.pingTimeout + 1000)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private clearConnectTimeoutTimer(): void {
    if (this.connectTimeoutTimer !== null) {
      clearTimeout(this.connectTimeoutTimer)
      this.connectTimeoutTimer = null
    }
  }

  private clearPingTimeoutTimer(): void {
    if (this.pingTimeoutTimer !== null) {
      clearTimeout(this.pingTimeoutTimer)
      this.pingTimeoutTimer = null
    }
  }

  private closeTask(): void {
    if (this.task) {
      this.task.close({})
      this.task = null
    }
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    console.warn('Invalid socket packet:', error)
    return null
  }
}

let socket: SocketLike | null = null

export function connectSocket(autoConnect = true): SocketLike {
  if (!socket) {
    socket = new WeappSocket()
  }
  if (autoConnect && !socket.connected) {
    socket.connect()
  }
  return socket
}

export function getSocket(): SocketLike | null {
  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
