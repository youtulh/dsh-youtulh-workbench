// 我的设定：三个问题，喂给回私信、做内容、看数据三处。
import React from 'react'
import { dispatchOps, setDesk, toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'

const WHO = [
  ['subject', '教什么科目', '比如：高中化学'],
  ['grade', '带哪个年级', '比如：高一'],
  ['city', '在哪个城市', '比如：北京'],
]

const BOUNDARY = [
  ['only', '只做', '北京、高一、化学、开学后掉队'],
  ['notDo', '不做', '高二高三、外地、竞赛、只求押题'],
  ['redline', '红线', '不承诺提分、不说包过、不报价格'],
]

export function SetupView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const [draft, setDraft] = React.useState('')
  const [savedAt, setSavedAt] = React.useState('')

  const markSaved = () => setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
  const save = async (key, value) => {
    const next = String(value ?? '').trim()
    if (next === (positioning[key] ?? '')) return
    const data = await dispatchOps([{ op: 'update_positioning', [key]: next }], { label: t('保存设定'), silent: true })
    if (data) markSaved()
  }

  const addPain = (event) => {
    event.preventDefault()
    const value = draft.trim()
    if (!value) return
    if (pains.includes(value)) {
      toast(t('这条已经在了'))
      return
    }
    dispatchOps([{ op: 'set_pain_points', points: [...pains, value] }], { label: t('加一条痛点') }).then(data => { if (data) markSaved() })
    setDraft('')
  }
  const removePain = point => dispatchOps([{ op: 'set_pain_points', points: pains.filter(row => row !== point) }], { label: t('删掉一条痛点') }).then(data => { if (data) markSaved() })

  return (
    <div className="md-page md-setup">
      <header className="md-page-head">
        <div>
          <h1>{t('我的设定')}</h1>
          <p className="md-page-sub">{t('填一次就够了。回私信、做内容、看数据都会照着它来，以后随时能改。')}</p>
        </div>
        <span className="md-setup-saved">{savedAt ? t('已保存 {time}', { time: savedAt }) : t('改完自动保存')}</span>
      </header>

      <section className="md-setup-card">
        <h2><span>1</span>{t('我教什么')}</h2>
        <div className="md-setup-grid">
          {WHO.map(([key, label, hint]) => (
            <label key={key} className="md-field">
              <span>{t(label)}</span>
              <input defaultValue={positioning[key] ?? ''} placeholder={t(hint)} onBlur={event => save(key, event.target.value)} />
            </label>
          ))}
        </div>
      </section>

      <section className="md-setup-card">
        <h2><span>2</span>{t('家长最愁什么')}</h2>
        <p className="md-setup-hint">{t('写家长的原话，不写教学术语。选题和文案的钩子都从这里长出来。')}</p>
        <div className="md-setup-pains">
          {pains.length ? pains.map(point => (
            <span key={point} className="md-chip is-removable">
              {point}
              <button type="button" aria-label={t('删掉「{point}」', { point })} onClick={() => removePain(point)}>×</button>
            </span>
          )) : <span className="md-muted">{t('还没有，先加一条最常听到的抱怨。')}</span>}
        </div>
        <form className="md-setup-add" onSubmit={addPain}>
          <input value={draft} onChange={event => setDraft(event.target.value)} placeholder={t('比如：期中 58 分，还能补上来吗')} />
          <button type="submit" className="md-pill is-small" disabled={!draft.trim()}><Icon name="plus" size={13} />{t('加一条')}</button>
        </form>
      </section>

      <section className="md-setup-card">
        <h2><span>3</span>{t('我平时怎么说话')}</h2>
        <p className="md-setup-hint">{t('一句话就行。成稿和私信话术都会跟着这个口气写。')}</p>
        <label className="md-field">
          <textarea rows={3} defaultValue={positioning.voice ?? ''} placeholder={t('比如：先接住家长的焦虑，再用一个具体数字说清楚，不喊口号')} onBlur={event => save('voice', event.target.value)} />
        </label>
      </section>

      <section className="md-setup-card md-setup-reset">
        <h2>{t('想从头再来')}</h2>
        <p className="md-setup-hint">{t('清空设定和家长痛点，重新做一遍问卷。线索表、账号数据和已经做出来的内容都不会动。')}</p>
        <button type="button" className="md-pill" onClick={() => {
          dispatchOps([
            { op: 'update_positioning', subject: '', grade: '', city: '', only: '', notDo: '', voice: '', redline: '' },
            { op: 'set_pain_points', points: [] },
          ], { label: t('重做问卷') })
          setDesk({ view: 'home', focusId: null })
        }}>{t('重新做一遍问卷')}</button>
      </section>

      <details className="md-setup-card md-setup-more">
        <summary>{t('更细的边界（可选，不填也能用）')}</summary>
        <div className="md-setup-grid">
          {BOUNDARY.map(([key, label, hint]) => (
            <label key={key} className="md-field">
              <span>{t(label)}</span>
              <textarea rows={2} defaultValue={positioning[key] ?? ''} placeholder={t(hint)} onBlur={event => save(key, event.target.value)} />
            </label>
          ))}
        </div>
      </details>
    </div>
  )
}
