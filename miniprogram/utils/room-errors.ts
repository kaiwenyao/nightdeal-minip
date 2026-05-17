export const ROOM_GONE_USER_MESSAGE = '房间已过期或不存在'

export function isRoomMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message
  return (
    message.includes('不存在') ||
    message.includes('已过期') ||
    message.includes('资源不存在')
  )
}

export function getRoomLoadErrorMessage(error: unknown): string {
  if (isRoomMissingError(error)) {
    return ROOM_GONE_USER_MESSAGE
  }
  return error instanceof Error ? error.message : '房间加载失败，请返回重试'
}
