export interface RoleConfig {
  merlin: boolean
  percival: boolean
  mordred: boolean
  morgana: boolean
  oberon: boolean
  assassin: boolean
  loyalServants: number
  minions: number
}

export interface SgsRoleConfig {
  monarch: number
  loyalist: number
  rebel: number
  traitor: number
}

/** 阿瓦隆房间人数下限（与默认板子一致）。 */
export const AVALON_MIN_PLAYERS = 5
/** 三国杀房间人数下限。 */
export const SGS_MIN_PLAYERS = 2
/** 通用房间人数上限。 */
export const ROOM_MAX_PLAYERS = 10

/** 标准局预设；7 人默认奥伯伦（也可用房间设置关奥伯伦、增加爪牙）。 */
export const DEFAULT_ROLE_CONFIGS: Record<number, RoleConfig> = {
  5: { merlin: true, percival: true, mordred: false, morgana: true, oberon: false, assassin: true, loyalServants: 1, minions: 0 },
  6: { merlin: true, percival: true, mordred: false, morgana: true, oberon: false, assassin: true, loyalServants: 2, minions: 0 },
  7: { merlin: true, percival: true, mordred: false, morgana: true, oberon: true, assassin: true, loyalServants: 2, minions: 0 },
  8: { merlin: true, percival: true, mordred: false, morgana: true, oberon: false, assassin: true, loyalServants: 3, minions: 1 },
  9: { merlin: true, percival: true, mordred: true, morgana: true, oberon: false, assassin: true, loyalServants: 4, minions: 0 },
  10: { merlin: true, percival: true, mordred: true, morgana: true, oberon: true, assassin: true, loyalServants: 4, minions: 0 },
}

export const SGS_DEFAULT_CONFIGS: Record<number, SgsRoleConfig> = {
  2: { monarch: 1, loyalist: 0, rebel: 1, traitor: 0 },
  3: { monarch: 1, loyalist: 0, rebel: 2, traitor: 0 },
  4: { monarch: 0, loyalist: 2, rebel: 2, traitor: 0 },
  5: { monarch: 1, loyalist: 1, rebel: 2, traitor: 1 },
  6: { monarch: 1, loyalist: 1, rebel: 3, traitor: 1 },
  7: { monarch: 1, loyalist: 2, rebel: 3, traitor: 1 },
  8: { monarch: 1, loyalist: 2, rebel: 4, traitor: 1 },
  9: { monarch: 1, loyalist: 3, rebel: 4, traitor: 1 },
  10: { monarch: 1, loyalist: 3, rebel: 4, traitor: 2 },
}

export function getTotalRoles(config: RoleConfig): number {
  return (config.merlin ? 1 : 0)
    + (config.percival ? 1 : 0)
    + (config.mordred ? 1 : 0)
    + (config.morgana ? 1 : 0)
    + (config.oberon ? 1 : 0)
    + (config.assassin ? 1 : 0)
    + config.loyalServants
    + config.minions
}

export function getSgsTotalRoles(config: SgsRoleConfig): number {
  return config.monarch + config.loyalist + config.rebel + config.traitor
}

export function getDefaultConfig(playerCount: number): RoleConfig {
  return DEFAULT_ROLE_CONFIGS[playerCount] ?? DEFAULT_ROLE_CONFIGS[AVALON_MIN_PLAYERS]
}

export function getSgsDefaultConfig(playerCount: number): SgsRoleConfig {
  return SGS_DEFAULT_CONFIGS[playerCount] ?? SGS_DEFAULT_CONFIGS[SGS_MIN_PLAYERS]
}

export const ROLE_LABELS: Record<string, string> = {
  merlin: '梅林',
  percival: '派西维尔',
  mordred: '莫德雷德',
  morgana: '莫甘娜',
  oberon: '奥伯伦',
  assassin: '刺客',
  loyalServants: '忠臣',
  minions: '爪牙',
  monarch: '主公',
  loyalist: '忠臣',
  rebel: '反贼',
  traitor: '内奸',
}

export const SPECIAL_ROLES = ['merlin', 'percival', 'mordred', 'morgana', 'oberon', 'assassin'] as const
export const BASE_ROLES = ['loyalServants', 'minions'] as const
export const SGS_ROLES = ['monarch', 'loyalist', 'rebel', 'traitor'] as const
export type SpecialRole = typeof SPECIAL_ROLES[number]
export type BaseRole = typeof BASE_ROLES[number]
export type SgsRole = typeof SGS_ROLES[number]

export function formatRoleSummary(config: RoleConfig): string {
  const parts: string[] = []

  // enabled special roles in defined order
  for (const role of SPECIAL_ROLES) {
    const enabled = config[role]
    if (enabled) {
      const label = ROLE_LABELS[role]
      if (typeof label === 'string') parts.push(label)
    }
  }

  // base roles with counts
  const loyal = config.loyalServants
  const mins = config.minions
  if (loyal > 0) parts.push(`${ROLE_LABELS['loyalServants']}×${loyal}`)
  if (mins > 0) parts.push(`${ROLE_LABELS['minions']}×${mins}`)

  return parts.join('、')
}

export function formatSgsRoleSummary(config: SgsRoleConfig): string {
  const parts: string[] = []
  for (const role of SGS_ROLES) {
    const count = config[role] || 0
    if (count > 0) {
      parts.push(`${ROLE_LABELS[role]}×${count}`)
    }
  }
  return parts.join('、')
}
