const STORAGE_KEY = 'sgs_xdz_state'
const AUTO_CLEAR_DELAY_MS = 600

type SuitKey = 'spades' | 'hearts' | 'clubs' | 'diamonds'

interface SuitConfig {
  key: SuitKey
  name: string
  symbol: string
  color: string
}

const SUITS: SuitConfig[] = [
  { key: 'spades', name: '黑桃', symbol: '♠', color: '#1a1a2e' },
  { key: 'hearts', name: '红桃', symbol: '♥', color: '#b83a3a' },
  { key: 'clubs', name: '梅花', symbol: '♣', color: '#1a1a2e' },
  { key: 'diamonds', name: '方块', symbol: '♦', color: '#b83a3a' }
]

const EMPTY_RECORDED: Record<SuitKey, boolean> = {
  spades: false,
  hearts: false,
  clubs: false,
  diamonds: false
}

interface DerivedState {
  recordedCount: number
  isComplete: boolean
  clearBtnDisabled: boolean
  recordedNames: string
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return 'Unexpected error'
}

function computeDerivedState(recorded: Record<SuitKey, boolean>): DerivedState {
  const recordedCount = SUITS.filter(suit => recorded[suit.key]).length
  return {
    recordedCount,
    isComplete: recordedCount === SUITS.length,
    clearBtnDisabled: recordedCount === 0,
    recordedNames: SUITS.filter(suit => recorded[suit.key])
      .map(suit => suit.name)
      .join('、')
  }
}

Page({
  data: {
    suits: SUITS,
    recorded: { ...EMPTY_RECORDED },
    ...computeDerivedState(EMPTY_RECORDED)
  },

  clearTimer: null as ReturnType<typeof setTimeout> | null,

  onLoad() {
    this.loadState()
  },

  onUnload() {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer)
      this.clearTimer = null
    }
  },

  loadState() {
    try {
      const saved = wx.getStorageSync(STORAGE_KEY)
      if (
        saved &&
        typeof saved === 'object' &&
        saved.recorded !== null &&
        typeof saved.recorded === 'object'
      ) {
        const recordedKeys = Object.keys(EMPTY_RECORDED) as SuitKey[]
        const recorded: Record<SuitKey, boolean> = { ...EMPTY_RECORDED }
        for (const key of recordedKeys) {
          if (saved.recorded[key] === true) {
            recorded[key] = true
          }
        }
        const derived = computeDerivedState(recorded)
        this.setData({ recorded, ...derived })
        this.scheduleAutoClearIfComplete(derived.isComplete)
      }
    } catch (e: unknown) {
      console.error('Failed to load state:', getErrorMessage(e))
    }
  },

  saveState() {
    try {
      wx.setStorageSync(STORAGE_KEY, {
        recorded: this.data.recorded
      })
    } catch (e: unknown) {
      console.error('Failed to save state:', getErrorMessage(e))
    }
  },

  scheduleAutoClearIfComplete(isComplete: boolean) {
    // Always cancel a pending auto-clear first: if the state is no longer
    // complete, we must not let a stale timer wipe it later.
    if (this.clearTimer) {
      clearTimeout(this.clearTimer)
      this.clearTimer = null
    }
    if (!isComplete) return

    this.clearTimer = setTimeout(() => {
      this.clearTimer = null
      this.handleClear()
    }, AUTO_CLEAR_DELAY_MS)
  },

  handleToggleSuit(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as SuitKey
    const recorded: Record<SuitKey, boolean> = {
      ...this.data.recorded,
      [key]: !this.data.recorded[key]
    }
    const derived = computeDerivedState(recorded)

    this.setData({ recorded, ...derived })
    this.saveState()
    this.scheduleAutoClearIfComplete(derived.isComplete)
  },

  handleClear() {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer)
      this.clearTimer = null
    }

    const recorded = { ...EMPTY_RECORDED }
    this.setData({ recorded, ...computeDerivedState(recorded) })
    this.saveState()
  }
})

export {}
