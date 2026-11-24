// 我的产出：做过的东西都在这儿，文件真的落在本地，能打开文件夹、能看正文。
import React from 'react'
import { fetchWorks, removeOutput, revealOutput, setDesk, toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'
import { fmtWhen } from './util.js'

const KIND_LABEL = { script: '口播稿', dm: '私信话术', data: '复盘' }

export function WorksView() {
  useLang()
  const [works, setWorks] = React.useState(null)
  const [open, setOpen] = React.useState(null)
  const exportDir = useDesk(s => s.settings?.defaultExportDir)

  const load = () => fetchWorks().then(list => setWorks(list)).catch(err => toast(err.message, { error: true }))
  React.useEffect(() => { load() }, [])

  const remove = async (id) => {
    await removeOutput(id).catch(err => toast(err.message, { error: true }))
    toast(t('已从产出库移除（文件还在）'))
    load()
  }

  return (
    <div className="md-page md-works">
      <header className="md-page-head">
        <div>
          <h1>{t('我的产出')}</h1>
          <p className="md-page-sub">{t('保存过的都会写成本地文件：一份 Word，一份 Markdown。')}</p>
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" className="md-pill" onClick={() => revealOutput().catch(err => toast(err.message, { error: true }))}>
          <Icon name="folder" size={14} />{t('打开文件夹')}
        </button>
      </header>

      {works === null ? <p className="md-muted">{t('读取中…')}</p> : null}

      {works?.length === 0 ? (
        <div className="md-works-empty">
          <p>{t('还没有产出。去「做内容」生成一条，点「保存成 Word」，这里就会出现。')}</p>
          <button type="button" className="md-pill is-primary" onClick={() => setDesk({ view: 'content', focusId: null })}>{t('去做内容')}</button>
        </div>
      ) : null}

      <ul className="md-works-list">
        {(works ?? []).map(work => (
          <li key={work.id} className={`md-work ${work.missing ? 'is-missing' : ''}`}>
            <div className="md-work-head">
              <span className="md-work-kind">{t(KIND_LABEL[work.kind] ?? work.kind)}</span>
              <b>{work.title}</b>
              <span className="md-grow" />
              <small>{fmtWhen(work.updatedAt)}</small>
            </div>
            <div className="md-work-files">
              {work.files.map(name => <code key={name}>{name}</code>)}
              {work.missing ? <span className="md-work-missing">{t('文件已不在（可能被移动或删除）')}</span> : null}
            </div>
            {work.summary ? <p className="md-work-summary">{work.summary}</p> : null}
            <div className="md-work-actions">
              <button type="button" className="md-inline-link" onClick={() => setOpen(open === work.id ? null : work.id)}>{open === work.id ? t('收起') : t('看正文')}</button>
              <button type="button" className="md-inline-link" onClick={() => revealOutput(work.id).catch(err => toast(err.message, { error: true }))}>{t('在文件夹里打开')}</button>
              <button type="button" className="md-inline-link" onClick={() => remove(work.id)}>{t('移除')}</button>
            </div>
            {open === work.id ? <pre className="md-work-content">{work.content || t('（这份没有留下正文预览）')}</pre> : null}
          </li>
        ))}
      </ul>

      {exportDir ? <p className="md-works-path">{t('文件位置：{dir}', { dir: exportDir })}</p> : null}
    </div>
  )
}
