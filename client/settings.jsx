// 设置：工作区位置和界面语言。生图那套随成稿流水线一起下线了。
import React from 'react'
import { saveSettings, setDesk, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { updateUrl, useVersionInfo } from './version.js'
import { Dialog } from './ui.jsx'

const LANGUAGES = [
  { value: 'auto', label: () => t('跟随 DeepSeek Harness') },
  { value: 'zh', label: () => '中文' },
  { value: 'en', label: () => 'English' },
]

export function SettingsDialog() {
  useLang()
  const open = useDesk(s => s.settingsOpen)
  const settings = useDesk(s => s.settings)
  const version = useVersionInfo()
  const [form, setForm] = React.useState(null)

  React.useEffect(() => {
    if (!open || !settings) return
    setForm({ language: settings.language ?? 'auto', exportDir: settings.exportDir ?? '', saveRoot: settings.saveRoot ?? '' })
  }, [open, settings])

  if (!open || !form) return null
  const close = () => setDesk({ settingsOpen: false })
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  return (
    <Dialog title={t('设置')} onClose={close} width={520}>
      <form className="md-form" onSubmit={async (event) => {
        event.preventDefault()
        const ok = await saveSettings({ language: form.language, exportDir: form.exportDir, saveRoot: form.saveRoot })
        if (ok) close()
      }}>
        <label className="md-field">
          <span>{t('界面语言')}</span>
          <select value={form.language} onChange={event => set('language', event.target.value)}>
            {LANGUAGES.map(item => <option key={item.value} value={item.value}>{item.label()}</option>)}
          </select>
        </label>

        <label className="md-field">
          <span>{t('工作区根目录')}</span>
          <input value={form.saveRoot} onChange={event => set('saveRoot', event.target.value)} placeholder="~/Documents/Youtulh 工作台" />
          <small>{t('设定、账号数据、线索表、内容和数据都写在这里；留空用默认位置。')}</small>
        </label>

        <label className="md-field">
          <span>{t('导出目录（可选）')}</span>
          <input value={form.exportDir} onChange={event => set('exportDir', event.target.value)} placeholder={t('留空表示写到工作区里')} />
        </label>

        <div className="md-version">
          <span>{t('版本')} {version?.current ? `v${version.current}` : '—'}</span>
          {version?.updateAvailable ? <a href={updateUrl(version)} target="_blank" rel="noreferrer">{t('有新版本 ↑ v{version}', { version: version.latest })}</a> : null}
        </div>

        <div className="md-form-foot">
          <span style={{ flex: 1 }} />
          <button type="button" className="md-btn" onClick={close}>{t('取消')}</button>
          <button type="submit" className="md-btn is-primary">{t('保存')}</button>
        </div>
      </form>
    </Dialog>
  )
}
