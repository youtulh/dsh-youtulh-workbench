// 看数据 = 内容库：每一条口播的真实结果（播放/涨粉/私信），自动打分、自动标爆款。
import React from 'react'
import { fetchContent, importData, revealDir, toast, updateContentRow, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { launchFailedToast, startChat } from './launch.js'
import { ADOPT_OPTIONS } from './util.js'
import { Icon } from './ui.jsx'

const num = value => Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0

export function DataView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const [rows, setRows] = React.useState(null)
  const [stats, setStats] = React.useState({ count: 0, hits: 0, views: 0, follows: 0, dms: 0 })
  const [lessons, setLessons] = React.useState('')
  const [paste, setPaste] = React.useState('')
  const [busy, setBusy] = React.useState('')

  const load = React.useCallback(() => {
    fetchContent()
      .then(data => { setRows(data.rows ?? []); setStats(data.stats ?? {}); setLessons(data.lessons ?? '') })
      .catch(err => toast(err.message, { error: true }))
  }, [])
  React.useEffect(() => { load() }, [load])

  const patch = async (row, key, value) => {
    try {
      await updateContentRow(row['目录'], { [key]: value })
      load()
    } catch (err) { toast(err.message, { error: true }) }
  }

  const analyze = () => {
    const hint = rows?.filter(row => row['私信'] || row['爆款'] === '是').slice(0, 5).map(row => row['标题']).join('、')
    if (!startChat('data', { files: hint ? [hint] : [], profile: t('内容库：{n} 条，爆款 {h} 条', { n: stats.count ?? 0, h: stats.hits ?? 0 }) })) launchFailedToast(toast)
  }

  const doImport = async () => {
    if (!paste.trim()) return
    setBusy('import')
    try {
      const result = await importData(paste)
      toast(t('匹配 {n} 条，没对上 {m} 条', { n: result.matched ?? 0, m: (result.unmatched ?? []).length }))
      setPaste('')
      load()
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  return (
    <div className="md-page md-data">
      <header className="md-page-head">
        <div>
          <h1>{t('看数据')}</h1>
          <p className="md-page-sub">{t('每发一条就回来填一次：播放、涨粉、私信。填完自动打分，最好的那几条标成爆款，下次生成会参考它们。')}</p>
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" className="md-pill" onClick={() => revealDir().catch(err => toast(err.message, { error: true }))}>
          <Icon name="folder" size={14} />{t('打开工作区')}
        </button>
      </header>

      <section className="md-data-summary">
        <div><b>{stats.count ?? 0}</b><span>{t('条内容')}</span></div>
        <div><b>{stats.hits ?? 0}</b><span>{t('条爆款')}</span></div>
        <div><b>{stats.follows || '—'}</b><span>{t('总涨粉')}</span></div>
        <div><b>{stats.dms || '—'}</b><span>{t('总私信')}</span></div>
      </section>

      {lessons ? (
        <div className="md-lessons">
          <b>{t('现在的经验')}</b>
          <pre className="md-lessons-pre">{lessons.trim()}</pre>
        </div>
      ) : null}

      <section className="md-create-input">
        <label className="md-field">
          <span>{t('粘贴平台数据（第一行可以是表头：标题,播放,涨粉,私信）')}</span>
          <textarea rows={4} value={paste} onChange={event => setPaste(event.target.value)} placeholder={'标题,播放,涨粉,私信\n期中 58 分还能补吗,5200,18,6'} />
        </label>
        <div className="md-create-actions">
          <span className="md-muted">{t('按标题对上内容库里的那一条；对不上的会告诉你。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill" onClick={doImport} disabled={!paste.trim() || busy === 'import'}>
            {busy === 'import' ? t('匹配中…') : t('导入数据')}
          </button>
          <button type="button" className="md-pill is-primary" onClick={analyze}>
            <Icon name="chat" size={14} />{t('让助教分析')}
          </button>
        </div>
      </section>

      {rows === null ? <p className="md-muted">{t('读取中…')}</p> : null}

      {rows?.length === 0 ? (
        <div className="md-works-empty">
          <p>{t('内容库还是空的。先去「做内容」生成几条口播，发出去以后再回来填结果。')}</p>
        </div>
      ) : null}

      {rows?.length ? (
        <div className="md-i-table">
          <table className="md-table is-plain md-content-table">
            <thead>
              <tr>
                <th>{t('标题')}</th>
                <th>{t('采用')}</th>
                <th>{t('播放')}</th>
                <th>{t('涨粉')}</th>
                <th>{t('私信')}</th>
                <th>{t('分数')}</th>
                <th>{t('爆款')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row['目录'] || row['标题']}>
                  <td className="md-content-title">{row['标题']}<small>{row['选题']}</small></td>
                  <td>
                    <select value={row['采用'] || '未定'} onChange={event => patch(row, '采用', event.target.value)}>
                      {ADOPT_OPTIONS.map(option => <option key={option} value={option}>{t(option)}</option>)}
                    </select>
                  </td>
                  {['播放', '涨粉', '私信'].map(key => (
                    <td key={key} className="is-num">
                      <input
                        className="md-cell-input"
                        defaultValue={row[key] ?? ''}
                        placeholder="—"
                        onBlur={event => { if (event.target.value !== (row[key] ?? '')) patch(row, key, event.target.value) }}
                      />
                    </td>
                  ))}
                  <td className="is-num">{row['分数'] || '—'}</td>
                  <td>{row['爆款'] === '是' ? <b className="md-hit">{t('爆款')}</b> : row['爆款'] === '否' ? <span className="md-muted">{t('否')}</span> : <span className="md-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="md-works-path">{t('文件位置：{root}/内容库.csv（Excel 也能改）', { root: '~/Documents/Youtulh 工作台' })}</p>
      {!positioning.subject ? <p className="md-muted">{t('还没填设定，先去「我的设定」把科目和年级填上。')}</p> : null}
    </div>
  )
}
