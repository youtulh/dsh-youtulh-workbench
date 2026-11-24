// 做内容：这里只负责问清楚「你要讲什么」，活交给对话里的助教。
import React from 'react'
import { toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { launchFailedToast, startChat } from './launch.js'
import { Icon } from './ui.jsx'

export function CreateView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const [hint, setHint] = React.useState('')
  const configured = Boolean(positioning.subject || positioning.grade)
  const launch = () => {
    if (!startChat('content', { hint })) launchFailedToast(toast)
  }

  return (
    <div className="md-page md-create">
      <header className="md-page-head">
        <div>
          <h1>{t('做内容')}</h1>
          <p className="md-page-sub">{t('只做口播视频。你写一句想讲的，剩下的交给对话里的助教：他会读你的设定，写好标题、口播稿和标签，存成文件。')}</p>
        </div>
      </header>

      <section className="md-create-input">
        <label className="md-field">
          <span>{t('这条视频想讲什么？')}</span>
          <textarea
            rows={3}
            value={hint}
            onChange={event => setHint(event.target.value)}
            placeholder={configured ? t('比如：期中 58 分的娃，第一步不是刷题') : t('先到「我的设定」填一下你教什么，助教写出来的东西才像你')}
          />
        </label>
        {pains.length ? (
          <div className="md-create-pains">
            <span>{t('家长常愁的（点一下直接用）：')}</span>
            {pains.slice(0, 6).map(point => (
              <button type="button" key={point} className="md-chip" onClick={() => setHint(point)}>{point}</button>
            ))}
          </div>
        ) : null}
        <div className="md-create-actions">
          <span className="md-muted">{t('点下面的按钮，会跳到对话并把任务填好，按回车就开始。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-primary" onClick={launch} disabled={!hint.trim()}>
            <Icon name="chat" size={14} />{t('让助教在对话里做')}
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
