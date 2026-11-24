// 做内容：只做口播视频。给一句话 → 标题 / 口播文案 / 标签三组候选，挑一版复制走。
import React from 'react'
import { createContent, saveOutput, setDesk, toast, useDesk } from './desk.js'
import { launchFailedToast, startChat } from './launch.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'

function copy(text, what) {
  navigator.clipboard.writeText(text).then(() => toast(t('{what}已复制', { what })), () => toast(t('复制失败，手动选中吧'), { error: true }))
}

function PickList({ rows, value, onChange, render }) {
  return (
    <ul className="md-choice">
      {rows.map((row, index) => (
        <li key={index}>
          <button type="button" className={`md-choice-row ${index === value ? 'is-on' : ''}`} onClick={() => onChange(index)}>
            <span className="md-choice-dot" aria-hidden="true" />
            {render(row, index)}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function CreateView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const [hint, setHint] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [creative, setCreative] = React.useState(null)
  const [pick, setPick] = React.useState({ title: 0, script: 0, tags: 0 })
  const [engine, setEngine] = React.useState(null)

  const generate = async () => {
    const value = hint.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      const result = await createContent(value)
      setCreative(result.creative)
      setEngine(result.engine)
      setPick({ title: 0, script: 0, tags: 0 })
    } catch (err) {
      toast(err.message, { error: true })
    }
    setBusy(false)
  }

  const title = creative?.titles?.[pick.title]
  const script = creative?.scripts?.[pick.script]
  const tags = creative?.tags?.[pick.tags] ?? []
  const all = creative
    ? [
      title ? `【标题】${title}` : '',
      script ? `【口播文案 · ${script.label}】\n${script.text}` : '',
      tags.length ? `【标签】${tags.map(tag => `#${tag}`).join(' ')}` : '',
    ].filter(Boolean).join('\n\n')
    : ''

  const configured = Boolean(positioning.subject || positioning.grade)
  const [saving, setSaving] = React.useState(false)
  const save = async () => {
    if (!creative || !all || saving) return
    setSaving(true)
    try {
      const title = (title || hint).slice(0, 40)
      const result = await saveOutput({ kind: 'script', title, content: all, summary: `${creative.scripts.length} 版口播 · ${creative.tags.length} 组标签` })
      toast(t('已保存到 {dir}', { dir: result.dir }))
      setDesk({ view: 'works', focusId: null })
    } catch (err) {
      toast(err.message, { error: true })
    }
    setSaving(false)
  }

  return (
    <div className="md-page md-create">
      <header className="md-page-head">
        <div>
          <h1>{t('做内容')}</h1>
          <p className="md-page-sub">{t('只做口播视频。写一句你想讲的，交给对话里的助教，他会把稿子写好并落成文件。')}</p>
        </div>
      </header>

      <section className="md-create-input">
        <label className="md-field">
          <textarea
            rows={3}
            value={hint}
            onChange={event => setHint(event.target.value)}
            placeholder={configured ? t('比如：期中 58 分的娃，第一步不是刷题') : t('先到「我的设定」填一下你教什么，生成的东西才像你')}
          />
        </label>
        {pains.length ? (
          <div className="md-create-pains">
            <span>{t('家长常愁的：')}</span>
            {pains.slice(0, 6).map(point => (
              <button type="button" key={point} className="md-chip" onClick={() => setHint(point)}>{point}</button>
            ))}
          </div>
        ) : null}
        <div className="md-create-actions">
          {engine && engine !== 'local' ? <span className="md-muted">{t('由 {model} 生成', { model: engine })}</span> : null}
          <span className="md-grow" />
          {creative ? <button type="button" className="md-pill" onClick={() => copy(all, t('全部'))}><Icon name="copy" size={14} />{t('复制选中的三样')}</button> : null}
          {creative ? <button type="button" className="md-pill" onClick={save} disabled={saving}><Icon name="save" size={14} />{saving ? t('保存中…') : t('保存成 Word')}</button> : null}
          <button type="button" className="md-pill is-primary" onClick={() => { if (!startChat('content', { hint })) launchFailedToast(toast) }} disabled={!hint.trim()}>
            <Icon name="chat" size={14} />{t('让助教在对话里做')}
          </button>
          <button type="button" className="md-pill" onClick={generate} disabled={busy || !hint.trim()}>
            <Icon name="spark" size={14} />{busy ? t('生成中…') : creative ? t('换一批') : t('在这里生成')}
          </button>
        </div>
      </section>

      {creative ? (
        <div className="md-create-results">
          <section className="md-tile md-create-card">
            <header className="md-tile-head">
              <h2>{t('标题')}</h2>
              <span className="md-tile-meta">{t('选一个')}</span>
              <span className="md-grow" />
              {title ? <button type="button" className="md-inline-link" onClick={() => copy(title, t('标题'))}>{t('复制')}</button> : null}
            </header>
            {creative.titles.length
              ? <PickList rows={creative.titles} value={pick.title} onChange={index => setPick({ ...pick, title: index })} render={row => <span className="md-choice-text">{row}</span>} />
              : <p className="md-muted">{t('这次没给出标题，换一批试试。')}</p>}
          </section>

          <section className="md-tile md-create-card md-create-script">
            <header className="md-tile-head">
              <h2>{t('口播文案')}</h2>
              <span className="md-tile-meta">{t('挑一版念')}</span>
              <span className="md-grow" />
              {script ? <button type="button" className="md-inline-link" onClick={() => copy(script.text, t('口播文案'))}>{t('复制')}</button> : null}
            </header>
            {creative.scripts.length ? (
              <>
                <div className="md-create-tabs" role="tablist">
                  {creative.scripts.map((row, index) => (
                    <button type="button" role="tab" key={index} aria-selected={pick.script === index} className={pick.script === index ? 'is-on' : ''} onClick={() => setPick({ ...pick, script: index })}>{row.label}</button>
                  ))}
                </div>
                <div className="md-create-lines">{script?.text.split('\n').map((line, index) => <p key={index}>{line || '\u00a0'}</p>)}</div>
              </>
            ) : <p className="md-muted">{t('这次没给出文案，换一批试试。')}</p>}
          </section>

          <section className="md-tile md-create-card">
            <header className="md-tile-head">
              <h2>{t('标签')}</h2>
              <span className="md-tile-meta">{t('选一组')}</span>
              <span className="md-grow" />
              {tags.length ? <button type="button" className="md-inline-link" onClick={() => copy(tags.map(tag => `#${tag}`).join(' '), t('标签'))}>{t('复制')}</button> : null}
            </header>
            {creative.tags.length ? (
              <div className="md-create-tagsets">
                {creative.tags.map((group, index) => (
                  <button type="button" key={index} className={`md-tagset ${pick.tags === index ? 'is-on' : ''}`} onClick={() => setPick({ ...pick, tags: index })}>
                    {group.map(tag => <span key={tag}>#{tag}</span>)}
                  </button>
                ))}
              </div>
            ) : <p className="md-muted">{t('这次没给出标签，换一批试试。')}</p>}
          </section>
        </div>
      ) : (
        <p className="md-create-empty">
          <Icon name="bolt" size={14} />{t('写完提示点「生成」，会给出 3 个标题、2 版口播、2 组标签，挑你要的那一版复制走。')}
        </p>
      )}
    </div>
  )
}
