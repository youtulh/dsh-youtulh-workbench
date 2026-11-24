// 线索漏斗：一条线索从私信走到报课，拖一下就换个阶段。
// 数据就是工作区里的 线索表.csv，页面只是换个看法。
import React from 'react'
import { appendLeadRow, convertLead, fetchLeadsWithLessons, setDesk, setLeadStage, toast, updateLead } from './desk.js'
import { t, useLang } from './i18n.js'
import { LEAD_CATEGORIES, LEAD_STAGES, dayKey } from './util.js'
import { Icon } from './ui.jsx'

const stageIndex = stage => (LEAD_STAGES.includes(stage) ? LEAD_STAGES.indexOf(stage) : 0)

export function FunnelPanel({ students = [], onChanged }) {
  useLang()
  const [leads, setLeads] = React.useState(null)
  const [busy, setBusy] = React.useState('')
  const [over, setOver] = React.useState('')
  const [open, setOpen] = React.useState(-1)

  const load = () => fetchLeadsWithLessons()
    .then(({ leads: rows }) => setLeads(rows))
    .catch(err => toast(err.message, { error: true }))
  React.useEffect(() => { load() }, [])

  const move = async (lead, stage) => {
    if (!lead || lead.stage === stage) return
    setBusy(`${lead.rowIndex}-${stage}`)
    try {
      const data = await setLeadStage(lead.rowIndex, stage)
      setLeads(data.leads ?? [])
      toast(t('挪到「{stage}」了', { stage: t(stage) }))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const save = async (lead, patch) => {
    setBusy(`save-${lead.rowIndex}`)
    try {
      const data = await updateLead(lead.rowIndex, patch)
      setLeads(data.leads ?? [])
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const convert = async (lead) => {
    setBusy(`convert-${lead.rowIndex}`)
    try {
      const data = await convertLead(lead.rowIndex)
      setLeads(data.leads ?? [])
      onChanged?.(data)
      toast(t('已转成学生，去学生档案补卡点层'))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const addLead = () => setDesk({
    dialog: {
      title: t('记一条线索'),
      submitLabel: t('记下'),
      initial: { stage: '私信', category: LEAD_CATEGORIES[2] },
      fields: [
        { name: 'name', label: t('家长称呼'), placeholder: t('没说的留空') },
        { name: 'grade', label: t('孩子年级'), placeholder: t('高一') },
        { name: 'school', label: t('学校'), placeholder: t('没说的留空') },
        { name: 'painPoint', label: t('卡点'), placeholder: t('物质的量不会算') },
        { name: 'source', label: t('来源'), placeholder: t('哪条视频带来的') },
        { name: 'category', label: t('分诊类型'), type: 'select', options: LEAD_CATEGORIES.map(value => ({ value, label: t(value) })) },
        { name: 'stage', label: t('阶段'), type: 'select', options: LEAD_STAGES.map(value => ({ value, label: t(value) })) },
        { name: 'next', label: t('下一步做什么'), placeholder: t('周四晚 8 点试听') },
      ],
      onSubmit: values => {
        appendLeadRow(values).then(data => { setLeads(data.leads ?? []); toast(t('记进线索表了')) }).catch(err => toast(err.message, { error: true }))
      },
    },
  })

  const converted = (lead) => students.some(row => row.name === (lead.name || lead.grade || '家长') && row.grade === (lead.grade || ''))

  if (leads === null) return <p className="md-muted md-dm-empty">{t('读取中…')}</p>

  const groups = LEAD_STAGES.map(stage => ({ stage, rows: leads.filter(lead => lead.stage === stage) }))

  return (
    <div className="md-pipeline-wrap">
      <div className="md-pipeline-tools">
        <span className="md-muted">{t('拖动卡片换阶段；也可以点开卡片用下拉改。')}</span>
        <span className="md-grow" />
        <span className="md-muted">{t('共 {n} 条', { n: leads.length })}</span>
        <button type="button" className="md-pill is-small is-primary" onClick={addLead}><Icon name="plus" size={13} />{t('记一条线索')}</button>
      </div>

      {leads.length === 0 ? (
        <div className="md-works-empty">
          <p>{t('还没有线索。回私信页判断完一条私信，或者点上面「记一条线索」。')}</p>
          <button type="button" className="md-pill" onClick={() => setDesk({ view: 'dm', focusId: null })}>{t('去回私信')}</button>
        </div>
      ) : (
        <div className="md-pipeline">
          {groups.map(({ stage, rows }) => (
            <div
              key={stage}
              className={`md-pipeline-col ${over === stage ? 'is-over' : ''}`}
              onDragOver={event => { event.preventDefault(); setOver(stage) }}
              onDragLeave={() => setOver(current => (current === stage ? '' : current))}
              onDrop={event => {
                event.preventDefault()
                setOver('')
                const index = Number(event.dataTransfer.getData('text/lead-index'))
                const lead = leads.find(row => row.rowIndex === index)
                move(lead, stage)
              }}
            >
              <header>
                <h3>{t(stage)}</h3>
                <em>{rows.length}</em>
              </header>
              <div className="md-pipeline-list">
                {rows.map(lead => (
                  <article
                    key={lead.rowIndex}
                    className={`md-pipeline-card ${open === lead.rowIndex ? 'is-open' : ''} ${lead.nextAt && lead.nextAt < dayKey(new Date()) && !['已报课', '流失'].includes(lead.stage) ? 'is-overdue' : ''}`}
                    draggable
                    onDragStart={event => event.dataTransfer.setData('text/lead-index', String(lead.rowIndex))}
                    onClick={() => setOpen(current => (current === lead.rowIndex ? -1 : lead.rowIndex))}
                  >
                    <b>{lead.name || lead.grade || t('未填')}{lead.name && lead.grade ? <small>{lead.grade}</small> : null}</b>
                    {lead.painPoint ? <p>{lead.painPoint}</p> : null}
                    <footer>
                      {lead.source ? <span className="md-pipeline-source">{lead.source}</span> : null}
                      <span className="md-grow" />
                      <time>{lead.updatedAt || lead.date}</time>
                    </footer>
                    {lead.nextAt || lead.followUps ? (
                      <p className={`md-pipeline-follow ${lead.nextAt && lead.nextAt < dayKey(new Date()) && !['已报课', '流失'].includes(lead.stage) ? 'is-overdue' : ''}`}>
                        {lead.nextAt ? t('下次跟进 {date}', { date: lead.nextAt }) : t('还没定下次跟进')}
                        {lead.followUps ? t(' · 已跟 {n} 次', { n: lead.followUps }) : ''}
                      </p>
                    ) : null}
                    {open === lead.rowIndex ? (
                      <div className="md-pipeline-more" onClick={event => event.stopPropagation()}>
                        {lead.raw ? <p className="md-muted">{t('原话：{raw}', { raw: lead.raw })}</p> : null}
                        {lead.next ? <p className="md-muted">{t('下一步：{next}', { next: lead.next })}</p> : null}
                        <div className="md-pipeline-edit">
                          <input defaultValue={lead.name || ''} placeholder={t('家长称呼')} onBlur={event => { if (event.target.value !== (lead.name || '')) save(lead, { name: event.target.value }) }} />
                          <input defaultValue={lead.grade || ''} placeholder={t('年级')} onBlur={event => { if (event.target.value !== (lead.grade || '')) save(lead, { grade: event.target.value }) }} />
                          <input className="is-wide" defaultValue={lead.painPoint || ''} placeholder={t('卡点')} onBlur={event => { if (event.target.value !== (lead.painPoint || '')) save(lead, { painPoint: event.target.value }) }} />
                        </div>
                        <label className="md-pipeline-follow-edit">
                          <span>{t('下次跟进')}</span>
                          <input type="date" value={lead.nextAt || ''} onChange={event => save(lead, { nextAt: event.target.value })} />
                          <em>{t('已跟 {n} 次', { n: lead.followUps || 0 })}</em>
                          <button type="button" className="md-inline-link" onClick={() => save(lead, { followUps: (lead.followUps || 0) + 1 })}>{t('记一次跟进')}</button>
                        </label>
                        <label className="md-pipeline-stage">
                          <span>{t('阶段')}</span>
                          <select value={lead.stage} onChange={event => move(lead, event.target.value)} disabled={busy.startsWith(`${lead.rowIndex}-`)}>
                            {LEAD_STAGES.map(value => <option key={value} value={value}>{t(value)}</option>)}
                          </select>
                        </label>
                        {stage === '已报课' ? (
                          converted(lead)
                            ? <span className="md-muted">{t('已经转成学生了')}</span>
                            : <button type="button" className="md-pill is-small is-primary" disabled={busy === `convert-${lead.rowIndex}`} onClick={() => convert(lead)}>
                                <Icon name="user" size={13} />{t('转成学生')}
                              </button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                ))}
                {rows.length === 0 ? <p className="md-pipeline-empty">{t('这一列还空着')}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="md-muted md-pipeline-hint">{t('阶段往前挪一格的建议：加了微信再聊细节；约了试听就记时间；报课了再转学生。')}</p>
    </div>
  )
}
