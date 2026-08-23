const STORAGE_KEY = 'sgs_mmc_state'

type AttackId = 'strike' | 'harass'
type DefenseId = 'sortie' | 'guard'
type Verdict = 'success' | 'fail' | null

interface AttackOption {
  id: AttackId
  name: string
  reward: string
  tone: 'strike' | 'harass'
  toneLabel: string
  desc: string
}

interface DefenseOption {
  id: DefenseId
  name: string
  heroDesc: string
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

const DEFENSE_OPTIONS: DefenseOption[] = [
  {
    id: 'sortie',
    name: '出阵迎战',
    heroDesc: '主动出营接战，克制「扰阵疲敌」',
    desc: '目标前压迎战，正面对拆'
  },
  {
    id: 'guard',
    name: '拱卫中军',
    heroDesc: '固守大营不动，克制「直取敌营」',
    desc: '目标稳守中军，防范夺牌'
  }
]

interface ComboInfo {
  title: string
  reason: string
}

const COMBO_INFO: Record<string, ComboInfo> = {
  'strike:sortie': {
    title: '攻城成功',
    reason: '你直取敌营，目标却倾巢出阵迎战，大营空虚——你获得其一张牌。'
  },
  'harass:guard': {
    title: '攻城成功',
    reason: '你扰阵疲敌，目标回援拱卫中军，疲于奔命——你摸两张牌。'
  },
  'strike:guard': {
    title: '攻城失败',
    reason: '你直取敌营，被目标拱卫中军封住去路，未能夺得牌。'
  },
  'harass:sortie': {
    title: '攻城失败',
    reason: '你扰阵疲敌，目标出阵迎战正面拆招，未摸到牌。'
  }
}

/** 攻城成功条件：直取敌营 + 出阵迎战，或 扰阵疲敌 + 拱卫中军。 */
function computeVerdict(attack: AttackId, defense: DefenseId): 'success' | 'fail' {
  const win =
    (attack === 'strike' && defense === 'sortie') ||
    (attack === 'harass' && defense === 'guard')
  return win ? 'success' : 'fail'
}

interface MatrixCell {
  defenseId: DefenseId
  defenseName: string
  outcome: 'success' | 'fail'
  reward: string
  isActive: boolean
}

interface MatrixRow {
  attackId: AttackId
  attackName: string
  cells: MatrixCell[]
}

function isValidAttackId(value: unknown): value is AttackId {
  return ATTACK_OPTIONS.some(option => option.id === value)
}

function isValidDefenseId(value: unknown): value is DefenseId {
  return DEFENSE_OPTIONS.some(option => option.id === value)
}

function buildMatrix(attack: AttackId | null, defense: DefenseId | null): MatrixRow[] {
  return ATTACK_OPTIONS.map(attackOption => {
    const cells: MatrixCell[] = DEFENSE_OPTIONS.map(defenseOption => {
      const verdict = computeVerdict(attackOption.id, defenseOption.id)
      const isActive = attack === attackOption.id && defense === defenseOption.id
      return {
        defenseId: defenseOption.id,
        defenseName: defenseOption.name,
        outcome: verdict,
        reward: verdict === 'success' ? attackOption.reward : '无收益',
        isActive
      }
    })
    return {
      attackId: attackOption.id,
      attackName: attackOption.name,
      cells
    }
  })
}

const TIPS: Array<{ icon: string; text: string }> = [
  {
    icon: '判',
    text: '先判后出：直取敌营怕拱卫中军，扰阵疲敌怕出阵迎战。对手若猜中你的出招，收益就会落空。'
  },
  {
    icon: '谋',
    text: '目标手牌或装备越关键，越倾向拱卫中军防夺牌；此时选扰阵疲敌反而能稳定摸两张。'
  },
  {
    icon: '心',
    text: '谋弈没有必胜解：胜负全在预判对方防守偏好与当下处境，随机出招等于把收益交给运气。'
  }
]

Page({
  data: {
    attackOptions: ATTACK_OPTIONS,
    defenseOptions: DEFENSE_OPTIONS,
    tips: TIPS,
    matrixRows: buildMatrix(null, null) as MatrixRow[],
    selectedAttack: null as AttackId | null,
    selectedDefense: null as DefenseId | null,
    selectedAttackLabel: '未选择',
    selectedDefenseLabel: '未选择',
    verdictChipText: '待定',
    verdictChipClass: 'chip',
    resultVisible: false,
    resultVerdict: null as Verdict,
    resultTitle: '',
    resultReward: '',
    resultReason: '',
    clearBtnDisabled: true
  },

  onLoad() {
    this.loadState()
    this.refresh()
  },

  loadState() {
    try {
      const saved = wx.getStorageSync(STORAGE_KEY)
      if (!saved || typeof saved !== 'object') {
        return
      }
      const savedAttack = (saved as { attack?: unknown }).attack
      const savedDefense = (saved as { defense?: unknown }).defense
      if (isValidAttackId(savedAttack) && isValidDefenseId(savedDefense)) {
        this.setData({ selectedAttack: savedAttack, selectedDefense: savedDefense })
      }
    } catch (e: unknown) {
      console.error('Failed to load state:', e)
    }
  },

  saveState() {
    try {
      wx.setStorageSync(STORAGE_KEY, {
        attack: this.data.selectedAttack,
        defense: this.data.selectedDefense
      })
    } catch (e: unknown) {
      console.error('Failed to save state:', e)
    }
  },

  refresh() {
    const attack = this.data.selectedAttack
    const defense = this.data.selectedDefense

    const attackOption = attack === null ? undefined : ATTACK_OPTIONS.find(item => item.id === attack)
    const defenseOption = defense === null ? undefined : DEFENSE_OPTIONS.find(item => item.id === defense)

    let verdictChipClass = 'chip'
    let verdictChipText = '待定'
    let resultVerdict: Verdict = null
    let resultTitle = ''
    let resultReason = ''
    let resultReward = ''

    if (attack !== null && defense !== null) {
      const verdict = computeVerdict(attack, defense)
      resultVerdict = verdict
      const combo = COMBO_INFO[`${attack}:${defense}`]
      if (verdict === 'success') {
        verdictChipText = '攻城成功'
        verdictChipClass = 'chip-success'
      } else {
        verdictChipText = '攻城失败'
        verdictChipClass = 'chip--danger'
      }
      if (combo) {
        resultTitle = combo.title
        resultReason = combo.reason
        if (attack === 'strike') {
          resultReward = '获得目标一张牌'
        } else {
          resultReward = '你摸两张牌'
        }
      }
    }

    const resultVisible =
      attack !== null && defense !== null && resultVerdict !== null && resultVerdict !== undefined
    const clearBtnDisabled = attack === null && defense === null

    this.setData({
      matrixRows: buildMatrix(attack, defense) as MatrixRow[],
      selectedAttackLabel: attackOption ? attackOption.name : '未选择',
      selectedDefenseLabel: defenseOption ? defenseOption.name : '未选择',
      verdictChipText,
      verdictChipClass,
      resultVisible,
      resultVerdict,
      resultTitle,
      resultReason,
      resultReward,
      clearBtnDisabled
    })
  },

  handleSelectAttack(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as AttackId
    if (!isValidAttackId(id)) {
      return
    }
    this.setData({ selectedAttack: id })
    this.saveState()
    this.refresh()
  },

  handleSelectDefense(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as DefenseId
    if (!isValidDefenseId(id)) {
      return
    }
    this.setData({ selectedDefense: id })
    this.saveState()
    this.refresh()
  },

  handleClear() {
    this.setData({
      selectedAttack: null,
      selectedDefense: null
    })
    this.saveState()
    this.refresh()
  }
})

export {}