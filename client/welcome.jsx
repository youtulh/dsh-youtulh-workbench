// 首页 = 一条工作流：先用问卷填好定位（保存后停在确认屏），再带他做第一条口播，然后才是日常的回私信 / 看数据。
import React from 'react'
import { fetchLeads, profileSummary, setDesk, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { OnboardingWizard } from './onboarding.jsx'
import { Icon } from './ui.jsx'

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
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const [saved, setSaved] = React.useState(false)
  const [leads, setLeads] = React.useState([])
  const configured = Boolean(positioning.subject || positioning.grade || positioning.city)
  const go = view => setDesk({ view, focusId: null })

  React.useEffect(() => {
    if (!configured) return
    fetchLeads().then(setLeads).catch(() => {})
  }, [configured])

  // 没填设定：首页就是问卷
  if (!configured) {
    if (saved) {
      const summary = profileSummary({ positioning, painPoints: pains })
      return (
        <div className="md-page md-welcome">
          <div className="md-onb">
            <h1 className="md-onb-title">{t('设定已保存')}</h1>
            {summary ? <p className="md-onb-hint">{t('按你的设定：{summary}', { summary })}</p> : null}
            <p className="md-onb-hint">{t('之后随时可以在「我的设定」里改；改了以后，做内容和回私信都会跟着变。')}</p>
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

  // 线索漏斗：直接从工作区的 线索表.csv 数出来
  const total = leads.length
  const added = leads.filter(row => ['已加微', '已进群', '约了试听'].includes(row.next)).length
  const trials = leads.filter(row => row.next === '约了试听').length

  return (
    <div className="md-page md-welcome md-workflow">
      <header className="md-welcome-head">
        <h1>{t('接下来做这三步')}</h1>
        <p className="md-welcome-sub">{t('做完第一条口播，剩下的就是每天回私信、每周看数据。')}</p>
        {profileSummary({ positioning, painPoints: pains }) ? (
          <p className="md-profile-line"><Icon name="user" size={13} />{t('按你的设定：{summary}', { summary: profileSummary({ positioning, painPoints: pains }) })}</p>
        ) : null}
      </header>

      <div className="md-steps">
        <Step index={1} title={t('认识你')} hint={t('科目、年级、城市、家长最愁什么')} done action={t('改一下')} onAction={() => go('setup')} />
        <Step index={2} title={t('做第一条口播')} hint={t('先看几条案例，改成你自己的说法，点开始')} action={t('开始')} onAction={() => go('content')} primary />
        <Step index={3} title={t('回私信、看数据')} hint={t('有人来问了就回私信；后台数据存进 数据/ 就能分析')} />
      </div>

      <div className="md-welcome-actions">
        <button type="button" className="md-big" onClick={() => go('dm')}>
          <span className="md-big-icon"><Icon name="chat" size={20} /></span>
          <b>{t('回私信')}</b>
          <small>{t('粘一条家长消息，按你的人设判断和回话，顺手记台账')}</small>
        </button>
        <button type="button" className="md-big" onClick={() => go('data')}>
          <span className="md-big-icon"><Icon name="list" size={20} /></span>
          <b>{t('看数据')}</b>
          <small>{t('数据文件夹里有什么，就让助教分析什么')}</small>
        </button>
      </div>

      <div className="md-welcome-funnel">
        <span>{t('线索')}</span>
        <dl>
          <div><dt>{t('已记录')}</dt><dd>{total || '—'}</dd></div>
          <div><dt>{t('已加微')}</dt><dd>{added || '—'}</dd></div>
          <div><dt>{t('约试听')}</dt><dd>{trials || '—'}</dd></div>
        </dl>
        <button type="button" className="md-inline-link" onClick={() => go('dm')}>{t('看线索表')}</button>
      </div>
    </div>
  )
}
