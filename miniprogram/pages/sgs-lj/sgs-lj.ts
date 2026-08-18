Page({
  data: {
    values: {
      partA: '',
      partB: '',
      partC: ''
    },
    result: null as string | null,
    visible: false,
    presets: [
      { label: '均衡', values: { partA: '34', partB: '33', partC: '33' } },
      { label: '稳健', values: { partA: '50', partB: '30', partC: '20' } },
      { label: '激进', values: { partA: '20', partB: '20', partC: '60' } }
    ],
    resultLabels: ['羊袭', '狗袭', '狼袭'],
    currentSum: 0,
    isAllFilled: false,
    isValid: false,
    diff: 0,
    numA: 0,
    numB: 0,
    numC: 0
  },

  hideTimer: null as ReturnType<typeof setTimeout> | null,

  onUnload() {
    this.clearHideTimer()
  },

  clearHideTimer() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
  },

  clearResult() {
    this.clearHideTimer()
    this.setData({ result: null, visible: false })
  },

  handleInput(e: WechatMiniprogram.Input) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value

    if (value !== '' && !/^\d{0,3}(\.\d{0,2})?$/.test(value)) {
      return
    }

    if (value !== '') {
      const parsed = parseFloat(value)
      if (isFinite(parsed) && parsed > 100) {
        wx.showToast({ title: '单项概率不能超过 100', icon: 'none' })
        this.updateValues({ ...this.data.values, [key]: '100' })
        return
      }
    }

    this.updateValues({ ...this.data.values, [key]: value })
  },

  handlePreset(e: WechatMiniprogram.TouchEvent) {
    const preset = e.currentTarget.dataset.preset
    this.clearResult()
    this.updateValues(preset)
  },

  handleClear() {
    this.clearResult()
    this.updateValues({ partA: '', partB: '', partC: '' })
  },

  handleGenerate() {
    if (!this.data.isValid) return

    const { numA, numB } = this.data
    const randomVal = Math.random() * 100
    let finalResult: number

    if (randomVal < numA) {
      finalResult = 0
    } else if (randomVal < numA + numB) {
      finalResult = 1
    } else {
      finalResult = 2
    }

    this.setData({
      result: this.data.resultLabels[finalResult],
      visible: true
    })

    this.clearHideTimer()
    this.hideTimer = setTimeout(() => {
      this.setData({ visible: false })
    }, 2200)
  },

  updateValues(values: { partA: string; partB: string; partC: string }) {
    const numA = this.parseWeight(values.partA)
    const numB = this.parseWeight(values.partB)
    const numC = this.parseWeight(values.partC)
    // 浮点加法会有精度尘埃（如 74.57+18.27+7.16 = 99.99999999999999），
    // 直接 currentSum === 100 会把视觉上加起来正好 100 的合法输入判为无效，
    // 导致判定按钮被禁用、或显示「还差 1.4e-14%」。输入最多两位小数，
    // 统一按百分位四舍五入后再比较/展示。
    const currentSum = round2(numA + numB + numC)
    const isAllFilled = values.partA !== '' && values.partB !== '' && values.partC !== ''
    const isValid = isAllFilled && currentSum === 100
    const diff = round2(100 - currentSum)

    this.setData({
      values,
      numA,
      numB,
      numC,
      currentSum,
      isAllFilled,
      isValid,
      diff
    })
  },

  parseWeight(value: string): number {
    const parsed = parseFloat(value)
    if (!isFinite(parsed) || parsed < 0) return 0
    return Math.min(parsed, 100)
  }
})

/** 四舍五入到两位小数，消除浮点加法尘埃（输入最多两位小数，结果精确）。 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
