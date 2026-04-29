const fallbackMap = {
  loading: '正在加载，请稍候...',
  error: '加载失败，请重试',
  empty: '暂无内容',
}

Component({
  properties: {
    type: {
      type: String,
      value: 'loading',
    },
    message: {
      type: String,
      value: '',
    },
    actionText: {
      type: String,
      value: '',
    },
  },
  data: {
    fallbackMessage: fallbackMap.loading,
  },
  observers: {
    type(type: keyof typeof fallbackMap) {
      this.setData({
        fallbackMessage: fallbackMap[type] || fallbackMap.loading,
      })
    },
  },
  methods: {
    handleAction() {
      this.triggerEvent('action')
    },
  },
})
