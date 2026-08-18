// app.ts
App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 展示本地存储能力
    const logs: number[] = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    // 每次启动都会追加一条，必须截断：否则该 key 随启动次数无界增长，
    // 长期会挤压小程序 10MB 本地存储配额。日志页只看最近记录，保留 100 条足够。
    wx.setStorageSync('logs', logs.slice(0, 100))

    // 登录流程由 pages/index/index.ts 主动触发，避免重复 wx.login 造成竞态
  },
})