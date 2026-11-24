// 学生：线索漏斗 / 学生档案 / 班课 三个 tab。数据都在工作区的 CSV 里。
import React from 'react'
import { fetchLessons, fetchStudents, removeStudentRow, saveStudentRow, setDesk, toast, useDesk } from './desk.js'
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
  const studentFocus = useDesk(s => s.studentFocus)

  const load = () => Promise.all([fetchStudents(), fetchLessons('').catch(() => [])])
    .then(([data, rows]) => {
      setStudents(data.students ?? [])
      setClasses(data.classes ?? [])
      setLessons(rows)
    })
    .catch(err => toast(err.message, { error: true }))
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

      {students ? (
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
      {tab === 'roster' ? <RosterPanel students={students} classes={classes} onChanged={onChanged} focusName={studentFocus} /> : null}
      {tab === 'classes' ? <ClassesPanel classes={classes} students={students ?? []} lessons={lessons} onChanged={onChanged} onLessons={onLessons} /> : null}
    </div>
  )
}

// 学生页的搜索/筛选：切到别的页面再回来不重置
const ROSTER_UI = { query: '', filter: '' }

function RosterPanel({ students, classes, onChanged, focusName = '' }) {
  useLang()
  const [query, setQuery] = React.useState(ROSTER_UI.query)
  const [filter, setFilter] = React.useState(ROSTER_UI.filter)
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
    return !q || [row.name, row.school, row.layer, row.note].some(value => String(value ?? '').includes(q))
  })

  const open = (student) => {
    const editing = Boolean(student)
    const layers = [...new Set([...layerOptions, student?.layer].filter(Boolean))]
    setDesk({
      dialog: {
        title: editing ? t('改学生档案') : t('加一个学生'),
        submitLabel: t('保存'),
        initial: editing
          ? { name: student.name, grade: student.grade, school: student.school, className: student.className, layer: student.layer, source: student.source, note: student.note }
          : { className: filter && filter !== 'none' ? filter : '' },
        fields: [
          { name: 'name', label: t('姓名'), required: true },
          { name: 'grade', label: t('年级'), placeholder: t('高一') },
          { name: 'school', label: t('学校'), placeholder: t('可不填') },
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
          {classes.map(row => <option key={row.name} value={row.name}>{row.name}</option>)}
        </select>
        <span className="md-grow" />
        <button type="button" className="md-pill is-small is-primary" onClick={() => open(null)}><Icon name="plus" size={13} />{t('加学生')}</button>
      </div>

      {students.length === 0 ? (
        <div className="md-works-empty">
          <p>{t('还没有学生。聊天台标「成交」会自动建档案；线索漏斗里报课的也能转过来，或者直接加一个。')}</p>
          <button type="button" className="md-pill is-primary" onClick={() => open(null)}>{t('加第一个学生')}</button>
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
                <span className="md-grow" />
                {student.className ? <span className="md-student-class">{student.className}</span> : <span className="md-muted">{t('还没排班')}</span>}
              </header>
              <div className="md-student-tags">
                {student.layer ? <em>{t('卡在：{layer}', { layer: student.layer })}</em> : <span className="md-muted">{t('还没标卡点层')}</span>}
                {student.source?.includes('聊天')
                  ? <span className="md-student-from">{t('来自聊天成交')}</span>
                  : student.source ? <span className="md-muted">{t('来源：{source}', { source: student.source })}</span> : null}
              </div>
              {student.note ? <p className="md-student-note">{student.note}</p> : null}
              <footer>
                <span className="md-muted">{student.enrolledAt ? t('报课于 {date}', { date: student.enrolledAt }) : ''}</span>
                <span className="md-grow" />
                <button type="button" className="md-inline-link" onClick={() => open(student)}>{t('改')}</button>
                <button type="button" className="md-inline-link" onClick={() => remove(student)}>{t('删除')}</button>
              </footer>
            </li>
          ))}
        </ul>
      )}
      <p className="md-muted">{t('学生档案存在工作区的 学生档案.csv；卡点层跟着班走。')}</p>
    </div>
  )
}
