const STORAGE_KEY = 'sgs_sp_state'

type SchemeId = 'lure' | 'raid'

interface SchemeOption {
  id: SchemeId
  name: string
  reward: string
  tone: 'lure' | 'raid'
  toneLabel: string
  desc: string
}

const SCHEME_OPTIONS: SchemeOption[] = [
  {
    id: 'lure',
    name: '开城诱敌',
    reward: '对策成功：此牌对你无效，进入弃牌堆时由你获得',
    tone: 'lure',
    toneLabel: '诱敌',
    desc: '大开城门诱敌深入，针对敌方兵力分散的围城打法'
  },
  {
    id: 'raid',
    name: '奇袭粮道',
    reward: '对策成功：此牌对你无效，进入弃牌堆时由你获得',
    tone: 'raid',
    toneLabel: '主动',
    desc: '趁敌方全力强攻，派兵断其粮道，打乱攻势'
  }
]

interface SkillRule {
  icon: string
  title: string
  text: string
}

/** 技能效果提示词：说明守邺「对策」的触发条件、成败规则与收益。 */
const SKILL_RULES: SkillRule[] = [
  {
    icon: '邺',
    title: '触发',
    text: '每回合限一次，当你成为其他角色使用牌的唯一目标后，你可以与其进行「对策」。'
  },
  {
    icon: '规',
    title: '规则',
    text: '你选守策（开城诱敌 / 奇袭粮道），对方选攻策（全力攻城 / 分兵围城），双方同时公布。对方攻策略与你所选守策对应时，对策成功：此牌对你无效，且此牌进入弃牌堆时由你获得。'
  },
  {
    icon: '开',
    title: '开城诱敌',
    text: '对方选「分兵围城」时，你对策成功，拦下此牌并获其所有实体牌；对方选「全力攻城」时则对策失败。'
  },
  {
    icon: '袭',
    title: '奇袭粮道',
    text: '对方选「全力攻城」时，你对策成功，拦下此牌并获其所有实体牌；对方选「分兵围城」时则对策失败。'
  }
]

const SCHEME_HINTS: Record<SchemeId, { win: string; lose: string }> = {
  lure: {
    win: '对方分兵围城 → 对策成功，此牌对你无效，进入弃牌堆时由你获得。',
    lose: '对方全力攻城 → 对策失败，此牌对你正常生效。'
  },
  raid: {
    win: '对方全力攻城 → 对策成功，此牌对你无效，进入弃牌堆时由你获得。',
    lose: '对方分兵围城 → 对策失败，此牌对你正常生效。'
  }
}

function isValidSchemeId(value: unknown): value is SchemeId {
  return SCHEME_OPTIONS.some(option => option.id === value)
}

Page({
  data: {
    schemeOptions: SCHEME_OPTIONS,
    skillRules: SKILL_RULES,
    selectedScheme: null as SchemeId | null,
    selectedSchemeLabel: '未选择',
    schemeHintWin: '',
    schemeHintLose: '',
    clearBtnDisabled: true
  },

  onLoad() {
    this.loadState()
  },

  loadState() {
    try {
      const saved = wx.getStorageSync(STORAGE_KEY)
      if (saved && typeof saved === 'object') {
        const savedScheme = (saved as { scheme?: unknown }).scheme
        if (isValidSchemeId(savedScheme)) {
          this.setData({ selectedScheme: savedScheme })
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
        scheme: this.data.selectedScheme
      })
    } catch (e: unknown) {
      console.error('Failed to save state:', e)
    }
  },

  refreshHint() {
    const scheme = this.data.selectedScheme
    const schemeOption =
      scheme === null ? undefined : SCHEME_OPTIONS.find(item => item.id === scheme)
    const hint = scheme === null ? undefined : SCHEME_HINTS[scheme]

    this.setData({
      selectedSchemeLabel: schemeOption ? schemeOption.name : '未选择',
      schemeHintWin: hint ? hint.win : '',
      schemeHintLose: hint ? hint.lose : '',
      clearBtnDisabled: scheme === null
    })
  },

  handleSelectScheme(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as SchemeId
    if (!isValidSchemeId(id)) {
      return
    }
    this.setData({ selectedScheme: id })
    this.saveState()
    this.refreshHint()
  },

  handleClear() {
    this.setData({ selectedScheme: null })
    this.saveState()
    this.refreshHint()
  }
})

export {}