// 首页 = 一条工作流：先用问卷填好定位（保存后停在确认屏），再带他做第一条口播，然后才是日常的回私信 / 看数据。
import React from 'react'
import { fetchLeads, profileSummary, setDesk, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { OnboardingWizard } from './onboarding.jsx'
import { Icon } from './ui.jsx'

function Step({ index, title, hint, done, action, onAction, primary }) {
  return (
    <section className={`md-step ${primary ? 'is-primary' : ''} ${done ? 'is-done' : ''}`}>
      <span className="md-step-index">{done ? <Icon name="check" size={12} /> : index}</span>
      <div className="md-step-body">
        <b>{title}</b>
        <small>{hint}</small>
      </div>
      {action ? <button type="button" className={`md-pill ${primary ? 'is-primary' : ''}`} onClick={onAction}>{action}</button> : null}
    </section>
  )
}

export function WelcomeView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const [saved, setSaved] = React.useState(false)
  const [leads, setLeads] = React.useState([])
  const configured = Boolean(positioning.subject || positioning.grade || positioning.city)
  const go = view => setDesk({ view, focusId: null })
  const summary = profileSummary({ positioning, painPoints: pains })

  React.useEffect(() => {
    if (!configured) return
    fetchLeads().then(setLeads).catch(() => {})
  }, [configured])

  // 没填设定：首页就是问卷
  if (!configured) {
    if (saved) {
      return (
        <div className="md-page md-welcome">
          <div className="md-onb md-onb-done">
            <p className="md-eyebrow">{t('设定已保存')}</p>
            <h1 className="md-display">{t('好，往后就按你说的来')}</h1>
            {summary ? <p className="md-lede">{t('按你的设定：{summary}', { summary })}</p> : null}
            <p className="md-note">{t('之后随时可以在「我的设定」里改；改了以后，做内容和回私信都会跟着变。')}</p>
            <div className="md-onb-actions">
              <button type="button" className="md-pill" onClick={() => setSaved(false)}>{t('留在首页')}</button>
              <button type="button" className="md-pill is-primary" onClick={() => go('content')}><Icon name="pen" size={14} />{t('去做第一条口播')}</button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="md-page md-welcome">
        <OnboardingWizard onDone={() => setSaved(true)} onSwitch={() => go('setup')} />
      </div>
    )
  }

  const total = leads.length
  const added = leads.filter(row => ['已加微', '已进群', '约了试听'].includes(row.next)).length
  const trials = leads.filter(row => row.next === '约了试听').length

  return (
    <div className="md-page md-welcome md-workflow">
      <header className="md-hero">
        <p className="md-eyebrow">{t('今天从哪一步开始')}</p>
        <h1 className="md-display">{t('把一条视频，做成一个学生')}</h1>
        <p className="md-lede">{t('先写一条家长看得下去的口播，再把来问的人一个个接住。每个动作都留痕，越用越顺手。')}</p>
        {summary ? <p className="md-profile-line"><Icon name="user" size={13} />{t('按你的设定：{summary}', { summary })}</p> : null}
      </header>

      <div className="md-steps">
        <Step index={1} title={t('认识你')} hint={t('科目、年级、城市、家长最愁什么')} done action={t('改一下')} onAction={() => go('setup')} />
        <Step index={2} title={t('做第一条口播')} hint={t('先看几条案例，改成你自己的说法，点开始')} action={t('开始')} onAction={() => go('content')} primary />
        <Step index={3} title={t('回私信、看数据')} hint={t('有人来问了就回私信；发出去了就回来填结果')} />
      </div>

      <div className="md-welcome-actions">
        <button type="button" className="md-big" onClick={() => go('dm')}>
          <span className="md-big-icon"><Icon name="chat" size={19} /></span>
          <b>{t('回私信')}</b>
          <small>{t('粘一条家长消息，按你的人设判断和回话，顺手记台账')}</small>
        </button>
        <button type="button" className="md-big" onClick={() => go('data')}>
          <span className="md-big-icon"><Icon name="list" size={19} /></span>
          <b>{t('看数据')}</b>
          <small>{t('填一条播放和私信，它自己知道哪条该照着写')}</small>
        </button>
      </div>

      <div className="md-funnel">
        <div className="md-funnel-head">
          <span className="md-eyebrow">{t('线索')}</span>
          <button type="button" className="md-inline-link" onClick={() => go('dm')}>{t('打开线索表')}</button>
        </div>
        <dl>
          <div><dt>{t('已记录')}</dt><dd>{total || '—'}</dd></div>
          <div><dt>{t('已加微')}</dt><dd>{added || '—'}</dd></div>
          <div><dt>{t('约试听')}</dt><dd>{trials || '—'}</dd></div>
        </dl>
      </div>
    </div>
  )
}
