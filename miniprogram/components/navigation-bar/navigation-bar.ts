interface DeviceInfo {
  platform: string
}

interface WindowInfo {
  windowWidth: number
  safeArea?: {
    top?: number
  }
}

interface WxSystemApis {
  getDeviceInfo(): DeviceInfo
  getWindowInfo(): WindowInfo
}

Component({
  options: {
    multipleSlots: true // 在组件定义时的选项中启用多slot支持
  },
  /**
   * 组件的属性列表
   */
  properties: {
    extClass: {
      type: String,
      value: ''
    },
    title: {
      type: String,
      value: ''
    },
    background: {
      type: String,
      value: ''
    },
    color: {
      type: String,
      value: ''
    },
    back: {
      type: Boolean,
      value: true
    },
    loading: {
      type: Boolean,
      value: false
    },
    homeButton: {
      type: Boolean,
      value: false,
    },
    animated: {
      // 显示隐藏的时候opacity动画效果
      type: Boolean,
      value: true
    },
    show: {
      // 显示隐藏导航，隐藏的时候navigation-bar的高度占位还在
      type: Boolean,
      value: true,
      observer: '_showChange'
    },
    // back为true的时候，返回的页面深度
    delta: {
      type: Number,
      value: 1
    },
  },
  /**
   * 组件的初始数据
   */
  data: {
    displayStyle: ''
  },
  lifetimes: {
    attached() {
      const rect = wx.getMenuButtonBoundingClientRect()
      const systemApis = wx as unknown as WxSystemApis
      const deviceInfo = systemApis.getDeviceInfo()
      const windowInfo = systemApis.getWindowInfo()
      const isAndroid = deviceInfo.platform === 'android'
      const isDevtools = deviceInfo.platform === 'devtools'
      const safeAreaTop =
        windowInfo.safeArea && typeof windowInfo.safeArea.top === 'number'
          ? windowInfo.safeArea.top
          : 0

      this.setData({
        ios: !isAndroid,
        innerPaddingRight: `padding-right: ${windowInfo.windowWidth - rect.left}px`,
        leftWidth: `width: ${windowInfo.windowWidth - rect.left}px`,
        safeAreaTop: isDevtools || isAndroid ? `height: calc(var(--height) + ${safeAreaTop}px); padding-top: ${safeAreaTop}px` : ''
      })
    },
  },
  /**
   * 组件的方法列表
   */
  methods: {
    _showChange(show: boolean) {
      const animated = this.data.animated
      let displayStyle = ''
      if (animated) {
        displayStyle = `opacity: ${
          show ? '1' : '0'
        };transition:opacity 0.5s;`
      } else {
        displayStyle = `display: ${show ? '' : 'none'}`
      }
      this.setData({
        displayStyle
      })
    },
    handleBack() {
      const data = this.data
      const delta = data.delta || 1
      const pages = getCurrentPages()

      if (pages.length > delta) {
        wx.navigateBack({
          delta
        })
      } else {
        wx.reLaunch({
          url: '/pages/index/index'
        })
      }
      this.triggerEvent('back', { delta }, {})
    },
    home() {
      wx.reLaunch({
        url: '/pages/index/index'
      })
    }
  },
})
