// 我的产出：直接列工作区里的真实文件，不做二次索引。用户在 Finder 里怎么改，这里就怎么显示。
import React from 'react'
import { fetchTree, fetchWorkspace, fetchWorkspaceFile, revealDir, setDesk, toast } from './desk.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'
import { fmtWhen } from './util.js'

const KIND_LABEL = { content: '内容', dm: '私信', data: '数据' }

export function WorksView() {
  useLang()
  const [tree, setTree] = React.useState(null)
  const [info, setInfo] = React.useState(null)
  const [preview, setPreview] = React.useState(null)
  const view = async (item) => {
    if (preview?.dir === item.dir) return setPreview(null)
    const textFile = item.files.find(file => /\.(md|txt|csv)$/i.test(file.name))
    if (!textFile) return toast(t('这份只有 Word，点「在文件夹里打开」看'))
    try {
      const text = await fetchWorkspaceFile(item.dir, textFile.name)
      setPreview({ dir: item.dir, name: textFile.name, text })
    } catch (err) {
      toast(err.message, { error: true })
    }
  }

  const load = () => Promise.all([fetchTree(), fetchWorkspace()]).then(([nextTree, nextInfo]) => {
    setTree(nextTree)
    setInfo(nextInfo)
  }).catch(err => toast(err.message, { error: true }))

  React.useEffect(() => { load() }, [])

  const groups = ['content', 'dm', 'data'].map(kind => ({ kind, items: (tree ?? []).filter(row => row.kind === kind) }))

  return (
    <div className="md-page md-works">
      <header className="md-page-head">
        <div>
          <h1>{t('我的产出')}</h1>
          <p className="md-page-sub">{t('这些就是工作区里的文件，Word 能直接打开，改了这里也会跟着变。')}</p>
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" className="md-pill" onClick={() => revealDir().catch(err => toast(err.message, { error: true }))}>
          <Icon name="folder" size={14} />{t('打开工作区')}
        </button>
      </header>

      {tree === null ? <p className="md-muted">{t('读取中…')}</p> : null}

      {tree?.length === 0 ? (
        <div className="md-works-empty">
          <p>{t('工作区还是空的。去「做内容」生成一条并保存，文件就会出现在这里。')}</p>
          <button type="button" className="md-pill is-primary" onClick={() => setDesk({ view: 'content', focusId: null })}>{t('去做内容')}</button>
        </div>
      ) : null}

      {groups.map(({ kind, items }) => items.length ? (
        <section key={kind} className="md-works-group">
          <h2>{t(KIND_LABEL[kind])}<small>{t('{n} 份', { n: items.length })}</small></h2>
          <ul className="md-works-list">
            {items.map(item => (
              <li key={item.dir + item.name} className="md-work">
                <div className="md-work-head">
                  <b>{item.name}</b>
                  <span className="md-grow" />
                  <small>{item.files[0]?.updatedAt ? fmtWhen(item.files[0].updatedAt) : ''}</small>
                </div>
                <div className="md-work-files">
                  {item.files.map(file => (
                    <code key={file.name}>{file.name}<em>{(file.size / 1024).toFixed(file.size > 1024 * 100 ? 0 : 1)} KB</em></code>
                  ))}
                </div>
                <div className="md-work-actions">
                  <button type="button" className="md-inline-link" onClick={() => view(item)}>{preview?.dir === item.dir ? t('收起正文') : t('看正文')}</button>
                  <button type="button" className="md-inline-link" onClick={() => revealDir(item.dir).catch(err => toast(err.message, { error: true }))}>{t('在文件夹里打开')}</button>
                </div>
                {preview?.dir === item.dir ? <pre className="md-work-content">{preview.text}</pre> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null)}

      {info?.root ? <p className="md-works-path">{t('工作区：{dir}', { dir: info.root })}</p> : null}
    </div>
  )
}
