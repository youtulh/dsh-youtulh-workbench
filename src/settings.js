// 工作台设置。密钥和内容数据分开存放，文件权限 600，也不会返回给浏览器。
import { chmod, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tr } from './i18n.js'

const DEFAULTS = {
  image: { source: 'http', protocol: 'openai', baseUrl: '', model: '', apiKey: '', size: '1536x1024', quality: '', toolSize: '1536x1024', toolQuality: '', extra: '' },
  // 助手文字模型：空对象表示跟随 DeepSeek Harness 默认模型
  assistant: { provider: '', model: '' },
  brand: { name: '', teacher: '', logo: '', mark: '' },
  voice: '',
  inspiration: '',
  timeNode: '',
  district: '',
  school: '',
  examAt: '',
  exportDir: '',
  // 工作区根目录：内容、私信、数据和「我的设定.md」都写在这里；空表示用默认的 ~/Documents/Youtulh 工作台
  saveRoot: '',
  generateImages: true,
  imageCount: 2,
  shotCount: 6,
  language: 'auto',
}

function clamp(value, min, max, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}

export class Settings {
  constructor(root) {
    this.file = join(root, 'settings.json')
    this.value = null
  }

  async read() {
    // 每次都读文件：桌面版和 Web 版可能同时运行
    try {
      const saved = JSON.parse(await readFile(this.file, 'utf8'))
      this.value = { ...DEFAULTS, ...saved, image: { ...DEFAULTS.image, ...saved.image }, assistant: { ...DEFAULTS.assistant, ...(saved.assistant ?? {}) }, brand: { ...DEFAULTS.brand, ...(saved.brand ?? {}) } }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
      this.value = structuredClone(DEFAULTS)
    }
    return this.value
  }

  /** 空密钥表示不修改，clearKey 才会删除。 */
  async update(patch) {
    const current = await this.read()
    const next = structuredClone(current)
    const image = patch.image ?? {}
    if (image.source !== undefined) {
      if (!['http', 'tool'].includes(image.source)) throw Object.assign(new Error(tr('生图来源无效')), { status: 400 })
      next.image.source = image.source
    }
    if (image.protocol !== undefined) {
      if (!['openai', 'bailian', 'wan'].includes(image.protocol)) throw Object.assign(new Error(tr('生图协议无效')), { status: 400 })
      next.image.protocol = image.protocol
    }
    for (const key of ['model', 'size', 'quality']) {
      if (typeof image[key] === 'string') next.image[key] = image[key].trim().slice(0, 200)
    }
    for (const [key, values, message] of [
      ['toolSize', ['', '1024x1024', '1024x1536', '1536x1024', 'auto'], '订阅生图工具不支持这个尺寸'],
      ['toolQuality', ['', 'low', 'medium', 'high', 'auto'], '订阅生图工具不支持这个质量'],
    ]) {
      if (image[key] !== undefined) {
        if (typeof image[key] !== 'string' || !values.includes(image[key].trim())) throw Object.assign(new Error(tr(message)), { status: 400 })
        next.image[key] = image[key].trim()
      }
    }
    if (typeof image.baseUrl === 'string') {
      let url = image.baseUrl.trim().replace(/\/+$/, '')
      if (next.image.protocol === 'bailian') {
        // 百炼可能被贴成完整端点或带 /api/v1，统一存域名
        url = url.replace(/\/api\/v1\/services\/aigc\/multimodal-generation\/generation$/i, '').replace(/\/api\/v1$/i, '')
      } else if (next.image.protocol === 'wan') {
        url = url.replace(/\/api\/v1\/(?:services\/aigc\/text2image\/image-synthesis|tasks\/[^/]+)$/i, '').replace(/\/api\/v1$/i, '')
      } else {
        url = url.replace(/\/images\/generations$/, '')
      }
      if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw Object.assign(new Error(tr('接口地址要以 http:// 或 https:// 开头')), { status: 400 })
      next.image.baseUrl = url
    }
    if (typeof image.extra === 'string') {
      const extra = image.extra.trim()
      if (extra) {
        let parsed
        try {
          parsed = JSON.parse(extra)
        } catch {
          parsed = null
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Object.assign(new Error(tr('附加参数要是一个 JSON 对象')), { status: 400 })
      }
      next.image.extra = extra
    }
    if (typeof image.apiKey === 'string' && image.apiKey.trim()) next.image.apiKey = image.apiKey.trim()
    if (image.clearKey === true) next.image.apiKey = ''
    if (patch.assistant && typeof patch.assistant === 'object') {
      const provider = typeof patch.assistant.provider === 'string' ? patch.assistant.provider.trim().slice(0, 200) : ''
      const model = typeof patch.assistant.model === 'string' ? patch.assistant.model.trim().slice(0, 200) : ''
      // provider 和 model 要么都填（指定模型），要么都空（跟随默认）
      if (Boolean(provider) !== Boolean(model)) throw Object.assign(new Error(tr('助手模型的提供方和模型要一起填')), { status: 400 })
      next.assistant = { provider, model }
    }
    if (patch.brand && typeof patch.brand === 'object') {
      for (const key of ['name', 'teacher', 'logo', 'mark']) {
        if (typeof patch.brand[key] === 'string') next.brand[key] = patch.brand[key].trim().slice(0, key === 'logo' ? 500 : 60)
      }
    }
    if (typeof patch.voice === 'string') next.voice = patch.voice.slice(0, 8000)
    if (typeof patch.inspiration === 'string') next.inspiration = patch.inspiration.slice(0, 500)
    if (typeof patch.timeNode === 'string') next.timeNode = patch.timeNode.slice(0, 200)
    if (typeof patch.district === 'string') next.district = patch.district.slice(0, 60)
    if (typeof patch.school === 'string') next.school = patch.school.slice(0, 80)
    if (typeof patch.examAt === 'string') next.examAt = patch.examAt.slice(0, 40)
    if (typeof patch.exportDir === 'string') next.exportDir = patch.exportDir.trim().slice(0, 500)
    if (typeof patch.saveRoot === 'string') next.saveRoot = patch.saveRoot.trim().slice(0, 500)
    if (typeof patch.generateImages === 'boolean') next.generateImages = patch.generateImages
    if (patch.imageCount !== undefined) next.imageCount = clamp(patch.imageCount, 0, 4, current.imageCount)
    if (['auto', 'zh', 'en'].includes(patch.language)) next.language = patch.language
    if (patch.shotCount !== undefined) next.shotCount = clamp(patch.shotCount, 0, 12, current.shotCount)
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(next, null, 2), { mode: 0o600 })
    await chmod(tmp, 0o600)
    await rename(tmp, this.file)
    this.value = next
    return next
  }
}

export function imageReady(settings, toolAvailable = false) {
  if (settings.image.source === 'tool') return toolAvailable
  return Boolean(settings.image.baseUrl && settings.image.model && settings.image.apiKey)
}

/** 发给浏览器的版本：只告诉它有没有密钥和末四位。 */
export function publicSettings(settings, toolAvailable = false) {
  const { apiKey, ...image } = settings.image
  return { ...settings, image: { ...image, hasKey: Boolean(apiKey), keyHint: apiKey ? apiKey.slice(-4) : '' }, imageToolAvailable: toolAvailable, imageReady: imageReady(settings, toolAvailable) }
}
