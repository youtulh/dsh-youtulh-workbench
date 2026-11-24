// 首页 = 一条工作流：先问卷把定位填好，再带他做第一条口播，然后才是日常的回私信 / 看数据。
import React from 'react'
import { fetchInsights, setDesk, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { OnboardingWizard } from './onboarding.jsx'
import { Icon } from './ui.jsx'
import { compact } from './util.js'

function Step({ index, title, hint, done, action, onAction, primary }) {
  return (
    <section className={`md-step ${primary ? 'is-primary' : ''} ${done ? 'is-done' : ''}`}>
      <span className="md-step-index">{done ? <Icon name="check" size={13} /> : index}</span>
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
  const [data, setData] = React.useState(null)
  const configured = Boolean(positioning.subject || positioning.grade || positioning.city)

  React.useEffect(() => {
    let alive = true
    fetchInsights().then(next => { if (alive) setData(next) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const funnel = data?.funnel ?? { dms: 0, adds: 0, trials: 0 }
  const go = view => setDesk({ view, focusId: null })

  // 没填设定：首页就是问卷，答完直接进入工作流
  if (!configured) {
    return (
      <div className="md-page md-welcome">
        <OnboardingWizard onDone={() => go('content')} onSwitch={() => go('setup')} />
      </div>
    )
  }

  return (
    <div className="md-page md-welcome md-workflow">
      <header className="md-welcome-head">
        <h1>{t('接下来做这三步')}</h1>
        <p className="md-welcome-sub">{t('做完第一条口播，剩下的就是每天回私信、每周看数据。')}</p>
      </header>

      <div className="md-steps">
        <Step index={1} title={t('认识你')} hint={t('科目、年级、城市、家长最愁什么')} done action={t('改一下')} onAction={() => go('setup')} />
        <Step index={2} title={t('做第一条口播')} hint={t('写一句你想讲的，出口播稿、标题、标签，挑一版')} action={t('开始')} onAction={() => go('content')} primary />
        <Step index={3} title={t('回私信、看数据')} hint={t('有人来问了就回私信；每周录一次数据')} />
      </div>

      <div className="md-welcome-actions">
        <button type="button" className="md-big" onClick={() => go('dm')}>
          <span className="md-big-icon"><Icon name="chat" size={20} /></span>
          <b>{t('回私信')}</b>
          <small>{t('粘一条家长消息，30 秒知道该回什么、怎么引到加微信')}</small>
        </button>
        <button type="button" className="md-big" onClick={() => go('data')}>
          <span className="md-big-icon"><Icon name="list" size={20} /></span>
          <b>{t('看数据')}</b>
          <small>{t('粘一段后台数据，看哪条真带人')}</small>
        </button>
      </div>

      <div className="md-welcome-funnel">
        <span>{t('本周')}</span>
        <dl>
          <div><dt>{t('私信')}</dt><dd>{funnel.dms ? compact(funnel.dms) : '—'}</dd></div>
          <div><dt>{t('加微')}</dt><dd>{funnel.adds ? compact(funnel.adds) : '—'}</dd></div>
          <div><dt>{t('约试听')}</dt><dd>{funnel.trials ? compact(funnel.trials) : '—'}</dd></div>
        </dl>
        <button type="button" className="md-inline-link" onClick={() => go('data')}>{t('录入数据')}</button>
      </div>
    </div>
  )
}
