import {
  RoleConfig,
  BaseRole,
  SgsRoleConfig,
  getTotalRoles,
  getDefaultConfig,
  getSgsDefaultConfig,
  getSgsTotalRoles,
  ROLE_LABELS,
  SPECIAL_ROLES,
  BASE_ROLES,
  SGS_ROLES,
  AVALON_MIN_PLAYERS,
  SGS_MIN_PLAYERS,
  ROOM_MAX_PLAYERS,
} from '../../utils/role-config'
import { getToken, getUserProfile } from '../../utils/auth'
import { request } from '../../utils/request'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseAvalonRoleConfig(raw: unknown, maxPlayers: number): RoleConfig {
  const base = getDefaultConfig(maxPlayers)
  if (!isRecord(raw)) {
    return base
  }
  const out: RoleConfig = { ...base }
  for (const role of SPECIAL_ROLES) {
    const v = raw[role]
    if (typeof v === 'boolean') {
      out[role] = v
    }
  }
  if (typeof raw.loyalServants === 'number' && Number.isFinite(raw.loyalServants) && raw.loyalServants >= 0) {
    out.loyalServants = Math.floor(raw.loyalServants)
  }
  if (typeof raw.minions === 'number' && Number.isFinite(raw.minions) && raw.minions >= 0) {
    out.minions = Math.floor(raw.minions)
  }
  return out
}

function parseSgsRoleConfig(raw: unknown, maxPlayers: number): SgsRoleConfig {
  const base = getSgsDefaultConfig(maxPlayers)
  if (!isRecord(raw)) {
    return base
  }
  const out: SgsRoleConfig = { ...base }
  for (const role of SGS_ROLES) {
    const v = raw[role]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      out[role] = Math.floor(v)
    }
  }
  return out
}

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

interface SgsRoleItem {
  key: string
  label: string
  count: number
}

Page({
  data: {
    roomCode: '',
    gameType: 'AVALON' as string,
    maxPlayers: 5,
    minRoomPlayers: AVALON_MIN_PLAYERS,
    maxRoomPlayers: ROOM_MAX_PLAYERS,
    playerCount: 0,
    roleConfig: getDefaultConfig(AVALON_MIN_PLAYERS) as RoleConfig | SgsRoleConfig,
    saving: false,
    saveBlocked: false,
    roleMismatch: false,
    blockReason: '',
    specialRoleItems: [] as RoleItem[],
    baseRoleItems: [] as BaseRoleItem[],
    sgsRoleItems: [] as SgsRoleItem[],
    totalRoles: 0,
  },

  onLoad(query: Record<string, string>) {
    const user = getUserProfile()
    const token = getToken()
    if (!user?.id || !token) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' })
      }, 400)
      return
    }

    const roomCode = query.roomCode || ''
    const gameType = query.gameType || 'AVALON'
    const minRoomPlayers = gameType === 'SGS' ? SGS_MIN_PLAYERS : AVALON_MIN_PLAYERS
    this.setData({ roomCode, gameType, minRoomPlayers, maxRoomPlayers: ROOM_MAX_PLAYERS })
    if (!roomCode.trim()) {
      wx.showToast({ title: '缺少房间码', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
      return
    }
    this.loadRoomData(roomCode.trim())
  },

  async loadRoomData(roomCode: string) {
    try {
      const room = await request<Record<string, unknown>>({
        url: `/api/rooms/${roomCode}`,
      })

      if (
        !isRecord(room)
        || typeof room.code !== 'string'
        || typeof room.maxPlayers !== 'number'
        || !Array.isArray(room.players)
      ) {
        throw new Error('invalid room response')
      }

      const maxPlayers = room.maxPlayers
      const players = room.players
      const gameType = typeof room.gameType === 'string' ? room.gameType : 'AVALON'
      const isSgs = gameType === 'SGS'
      const minRoomPlayers = isSgs ? SGS_MIN_PLAYERS : AVALON_MIN_PLAYERS
      const roleConfig = isSgs
        ? parseSgsRoleConfig(room.roleConfig, maxPlayers)
        : parseAvalonRoleConfig(room.roleConfig, maxPlayers)

      this.setData({
        maxPlayers,
        minRoomPlayers,
        maxRoomPlayers: ROOM_MAX_PLAYERS,
        playerCount: players.length,
        gameType,
        roleConfig,
      })
      if (isSgs) {
        this.updateSgsRoleItemsFromConfig()
      } else {
        this.updateRoleItemsFromConfig()
      }
      this.updateValidationState()
    } catch (err) {
      wx.showToast({ title: '加载房间失败', icon: 'none' })
    }
  },

  updateRoleItemsFromConfig() {
    const rc = this.data.roleConfig as RoleConfig
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

  updateSgsRoleItemsFromConfig() {
    const rc = this.data.roleConfig as SgsRoleConfig
    const sgsRoleItems = SGS_ROLES.map((key) => ({
      key,
      label: ROLE_LABELS[key],
      count: rc[key] || 0,
    }))
    const totalRoles = getSgsTotalRoles(rc)
    this.setData({ sgsRoleItems, totalRoles })
  },

  updateValidationState() {
    const isSgs = this.data.gameType === 'SGS'
    const totalRoles = isSgs
      ? getSgsTotalRoles(this.data.roleConfig as SgsRoleConfig)
      : getTotalRoles(this.data.roleConfig as RoleConfig)
    // roleConfigMismatch: configured roles don't match the room capacity
    // (Do not treat maxPlayers !== playerCount as mismatch: higher capacity than
    // current headcount is valid and must be saveable.)
    const roleConfigMismatch = totalRoles !== this.data.maxPlayers
    const roleMismatch = roleConfigMismatch
    const saveBlocked = this.data.maxPlayers < this.data.playerCount
    const blockReason = saveBlocked ? '房间人数不能少于当前玩家数' : ''
    this.setData({ totalRoles, roleMismatch, saveBlocked, blockReason })
  },

  syncRoleConfigWithMaxPlayers() {
    const isSgs = this.data.gameType === 'SGS'
    const targetCount = this.data.maxPlayers
    if (isSgs) {
      this.setData({ roleConfig: getSgsDefaultConfig(targetCount) })
      return
    }

    const currentConfig = { ...this.data.roleConfig as RoleConfig }
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

      currentConfig.loyalServants = Math.max(0, currentConfig.loyalServants)
      currentConfig.minions = Math.max(0, currentConfig.minions)
      const baseSum = currentConfig.loyalServants + currentConfig.minions
      if (
        baseSum !== baseCount
        || currentConfig.loyalServants < 1
        || currentConfig.minions < 1
      ) {
        wx.showToast({ title: '人数已调整，角色已恢复默认可用配置', icon: 'none' })
        this.setData({ roleConfig: getDefaultConfig(targetCount) as unknown as RoleConfig | SgsRoleConfig })
        return
      }

      this.setData({ roleConfig: currentConfig as unknown as RoleConfig | SgsRoleConfig })
    } else {
      // Too many special roles for this player count — fall back to balanced default
      wx.showToast({ title: '人数已调整，角色已恢复默认可用配置', icon: 'none' })
      this.setData({ roleConfig: getDefaultConfig(targetCount) as unknown as RoleConfig | SgsRoleConfig })
    }
  },

  decreaseMax() {
    const minPlayers = this.data.minRoomPlayers
    if (this.data.maxPlayers <= minPlayers) return
    const max = this.data.maxPlayers - 1
    if (max < this.data.playerCount) {
      wx.showToast({ title: '房间人数不能少于当前玩家数', icon: 'none' })
      return
    }
    this.setData({ maxPlayers: max })
    this.syncRoleConfigWithMaxPlayers()
    if (this.data.gameType === 'SGS') {
      this.updateSgsRoleItemsFromConfig()
    } else {
      this.updateRoleItemsFromConfig()
    }
    this.updateValidationState()
  },

  increaseMax() {
    if (this.data.maxPlayers >= this.data.maxRoomPlayers) return
    const max = this.data.maxPlayers + 1
    this.setData({ maxPlayers: max })
    this.syncRoleConfigWithMaxPlayers()
    if (this.data.gameType === 'SGS') {
      this.updateSgsRoleItemsFromConfig()
    } else {
      this.updateRoleItemsFromConfig()
    }
    this.updateValidationState()
  },

  handleToggleRole(e: WechatMiniprogram.SwitchChange) {
    if (this.data.gameType === 'SGS') return
    const role = (e.currentTarget.dataset as Record<string, string>).role
    if (!role) return
    const value = e.detail.value
    const updated: RoleConfig = { ...(this.data.roleConfig as RoleConfig), [role]: value }
    this.setData({ roleConfig: updated as unknown as RoleConfig | SgsRoleConfig })
    this.updateRoleItemsFromConfig()
    this.updateValidationState()
  },

  decreaseBaseRole(e: WechatMiniprogram.TouchEvent) {
    if (this.data.gameType === 'SGS') return
    const role = (e.currentTarget.dataset as Record<string, string>).role as BaseRole
    if (!role || !BASE_ROLES.includes(role)) return
    const updated: RoleConfig = { ...(this.data.roleConfig as RoleConfig) }
    let val = updated[role] || 0
    val -= 1
    if (val < 0) val = 0
    updated[role] = val
    this.setData({ roleConfig: updated as unknown as RoleConfig | SgsRoleConfig })
    this.updateRoleItemsFromConfig()
    this.updateValidationState()
  },

  increaseBaseRole(e: WechatMiniprogram.TouchEvent) {
    if (this.data.gameType === 'SGS') return
    const role = (e.currentTarget.dataset as Record<string, string>).role as BaseRole
    if (!role || !BASE_ROLES.includes(role)) return
    const currentTotal = getTotalRoles(this.data.roleConfig as RoleConfig)
    if (currentTotal >= this.data.maxPlayers) {
      wx.showToast({ title: '角色总数已达房间人数上限', icon: 'none' })
      return
    }
    const updated: RoleConfig = { ...(this.data.roleConfig as RoleConfig) }
    let val = updated[role] || 0
    val += 1
    updated[role] = val
    this.setData({ roleConfig: updated as unknown as RoleConfig | SgsRoleConfig })
    this.updateRoleItemsFromConfig()
    this.updateValidationState()
  },

  handleResetToDefault() {
    const max = this.data.maxPlayers
    const isSgs = this.data.gameType === 'SGS'
    const newConfig = isSgs ? getSgsDefaultConfig(max) : getDefaultConfig(max)
    this.setData({ roleConfig: newConfig as unknown as RoleConfig | SgsRoleConfig })
    if (isSgs) {
      this.updateSgsRoleItemsFromConfig()
    } else {
      this.updateRoleItemsFromConfig()
    }
    this.updateValidationState()
  },

  async handleSave() {
    if (this.data.saveBlocked) {
      wx.showToast({ title: this.data.blockReason, icon: 'none' })
      return
    }
    if (this.data.roleMismatch) {
      wx.showToast({ title: '角色配置与房间人数不一致，请调整后保存', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const roomCode = (this.data.roomCode || '').trim()
      if (!roomCode) {
        this.setData({ saving: false })
        wx.showToast({ title: '缺少房间信息，无法保存', icon: 'none' })
        return
      }
      await request({
        url: `/api/rooms/${roomCode}/settings`,
        method: 'PUT',
        data: {
          maxPlayers: this.data.maxPlayers,
          roleConfig: this.data.roleConfig,
        },
      })
      this.setData({ saving: false })
      wx.navigateBack()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存失败'
      wx.showToast({ title: msg, icon: 'none' })
      this.setData({ saving: false })
    }
  },
})
