interface Config {
  baseUrl: string
  socketUrl: string
}

const devConfig: Config = {
  baseUrl: 'https://nightdeal.kaiwen.dev',
  socketUrl: 'wss://nightdeal.kaiwen.dev/room',
}

const prodConfig: Config = {
  baseUrl: 'https://nightdeal.kaiwen.dev',
  socketUrl: 'wss://nightdeal.kaiwen.dev/room',
}

declare const __wxConfig: {
  envVersion: string
} | undefined

const isDev = typeof __wxConfig !== 'undefined' && (__wxConfig.envVersion === 'develop' || __wxConfig.envVersion === 'trial')

export const config: Config = isDev ? devConfig : prodConfig
