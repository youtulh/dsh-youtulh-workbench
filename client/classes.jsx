// 班课：建班、名册、按卡点层聚合、每次课的出勤/掌握/作业。
// 数据落在 班课.csv / 学生档案.csv / 课次记录.csv 三张表里。
import React from 'react'
import {
  fetchLessons, removeClassRow, saveClassRow, saveLessons, saveStudentRow, setDesk, toast,
} from './desk.js'
import { t, useLang } from './i18n.js'
import { ATTEND_OPTIONS, DEFAULT_CLASS_TOTAL, HOMEWORK_OPTIONS, MASTERY_OPTIONS, dayKey } from './util.js'
import { Icon } from './ui.jsx'

const classRoster = (students, name) => students.filter(row => row.className === name)

function groupsOf(roster, layers = []) {
  const list = layers
  const groups = list.map(layer => ({ layer, students: roster.filter(row => row.layer === layer) }))
  const rest = roster.filter(row => !list.includes(row.layer))
  if (rest.length) groups.push({ layer: '', students: rest })
  return groups
}

// 没点过就是「还没记」：空字符串不落盘，避免把没点的人记成到齐
const emptyDraft = () => ({ attend: '', mastery: '', homework: '', note: '' })

export function ClassesPanel({ classes, students, lessons = [], onChanged, onLessons }) {
  useLang()
  const [selected, setSelected] = React.useState('')
  const [showEnded, setShowEnded] = React.useState(false)
  const duplicateClasses = (() => {
    const groups = new Map()
    for (const row of classes) {
      const key = row.name.replace(/\s+/g, '').toLowerCase()
      groups.set(key, [...(groups.get(key) ?? []), row.name])
    }
    return [...groups.values()].filter(names => names.length > 1)
  })()
  const klass = classes.find(row => row.name === selected)

  const createClass = () => setDesk({
    dialog: {
      title: t('建一个班'),
      submitLabel: t('建好'),
      initial: { total: DEFAULT_CLASS_TOTAL, layers: '化合价，化学式，配平，氧化还原概念，氧化还原配平' },
      fields: [
        { name: 'name', label: t('班名 / 期次'), placeholder: t('高一化学 11 月第 3 期'), required: true },
        { name: 'time', label: t('上课时间'), placeholder: t('每周六 19:00') },
        { name: 'total', label: t('总共几次课'), type: 'number', placeholder: '8' },
        { name: 'layers', label: t('这个班按什么分层'), type: 'textarea', rows: 2, hint: t('逗号分隔；学生卡在这一层，班视图就能按它聚合') },
        { name: 'note', label: t('备注'), placeholder: t('可不填') },
      ],
      onSubmit: values => {
        saveClassRow({ ...values, total: Number(values.total) || DEFAULT_CLASS_TOTAL })
          .then(data => { onChanged?.(data); toast(t('班建好了，去把学生加进来')) })
          .catch(err => toast(err.message, { error: true }))
      },
    },
  })

  if (!klass) {
    return (
      <div className="md-classes">
        <div className="md-pipeline-tools">
          <span className="md-muted">{t('一个班 4–6 个人；每个班可以有自己的分层。')}</span>
          <span className="md-grow" />
          {classes.some(row => row.status === '结课') ? (
            <button type="button" className="md-inline-link" onClick={() => setShowEnded(value => !value)}>
              {showEnded ? t('隐藏已结课') : t('显示已结课（{n}）', { n: classes.filter(row => row.status === '结课').length })}
            </button>
          ) : null}
          <button type="button" className="md-pill is-small is-primary" onClick={createClass}><Icon name="plus" size={13} />{t('建班')}</button>
        </div>
        {duplicateClasses.length ? (
          <p className="md-muted md-class-dupe">{t('这些班只差空格或大小写，可能是重复班：{names}', { names: duplicateClasses.map(names => names.join(' / ')).join('；') })}</p>
        ) : null}
        {classes.length === 0 ? (
          <div className="md-works-empty">
            <p>{t('还没有班。建一个班，把学生加进来，再记每次课。')}</p>
            <button type="button" className="md-pill is-primary" onClick={createClass}>{t('建第一个班')}</button>
          </div>
        ) : (
          <>
          {classes.filter(row => showEnded || row.status !== '结课').length === 0 ? <p className="md-muted">{t('现在没有在读的班，点「显示已结课」可以看以前的。')}</p> : null}
          <ul className="md-class-list">
            {classes.filter(row => showEnded || row.status !== '结课').map(row => {
              const roster = classRoster(students, row.name)
              const done = new Set(lessons.filter(item => item.className === row.name).map(item => item.no)).size
              return (
                <li key={row.name}>
                  <button type="button" className="md-class-card" onClick={() => setSelected(row.name)}>
                    <b>{row.name}</b>
                    {row.status === '结课' ? <em className="md-class-ended">{t('已结课')}</em> : null}
                    <small>{row.time || t('还没填上课时间')}</small>
                    <span className="md-class-meta">
                      <span>{t('{n} 人', { n: roster.length })}</span>
                      <span>{done ? t('已上 {done}/{total} 次', { done, total: row.total }) : t('共 {n} 次课', { n: row.total })}</span>
                      {(() => {
                        const own = lessons.filter(item => item.className === row.name)
                        const last = own.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
                        const used = new Set(own.map(item => item.no))
                        let next = 1
                        while (next <= row.total && used.has(next)) next += 1
                        const nextLabel = done >= row.total ? t('课次已记满') : t('下一节：第 {n} 次', { n: next })
                        return <span>{last?.date ? t('最近一次课：{date}', { date: last.date }) : t('还没记过课')} · {nextLabel}</span>
                      })()}
                    </span>
                    {row.layers.length ? <span className="md-layer-chips">{row.layers.map(layer => <em key={layer}>{layer}</em>)}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
          </>
        )}
      </div>
    )
  }

  return (
    <ClassDetail
      klass={klass}
      students={students}
      allLessons={lessons}
      onChanged={onChanged}
      onLessons={onLessons}
      onBack={() => setSelected('')}
      onRenamed={(name) => setSelected(name)}
    />
  )
}

function ClassDetail({ klass, students, allLessons = [], onChanged, onLessons, onBack, onRenamed }) {
  useLang()
  const roster = classRoster(students, klass.name)
  const rosterKey = roster.map(row => row.name).join('|')
  const [lessons, setLessons] = React.useState(null)
  const [no, setNo] = React.useState(1)
  const [date, setDate] = React.useState(dayKey(new Date()))
  const [draft, setDraft] = React.useState({})
  const [busy, setBusy] = React.useState('')
  const [openStudent, setOpenStudent] = React.useState('')

  const loadLessons = React.useCallback(() => fetchLessons(klass.name)
    .then(rows => { setLessons(rows); onLessons?.(klass.name, rows) })
    .catch(err => toast(err.message, { error: true })), [klass.name])
  React.useEffect(() => { setLessons(null); loadLessons() }, [loadLessons])

  // 第一次打开时选下一节还没记的课；之后保存不再自动跳，免得改错节
  const picked = React.useRef(false)
  React.useEffect(() => {
    if (!lessons || picked.current) return
    picked.current = true
    const used = new Set(lessons.map(row => row.no))
    let next = 1
    while (next <= klass.total && used.has(next)) next += 1
    setNo(next > klass.total ? klass.total : next)
  }, [lessons, klass.total])

  // 每个学生「上一次」的掌握/作业，记新课时给个参照
  const previous = React.useMemo(() => {
    // 本班已记的课优先；从别的班转来的学生，用旧班的最近一条当参照
    const pool = [...(lessons ?? []), ...(allLessons ?? []).filter(row => row.className !== klass.name)]
    const map = {}
    for (const row of pool) {
      if (row.className === klass.name && row.no >= no) continue
      const old = map[row.name]
      if (!old || String(row.date).localeCompare(String(old.date)) > 0 || (row.date === old.date && row.no > old.no)) map[row.name] = row
    }
    return map
  }, [lessons, allLessons, no, klass.name])

  // 切换课次时把已保存的记录回填，没记过的默认「到 / 会 / 交」
  React.useEffect(() => {
    if (!lessons) return
    const saved = new Map(lessons.filter(row => row.no === no).map(row => [row.name, row]))
    const next = {}
    for (const student of roster) {
      const row = saved.get(student.name)
      next[student.name] = row
        ? { attend: row.attend || '到', mastery: row.mastery || '会', homework: row.homework || '交', note: row.note || '' }
        : emptyDraft(student.name)
    }
    setDraft(next)
    const first = lessons.find(row => row.no === no)
    // 记过的课带出原来的日期；没记过的默认今天，别沿用上一节的日期
    setDate(first?.date || dayKey(new Date()))
  }, [lessons, no, rosterKey])

  const progress = (student) => {
    const mine = (lessons ?? []).filter(row => row.name === student.name)
    return {
      done: new Set(mine.map(row => row.no)).size,
      missed: mine.filter(row => row.attend === '缺').length,
      homeworkMissing: mine.filter(row => row.homework === '未交').length,
    }
  }

  const setCell = (name, key, value) => setDraft(prev => {
    const row = prev[name] ?? emptyDraft()
    return { ...prev, [name]: { ...row, [key]: row[key] === value ? '' : value } }
  })
  const fillAll = (key, value) => setDraft(prev => Object.fromEntries(Object.entries(prev).map(([name, row]) => [name, { ...row, [key]: value }])))

  const saveLesson = async () => {
    const rows = roster.map(student => ({ name: student.name, ...(draft[student.name] ?? emptyDraft()) }))
    const recorded = rows.filter(row => row.attend || row.mastery || row.homework).length
    const wasRecorded = savedCount > 0
    if (!recorded && savedCount > 0 && !window.confirm(t('这一节还没记人，保存会把原来的记录清掉，继续吗？'))) return
    setBusy('lesson')
    try {
      const data = await saveLessons({ class: klass.name, no, date, rows })
      setLessons(data.rows ?? [])
      onLessons?.(klass.name, data.rows ?? [])
      toast(recorded
        ? (wasRecorded ? t('第 {n} 次课更新了 {m} 人', { n: no, m: recorded }) : t('第 {n} 次课记好了 {m} 人', { n: no, m: recorded }))
        : t('第 {n} 次课还没记人', { n: no }))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const editClass = () => setDesk({
    dialog: {
      title: t('改这个班'),
      submitLabel: t('保存'),
      initial: { name: klass.name, time: klass.time, total: klass.total, layers: klass.layers.join('，'), note: klass.note },
      fields: [
        { name: 'name', label: t('班名 / 期次'), required: true },
        { name: 'time', label: t('上课时间') },
        { name: 'total', label: t('总共几次课'), type: 'number' },
        { name: 'layers', label: t('这个班按什么分层'), type: 'textarea', rows: 2, hint: t('逗号分隔') },
        { name: 'note', label: t('备注') },
      ],
      onSubmit: values => {
        saveClassRow({ ...values, total: Number(values.total) || DEFAULT_CLASS_TOTAL }, klass.name)
          .then(data => { onChanged?.(data); if (values.name !== klass.name) onRenamed?.(values.name); toast(t('班改好了')) })
          .catch(err => toast(err.message, { error: true }))
      },
    },
  })

  const toggleStatus = () => {
    const next = klass.status === '结课' ? '在读' : '结课'
    saveClassRow({ name: klass.name, time: klass.time, total: klass.total, layers: klass.layers, note: klass.note, status: next }, klass.name)
      .then(data => {
        onChanged?.(data)
        toast(next === '结课' ? t('班结课了') : t('班重新开班了'))
        if (next === '结课') onBack()
      })
      .catch(err => toast(err.message, { error: true }))
  }

  const removeClass = () => {
    if (!window.confirm(t('删掉这个班？学生档案不会删，课次记录会一起删。'))) return
    removeClassRow(klass.name)
      .then(data => { onChanged?.(data); onBack(); toast(t('班删掉了')) })
      .catch(err => toast(err.message, { error: true }))
  }

  const addStudent = () => setDesk({
    dialog: {
      title: t('加学生进班'),
      submitLabel: t('加进来'),
      initial: { className: klass.name },
      fields: [
        { name: 'name', label: t('学生姓名'), required: true },
        { name: 'grade', label: t('年级'), placeholder: t('高一') },
        { name: 'school', label: t('学校'), placeholder: t('可不填') },
        { name: 'layer', label: t('卡在这一层'), type: 'select', options: [{ value: '', label: t('还没标') }, ...klass.layers.map(value => ({ value, label: t(value) }))] },
        { name: 'note', label: t('备注'), placeholder: t('可不填') },
      ],
      onSubmit: values => {
        saveStudentRow({ ...values, className: klass.name })
          .then(data => { onChanged?.(data); toast(t('加进班了')) })
          .catch(err => toast(err.message, { error: true }))
      },
    },
  })

  const pickFromRoster = () => setDesk({
    dialog: {
      title: t('从学生档案里加进班'),
      submitLabel: t('加进来'),
      fields: [{
        name: 'pick', label: t('选一个学生'), type: 'select', required: true,
        options: students.filter(row => row.className !== klass.name).map(row => ({
          value: `${row.name}\u0000${row.grade}`,
          label: `${row.name}${row.grade ? `（${row.grade}）` : ''}${row.className ? ` · 现在在 ${row.className}` : ' · 还没排班'}`,
        })),
      }],
      onSubmit: values => {
        const [name, grade] = String(values.pick ?? '').split('\u0000')
        const target = students.find(row => row.name === name && row.grade === grade)
        if (!target) return toast(t('没找到这个学生'), { error: true })
        saveStudentRow({ ...target, className: klass.name }, { name: target.name, grade: target.grade })
          .then(data => { onChanged?.(data); toast(t('把 {name} 加进班了', { name: target.name })) })
          .catch(err => toast(err.message, { error: true }))
      },
    },
  })

  const moveOut = (student) => {
    saveStudentRow({ ...student, className: '' }, { name: student.name, grade: student.grade })
      .then(data => { onChanged?.(data); toast(t('把 {name} 移出班了', { name: student.name })) })
      .catch(err => toast(err.message, { error: true }))
  }

  const changeLayer = (student, layer) => {
    saveStudentRow({ ...student, layer }, { name: student.name, grade: student.grade })
      .then(data => onChanged?.(data))
      .catch(err => toast(err.message, { error: true }))
  }

  const groups = groupsOf(roster, klass.layers)
  const savedCount = (lessons ?? []).filter(row => row.no === no).length
  const draftRecorded = roster.filter(student => {
    const row = draft[student.name]
    return Boolean(row && (row.attend || row.mastery || row.homework))
  }).length
  const recent = [...new Set((lessons ?? []).map(row => row.no))].sort((a, b) => b - a).slice(0, 3).map((value) => {
    const rows = (lessons ?? []).filter(row => row.no === value)
    return {
      no: value,
      date: rows.find(row => row.date)?.date ?? '',
      missed: rows.filter(row => row.attend === '缺').length,
      homeworkMissing: rows.filter(row => row.homework === '未交').length,
    }
  })
  const lastOf = (student) => (lessons ?? []).filter(row => row.name === student.name).sort((a, b) => b.no - a.no)[0]

  return (
    <div className="md-class-detail">
      <div className="md-pipeline-tools">
        <button type="button" className="md-inline-link" onClick={onBack}>{t('← 返回班列表')}</button>
        <span className="md-grow" />
        <button type="button" className="md-pill is-small" onClick={toggleStatus}>{klass.status === '结课' ? t('重新开班') : t('结课')}</button>
        <button type="button" className="md-pill is-small" onClick={editClass}>{t('改班')}</button>
        <button type="button" className="md-inline-link" onClick={removeClass}>{t('删班')}</button>
      </div>

      <header className="md-class-head">
        <div>
          <h2>{klass.name}{klass.status === '结课' ? <em className="md-class-ended">{t('已结课')}</em> : null}</h2>
          <p className="md-muted">{klass.time || t('还没填上课时间')} · {t('{n} 人', { n: roster.length })} · {t('共 {n} 次课', { n: klass.total })}</p>
          {klass.layers.length ? <p className="md-layer-chips">{klass.layers.map(layer => <em key={layer}>{layer}</em>)}</p> : <p className="md-muted">{t('还没填分层，去「改班」里填上，就能看谁卡在哪。')}</p>}
        </div>
        {students.some(row => row.className !== klass.name) ? <button type="button" className="md-pill is-small" onClick={pickFromRoster}>{t('从档案加')}</button> : null}
        <button type="button" className="md-pill is-small is-primary" onClick={addStudent}><Icon name="plus" size={13} />{t('加学生')}</button>
      </header>

      <section className="md-tile">
        <header className="md-tile-head"><b>{t('谁卡在哪')}</b><span className="md-grow" /><span className="md-muted">{t('按这个班的分层聚合')}</span></header>
        {roster.length === 0 ? <p className="md-muted">{t('还没有学生进班。')}</p> : (
          <div className="md-layer-groups">
            {groups.map(group => (
              <div key={group.layer || 'none'} className={`md-layer-group ${group.layer ? '' : 'is-none'}`}>
                <b>{group.layer || t('还没标')}</b>
                <span>{group.students.length} {t('人')}</span>
                <p>{group.students.map(row => row.name).join('、') || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="md-tile">
        <header className="md-tile-head"><b>{t('名册')}</b><span className="md-grow" /><span className="md-muted">{t('点卡点层可以直接改')}</span></header>
        {roster.length === 0 ? <p className="md-muted">{t('把人加进来就能记课了。')}</p> : (
          <ul className="md-roster">
            {roster.map(student => {
              const state = progress(student)
              return (
                <li key={student.name}>
                  <b>{student.name}</b>
                  <select value={student.layer || ''} onChange={event => changeLayer(student, event.target.value)}>
                    <option value="">{t('还没标')}</option>
                    {klass.layers.map(layer => <option key={layer} value={layer}>{t(layer)}</option>)}
                  </select>
                  <span className="md-roster-progress">{t('已上 {done}/{total}', { done: state.done, total: klass.total })}</span>
                  {lastOf(student) ? <span className="md-roster-last">{t('第 {n} 次：{m}', { n: lastOf(student).no, m: lastOf(student).mastery || t('还没记') })}</span> : null}
                  {state.missed ? <span className="md-roster-warn">{t('缺 {n} 次', { n: state.missed })}</span> : null}
                  {state.homeworkMissing ? <span className="md-roster-warn">{t('作业 {n} 次没交', { n: state.homeworkMissing })}</span> : null}
                  <span className="md-grow" />
                  <button type="button" className="md-inline-link" onClick={() => setOpenStudent(openStudent === student.name ? '' : student.name)}>
                    {openStudent === student.name ? t('收起记录') : t('每次课')}
                  </button>
                  <button type="button" className="md-inline-link" onClick={() => moveOut(student)}>{t('移出班')}</button>
                  {openStudent === student.name ? (
                    <ul className="md-student-history">
                      {(lessons ?? []).filter(row => row.name === student.name).sort((a, b) => a.no - b.no).map(row => (
                        <li key={row.no}>
                          <b>{t('第 {n} 次', { n: row.no })}</b>
                          <span className="md-muted">{row.date || t('没填日期')}</span>
                          <span>{row.attend || '—'}</span>
                          <span>{row.mastery || '—'}</span>
                          <span>{row.homework || '—'}</span>
                        </li>
                      ))}
                      {!(lessons ?? []).some(row => row.name === student.name) ? <li className="md-muted">{t('还没有课次记录')}</li> : null}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {recent.length ? (
        <section className="md-tile">
          <header className="md-tile-head"><b>{t('最近几次课')}</b><span className="md-grow" /><span className="md-muted">{t('缺课和作业没交，一眼能看到')}</span></header>
          <ul className="md-lesson-recent">
            {recent.map(row => (
              <li key={row.no}>
                <button type="button" className="md-lesson-jump" onClick={() => {
                  setNo(row.no)
                  requestAnimationFrame(() => document.getElementById('lesson-recorder')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                }}>
                  <b>{t('第 {n} 次', { n: row.no })}</b>
                  <span className="md-muted">{row.date || t('没填日期')}</span>
                  <span className="md-grow" />
                  {row.missed ? <em>{t('缺 {n} 人', { n: row.missed })}</em> : <em className="is-ok">{t('都到了')}</em>}
                  {row.homeworkMissing ? <em>{t('作业没交 {n} 人', { n: row.homeworkMissing })}</em> : <em className="is-ok">{t('作业都交了')}</em>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {klass.status === '结课' ? (
        <p className="md-muted md-class-ended-note">{t('这个班已结课：还能补改以前的课次记录；要接着上，点上面「重新开班」。')}</p>
      ) : null}

      {roster.length ? (
        <section className="md-tile md-lesson" id="lesson-recorder">
          <header className="md-tile-head">
            <b>{t('记这次课')}</b>
            <span className="md-grow" />
            <label className="md-inline-field"><span>{t('第几次')}</span>
              <select value={no} onChange={event => setNo(Number(event.target.value))}>
                {Array.from({ length: klass.total }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="md-inline-field"><span>{t('日期')}</span>
              <input type="date" value={date} onChange={event => setDate(event.target.value)} />
            </label>
          </header>
          <div className="md-lesson-quick">
            <span className="md-muted">
              {t('已记 {n} 人 · 还有 {m} 人没记', { n: draftRecorded, m: Math.max(0, roster.length - draftRecorded) })}
              {savedCount ? t(' · 这一节已记过，保存会更新') : ''}
            </span>
            <span className="md-grow" />
            <button type="button" className="md-inline-link" onClick={() => fillAll('attend', '到')}>{t('全部到齐')}</button>
            <button type="button" className="md-inline-link" onClick={() => fillAll('homework', '交')}>{t('作业全交')}</button>
          </div>
          <div className="md-lesson-grid">
            {roster.map(student => {
              const row = draft[student.name] ?? emptyDraft(student.name)
              return (
                <div key={student.name} className={`md-lesson-row ${row.attend || row.mastery || row.homework ? '' : 'is-empty'}`}>
                  <b>{student.name}</b>
                  {previous[student.name] ? (
                    <span className="md-lesson-prev">
                      {t('上次：{summary}', { summary: [previous[student.name].className !== klass.name ? previous[student.name].className : '', previous[student.name].date, previous[student.name].mastery, previous[student.name].homework].filter(Boolean).join(' · ') || t('没记') })}
                      {(() => {
                        const rank = { 不会: 0, 半会: 1, 会: 2 }
                        const before = rank[previous[student.name].mastery]
                        const now = rank[row.mastery]
                        if (before === undefined || now === undefined) return null
                        if (now > before) return <em className="is-up">{t('进步')}</em>
                        if (now < before) return <em className="is-down">{t('退步')}</em>
                        return <em>{t('持平')}</em>
                      })()}
                    </span>
                  ) : null}
                  {[['attend', ATTEND_OPTIONS], ['mastery', MASTERY_OPTIONS], ['homework', HOMEWORK_OPTIONS]].map(([key, options]) => (
                    <div key={key} className="md-seg" role="group" aria-label={t(key === 'attend' ? '出勤' : key === 'mastery' ? '掌握' : '作业')}>
                      {options.map(value => (
                        <button type="button" key={value} className={row[key] === value ? 'is-on' : ''} onClick={() => setCell(student.name, key, value)}>{t(value)}</button>
                      ))}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          <div className="md-lesson-foot">
            <span className="md-muted">{t('点一下就记上，再点一下取消；没点的人不会记成到齐。')}</span>
            <span className="md-grow" />
            <button type="button" className="md-pill is-primary" onClick={saveLesson} disabled={busy === 'lesson'}>
              {busy === 'lesson' ? t('保存中…') : t('保存这次课')}
            </button>
          </div>
        </section>
      ) : null}
      <p className="md-muted">{t('课次记录存在工作区的 课次记录.csv，Excel 也能看。')}</p>
    </div>
  )
}
