// 回私信：这里只负责收原文，判断和话术交给对话里的助教；线索表是工作区里的 CSV。
import React from 'react'
import { fetchLeadsWithLessons, fetchWorkspace, profileSummary, revealDir, toast, updateLead, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { launchFailedToast, startChat } from './launch.js'
import { Icon } from './ui.jsx'
import { REACTIONS, RESULTS } from './util.js'

export function DmView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const [raw, setRaw] = React.useState('')
  const [root, setRoot] = React.useState('')
  const summary = profileSummary({ positioning, painPoints: pains })
  React.useEffect(() => { fetchWorkspace().then(info => setRoot(info.root)).catch(() => {}) }, [])
  const [leads, setLeads] = React.useState([])
  const [lessons, setLessons] = React.useState([])
  const reload = React.useCallback(() => {
    fetchLeadsWithLessons().then(({ leads: rows, lessons: hints }) => { setLeads(rows); setLessons(hints) }).catch(() => {})
  }, [])
  React.useEffect(() => { reload() }, [reload])

  const mark = async (lead, patch) => {
    try {
      const result = await updateLead(lead.rowIndex, patch)
      setLeads(result.leads ?? [])
      setLessons(result.lessons ?? [])
    } catch (err) {
      toast(err.message, { error: true })
    }
  }

  const launch = () => {
    if (!startChat('dm', { raw, root, profile: summary, lessons })) launchFailedToast(toast)
  }
  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => toast(t('已复制')), () => toast(t('复制失败，手动选中吧'), { error: true }))
  }

  return (
    <div className="md-page md-dm">
      <header className="md-page-head">
        <div>
          <h1>{t('回私信')}</h1>
          <p className="md-page-sub">{t('粘一条家长私信，交给对话里的助教：他判断是谁、问什么，给两条话术（第二条引导加微信），再把台账存进线索表。')}</p>
        </div>
      </header>

      {summary ? <p className="md-profile-line"><Icon name="user" size={13} />{t('按你的设定：{summary}', { summary })}</p> : null}

      {lessons.length ? (
        <div className="md-lessons">
          <b>{t('已经加到微信的经验')}</b>
          <ul>{lessons.map(row => <li key={row}>{row}</li>)}</ul>
          <small>{t('点「开始」时，这些会一起交给助教参考。')}</small>
        </div>
      ) : null}

      <section className="md-dm-input">
        <label className="md-field">
          <span>{t('私信原文')}</span>
          <textarea
            rows={4}
            value={raw}
            onChange={event => setRaw(event.target.value)}
            placeholder={t('老师你好，我孩子高一，化学期中才 58 分，还能补上来吗？')}
          />
        </label>
        <div className="md-dm-actions">
          <span className="md-muted">{t('点下面的按钮，会跳到对话并把私信填好，按回车就开始。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-primary" onClick={launch} disabled={!raw.trim()}>
            <Icon name="chat" size={14} />{t('开始')}
          </button>
        </div>
      </section>

      <section className="md-tile md-dm-leads">
        <header className="md-tile-head">
          <h2>{t('线索表')}</h2>
          <span className="md-tile-meta">{t('{n} 条 · 工作区里的 线索表.csv', { n: leads.length })}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-small" onClick={() => revealDir().catch(err => toast(err.message, { error: true }))}>
            <Icon name="folder" size={13} />{t('打开工作区')}
          </button>
        </header>
        {leads.length ? (
          <div className="md-i-table">
            <table className="md-table is-plain">
              <thead><tr><th>{t('日期')}</th><th>{t('家长')}</th><th>{t('卡点')}</th><th>{t('家长反应')}</th><th>{t('结果')}</th><th /></tr></thead>
              <tbody>
                {leads.map(lead => (
                  <tr key={`${lead.date}-${lead.name}-${lead.raw.slice(0, 8)}`}>
                    <td>{lead.date}</td>
                    <td>{lead.name || lead.grade || <span className="md-muted">{t('未填')}</span>}</td>
                    <td className="md-dm-wrap">{lead.painPoint || '—'}</td>
                    <td>
                      <select value={lead.reaction || ''} onChange={event => mark(lead, { reaction: event.target.value })}>
                        <option value="">{t('还没回')}</option>
                        {REACTIONS.filter(row => row !== '没回').map(row => <option key={row} value={row}>{t(row)}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={lead.result || '待定'} onChange={event => mark(lead, { result: event.target.value })}>
                        {RESULTS.map(row => <option key={row} value={row}>{t(row)}</option>)}
                      </select>
                    </td>
                    <td className="is-num"><button type="button" className="md-inline-link" onClick={() => copy(lead.raw)}>{t('复制原文')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="md-muted md-dm-empty">{t('还没有线索。粘第一条私信交给助教，他会把台账写进 线索表.csv。')}</p>}
      </section>
    </div>
  )
}
