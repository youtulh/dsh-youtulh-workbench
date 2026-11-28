// 出题：题库优先。先上传卷子，再用一句话出诊断卷。
import React from 'react'
import { confirmBankQuestions, diagnosticFromBrief, extractPaper, fetchPapers, revealDiagnostic, setDesk, toast, uploadPaper, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'

export function DiagnosticsView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const [papers, setPapers] = React.useState([])
  const [questions, setQuestions] = React.useState([])
  const [brief, setBrief] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [error, setError] = React.useState('')
  const [result, setResult] = React.useState(null)

  const load = React.useCallback(() => fetchPapers().then(data => {
    setPapers(data.papers ?? [])
    setQuestions(data.questions ?? [])
  }).catch(err => toast(err.message, { error: true })), [])
  React.useEffect(() => { load() }, [load])

  const confirmed = questions.filter(row => row.status === '已确认')
  const pending = questions.filter(row => row.status === '待确认')

  const upload = async (file) => {
    if (!file) return
    setBusy('upload')
    setError('')
    try {
      const paper = await uploadPaper(file)
      await extractPaper(paper.id)
      await load()
      toast(t('卷子拆好了，确认后就能出题'))
    } catch (err) { setError(err.message); toast(err.message, { error: true }) }
    setBusy('')
  }

  const confirmAll = async () => {
    if (!pending.length) return
    try {
      await confirmBankQuestions(pending.map(row => row.id))
      await load()
      toast(t('已入库 {n} 道题', { n: pending.length }))
    } catch (err) { toast(err.message, { error: true }) }
  }

  const make = async () => {
    if (!confirmed.length) return setError(t('题库还是空的：先上传卷子并确认入库'))
    setBusy('make')
    setError('')
    try {
      const data = await diagnosticFromBrief({ brief: brief.trim(), count: /10\s*题/.test(brief) ? 10 : 15 })
      setResult(data)
    } catch (err) { setError(err.message); toast(err.message, { error: true }) }
    setBusy('')
  }

  const placeholder = `比如：${positioning.grade || '高一'}${positioning.subject || '化学'}，氧化还原和配平最弱，15 题，比期中稍难`

  return (
    <div className="md-page md-exam">
      <header className="md-page-head">
        <div>
          <h1>{t('出题')}</h1>
          <p className="md-page-sub">{t('先放卷子进题库，再用一句话说清楚，直接从题库组一张诊断卷。')}</p>
        </div>
      </header>

      <section className="md-exam-step">
        <div className="md-exam-step-head">
          <span className="md-exam-no">1</span>
          <div><b>{t('把卷子放进题库')}</b><small>{t('PDF / Word / 图片 / 文本都行，拆完确认入库')}</small></div>
          <span className="md-grow" />
          <label className="md-pill is-primary">
            {busy === 'upload' ? t('正在拆题…') : t('上传卷子')}
            <input type="file" accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) upload(file) }} />
          </label>
        </div>
        <p className="md-muted">{t('已入库 {n} 道题', { n: confirmed.length })}{pending.length ? t('，还有 {n} 道待确认', { n: pending.length }) : ''}</p>
        {pending.length ? <button type="button" className="md-pill" onClick={confirmAll}>{t('确认 {n} 道入库', { n: pending.length })}</button> : null}
        {papers.length ? <ul className="md-exam-papers">{papers.slice(-3).reverse().map(paper => <li key={paper.id}><span>{paper.name}</span><em>{paper.count} 题 · {t(paper.status)}</em></li>)}</ul> : null}
      </section>

      <section className="md-exam-step">
        <div className="md-exam-step-head">
          <span className="md-exam-no">2</span>
          <div><b>{t('一句话说要考什么')}</b><small>{t('年级、科目、最弱的知识点、题量、难度，随便说')}</small></div>
        </div>
        <textarea rows={3} value={brief} onChange={event => setBrief(event.target.value)} placeholder={placeholder} />
        <div className="md-exam-foot">
          <span className="md-muted">{confirmed.length ? t('会从 {n} 道已确认题里选，不编新题', { n: confirmed.length }) : t('先完成第 1 步')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-primary" onClick={make} disabled={busy === 'make' || !confirmed.length}>{busy === 'make' ? t('正在组卷…') : t('出诊断卷')}</button>
        </div>
        {error ? <p className="md-exam-error">{error}</p> : null}
      </section>

      {result ? (
        <section className="md-exam-result">
          <div>
            <p className="md-eyebrow">{t('诊断卷好了')}</p>
            <h2>{result.spec?.title || result.row?.lesson || t('诊断卷')}</h2>
            <p className="md-muted">{result.spec?.questions?.length ?? 0} 题 · {result.spec?.questions?.map(row => row.difficulty).filter(Boolean).join(' / ')}</p>
          </div>
          <span className="md-grow" />
          <a className="md-pill is-primary" href={`media-desk/diagnostics/download?id=${encodeURIComponent(result.row?.id ?? '')}&kind=pre`} download>{t('下载卷子')}</a>
          <button type="button" className="md-pill" onClick={() => revealDiagnostic(result.row.id).catch(err => toast(err.message, { error: true }))}>{t('打开文件夹')}</button>
          <button type="button" className="md-inline-link" onClick={() => setResult(null)}>{t('换一套')}</button>
        </section>
      ) : null}
    </div>
  )
}
