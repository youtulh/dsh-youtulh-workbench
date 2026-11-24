// 看数据：直接看工作区里的 数据/ 文件夹，有多少份、什么时候更新的，然后交给对话里的助教分析。
import React from 'react'
import { fetchTree, revealDir, saveOutput, toast } from './desk.js'
import { t, useLang } from './i18n.js'
import { launchFailedToast, startChat } from './launch.js'
import { Icon } from './ui.jsx'
import { fmtWhen } from './util.js'

const size = bytes => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

export function DataView() {
  useLang()
  const [files, setFiles] = React.useState(null)
  const [paste, setPaste] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(() => {
    fetchTree()
      .then(tree => {
        const rows = tree.filter(row => row.kind === 'data')
        // 把文件夹摊平成文件行：一份复盘就是一个文件
        setFiles(rows.flatMap(row => row.files.map(file => ({ ...file, dir: row.dir, folder: row.name }))))
      })
      .catch(err => toast(err.message, { error: true }))
  }, [])
  React.useEffect(() => { load() }, [load])

  // 把粘贴的后台数据存成 数据/<日期>.csv，之后就能让助教读
  const save = async () => {
    const text = paste.trim()
    if (!text || saving) return
    setSaving(true)
    try {
      const title = `数据 ${new Date().toLocaleDateString('zh-CN')}`
      const result = await saveOutput({ kind: 'data', title, content: text, formats: ['csv'] })
      toast(t('已存到 {dir}', { dir: result.dir }))
      setPaste('')
      load()
    } catch (err) {
      toast(err.message, { error: true })
    }
    setSaving(false)
  }

  const total = (files ?? []).reduce((sum, file) => sum + (file.size || 0), 0)
  const latest = files?.[0]
  const analyze = () => {
    if (!startChat('data', { files: (files ?? []).map(file => file.name) })) launchFailedToast(toast)
  }

  return (
    <div className="md-page md-data">
      <header className="md-page-head">
        <div>
          <h1>{t('看数据')}</h1>
          <p className="md-page-sub">{t('这里列的是工作区 数据/ 文件夹里的文件。把后台数据存成一份进去，交给助教分析。')}</p>
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" className="md-pill" onClick={() => revealDir().catch(err => toast(err.message, { error: true }))}>
          <Icon name="folder" size={14} />{t('打开工作区')}
        </button>
      </header>

      <section className="md-data-summary">
        <div><b>{files === null ? '—' : files.length}</b><span>{t('份数据')}</span></div>
        <div><b>{files === null ? '—' : size(total)}</b><span>{t('一共')}</span></div>
        <div><b>{latest ? fmtWhen(latest.updatedAt) : '—'}</b><span>{t('最近更新')}</span></div>
      </section>

      <section className="md-create-input">
        <label className="md-field">
          <span>{t('把后台数据粘进来（一行一条也行，随便什么格式）')}</span>
          <textarea rows={4} value={paste} onChange={event => setPaste(event.target.value)} placeholder={t('日期,平台,播放,私信,加微,约试听\n2026-11-24,抖音,5000,6,4,1')} />
        </label>
        <div className="md-create-actions">
          <span className="md-muted">{t('存成 数据/<日期>.csv，助教下次分析就能读到它。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill" onClick={save} disabled={!paste.trim() || saving}>
            <Icon name="save" size={14} />{saving ? t('保存中…') : t('存成数据文件')}
          </button>
        </div>
      </section>

      <section className="md-create-input">
        <div className="md-create-actions">
          <span className="md-muted">{t('点「分析」会跳到对话，让助教读 数据/ 文件夹里的文件，回答哪条真带人、哪条白拍了、下一步该改什么。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-primary" onClick={analyze}>
            <Icon name="chat" size={14} />{t('开始分析')}
          </button>
        </div>
      </section>

      {files === null ? <p className="md-muted">{t('读取中…')}</p> : null}

      {files?.length === 0 ? (
        <div className="md-works-empty">
          <p>{t('数据文件夹还是空的。把平台后台的数据复制成一份 CSV，存到 数据/ 里，或者直接粘给对话里的助教。')}</p>
        </div>
      ) : null}

      {files?.length ? (
        <ul className="md-works-list">
          {files.map((file, index) => (
            <li key={`${file.dir}-${file.name}-${index}`} className="md-work">
              <div className="md-work-head">
                <b>{file.name}</b>
                <span className="md-grow" />
                <small>{fmtWhen(file.updatedAt)}</small>
              </div>
              <div className="md-work-files"><code>{file.folder}</code><code>{size(file.size)}</code></div>
              <div className="md-work-actions">
                <button type="button" className="md-inline-link" onClick={() => revealDir(file.dir).catch(err => toast(err.message, { error: true }))}>{t('在文件夹里打开')}</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="md-works-path">{t('文件位置：~/Documents/Youtulh 工作台/数据/')}</p>
    </div>
  )
}
