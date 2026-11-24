// 回私信：粘一条私信 → 页内判断 + 两条话术 → 挑一条改成自己的 → 连同台账写进线索表。
// 不出页面；想深聊再去对话。线索表就在下面，能筛、能搜、能改下一步。
import React from 'react'
import { addChatCase, appendLeadRow, draftDm, fetchChatRecords, fetchLeadsWithLessons, fetchWorkspace, logChat, profileSummary, revealDir, setDesk, toast, updateChatLog, updateLead, useDesk } from './desk.js'
import { launchFailedToast, startChat } from './launch.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'
import { CHANNELS, LEAD_CATEGORIES, LEAD_STAGES, LEAD_TYPES, REACTIONS, RESULTS } from './util.js'

const FILTERS = [
  { id: 'all', label: '全部', test: () => true },
  { id: 'lead', label: '私信', test: lead => lead.stage === '私信' },
  { id: 'wechat', label: '已加微信', test: lead => lead.stage === '已加微信' || lead.stage === '已进群' },
  { id: 'trial', label: '约试听', test: lead => lead.stage === '约试听' },
  { id: 'paid', label: '已报课', test: lead => lead.stage === '已报课' },
]

const EMPTY_FIELDS = { name: '', grade: '', school: '', painPoint: '', source: '' }

export function DmView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const summary = profileSummary({ positioning, painPoints: pains })
  const [root, setRoot] = React.useState('')
  const [raw, setRaw] = React.useState('')
  const [channel, setChannel] = React.useState('平台私信')
  const [history, setHistory] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [result, setResult] = React.useState(null)
  const [chosen, setChosen] = React.useState(0)
  const [fields, setFields] = React.useState(EMPTY_FIELDS)
  const [draftText, setDraftText] = React.useState('')
  const [stage, setStage] = React.useState('私信')
  const [leads, setLeads] = React.useState([])
  const [lessons, setLessons] = React.useState([])
  const [filter, setFilter] = React.useState('all')
  const [query, setQuery] = React.useState('')
  const [openDraft, setOpenDraft] = React.useState(-1)
  const [draftEdit, setDraftEdit] = React.useState('')
  const [chats, setChats] = React.useState([])
  const [chatFilter, setChatFilter] = React.useState('all')
  const [chatPerson, setChatPerson] = React.useState('')
  const [openChat, setOpenChat] = React.useState(-1)

  React.useEffect(() => { fetchWorkspace().then(info => setRoot(info.root)).catch(() => {}) }, [])

  const reload = React.useCallback(() => {
    fetchLeadsWithLessons().then(({ leads: rows, lessons: hints }) => { setLeads(rows); setLessons(hints) }).catch(() => {})
  }, [])
  React.useEffect(() => { reload() }, [reload])

  const reloadChats = React.useCallback(() => {
    fetchChatRecords().then(data => setChats(data.rows ?? [])).catch(() => {})
  }, [])
  React.useEffect(() => { reloadChats() }, [reloadChats])

  const run = async () => {
    if (!raw.trim()) return
    setBusy('draft')
    try {
      const data = await draftDm(raw.trim(), channel, history)
      const judged = { ...data, type: data.type || LEAD_TYPES[0], category: data.category || LEAD_CATEGORIES[2] }
      setResult(judged)
      setChosen(0)
      setFields({ ...EMPTY_FIELDS, ...(data.fields ?? {}) })
      setDraftText(data.drafts?.[0]?.text ?? '')
      setStage('私信')
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const pick = (index) => {
    setChosen(index)
    setDraftText(result?.drafts?.[index]?.text ?? '')
  }

  const save = async () => {
    if (!result) return
    if (!draftText.trim()) return toast(t('先选一条话术'), { error: true })
    setBusy('save')
    try {
      const data = await appendLeadRow({ raw: raw.trim(), ...fields, type: result.type, category: result.category, draft: draftText, stage })
      setLeads(data.leads ?? [])
      setLessons(data.lessons ?? [])
      toast(t('记进线索表了'))
      setRaw('')
      setResult(null)
      setFields(EMPTY_FIELDS)
      setDraftText('')
      setStage('私信')
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const mark = async (lead, patch) => {
    try {
      const data = await updateLead(lead.rowIndex, patch)
      setLeads(data.leads ?? [])
      setLessons(data.lessons ?? [])
    } catch (err) { toast(err.message, { error: true }) }
  }

  const copy = (text) => {
    navigator.clipboard.writeText(text).then(() => toast(t('已复制')), () => toast(t('复制失败，手动选中吧'), { error: true }))
  }

  const chatStats = ['成交', '约试听', '加微', '流失']
    .map(result => ({ result, n: chats.filter(row => row.result === result).length }))
    .filter(item => item.n > 0)
  const chatRows = chats.slice().reverse()
    .filter(row => (chatFilter === 'all' || row.channel === chatFilter) && (!chatPerson || row.name === chatPerson))
  // 只看一个人时按时间正序，读起来像一条时间线
  if (chatPerson) chatRows.reverse()
  const chatLimit = chatPerson ? 50 : 20

  const filtered = leads.filter(lead => {
    const pass = (FILTERS.find(row => row.id === filter) ?? FILTERS[0]).test(lead)
    const q = query.trim()
    const hit = !q || [lead.name, lead.grade, lead.painPoint, lead.raw].some(value => String(value ?? '').includes(q))
    return pass && hit
  })
  const countOf = (id) => leads.filter(lead => (FILTERS.find(row => row.id === id) ?? FILTERS[0]).test(lead)).length

  return (
    <div className="md-page md-dm">
      <header className="md-page-head">
        <div>
          <h1>{t('回私信')}</h1>
          <p className="md-page-sub">{t('平台私信先接住、一两句挪到私信；微信里再给判断、约诊断或试听。挑一句话发出去，顺手记一笔，后面才有的复盘。')}</p>
        </div>
      </header>

      {summary ? <p className="md-profile-line"><Icon name="user" size={13} />{t('按你的设定：{summary}', { summary })}</p> : null}

      {lessons.length ? (
        <div className="md-lessons">
          <b>{t('已经加到微信的经验')}</b>
          <ul>{lessons.map(row => <li key={row}>{row}</li>)}</ul>
          <small>{t('判断这条私信时，这些会一起交给它参考。')}</small>
        </div>
      ) : null}

      <section className="md-dm-input">
        <div className="md-channel-tabs">
          {CHANNELS.map(item => (
            <button type="button" key={item} className={channel === item ? 'is-on' : ''} onClick={() => setChannel(item)}>
              {t(item)}
            </button>
          ))}
          <span className="md-grow" />
          <button type="button" className="md-inline-link" onClick={() => setDesk({
            dialog: {
              title: t('导入一段人工聊天案例'),
              submitLabel: t('存进案例库'),
              initial: { channel, result: '成交' },
              fields: [
                { name: 'channel', label: t('渠道'), type: 'select', options: CHANNELS.map(value => ({ value, label: t(value) })) },
                { name: 'scene', label: t('这段是在聊什么'), placeholder: t('比如：家长问价格怎么办') },
                { name: 'result', label: t('最后结果'), type: 'select', options: ['加微', '约试听', '成交', '流失', '未定'].map(value => ({ value, label: t(value) })) },
                { name: 'text', label: t('把对话粘进来（谁说的都保留）'), type: 'textarea', rows: 6, required: true },
              ],
              onSubmit: values => {
                addChatCase(values).then(() => toast(t('案例存好了，以后给建议会参考'))).catch(err => toast(err.message, { error: true }))
              },
            },
          })}>{t('导入案例')}</button>
        </div>
        {history ? (
          <div className="md-dm-context">
            <span>{t('接着上一轮聊：')}</span>
            <p>{history}</p>
            <button type="button" className="md-inline-link" onClick={() => setHistory('')}>{t('清除上下文')}</button>
          </div>
        ) : null}
        <label className="md-field">
          <span>{channel === '微信' ? t('对方最后一句（可以把前面几句一起粘）') : t('对方在平台上的最后一句（或几条）')}</span>
          <textarea
            rows={4}
            value={raw}
            onChange={event => setRaw(event.target.value)}
            placeholder={channel === '微信'
              ? t('老师，一节课多少钱？孩子高二物理四十多分，还来得及吗？')
              : t('老师你好，我孩子高一，化学期中才 58 分，还能补上来吗？')}
          />
        </label>
        <div className="md-dm-actions">
          <span className="md-muted">{t('点「判断一下」就在这页出结果，不用跳到对话。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-primary" onClick={run} disabled={!raw.trim() || busy === 'draft'}>
            <Icon name="chat" size={14} />{busy === 'draft' ? t('正在判断…') : t('判断一下')}
          </button>
        </div>
      </section>

      {result ? (
        <section className="md-tile md-dm-card">
          <header className="md-tile-head">
            <h2>{t('判断')}</h2>
            <span className="md-dm-chips">
              <b>{result.type || t('没判断出来')}</b>
              <b className="is-3">{result.category || t('未分类')}</b>
              {result.judge ? <span className="md-dm-judge">{result.judge}</span> : null}
            </span>
            <span className="md-grow" />
            {result.source === 'local'
              ? <span className="md-source is-local">{t('本地兜底 · 模型没通')}</span>
              : <span className="md-source">{t('模型生成')}</span>}
            <button type="button" className="md-inline-link" onClick={() => {
              if (!startChat('dm', { raw, root, profile: summary, lessons, drafts: (result.drafts ?? []).map(row => row.text) })) launchFailedToast(toast)
            }}>{t('去对话里深聊')}</button>
          </header>

          <ul className="md-dm-drafts">
            {(result.drafts ?? []).map((draft, index) => (
              <li key={`${draft.tag}-${index}`} className={chosen === index ? 'is-used' : ''}>
                <span className="md-dm-tag">{draft.tag || t('第 {n} 条', { n: index + 1 })}</span>
                <p>{draft.text}</p>
                <div className="md-dm-draft-actions">
                  <button type="button" className={`md-pill is-small ${chosen === index ? 'is-primary' : ''}`} onClick={() => pick(index)}>{chosen === index ? t('用这条') : t('用这条')}</button>
                  <button type="button" className="md-inline-link" onClick={() => copy(draft.text)}>{t('复制')}</button>
                  <button type="button" className="md-inline-link" onClick={async () => {
                    try {
                      await logChat({
                        channel, name: fields.name || result.fields?.name || '', incoming: raw.trim(),
                        outgoing: draft.text, stage: result.stage || (channel === '微信' ? '成交' : '引流'), result: '未定',
                      })
                      toast(t('记进对话记录了'))
                      reloadChats()
                    } catch (err) { toast(err.message, { error: true }) }
                  }}>{t('我发了，记一笔')}</button>
                </div>
              </li>
            ))}
          </ul>

          <div className="md-dm-ledger">
            <div className="md-dm-ledger-grid">
              {[['name', '姓名'], ['grade', '年级'], ['school', '学校'], ['painPoint', '卡点'], ['source', '来源']].map(([key, label]) => (
                <label className="md-field" key={key}>
                  <span>{t(label)}</span>
                  <input value={fields[key] ?? ''} placeholder={t('没提就空着')} onChange={event => setFields(prev => ({ ...prev, [key]: event.target.value }))} />
                </label>
              ))}
            </div>
            <label className="md-field">
              <span>{t('实际发出去的话术（可以改）')}</span>
              <textarea rows={3} value={draftText} onChange={event => setDraftText(event.target.value)} />
            </label>
            <div className="md-dm-actions">
              <label className="md-dm-field">
                <span>{t('阶段')}</span>
                <select value={stage} onChange={event => setStage(event.target.value)}>
                  {LEAD_STAGES.map(option => <option key={option} value={option}>{t(option)}</option>)}
                </select>
              </label>
              <label className="md-dm-field">
                <span>{t('类型')}</span>
                <select value={result.type} onChange={event => setResult(prev => ({ ...prev, type: event.target.value }))}>
                  {LEAD_TYPES.map(option => <option key={option} value={option}>{t(option)}</option>)}
                </select>
              </label>
              <label className="md-dm-field">
                <span>{t('分类')}</span>
                <select value={result.category} onChange={event => setResult(prev => ({ ...prev, category: event.target.value }))}>
                  {LEAD_CATEGORIES.map(option => <option key={option} value={option}>{t(option)}</option>)}
                </select>
              </label>
              <span className="md-grow" />
              <button type="button" className="md-pill is-primary" onClick={save} disabled={busy === 'save'}>
                {busy === 'save' ? t('保存中…') : t('记进线索表')}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="md-tile md-dm-leads">
        <header className="md-tile-head">
          <h2>{t('线索表')}</h2>
          <span className="md-tile-meta">{t('{n} 条 · 工作区里的 线索表.csv', { n: leads.length })}</span>
          <span className="md-grow" />
          <button type="button" className="md-inline-link" onClick={() => setDesk({ view: 'students', focusId: null })}>{t('看漏斗 →')}</button>
          <button type="button" className="md-pill is-small" onClick={() => revealDir().catch(err => toast(err.message, { error: true }))}>
            <Icon name="folder" size={13} />{t('打开工作区')}
          </button>
        </header>

        <div className="md-lead-tools">
          <div className="md-lead-tabs">
            {FILTERS.map(row => (
              <button type="button" key={row.id} className={filter === row.id ? 'is-on' : ''} onClick={() => setFilter(row.id)}>
                {t(row.label)}<em>{countOf(row.id)}</em>
              </button>
            ))}
          </div>
          <span className="md-grow" />
          <input className="md-lead-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('搜家长、卡点、原话')} />
        </div>

        {leads.length === 0 ? (
          <p className="md-muted md-dm-empty">{t('还没有线索。粘第一条私信，判断完记进线索表，这里就会多一行。')}</p>
        ) : filtered.length === 0 ? (
          <p className="md-muted md-dm-empty">{t('这个筛选下没有线索。')}</p>
        ) : (
          <ul className="md-lead-list">
            {filtered.map(lead => (
              <li className="md-lead" key={`${lead.rowIndex}-${lead.date}-${lead.raw.slice(0, 8)}`}>
                <div className="md-lead-head">
                  <b>{lead.name || lead.grade || t('未填')}</b>
                  <span className="md-lead-date">{lead.date}</span>
                  {lead.type || lead.category ? <span className="md-lead-kind">{[lead.type, lead.category].filter(Boolean).join(' · ')}</span> : null}
                  {lead.nextAt || lead.followUps ? (
                    <span className="md-lead-follow">{lead.nextAt ? t('下次跟进 {date}', { date: lead.nextAt }) : t('还没定下次跟进')}{lead.followUps ? t(' · 已跟 {n} 次', { n: lead.followUps }) : ''}</span>
                  ) : null}
                  <span className="md-grow" />
                  <span className={`md-lead-next ${lead.next === '待跟进' || lead.next === '待加微' ? 'is-todo' : ''}`}>{lead.next}</span>
                </div>
                {lead.painPoint ? <p className="md-lead-pain">{lead.painPoint}</p> : null}
                <div className="md-lead-actions">
                  <label className="md-lead-field">
                    <span>{t('家长反应')}</span>
                    <select value={lead.reaction || ''} onChange={event => mark(lead, { reaction: event.target.value })}>
                      <option value="">{t('还没回')}</option>
                      {REACTIONS.filter(row => row !== '没回').map(row => <option key={row} value={row}>{t(row)}</option>)}
                    </select>
                  </label>
                  <label className="md-lead-field">
                    <span>{t('结果')}</span>
                    <select value={lead.result || '待定'} onChange={event => mark(lead, { result: event.target.value })}>
                      {RESULTS.map(row => <option key={row} value={row}>{t(row)}</option>)}
                    </select>
                  </label>
                  <label className="md-lead-field">
                    <span>{t('阶段')}</span>
                    <select value={lead.stage || '私信'} onChange={event => mark(lead, { stage: event.target.value })}>
                      {LEAD_STAGES.map(row => <option key={row} value={row}>{t(row)}</option>)}
                    </select>
                  </label>
                  <label className="md-lead-field md-lead-next-input">
                    <span>{t('下一步做什么')}</span>
                    <input
                      defaultValue={lead.next || ''}
                      placeholder={t('周四晚 8 点试听')}
                      onBlur={event => { if (event.target.value !== (lead.next || '')) mark(lead, { next: event.target.value }) }}
                    />
                  </label>
                  <button type="button" className="md-inline-link" onClick={() => {
                    if (openDraft === lead.rowIndex) return setOpenDraft(-1)
                    setOpenDraft(lead.rowIndex)
                    setDraftEdit(lead.draft || '')
                  }}>
                    {openDraft === lead.rowIndex ? t('收起话术') : t('看话术')}
                  </button>
                  <button type="button" className="md-inline-link" onClick={() => copy(lead.raw)}>{t('复制原文')}</button>
                </div>
                {openDraft === lead.rowIndex ? (
                  <div className="md-lead-draft">
                    <textarea rows={3} value={draftEdit} onChange={event => setDraftEdit(event.target.value)} placeholder={t('这条还没记话术')} />
                    <div className="md-lead-draft-foot">
                      <span className="md-muted">{t('话术会写回 线索表.csv，加到微信的经验也从这里来。')}</span>
                      <span className="md-grow" />
                      <button type="button" className="md-pill is-small" onClick={() => mark(lead, { draft: draftEdit })}>{t('保存话术')}</button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="md-tile md-chat-log">
        <header className="md-tile-head">
          <h2>{t('最近对话')}</h2>
          <span className="md-tile-meta">{t('{n} 轮 · 标了结果，下一句会参考', { n: chats.length })}</span>
          {chatStats.length ? (
            <span className="md-chat-stats">
              {chatStats.map(item => <em key={item.result} className={`is-${item.result === '流失' ? 'lost' : 'won'}`}>{t(item.result)} {item.n}</em>)}
            </span>
          ) : null}
          <span className="md-grow" />
          <div className="md-lead-tabs">
            {[['all', '全部'], ['平台私信', '平台私信'], ['微信', '微信']].map(([id, label]) => (
              <button type="button" key={id} className={chatFilter === id ? 'is-on' : ''} onClick={() => setChatFilter(id)}>{t(label)}</button>
            ))}
          </div>
          {chatPerson ? (
            <button type="button" className="md-chat-person" onClick={() => setChatPerson('')}>
              {t('只看 {name}', { name: chatPerson })}<span>×</span>
            </button>
          ) : null}
        </header>
        {chats.length === 0 ? (
          <div className="md-works-empty">
            <p>{t('还没有对话记录。给出一句建议后点「我发了，记一笔」，这里就会多一轮。')}</p>
            <button type="button" className="md-pill" onClick={() => document.querySelector('.md-dm-input textarea')?.focus()}>{t('去写第一句')}</button>
          </div>
        ) : (
          <ul className="md-chat-list">
            {chatRows.slice(0, chatLimit).map(row => (
              <li key={row.rowIndex} className={`md-chat-row ${['成交', '加微', '约试听'].includes(row.result) ? 'is-won' : row.result === '流失' ? 'is-lost' : ''}`}>
                <header>
                  <span className={`md-chat-channel ${row.channel === '微信' ? 'is-wechat' : ''}`}>{t(row.channel)}</span>
                  {row.name ? <button type="button" className="md-inline-link" onClick={() => setChatPerson(row.name)}>{row.name}</button> : null}
                  <span className="md-muted">{row.date} {row.stage ? `· ${t(row.stage)}` : ''}</span>
                  <span className="md-grow" />
                  <button type="button" className="md-inline-link" onClick={() => {
                    setChannel(row.channel)
                    setHistory(`${t('对方')}：${row.incoming}${row.outgoing ? `\n${t('我方')}：${row.outgoing}` : ''}`)
                    setRaw('')
                    toast(t('已带入上一轮，粘对方的新消息就行'))
                  }}>{t('接着聊')}</button>
                  <select value={row.result || '未定'} onChange={event => {
                    updateChatLog(row.rowIndex, { result: event.target.value })
                      .then(data => {
                        setChats(data.rows ?? [])
                        if (data.leads) setLeads(data.leads)
                        if (data.studentCreated) toast(t('成交，顺手建了学生档案'))
                        else if (['加微', '约试听', '成交'].includes(event.target.value) && data.leads) toast(t('结果记下了，线索阶段也一起更新'))
                      })
                      .catch(err => toast(err.message, { error: true }))
                  }}>
                    {['未定', '加微', '约试听', '成交', '流失'].map(value => <option key={value} value={value}>{t(value)}</option>)}
                  </select>
                  {!chatPerson ? (
                    <button type="button" className="md-inline-link" onClick={() => setOpenChat(openChat === row.rowIndex ? -1 : row.rowIndex)}>
                      {openChat === row.rowIndex ? t('收起') : t('看全文')}
                    </button>
                  ) : null}
                </header>
                {openChat !== row.rowIndex && !chatPerson ? <p className="md-chat-preview">{`${row.incoming.slice(0, 40)} → ${row.outgoing.slice(0, 40)}`}</p> : null}
                {openChat === row.rowIndex || chatPerson ? (
                  <div className="md-chat-full">
                    <p><b>{t('对方')}</b>{row.incoming}</p>
                    <p><b>{t('我方')}</b>{row.outgoing}</p>
                    <button type="button" className="md-inline-link" onClick={() => copy(row.outgoing)}>{t('复制我方这句')}</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
