import { RoleConfig, BaseRole, getTotalRoles, getDefaultConfig, ROLE_LABELS, SPECIAL_ROLES, BASE_ROLES } from '../../utils/role-config'
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
      enabled: !!rc[key],
    }))
    const baseRoleItems = BASE_ROLES.map((key) => ({
      key,
      label: ROLE_LABELS[key],
      count: rc[key] || 0,
    }))
    const totalRoles = getTotalRoles(rc)
    this.setData({ specialRoleItems, baseRoleItems, totalRoles })
  },

  updateValidationState() {
    const totalRoles = getTotalRoles(this.data.roleConfig)
    // roleConfigMismatch: configured roles don't match the room capacity
    // playerCountMismatch: room capacity doesn't match current players
    const roleConfigMismatch = totalRoles !== this.data.maxPlayers
    const playerCountMismatch = this.data.maxPlayers !== this.data.playerCount
    const roleMismatch = roleConfigMismatch || playerCountMismatch
    const saveBlocked = this.data.maxPlayers < this.data.playerCount
    const blockReason = saveBlocked ? '房间人数不能少于当前玩家数' : ''
    this.setData({ totalRoles, roleMismatch, saveBlocked, blockReason })
  },

  /**
   * Adjust roleConfig so that totalRoles matches maxPlayers.
   * Preserves user's special role choices when possible; falls back to default config
   * when the current special roles exceed the new player count.
   */
  syncRoleConfigWithMaxPlayers() {
    const currentConfig = { ...this.data.roleConfig }
    const targetCount = this.data.maxPlayers

    const specialCount = SPECIAL_ROLES.reduce((sum, role) => sum + (currentConfig[role as keyof RoleConfig] ? 1 : 0), 0)
    const baseCount = targetCount - specialCount

    if (baseCount >= 2) {
      const defaultConfig = getDefaultConfig(targetCount)
      const defaultBaseTotal = defaultConfig.loyalServants + defaultConfig.minions
      const loyalRatio = defaultBaseTotal > 0 ? defaultConfig.loyalServants / defaultBaseTotal : 0.5

      currentConfig.loyalServants = Math.max(1, Math.round(baseCount * loyalRatio))
      currentConfig.minions = baseCount - currentConfig.loyalServants

      // Ensure at least 1 of each base role
      if (currentConfig.minions < 1) {
        currentConfig.minions = 1
        currentConfig.loyalServants = baseCount - 1
      }
      if (currentConfig.loyalServants < 1) {
        currentConfig.loyalServants = 1
        currentConfig.minions = baseCount - 1
      }

      this.setData({ roleConfig: currentConfig as RoleConfig })
    } else {
      // Too many special roles for this player count — fall back to balanced default
      this.setData({ roleConfig: getDefaultConfig(targetCount) })
    }
  },

  decreaseMax() {
    if (this.data.maxPlayers <= 5) return
    const max = this.data.maxPlayers - 1
    if (max < this.data.playerCount) {
      wx.showToast({ title: '房间人数不能少于当前玩家数', icon: 'none' })
      return
    }
    this.setData({ maxPlayers: max })
    this.syncRoleConfigWithMaxPlayers()
    this.updateRoleItemsFromConfig()
    this.updateValidationState()
  },

  increaseMax() {
    if (this.data.maxPlayers >= 10) return
    const max = this.data.maxPlayers + 1
    this.setData({ maxPlayers: max })
    this.syncRoleConfigWithMaxPlayers()
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
    const role = (e.currentTarget.dataset as Record<string, string>).role as BaseRole
    if (!role || !BASE_ROLES.includes(role)) return
    const updated: RoleConfig = { ...this.data.roleConfig }
    let val = updated[role] || 0
    val -= 1
    if (val < 0) val = 0
    updated[role] = val
    this.setData({ roleConfig: updated })
    this.updateRoleItemsFromConfig()
    this.updateValidationState()
  },

  increaseBaseRole(e: WechatMiniprogram.TouchEvent) {
    const role = (e.currentTarget.dataset as Record<string, string>).role as BaseRole
    if (!role || !BASE_ROLES.includes(role)) return
    const currentTotal = getTotalRoles(this.data.roleConfig)
    if (currentTotal >= this.data.maxPlayers) {
      wx.showToast({ title: '角色总数已达房间人数上限', icon: 'none' })
      return
    }
    const updated: RoleConfig = { ...this.data.roleConfig }
    let val = updated[role] || 0
    val += 1
    updated[role] = val
    this.setData({ roleConfig: updated })
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
        method: 'PUT',
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
