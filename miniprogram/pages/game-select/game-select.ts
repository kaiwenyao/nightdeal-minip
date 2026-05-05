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
    wx.showToast({ title: '阿瓦隆正在开发中', icon: 'none' })
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
