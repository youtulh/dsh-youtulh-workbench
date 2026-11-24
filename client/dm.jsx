// 回私信的分诊台：粘一条私信 → 判断是谁、问什么 → 两条草稿 → 台账落表。
// 这不是聊天窗，是分诊台：先判断，再给话。话术是原句，肖月改两个词就能发。
import React from 'react'
import { dispatchOps, fetchLeads, revealDir, toast, triageDm, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'
import { fmtDate } from './util.js'

const TYPES = ['家长', '学生本人', '同行', '广告']
const CATEGORIES = ['A 价格', 'B 能不能提分', 'C 怎么补', 'D 时间形式', '无']
const NEXT = ['待加微', '已加微', '已进群', '约了试听', '待跟进']
const LEDGER = [
  ['name', '姓名', '私信没说就留空'],
  ['grade', '年级', '高一'],
  ['school', '学校', ''],
  ['painPoint', '卡点', '期中 58 分，物质的量没听懂'],
  ['source', '来源', '哪条视频带来的'],
  ['next', '下一步', '待加微'],
]

function nextOf(value) {
  const at = NEXT.indexOf(value)
  return NEXT[(at + 1) % NEXT.length]
}

function copy(text) {
  navigator.clipboard.writeText(text).then(() => toast(t('已复制')), () => toast(t('复制失败，手动选中吧'), { error: true }))
}

/** 台账七个字段，按文档 4.7 的顺序排。 */
function ledgerRows(ledger) {
  return LEDGER.map(([key, label, hint]) => ({ key, label, hint, value: ledger?.[key] ?? '' }))
}

export function DmView() {
  useLang()
  const [leads, setLeads] = React.useState([])
  const reload = React.useCallback(() => { fetchLeads().then(setLeads).catch(() => {}) }, [])
  React.useEffect(() => { reload() }, [reload])
  const [raw, setRaw] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [verdict, setVerdict] = React.useState(null)
  const [ledger, setLedger] = React.useState(null)
  const [used, setUsed] = React.useState('')
  const [engine, setEngine] = React.useState(null)

  const submit = async () => {
    const text = raw.trim()
    if (!text || busy) return
    setBusy(true)
    try {
      const result = await triageDm(text)
      setVerdict(result.verdict)
      setLedger({ ...result.verdict.ledger })
      setUsed(result.verdict.drafts?.[0] ?? '')
      setEngine(result.engine)
    } catch (err) {
      toast(err.message, { error: true })
    }
    setBusy(false)
  }

  const save = () => {
    if (!verdict || !ledger) return
    dispatchOps([{
      op: 'add_lead',
      raw: raw.trim(),
      type: verdict.type,
      category: verdict.category,
      draft: used,
      ...ledger,
      note: verdict.note ?? '',
    }], { label: t('记下一条私信线索') })
    setTimeout(reload, 300)
    setRaw('')
    setVerdict(null)
    setLedger(null)
    setUsed('')
    setEngine(null)
  }

  const exportCsv = () => {
    const head = '姓名,年级,学校,卡点,来源,下一步,类型,分类,原文'
    const cell = value => `"${String(value ?? '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
    const body = leads.map(lead => [lead.name, lead.grade, lead.school, lead.painPoint, lead.source, lead.next, lead.type, lead.category, lead.raw].map(cell).join(','))
    copy([head, ...body].join('\n'))
    toast(t('线索表已复制成 CSV'))
  }

  return (
    <div className="md-board-page">
      <div className="md-dm">
        <section className="md-tile md-dm-input">
          <header className="md-tile-head">
            <h2>{t('回私信')}</h2>
            <span className="md-tile-meta">{t('粘原文，判断是谁、问什么，出两条草稿')}</span>
          </header>
          <label className="md-field">
            <textarea
              rows={5}
              value={raw}
              onChange={event => setRaw(event.target.value)}
              placeholder={t('老师你好，我孩子高一，化学期中才 58 分，还能补上来吗？')}
            />
          </label>
          <div className="md-dm-actions">
            <span className="md-grow" />
            <button type="button" className="md-pill is-primary" onClick={submit} disabled={busy || !raw.trim()}>
              <Icon name="spark" size={14} />{busy ? t('判断中…') : t('分诊')}
            </button>
          </div>
          {engine && engine !== 'local' ? <p className="md-dm-engine">{t('由 {model} 判断', { model: engine })}</p> : null}
        </section>

        {verdict ? (
          <section className="md-tile md-dm-verdict">
            <header className="md-tile-head">
              <h2>{t('判断')}</h2>
              <span className="md-dm-chips">
                <b className={`is-${TYPES.indexOf(verdict.type)}`}>{t(verdict.type)}</b>
                <b>{t(verdict.category)}</b>
              </span>
            </header>
            {verdict.drafts?.length ? (
              <ul className="md-dm-drafts">
                {verdict.drafts.map((draft, index) => (
                  <li key={index} className={used === draft ? 'is-used' : ''}>
                    <span className="md-dm-tag">{index === 0 ? t('接住') : t('引导下一步')}</span>
                    <p>{draft}</p>
                    <div className="md-dm-draft-actions">
                      <button type="button" className="md-pill is-small" onClick={() => copy(draft)}>{t('复制')}</button>
                      <button type="button" className="md-pill is-small" onClick={() => setUsed(draft)}>{used === draft ? t('已选') : t('用这条')}</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="md-muted">{t('这条不像真家长，建议不回。')}</p>}
            {verdict.note ? <p className="md-dm-note"><Icon name="bolt" size={13} />{verdict.note}</p> : null}
          </section>
        ) : null}

        {ledger ? (
          <section className="md-tile md-dm-ledger">
            <header className="md-tile-head">
              <h2>{t('台账')}</h2>
              <span className="md-tile-meta">{t('私信里没说过的一律留空，不要替人编')}</span>
            </header>
            <div className="md-dm-ledger-grid">
              {ledgerRows(ledger).map(row => (
                <label key={row.key} className="md-field">
                  <span>{t(row.label)}</span>
                  <input value={row.value} placeholder={row.hint ? t(row.hint) : ''} onChange={event => setLedger({ ...ledger, [row.key]: event.target.value })} />
                </label>
              ))}
            </div>
            <div className="md-dm-actions">
              <span className="md-muted">{used ? t('发出去的那条已选') : t('还没选发哪条草稿')}</span>
              <span className="md-grow" />
              <button type="button" className="md-pill" onClick={() => { setVerdict(null); setLedger(null) }}>{t('丢掉')}</button>
              <button type="button" className="md-pill is-primary" onClick={save}><Icon name="save" size={14} />{t('存进线索表')}</button>
            </div>
          </section>
        ) : null}

        <section className="md-tile md-dm-leads">
          <header className="md-tile-head">
            <h2>{t('线索表')}</h2>
            <span className="md-tile-meta">{t('{n} 条', { n: leads.length })}</span>
            <span className="md-grow" />
            {leads.length ? <button type="button" className="md-pill is-small" onClick={exportCsv}><Icon name="copy" size={13} />{t('复制成 CSV')}</button> : null}
            <button type="button" className="md-pill is-small" onClick={() => revealDir().catch(err => toast(err.message, { error: true }))}><Icon name="folder" size={13} />{t('打开线索表')}</button>
          </header>
          {leads.length ? (
            <div className="md-i-table">
              <table className="md-table is-plain">
                <thead><tr><th>{t('姓名')}</th><th>{t('年级')}</th><th>{t('卡点')}</th><th>{t('来源')}</th><th>{t('下一步')}</th><th /></tr></thead>
                <tbody>
                  {leads.map(lead => (
                    <tr key={lead.id}>
                      <td>{lead.name || <span className="md-muted">{t('未填')}</span>}</td>
                      <td>{lead.grade || '—'}</td>
                      <td className="md-dm-wrap">{lead.painPoint || '—'}</td>
                      <td>{lead.source || '—'}</td>
                      <td>
                        <span className="md-chip">{lead.next || '—'}</span>
                      </td>
                      <td className="is-num">
                        <button type="button" className="md-inline-link" onClick={() => copy(lead.raw)}>{t('复制原文')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="md-muted md-dm-empty">{t('还没有线索。粘第一条私信，分诊完存进来。')}</p>}
        </section>
      </div>
    </div>
  )
}
