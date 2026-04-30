import { getToken } from './auth'
import { config } from './config'

// weapp.socket.io exports a Socket.IO-style io() constructor
const io: (uri: string, opts?: Record<string, unknown>) => any = require('weapp.socket.io')

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
  private socket: any | null = null
  private listeners: EventMap = {}

  get connected(): boolean {
    return Boolean(this.socket?.connected)
  }

  on(event: string, listener: Listener): void {
    const list = this.listeners[event] || []
    list.push(listener)
    this.listeners[event] = list
    this.socket?.on(event, listener)
  }

  off(event: string, listener?: Listener): void {
    if (!listener) {
      for (const cb of this.listeners[event] || []) {
        this.socket?.off(event, cb)
      }
      this.listeners[event] = []
      return
    }
    this.listeners[event] = (this.listeners[event] || []).filter((cb) => cb !== listener)
    this.socket?.off(event, listener)
  }

  emit(event: string, payload?: unknown): void {
    if (!this.socket || !this.socket.connected) {
      console.warn('Socket not connected, cannot emit:', event)
      return
    }
    this.socket.emit(event, payload)
  }

  connect(): void {
    const token = getToken()
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }

    this.socket = io(config.socketUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000,
      auth: token ? { token } : {},
      // fallback for old/custom clients or proxies
      query: token ? { token } : {},
    })

    this.bindExistingListeners()
    this.socket.connect()
  }

  disconnect(): void {
    if (!this.socket) {
      return
    }
    this.socket.disconnect()
    this.socket = null
  }

  private bindExistingListeners(): void {
    if (!this.socket) {
      return
    }
    for (const [event, callbacks] of Object.entries(this.listeners)) {
      for (const cb of callbacks) {
        this.socket.on(event, cb)
      }
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
