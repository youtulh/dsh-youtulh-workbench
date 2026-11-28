// 试听诊断：出卷、预览、导入回传、生成家长话术。
import React from 'react'
import { analyzeDiagnostic, archiveDiagnostic, confirmBankQuestions, createDiagnostic, createPostDiagnostic, duplicateDiagnostic, extractPaper, fetchDiagnosticSpec, fetchDiagnostics, fetchPapers, importDiagnosticResult, removeBankQuestion, revealDiagnostic, setDesk, toast, updateBankQuestion, updateDiagnostic, uploadPaper, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'

const GENDERS = [{ value: '', label: '不说' }, { value: '男生', label: '男生' }, { value: '女生', label: '女生' }]
const LEVELS = [{ value: '基础薄弱', label: '基础薄弱' }, { value: '中等', label: '中等' }, { value: '偏上', label: '偏上' }]
const COUNTS = [{ value: '15', label: '15 题' }, { value: '10', label: '10 题' }]

const DEMO = {
  name: '小雪', grade: '高一', gender: '女生', level: '基础薄弱', score: '58',
  pain: '期中 58 分，氧化还原一听就乱；配平不知道先标价还是先凑系数',
  resistances: '概念、计算、审题', goal: '先补化合价，再练最小公倍数',
  lessonTitle: '氧化还原配平', subject: '化学', at: '2026-11-30 周日 19:00',
  code: 'TRIAL-HX-1130', topic: '从标化合价一路配平到氧化还原',
  talkAt: '周日晚 7 点', altAt: '周六上午 10 点', temperature: 'A3 已经急了',
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
  const [analysisKind, setAnalysisKind] = React.useState('pre')
  const [query, setQuery] = React.useState('')
  const [showArchived, setShowArchived] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [form, setForm] = React.useState({})
  const [formError, setFormError] = React.useState('')
  const [bankOpen, setBankOpen] = React.useState(false)
  const [papers, setPapers] = React.useState([])
  const [bankQuestions, setBankQuestions] = React.useState([])
  const prefill = useDesk(s => s.diagPrefill)

  const load = React.useCallback(() => {
    return fetchDiagnostics()
      .then(next => {
        setData(next)
        setSelected(prev => prev && next.rows.some(row => row.id === prev) ? prev : '')
      })
      .catch(err => toast(err.message, { error: true }))
  }, [])

  React.useEffect(() => { load() }, [load])

  const loadBank = React.useCallback(() => fetchPapers().then(next => { setPapers(next.papers ?? []); setBankQuestions(next.questions ?? []) }).catch(() => {}), [])
  React.useEffect(() => { loadBank() }, [loadBank])
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
  const visible = rows.filter(row => {
    if (!showArchived && row.status === '已归档') return false
    const q = query.trim().toLowerCase()
    return !q || [row.student, row.lesson, row.code, row.at, row.brand].some(value => String(value ?? '').toLowerCase().includes(q))
  })
  const current = visible.find(row => row.id === selected) ?? null
  const brand = data?.brand ?? {}

  const copy = (text) => {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(t('已复制')), () => toast(t('复制失败，手动选中吧'), { error: true }))
    else toast(t('这个环境不能直接复制'), { error: true })
  }

  const makeForm = (prefill = {}) => ({
    gender: '', level: '基础薄弱', count: '15', subject: '', grade: prefill.grade ?? '',
    score: prefill.score ?? '',
    pain: prefill.pain ?? '', resistances: prefill.resistances ?? '', goal: prefill.goal ?? '',
    lessonTitle: prefill.lessonTitle ?? '', at: prefill.at ?? '', talkAt: prefill.talkAt ?? '', altAt: prefill.altAt ?? '', code: prefill.code ?? '', topic: prefill.topic ?? '',
    temperature: prefill.temperature ?? '', bankPaperId: prefill.bankPaperId ?? '',
    brandName: prefill.brandName ?? brand.name ?? '', brandTeacher: prefill.brandTeacher ?? brand.teacher ?? '',
    ...prefill,
    studentName: prefill.name ?? prefill.studentName ?? '', studentGrade: prefill.grade ?? prefill.studentGrade ?? '',
  })

  const openCreate = (prefill = {}) => {
    setForm(makeForm(prefill))
    setFormError('')
    setCreating(true)
    requestAnimationFrame(() => document.getElementById('diag-create')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submitCreate = async () => {
    if (!String(form.lessonTitle ?? '').trim() || !String(form.at ?? '').trim()) {
      setFormError(t('课程名和上课时间是必填。'))
      toast(t('课程名和上课时间是必填'), { error: true })
      return
    }
    const confirmedCount = bankQuestions.filter(row => row.status === '已确认').length
    if (!confirmedCount) {
      setFormError(t('题库里还没有已确认的题，先上传卷子并确认入库。'))
      toast(t('先上传卷子并确认入库'), { error: true })
      return
    }
    setFormError('')
    setBusy('create')
    toast(t('正在从题库组卷…'))
    try {
      const res = await createDiagnostic({
        brand: { name: form.brandName || brand.name, teacher: form.brandTeacher || brand.teacher, logo: brand.logo ?? '', mark: brand.mark ?? '' },
        lesson: { title: form.lessonTitle, subject: form.subject, grade: form.grade || form.studentGrade, at: form.at, talkAt: form.talkAt, altAt: form.altAt, code: form.code, topic: form.topic },
        student: {
          name: form.studentName, grade: form.studentGrade || form.grade, gender: form.gender,
          level: form.level, score: form.score, pain: form.pain, goal: form.goal, temperature: form.temperature,
          resistances: String(form.resistances ?? '').split(/[，,、;；\n]+/).map(row => row.trim()).filter(Boolean),
        },
        count: Number(form.count) || 15,
        bank: { paperIds: form.bankPaperId ? [form.bankPaperId] : [], subject: form.subject, grade: form.grade || form.studentGrade, count: Number(form.count) || 15 },
      })
      toast(res.source === 'bank' ? t('已从题库组卷') : t('诊断卷出好了'))
      setCreating(false)
      await load()
      setSelected('')
      toast(t('诊断卷已存好，在下面列表里；要发给学生就点「打开所在文件夹」。'))
    } catch (err) {
      setFormError(err.message)
      toast(err.message, { error: true })
    }
    setBusy('')
  }

  const uploadPaperFile = async (file) => {
    if (!file) return
    setBusy('paper')
    try {
      const paper = await uploadPaper(file)
      toast(t('卷子传上来了，正在拆题…'))
      await extractPaper(paper.id)
      await loadBank()
      toast(t('拆题好了，去题库里确认'))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const extractOne = async (paper) => {
    setBusy(`paper-${paper.id}`)
    try {
      await extractPaper(paper.id)
      await loadBank()
      toast(t('拆题好了'))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const confirmPaper = async (paper) => {
    const ids = bankQuestions.filter(row => row.paperId === paper.id && row.status !== '已确认').map(row => row.id)
    if (!ids.length) return toast(t('这份卷子的题都确认过了'))
    try {
      await confirmBankQuestions(ids)
      await loadBank()
      toast(t('已确认 {n} 道题', { n: ids.length }))
    } catch (err) { toast(err.message, { error: true }) }
  }

  const editQuestion = (question) => setDesk({
    dialog: {
      title: t('改这道题'),
      submitLabel: t('保存'),
      fields: [
        { name: 'stem', label: t('题干'), type: 'textarea', rows: 3 },
        { name: 'knowledge', label: t('知识点') },
        { name: 'difficulty', label: t('难度'), type: 'select', options: ['基础', '中档', '期中', '压轴'].map(value => ({ value, label: t(value) })) },
        { name: 'answer', label: t('答案（A/B/C/D）') },
        { name: 'explain', label: t('解析'), type: 'textarea', rows: 2 },
      ],
      initial: { stem: question.stem, knowledge: question.knowledge, difficulty: question.difficulty, answer: 'ABCD'[question.answer] ?? '', explain: question.explain },
      onSubmit: async values => {
        try {
          await updateBankQuestion(question.id, {
            stem: values.stem, knowledge: values.knowledge, difficulty: values.difficulty,
            answer: /^[A-Da-d]$/.test(values.answer) ? 'ABCD'.indexOf(values.answer.toUpperCase()) : undefined,
            explain: values.explain,
          })
          await loadBank()
          toast(t('改好了'))
        } catch (err) { toast(err.message, { error: true }) }
      },
    },
  })

  const textField = (name, label, placeholder, { wide = false, type = 'text' } = {}) => (
    <label className={`md-create-field${wide ? ' is-wide' : ''}`}>
      <span>{label}</span>
      <input type={type} value={form[name] ?? ''} placeholder={placeholder} onChange={event => setField(name, event.target.value)} />
    </label>
  )
  const areaField = (name, label, placeholder, { wide = true } = {}) => (
    <label className={`md-create-field${wide ? ' is-wide' : ''}`}>
      <span>{label}</span>
      <textarea rows={2} value={form[name] ?? ''} placeholder={placeholder} onChange={event => setField(name, event.target.value)} />
    </label>
  )
  const selectField = (name, label, options) => (
    <label className="md-create-field">
      <span>{label}</span>
      <select value={form[name] ?? ''} onChange={event => setField(name, event.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )

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

  const analyze = async (kind = 'pre', note = '') => {
    if (!current) return
    setBusy(`analyze-${kind}`)
    try {
      const res = await analyzeDiagnostic(current.id, kind, note)
      setAnalysis(res.analysis)
      setAnalysisKind(kind)
      setAnalysisSource(res.source === 'local' ? 'local' : 'model')
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

  const openEdit = () => {
    if (!current) return
    setDesk({
      dialog: {
        title: t('编辑诊断信息'),
        submitLabel: t('保存'),
        fields: [
          { name: 'student', label: t('学生/家长称呼'), placeholder: t('小雪') },
          { name: 'grade', label: t('孩子年级'), placeholder: t('高一') },
          { name: 'lesson', label: t('课程名'), placeholder: t('氧化还原配平') },
          { name: 'subject', label: t('科目'), placeholder: t('化学') },
          { name: 'at', label: t('上课时间'), placeholder: t('2026-11-30 周日 19:00') },
          { name: 'code', label: t('课次编码'), placeholder: t('TRIAL-HX-1130') },
          { name: 'brand', label: t('品牌名'), placeholder: t('姜老师化学') },
          { name: 'note', label: t('备注'), type: 'textarea', rows: 2 },
        ],
        initial: { student: current.student, grade: current.grade, lesson: current.lesson, subject: current.subject, at: current.at, code: current.code, brand: current.brand, note: current.note },
        onSubmit: async values => {
          try {
            await updateDiagnostic(current.id, {
              student: { name: values.student, grade: values.grade },
              lesson: { title: values.lesson, subject: values.subject, at: values.at, code: values.code },
              brand: { name: values.brand },
              note: values.note,
            })
            toast(t('诊断信息已更新'))
            await load()
          } catch (err) { toast(err.message, { error: true }) }
        },
      },
    })
  }

  const openDuplicate = () => {
    if (!current) return
    setDesk({
      dialog: {
        title: t('复制一份给另一个学生'),
        submitLabel: t('复制'),
        fields: [
          { name: 'student', label: t('新学生称呼'), placeholder: t('比如：小周') },
          { name: 'grade', label: t('年级'), placeholder: current.grade || t('高一') },
        ],
        initial: { student: '', grade: current.grade || '' },
        onSubmit: async values => {
          try {
            const res = await duplicateDiagnostic(current.id, { name: values.student, grade: values.grade })
            toast(t('已复制一份，原卷不动'))
            await load()
            setSelected(res.row.id)
          } catch (err) { toast(err.message, { error: true }) }
        },
      },
    })
  }

  const openArchive = () => {
    if (!current) return
    const archived = current.status === '已归档'
    setDesk({
      dialog: {
        title: archived ? t('恢复这份诊断') : t('归档这份诊断'),
        submitLabel: archived ? t('恢复') : t('归档'),
        fields: [{ name: '_hint', type: 'hidden', label: archived ? t('恢复后会重新出现在列表里。') : t('归档后默认不显示，文件还在工作区里；可以再恢复。') }],
        onSubmit: async () => {
          try {
            await archiveDiagnostic(current.id, !archived)
            toast(archived ? t('已恢复') : t('已归档，文件还在原处'))
            await load()
          } catch (err) { toast(err.message, { error: true }) }
        },
      },
    })
  }

  const detail = (
    <>
            {current ? (
              <>
                <div className="md-diag-head">
                  <div>
                    <p className="md-eyebrow">{current.brand || t('试听诊断')} · {current.code || current.id}</p>
                    <h2>{current.lesson || t('未命名课程')}</h2>
                    <p className="md-muted">{current.at || t('时间待定')} · {current.student || t('未填学生')} · {current.grade || ''}</p>
                  </div>
                  <span className="md-grow" />
                  <button type="button" className="md-pill is-small is-primary" onClick={() => revealDiagnostic(current.id).catch(err => toast(err.message, { error: true }))}>{t('打开所在文件夹')}</button>
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
                  {current.postScore ? <button type="button" className="md-pill is-small" onClick={() => analyze('post')} disabled={busy === 'analyze-post'}>{busy === 'analyze-post' ? t('正在写话术…') : t('生成课后话术')}</button> : null}
                </div>

                <div className="md-diag-manage-actions">
                  <button type="button" className="md-pill is-small" onClick={openEdit}>{t('编辑信息')}</button>
                  <button type="button" className="md-pill is-small" onClick={openDuplicate}>{t('复制一份')}</button>
                  <button type="button" className="md-pill is-small" onClick={openArchive}>{current.status === '已归档' ? t('恢复') : t('归档')}</button>
                </div>

                {analysis ? (
                  <div className="md-diag-analysis">
                    <div className="md-diag-analysis-head">
                      <b>{t('诊断说明和家长话术')}</b>
                      <span className={`md-source ${analysisSource === 'local' ? 'is-local' : ''}`}>{analysisSource === 'model' ? t('模型生成') : t('数据兜底')}</span>
                    </div>
                    <p className="md-diag-summary">{analysis.summary}</p>
                    {analysis.findings?.length ? <ul>{analysis.findings.map(row => <li key={row}>{row}</li>)}</ul> : null}
                    {(analysis.scripts?.length ? analysis.scripts : [{ tag: '首条', text: analysis.parentScript }]).map((script, index) => (
                      <div className="md-script-card" key={`${script.tag}-${index}`}>
                        <div className="md-script-head">
                          <b>{t(script.tag)}</b>
                          <span className="md-grow" />
                          <button type="button" className="md-inline-link" onClick={() => copy(script.text)}>{t('复制这条')}</button>
                        </div>
                        <textarea rows={5} readOnly value={script.text} />
                      </div>
                    ))}
                    <div className="md-diag-actions">
                      <button type="button" className="md-inline-link" onClick={() => setDesk({
                        dialog: {
                          title: t('再改一版'),
                          submitLabel: t('重新生成'),
                          fields: [{ name: 'note', label: t('想怎么改？一句话就行'), type: 'textarea', rows: 2, placeholder: t('比如：再短一点，别那么急；或者更口语一点') }],
                          onSubmit: values => analyze(analysisKind, values.note),
                        },
                      })}>{t('再改一版')}</button>
                      {analysis.trialFocus?.length ? <span className="md-muted">{t('试听重点：{list}', { list: analysis.trialFocus.join('、') })}</span> : null}
                    </div>
                  </div>
                ) : null}

                <p className="md-muted md-diag-hint">{t('流程：出卷 → 发给家长 → 孩子做完点「保存结果给老师」→ 把结果码粘回「导入回传结果」。')}</p>
              </>
            ) : <p className="md-muted">{t('选一份诊断看详情')}</p>}
    </>
  )

  return (
    <div className="md-page md-diagnostics">
      <header className="md-page-head">
        <div>
          <h1>{t('试听诊断')}</h1>
          <p className="md-page-sub">{t('先诊断、再试听、课后复测。每份卷子都带着品牌、上课时间和课次编码。')}</p>
        </div>
        <span className="md-grow" />
        <button type="button" className="md-inline-link" onClick={() => setBankOpen(value => !value)}>{bankOpen ? t('收起题库') : t('题库')}</button>
        <button type="button" className="md-inline-link" onClick={() => openCreate(DEMO)}>{t('用示例填一遍')}</button>
        <button type="button" className="md-inline-link" disabled={busy === 'create'} onClick={() => openCreate()}>{busy === 'create' ? t('正在出卷…') : t('出一份诊断卷')}</button>
        {current ? <button type="button" className="md-pill is-small" onClick={openImport}>{t('导入结果')}</button> : null}
      </header>

      {bankOpen ? (
        <section className="md-diag-bank">
          <header className="md-create-head">
            <div>
              <h2>{t('题库')}</h2>
              <p>{t('上传北京期中/期末卷，拆成题后确认入库；诊断卷只从这里选题。')}</p>
            </div>
            <span className="md-grow" />
            <label className="md-pill is-small is-primary">
              {busy === 'paper' ? t('正在拆题…') : t('上传卷子')}
              <input type="file" accept=".pdf,.docx,.txt,.md,.csv" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) uploadPaperFile(file) }} />
            </label>
            <button type="button" className="md-inline-link" onClick={() => setBankOpen(false)}>{t('关闭')}</button>
          </header>
          <div className="md-bank-stats">
            <span>{t('{n} 份卷子', { n: papers.length })}</span>
            <span>{t('{n} 道题', { n: bankQuestions.length })}</span>
            <span>{t('已确认 {n} 道', { n: bankQuestions.filter(row => row.status === '已确认').length })}</span>
            {bankQuestions.some(row => row.status === '待确认') ? <em>{t('还有 {n} 道待确认', { n: bankQuestions.filter(row => row.status === '待确认').length })}</em> : null}
          </div>
          {papers.length === 0 ? <p className="md-muted">{t('还没有卷子。上传 PDF、Word 或文本卷；图片/扫描件先发到对话里让助手识别。')}</p> : (
            <ul className="md-bank-papers">
              {papers.map(paper => (
                <li key={paper.id}>
                  <b>{paper.name}</b>
                  <span>{paper.count} 题 · {t(paper.status)}</span>
                  <span className="md-grow" />
                  <button type="button" className="md-inline-link" onClick={() => extractOne(paper)} disabled={busy === `paper-${paper.id}`}>{busy === `paper-${paper.id}` ? t('拆题中…') : t('重新拆题')}</button>
                  <button type="button" className="md-pill is-small" onClick={() => confirmPaper(paper)}>{t('确认全部')}</button>
                </li>
              ))}
            </ul>
          )}
          {bankQuestions.length ? (
            <div className="md-bank-questions">
              <b>{t('题目')}</b>
              {bankQuestions.slice(0, 40).map(question => (
                <div className="md-bank-q" key={question.id}>
                  <span className={`md-bank-status ${question.status === '已确认' ? 'is-ok' : ''}`}>{t(question.status)}</span>
                  <span className="md-bank-stem">{question.stem}</span>
                  <em>{question.knowledge} · {t(question.difficulty)}</em>
                  <span className="md-grow" />
                  <button type="button" className="md-inline-link" onClick={() => editQuestion(question)}>{t('改')}</button>
                  {question.status !== '已确认' ? <button type="button" className="md-inline-link" onClick={async () => { await confirmBankQuestions([question.id]); await loadBank(); toast(t('已确认')) }}>{t('确认')}</button> : null}
                  <button type="button" className="md-inline-link" onClick={async () => { await removeBankQuestion(question.id); await loadBank(); toast(t('已删除')) }}>{t('删')}</button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {creating ? (
        <section className="md-diag-create" id="diag-create">
          <header className="md-create-head">
            <div>
              <h2>{t('新诊断卷')}</h2>
              <p>{t('填学生和这次课的信息，生成后会直接加到下面列表。')}</p>
            </div>
            <span className="md-grow" />
            <button type="button" className="md-inline-link" onClick={() => setForm(makeForm(DEMO))}>{t('填入示例')}</button>
            <button type="button" className="md-inline-link" onClick={() => setCreating(false)}>{t('关闭')}</button>
          </header>

          <div className="md-create-section">
            <h3>{t('学生')}</h3>
            <div className="md-create-grid">
              {textField('studentName', t('学生/家长称呼'), t('比如：小雪'))}
              {textField('studentGrade', t('孩子年级'), t('高一'))}
              {selectField('gender', t('性别'), GENDERS)}
              {selectField('level', t('当前水平'), LEVELS)}
              {textField('score', t('最近分数（可不填）'), t('比如：58'))}
              {textField('resistances', t('学习阻力（逗号分隔）'), t('计算、概念、审题'))}
              {areaField('pain', t('卡点/家长原话'), t('比如：期中 58，氧化还原一听就乱'))}
              {textField('goal', t('这次试听想先解决什么'), t('先补化合价'), { wide: true })}
              {selectField('temperature', t('家长现在什么状态'), [{ value: '', label: '未说明' }, { value: 'A2 还在比较', label: 'A2 还在比较' }, { value: 'A3 已经急了', label: 'A3 已经急了' }])}
            </div>
          </div>

          <div className="md-create-section">
            <h3>{t('课程')}</h3>
            <div className="md-create-grid">
              {textField('lessonTitle', t('课程名（必填）'), t('氧化还原配平'))}
              {textField('subject', t('科目'), t('化学'))}
              {textField('grade', t('课程年级'), t('高一'))}
              {selectField('bankPaperId', t('题库来源卷'), [{ value: '', label: t('全部已确认题库') }, ...papers.map(paper => ({ value: paper.id, label: `${paper.name}（${paper.count} 题）` }))])}
              {textField('at', t('上课时间（必填）'), t('2026-11-30 周日 19:00'))}
              {textField('talkAt', t('跟家长怎么说时间'), t('周日晚 7 点'))}
              {textField('altAt', t('备选时间（可选）'), t('周六上午 10 点'))}
              {textField('code', t('课次编码'), t('TRIAL-HX-1130'))}
              {textField('topic', t('试听重点（一句话）'), t('从化合价一路配平到氧化还原'))}
            </div>
          </div>

          <div className="md-create-section">
            <h3>{t('品牌和题量')}</h3>
            <div className="md-create-grid">
              {textField('brandName', t('品牌名'), brand.name || t('比如：姜老师化学'))}
              {textField('brandTeacher', t('老师署名'), brand.teacher || t('姜老师'))}
              {selectField('count', t('题量'), COUNTS)}
            </div>
          </div>

          <footer className="md-create-foot">
            <span className={formError ? 'md-create-error' : 'md-muted'}>{formError || t('课程名和上课时间必填。')}</span>
            <span className="md-grow" />
            <button type="button" className="md-pill is-small" onClick={() => setCreating(false)} disabled={busy === 'create'}>{t('取消')}</button>
            <button type="button" className="md-pill is-small is-primary" onClick={submitCreate} disabled={busy === 'create'}>
              {busy === 'create' ? t('正在出卷…') : t('生成诊断卷')}
            </button>
          </footer>
        </section>
      ) : null}

      {busy === 'create' ? <div className="md-diag-loading"><span className="md-shimmer">{t('正在生成诊断卷…')}</span></div> : null}

      {!data ? <p className="md-muted">{t('读取中…')}</p> : rows.length === 0 ? (
        <div className="md-works-empty">
          <p>{t('还没有试听诊断。先出一份卷子，发给家长做完，再把结果导回来。')}</p>
          <button type="button" className="md-pill is-primary" onClick={openCreate}>{t('出一份诊断卷')}</button>
        </div>
      ) : (
        <div className="md-diag-stack">
          <div className="md-diag-tools">
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('搜学生、课程、课次编码')} />
            <label className="md-diag-archived"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} />{t('显示已归档')}</label>
            <span className="md-muted">{t('{n} 份', { n: visible.length })}</span>
          </div>
          {visible.map(row => (
            <section key={row.id} className={`md-diag-item ${row.id === selected ? 'is-open' : ''}`}>
              <button type="button" className="md-diag-row" onClick={() => setSelected(prev => prev === row.id ? '' : row.id)} aria-expanded={row.id === selected}>
                <span className="md-diag-row-main">
                  <b>{row.student || t('未填学生')}{row.grade ? ` · ${row.grade}` : ''}</b>
                  <span>{row.lesson || t('未填课程')}</span>
                  <small>{row.at || t('时间待定')}</small>
                </span>
                <span className="md-diag-row-side">
                  <em className={`md-diag-status is-${row.status}`}>{t(row.status)}</em>
                  <i className="md-diag-chevron">{row.id === selected ? '−' : '+'}</i>
                </span>
              </button>
              {row.id === selected ? <div className="md-diag-detail">{detail}</div> : null}
            </section>
          ))}
          {visible.length === 0 ? <p className="md-muted md-diag-empty">{query ? t('没有匹配的诊断') : t('还没有可显示的诊断')}</p> : null}
        </div>
      )}


    </div>
  )
}
