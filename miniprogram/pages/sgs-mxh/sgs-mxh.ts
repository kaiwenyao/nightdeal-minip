const STORAGE_KEY = 'sgs_mxh_state'

type GambitId = 'siege' | 'charge'

interface GambitOption {
  id: GambitId
  name: string
  reward: string
  tone: 'siege' | 'charge'
  toneLabel: string
  desc: string
}

const GAMBIT_OPTIONS: GambitOption[] = [
  {
    id: 'siege',
    name: '围城断粮',
    reward: '谋弈成功：将牌堆顶一张牌当无距离限制的【兵粮寸断】对其使用，若其判定区已有【兵粮寸断】则改为获得其一张牌',
    tone: 'siege',
    toneLabel: '控牌',
    desc: '截断补给围城拉锯，压低对方手牌上限'
  },
  {
    id: 'charge',
    name: '擂鼓进军',
    reward: '谋弈成功：视为对其使用一张【决斗】',
    tone: 'charge',
    toneLabel: '进攻',
    desc: '击鼓号令正面强攻，打掉对方手牌与体力'
  }
]

interface SkillRule {
  icon: string
  title: string
  text: string
}

/** 技能效果提示词：说明断粮「谋弈」的触发条件、成败规则与收益。 */
const SKILL_RULES: SkillRule[] = [
  {
    icon: '断',
    title: '触发',
    text: '出牌阶段限一次，你可以与一名其他角色进行「谋弈」。'
  },
  {
    icon: '规',
    title: '规则',
    text: '你选攻策（围城断粮 / 擂鼓进军），对方选「全军突击」或「闭门守城」，双方同时公布。你选的攻策恰好对应对方的守策时，谋弈成功并执行对应收益，否则谋弈失败，无事发生。'
  },
  {
    icon: '粮',
    title: '围城断粮',
    text: '对方选「闭门守城」时，你谋弈成功：将牌堆顶一张牌当无距离限制的【兵粮寸断】对其使用；若其判定区已有【兵粮寸断】，则改为获得其一张牌。对方选「全军突击」时谋弈失败。'
  },
  {
    icon: '鼓',
    title: '擂鼓进军',
    text: '对方选「全军突击」时，你谋弈成功：视为对其使用一张【决斗】。对方选「闭门守城」时谋弈失败。'
  }
]

const GAMBIT_HINTS: Record<GambitId, { win: string; lose: string }> = {
  siege: {
    win: '对方闭门守城 → 谋弈成功：将牌堆顶一张牌当无距离限制的【兵粮寸断】对其使用（若其判定区已有【兵粮寸断】则改为获得其一张牌）。',
    lose: '对方全军突击 → 谋弈失败。'
  },
  charge: {
    win: '对方全军突击 → 谋弈成功：视为对其使用一张【决斗】。',
    lose: '对方闭门守城 → 谋弈失败。'
  }
}

function isValidGambitId(value: unknown): value is GambitId {
  return GAMBIT_OPTIONS.some(option => option.id === value)
}

Page({
  data: {
    gambitOptions: GAMBIT_OPTIONS,
    skillRules: SKILL_RULES,
    selectedGambit: null as GambitId | null,
    selectedGambitLabel: '未出策',
    gambitHintWin: '',
    gambitHintLose: '',
    clearBtnDisabled: true
  },

  onLoad() {
    this.loadState()
  },

  loadState() {
    try {
      const saved = wx.getStorageSync(STORAGE_KEY)
      if (saved && typeof saved === 'object') {
        const savedGambit = (saved as { gambit?: unknown }).gambit
        if (isValidGambitId(savedGambit)) {
          this.setData({ selectedGambit: savedGambit })
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
        gambit: this.data.selectedGambit
      })
    } catch (e: unknown) {
      console.error('Failed to save state:', e)
    }
  },

  refreshHint() {
    const gambit = this.data.selectedGambit
    const gambitOption =
      gambit === null ? undefined : GAMBIT_OPTIONS.find(item => item.id === gambit)
    const hint = gambit === null ? undefined : GAMBIT_HINTS[gambit]

    this.setData({
      selectedGambitLabel: gambitOption ? gambitOption.name : '未出策',
      gambitHintWin: hint ? hint.win : '',
      gambitHintLose: hint ? hint.lose : '',
      clearBtnDisabled: gambit === null
    })
  },

  handleSelectGambit(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as GambitId
    if (!isValidGambitId(id)) {
      return
    }
    this.setData({ selectedGambit: id })
    this.saveState()
    this.refreshHint()
  },

  handleClear() {
    this.setData({ selectedGambit: null })
    this.saveState()
    this.refreshHint()
  }
})

export {}