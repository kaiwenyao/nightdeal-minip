interface Config {
  baseUrl: string
  socketUrl: string
}

const devConfig: Config = {
  baseUrl: 'http://localhost:3000',
  socketUrl: 'ws://localhost:3000/room',
}

const prodConfig: Config = {
  baseUrl: 'https://your-production-domain.com',
  socketUrl: 'wss://your-production-domain.com/room',
}

declare const __wxConfig: {
  envVersion: string
} | undefined

const isDev = typeof __wxConfig !== 'undefined' && (__wxConfig.envVersion === 'develop' || __wxConfig.envVersion === 'trial')

export const config: Config = isDev ? devConfig : prodConfig
