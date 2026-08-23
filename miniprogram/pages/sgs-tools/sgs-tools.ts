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
      },
      {
        id: 'mxh',
        name: '谋徐晃',
        icon: '徐',
        description: '断根谋弈出策与技能说明',
        brief: '谋徐晃方选策（围城断粮 / 擂鼓进军），附成败对照与博弈要点。',
        tag: '对局中高频',
        route: '/pages/sgs-mxh/sgs-mxh'
      },
      {
        id: 'jzn',
        name: '界张嶷',
        icon: '嶷',
        description: '怛戎谋弈四阵法结算',
        brief: '界张棻方选镇压/安抚，对方公布反抗/归顺后，四种组合逐一结算。',
        tag: '对局中高频',
        route: '/pages/sgs-jzn/sgs-jzn'
      },
      {
        id: 'sp',
        name: '审配',
        icon: '审',
        description: '守邘对策出策与技能说明',
        brief: '审配方选守策（开城诱敌 / 奇袭粮道），附对策成败对照。',
        tag: '对局中高频',
        route: '/pages/sgs-sp/sgs-sp'
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
