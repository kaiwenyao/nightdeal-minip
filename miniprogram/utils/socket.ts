import { getToken } from './auth'

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

class MockSocket implements SocketLike {
  connected = false
  private listeners: EventMap = {}

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
    const list = this.listeners[event] || []
    list.forEach((listener) => listener(payload))
  }

  connect(): void {
    this.connected = true
    this.emit('connect', { token: getToken() })
  }

  disconnect(): void {
    this.connected = false
    this.emit('disconnect', 'manual disconnect')
  }
}

let socket: SocketLike | null = null

export function connectSocket(autoConnect = true): SocketLike {
  if (!socket) {
    socket = new MockSocket()
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
