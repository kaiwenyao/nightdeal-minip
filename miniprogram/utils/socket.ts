import { getToken } from './auth'
import { config } from './config'

type Listener = (...args: unknown[]) => void
type EventMap = Record<string, Listener[]>

export interface SocketLike {
  connected: boolean
  on: (event: string, listener: Listener) => void
  off: (event: string, listener?: Listener) => void
  emit: (event: string, payload?: unknown) => void
  connect: () => void
  disconnect: () => void
}

class WeappSocket implements SocketLike {
  connected = false
  private listeners: EventMap = {}
  private socketTask: WechatMiniprogram.SocketTask | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

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
    if (!this.connected || !this.socketTask) {
      console.warn('Socket not connected, cannot emit:', event)
      return
    }
    // Socket.IO packet format: 42["event", payload]
    const packet = `42${JSON.stringify([event, payload])}`
    this.socketTask.send({ data: packet })
  }

  connect(): void {
    if (this.socketTask) {
      this.socketTask.close({})
    }

    const token = getToken()
    const url = token ? `${config.socketUrl}?token=${encodeURIComponent(token)}` : config.socketUrl

    this.socketTask = wx.connectSocket({
      url,
      success: () => {
        console.log('Socket connecting...')
      },
      fail: (err) => {
        console.error('Socket connection failed:', err)
        this.triggerEvent('connect_error', err)
      },
    })

    this.socketTask.onOpen(() => {
      console.log('Socket connected')
      this.connected = true
      this.reconnectAttempts = 0
      this.startHeartbeat()
      this.triggerEvent('connect')
    })

    this.socketTask.onMessage((res) => {
      this.handleMessage(res.data as string)
    })

    this.socketTask.onClose((res) => {
      console.log('Socket closed:', res.code, res.reason)
      this.connected = false
      this.stopHeartbeat()
      this.triggerEvent('disconnect', res.reason || 'connection closed')
      this.tryReconnect()
    })

    this.socketTask.onError((err) => {
      console.error('Socket error:', err)
      this.triggerEvent('connect_error', err)
    })
  }

  disconnect(): void {
    this.stopHeartbeat()
    this.clearReconnectTimer()
    this.reconnectAttempts = this.maxReconnectAttempts // Prevent reconnect
    if (this.socketTask) {
      this.socketTask.close({ code: 1000, reason: 'manual disconnect' })
      this.socketTask = null
    }
    this.connected = false
  }

  private handleMessage(data: string): void {
    if (!data) return

    // Socket.IO protocol: 42["event", payload]
    if (data.startsWith('42')) {
      try {
        const jsonStr = data.substring(2)
        const [event, payload] = JSON.parse(jsonStr) as [string, unknown]
        this.triggerEvent(event, payload)
      } catch (e) {
        console.error('Failed to parse socket message:', data, e)
      }
      return
    }

    // Engine.IO ping/pong
    if (data === '2') {
      // Ping received, send pong
      if (this.socketTask) {
        this.socketTask.send({ data: '3' })
      }
      return
    }

    // Engine.IO connect ack
    if (data.startsWith('0')) {
      // Connection established
      return
    }
  }

  private triggerEvent(event: string, ...args: unknown[]): void {
    const list = this.listeners[event] || []
    list.forEach((listener) => {
      try {
        listener(...args)
      } catch (e) {
        console.error(`Error in socket event handler for ${event}:`, e)
      }
    })
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.socketTask && this.connected) {
        this.socketTask.send({ data: '2' }) // Send ping
      }
    }, 25000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private tryReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.triggerEvent('reconnect_failed')
      return
    }

    this.clearReconnectTimer()
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
    this.reconnectAttempts++

    this.triggerEvent('reconnect_attempt', this.reconnectAttempts)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
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
