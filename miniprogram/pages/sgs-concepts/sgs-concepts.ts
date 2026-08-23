interface RuleItem {
  title: string
  desc: string
}

interface ConceptItem {
  id: string
  name: string
  icon: string
  tag: string
  summary: string
  rules: RuleItem[]
  note: string
}

Page({
  data: {
    expandedId: '',
    concepts: [
      {
        id: 'xieli',
        name: '协力',
        icon: '协',
        tag: '谋攻篇·同包',
        summary: '与一名角色结盟，两人在时限内合计完成一项才算协力成功。',
        rules: [
          { title: '同仇', desc: '你与其造成的伤害值之和不小于 4。' },
          { title: '并进', desc: '你与其总计摸牌数不少于 8 张。' },
          { title: '疏财', desc: '你与其合计弃置的牌包含 4 种花色。' },
          { title: '勠力', desc: '你与其使用或打出的牌合计包含 4 种花色。' }
        ],
        note: '发起者从以上四项中选择一项，与目标角色共同在技能规定的时限内完成；成功与否在指定时机结算，奖励视具体技能而定，结算不受出牌阶段限制。目前涉及武将：谋张飞、谋赵云等。'
      },
      {
        id: 'zhengshou',
        name: '整肃',
        icon: '整',
        tag: '始计篇·严包',
        summary: '回合内按约定用牌，达成即得“整肃奖励”的回合任务机制。',
        rules: [
          { title: '擂进', desc: '出牌阶段内使用至少 3 张牌，且这些牌的点数均严格递增。' },
          { title: '变阵', desc: '出牌阶段内使用至少 2 张牌，且这些牌的花色均相同。' },
          { title: '鸣止', desc: '弃牌阶段内弃置至少 2 张牌，且这些牌的花色互不相同。' }
        ],
        note: '发动者从擂进、变阵、鸣止中选一项令目标执行；若目标于其回合弃牌阶段结束后未整肃失败，获得整肃奖励：摸两张牌或回复 1 点体力。目前涉及皇甫嵩（整军）、朱儁（厚俸）、吕范（严纪）等。'
      },
      {
        id: 'mouyi',
        name: '谋弈',
        icon: '弈',
        tag: '谋攻篇·始包',
        summary: '双方暗选一项、同时亮出，达成指定组合才生效的对策式博弈。',
        rules: [
          { title: '暗选', desc: '发起方与目标方各自从技能规定的选项中秘密选择一个。' },
          { title: '亮出', desc: '双方将各自的选择同时亮出。' },
          { title: '结算', desc: '若组合符合该技能的“成功组合”，按技能结算对应收益；否则无事发生。' }
        ],
        note: '与审配的“对策”机制同源，目前涉及谋徐晃、谋马超、界张嶷、韩玄等。各武将的选项与成功组合互不相同，请以对应技能文本为准。'
      },
      {
        id: 'chuli',
        name: '蓄力',
        icon: '蓄',
        tag: '谋攻篇·能包',
        summary: '以“蓄力点数”为资源的技能类型，攒够点数才能发力。',
        rules: [
          { title: '蓄力技（X/Y）', desc: 'X 为游戏开始时获得的蓄力点数，Y 为蓄力点数上限。' },
          { title: '消耗发动', desc: '发动蓄力技需消耗对应的蓄力点数，剩余点数的数量仅自己可见。' },
          { title: '多蓄力技', desc: '一名武将若有多个蓄力技，其消耗的蓄力值按 X、Y 分别相加后生效。' }
        ],
        note: '本质上仍是一种印记类资源，目前涉及谋赵云、谋姜维、谋公孙瓒、谋孟获等武将。'
      },
      {
        id: 'junling',
        name: '军令',
        icon: '令',
        tag: '君临天下·权（国战）',
        summary: '发令者随机取两张军令、择一交付执行，执行或拒绝各有结算。',
        rules: [
          { title: '军令一', desc: '本回合不能使用或打出手牌，且所有非锁定技失效。' },
          { title: '军令二', desc: '失去 1 点体力。' },
          { title: '军令三', desc: '摸一张牌，然后交给你两张牌。' },
          { title: '军令四', desc: '对你指定的一名角色造成 1 点伤害。' },
          { title: '军令五', desc: '将武将牌叠置，且本回合不能回复体力。' },
          { title: '军令六', desc: '保留一张手牌和一张装备区里的牌，弃置其余所有牌。' }
        ],
        note: '目标角色可在“执行 / 不执行”之间依技能规定抉择：执行则立即结算对应效果，不执行则按发令技能结算拒绝后果。目前涉及董昭、诸葛恪、界吴国太、界于禁等。'
      },
      {
        id: 'hujia',
        name: '护甲',
        icon: '甲',
        tag: '谋攻篇',
        summary: '优先吃伤害的护甲条：受伤先扣护甲，护甲掉光才掉体力。',
        rules: [
          { title: '扣护甲', desc: '有护甲的角色因受到伤害而扣减体力时，改为扣减等量的护甲值。' },
          { title: '上限', desc: '每名角色护甲值上限至多为 5（旧测试服上限为 10）。' },
          { title: '时机', desc: '护甲不“防止伤害”，伤害的相关结算照常进行；失去体力无视护甲。' }
        ],
        note: '谋攻篇中被广泛应用的防御资源，目前涉及谋吕蒙、谋于禁、谋黄盖、谋曹仁、谋华雄等武将。'
      }
    ]
  },

  handleConceptTap(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string
    if (!this.data.concepts.some((c: ConceptItem) => c.id === id)) return
    this.setData({
      expandedId: this.data.expandedId === id ? '' : id
    })
  }
})