import { RoleConfig, getTotalRoles, getDefaultConfig, ROLE_LABELS, SPECIAL_ROLES, BASE_ROLES } from '../../utils/role-config'
import { request } from '../../utils/request'

interface RoleItem {
  key: string
  label: string
  enabled: boolean
}

interface BaseRoleItem {
  key: string
  label: string
  count: number
}

Page({
  data: {
    roomCode: '',
    maxPlayers: 5,
    playerCount: 0,
    roleConfig: getDefaultConfig(5) as RoleConfig,
    saving: false,
    saveBlocked: false,
    roleMismatch: false,
    blockReason: '',
    specialRoleItems: [] as RoleItem[],
    baseRoleItems: [] as BaseRoleItem[],
    totalRoles: 0,
  },

  onLoad(query: Record<string, string>) {
    const roomCode = query.roomCode || ''
    this.setData({ roomCode })
    if (roomCode) {
      this.loadRoomData(roomCode)
    }
  },

  async loadRoomData(roomCode: string) {
    try {
      const room = await request<{
        code: string
        maxPlayers: number
        players: Array<unknown>
        roleConfig: unknown
      }>({
        url: `/api/rooms/${roomCode}`,
      })

      const maxPlayers = room.maxPlayers || 5
      const players = room.players || []
      const roleConfig = (room.roleConfig as RoleConfig) || getDefaultConfig(maxPlayers)

      this.setData({
        maxPlayers,
        playerCount: players.length,
        roleConfig,
      })
      this.updateRoleItemsFromConfig()
      this.updateValidationState()
    } catch (err) {
      wx.showToast({ title: '加载房间失败', icon: 'none' })
    }
  },

  updateRoleItemsFromConfig() {
    const rc = this.data.roleConfig
    const specialRoleItems = SPECIAL_ROLES.map((key) => ({
      key,
      label: ROLE_LABELS[key],
      enabled: !!(rc as Record<string, unknown>)[key],
    }))
    const baseRoleItems = BASE_ROLES.map((key) => ({
      key,
      label: ROLE_LABELS[key],
      count: ((rc as Record<string, unknown>)[key] as number) || 0,
    }))
    const totalRoles = getTotalRoles(rc)
    this.setData({ specialRoleItems, baseRoleItems, totalRoles })
  },

  updateValidationState() {
    const totalRoles = getTotalRoles(this.data.roleConfig)
    const roleMismatch = totalRoles !== this.data.playerCount
    const saveBlocked = this.data.maxPlayers < this.data.playerCount
    const blockReason = saveBlocked ? '房间人数不能少于当前玩家数' : ''
    this.setData({ totalRoles, roleMismatch, saveBlocked, blockReason })
  },

  decreaseMax() {
    if (this.data.maxPlayers <= 5) return
    const max = this.data.maxPlayers - 1
    if (max < this.data.playerCount) {
      wx.showToast({ title: '不能超过当前玩家数', icon: 'none' })
      return
    }
    this.setData({ maxPlayers: max })
    const newConfig = getDefaultConfig(max)
    this.setData({ roleConfig: newConfig })
    this.updateRoleItemsFromConfig()
    this.updateValidationState()
  },

  increaseMax() {
    if (this.data.maxPlayers >= 10) return
    const max = this.data.maxPlayers + 1
    this.setData({ maxPlayers: max })
    const newConfig = getDefaultConfig(max)
    this.setData({ roleConfig: newConfig })
    this.updateRoleItemsFromConfig()
    this.updateValidationState()
  },

  handleToggleRole(e: WechatMiniprogram.SwitchChange) {
    const role = (e.currentTarget.dataset as Record<string, string>).role
    if (!role) return
    const value = e.detail.value
    const updated = { ...this.data.roleConfig, [role]: value }
    this.setData({ roleConfig: updated })
    this.updateRoleItemsFromConfig()
    this.updateValidationState()
  },

  decreaseBaseRole(e: WechatMiniprogram.TouchEvent) {
    const role = (e.currentTarget.dataset as Record<string, string>).role
    if (!role) return
    const updated = { ...this.data.roleConfig } as Record<string, unknown>
    let val = (updated[role] as number) || 0
    val -= 1
    if (val < 0) val = 0
    updated[role] = val
    this.setData({ roleConfig: updated as RoleConfig })
    this.updateRoleItemsFromConfig()
    this.updateValidationState()
  },

  increaseBaseRole(e: WechatMiniprogram.TouchEvent) {
    const role = (e.currentTarget.dataset as Record<string, string>).role
    if (!role) return
    const updated = { ...this.data.roleConfig } as Record<string, unknown>
    let val = (updated[role] as number) || 0
    val += 1
    if (val > 4) val = 4
    updated[role] = val
    this.setData({ roleConfig: updated as RoleConfig })
    this.updateRoleItemsFromConfig()
    this.updateValidationState()
  },

  handleResetToDefault() {
    const max = this.data.maxPlayers
    const newConfig = getDefaultConfig(max)
    this.setData({ roleConfig: newConfig })
    this.updateRoleItemsFromConfig()
    this.updateValidationState()
  },

  async handleSave() {
    if (this.data.saveBlocked) {
      wx.showToast({ title: this.data.blockReason, icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const roomCode = this.data.roomCode
      await request({
        url: `/api/rooms/${roomCode}/settings`,
        method: 'PATCH',
        data: {
          maxPlayers: this.data.maxPlayers,
          roleConfig: this.data.roleConfig,
        },
      })
      wx.navigateBack()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败'
      wx.showToast({ title: msg, icon: 'none' })
      this.setData({ saving: false })
    }
  },
})
