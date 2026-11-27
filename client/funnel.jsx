// 线索漏斗：一条线索从私信走到报课，拖一下就换个阶段。
// 数据就是工作区里的 线索表.csv，页面只是换个看法。
import React from 'react'
import { appendLeadRow, convertLead, fetchContent, fetchLeadsWithLessons, importLeads, removeLead, setDesk, setLeadStage, toast, updateLead } from './desk.js'
import { t, useLang } from './i18n.js'
import { LEAD_CATEGORIES, LEAD_STAGES, dayKey } from './util.js'
import { Icon } from './ui.jsx'

const stageIndex = stage => (LEAD_STAGES.includes(stage) ? LEAD_STAGES.indexOf(stage) : 0)

export function FunnelPanel({ students = [], onChanged }) {
  useLang()
  const [leads, setLeads] = React.useState(null)
  const [contentTitles, setContentTitles] = React.useState([])
  const [loadError, setLoadError] = React.useState('')
  const [refreshing, setRefreshing] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [sourceFilter, setSourceFilter] = React.useState('all')
  const [leadSort, setLeadSort] = React.useState('recent')
  const [busy, setBusy] = React.useState('')
  const [over, setOver] = React.useState('')
  const [open, setOpen] = React.useState(-1)

  const load = () => {
    setLoadError('')
    return Promise.all([fetchLeadsWithLessons(), fetchContent().catch(() => ({ rows: [] }))])
    .then(([{ leads: rows }, content]) => {
      setLeads(rows)
      setContentTitles((content.rows ?? []).map(row => row['标题']).filter(Boolean).slice(0, 60))
    })
    .catch(err => { setLoadError(err.message); toast(err.message, { error: true }) })
  }
  React.useEffect(() => { load() }, [])

  const move = async (lead, stage) => {
    if (!lead || lead.stage === stage) return
    setBusy(`${lead.rowIndex}-${stage}`)
    try {
      const data = await setLeadStage(lead.rowIndex, stage)
      let next = data.leads ?? []
      if (stage === '已报课') {
        // 报课就该进档案：拖到「已报课」和点「转成学生」做同一件事
        try {
          const converted = await convertLead(lead.rowIndex)
          next = converted.leads ?? next
          onChanged?.(converted)
          toast(t('已报课，并更新了学生档案'))
        } catch (err) {
          toast(t('已报课；学生档案没建成：{msg}', { msg: err.message }), { error: true })
        }
      } else {
        toast(t('挪到「{stage}」了', { stage: t(stage) }))
      }
      setLeads(next)
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

  const importLeadsDialog = () => setDesk({
    dialog: {
      title: t('从表格导入线索'),
      submitLabel: t('导入'),
      fields: [{
        name: 'raw', label: t('把 Excel / 表格里的线索粘进来'), type: 'textarea', rows: 8,
        placeholder: t('第一行是表头：日期、姓名、年级、卡点、来源、阶段、下次跟进'), required: true,
      }],
      onSubmit: values => {
        importLeads(values.raw)
          .then(data => {
            setLeads(data.leads ?? [])
            const bits = [t('导入了 {n} 条线索', { n: data.imported })]
            if (data.skipped) bits.push(t('跳过 {n} 条重复', { n: data.skipped }))
            if (data.undated) bits.push(t('{n} 条没写日期，按今天记', { n: data.undated }))
            toast(bits.join('；'))
          })
          .catch(err => toast(err.message, { error: true }))
      },
    },
  })

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
        { name: 'source', label: t('来源'), placeholder: t('哪条视频带来的'), list: 'funnel-content-titles' },
        { name: 'category', label: t('分诊类型'), type: 'select', options: LEAD_CATEGORIES.map(value => ({ value, label: t(value) })) },
        { name: 'stage', label: t('阶段'), type: 'select', options: LEAD_STAGES.map(value => ({ value, label: t(value) })) },
        { name: 'next', label: t('下一步做什么'), placeholder: t('周四晚 8 点试听') },
      ],
      datalists: [{ id: 'funnel-content-titles', options: contentTitles }],
      onSubmit: values => {
        appendLeadRow(values).then(data => { setLeads(data.leads ?? []); toast(t('记进线索表了')) }).catch(err => toast(err.message, { error: true }))
      },
    },
  })

  const converted = (lead) => students.some(row => row.name === (lead.name || lead.grade || '家长') && row.grade === (lead.grade || ''))

  if (leads === null) return <p className="md-muted md-dm-empty">{t('读取中…')}</p>

  const sources = [...new Set(leads.map(lead => String(lead.source ?? '').trim()).filter(Boolean))].slice(0, 80)
  const q = query.trim()
  const filtered = leads.filter(lead => (sourceFilter === 'all' || lead.source === sourceFilter)
    && (!q || [lead.name, lead.grade, lead.painPoint, lead.raw, lead.next, lead.source].some(value => String(value ?? '').includes(q))))
  const sorter = (a, b) => {
    if (leadSort === 'due') return String(a.nextAt || '9999').localeCompare(String(b.nextAt || '9999'))
    if (leadSort === 'followups') return (Number(b.followUps) || 0) - (Number(a.followUps) || 0)
    return String(b.date || '').localeCompare(String(a.date || ''))
  }
  const groups = LEAD_STAGES.map(stage => ({ stage, rows: filtered.filter(lead => lead.stage === stage).sort(sorter) }))

  return (
    <div className="md-pipeline-wrap">
      <div className="md-pipeline-tools">
        <span className="md-muted">{t('拖动卡片换阶段；也可以点开卡片用下拉改。')}</span>
        <button type="button" className="md-inline-link" disabled={refreshing} onClick={async () => {
          setRefreshing(true)
          try { await load(); toast(t('刷新好了')) }
          finally { setRefreshing(false) }
        }}>{refreshing ? t('刷新中…') : t('刷新线索')}</button>
        <span className="md-grow" />
        <input className="md-lead-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('搜姓名、年级、卡点、来源')} />
        <select className="md-case-result" value={leadSort} onChange={event => setLeadSort(event.target.value)}>
          <option value="recent">{t('最近')}</option>
          <option value="due">{t('最该跟进')}</option>
          <option value="followups">{t('跟过最多')}</option>
        </select>
        <select className="md-case-result" value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}>
          <option value="all">{t('全部来源')}</option>
          {sources.map(source => <option key={source} value={source}>{source}</option>)}
        </select>
        <span className="md-muted">{t('{n} / {total} 条', { n: filtered.length, total: leads.length })}</span>
        <button type="button" className="md-pill is-small" onClick={importLeadsDialog}>{t('导入线索')}</button>
        <button type="button" className="md-pill is-small is-primary" onClick={addLead}><Icon name="plus" size={13} />{t('记一条线索')}</button>
      </div>

      {loadError ? (
        <div className="md-load-error">
          <p>{t('读取失败：{msg}', { msg: loadError })}</p>
          <button type="button" className="md-pill is-small" onClick={load}>{t('重试')}</button>
        </div>
      ) : null}

      {leads.length === 0 ? (
        <div className="md-works-empty">
          <p>{t('还没有线索。点上面「记一条线索」，或粘贴聊天记录。')}</p>
          <button type="button" className="md-pill" onClick={importLeadsDialog}>{t('导入线索')}</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="md-dm-empty">
          <p className="md-muted">{t('这个筛选下没有线索。')}</p>
          <button type="button" className="md-pill is-small" onClick={() => { setQuery(''); setSourceFilter('all') }}>{t('清空筛选')}</button>
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
                    className={`md-pipeline-card ${open === lead.rowIndex ? 'is-open' : ''} ${lead.nextAt && lead.nextAt <= dayKey(new Date()) && !['已报课', '流失'].includes(lead.stage) ? 'is-overdue' : ''}`}
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
                      <p className={`md-pipeline-follow ${lead.nextAt && lead.nextAt <= dayKey(new Date()) && !['已报课', '流失'].includes(lead.stage) ? 'is-overdue' : ''}`}>
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
                        <button type="button" className="md-inline-link" onClick={async event => {
                          event.stopPropagation()
                          if (!window.confirm(t('删掉这条线索？对话记录和学生档案不会一起删。'))) return
                          try {
                            const data = await removeLead(lead.rowIndex)
                            setLeads(data.leads ?? [])
                            toast(t('线索删掉了'))
                          } catch (err) { toast(err.message, { error: true }) }
                        }}>{t('删除')}</button>
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
