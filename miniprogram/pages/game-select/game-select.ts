Page({
  data: {
    isNavigating: false,
  },
  onLoad() {
    this.setData({ isNavigating: false })
  },
  onShow() {
    this.setData({ isNavigating: false })
  },
  handleSelectAvalon() {
    if (this.data.isNavigating) return
    this.setData({ isNavigating: true })
    wx.navigateTo({
      url: '/pages/index/index?gameType=AVALON',
      fail: () => {
        this.setData({ isNavigating: false })
      },
    })
  },
  handleSelectSgs() {
    if (this.data.isNavigating) return
    this.setData({ isNavigating: true })
    wx.navigateTo({
      url: '/pages/index/index?gameType=SGS',
      fail: () => {
        this.setData({ isNavigating: false })
      },
    })
  },
})
