// 做内容：先读人设，给几条「家长可能问的问题」当案例，用户照着改，再点开始去对话。
import React from 'react'
import { fetchSuggestions, fetchWorkspace, profileSummary, toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { launchFailedToast, startChat } from './launch.js'
import { Icon } from './ui.jsx'

export function CreateView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const [hint, setHint] = React.useState('')
  const [examples, setExamples] = React.useState([])
  const [source, setSource] = React.useState(null)
  const [root, setRoot] = React.useState('')
  const configured = Boolean(positioning.subject || positioning.grade)
  const summary = profileSummary({ positioning, painPoints: pains })
  const profileKey = JSON.stringify([positioning, pains])

  React.useEffect(() => { fetchWorkspace().then(info => setRoot(info.root)).catch(() => {}) }, [])

  React.useEffect(() => {
    let alive = true
    fetchSuggestions().then(result => {
      if (!alive) return
      setExamples(result.prompts)
      setSource(result.source)
    }).catch(() => {})
    return () => { alive = false }
    // 设定变了就重新出案例
  }, [profileKey])

  const start = () => {
    if (!startChat('content', { hint, root, profile: summary })) launchFailedToast(toast)
  }

  return (
    <div className="md-page md-create">
      <header className="md-page-head">
        <div>
          <h1>{t('做内容')}</h1>
          <p className="md-page-sub">
            {configured
              ? t('先看看下面几条 —— 都是你这个科目、这个年级的家长会问的问题。照着改一句你自己的，点开始。')
              : t('先到「我的设定」填一下你教什么，案例才会按你的科目出。')}
          </p>
        </div>
      </header>

      {summary ? (
        <p className="md-profile-line"><Icon name="user" size={13} />{t('按你的设定：{summary}', { summary })}</p>
      ) : null}

      {examples.length ? (
        <section className="md-create-examples">
          <h2>{t('可以这样问')}{source === 'model' ? <small>{t('按你的设定生成')}</small> : null}</h2>
          <ul>
            {examples.map(example => (
              <li key={example}>
                <button type="button" onClick={() => setHint(example)}>
                  <Icon name="spark" size={13} />
                  <span>{example}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="md-muted">{t('点一条填进下面，然后改成你自己的说法。')}</p>
        </section>
      ) : null}

      {pains.length ? (
        <div className="md-create-pains">
          <span>{t('或者从家长常愁的开始：')}</span>
          {pains.slice(0, 6).map(point => (
            <button type="button" key={point} className="md-chip" onClick={() => setHint(point)}>{point}</button>
          ))}
        </div>
      ) : null}

      <section className="md-create-input">
        <label className="md-field">
          <span>{t('这条视频想讲什么？（一句话就行）')}</span>
          <textarea
            rows={3}
            value={hint}
            onChange={event => setHint(event.target.value)}
            placeholder={configured ? t('比如：期中 58 分的娃，第一步不是刷题') : t('先填设定，再回来写这一句')}
          />
        </label>
        <div className="md-create-actions">
          <span className="md-muted">{t('点「开始」，会跳到对话并把这句话填好，按回车就生成。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-primary" onClick={start} disabled={!hint.trim()}>
            <Icon name="chat" size={14} />{t('开始')}
          </button>
        </div>
      </section>

      <p className="md-create-empty">
        <Icon name="folder" size={14} />
        {t('产出会出现在对话里，同时存进工作区：内容/<日期 标题>/ 下有一份 Word 和一份 Markdown。')}
      </p>
    </div>
  )
}
