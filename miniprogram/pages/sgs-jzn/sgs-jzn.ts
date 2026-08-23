const STORAGE_KEY = 'sgs_jzn_state'

type PostureId = 'suppress' | 'appease'

interface PostureOption {
  id: PostureId
  name: string
  reward: string
  tone: 'suppress' | 'appease'
  toneLabel: string
  desc: string
}

const POSTURE_OPTIONS: PostureOption[] = [
  {
    id: 'suppress',
    name: '镇压',
    reward: '对方反抗 → 你对其造成 1 点伤害并摸一张牌；对方归顺 → 你获得其一张牌，且交给其两张牌',
    tone: 'suppress',
    toneLabel: '强势',
    desc: '以兵威压制，逼其低头或反抗挨打'
  },
  {
    id: 'appease',
    name: '安抚',
    reward: '对方反抗 → 你受到 1 点伤害并摸一张牌；对方归顺 → 其交给你两张牌',
    tone: 'appease',
    toneLabel: '怀柔',
    desc: '以恩惠招抚，接受投降并索取献礼'
  }
]

interface SkillRule {
  icon: string
  title: string
  text: string
}

/** 技能效果提示词：说明怃戎「谋弈」的触发条件、四种胜负组合与收益。 */
const SKILL_RULES: SkillRule[] = [
  {
    icon: '怃',
    title: '触发',
    text: '出牌阶段限一次，你可以与一名其他角色进行「谋弈」。'
  },
  {
    icon: '规',
    title: '规则',
    text: '你选「镇压」或「安抚」，对方选「反抗」或「归顺」，双方同时公布；四种组合对应四种不同结果，互不占优劣，看的就是心理博弈。'
  },
  {
    icon: '压',
    title: '镇压',
    text: '对方选「反抗」时，你对其造成 1 点伤害并摸一张牌；对方选「归顺」时，你获得其一张牌，且交给其两张牌。'
  },
  {
    icon: '抚',
    title: '安抚',
    text: '对方选「反抗」时，你受到 1 点伤害并摸一张牌；对方选「归顺」时，其交给你两张牌（若其牌数不足两张，则改为其跳过自己的下一个摸牌阶段）。'
  }
]

const POSTURE_HINTS: Record<PostureId, { win: string; lose: string }> = {
  suppress: {
    win: '对方反抗 → 你对其造成 1 点伤害，并摸一张牌。',
    lose: '对方归顺 → 你获得其一张牌，且交给其两张牌。'
  },
  appease: {
    win: '对方归顺 → 其交给你两张牌（牌数不足两张则改为跳过其下个摸牌阶段）。',
    lose: '对方反抗 → 你受到 1 点伤害，并摸一张牌。'
  }
}

function isValidPostureId(value: unknown): value is PostureId {
  return POSTURE_OPTIONS.some(option => option.id === value)
}

Page({
  data: {
    postureOptions: POSTURE_OPTIONS,
    skillRules: SKILL_RULES,
    selectedPosture: null as PostureId | null,
    selectedPostureLabel: '未出策',
    postureHintWin: '',
    postureHintLose: '',
    clearBtnDisabled: true
  },

  onLoad() {
    this.loadState()
  },

  loadState() {
    try {
      const saved = wx.getStorageSync(STORAGE_KEY)
      if (saved && typeof saved === 'object') {
        const savedPosture = (saved as { posture?: unknown }).posture
        if (isValidPostureId(savedPosture)) {
          this.setData({ selectedPosture: savedPosture })
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
        posture: this.data.selectedPosture
      })
    } catch (e: unknown) {
      console.error('Failed to save state:', e)
    }
  },

  refreshHint() {
    const posture = this.data.selectedPosture
    const postureOption =
      posture === null ? undefined : POSTURE_OPTIONS.find(item => item.id === posture)
    const hint = posture === null ? undefined : POSTURE_HINTS[posture]

    this.setData({
      selectedPostureLabel: postureOption ? postureOption.name : '未出策',
      postureHintWin: hint ? hint.win : '',
      postureHintLose: hint ? hint.lose : '',
      clearBtnDisabled: posture === null
    })
  },

  handleSelectPosture(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as PostureId
    if (!isValidPostureId(id)) {
      return
    }
    this.setData({ selectedPosture: id })
    this.saveState()
    this.refreshHint()
  },

  handleClear() {
    this.setData({ selectedPosture: null })
    this.saveState()
    this.refreshHint()
  }
})

export {}