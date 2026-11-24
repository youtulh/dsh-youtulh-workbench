// 新用户问卷：一屏一个问题，最后给一张「你的定位」让人确认，再开始做口播。
import React from 'react'
import { dispatchOps, setDesk, toast } from './desk.js'
import { t, useLang } from './i18n.js'
import { EXCLUDES, GRADES, SITUATIONS, SUBJECTS, buildProfile } from '../src/onboarding.js'
import { Icon } from './ui.jsx'

const NO_EXCLUDE = '都不排斥'

const steps = () => [
  { key: 'subject', title: t('你教什么科目？'), type: 'single', options: [...SUBJECTS, t('其他')], hint: t('先选一个，以后可以改') },
  { key: 'grade', title: t('主要带哪个年级？'), type: 'single', options: GRADES },
  { key: 'city', title: t('你在哪个城市？'), type: 'text', placeholder: t('北京；只做线上就写「线上」'), hint: t('只招本地的，这一步很关键：外地家长问过来要能一眼看出你不接') },
  { key: 'situations', title: t('你的学生主要是哪种情况？'), type: 'multi', options: SITUATIONS, hint: t('最多选三个') },
  { key: 'excludes', title: t('你不想接哪种？'), type: 'multi', options: [...EXCLUDES, t(NO_EXCLUDE)], hint: t('选了就会在生成时避开这类家长') },
  { key: 'pains', title: t('家长最常跟你说的一句话是什么？'), type: 'text', placeholder: t('期中 58 分还能补吗，物质的量听不懂'), hint: t('多个用逗号隔开；想不起来可以跳过') },
]

export function OnboardingWizard({ onDone, onSwitch }) {
  useLang()
  const [step, setStep] = React.useState(0)
  const [answers, setAnswers] = React.useState({})
  const list = steps()
  const current = list[step]
  const summary = React.useMemo(() => buildProfile(answers), [answers])

  const setAnswer = (key, value) => setAnswers(prev => ({ ...prev, [key]: value }))
  const toggle = (key, value, max) => {
    const picked = Array.isArray(answers[key]) ? answers[key] : []
    if (picked.includes(value)) return setAnswer(key, picked.filter(row => row !== value))
    if (max && picked.length >= max) return toast(t('最多选 {n} 个', { n: max }))
    setAnswer(key, [...picked, value])
  }

  const finish = () => {
    const { positioning, painPoints } = summary
    dispatchOps([
      { op: 'update_positioning', ...positioning },
      { op: 'set_pain_points', points: painPoints },
    ], { label: t('填好了我的设定') })
    onDone?.()
  }

  // 最后一屏：把拼出来的定位给对方看，确认了才写进去
  if (!current) {
    const { positioning } = summary
    const rows = [
      [t('教什么'), [positioning.subject, positioning.grade, positioning.city].filter(Boolean).join(' · ')],
      [t('只做'), positioning.only],
      [t('不做'), positioning.notDo],
      [t('说法'), positioning.voice],
      [t('红线'), positioning.redline],
    ].filter(([, value]) => value)
    return (
      <div className="md-onb">
        <p className="md-onb-step">{t('最后一步')}</p>
        <h1 className="md-onb-title">{t('这是你的定位，看看对不对')}</h1>
        <ul className="md-onb-summary">
          {rows.map(([label, value]) => <li key={label}><span>{label}</span><b>{value}</b></li>)}
        </ul>
        <p className="md-onb-hint">{t('不对也没关系，之后在「我的设定」里随时能改。')}</p>
        <div className="md-onb-actions">
          <button type="button" className="md-pill" onClick={() => setStep(list.length - 1)}>{t('返回改一下')}</button>
          <button type="button" className="md-pill is-primary" onClick={finish}><Icon name="check" size={14} />{t('就这样，开始做第一条口播')}</button>
        </div>
      </div>
    )
  }

  const picked = answers[current.key]
  const canNext = current.type === 'single'
    ? Boolean(picked) || (current.key === 'subject' && Boolean(answers.subjectOther))
    : true

  return (
    <div className="md-onb">
      <p className="md-onb-step">{t('第 {n} 步 / 共 {m} 步', { n: step + 1, m: list.length })}</p>
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
      )}

      {current.key === 'subject' && picked === t('其他') ? (
        <input
          className="md-onb-input"
          autoFocus
          value={answers.subjectOther ?? ''}
          placeholder={t('写科目，比如：信息技术')}
          onChange={event => setAnswer('subjectOther', event.target.value)}
        />
      ) : null}

      <div className="md-onb-actions">
        {step > 0 ? <button type="button" className="md-pill" onClick={() => setStep(step - 1)}>{t('上一步')}</button> : null}
        <span className="md-grow" />
        {current.key === 'pains' ? <button type="button" className="md-inline-link" onClick={() => setStep(step + 1)}>{t('跳过')}</button> : null}
        <button type="button" className="md-pill is-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t('下一步')}</button>
      </div>
      {onSwitch ? <button type="button" className="md-inline-link md-onb-skip" onClick={onSwitch}>{t('我已经填过设定了，直接去用')}</button> : null}
    </div>
  )
}
