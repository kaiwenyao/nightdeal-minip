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

export const DEFAULT_ROLE_CONFIGS: Record<number, RoleConfig> = {
  5: { merlin: true, percival: false, mordred: false, morgana: false, oberon: false, assassin: true, loyalServants: 2, minions: 1 },
  6: { merlin: true, percival: false, mordred: false, morgana: false, oberon: false, assassin: true, loyalServants: 3, minions: 1 },
  7: { merlin: true, percival: true, mordred: false, morgana: false, oberon: false, assassin: true, loyalServants: 3, minions: 1 },
  8: { merlin: true, percival: true, mordred: true, morgana: false, oberon: false, assassin: true, loyalServants: 3, minions: 1 },
  9: { merlin: true, percival: true, mordred: true, morgana: true, oberon: false, assassin: true, loyalServants: 3, minions: 1 },
  10: { merlin: true, percival: true, mordred: true, morgana: true, oberon: true, assassin: true, loyalServants: 3, minions: 1 },
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

export function getDefaultConfig(playerCount: number): RoleConfig {
  return DEFAULT_ROLE_CONFIGS[playerCount] ?? DEFAULT_ROLE_CONFIGS[5]
}

export const ROLE_LABELS: Record<string, string> = {
  merlin: '梅林',
  percival: '派西维尔',
  mordred: '莫德雷德',
  morgana: '莫甘娜',
  oberon: '奥伯伦',
  assassin: '刺客',
  loyalServants: '忠臣',
  minions: '爪牙'
}

export const SPECIAL_ROLES = ['merlin', 'percival', 'mordred', 'morgana', 'oberon', 'assassin'] as const
export const BASE_ROLES = ['loyalServants', 'minions'] as const
export type SpecialRole = typeof SPECIAL_ROLES[number]
export type BaseRole = typeof BASE_ROLES[number]

export function formatRoleSummary(config: RoleConfig): string {
  const parts: string[] = []

  // enabled special roles in defined order
  for (const role of SPECIAL_ROLES) {
    const enabled = (config as any)[role]
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
