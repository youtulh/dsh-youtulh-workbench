// 前台只做一件事：今天拍这条。念稿、复制标题标签、点「我拍好了」。
import React from 'react'
import { adoptScript, fetchTodayScripts, saveSettings, setDesk, toast, updateContentRow, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { OnboardingWizard } from './onboarding.jsx'
import { Icon } from './ui.jsx'

const MORE = [
  ['content', '做内容', '更多选题、自己写、完整三版'],
  ['dm', '线索表', '上传聊天截图，整理线索'],
  ['diagnose', '出题', '题库、诊断卷'],
  ['students', '学生管理', '学生、班课、课次'],
  ['setup', '我的设定', '定位、说话方式、时间节点'],
]

export function WelcomeView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const configured = Boolean(positioning.subject || positioning.grade || positioning.city)
  const [scripts, setScripts] = React.useState([])
  const [index, setIndex] = React.useState(0)
  const [busy, setBusy] = React.useState('')
  const [dir, setDir] = React.useState('')
  const [feel, setFeel] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const settings = useDesk(s => s.settings) ?? {}
  const [error, setError] = React.useState('')
  const current = scripts[index] ?? null
  const go = view => setDesk({ view, focusId: null })

  const load = React.useCallback((force = false) => {
    if (!configured) return
    setBusy('load')
    setError('')
    fetchTodayScripts(force)
      .then(data => { setScripts(data.scripts ?? []); setIndex(0); setDir(''); setFeel(false) })
      .catch(err => { setError(err.message); toast(err.message, { error: true }) })
      .finally(() => setBusy(''))
  }, [configured])
  React.useEffect(() => { load() }, [load])

  const copy = (value) => {
    navigator.clipboard.writeText(value).then(() => toast(t('已复制')), () => toast(t('复制失败'), { error: true }))
  }
  const copyPack = () => current && copy(`${current.title}\n${(current.tags ?? []).map(tag => `#${tag}`).join(' ')}`)

  const finish = async () => {
    if (!current) return
    setBusy('save')
    try {
      if (!dir) {
        const data = await adoptScript({ topic: current.topic, title: current.title, script: current.script, tags: current.tags ?? [], comment: current.comment ?? '', dm: current.dm ?? '', status: '已拍' })
        setDir(data.dir)
      }
      setFeel(true)
      toast(t('记成已拍了。标题和标签复制给助理去发。'))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const markFeel = async (value) => {
    try {
      if (dir) await updateContentRow(dir, { 手感: value })
      toast(t('记下了'))
      setFeel(false)
      const next = index + 1
      if (next < scripts.length) { setIndex(next); setDir(''); setFeel(false) }
      else { toast(t('今天这条完成了')); setFeel(false) }
    } catch (err) { toast(err.message, { error: true }) }
  }

  if (!configured && !saved) {
    return <div className="md-page md-welcome"><OnboardingWizard onDone={() => { setSaved(true); load() }} onSwitch={() => go('setup')} /></div>
  }

  return (
    <div className="md-page md-today2">
      <header className="md-today2-head">
        <p className="md-eyebrow">{t('今天拍这条')}</p>
        <h1 className="md-today2-title">{current?.topic || (busy ? t('正在准备…') : t('今天还没有稿'))}</h1>
        <details className="md-today2-more">
          <summary>{t('更多')}</summary>
          <div className="md-today2-menu">
            <button type="button" onClick={() => setDesk({
              dialog: {
                title: t('今天想讲什么'),
                submitLabel: t('存下来'),
                fields: [{ name: 'inspiration', label: t('一句话，可留空'), type: 'textarea', rows: 2, placeholder: t('比如：想讲家长总问「来得及吗」') }],
                initial: { inspiration: settings.inspiration ?? '' },
                onSubmit: values => {
                  saveSettings({ inspiration: values.inspiration }).then(ok => { if (ok) { toast(t('记下了，换一批试试')); load(true) } })
                },
              },
            })}><b>{t('今天想讲…')}</b><small>{t('给选题一个灵感；不填就按家长卡点')}</small></button>
            {MORE.map(([view, label, hint]) => <button type="button" key={view} onClick={() => go(view)}><b>{t(label)}</b><small>{t(hint)}</small></button>)}
          </div>
        </details>
      </header>

      {error ? <p className="md-today2-error">{error}</p> : null}

      {current ? (
        <>
          <article className="md-today2-script">
            {String(current.script || '').split('\n').map((line, i) => <p key={i}>{line || '\u00a0'}</p>)}
          </article>
          <div className="md-today2-meta">
            <div><b>{t('标题')}</b><span>{current.title}</span></div>
            <div><b>{t('话题标签')}</b><span>{(current.tags ?? []).map(tag => `#${tag}`).join(' ')}</span></div>
            <button type="button" className="md-pill is-small" onClick={copyPack}>{t('复制标题和标签')}</button>
          </div>
          <div className="md-today2-note">
            <p><b>{t('开头为什么留人')}</b>{current.hookWhy || t('具体场景，让家长觉得说的是自己家。')}</p>
            <p><b>{t('结尾引导')}</b>{current.ctaAdvice || t('留一个轻动作，不报价。')}</p>
          </div>
          {current.warnings?.length ? <p className="md-today2-error">{t('红线已自动改：{list}', { list: current.warnings.join('、') })}</p> : null}
          <footer className="md-today2-actions">
            <button type="button" className="md-pill is-primary" onClick={finish} disabled={busy === 'save'}>{busy === 'save' ? t('保存中…') : t('我拍好了')}</button>
            <button type="button" className="md-pill" onClick={() => { setIndex((index + 1) % Math.max(1, scripts.length)); setDir(''); setFeel(false) }}>{t('换一条')}</button>
            <button type="button" className="md-inline-link" onClick={() => load(true)} disabled={busy === 'load'}>{t('换一批')}</button>
          </footer>
          {feel ? (
            <div className="md-today2-feel">
              <span>{t('发出去感觉怎么样？（可关掉）')}</span>
              {['爆了', '正常', '扑了'].map(value => <button type="button" key={value} className="md-chip" onClick={() => markFeel(value)}>{t(value)}</button>)}
              <button type="button" className="md-inline-link" onClick={() => setFeel(false)}>{t('关掉')}</button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
