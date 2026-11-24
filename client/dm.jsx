// 回私信：粘一条私信 → 页内判断 + 两条话术 → 挑一条改成自己的 → 连同台账写进线索表。
// 不出页面；想深聊再去对话。线索表就在下面，能筛、能搜、能改下一步。
import React from 'react'
import { addChatCase, appendLeadRow, convertLead, draftDm, fetchChatRecords, fetchContent, fetchLeadsWithLessons, fetchWorkspace, logChat, profileSummary, removeChatCase, revealDir, reviseDm, setDesk, toast, updateChatCase, updateChatLog, updateLead, useDesk } from './desk.js'
import { launchFailedToast, startChat } from './launch.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'
import { CHANNELS, LEAD_CATEGORIES, LEAD_STAGES, LEAD_TYPES, REACTIONS, RESULTS, dayKey } from './util.js'

const todayKey = () => dayKey(new Date())
const isDue = lead => Boolean(lead.nextAt) && lead.nextAt <= todayKey() && !['已报课', '流失'].includes(lead.stage)
// 拖了几天：0 表示今天到期
const daysLate = lead => (lead.nextAt ? Math.round((Date.parse(todayKey()) - Date.parse(lead.nextAt)) / 86400000) : 0)

const FILTERS = [
  { id: 'all', label: '全部', test: () => true },
  { id: 'due', label: '该跟进', test: isDue },
  { id: 'lead', label: '私信', test: lead => lead.stage === '私信' },
  { id: 'wechat', label: '已加微信', test: lead => lead.stage === '已加微信' || lead.stage === '已进群' },
  { id: 'trial', label: '约试听', test: lead => lead.stage === '约试听' },
  { id: 'paid', label: '已报课', test: lead => lead.stage === '已报课' },
]

const EMPTY_FIELDS = { name: '', grade: '', school: '', painPoint: '', source: '' }

// 新用户不知道粘什么的时候，点一条示例先看效果（随手能改）
const SCENARIOS = [
  { label: '问价格', platform: p => `老师，${p.grade}${p.subject}一对一怎么收费？`, wechat: () => '老师，一节课多少钱？' },
  { label: '能不能提分', platform: p => `孩子${p.grade}${p.subject}才考 58 分，还能补上来吗？`, wechat: p => `孩子${p.grade}${p.subject}四十多分，还来得及吗？` },
  { label: '怎么补', platform: () => '老师，物质的量这一块完全听不懂，该怎么补？', wechat: () => '我们报过班，成绩还是不动，您看该怎么弄？' },
  { label: '时间怎么排', platform: () => '周末能上课吗？我们平时没什么时间。', wechat: () => '周末能排课吗？孩子平时作业多。' },
]

// 粘了一半的消息和建议不要丢：切页面记得，刷新页面也记得
const DM_DRAFT_KEY = 'youtulh:dm:v1'
const DM_DRAFT_DEFAULT = {
  raw: '', channel: '平台私信', history: '', result: null, chosen: 0,
  fields: { ...EMPTY_FIELDS }, draftText: '', stage: '私信',
  chatFilter: 'all', chatPerson: '', chatResult: 'all', chatView: 'turns', peopleSort: 'recent', filter: 'all', query: '', caseQuery: '', caseFilter: 'all',
}
const DM_DRAFT = (() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DM_DRAFT_KEY) || 'null')
    return saved ? { ...DM_DRAFT_DEFAULT, ...saved, fields: { ...EMPTY_FIELDS, ...(saved.fields ?? {}) } } : { ...DM_DRAFT_DEFAULT }
  } catch {
    return { ...DM_DRAFT_DEFAULT }
  }
})()

export function DmView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const summary = profileSummary({ positioning, painPoints: pains })
  const [root, setRoot] = React.useState('')
  const [raw, setRaw] = React.useState(DM_DRAFT.raw)
  const [channel, setChannel] = React.useState(DM_DRAFT.channel)
  const [history, setHistory] = React.useState(DM_DRAFT.history)
  const [busy, setBusy] = React.useState('')
  const [result, setResult] = React.useState(DM_DRAFT.result)
  const [chosen, setChosen] = React.useState(DM_DRAFT.chosen)
  const [fields, setFields] = React.useState(DM_DRAFT.fields)
  const [draftText, setDraftText] = React.useState(DM_DRAFT.draftText)
  const [stage, setStage] = React.useState(DM_DRAFT.stage)
  const [leads, setLeads] = React.useState([])
  const [leadsReady, setLeadsReady] = React.useState(false)
  const [converted, setConverted] = React.useState({})
  const [lessons, setLessons] = React.useState([])
  const [filter, setFilter] = React.useState(DM_DRAFT.filter)
  const [query, setQuery] = React.useState(DM_DRAFT.query)
  const [openDraft, setOpenDraft] = React.useState(-1)
  const [draftEdit, setDraftEdit] = React.useState('')
  const [chats, setChats] = React.useState([])
  const [cases, setCases] = React.useState([])
  const [casesOpen, setCasesOpen] = React.useState(false)
  const [contentTitles, setContentTitles] = React.useState([])
  const [caseQuery, setCaseQuery] = React.useState(DM_DRAFT.caseQuery)
  const [caseFilter, setCaseFilter] = React.useState(DM_DRAFT.caseFilter)
  const [chatTotal, setChatTotal] = React.useState(0)
  const [chatsReady, setChatsReady] = React.useState(false)
  const [peopleSort, setPeopleSort] = React.useState(DM_DRAFT.peopleSort)
  const [reviseNote, setReviseNote] = React.useState('')
  const [reviseBusy, setReviseBusy] = React.useState(false)
  const [editDraft, setEditDraft] = React.useState(-1)
  const [editedDrafts, setEditedDrafts] = React.useState({})
  const [editText, setEditText] = React.useState('')
  const [chatFilter, setChatFilter] = React.useState(DM_DRAFT.chatFilter)
  const [chatPerson, setChatPerson] = React.useState(DM_DRAFT.chatPerson)
  const [chatResult, setChatResult] = React.useState(DM_DRAFT.chatResult)
  const [chatView, setChatView] = React.useState(DM_DRAFT.chatView)
  const dmPerson = useDesk(s => s.dmPerson)
  const dmFilter = useDesk(s => s.dmFilter)
  const dmCases = useDesk(s => s.dmCases)
  const prefilledPerson = React.useRef('')
  const autoHistoryFor = React.useRef('')
  const [openChat, setOpenChat] = React.useState(-1)
  const [chatShown, setChatShown] = React.useState(30)

  React.useEffect(() => {
    Object.assign(DM_DRAFT, { raw, channel, history, result, chosen, fields, draftText, stage, chatFilter, chatPerson, chatResult, chatView, peopleSort, filter, query, caseQuery, caseFilter })
    try { sessionStorage.setItem(DM_DRAFT_KEY, JSON.stringify(DM_DRAFT)) } catch { /* 隐私模式就算了 */ }
  }, [raw, channel, history, result, chosen, fields, draftText, stage, chatFilter, chatPerson, chatResult, chatView, peopleSort, filter, query, caseQuery, caseFilter])

  React.useEffect(() => { fetchWorkspace().then(info => setRoot(info.root)).catch(() => {}) }, [])
  React.useEffect(() => {
    fetchContent()
      .then(data => setContentTitles((data.rows ?? []).map(row => row['标题']).filter(Boolean).slice(0, 60)))
      .catch(() => {})
  }, [])

  const reload = React.useCallback(() => {
    fetchLeadsWithLessons()
      .then(({ leads: rows, lessons: hints }) => { setLeads(rows); setLessons(hints) })
      .catch(() => {})
      .finally(() => setLeadsReady(true))
  }, [])
  React.useEffect(() => { reload() }, [reload])

  const reloadChats = React.useCallback(() => {
    fetchChatRecords()
      .then(data => { setChats(data.rows ?? []); setChatTotal(data.total ?? (data.rows ?? []).length); setCases(data.cases ?? []) })
      .catch(() => {})
      .finally(() => setChatsReady(true))
  }, [])
  React.useEffect(() => { reloadChats() }, [reloadChats])

  // 从线索进来看某个人时，把上一轮对话带进上下文，接着聊不用重讲背景
  React.useEffect(() => {
    if (!chatPerson || history) return
    if (autoHistoryFor.current === chatPerson) return
    const mine = chats.filter(row => row.name === chatPerson)
    const last = mine[mine.length - 1]
    if (last) {
      autoHistoryFor.current = chatPerson
      setHistory(`${t('对方')}：${last.incoming}\n${t('我方')}：${last.outgoing}`)
    }
  }, [chatPerson, chats.length])

  // 从线索漏斗点「聊过 n 轮」过来：直接只看这个人，并滚到最近对话
  React.useEffect(() => {
    if (!dmCases) return
    setCasesOpen(true)
    setDesk({ dmCases: false })
    requestAnimationFrame(() => document.getElementById('dm-cases')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [dmCases])

  React.useEffect(() => {
    if (!dmFilter) return
    setFilter(dmFilter)
    setDesk({ dmFilter: '' })
    requestAnimationFrame(() => document.getElementById('dm-leads')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [dmFilter])

  React.useEffect(() => {
    if (!dmPerson) return
    setChatPerson(dmPerson)
    setChatView('turns')
    // 从线索/漏斗过来时，顺手把名字填进台账；换了人就覆盖，别把记录挂到上一个人名下
    setFields(prev => ({ ...prev, name: dmPerson }))
    setHistory('')
    if (prefilledPerson.current !== dmPerson) {
      prefilledPerson.current = dmPerson
      // 换了人：上一批建议、选中项、改稿都不再属于这个人
      setResult(null)
      setEditedDrafts({})
      setChosen(0)
      setReviseNote('')
      setRaw('')
    }
    setDesk({ dmPerson: '' })
    requestAnimationFrame(() => document.getElementById('dm-chat-log')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [dmPerson])

  const run = async () => {
    if (!raw.trim()) return
    setBusy('draft')
    try {
      const data = await draftDm(raw.trim(), channel, history)
      const judged = { ...data, type: data.type || LEAD_TYPES[0], category: data.category || LEAD_CATEGORIES[2] }
      setResult(judged)
      setEditedDrafts({})
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

  const revise = async () => {
    if (!result || !reviseNote.trim()) return
    setReviseBusy(true)
    try {
      const data = await reviseDm({
        channel, raw: raw.trim(), history,
        drafts: (result.drafts ?? []).map(row => row.text), note: reviseNote.trim(),
      })
      if (!data.drafts?.length) {
        toast(t('模型没通，这次没改；上一版还能用'), { error: true })
        return
      }
      setResult(prev => ({ ...prev, drafts: data.drafts, source: data.source ?? prev.source }))
      setEditedDrafts({})
      setChosen(0)
      setReviseNote('')
      toast(t('改好了，再看一眼'))
    } catch (err) { toast(err.message, { error: true }) }
    finally { setReviseBusy(false) }
  }

  const postpone = (lead, days) => {
    const at = new Date(Date.now() + days * 86400000)
    updateLead(lead.rowIndex, { nextAt: dayKey(at) })
      .then(data => { if (data.leads) setLeads(data.leads); toast(t('下次跟进顺延到 {date}', { date: dayKey(at) })) })
      .catch(err => toast(err.message, { error: true }))
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
  const leadOf = name => (name ? leads.find(row => row.name === name) : null)
  const filteredCases = (() => {
    const q = caseQuery.trim()
    return cases
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => (caseFilter === 'all' || (row.result || '未定') === caseFilter)
        && (!q || [row.scene, row.text].some(value => String(value ?? '').includes(q))))
  })()
  const leadChatCounts = (() => {
    const counts = {}
    for (const row of chats) if (row.name) counts[row.name] = (counts[row.name] ?? 0) + 1
    return counts
  })()
  const people = (() => {
    const map = new Map()
    for (const row of chats) {
      if (chatFilter !== 'all' && row.channel !== chatFilter) continue
      const key = row.name || ''
      const name = row.name || t('没写名字')
      const stamp = row.updatedAt || row.date || ''
      const item = map.get(key) ?? { key, name, turns: 0, lastDate: '', lastAt: '', lastResult: '', channel: row.channel, lastIncoming: '' }
      item.turns += 1
      if (stamp >= item.lastAt) {
        item.lastAt = stamp
        item.lastDate = row.date
        item.lastResult = row.result || '未定'
        item.lastIncoming = row.incoming || row.outgoing || ''
      }
      map.set(name, item)
    }
    const won = { 成交: 0, 约试听: 1, 加微: 2, 未定: 3, 流失: 4 }
    return [...map.values()].sort((a, b) => {
      if (peopleSort === 'turns') return b.turns - a.turns || String(b.lastAt).localeCompare(String(a.lastAt))
      if (peopleSort === 'result') return (won[a.lastResult] ?? 9) - (won[b.lastResult] ?? 9) || String(b.lastAt).localeCompare(String(a.lastAt))
      return String(b.lastAt).localeCompare(String(a.lastAt))
    })
  })()
  const chatRows = chats.slice().reverse()
    .filter(row => (chatFilter === 'all' || row.channel === chatFilter)
      && (chatResult === 'all' || (row.result || '未定') === chatResult)
      && (!chatPerson || row.name === chatPerson))
  // 只看一个人时按时间正序，读起来像一条时间线
  if (chatPerson) chatRows.reverse()
  React.useEffect(() => { setChatShown(30) }, [chatFilter, chatResult, chatPerson])
  const chatLimit = chatPerson ? 50 : chatShown

  const filtered = leads.filter(lead => {
    const pass = (FILTERS.find(row => row.id === filter) ?? FILTERS[0]).test(lead)
    const q = query.trim()
    const hit = !q || [lead.name, lead.grade, lead.painPoint, lead.raw, lead.next, lead.nextAt, lead.source].some(value => String(value ?? '').includes(q))
    return pass && hit
  }).sort((a, b) => {
    // 看「该跟进」时按日期从早到晚，越拖越久的人排前面
    if (filter !== 'due') return 0
    return String(a.nextAt || '9999').localeCompare(String(b.nextAt || '9999'))
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

      {!positioning.subject ? (
        <div className="md-warn">
          <b>{t('还没填设定')}</b>
          <span>{t('先告诉我科目和年级，下一句才像你说的话，不是通用话术。')}</span>
          <button type="button" className="md-pill is-small" onClick={() => setDesk({ view: 'setup', focusId: null })}>{t('去填设定')}</button>
        </div>
      ) : null}

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
            onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); run() } }}
            placeholder={channel === '微信'
              ? t('老师，一节课多少钱？孩子高二物理四十多分，还来得及吗？')
              : t('老师你好，我孩子高一，化学期中才 58 分，还能补上来吗？')}
          />
        </label>
        <div className="md-dm-scenarios">
          <span>{t('不知道粘什么？点一条示例：')}</span>
          {SCENARIOS.map(item => (
            <button type="button" key={item.label} className="md-chip" onClick={() => {
              const facts = { grade: positioning.grade || t('高一'), subject: positioning.subject || t('物理') }
              setRaw(channel === '微信' ? item.wechat(facts) : item.platform(facts))
            }}>{t(item.label)}</button>
          ))}
        </div>
        <div className="md-dm-actions">
          <span className="md-muted">{t('⌘ + Enter 直接给下一句；结果就在这页出，不用跳到对话。')}</span>
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
                {editedDrafts[index] ? <em className="md-dm-edited">{t('已改')}</em> : null}
                {editDraft === index ? (
                  <div className="md-dm-draft-edit">
                    <textarea rows={4} value={editText} onChange={event => setEditText(event.target.value)} />
                    <div className="md-dm-draft-actions">
                      <span className="md-muted">{t('改完这句，记一笔时存的就是改过的')}</span>
                      <span className="md-grow" />
                      <button type="button" className="md-inline-link" onClick={() => setEditDraft(-1)}>{t('取消')}</button>
                      <button type="button" className="md-pill is-small" onClick={() => {
                        setResult(prev => ({ ...prev, drafts: prev.drafts.map((row, at) => (at === index ? { ...row, text: editText } : row)) }))
                        setEditedDrafts(prev => ({ ...prev, [index]: true }))
                        setEditDraft(-1)
                        toast(t('改好了'))
                      }}>{t('保存这句')}</button>
                    </div>
                  </div>
                ) : (
                  <p>{draft.text}</p>
                )}
                <div className="md-dm-draft-actions">
                  <button type="button" className={`md-pill is-small ${chosen === index ? 'is-primary' : ''}`} onClick={() => pick(index)}>{chosen === index ? t('用这条') : t('用这条')}</button>
                  <button type="button" className="md-inline-link" onClick={() => copy(draft.text)}>{t('复制')}</button>
                  {editDraft === index ? null : <button type="button" className="md-inline-link" onClick={() => { setEditDraft(index); setEditText(draft.text) }}>{t('改一下')}</button>}
                  <button type="button" className="md-inline-link" onClick={async () => {
                    try {
                      await logChat({
                        channel, name: fields.name || result.fields?.name || '', incoming: raw.trim(),
                        outgoing: draft.text, stage: result.stage || (channel === '微信' ? '成交' : '引流'), result: '未定',
                        note: editedDrafts[index] ? t('发出前改过') : '',
                      })
                      toast(t('记进对话记录了'))
                      reloadChats()
                    } catch (err) { toast(err.message, { error: true }) }
                  }}>{t('我发了，记一笔')}</button>
                </div>
              </li>
            ))}
          </ul>

          <div className="md-dm-revise">
            <input
              value={reviseNote}
              onChange={event => setReviseNote(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent?.isComposing) { event.preventDefault(); revise() } }}
              placeholder={t('想怎么改？比如：再短一点，别问分数，直接说私信')}
            />
            <button type="button" className="md-pill is-small" onClick={revise} disabled={reviseBusy || !reviseNote.trim()}>
              {reviseBusy ? t('正在改…') : t('再给一版')}
            </button>
          </div>

          <datalist id="md-content-titles">
            {contentTitles.map(title => <option key={title} value={title} />)}
          </datalist>
          <div className="md-dm-ledger">
            <div className="md-dm-ledger-grid">
              {[['name', '姓名'], ['grade', '年级'], ['school', '学校'], ['painPoint', '卡点'], ['source', '来源']].map(([key, label]) => (
                <label className="md-field" key={key}>
                  <span>{t(label)}</span>
                  <input
                    value={fields[key] ?? ''}
                    placeholder={key === 'source' ? t('选一条内容，或自己写') : t('没提就空着')}
                    list={key === 'source' ? 'md-content-titles' : undefined}
                    onChange={event => setFields(prev => ({ ...prev, [key]: event.target.value }))}
                  />
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

      <section className="md-tile md-dm-leads" id="dm-leads">
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

        {!leadsReady ? (
          <p className="md-muted md-dm-empty">{t('读取中…')}</p>
        ) : leads.length === 0 ? (
          <p className="md-muted md-dm-empty">{t('还没有线索。粘第一条私信，判断完记进线索表，这里就会多一行。')}</p>
        ) : filtered.length === 0 ? (
          <p className="md-muted md-dm-empty">{filter === 'due' ? t('今天没有到期要跟进的线索。') : t('这个筛选下没有线索。')}</p>
        ) : (
          <ul className="md-lead-list">
            {filtered.map(lead => (
              <li className="md-lead" key={`${lead.rowIndex}-${lead.date}-${lead.raw.slice(0, 8)}`}>
                <div className="md-lead-head">
                  <b>{lead.name || lead.grade || t('未填')}</b>
                  {lead.name && leadChatCounts[lead.name] ? (
                    <button type="button" className="md-lead-chat" onClick={() => {
                      setChatView('turns')
                      setChatPerson(lead.name)
                      requestAnimationFrame(() => document.getElementById('dm-chat-log')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                    }}>{t('聊过 {n} 轮', { n: leadChatCounts[lead.name] })}</button>
                  ) : null}
                  <span className="md-lead-date">{lead.date}</span>
                  {lead.type || lead.category ? <span className="md-lead-kind">{[lead.type, lead.category].filter(Boolean).join(' · ')}</span> : null}
                  {lead.source ? (
                    <span className={`md-lead-source ${contentTitles.length && !contentTitles.includes(lead.source) ? 'is-missing' : ''}`}>
                      {t('来源：{source}', { source: lead.source })}
                      {contentTitles.length && !contentTitles.includes(lead.source) ? t(' · 不在内容库') : ''}
                    </span>
                  ) : null}
                  {lead.nextAt || lead.followUps ? (
                    <span className={`md-lead-follow ${lead.nextAt && lead.nextAt <= dayKey(new Date()) && !['已报课', '流失'].includes(lead.stage) ? 'is-overdue' : ''}`}>
                      {lead.nextAt ? t('下次跟进 {date}', { date: lead.nextAt }) : t('还没定下次跟进')}
                      {lead.nextAt && isDue(lead) ? (daysLate(lead) > 0 ? t(' · 逾期 {n} 天', { n: daysLate(lead) }) : t(' · 今天到期')) : ''}
                      {lead.followUps ? t(' · 已跟 {n} 次', { n: lead.followUps }) : ''}
                    </span>
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
                  <button type="button" className="md-inline-link" onClick={() => {
                    updateLead(lead.rowIndex, { followUps: (lead.followUps || 0) + 1 })
                      .then(data => { if (data.leads) setLeads(data.leads); toast(t('跟进记了一次')) })
                      .catch(err => toast(err.message, { error: true }))
                  }}>{t('记一次跟进')}</button>
                  <button type="button" className="md-inline-link" onClick={() => postpone(lead, 1)}>{t('明天再跟')}</button>
                  <button type="button" className="md-inline-link" onClick={() => postpone(lead, 3)}>{t('3 天后')}</button>
                  {lead.stage === '已报课' && lead.name ? (
                    converted[lead.rowIndex] ? (
                      <button type="button" className="md-inline-link" onClick={() => setDesk({ view: 'students', focusId: null, studentFocus: converted[lead.rowIndex] })}>{t('去档案')}</button>
                    ) : (
                      <button type="button" className="md-inline-link" onClick={() => {
                        convertLead(lead.rowIndex)
                          .then(data => { if (data.leads) setLeads(data.leads); setConverted(prev => ({ ...prev, [lead.rowIndex]: lead.name })); toast(t('已转成学生，去学生档案补卡点层')) })
                          .catch(err => toast(err.message, { error: true }))
                      }}>{t('转成学生')}</button>
                    )
                  ) : null}
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

      <section className="md-tile md-chat-log" id="dm-chat-log">
        <header className="md-tile-head">
          <h2>{t('最近对话')}</h2>
          <span className="md-tile-meta">{t('{n} 轮 · 标了结果，下一句会参考', { n: chatTotal || chats.length })}</span>
          {chatTotal > chats.length ? <span className="md-muted">{t('页面只看最近 {n} 轮', { n: chats.length })}</span> : null}
          {chatStats.length ? (
            <span className="md-chat-stats">
              {chatStats.map(item => <em key={item.result} className={`is-${item.result === '流失' ? 'lost' : 'won'}`}>{t(item.result)} {item.n}</em>)}
            </span>
          ) : null}
          <span className="md-grow" />
          <div className="md-lead-tabs">
            {[['turns', '按轮次'], ['people', '按人']].map(([id, label]) => (
              <button type="button" key={id} className={chatView === id ? 'is-on' : ''} onClick={() => setChatView(id)}>{t(label)}</button>
            ))}
          </div>
          {chatView === 'people' && !chatPerson ? (
            <select className="md-chat-result-filter" value={peopleSort} onChange={event => setPeopleSort(event.target.value)}>
              {[['recent', '按最近聊'], ['turns', '按轮数'], ['result', '按结果']].map(([id, label]) => (
                <option key={id} value={id}>{t(label)}</option>
              ))}
            </select>
          ) : null}
          <select className="md-chat-result-filter" value={chatResult} onChange={event => setChatResult(event.target.value)}>
            {[['all', '全部结果'], ['未定', '未定'], ['成交', '成交'], ['约试听', '约试听'], ['加微', '加微'], ['流失', '流失']].map(([id, label]) => (
              <option key={id} value={id}>{t(label)}</option>
            ))}
          </select>
          <div className="md-lead-tabs">
            {[['all', '全部'], ['平台私信', '平台私信'], ['微信', '微信']].map(([id, label]) => (
              <button type="button" key={id} className={chatFilter === id ? 'is-on' : ''} onClick={() => setChatFilter(id)}>{t(label)}</button>
            ))}
          </div>
          {chatPerson ? (
            <>
              <button type="button" className="md-chat-person" onClick={() => setChatPerson('')}>
                {t('只看 {name}', { name: chatPerson })}<span>×</span>
              </button>
              <button type="button" className="md-inline-link" onClick={() => copy(chatRows
                .filter(row => row.name === chatPerson)
                .map(row => `${t('对方')}：${row.incoming}\n${t('我方')}：${row.outgoing}`)
                .join('\n\n'))}>{t('复制整段')}</button>
            </>
          ) : null}
          <button type="button" className="md-inline-link" onClick={() => revealDir().catch(err => toast(err.message, { error: true }))}>{t('看表格')}</button>
        </header>
        {!chatsReady && chats.length === 0 ? (
          <p className="md-muted md-dm-empty">{t('读取中…')}</p>
        ) : chats.length === 0 ? (
          <div className="md-works-empty">
            <p>{t('还没有对话记录。给出一句建议后点「我发了，记一笔」，这里就会多一轮。')}</p>
            <button type="button" className="md-pill" onClick={() => document.querySelector('.md-dm-input textarea')?.focus()}>{t('去写第一句')}</button>
          </div>
        ) : (
          chatView === 'people' && !chatPerson ? (
            <ul className="md-chat-people">
              {people.map(person => (
                <li key={person.key || 'none'}>
                  <button type="button" className="md-chat-person-row" onClick={() => { if (person.key) setChatPerson(person.key) }} disabled={!person.key}>
                    <b>{person.name}</b>
                    <span className="md-chat-channel">{t(person.channel)}</span>
                    <span className="md-muted">{t('{n} 轮', { n: person.turns })}</span>
                    <span className="md-grow" />
                    <em className={`is-${['成交', '加微', '约试听'].includes(person.lastResult) ? 'won' : person.lastResult === '流失' ? 'lost' : 'plain'}`}>{t(person.lastResult)}</em>
                    <span className="md-muted">{person.lastDate}</span>
                    {person.lastIncoming ? <span className="md-chat-person-preview">{person.lastIncoming.slice(0, 30)}</span> : null}
                  </button>
                </li>
              ))}
              {people.length === 0 ? <li className="md-muted">{t('这个渠道还没有对话')}</li> : null}
            </ul>
          ) : (
          <ul className="md-chat-list">
            {chatRows.length === 0 ? <li className="md-muted">{chatPerson ? t('还没有和 {name} 的对话', { name: chatPerson }) : t('这个筛选下没有对话')}</li> : null}
            {chatRows.slice(0, chatLimit).map(row => (
              <li key={row.rowIndex} className={`md-chat-row ${['成交', '加微', '约试听'].includes(row.result) ? 'is-won' : row.result === '流失' ? 'is-lost' : ''}`}>
                <header>
                  <span className={`md-chat-channel ${row.channel === '微信' ? 'is-wechat' : ''}`}>{t(row.channel)}</span>
                  {row.name ? <button type="button" className="md-inline-link" onClick={() => setChatPerson(row.name)}>{row.name}</button> : null}
                  <span className="md-muted">{row.date} {row.stage ? `· ${t(row.stage)}` : ''}</span>
                  {String(row.note || '').includes('改过') ? <em className="md-chat-edited">{t('改过')}</em> : null}
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
                    {leadOf(row.name) ? (
                      <div className="md-chat-lead">
                        <span>{t('线索阶段：{stage}', { stage: t(leadOf(row.name).stage || '私信') })}</span>
                        <label>
                          <b>{t('下一步')}</b>
                          <input
                            defaultValue={leadOf(row.name).next || ''}
                            placeholder={t('周四晚 8 点试听')}
                            onBlur={event => {
                              const lead = leadOf(row.name)
                              if (event.target.value === (lead.next || '')) return
                              updateLead(lead.rowIndex, { next: event.target.value })
                                .then(data => { if (data.leads) setLeads(data.leads); toast(t('下一步存好了')) })
                                .catch(err => toast(err.message, { error: true }))
                            }}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
            {!chatPerson && chatRows.length > chatShown ? (
              <li className="md-chat-more">
                <button type="button" className="md-inline-link" onClick={() => setChatShown(n => n + 30)}>
                  {t('显示更多（还有 {n} 轮）', { n: chatRows.length - chatShown })}
                </button>
              </li>
            ) : null}
          </ul>
          )
        )}
      </section>

      <section className="md-tile md-cases" id="dm-cases">
        <details open={casesOpen} onToggle={event => setCasesOpen(event.currentTarget.open)}>
          <summary>{t('案例库（{n}）· 聊成的会参考', { n: cases.length })}</summary>
          {cases.length === 0 ? (
            <p className="md-muted">{t('还没有导入案例。点上面「导入案例」，粘一段真实对话进来。')}</p>
          ) : (
            <>
              <div className="md-case-tools">
                <input value={caseQuery} onChange={event => setCaseQuery(event.target.value)} placeholder={t('搜场景、对话内容')} />
                <select value={caseFilter} onChange={event => setCaseFilter(event.target.value)}>
                  {[['all', '全部结果'], ['成交', '成交'], ['约试听', '约试听'], ['加微', '加微'], ['流失', '流失'], ['未定', '未定']].map(([id, label]) => (
                    <option key={id} value={id}>{t(label)}</option>
                  ))}
                </select>
                <span className="md-muted">{t('{n} 条', { n: filteredCases.length })}</span>
              </div>
            <ul className="md-case-list">
              {filteredCases.length === 0 ? <li className="md-muted">{t('这个筛选下没有案例')}</li> : null}
              {filteredCases.map(({ row, index }) => (
                <li key={`${row.date}-${index}`}>
                  <span className="md-chat-channel">{t(row.channel)}</span>
                  <input
                    className="md-case-scene"
                    defaultValue={row.scene || ''}
                    placeholder={t('没写场景')}
                    onBlur={event => {
                      if (event.target.value === (row.scene || '')) return
                      updateChatCase(index, { scene: event.target.value })
                        .then(data => { setCases(data.cases ?? []); toast(t('场景改好了')) })
                        .catch(err => toast(err.message, { error: true }))
                    }}
                  />
                  <select className="md-case-result" value={row.result || '未定'} onChange={event => {
                    updateChatCase(index, { result: event.target.value })
                      .then(data => { setCases(data.cases ?? []); toast(t('结果改好了')) })
                      .catch(err => toast(err.message, { error: true }))
                  }}>
                    {['成交', '约试听', '加微', '流失', '未定'].map(value => <option key={value} value={value}>{t(value)}</option>)}
                  </select>
                  <span className="md-muted">{row.date}</span>
                  <span className="md-grow" />
                  <button type="button" className="md-inline-link" onClick={() => {
                    if (!window.confirm(t('删掉这条案例？以后给建议就不会再参考它。'))) return
                    removeChatCase(index)
                      .then(data => { setCases(data.cases ?? []); toast(t('案例删掉了')) })
                      .catch(err => toast(err.message, { error: true }))
                  }}>{t('删除')}</button>
                  <p className="md-case-text">{row.text.slice(0, 120)}</p>
                </li>
              ))}
            </ul>
            </>
          )}
        </details>
      </section>
    </div>
  )
}
