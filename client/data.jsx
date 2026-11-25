// 看数据 = 内容库：每一条口播的真实结果（播放/涨粉/私信），自动打分、自动标爆款。
// 插件里做的稿子、以前发过的视频（手动补录 / 从后台导入），都记在 内容库.csv 这一张表里。
import React from 'react'
import { createContent, fetchContent, fetchLeads, fetchWorkspace, importData, removeContent, revealDir, setDesk, toast, updateContentRow, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { launchFailedToast, startChat } from './launch.js'
import { ADOPT_OPTIONS, dayKey } from './util.js'
import { Icon } from './ui.jsx'
import { WorksPanel } from './works.jsx'

const num = value => Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0
const rowKey = row => row['目录'] || row['创建时间'] || row['标题']

const EMPTY_FORM = { title: '', topic: '', platform: '', publishedAt: '', views: '', follows: '', dms: '', added: '' }

// 看数据页的筛选/搜索：切到别的页面再回来不重置
const DATA_UI = { filter: 'all', query: '', bizRange: 'all', sort: 'recent' }

export function DataView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const [rows, setRows] = React.useState(null)
  const [stats, setStats] = React.useState({ count: 0, hits: 0, views: 0, follows: 0, dms: 0 })
  const [lessons, setLessons] = React.useState('')
  const [root, setRoot] = React.useState('')
  const [paste, setPaste] = React.useState('')
  const [imported, setImported] = React.useState(null)
  const [busy, setBusy] = React.useState('')
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [adding, setAdding] = React.useState(false)
  const [filter, setFilter] = React.useState(DATA_UI.filter)
  const dataFilter = useDesk(s => s.dataFilter)
  const dataQuery = useDesk(s => s.dataQuery)
  const [tab, setTab] = React.useState('content')
  const [leads, setLeads] = React.useState([])
  const [bizRange, setBizRange] = React.useState(DATA_UI.bizRange)
  const [query, setQuery] = React.useState(DATA_UI.query)
  const [sort, setSort] = React.useState(DATA_UI.sort)
  const [loadError, setLoadError] = React.useState('')
  const [refreshing, setRefreshing] = React.useState(false)
  const [shown, setShown] = React.useState(30)

  const load = React.useCallback(() => {
    setLoadError('')
    return fetchContent()
      .then(data => {
        setRows(data.rows ?? [])
        setStats(data.stats ?? {})
        setLessons(data.lessons ?? '')
        if (data.removed?.length) toast(t('有 {n} 条在文件夹里已经删掉了，已同步移除', { n: data.removed.length }))
      })
      .catch(err => { setLoadError(err.message); toast(err.message, { error: true }) })
  }, [])
  React.useEffect(() => { load() }, [load])
  const loadLeads = React.useCallback(() => fetchLeads().then(data => setLeads(data.leads ?? [])).catch(() => {}), [])
  React.useEffect(() => { loadLeads() }, [loadLeads])
  React.useEffect(() => { fetchWorkspace().then(info => setRoot(info.root)).catch(() => {}) }, [])
  React.useEffect(() => { Object.assign(DATA_UI, { filter, query, bizRange, sort }) }, [filter, query, bizRange, sort])
  React.useEffect(() => { setShown(30) }, [filter, query, sort])
  React.useEffect(() => {
    if (!dataFilter) return
    setTab('content')
    setFilter(dataFilter)
    setDesk({ dataFilter: '' })
  }, [dataFilter])
  React.useEffect(() => {
    if (!dataQuery) return
    setTab('content')
    setQuery(dataQuery)
    setDesk({ dataQuery: '' })
  }, [dataQuery])

  const copyText = (text) => {
    if (!navigator.clipboard?.writeText) return toast(t('这个环境不能直接复制，去表格里复制吧'), { error: true })
    navigator.clipboard.writeText(text).then(() => toast(t('已复制'))).catch(() => toast(t('复制失败'), { error: true }))
  }
  const copyPack = (row) => {
    copyText([
      `标题：${row['标题'] ?? ''}`,
      `标签：${row['标签'] ?? ''}`,
      row['评论区'] ? `评论区置顶：${row['评论区']}` : '',
      row['私信引导'] ? `私信第一句：${row['私信引导']}` : '',
    ].filter(Boolean).join('\n\n'))
  }

  const patch = async (row, key, value) => {
    try {
      await updateContentRow(rowKey(row), { [key]: value })
      load()
    } catch (err) { toast(err.message, { error: true }) }
  }

  const remove = async (row) => {
    if (!window.confirm(t('删掉这条记录？文件夹里的 Word / Markdown 不会被删。'))) return
    try {
      await removeContent(rowKey(row))
      toast(t('已从内容库删掉一条'))
      load()
    } catch (err) { toast(err.message, { error: true }) }
  }

  const analyze = () => {
    const hint = rows?.filter(row => row['私信'] || row['爆款'] === '是').slice(0, 5).map(row => row['标题']).join('、')
    if (!startChat('data', { files: hint ? [hint] : [], profile: t('内容库：{n} 条，爆款 {h} 条', { n: stats.count ?? 0, h: stats.hits ?? 0 }) })) launchFailedToast(toast)
  }

  const doImport = async () => {
    if (!paste.trim()) return
    setBusy('import')
    try {
      const result = await importData(paste)
      setImported(result)
      toast(t('对上 {n} 条，新建 {m} 条', { n: result.matched ?? 0, m: result.created ?? 0 }))
      setPaste('')
      load()
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const submitAdd = async (event) => {
    event.preventDefault()
    if (!form.title.trim()) return toast(t('先写一个标题'), { error: true })
    setBusy('create')
    try {
      await createContent(form)
      toast(t('补录好了，已经进内容库'))
      setForm(EMPTY_FORM)
      setAdding(false)
      load()
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const setField = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const FILTERS = [
    { id: 'all', label: t('全部'), test: () => true },
    { id: 'draft', label: t('未发布'), test: row => row['状态'] !== '已发布' },
    { id: 'published', label: t('已发布'), test: row => row['状态'] === '已发布' },
    { id: 'missing', label: t('缺数据'), test: row => row['状态'] === '已发布' && (!String(row['播放'] ?? '').trim() || !String(row['发布日'] ?? '').trim()) },
    { id: 'hit', label: t('爆款'), test: row => row['爆款'] === '是' },
  ]
  const weekStart = dayKey(new Date(Date.now() - 6 * 86400000))
  const monthStart = dayKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const cutoff = bizRange === 'week' ? weekStart : bizRange === 'month' ? monthStart : ''
  const scopedLeads = leads.filter(row => !cutoff || (row.date && row.date >= cutoff))
  const q = query.trim()
  const list = (rows ?? []).filter(row => (FILTERS.find(item => item.id === filter) ?? FILTERS[0]).test(row)
    && (!q || [row['标题'], row['选题'], row['平台'], row['备注']].some(value => String(value ?? '').includes(q))))
    .sort((a, b) => {
      if (sort === 'views') return num(b['播放']) - num(a['播放'])
      if (sort === 'dms') return num(b['私信']) - num(a['私信'])
      if (sort === 'added') return num(b['加微']) - num(a['加微'])
      if (sort === 'rate' || sort === 'addRate') {
        // 播放太少时比率会虚高，低于 500 播放的排在最后
        const key = sort === 'rate' ? '私信' : '加微'
        const rate = row => (num(row['播放']) >= 500 ? num(row[key]) / num(row['播放']) * 10000 : -1)
        return rate(b) - rate(a)
      }
      return String(b['发布日'] || b['创建时间']).localeCompare(String(a['发布日'] || a['创建时间']))
    })
  const countOf = id => (rows ?? []).filter(row => (FILTERS.find(item => item.id === id) ?? FILTERS[0]).test(row)).length

  return (
    <div className="md-page md-data">
      <header className="md-page-head">
        <div>
          <h1>{t('看数据')}</h1>
          <p className="md-page-sub">{tab === 'files'
            ? t('工作区里的文件夹和文件，直接看、直接开，改了这里也跟着变。')
            : t('每条内容回填播放、涨粉、私信：以前发过的视频也能补录。填完自动打分，最好的那几条标成爆款，下次生成会参考它们。')}</p>
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" className="md-inline-link" disabled={refreshing} onClick={async () => {
          setRefreshing(true)
          try {
            await Promise.all([load(), loadLeads()])
            toast(t('刷新好了'))
          } finally { setRefreshing(false) }
        }}>{refreshing ? t('刷新中…') : t('刷新')}</button>
        <button type="button" className="md-pill" onClick={() => revealDir().catch(err => toast(err.message, { error: true }))}>
          <Icon name="folder" size={14} />{t('打开工作区')}
        </button>
      </header>

      <div className="md-content-tabs md-data-tabs">
        <button type="button" className={tab === 'content' ? 'is-on' : ''} onClick={() => setTab('content')}>{t('内容库')}</button>
        <button type="button" className={tab === 'files' ? 'is-on' : ''} onClick={() => setTab('files')}>{t('工作区文件')}</button>
      </div>

      <div className="md-biz-head">
        <span>{t('私信漏斗（线索表）')}</span>
        <div className="md-biz-range">
          {[['all', t('全部')], ['week', t('近 7 天')], ['month', t('本月')]].map(([id, label]) => (
            <button type="button" key={id} className={bizRange === id ? 'is-on' : ''} onClick={() => setBizRange(id)}>{label}</button>
          ))}
        </div>
      </div>
      <section className="md-biz-strip">
        <button type="button" onClick={() => setDesk({ view: 'dm', focusId: null })}><b>{scopedLeads.length || '—'}</b><span>{t('私信线索')}</span></button>
        <button type="button" onClick={() => setDesk({ view: 'dm', focusId: null })}><b>{scopedLeads.filter(row => ['已加微信', '已进群'].includes(row.stage)).length || '—'}</b><span>{t('已加微')}</span></button>
        <button type="button" onClick={() => setDesk({ view: 'dm', focusId: null })}><b>{scopedLeads.filter(row => row.stage === '约试听').length || '—'}</b><span>{t('约试听')}</span></button>
        <button type="button" onClick={() => setDesk({ view: 'students', focusId: null })}><b>{scopedLeads.filter(row => row.stage === '已报课').length || '—'}</b><span>{t('报课')}</span></button>
      </section>

      {tab === 'files' ? <WorksPanel /> : (
        <>
      <div className="md-biz-head"><span>{t('内容结果（内容库）')}</span></div>
      <section className="md-data-summary">
        <div><b>{stats.count ?? 0}</b><span>{t('条内容')}</span></div>
        <div><b>{stats.hits ?? 0}</b><span>{t('条爆款')}</span></div>
        <div><b>{stats.follows || '—'}</b><span>{t('总涨粉')}</span></div>
        <div><b>{stats.dms || '—'}</b><span>{t('总私信')}</span></div>
        <div><b>{stats.added || '—'}</b><span>{t('总加微')}</span></div>
        <div><b>{stats.per10k ? stats.per10k : '—'}</b><span>{t('每万播私信')}</span></div>
        <div><b>{stats.addRate ? `${stats.addRate}%` : '—'}</b><span>{t('私信→加微')}</span></div>
      </section>

      {lessons ? (
        <div className="md-lessons">
          <b>{t('现在的经验')}</b>
          <pre className="md-lessons-pre">{lessons.trim()}</pre>
        </div>
      ) : null}

      <section className="md-create-input">
        <label className="md-field">
          <span>{t('粘贴平台数据（第一行可以是表头：标题,播放,涨粉,私信）')}</span>
          <textarea rows={4} value={paste} onChange={event => setPaste(event.target.value)} placeholder={'标题,播放,涨粉,私信\n期中 58 分还能补吗,5200,18,6'} />
        </label>
        <div className="md-create-actions">
          <span className="md-muted">{t('按标题对上内容库里的那一条；没对上的会自动补一条进来。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill" onClick={doImport} disabled={!paste.trim() || busy === 'import'}>
            {busy === 'import' ? t('匹配中…') : t('导入数据')}
          </button>
          <button type="button" className="md-pill is-primary" onClick={analyze}>
            <Icon name="chat" size={14} />{t('用 AI 分析')}
          </button>
        </div>
        {imported ? (
          <div className="md-import-result">
            <b>{t('这次导入：对上 {n} 条 · 新建 {m} 条', { n: imported.matched ?? 0, m: imported.created ?? 0 })}</b>
            {imported.createdTitles?.length ? <p>{t('新建：{list}', { list: imported.createdTitles.join('、') })}</p> : null}
            {imported.unmatched?.length ? <p>{t('没对上：{list}', { list: imported.unmatched.join('、') })}</p> : null}
            <button type="button" className="md-inline-link" onClick={() => setImported(null)}>{t('知道了')}</button>
          </div>
        ) : null}
      </section>

      <section className="md-content-add">
        <button type="button" className="md-inline-link" onClick={() => setAdding(value => !value)}>
          {adding ? t('收起') : t('+ 补录一条（以前发过的视频也能进库）')}
        </button>
        {adding ? (
          <form className="md-add-form" onSubmit={submitAdd}>
            <label className="md-field"><span>{t('标题')}</span><input value={form.title} onChange={event => setField('title', event.target.value)} placeholder={t('家长会搜的那句话')} /></label>
            <label className="md-field"><span>{t('选题')}</span><input value={form.topic} onChange={event => setField('topic', event.target.value)} placeholder={t('可不填')} /></label>
            <label className="md-field"><span>{t('平台')}</span><input value={form.platform} onChange={event => setField('platform', event.target.value)} placeholder={t('抖音 / 视频号')} /></label>
            <label className="md-field"><span>{t('发布日')}</span><input value={form.publishedAt} onChange={event => setField('publishedAt', event.target.value)} placeholder="2026-11-24" /></label>
            {[['views', '播放'], ['follows', '涨粉'], ['dms', '私信'], ['added', '加微']].map(([key, label]) => (
              <label className="md-field" key={key}><span>{t(label)}</span><input inputMode="numeric" value={form[key]} onChange={event => setField(key, event.target.value)} placeholder="—" /></label>
            ))}
            <div className="md-add-foot">
              <span className="md-muted">{t('补进来的默认是「已发布」，不写文件，只记数据。')}</span>
              <span className="md-grow" />
              <button type="submit" className="md-pill is-primary" disabled={busy === 'create'}>{busy === 'create' ? t('保存中…') : t('记进内容库')}</button>
            </div>
          </form>
        ) : null}
      </section>

      {rows === null && !loadError ? <p className="md-muted">{t('读取中…')}</p> : null}
      {loadError ? (
        <div className="md-load-error">
          <p>{t('读取失败：{msg}', { msg: loadError })}</p>
          <button type="button" className="md-pill is-small" onClick={load}>{t('重试')}</button>
        </div>
      ) : null}

      {rows?.length === 0 ? (
        <div className="md-works-empty">
          <p>{t('内容库还是空的。先去「做内容」生成几条口播，发出去以后再回来填结果；以前发过的视频也能用上面的「补录一条」。')}</p>
          <button type="button" className="md-pill is-primary" onClick={() => setDesk({ view: 'content', focusId: null })}>{t('去做第一条口播')}</button>
        </div>
      ) : null}

      {rows?.length ? (
        <>
        <div className="md-content-tools">
          <input className="md-lead-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('搜标题、选题、平台')} />
          <select className="md-case-result" value={sort} onChange={event => setSort(event.target.value)}>
            {[['recent', t('最新')], ['views', t('播放最多')], ['dms', t('私信最多')], ['added', t('加微最多')], ['rate', t('每万播私信最高')], ['addRate', t('每万播加微最高')]].map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <span className="md-muted">{t('{n} 条', { n: list.length })}</span>
        </div>
        {sort === 'rate' || sort === 'addRate' ? <p className="md-muted">{t('按效率排序时，播放少于 500 的内容排在最后，避免比率虚高。')}</p> : null}
        </>
      ) : null}

      {rows?.length ? (
        <div className="md-content-tabs">
          {FILTERS.map(item => (
            <button type="button" key={item.id} className={filter === item.id ? 'is-on' : ''} onClick={() => setFilter(item.id)}>
              {item.label}<em>{countOf(item.id)}</em>
            </button>
          ))}
        </div>
      ) : null}

      {rows?.length && !list.length ? <p className="md-muted">{q ? t('没搜到相关内容。') : t('这个筛选下没有内容。')}</p> : null}

      {list.length ? (
        <ul className="md-content-list">
          {list.slice(0, shown).map(row => (
            <li className="md-content-card" key={rowKey(row)}>
              <header className="md-card-head">
                <h3>{row['标题']}</h3>
                {row['爆款'] === '是' ? <b className="md-hit">{t('爆款')}</b> : null}
                <span className="md-grow" />
                <span className="md-card-score" title={t('分数')}>{row['分数'] || '—'}</span>
              </header>
              {row['选题'] ? <p className="md-card-topic">{row['角度'] ? <em className="md-content-angle">{row['角度']}</em> : null}{row['选题']}</p> : null}
              {row['状态'] === '已发布' ? (
                <>
                  <div className="md-card-metrics">
                    {['播放', '涨粉', '私信', '加微'].map(key => (
                      <label key={key}>
                        <span>{t(key)}</span>
                        <input
                          defaultValue={row[key] ?? ''}
                          placeholder="—"
                          inputMode="numeric"
                          onBlur={event => { if (event.target.value !== (row[key] ?? '')) patch(row, key, event.target.value) }}
                        />
                      </label>
                    ))}
                  </div>
                  {row['评论区'] || row['私信引导'] ? (
                    <div className="md-content-lead">
                      {row['评论区'] ? (
                        <p><b>{t('评论区置顶')}</b><span>{row['评论区']}</span><button type="button" className="md-inline-link" onClick={() => copyText(row['评论区'])}>{t('复制')}</button></p>
                      ) : null}
                      {row['私信引导'] ? (
                        <p><b>{t('私信第一句')}</b><span>{row['私信引导']}</span><button type="button" className="md-inline-link" onClick={() => copyText(row['私信引导'])}>{t('复制')}</button></p>
                      ) : null}
                    </div>
                  ) : null}
                  {num(row['播放']) >= 500 ? (
                    <p className="md-card-rate">
                      {t('私信/万播：{rate}', { rate: (num(row['私信']) / num(row['播放']) * 10000).toFixed(1) })}
                      {' · '}
                      {t('加微/万播：{rate}', { rate: (num(row['加微']) / num(row['播放']) * 10000).toFixed(1) })}
                    </p>
                  ) : num(row['播放']) > 0 ? (
                    <p className="md-card-rate">{t('播放不足 500，暂不计算比率')}</p>
                  ) : null}
                  <div className="md-card-metrics">
                    <label><span>{t('平台')}</span>
                      <input defaultValue={row['平台'] ?? ''} placeholder={t('抖音 / 视频号')} onBlur={event => { if (event.target.value !== (row['平台'] ?? '')) patch(row, '平台', event.target.value) }} />
                    </label>
                    <label><span>{t('发布日')}</span>
                      <input defaultValue={row['发布日'] ?? ''} placeholder="2026-11-24" onBlur={event => { if (event.target.value !== (row['发布日'] ?? '')) patch(row, '发布日', event.target.value) }} />
                    </label>
                  </div>
                </>
              ) : (
                <p className="md-card-hint">{t('还没发布。发出去以后把状态改成「已发布」，再回来填播放、涨粉、私信。')}</p>
              )}
              <footer className="md-card-foot">
                <select value={row['状态'] || '未发布'} onChange={event => patch(row, '状态', event.target.value)}>
                  <option value="未发布">{t('未发布')}</option>
                  <option value="已发布">{t('已发布')}</option>
                </select>
                <select value={row['采用'] || '未定'} onChange={event => patch(row, '采用', event.target.value)}>
                  {ADOPT_OPTIONS.map(option => <option key={option} value={option}>{t(option)}</option>)}
                </select>
                <span className="md-grow" />
                {row['目录'] ? <button type="button" className="md-inline-link" onClick={() => revealDir(row['目录']).catch(err => toast(err.message, { error: true }))}>{t('打开文件夹')}</button> : null}
                <button type="button" className="md-inline-link" onClick={() => copyPack(row)}>{t('复制发布包')}</button>
                <button type="button" className="md-inline-link" onClick={() => remove(row)}>{t('删除')}</button>
              </footer>
            </li>
          ))}
        </ul>
      ) : null}

      {rows?.length && list.length > shown ? (
        <button type="button" className="md-inline-link md-load-more" onClick={() => setShown(value => value + 30)}>{t('显示更多（还有 {n} 条）', { n: list.length - shown })}</button>
      ) : null}

      <p className="md-works-path">{t('文件位置：{root}/内容库.csv（Excel 也能改）', { root: root || '~/Documents/Youtulh 工作台' })}</p>
      {!positioning.subject ? <p className="md-muted">{t('还没填设定，先去「我的设定」把科目和年级填上。')}</p> : null}
        </>
      )}
    </div>
  )
}
