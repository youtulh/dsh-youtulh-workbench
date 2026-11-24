// 新用户问卷：先讲清楚这门生意（把一类家长洗到加微信），再问事实，最后定目标客户和人群画像。
// 一屏一件事，每题都能自己写；保存后停在「设定已保存」，下面是第一批可拍的视频。
import React from 'react'
import { dispatchOps, toast } from './desk.js'
import { t, useLang } from './i18n.js'
import { EXCLUDES, GRADES, SITUATIONS, SUBJECTS, buildProfile } from '../src/onboarding.js'
import { diagnosePositioning, entrySuggestions, positioningSentence, suggestTargets } from '../src/targets.js'
import { Icon } from './ui.jsx'

const NO_EXCLUDE = '都不排斥'

const steps = () => [
  { key: 'intro', type: 'intro' },
  { key: 'subject', title: t('你教什么科目？'), type: 'single', options: SUBJECTS, placeholder: t('比如：信息技术、生物、雅思'), hint: t('说清楚你教哪一科。家长刷到你，先看你教的是不是她要的科目。') },
  { key: 'grade', title: t('主要带哪个年级？'), type: 'single', options: GRADES, placeholder: t('比如：四年级、艺考生、高三复读'), hint: t('同年级的家长，愁的事差不多；换个年级，愁的就全变了。') },
  { key: 'city', title: t('你在哪个城市？'), type: 'text', placeholder: t('北京；只做线上就写「线上」'), hint: t('只招本地就写城市名。同城的家长更信你；想做全国最难。') },
  { key: 'situations', title: t('你的学生主要是哪种情况？'), type: 'multi', options: SITUATIONS, placeholder: t('还有别的情况？自己写一句加进去'), hint: t('你带的学生大多是什么情况？最多选三个。') },
  { key: 'excludes', title: t('你不想接哪种？'), type: 'multi', options: [...EXCLUDES, NO_EXCLUDE], placeholder: t('还有不想接的？自己写一句'), hint: t('不接谁，跟接谁一样重要。宁可少写一个人群。') },
  { key: 'pains', title: t('家长最常跟你说的一句话是什么？'), type: 'text', placeholder: t('期中 58 分还能补吗，物质的量听不懂'), hint: t('就写家长原话，别改。这句话会变成你视频的题目和开头。多个用逗号隔开，想不起来先跳过。') },
  { key: 'target', type: 'target', title: t('先只抓一类家长，你选哪一类？'), hint: t('先只抓一类。内容和话术都围着她说，做顺了再加第二类。') },
]

/** 把每题的「自己写」合并进答案：自己写的优先，多选的追加。 */
function mergeAnswers(answers) {
  const custom = key => String(answers[`${key}Custom`] ?? '').trim()
  const picked = key => (Array.isArray(answers[key]) ? answers[key] : [])
  return {
    ...answers,
    subject: custom('subject') || String(answers.subject ?? ''),
    grade: custom('grade') || String(answers.grade ?? ''),
    city: String(answers.city ?? ''),
    situations: [...picked('situations'), ...(custom('situations') ? [custom('situations')] : [])],
    excludes: [...picked('excludes'), ...(custom('excludes') ? [custom('excludes')] : [])],
    pains: String(answers.pains ?? ''),
    target: String(answers.target ?? ''),
    entry: String(answers.entry ?? ''),
    fear: String(answers.fear ?? ''),
  }
}

export function OnboardingWizard({ onDone, onSwitch }) {
  useLang()
  const [step, setStep] = React.useState(0)
  const [answers, setAnswers] = React.useState({})
  const list = steps()
  const current = list[step]
  const total = list.length - 1
  const merged = React.useMemo(() => mergeAnswers(answers), [answers])
  const summary = React.useMemo(() => buildProfile(merged), [merged])

  const setAnswer = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }))
  const setCustom = (key, value) => setAnswers(prev => ({ ...prev, [`${key}Custom`]: value }))
  const toggle = (key, value, max) => {
    const picked = Array.isArray(answers[key]) ? answers[key] : []
    if (picked.includes(value)) return setAnswer(key, picked.filter(row => row !== value))
    if (max && picked.length >= max) return toast(t('最多选 {n} 个', { n: max }))
    setAnswer(key, [...picked, value])
  }

  // 保存完就交给首页的「设定已保存」屏，不强制跳去做口播
  const finish = async () => {
    const { positioning, painPoints } = summary
    const data = await dispatchOps([
      { op: 'update_positioning', ...positioning },
      { op: 'set_pain_points', points: painPoints },
    ], { label: t('填好了我的设定') })
    if (data) onDone?.()
  }

  // ---- 第 0 屏：先讲清楚你要做什么 ----
  // 走到最后一题之后 current 是 undefined；这里必须先判空，再读 current.type
  if (current && current.type === 'intro') {
    return (
      <div className="md-onb">
        <p className="md-onb-step">{t('开始之前')}</p>
        <h1 className="md-onb-title">{t('你要的不是粉丝，是一个能加微信的家长')}</h1>
        <ul className="md-onb-intro">
          <li><b>{t('上课厉害，不等于招生厉害')}</b><span>{t('招生是家长付费前那几步：刷到你、看下去、点主页、加微信、来试听。')}</span></li>
          <li><b>{t('先圈一类人')}</b><span>{t('一个账号只面向一类家长；越窄越容易赚到钱。')}</span></li>
          <li><b>{t('人群是洗出来的')}</b><span>{t('平台不会直接给你精准家长，是靠内容一条一条洗出来的。')}</span></li>
        </ul>
        <p className="md-onb-hint">{t('下面 {n} 个问题，帮你定下「你为谁、解决什么问题」。不想被选项框住的地方，都能自己写。', { n: total })}</p>
        <div className="md-onb-actions">
          <button type="button" className="md-pill is-primary" onClick={() => setStep(1)}>{t('开始，先说说你教什么')}</button>
          <span className="md-grow" />
          {onSwitch ? <button type="button" className="md-inline-link" onClick={onSwitch}>{t('我已经填过设定，直接去用')}</button> : null}
        </div>
      </div>
    )
  }

  // ---- 最后一屏：确认定位 ----
  if (!current) {
    const { positioning } = summary
    const gaps = diagnosePositioning({ ...positioning, pains: summary.painPoints }).gaps.slice(0, 2)
    const rows = [
      [t('教什么'), [positioning.subject, positioning.grade, positioning.city].filter(Boolean).join(' · ')],
      [t('目标客户'), positioning.target],
      [t('切入点'), positioning.entry],
      [t('她最怕'), positioning.fear],
      [t('只做'), positioning.only],
      [t('不做'), positioning.notDo],
      [t('说法'), positioning.voice],
      [t('红线'), positioning.redline],
    ].filter(([, value]) => value)
    return (
      <div className="md-onb">
        <p className="md-onb-step">{t('最后一步')}</p>
        <h1 className="md-onb-title">{t('这是你的定位，看看对不对')}</h1>
        <p className="md-onb-sentence">{positioningSentence(positioning)}</p>
        <ul className="md-onb-summary">
          {rows.map(([label, value]) => <li key={label}><span>{label}</span><b>{value}</b></li>)}
        </ul>
        {gaps.length ? (
          <ul className="md-onb-gaps">
            {gaps.map(row => <li key={row.key}>{t('还可以补：{label}。{fix}', { label: t(row.label), fix: t(row.fix) })}</li>)}
          </ul>
        ) : null}
        <p className="md-onb-hint">{t('不对也没关系，之后在「我的设定」里随时能改。')}</p>
        <div className="md-onb-actions">
          <button type="button" className="md-pill" onClick={() => setStep(list.length - 1)}>{t('返回改一下')}</button>
          <button type="button" className="md-pill is-primary" onClick={finish}><Icon name="check" size={14} />{t('就这样，开始做第一条口播')}</button>
        </div>
      </div>
    )
  }

  const picked = answers[current.key]
  const customValue = answers[`${current.key}Custom`] ?? ''
  const canNext = current.type === 'target'
    ? Boolean(String(merged.target ?? '').trim())
    : current.type === 'text'
      ? true
      : current.type === 'single'
        ? Boolean(picked) || Boolean(customValue.trim())
        : true

  // ---- 目标客户 + 人群画像 ----
  if (current.type === 'target') {
    const cards = suggestTargets({
      subject: merged.subject,
      grade: merged.grade,
      city: merged.city,
      situations: merged.situations,
      pains: merged.pains,
    })
    const entries = entrySuggestions({ subject: merged.subject, grade: merged.grade, city: merged.city, pains: merged.pains })
    const choose = card => setAnswers(prev => ({ ...prev, target: card.value, entry: card.entry, fear: card.fear }))
    const setField = (key, value) => setAnswer(key, value)
    return (
      <div className="md-onb">
        <p className="md-onb-step">{t('第 {n} 步 / 共 {m} 步', { n: step, m: total })}</p>
        <h1 className="md-onb-title">{current.title}</h1>
        <p className="md-onb-hint">{current.hint}</p>

        <div className="md-target-list">
          {cards.map((card, index) => {
            const on = String(merged.target ?? '') === card.value
            return (
              <button type="button" key={card.key} className={`md-target-card ${on ? 'is-on' : ''}`} onClick={() => choose(card)}>
                <span className="md-target-tag">{index === 0 ? t('推荐') : t('备选')}</span>
                <b>{card.title}</b>
                <small>{card.why}</small>
                <small className="md-target-fear">{t('她最怕：{fear}', { fear: card.fear })}</small>
              </button>
            )
          })}
        </div>

        <div className="md-target-fields">
          <label className="md-field">
            <span>{t('我为谁（一句话，选上面的卡就自动填好）')}</span>
            <input value={merged.target ?? ''} onChange={event => setField('target', event.target.value)} placeholder={t('比如：北京高二物理，期中掉到及格线、家长急但没方向')} />
          </label>
          <label className="md-field">
            <span>{t('我从哪切进去（不是「补物理」，是具体一块）')}</span>
            <input value={merged.entry ?? ''} onChange={event => setField('entry', event.target.value)} placeholder={t('比如：期中卷丢分最多的那一块')} />
          </label>
          <div className="md-target-chips">
            {entries.map(row => (
              <button type="button" key={row} className={`md-chip ${merged.entry === row ? 'is-on' : ''}`} onClick={() => setField('entry', row)}>{row}</button>
            ))}
          </div>
          <label className="md-field">
            <span>{t('她最怕什么（一句话，钩子就从这里来）')}</span>
            <input value={merged.fear ?? ''} onChange={event => setField('fear', event.target.value)} placeholder={t('比如：怕补了一学期还是原地踏步')} />
          </label>
        </div>

        <div className="md-onb-actions">
          {step > 1 ? <button type="button" className="md-pill" onClick={() => setStep(step - 1)}>{t('上一步')}</button> : null}
          <span className="md-grow" />
          <button type="button" className="md-pill is-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t('下一步')}</button>
        </div>
        <button type="button" className="md-inline-link md-onb-skip" onClick={() => setStep(step + 1)}>{t('先跳过，以后再说')}</button>
      </div>
    )
  }

  return (
    <div className="md-onb">
      <p className="md-onb-step">{t('第 {n} 步 / 共 {m} 步', { n: step, m: total })}</p>
      <h1 className="md-onb-title">{current.title}</h1>
      {current.hint ? <p className="md-onb-hint">{current.hint}</p> : null}

      {current.type === 'text' ? (
        <input
          className="md-onb-input"
          autoFocus
          value={picked ?? ''}
          placeholder={current.placeholder ?? ''}
          onChange={event => setAnswer(current.key, event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && canNext) setStep(step + 1) }}
        />
      ) : (
        <>
          <div className="md-onb-options">
            {current.options.map(option => {
              const on = current.type === 'multi' ? (picked ?? []).includes(option) : picked === option
              return (
                <button
                  type="button"
                  key={option}
                  className={`md-onb-option ${on ? 'is-on' : ''}`}
                  onClick={() => (current.type === 'multi' ? toggle(current.key, option, current.key === 'situations' ? 3 : 0) : setAnswer(current.key, option))}
                >{option}</button>
              )
            })}
          </div>
          <div className="md-onb-custom">
            <Icon name="pen" size={13} />
            <input
              value={customValue}
              placeholder={current.placeholder ?? t('没有合适的？自己写')}
              onChange={event => setCustom(current.key, event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && canNext) setStep(step + 1) }}
            />
          </div>
        </>
      )}

      <div className="md-onb-actions">
        {step > 1 ? <button type="button" className="md-pill" onClick={() => setStep(step - 1)}>{t('上一步')}</button> : null}
        <span className="md-grow" />
        {current.type === 'text' ? <small className="md-muted">{t('可以跳过，之后在「我的设定」里补')}</small> : null}
        <button type="button" className="md-pill is-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t('下一步')}</button>
      </div>
      {onSwitch ? <button type="button" className="md-inline-link md-onb-skip" onClick={onSwitch}>{t('我已经填过设定了，直接去用')}</button> : null}
    </div>
  )
}
