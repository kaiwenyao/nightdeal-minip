const STORAGE_KEY = 'sgs_mmc_state'

type AttackId = 'strike' | 'harass'

interface AttackOption {
  id: AttackId
  name: string
  reward: string
  tone: 'strike' | 'harass'
  toneLabel: string
  desc: string
}

const ATTACK_OPTIONS: AttackOption[] = [
  {
    id: 'strike',
    name: '直取敌营',
    reward: '获得目标一张牌',
    tone: 'strike',
    toneLabel: '夺牌',
    desc: '直捣大营夺牌，抢关键装备或手牌'
  },
  {
    id: 'harass',
    name: '扰阵疲敌',
    reward: '你摸两张牌',
    tone: 'harass',
    toneLabel: '稳健',
    desc: '持续骚扰，稳定摸两张牌补资源'
  }
]

interface SkillRule {
  icon: string
  title: string
  text: string
}

/** 技能效果提示词：与神荀彧奇正相生同类，向谋马超方说明谋弈的成败规则与收益。 */
const SKILL_RULES: SkillRule[] = [
  {
    icon: '弈',
    title: '触发',
    text: '你使用【杀】指定一名角色为目标后，可与该角色进行一次谋弈。'
  },
  {
    icon: '规',
    title: '规则',
    text: '双方各从两策中选一项，同时公布。目标未恰好相克你的出招，即攻城成功，执行对应收益；否则攻城失败，无额外收益。'
  },
  {
    icon: '攻',
    title: '直取敌营',
    text: '目标选择「出阵迎战」时，你攻城成功，获得其一张牌；目标选择「拱卫中军」时则落空。'
  },
  {
    icon: '扰',
    title: '扰阵疲敌',
    text: '目标选择「拱卫中军」时，你攻城成功，摸两张牌；目标选择「出阵迎战」时则被接下。'
  }
]

const ATTACK_HINTS: Record<AttackId, { win: string; lose: string }> = {
  strike: {
    win: '对方出阵迎战 → 攻城成功，你获得目标一张牌。',
    lose: '对方拱卫中军 → 攻城失败。'
  },
  harass: {
    win: '对方拱卫中军 → 攻城成功，你摸两张牌。',
    lose: '对方出阵迎战 → 攻城失败。'
  }
}

function isValidAttackId(value: unknown): value is AttackId {
  return ATTACK_OPTIONS.some(option => option.id === value)
}

Page({
  data: {
    attackOptions: ATTACK_OPTIONS,
    skillRules: SKILL_RULES,
    selectedAttack: null as AttackId | null,
    selectedAttackLabel: '未选择',
    attackHintWin: '',
    attackHintLose: '',
    clearBtnDisabled: true
  },

  onLoad() {
    this.loadState()
  },

  loadState() {
    try {
      const saved = wx.getStorageSync(STORAGE_KEY)
      if (saved && typeof saved === 'object') {
        const savedAttack = (saved as { attack?: unknown }).attack
        if (isValidAttackId(savedAttack)) {
          this.setData({ selectedAttack: savedAttack })
        }
      }
    } catch (e: unknown) {
      console.error('Failed to load state:', e)
    }
    this.refreshHint()
  },

  saveState() {
    try {
      wx.setStorageSync(STORAGE_KEY, {
        attack: this.data.selectedAttack
      })
    } catch (e: unknown) {
      console.error('Failed to save state:', e)
    }
  },

  refreshHint() {
    const attack = this.data.selectedAttack
    const attackOption = attack === null ? undefined : ATTACK_OPTIONS.find(item => item.id === attack)
    const hint = attack === null ? undefined : ATTACK_HINTS[attack]

    this.setData({
      selectedAttackLabel: attackOption ? attackOption.name : '未选择',
      attackHintWin: hint ? hint.win : '',
      attackHintLose: hint ? hint.lose : '',
      clearBtnDisabled: attack === null
    })
  },

  handleSelectAttack(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as AttackId
    if (!isValidAttackId(id)) {
      return
    }
    this.setData({ selectedAttack: id })
    this.saveState()
    this.refreshHint()
  },

  handleClear() {
    this.setData({ selectedAttack: null })
    this.saveState()
    this.refreshHint()
  }
})

export {}