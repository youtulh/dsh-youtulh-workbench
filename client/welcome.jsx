// 首页只做一件事：今天拍什么。
// 3 条来自最近家长卡点的选题，点一条直接出稿；其余功能都在左侧二级页。
import React from 'react'
import { fetchTodayTopics, profileSummary, setDesk, startFromTopic, toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { OnboardingWizard } from './onboarding.jsx'
import { Icon } from './ui.jsx'

export function WelcomeView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const configured = Boolean(positioning.subject || positioning.grade || positioning.city)
  const [topics, setTopics] = React.useState([])
  const [source, setSource] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const summary = profileSummary({ positioning, painPoints: pains })
  const go = view => setDesk({ view, focusId: null })

  const load = React.useCallback(() => {
    if (!configured) return
    setBusy(true)
    fetchTodayTopics()
      .then(data => { setTopics(data.topics ?? []); setSource(data.source ?? '') })
      .catch(err => toast(err.message, { error: true }))
      .finally(() => setBusy(false))
  }, [configured])

  React.useEffect(() => { load() }, [load])

  if (!configured && !saved) {
    return (
      <div className="md-page md-welcome">
        <OnboardingWizard onDone={() => { setSaved(true); load() }} onSwitch={() => go('setup')} />
      </div>
    )
  }

  return (
    <div className="md-page md-welcome md-today">
      <header className="md-today-head">
        <p className="md-eyebrow">{t('Youtulh 工作台')}</p>
        <h1 className="md-display">{t('今天拍什么')}</h1>
        {summary ? <p className="md-profile-line"><Icon name="user" size={13} />{t('按你的设定：{summary}', { summary })}</p> : null}
      </header>

      <section className="md-today-list">
        {busy && !topics.length ? <p className="md-muted">{t('正在看最近家长问什么…')}</p> : null}
        {topics.map((row, index) => (
          <button type="button" key={`${row.topic}-${index}`} className="md-today-card" onClick={() => startFromTopic(row.topic, '', true)}>
            <span className="md-today-no">{String(index + 1).padStart(2, '0')}</span>
            <span className="md-today-main">
              <b>{row.topic}</b>
              <small>{row.source ? t('来自：{source}', { source: row.source }) : t('按最近家长卡点生成')}</small>
            </span>
            <Icon name="arrow" size={15} />
          </button>
        ))}
        {!busy && !topics.length ? <p className="md-muted">{t('还没有选题，点「更多」自己写一个。')}</p> : null}
      </section>

      <footer className="md-today-foot">
        <button type="button" className="md-inline-link" onClick={() => go('content')}>{t('更多选题 / 自己写')}</button>
        <span className="md-muted">{source === 'local' ? t('没连模型，按最近卡点拼的') : t('点一条直接出稿，拍完再回来')}</span>
      </footer>
    </div>
  )
}
