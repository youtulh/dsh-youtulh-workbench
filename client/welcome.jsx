// 首页 = 一条工作流：先把一类家长定下来（问卷），保存后给第一批可拍的视频，再进入日常的回私信 / 看数据。
import React from 'react'
import { dispatchOps, fetchLeads, profileSummary, setDesk, startFromTopic, toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { diagnosePositioning, positioningSentence, suggestTargets } from '../src/targets.js'
import { dayKey } from './util.js'
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
  const advice = diagnosePositioning({ ...positioning, pains })

  React.useEffect(() => {
    if (!configured) return
    fetchLeads().then(setLeads).catch(() => {})
  }, [configured])

  const applyTarget = (card) => {
    dispatchOps([
      { op: 'update_positioning', target: card.value, entry: card.entry, fear: card.fear },
    ], { label: t('先抓这一类'), silent: true }).then(data => {
      if (data) toast(t('定位填好了：{title}', { title: card.title }))
    })
  }

  // 保存后先停在这一屏：给他定位一句话和第一批可拍的视频
  if (saved) {
    return (
      <div className="md-page md-welcome">
        <div className="md-onb md-onb-done">
          <p className="md-eyebrow">{t('设定已保存')}</p>
          <h1 className="md-display">{t('好，往后就按你说的来')}</h1>
          <p className="md-lede">{positioningSentence(positioning) || t('按你的设定：{summary}', { summary })}</p>
          {positioning.target
            ? <p className="md-profile-line"><Icon name="user" size={13} />{t('你抓的是：{target}', { target: positioning.target })}</p>
            : <p className="md-note">{t('目标客户还没定，首页和「我的设定」里都能补。')}</p>}

          <div className="md-first-videos">
            <b>{t('先拍这几条（科目 / 家庭 / 考情 / 本地）')}</b>
            <ul>
              {advice.firstVideos.map(row => (
                <li key={row.angle + row.text}>
                  <button type="button" className="md-first-video" onClick={() => startFromTopic(row.text)}>
                    <em>{t(row.angle)}</em>
                    <span>{row.text}</span>
                  </button>
                </li>
              ))}
            </ul>
            <small>{t('点一条就去做内容，选题已经勾好；每个选题会出 3 版。')}</small>
          </div>

          <p className="md-note">{t('发出去有人私信，就用「回私信」接住：判断、话术、加微信、记台账。')}</p>
          <div className="md-onb-actions">
            <button type="button" className="md-pill" onClick={() => setSaved(false)}>{t('留在首页')}</button>
            <button type="button" className="md-pill is-primary" onClick={() => go('content')}><Icon name="pen" size={14} />{t('去做第一条口播')}</button>
          </div>
        </div>
      </div>
    )
  }

  // 没填设定：首页就是问卷
  if (!configured) {
    return (
      <div className="md-page md-welcome">
        <OnboardingWizard onDone={() => setSaved(true)} onSwitch={() => go('setup')} />
      </div>
    )
  }

  const total = leads.length
  const todo = leads.filter(row => row.stage === '私信').length
  const added = leads.filter(row => ['已加微信', '已进群', '约试听', '已报课'].includes(row.stage)).length
  const trials = leads.filter(row => row.stage === '约试听').length
  const due = leads.filter(row => row.nextAt && row.nextAt <= dayKey(new Date()) && !['已报课', '流失'].includes(row.stage)).length

  return (
    <div className="md-page md-welcome md-workflow">
      <header className="md-hero">
        <p className="md-eyebrow">{t('今天从哪一步开始')}</p>
        <h1 className="md-display">{t('把一条视频，做成一个学生')}</h1>
        <p className="md-lede">{t('先写一条家长看得下去的口播，再把来问的人一个个接住。每个动作都留痕，越用越顺手。')}</p>
        {summary ? <p className="md-profile-line"><Icon name="user" size={13} />{t('按你的设定：{summary}', { summary })}</p> : null}
        {positioning.target ? <p className="md-note">{t('你现在抓的是：{target}', { target: positioning.target })}</p> : null}
      </header>

      {!positioning.target ? (
        <section className="md-nudge">
          <div className="md-nudge-head">
            <p className="md-eyebrow">{t('还差一步')}</p>
            <b>{t('先定一类家长，选题和话术才不会写给所有人')}</b>
            <small>{t('点一个方向就帮你填好人群、切入点和顾虑；之后在「我的设定」里还能改。')}</small>
          </div>
          <div className="md-nudge-cards">
            {suggestTargets({ ...positioning, pains }).slice(0, 2).map(card => (
              <button type="button" key={card.key} className="md-nudge-card" onClick={() => applyTarget(card)}>
                <b>{card.title}</b>
                <small>{card.why}</small>
              </button>
            ))}
          </div>
          <button type="button" className="md-pill is-small" onClick={() => go('setup')}>{t('自己写')}</button>
        </section>
      ) : null}

      <div className="md-steps">
        <Step
          index={1}
          title={t('认识你')}
          hint={positioning.target ? t('科目、年级、城市、目标客户') : t('还差目标客户：先选一类家长')}
          done={configured && Boolean(positioning.target)}
          action={t('改一下')}
          onAction={() => go('setup')}
        />
        <Step index={2} title={t('做第一条口播')} hint={t('选题 → 每个 3 版 → 改一版 → 采用这条')} action={t('开始')} onAction={() => go('content')} primary />
        <Step index={3} title={t('回私信、看数据')} hint={t('有人来问了就回私信；发出去了就回来填结果')} action={t('去看数据')} onAction={() => go('data')} />
        <Step index={4} title={t('报课之后')} hint={t('转成学生、建班，每次课记出勤和掌握')} action={t('去学生')} onAction={() => go('students')} />
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
          <div><dt>{t('待跟进')}</dt><dd>{todo || '—'}</dd></div>
          <div><dt>{t('该跟进')}</dt><dd>{due || '—'}</dd></div>
          <div><dt>{t('已加微')}</dt><dd>{added || '—'}</dd></div>
          <div><dt>{t('约试听')}</dt><dd>{trials || '—'}</dd></div>
        </dl>
      </div>
    </div>
  )
}
