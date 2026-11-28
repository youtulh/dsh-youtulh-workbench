// 线索表只做一件事：上传聊天截图或粘贴聊天记录 → AI 整理成线索 → 记进表。
import React from 'react'
import { analyzeChat, appendLeadRow, fetchLeadsWithLessons, setDesk, toast, updateLead, uploadFile, uploadZip, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'
import { LEAD_STAGES } from './util.js'

const EMPTY = { name: '', grade: '', school: '', painPoint: '', source: '', stage: '私信', next: '', nextAt: '', note: '' }

export function DmView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const [text, setText] = React.useState('')
  const [srcs, setSrcs] = React.useState([])
  const [leads, setLeads] = React.useState([])
  const [rows, setRows] = React.useState([])
  const [busy, setBusy] = React.useState('')
  const [source, setSource] = React.useState('')
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState('')

  const load = React.useCallback(() => {
    fetchLeadsWithLessons().then(data => setRows(data.leads ?? [])).catch(() => {})
  }, [])
  React.useEffect(() => { load() }, [load])

  const analyze = async (payload) => {
    setBusy('analyze')
    setError('')
    setSaved(false)
    try {
      const data = await analyzeChat(payload)
      setText(data.text ?? '')
      setLeads((data.leads ?? []).map(row => ({ ...EMPTY, ...row })))
      setSource(data.source ?? '')
      if (!(data.leads ?? []).length) setError(t('没识别出可记的线索，换一张更完整的图或把文字粘进来'))
    } catch (err) {
      setError(err.message)
      toast(err.message, { error: true })
    }
    setBusy('')
  }

  const pickImages = async (files) => {
    if (!files?.length) return
    setBusy('upload')
    try {
      const uploaded = []
      for (const file of files) {
        const data = await uploadFile(file)
        uploaded.push(data.src)
      }
      setSrcs(uploaded)
      await analyze({ srcs: uploaded })
    } catch (err) {
      setError(err.message)
      toast(err.message, { error: true })
    }
    setBusy('')
  }

  const pickZip = async (file) => {
    if (!file) return
    setBusy('upload')
    try {
      const zip = await uploadZip(file)
      setSrcs([zip])
      await analyze({ zip })
    } catch (err) { setError(err.message); toast(err.message, { error: true }) }
    setBusy('')
  }

  const setField = (index, key, value) => setLeads(prev => prev.map((row, at) => at === index ? { ...row, [key]: value } : row))

  const save = async () => {
    const items = leads.filter(row => row.name || row.painPoint || row.grade)
    if (!items.length) return toast(t('还没有可记的线索'), { error: true })
    setBusy('save')
    try {
      for (const row of items) {
        const patch = { raw: text.trim() || row.painPoint, ...row, type: '家长', category: '' }
        if (row.action === 'update' && Number.isInteger(row.rowIndex)) await updateLead(row.rowIndex, patch)
        else await appendLeadRow(patch)
      }
      toast(t('记进线索表了'))
      setSaved(true)
      setLeads([])
      setText('')
      setSrcs([])
      load()
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  return (
    <div className="md-page md-dm md-lead-intake">
      <header className="md-page-head">
        <div>
          <h1>{t('线索表')}</h1>
          <p className="md-page-sub">{t('上传聊天截图，或把聊天记录粘进来；AI 整理成线索，确认后记进表。')}</p>
        </div>
        <button type="button" className="md-inline-link" onClick={() => setDesk({ view: 'students', focusId: null })}>{t('学生管理')}</button>
      </header>

      {!positioning.subject ? (
        <div className="md-warn">
          <b>{t('还没填设定')}</b>
          <span>{t('先告诉我科目和年级，整理线索才更准。')}</span>
          <button type="button" className="md-pill is-small" onClick={() => setDesk({ view: 'setup', focusId: null })}>{t('去填设定')}</button>
        </div>
      ) : null}

      <section className="md-intake">
        <div className="md-intake-actions">
          <label className={`md-pill is-primary ${busy === 'upload' ? 'is-disabled' : ''}`}>
            <Icon name="plus" size={14} />
            {busy === 'upload' ? t('正在读图…') : t('上传聊天截图（可多张）')}
            <input type="file" accept="image/*" multiple hidden onChange={event => { const files = [...(event.target.files ?? [])]; event.target.value = ''; if (files.length) pickImages(files) }} />
          </label>
          <label className="md-inline-link">
            {t('选文件夹')}
            <input type="file" accept="image/*" multiple webkitdirectory="" hidden onChange={event => { const files = [...(event.target.files ?? [])].filter(file => file.type.startsWith('image/')); event.target.value = ''; if (files.length) pickImages(files) }} />
          </label>
          <label className="md-inline-link">
            {t('上传压缩包')}
            <input type="file" accept=".zip" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) pickZip(file) }} />
          </label>
          <span className="md-muted">{t('支持微信/小红书/抖音聊天截图；一次可以选多张')}</span>
        </div>
        <label className="md-field">
          <span>{t('聊天记录（可粘贴，也可以只上传截图）')}</span>
          <textarea rows={6} value={text} onChange={event => setText(event.target.value)} placeholder={t('把家长和你的聊天粘在这里，我来抽姓名、年级、卡点、阶段、下一步。')} />
        </label>
        <div className="md-intake-foot">
          <span className="md-muted">{srcs.length ? t('已上传 {n} 张截图，按顺序识别', { n: srcs.length }) : t('截图会先在本机识别文字，再整理成线索')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill" onClick={() => analyze({ text })} disabled={!text.trim() || busy === 'analyze'}>
            {busy === 'analyze' ? t('正在整理…') : t('整理成线索')}
          </button>
        </div>
      </section>

      {error ? <p className="md-intake-error">{error}</p> : null}

      {leads.length ? (
        <section className="md-intake-result">
          <header>
            <b>{t('整理出 {n} 条线索', { n: leads.length })}</b>
            <span className="md-muted">{t('新增 {n} 个，更新 {m} 个', { n: leads.filter(row => row.action !== 'update').length, m: leads.filter(row => row.action === 'update').length })}</span>
            <span className="md-muted">{source === 'local' ? t('本地兜底，请核对') : t('AI 整理，记之前看一眼')}</span>
            <span className="md-grow" />
            <button type="button" className="md-pill is-primary" onClick={save} disabled={busy === 'save'}>{busy === 'save' ? t('保存中…') : t('全部记进线索表')}</button>
          </header>
          {leads.map((row, index) => (
            <div className="md-intake-card" key={index}>
              <div className="md-intake-card-head"><span className={`md-bank-status ${row.action === 'update' ? 'is-ok' : ''}`}>{row.action === 'update' ? t('更新已有') : t('新增')}</span></div>
              <div className="md-intake-grid">
                {[['name', '家长/学生'], ['grade', '年级'], ['school', '学校'], ['painPoint', '卡点'], ['source', '来源'], ['next', '下一步'], ['nextAt', '跟进日期']].map(([key, label]) => (
                  <label className="md-field" key={key}>
                    <span>{t(label)}</span>
                    <input type={key === 'nextAt' ? 'date' : 'text'} value={row[key] ?? ''} onChange={event => setField(index, key, event.target.value)} />
                  </label>
                ))}
                <label className="md-field">
                  <span>{t('阶段')}</span>
                  <select value={row.stage || '私信'} onChange={event => setField(index, 'stage', event.target.value)}>
                    {LEAD_STAGES.map(value => <option key={value} value={value}>{t(value)}</option>)}
                  </select>
                </label>
              </div>
              <label className="md-field">
                <span>{t('备注')}</span>
                <input value={row.note ?? ''} onChange={event => setField(index, 'note', event.target.value)} />
              </label>
            </div>
          ))}
        </section>
      ) : null}

      {saved ? <p className="md-intake-saved">{t('已记进线索表。继续传下一张。')}</p> : null}

      <section className="md-intake-recent">
        <header><b>{t('最近记的')}</b><span className="md-muted">{t('{n} 条', { n: rows.length })}</span></header>
        <ul>
          {rows.slice(0, 6).map(row => (
            <li key={`${row.rowIndex}-${row.date}`}>
              <b>{row.name || row.grade || t('未填')}</b>
              <span>{row.painPoint || row.raw}</span>
              <em>{t(row.stage || '私信')}</em>
            </li>
          ))}
          {!rows.length ? <li className="md-muted">{t('还没有线索。上传第一张聊天截图。')}</li> : null}
        </ul>
      </section>
    </div>
  )
}
