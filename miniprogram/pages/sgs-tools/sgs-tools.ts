Page({
  data: {
    tools: [
      {
        id: 'sxy',
        name: '神荀彧',
        description: '奇兵 / 正兵快速决策',
        brief: '按场面选锦囊后，一键做战术判断。',
        tag: '对局中高频',
        route: '/pages/sgs-sxy/sgs-sxy'
      },
      {
        id: 'lj',
        name: '李傕',
        description: '概率加权随机判定',
        brief: '输入三段概率后执行单次随机结果。',
        tag: '概率工具',
        route: '/pages/sgs-lj/sgs-lj'
      }
    ]
  },

  handleToolTap(e: WechatMiniprogram.TouchEvent) {
    const route = e.currentTarget.dataset.route
    wx.navigateTo({ url: route })
  },

  handleBack() {
    wx.navigateBack()
  }
})
