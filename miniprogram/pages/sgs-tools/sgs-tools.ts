Page({
  data: {
    tools: [
      {
        id: 'sxy',
        name: '神荀彧',
        icon: '荀',
        description: '奇兵 / 正兵快速决策',
        brief: '按场面选锦囊后，一键做战术判断。',
        tag: '对局中高频',
        route: '/pages/sgs-sxy/sgs-sxy'
      },
      {
        id: 'lj',
        name: '李傕',
        icon: '傕',
        description: '概率加权随机判定',
        brief: '输入三段概率后执行单次随机结果。',
        tag: '概率工具',
        route: '/pages/sgs-lj/sgs-lj'
      },
      {
        id: 'xdz',
        name: '星董卓',
        icon: '董',
        description: '镇边花色记录',
        brief: '记录未使用而进入弃牌堆的牌花色，集齐四种自动清空。',
        tag: '状态追踪',
        route: '/pages/sgs-xdz/sgs-xdz'
      },
      {
        id: 'mmc',
        name: '谋马超',
        icon: '马',
        description: '铁骑谋弈出招与技能说明',
        brief: '谋马超方选策出招，附谋弈规则的技能提示，对照当场判定成败。',
        tag: '对局中高频',
        route: '/pages/sgs-mmc/sgs-mmc'
      }
    ]
  },

  handleToolTap(e: WechatMiniprogram.TouchEvent) {
    const route = e.currentTarget.dataset.route as string
    wx.navigateTo({ url: route })
  },

  handleBack() {
    wx.navigateBack()
  }
})
