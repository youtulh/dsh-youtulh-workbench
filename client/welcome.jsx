// 首页：三个按钮，对应推流的三个动作。下面一条漏斗，告诉你现在推到哪一步了。
import React from 'react'
import { fetchInsights, setDesk, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'
import { compact } from './util.js'

function BigButton({ icon, title, hint, onClick }) {
  return (
    <button type="button" className="md-big" onClick={onClick}>
      <span className="md-big-icon"><Icon name={icon} size={20} /></span>
      <b>{title}</b>
      <small>{hint}</small>
    </button>
  )
}

export function WelcomeView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const [data, setData] = React.useState(null)

  React.useEffect(() => {
    let alive = true
    fetchInsights().then(next => { if (alive) setData(next) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const funnel = data?.funnel ?? { dms: 0, adds: 0, trials: 0 }
  // 设定填过没有：科目、年级、城市填了任意一个就算开过工
  const configured = Boolean(positioning.subject || positioning.grade || positioning.city)

  return (
    <div className="md-page md-welcome">
      <header className="md-welcome-head">
        <h1>{configured ? t('今天推进哪一步？') : t('先花一分钟，让我认识你')}</h1>
        <p className="md-welcome-sub">
          {configured
            ? t('三个按钮，都是给家长看的。')
            : t('填一下你教什么、家长愁什么、你平时怎么说话，之后生成的内容才像你。')}
        </p>
      </header>

      {configured ? null : (
        <button type="button" className="md-welcome-setup" onClick={() => setDesk({ view: 'setup', focusId: null })}>
          <Icon name="gear" size={15} />{t('去填我的设定（1 分钟）')}
        </button>
      )}

      <div className="md-welcome-actions">
        <BigButton icon="chat" title={t('回私信')} hint={t('粘一条家长消息，30 秒知道该回什么、怎么引到加微信')} onClick={() => setDesk({ view: 'dm', focusId: null })} />
        <BigButton icon="pen" title={t('做内容')} hint={t('一点选题，出口播稿、标题、封面大字和标签')} onClick={() => setDesk({ view: 'content', focusId: null })} />
        <BigButton icon="list" title={t('看数据')} hint={t('粘一段后台数据，看哪条真带人')} onClick={() => setDesk({ view: 'data', focusId: null })} />
      </div>

      <div className="md-welcome-funnel">
        <span>{t('本周')}</span>
        <dl>
          <div><dt>{t('私信')}</dt><dd>{funnel.dms ? compact(funnel.dms) : '—'}</dd></div>
          <div><dt>{t('加微')}</dt><dd>{funnel.adds ? compact(funnel.adds) : '—'}</dd></div>
          <div><dt>{t('约试听')}</dt><dd>{funnel.trials ? compact(funnel.trials) : '—'}</dd></div>
        </dl>
        <button type="button" className="md-inline-link" onClick={() => setDesk({ view: 'data', focusId: null })}>{t('录入数据')}</button>
      </div>
    </div>
  )
}
