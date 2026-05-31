Page({
  data: {
    scrollList: [
      { id: 1, name: '顺手牵羊' },
      { id: 2, name: '过河拆桥' },
      { id: 3, name: '五谷丰登' },
      { id: 4, name: '无中生有' },
      { id: 5, name: '决斗' },
      { id: 6, name: '南蛮入侵' },
      { id: 7, name: '万箭齐发' },
      { id: 8, name: '闪电' },
      { id: 9, name: '桃园结义' },
      { id: 10, name: '无懈可击' },
      { id: 11, name: '借刀杀人' },
      { id: 12, name: '乐不思蜀' },
      { id: 13, name: '兵粮寸断' },
      { id: 14, name: '铁索连环' },
      { id: 15, name: '火攻' }
    ],
    optionList: [
      { id: 1, name: '奇兵', description: '偏向先手压制' },
      { id: 2, name: '正兵', description: '偏向稳健应对' }
    ],
    selectedScrolls: [] as number[],
    selectedOption: null as number | null,
    selectedScrollText: '当前未选择锦囊。',
    selectedOptionLabel: '未选择'
  },

  handleToggleScroll(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id
    const selectedScrolls = [...this.data.selectedScrolls]
    const index = selectedScrolls.indexOf(id)
    
    if (index > -1) {
      selectedScrolls.splice(index, 1)
    } else {
      selectedScrolls.push(id)
    }

    this.setData({
      selectedScrolls,
      selectedScrollText: this.getSelectedScrollText(selectedScrolls)
    })
  },

  handleSelectOption(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id
    const option = this.data.optionList.find(item => item.id === id)
    
    this.setData({
      selectedOption: id,
      selectedOptionLabel: option?.name ?? '未选择'
    })
  },

  handleClear() {
    this.setData({
      selectedScrolls: [],
      selectedOption: null,
      selectedScrollText: '当前未选择锦囊。',
      selectedOptionLabel: '未选择'
    })
  },

  getSelectedScrollText(selectedScrolls: number[]): string {
    if (selectedScrolls.length === 0) {
      return '当前未选择锦囊。'
    }
    return this.data.scrollList
      .filter(item => selectedScrolls.includes(item.id))
      .map(item => item.name)
      .join('、')
  },

  isScrollSelected(id: number): boolean {
    return this.data.selectedScrolls.includes(id)
  },

  isOptionSelected(id: number): boolean {
    return this.data.selectedOption === id
  }
})
