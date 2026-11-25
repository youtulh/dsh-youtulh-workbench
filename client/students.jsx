// 学生：线索漏斗 / 学生档案 / 班课 三个 tab。数据都在工作区的 CSV 里。
import React from 'react'
import { fetchFeedbackList, fetchLessons, fetchStudentFeedback, fetchStudents, importStudents, removeFeedback, removeStudentRow, saveStudentFeedback, saveStudentRow, setDesk, toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { ClassesPanel } from './classes.jsx'
import { FunnelPanel } from './funnel.jsx'
import { Icon } from './ui.jsx'

const TABS = [
  { id: 'funnel', label: '线索漏斗' },
  { id: 'roster', label: '学生档案' },
  { id: 'classes', label: '班课' },
]

export function StudentsView() {
  useLang()
  const [tab, setTab] = React.useState('funnel')
  const [students, setStudents] = React.useState(null)
  const [classes, setClasses] = React.useState([])
  const [lessons, setLessons] = React.useState([])
  const [loadError, setLoadError] = React.useState('')
  const studentFocus = useDesk(s => s.studentFocus)

  const load = () => {
    setLoadError('')
    return Promise.all([fetchStudents(), fetchLessons('').catch(() => [])])
    .then(([data, rows]) => {
      setStudents(data.students ?? [])
      setClasses(data.classes ?? [])
      setLessons(rows)
    })
    .catch(err => { setLoadError(err.message); toast(err.message, { error: true }) })
  }
  React.useEffect(() => { load() }, [])
  React.useEffect(() => { if (studentFocus) setTab('roster') }, [studentFocus])

  const onChanged = (data) => {
    if (data?.students) setStudents(data.students)
    if (data?.classes) setClasses(data.classes)
    // 学生/班变了，课次记录可能被级联改过（改名、移出、删班），重新拉一遍，别让进度停在旧数据
    if (data?.students || data?.classes) fetchLessons('').then(setLessons).catch(() => {})
  }

  // 某个班改完课次，只替换这个班的行，别把别的班冲掉
  const onLessons = (className, rows) => setLessons(prev => [...prev.filter(row => row.className !== className), ...rows])
  const unassigned = (students ?? []).filter(row => !row.className).length

  return (
    <div className="md-page md-students">
      <header className="md-page-head">
        <div>
          <h1>{t('学生')}</h1>
          <p className="md-page-sub">{t('私信 → 微信 → 试听 → 报课 → 班课，一条线看下来；开的班、每次课、谁卡在哪，都落在工作区的表格里。')}</p>
        </div>
        <button type="button" className="md-pill" onClick={() => setDesk({ view: 'dm', focusId: null })}>
          <Icon name="chat" size={14} />{t('去回私信')}
        </button>
      </header>

      {!students && loadError ? (
        <div className="md-load-error">
          <p>{t('读取失败：{msg}', { msg: loadError })}</p>
          <button type="button" className="md-pill is-small" onClick={load}>{t('重试')}</button>
        </div>
      ) : null}

      {students && (students.length > 0 || classes.length > 0) ? (
        <section className="md-student-summary">
          <div><b>{classes.length}</b><span>{t('个班')}</span></div>
          <div><b>{students.length}</b><span>{t('个学生')}</span></div>
          <div><b>{unassigned}</b><span>{t('还没排班')}</span></div>
          <div><b>{lessons.length}</b><span>{t('条课次记录')}</span></div>
        </section>
      ) : null}

      <div className="md-content-tabs">
        {TABS.map(item => (
          <button type="button" key={item.id} className={tab === item.id ? 'is-on' : ''} onClick={() => setTab(item.id)}>
            {t(item.label)}
            {item.id === 'roster' && students ? <em>{students.length}</em> : null}
            {item.id === 'classes' && classes.length ? <em>{classes.length}</em> : null}
          </button>
        ))}
      </div>

      {tab === 'funnel' ? <FunnelPanel students={students ?? []} onChanged={onChanged} /> : null}
      {tab === 'roster' ? <RosterPanel students={students} classes={classes} lessons={lessons} onChanged={onChanged} focusName={studentFocus} /> : null}
      {tab === 'classes' ? <ClassesPanel classes={classes} students={students ?? []} lessons={lessons} onChanged={onChanged} onLessons={onLessons} /> : null}
    </div>
  )
}

// 学生页的搜索/筛选：切到别的页面再回来不重置
const ROSTER_UI = { query: '', filter: '' }

function RosterPanel({ students, classes, lessons = [], onChanged, focusName = '' }) {
  useLang()
  const [query, setQuery] = React.useState(ROSTER_UI.query)
  const [filter, setFilter] = React.useState(ROSTER_UI.filter)
  const [openStudent, setOpenStudent] = React.useState('')
  const [feedback, setFeedback] = React.useState(null)
  React.useEffect(() => { Object.assign(ROSTER_UI, { query, filter }) }, [query, filter])
  React.useEffect(() => {
    if (!focusName) return
    setQuery(focusName)
    setFilter('')
    setDesk({ studentFocus: '' })
  }, [focusName])
  if (students === null) return <p className="md-muted md-dm-empty">{t('读取中…')}</p>

  const layerOptions = [...new Set(classes.flatMap(row => row.layers))]
  const list = students.filter(row => {
    const pass = filter === 'none' ? !row.className : !filter || row.className === filter
    if (!pass) return false
    const q = query.trim()
    return !q || [row.name, row.school, row.contact, row.layer, row.note, row.className, row.source].some(value => String(value ?? '').includes(q))
  })

  const open = (student) => {
    const editing = Boolean(student)
    const layers = [...new Set([...layerOptions, student?.layer].filter(Boolean))]
    setDesk({
      dialog: {
        title: editing ? t('改学生档案') : t('加一个学生'),
        submitLabel: t('保存'),
        initial: editing
          ? { name: student.name, grade: student.grade, school: student.school, contact: student.contact, className: student.className, layer: student.layer, source: student.source, note: student.note }
          : { className: filter && filter !== 'none' ? filter : '' },
        fields: [
          { name: 'name', label: t('姓名'), required: true },
          { name: 'grade', label: t('年级'), placeholder: t('高一') },
          { name: 'school', label: t('学校'), placeholder: t('可不填') },
          { name: 'contact', label: t('微信 / 手机'), placeholder: t('家长的微信或电话，可不填') },
          { name: 'className', label: t('在哪个班'), type: 'select', options: [{ value: '', label: t('还没排班') }, ...classes.map(row => ({ value: row.name, label: row.name }))] },
          { name: 'layer', label: t('卡点层'), type: 'select', hint: t('选项来自各班的「分层」；也可以先在班里建好分层再选'), options: [{ value: '', label: t('还没标') }, ...layers.map(value => ({ value, label: t(value) }))] },
          { name: 'source', label: t('来源'), placeholder: t('哪条视频 / 谁介绍') },
          { name: 'note', label: t('备注'), type: 'textarea', rows: 2, placeholder: t('家长的顾虑、上课习惯都可以记在这里') },
        ],
        onSubmit: values => {
          saveStudentRow(values, editing ? { name: student.name, grade: student.grade } : null)
            .then(data => { onChanged?.(data); toast(t('学生档案存好了')) })
            .catch(err => toast(err.message, { error: true }))
        },
      },
    })
  }

  const openImport = () => setDesk({
    dialog: {
      title: t('从表格导入学生'),
      submitLabel: t('导入'),
      fields: [{
        name: 'raw', label: t('把 Excel / 表格里的名单粘进来'), type: 'textarea', rows: 8,
        placeholder: t('第一行是表头：姓名、年级、学校、微信、卡点层、班、来源、备注'), required: true,
      }],
      onSubmit: values => {
        importStudents(values.raw)
          .then(data => {
            onChanged?.(data)
            toast([
              data.createdClasses
                ? t('导入了 {n} 个学生，顺手建了 {m} 个班', { n: data.imported, m: data.createdClasses })
                : t('导入了 {n} 个学生', { n: data.imported }),
              data.skipped ? t('跳过 {n} 行（没写姓名）', { n: data.skipped }) : '',
              data.adjusted ? t('{n} 条班名按已有班对齐（空格/大小写不同）', { n: data.adjusted }) : '',
            ].filter(Boolean).join('；'))
          })
          .catch(err => toast(err.message, { error: true }))
      },
    },
  })

  const writeFeedback = (student, limit = 4) => {
    setFeedback({ student, name: student.name, text: '', busy: true, lessons: 0, limit, source: '', history: [] })
    Promise.all([
      fetchStudentFeedback({ name: student.name, grade: student.grade, className: student.className, limit }),
      fetchFeedbackList(student.name).catch(() => ({ rows: [] })),
    ]).then(([data, history]) => {
      setFeedback({
        student, name: student.name, text: data.text || '', busy: false, lessons: data.lessons ?? 0,
        limit, source: data.source || 'local', history: history.rows ?? [],
      })
      requestAnimationFrame(() => document.getElementById('student-feedback')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }).catch(err => { setFeedback(null); toast(err.message, { error: true }) })
  }

  const remove = (student) => {
    if (!window.confirm(t('删掉 {name} 的档案？这个班的课次记录也会删。', { name: student.name }))) return
    removeStudentRow(student.name, student.grade)
      .then(data => { onChanged?.(data); toast(t('删掉了')) })
      .catch(err => toast(err.message, { error: true }))
  }

  return (
    <div className="md-roster-panel">
      <div className="md-pipeline-tools">
        <input className="md-lead-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('搜姓名、学校、卡点')} />
        <select value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="">{t('全部班')}</option>
          <option value="none">{t('还没排班')}</option>
          {classes.filter(row => row.status !== '结课').map(row => <option key={row.name} value={row.name}>{row.name}</option>)}
        </select>
        <span className="md-grow" />
        <button type="button" className="md-pill is-small" onClick={openImport}>{t('导入名单')}</button>
        <button type="button" className="md-pill is-small is-primary" onClick={() => open(null)}><Icon name="plus" size={13} />{t('加学生')}</button>
      </div>

      {students.length === 0 ? (
        <div className="md-works-empty">
          <p>{t('还没有学生。聊天台标「成交」会自动建档案；线索漏斗里报课的也能转过来，或者直接加一个。')}</p>
          <button type="button" className="md-pill is-primary" onClick={() => open(null)}>{t('加第一个学生')}</button>
          <button type="button" className="md-pill" onClick={openImport}>{t('导入名单')}</button>
        </div>
      ) : list.length === 0 ? (
        <p className="md-muted md-dm-empty">{t('这个筛选下没有学生。')}</p>
      ) : (
        <ul className="md-student-list">
          {list.map(student => (
            <li key={`${student.name}-${student.grade}`} className="md-student-card">
              <header>
                <b>{student.name}</b>
                {student.grade || student.school ? <small>{[student.grade, student.school].filter(Boolean).join(' · ')}</small> : null}
                {student.contact ? (
                  <button type="button" className="md-student-contact" title={t('点一下复制')} onClick={() => {
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(student.contact).then(() => toast(t('复制了联系方式'))).catch(() => toast(t('复制失败'), { error: true }))
                    } else {
                      toast(t('这个环境不能直接复制，去表格里复制吧'), { error: true })
                    }
                  }}>{student.contact}</button>
                ) : null}
                <span className="md-grow" />
                {student.className ? <span className="md-student-class">{student.className}</span> : <span className="md-muted">{t('还没排班')}</span>}
              </header>
              <div className="md-student-tags">
                {student.layer ? <em>{t('卡在：{layer}', { layer: student.layer })}</em> : <span className="md-muted">{t('还没标卡点层')}</span>}
                {student.source?.includes('聊天')
                  ? <span className="md-student-from">{t('来自聊天成交')}</span>
                  : student.source ? <span className="md-muted">{t('来源：{source}', { source: student.source })}</span> : null}
              </div>
              {(() => {
                const own = lessons.filter(row => row.name === student.name && (!student.className || row.className === student.className))
                if (!own.length) return <p className="md-student-last">{t('还没上过课')}</p>
                const last = own.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.no - a.no)[0]
                return <p className="md-student-last">{t('已上 {n} 次', { n: own.length })} · {t('最近一次')}：{[last.date || t('没填日期'), last.mastery ? t('掌握{value}', { value: last.mastery }) : '', last.homework ? t('作业{value}', { value: last.homework }) : ''].filter(Boolean).join(' · ')}</p>
              })()}
              {student.note ? <p className="md-student-note">{student.note}</p> : null}
              <footer>
                <span className="md-muted">{student.enrolledAt ? t('报课于 {date}', { date: student.enrolledAt }) : ''}</span>
                <span className="md-grow" />
                <button type="button" className="md-inline-link" onClick={() => writeFeedback(student)}>{t('写反馈')}</button>
                <button type="button" className="md-inline-link" onClick={() => setOpenStudent(openStudent === `${student.name}-${student.grade}` ? '' : `${student.name}-${student.grade}`)}>
                  {openStudent === `${student.name}-${student.grade}` ? t('收起课次') : t('课次')}
                </button>
                <button type="button" className="md-inline-link" onClick={() => open(student)}>{t('改')}</button>
                <button type="button" className="md-inline-link" onClick={() => remove(student)}>{t('删除')}</button>
              </footer>
              {openStudent === `${student.name}-${student.grade}` ? (
                <ul className="md-student-records">
                  {lessons.filter(row => row.name === student.name && (!student.className || row.className === student.className))
                    .sort((a, b) => String(a.className).localeCompare(String(b.className)) || a.no - b.no)
                    .map(row => (
                      <li key={`${row.className}-${row.no}`}>
                        <span className="md-muted">{row.className}</span>
                        <b>{t('第 {n} 次', { n: row.no })}</b>
                        <span>{row.date || t('没填日期')}</span>
                        <span>{row.attend || '—'}</span>
                        <span>{row.mastery || '—'}</span>
                        <span>{row.homework || '—'}</span>
                      </li>
                    ))}
                  {!lessons.some(row => row.name === student.name && (!student.className || row.className === student.className)) ? <li className="md-muted">{t('还没有课次记录')}</li> : null}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {feedback ? (
        <section className="md-tile md-feedback" id="student-feedback">
          <header className="md-tile-head">
            <h2>{t('给 {name} 家长的反馈', { name: feedback.name })}</h2>
            <select className="md-case-result" value={feedback.limit} onChange={event => {
              const limit = Number(event.target.value)
              if (feedback.busy) return
              writeFeedback(feedback.student, limit)
            }}>
              {[2, 4].map(n => <option key={n} value={n}>{t('最近 {n} 次', { n })}</option>)}
            </select>
            <span className="md-grow" />
            <button type="button" className="md-inline-link" onClick={() => setFeedback(null)}>{t('关闭')}</button>
          </header>
          {feedback.busy ? <p className="md-muted">{t('正在写…')}</p> : (
            <>
              <textarea rows={6} value={feedback.text} onChange={event => setFeedback(prev => ({ ...prev, text: event.target.value }))} />
              <div className="md-feedback-actions">
                <span className="md-muted">
                  {feedback.source === 'model' ? t('模型按你的设定写的') : t('没连模型，按记录拼的')} · {feedback.lessons ? t('依据最近 {n} 次课', { n: feedback.lessons }) : t('还没有课次记录，按学生档案写的')} · {t('发之前自己看一眼')}
                </span>
                <span className="md-grow" />
                <button type="button" className="md-inline-link" disabled={feedback.busy} onClick={() => writeFeedback(feedback.student, feedback.limit)}>{t('换一版')}</button>
                <button type="button" className="md-inline-link" onClick={() => {
                  saveStudentFeedback({
                    name: feedback.name, grade: feedback.student.grade, lessons: feedback.lessons,
                    text: feedback.text, source: feedback.source,
                  }).then(data => {
                    setFeedback(prev => ({ ...prev, history: data.rows ?? prev.history }))
                    toast(t('存进家长反馈了'))
                  }).catch(err => toast(err.message, { error: true }))
                }}>{t('存一笔')}</button>
                <button type="button" className="md-pill is-small" onClick={() => {
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(feedback.text).then(() => toast(t('复制了反馈'))).catch(() => toast(t('复制失败'), { error: true }))
                  } else {
                    toast(t('这个环境不能直接复制，去表格里复制吧'), { error: true })
                  }
                }}>{t('复制反馈')}</button>
              </div>
              {feedback.history?.length ? (
                <details className="md-feedback-history">
                  <summary>{t('以前写过的 {n} 条', { n: feedback.history.length })}</summary>
                  <ul>
                    {feedback.history.slice().reverse().map(row => (
                      <li key={row.rowIndex ?? `${row.date}-${row.text.slice(0, 8)}`}>
                        <div className="md-feedback-history-head">
                          <span className="md-muted">{row.date}</span>
                          <span className="md-grow" />
                          <button type="button" className="md-inline-link" onClick={() => {
                            if (navigator.clipboard?.writeText) {
                              navigator.clipboard.writeText(row.text).then(() => toast(t('复制了反馈'))).catch(() => toast(t('复制失败'), { error: true }))
                            } else {
                              toast(t('这个环境不能直接复制，去表格里复制吧'), { error: true })
                            }
                          }}>{t('复制')}</button>
                          <button type="button" className="md-inline-link" onClick={() => {
                            if (!window.confirm(t('删掉这条写过的反馈？'))) return
                            removeFeedback(row.rowIndex)
                              .then(data => { setFeedback(prev => ({ ...prev, history: data.rows ?? [] })); toast(t('删掉了')) })
                              .catch(err => toast(err.message, { error: true }))
                          }}>{t('删除')}</button>
                        </div>
                        <p>{row.text}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <p className="md-muted">{t('学生档案存在工作区的 学生档案.csv；卡点层跟着班走。')}</p>
    </div>
  )
}
