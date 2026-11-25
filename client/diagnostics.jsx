// 试听诊断：出卷、预览、导入回传、生成家长话术。
import React from 'react'
import { analyzeDiagnostic, createDiagnostic, createPostDiagnostic, fetchDiagnosticSpec, fetchDiagnostics, importDiagnosticResult, setDesk, toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { Dialog, Icon } from './ui.jsx'

const GENDERS = [{ value: '', label: '不说' }, { value: '男生', label: '男生' }, { value: '女生', label: '女生' }]
const LEVELS = [{ value: '基础薄弱', label: '基础薄弱' }, { value: '中等', label: '中等' }, { value: '偏上', label: '偏上' }]
const COUNTS = [{ value: '15', label: '15 题' }, { value: '10', label: '10 题' }]

const DEMO = {
  name: '小雪', grade: '高一', gender: '女生', level: '基础薄弱', score: '58',
  pain: '期中 58 分，氧化还原一听就乱；配平不知道先标价还是先凑系数',
  resistances: '概念、计算、审题', goal: '先补化合价，再练最小公倍数',
  lessonTitle: '氧化还原配平', subject: '化学', at: '2026-11-30 周日 19:00',
  code: 'TRIAL-HX-1130', topic: '从标化合价一路配平到氧化还原',
  brandName: '姜老师化学', brandTeacher: '姜老师',
}

export function DiagnosticsView() {
  useLang()
  const [data, setData] = React.useState(null)
  const [selected, setSelected] = React.useState('')
  const [spec, setSpec] = React.useState(null)
  const [busy, setBusy] = React.useState('')
  const [analysis, setAnalysis] = React.useState(null)
  const [analysisSource, setAnalysisSource] = React.useState('')
  const [preview, setPreview] = React.useState(null)
  const prefill = useDesk(s => s.diagPrefill)

  const load = React.useCallback(() => {
    return fetchDiagnostics()
      .then(next => {
        setData(next)
        setSelected(prev => prev && next.rows.some(row => row.id === prev) ? prev : (next.rows[0]?.id ?? ''))
      })
      .catch(err => toast(err.message, { error: true }))
  }, [])

  React.useEffect(() => { load() }, [load])
  React.useEffect(() => {
    if (!prefill) return
    setDesk({ diagPrefill: null })
    openCreate(prefill)
  }, [prefill])

  React.useEffect(() => {
    if (!selected) { setSpec(null); return }
    fetchDiagnosticSpec(selected).then(next => setSpec(next)).catch(() => setSpec(null))
    setAnalysis(null)
  }, [selected])

  const rows = data?.rows ?? []
  const current = rows.find(row => row.id === selected)
  const brand = data?.brand ?? {}

  const copy = (text) => {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(t('已复制')), () => toast(t('复制失败，手动选中吧'), { error: true }))
    else toast(t('这个环境不能直接复制'), { error: true })
  }

  const openPreview = (kind = 'pre') => {
    if (!current) return
    setPreview({ kind, url: `media-desk/diagnostics/preview?id=${encodeURIComponent(current.id)}&kind=${kind}` })
  }

  const openCreate = (prefill = {}) => setDesk({
    dialog: {
      title: t('出一份试听诊断卷'),
      submitLabel: t('生成诊断卷'),
      fields: [
        { name: 'studentName', label: t('学生/家长称呼'), placeholder: t('比如：小雪') },
        { name: 'studentGrade', label: t('孩子年级'), placeholder: t('高一') },
        { name: 'gender', label: t('性别（只影响例子，不影响难度）'), type: 'select', options: GENDERS },
        { name: 'level', label: t('当前水平'), type: 'select', options: LEVELS },
        { name: 'score', label: t('最近分数（可不填）'), placeholder: t('比如：58') },
        { name: 'pain', label: t('卡点/家长原话'), type: 'textarea', rows: 2, placeholder: t('比如：期中 58，氧化还原一听就乱') },
        { name: 'resistances', label: t('学习阻力（逗号分隔）'), placeholder: t('计算、概念、审题、作业、动力') },
        { name: 'goal', label: t('这次试听想先解决什么'), placeholder: t('先补化合价') },
        { name: 'lessonTitle', label: t('课程名'), required: true, placeholder: t('氧化还原配平') },
        { name: 'subject', label: t('科目'), placeholder: t('化学') },
        { name: 'grade', label: t('课程年级'), placeholder: t('高一') },
        { name: 'at', label: t('上课时间'), required: true, placeholder: t('2026-11-30 周日 19:00') },
        { name: 'code', label: t('课次编码'), placeholder: t('TRIAL-HX-1130') },
        { name: 'topic', label: t('试听重点（一句话）'), placeholder: t('从化合价一路配平到氧化还原') },
        { name: 'brandName', label: t('品牌名'), placeholder: brand.name || t('比如：姜老师化学') },
        { name: 'brandTeacher', label: t('老师署名'), placeholder: brand.teacher || t('姜老师') },
        { name: 'count', label: t('题量'), type: 'select', options: COUNTS },
      ],
      initial: {
        gender: prefill.gender ?? '', level: prefill.level ?? '基础薄弱', count: '15',
        subject: prefill.subject ?? '', grade: prefill.grade ?? '',
        studentName: prefill.name ?? '', studentGrade: prefill.grade ?? '',
        score: prefill.score ?? '', pain: prefill.pain ?? '', resistances: prefill.resistances ?? '', goal: prefill.goal ?? '',
        lessonTitle: prefill.lessonTitle ?? '', at: prefill.at ?? '', code: prefill.code ?? '', topic: prefill.topic ?? '',
        brandName: prefill.brandName ?? brand.name ?? '', brandTeacher: prefill.brandTeacher ?? brand.teacher ?? '',
      },
      onSubmit: async values => {
        setBusy('create')
        toast(t('正在出诊断卷，约 10–20 秒…'))
        try {
          const res = await createDiagnostic({
            brand: { name: values.brandName || brand.name, teacher: values.brandTeacher || brand.teacher, logo: brand.logo ?? '', mark: brand.mark ?? '' },
            lesson: { title: values.lessonTitle, subject: values.subject, grade: values.grade || values.studentGrade, at: values.at, code: values.code, topic: values.topic },
            student: {
              name: values.studentName, grade: values.studentGrade || values.grade, gender: values.gender,
              level: values.level, score: values.score, pain: values.pain, goal: values.goal,
              resistances: String(values.resistances ?? '').split(/[，,、;；\n]+/).map(row => row.trim()).filter(Boolean),
            },
            count: Number(values.count) || 15,
          })
          toast(res.source === 'template' ? t('模型没通，先用化学模板卷；其他科目建议重试') : t('诊断卷出好了'))
          await load()
          setSelected(res.row.id)
          setPreview({ kind: 'pre', url: `media-desk/diagnostics/preview?id=${encodeURIComponent(res.row.id)}&kind=pre` })
        } catch (err) { toast(err.message, { error: true }) }
        setBusy('')
      },
    },
  })

  const openImport = () => {
    if (!current) return
    setDesk({
      dialog: {
        title: t('导入诊断结果'),
        submitLabel: t('导入'),
        fields: [{ name: 'payload', label: t('把学生发回的「结果码」或 JSON 粘在这里'), type: 'textarea', rows: 7, required: true, placeholder: 'YT-DIAG1:...' }],
        onSubmit: async values => {
          try {
            const res = await importDiagnosticResult({ payload: values.payload.trim() })
            toast(t('结果导入好了：{score} 分', { score: res.score?.percent ?? 0 }))
            await load()
          } catch (err) { toast(err.message, { error: true }) }
        },
      },
    })
  }

  const analyze = async (kind = 'pre') => {
    if (!current) return
    setBusy(`analyze-${kind}`)
    try {
      const res = await analyzeDiagnostic(current.id, kind)
      setAnalysis(res.analysis)
      setAnalysisSource(res.source)
      await load()
      toast(res.source === 'model' ? t('家长话术生成好了') : t('模型没通，先用数据拼了一版'))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const openPost = () => {
    if (!current) return
    setDesk({
      dialog: {
        title: t('生成课后检测'),
        submitLabel: t('生成'),
        fields: [{ name: 'notes', label: t('这节课讲了什么、孩子哪一步跟上了/没跟上'), type: 'textarea', rows: 3, placeholder: t('比如：讲了标价和最小公倍数，配平会了，HNO3 拆 2+6 还没跟上') }],
        onSubmit: async values => {
          setBusy('post')
          try {
            const res = await createPostDiagnostic(current.id, values.notes)
            toast(t('课后检测已生成，打开让孩子做'))
            await load()
            setSpec(res.spec ? { row: current, spec: res.spec } : spec)
          } catch (err) { toast(err.message, { error: true }) }
          setBusy('')
        },
      },
    })
  }

  return (
    <div className="md-page md-diagnostics">
      <header className="md-page-head">
        <div>
          <h1>{t('试听诊断')}</h1>
          <p className="md-page-sub">{t('先诊断、再试听、课后复测。每份卷子都带着品牌、上课时间和课次编码。')}</p>
        </div>
        <span className="md-grow" />
        <button type="button" className="md-inline-link" onClick={() => openCreate(DEMO)}>{t('用示例填一遍')}</button>
        <button type="button" className="md-inline-link" disabled={busy === 'create'} onClick={() => openCreate()}>{busy === 'create' ? t('正在出卷…') : t('出一份诊断卷')}</button>
        {current ? <button type="button" className="md-pill is-small" onClick={openImport}>{t('导入结果')}</button> : null}
      </header>

      {busy === 'create' ? <div className="md-diag-loading"><span className="md-shimmer">{t('正在生成诊断卷…')}</span></div> : null}

      {!data ? <p className="md-muted">{t('读取中…')}</p> : rows.length === 0 ? (
        <div className="md-works-empty">
          <p>{t('还没有试听诊断。先出一份卷子，发给家长做完，再把结果导回来。')}</p>
          <button type="button" className="md-pill is-primary" onClick={openCreate}>{t('出一份诊断卷')}</button>
        </div>
      ) : (
        <div className="md-diag-layout">
          <aside className="md-diag-list">
            {rows.map(row => (
              <button type="button" key={row.id} className={`md-diag-row ${row.id === selected ? 'is-on' : ''}`} onClick={() => setSelected(row.id)}>
                <b>{row.student || t('未填学生')}{row.grade ? ` · ${row.grade}` : ''}</b>
                <span>{row.lesson || t('未填课程')}</span>
                <small>{row.at || t('时间待定')}</small>
                <em className={`md-diag-status is-${row.status}`}>{t(row.status)}</em>
              </button>
            ))}
          </aside>

          <main className="md-diag-detail">
            {current ? (
              <>
                <div className="md-diag-head">
                  <div>
                    <p className="md-eyebrow">{current.brand || t('试听诊断')} · {current.code || current.id}</p>
                    <h2>{current.lesson || t('未命名课程')}</h2>
                    <p className="md-muted">{current.at || t('时间待定')} · {current.student || t('未填学生')} · {current.grade || ''}</p>
                  </div>
                  <span className="md-grow" />
                  <button type="button" className="md-pill is-small" onClick={() => openPreview('pre')}>{t('打开诊断卷')}</button>
                </div>

                <div className="md-diag-stats">
                  <div><b>{current.preScore || '—'}</b><span>{t('课前得分')}</span></div>
                  <div><b>{current.postScore || '—'}</b><span>{t('课后得分')}</span></div>
                  <div><b>{current.progress || '—'}</b><span>{t('进步')}</span></div>
                  <div><b>{spec?.spec?.questions?.length ?? '—'}</b><span>{t('题数')}</span></div>
                </div>

                {spec?.spec?.layers?.length ? (
                  <div className="md-diag-layers">
                    <b>{t('诊断分层')}</b>
                    <ul>{spec.spec.layers.map(layer => <li key={layer.id}><span>{layer.name}</span><small>{layer.desc}</small></li>)}</ul>
                  </div>
                ) : null}

                <div className="md-diag-actions">
                  <button type="button" className="md-pill is-small" onClick={openImport}>{t('导入回传结果')}</button>
                  <button type="button" className="md-pill is-small is-primary" onClick={() => analyze('pre')} disabled={!current.preScore || busy === 'analyze-pre'}>
                    <Icon name="spark" size={13} />{busy === 'analyze-pre' ? t('正在写话术…') : t('生成课前话术')}
                  </button>
                  <button type="button" className="md-pill is-small" onClick={openPost} disabled={busy === 'post'}>{busy === 'post' ? t('正在出卷…') : t('生成课后检测')}</button>
                  <button type="button" className="md-pill is-small" onClick={() => openPreview('post')} disabled={!current.postScore && current.status !== '待课后'}>{t('打开课后检测')}</button>
                  {current.postScore ? <button type="button" className="md-pill is-small" onClick={() => analyze('post')} disabled={busy === 'analyze-post'}>{busy === 'analyze-post' ? t('正在写话术…') : t('生成课后话术')}</button> : null}
                </div>

                {analysis ? (
                  <div className="md-diag-analysis">
                    <div className="md-diag-analysis-head">
                      <b>{t('诊断说明和家长话术')}</b>
                      <span className={`md-source ${analysisSource === 'local' ? 'is-local' : ''}`}>{analysisSource === 'model' ? t('模型生成') : t('数据兜底')}</span>
                    </div>
                    <p className="md-diag-summary">{analysis.summary}</p>
                    {analysis.findings?.length ? <ul>{analysis.findings.map(row => <li key={row}>{row}</li>)}</ul> : null}
                    <label className="md-field">
                      <span>{t('直接发家长（可改）')}</span>
                      <textarea rows={5} readOnly value={analysis.parentScript} />
                    </label>
                    <div className="md-diag-actions">
                      <button type="button" className="md-inline-link" onClick={() => copy(analysis.parentScript)}>{t('复制话术')}</button>
                      {analysis.trialFocus?.length ? <span className="md-muted">{t('试听重点：{list}', { list: analysis.trialFocus.join('、') })}</span> : null}
                    </div>
                  </div>
                ) : null}

                <p className="md-muted md-diag-hint">{t('流程：出卷 → 发给家长 → 孩子做完点「保存结果给老师」→ 把结果码粘回「导入回传结果」。')}</p>
              </>
            ) : <p className="md-muted">{t('选一份诊断看详情')}</p>}
          </main>
        </div>
      )}

      {preview ? (
        <Dialog title={preview.kind === 'post' ? t('课后检测预览') : t('诊断卷预览')} onClose={() => setPreview(null)} width={920}>
          <div className="md-diag-preview">
            <iframe title={t('诊断卷预览')} src={preview.url} />
          </div>
          <div className="md-diag-preview-foot">
            <span className="md-muted">{t('可以直接在这里试填；发给家长时再打开独立页面。')}</span>
            <span className="md-grow" />
            <button type="button" className="md-inline-link" onClick={() => window.open(preview.url, '_blank', 'noopener')}>{t('在新窗口打开')}</button>
            <button type="button" className="md-pill is-small" onClick={() => setPreview(null)}>{t('关闭')}</button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
