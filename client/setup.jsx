// 我的设定：先定「我为谁、从哪切、她最怕什么」，再给体检和第一批可以拍的视频。
import React from 'react'
import { dispatchOps, fetchPlatformWords, fetchVoice, savePlatformWords, saveVoice, startFromTopic, setDesk, toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'
import { diagnosePositioning, entrySuggestions, positioningSentence, suggestTargets } from '../src/targets.js'

const WHO = [
  ['subject', '教什么科目', '比如：高中化学'],
  ['grade', '带哪个年级', '比如：高一'],
  ['city', '在哪个城市', '比如：北京；只做线上就写线上'],
]

const SECTIONS = [
  ['setup-teach', '我教什么'],
  ['setup-target', '先抓哪类家长'],
  ['setup-pains', '家长最愁什么'],
  ['setup-voice', '说话方式'],
  ['setup-samples', '原话样本'],
  ['setup-words', '平台词表'],
  ['setup-advice', '定位体检'],
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
  const [voiceText, setVoiceText] = React.useState('')
  const [voiceBusy, setVoiceBusy] = React.useState(false)
  const [allowText, setAllowText] = React.useState('')
  const [banText, setBanText] = React.useState('')
  const [wordsBusy, setWordsBusy] = React.useState(false)

  React.useEffect(() => {
    fetchVoice().then(data => setVoiceText((data.samples ?? []).join('\n'))).catch(() => {})
    fetchPlatformWords().then(data => {
      setAllowText((data.allow ?? []).join('\n'))
      setBanText((data.ban ?? []).join('\n'))
    }).catch(() => {})
  }, [])

  const saveWords = async () => {
    const split = value => value.split(/\n+/).map(row => row.trim()).filter(Boolean).slice(0, 16)
    setWordsBusy(true)
    try {
      const data = await savePlatformWords({ allow: split(allowText), ban: split(banText) })
      setAllowText((data.allow ?? []).join('\n'))
      setBanText((data.ban ?? []).join('\n'))
      markSaved()
      toast(t('平台词表存好了，下一句会按这个来'))
    } catch (err) { toast(err.message, { error: true }) }
    setWordsBusy(false)
  }

  const saveVoiceSamples = async () => {
    const samples = voiceText.split(/\n+/).map(row => row.trim()).filter(Boolean).slice(0, 8)
    setVoiceBusy(true)
    try {
      const data = await saveVoice(samples)
      setVoiceText((data.samples ?? []).join('\n'))
      markSaved()
      toast(t('原话样本存好了，下次生成会照这个口气'))
    } catch (err) { toast(err.message, { error: true }) }
    setVoiceBusy(false)
  }

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

  const advice = diagnosePositioning({ ...positioning, pains })
  const cards = suggestTargets({ ...positioning, pains })
  const entries = entrySuggestions({ ...positioning, pains })

  const applyCard = (card) => {
    dispatchOps([
      { op: 'update_positioning', target: card.value, entry: card.entry, fear: card.fear },
    ], { label: t('先抓这一类'), silent: true }).then(data => {
      if (!data) return
      markSaved()
      toast(t('定位填好了：{title}', { title: card.title }))
    })
  }

  return (
    <div className="md-page md-setup">
      <header className="md-page-head">
        <div>
          <h1>{t('我的设定')}</h1>
          <p className="md-page-sub">{t('先定一类家长，再谈内容。回私信、做内容、看数据都按这个来，以后随时能改。')}</p>
        </div>
        <span className="md-setup-saved">{savedAt ? t('已保存 {time}', { time: savedAt }) : t('改完自动保存')}</span>
      </header>

      <p className={`md-setup-status ${advice.ready ? 'is-ok' : ''}`}>
        {advice.ready ? t('定位完整：人群、切入点、顾虑都写了') : t('还差 {n} 项：{list}', { n: advice.gaps.length, list: advice.gaps.slice(0, 3).map(row => t(row.label)).join('、') })}
      </p>

      <nav className="md-setup-nav" aria-label={t('本页目录')}>
        {SECTIONS.map(([id, label]) => (
          <button type="button" key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{t(label)}</button>
        ))}
      </nav>

      <section className="md-setup-card" id="setup-teach">
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

      <section className="md-setup-card" id="setup-target">
        <h2><span>2</span>{t('先抓哪类家长')}</h2>
        <p className="md-setup-hint">{t('一个账号只对一类家长说话，越窄越容易赚到钱。不知道选谁，就从下面点一个。')}</p>
        {positioningSentence(positioning) ? <p className="md-setup-sentence">{positioningSentence(positioning)}</p> : null}
        <div className="md-setup-cards">
          {cards.map(card => {
            const on = String(positioning.target ?? '') === card.value
            return (
              <button type="button" key={card.key} className={`md-setup-card-choice ${on ? 'is-on' : ''}`} onClick={() => applyCard(card)}>
                <b>{card.title}</b>
                <small>{card.why}</small>
                <small className="md-setup-fear">{t('她最怕：{fear}', { fear: card.fear })}</small>
              </button>
            )
          })}
        </div>
        <div className="md-setup-grid">
          <label className="md-field">
            <span>{t('我为谁（一句话）')}</span>
            <input key={positioning.target ?? ''} defaultValue={positioning.target ?? ''} placeholder={t('比如：北京高二物理，期中掉到及格线、家长急但没方向')} onBlur={event => save('target', event.target.value)} />
          </label>
          <label className="md-field">
            <span>{t('我从哪切进去')}</span>
            <input key={positioning.entry ?? ''} defaultValue={positioning.entry ?? ''} placeholder={t('比如：期中卷丢分最多的那一块')} onBlur={event => save('entry', event.target.value)} />
          </label>
          <label className="md-field">
            <span>{t('她最怕什么')}</span>
            <input key={positioning.fear ?? ''} defaultValue={positioning.fear ?? ''} placeholder={t('比如：怕补了一学期还是原地踏步')} onBlur={event => save('fear', event.target.value)} />
          </label>
        </div>
        <div className="md-setup-chips">
          {entries.map(row => (
            <button type="button" key={row} className="md-chip" onClick={() => save('entry', row)}>{row}</button>
          ))}
        </div>
      </section>

      <section className="md-setup-card" id="setup-pains">
        <h2><span>3</span>{t('家长最愁什么')}</h2>
        <p className="md-setup-hint">{t('写家长的原话，别写教学术语。视频的题目和开头就从这儿来。')}</p>
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

      <section className="md-setup-card" id="setup-voice">
        <h2><span>4</span>{t('我平时怎么说话')}</h2>
        <p className="md-setup-hint">{t('一句话就行。写出来的稿子和回私信都照这个口气。')}</p>
        <label className="md-field">
          <textarea rows={3} defaultValue={positioning.voice ?? ''} placeholder={t('比如：先接住家长的焦虑，再用一个具体数字说清楚，不喊口号')} onBlur={event => save('voice', event.target.value)} />
        </label>
      </section>

      <section className="md-setup-card" id="setup-samples">
        <h2><span>5</span>{t('我的原话样本')}</h2>
        <p className="md-setup-hint">{t('一行一句，写你平时怎么跟家长说话，3 到 5 句就够。口播、按提示改、回私信都照这个口气；不填也不会套用别人的科目和例子。')}</p>
        <label className="md-field">
          <textarea
            rows={6}
            value={voiceText}
            onChange={event => setVoiceText(event.target.value)}
            placeholder={t('比如：孩子这块不是笨，是前面那一章没接上。')}
          />
        </label>
        <div className="md-setup-samples-foot">
          <span className="md-muted">{t('存进工作区的 说话样本.md；改这个文件也一样生效。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-small" onClick={saveVoiceSamples} disabled={voiceBusy}>
            {voiceBusy ? t('保存中…') : t('保存原话')}
          </button>
        </div>
      </section>

      <section className="md-setup-card" id="setup-words">
        <h2><span>6</span>{t('平台话术词表')}</h2>
        <p className="md-setup-hint">{t('只影响平台私信阶段：小红书 / 抖音 / B站里哪些说法可以用、哪些不要出现。一行一个，存进 平台词表.md。')}</p>
        <div className="md-setup-words">
          <label className="md-field">
            <span>{t('可以出现')}</span>
            <textarea rows={5} value={allowText} onChange={event => setAllowText(event.target.value)} placeholder={'vx\n威信\n私信\n主页'} />
          </label>
          <label className="md-field">
            <span>{t('不要出现')}</span>
            <textarea rows={5} value={banText} onChange={event => setBanText(event.target.value)} placeholder={'加微信\n微信号\n手机号\n价格'} />
          </label>
        </div>
        <div className="md-setup-samples-foot">
          <span className="md-muted">{t('改这个文件也一样生效；微信阶段不受这张表限制。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-small" onClick={saveWords} disabled={wordsBusy}>
            {wordsBusy ? t('保存中…') : t('保存词表')}
          </button>
        </div>
      </section>

      <section className="md-setup-card md-advice" id="setup-advice">
        <h2>{t('定位体检')}</h2>
        <p className="md-advice-headline">{advice.headline}</p>
        {advice.gaps.length ? (
          <ul className="md-advice-gaps">
            {advice.gaps.map(row => <li key={row.key}><b>{t(row.label)}</b><span>{t(row.fix)}</span></li>)}
          </ul>
        ) : <p className="md-setup-hint">{t('够了：人群具体、切入点清楚、也写了顾虑。可以开始拍了。')}</p>}
        <div className="md-advice-videos">
          <b>{t('先拍这几条（科目 / 家庭 / 考情 / 本地）')}</b>
          <ul>
            {advice.firstVideos.map(row => (
              <li key={row.angle + row.text}>
                <button type="button" className="md-advice-video" onClick={() => startFromTopic(row.text)}>
                  <em>{t(row.angle)}</em>
                  <span>{row.text}</span>
                  <Icon name="pen" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <details className="md-advice-pitfalls">
          <summary>{t('别踩的坑')}</summary>
          <ul>{advice.pitfalls.map(row => <li key={row}>{t(row)}</li>)}</ul>
        </details>
      </section>

      <section className="md-setup-card md-setup-reset">
        <h2>{t('想从头再来')}</h2>
        <p className="md-setup-hint">{t('清空设定和家长痛点，重新做一遍问卷。线索表、内容和数据都不会动。')}</p>
        <button type="button" className="md-pill" onClick={() => {
          dispatchOps([
            { op: 'update_positioning', subject: '', grade: '', city: '', target: '', entry: '', fear: '', only: '', notDo: '', voice: '', redline: '' },
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
