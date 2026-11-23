// 风格：按博主类型分板块的预设，加上从自己账号提炼的专属风格。选哪张，就按哪张写。
import React from 'react'
import { dispatchOps, exportSkills, extractStyle, learnSkills, setDesk, useDesk, useMonidReady } from './desk.js'
import { ConnectDialog } from './connect.jsx'
import { lang, t, useLang } from './i18n.js'
import { Dialog, Icon, IconButton } from './ui.jsx'
import { STYLE_CATEGORIES, hash, styleIcon } from './util.js'

function AddStyleDialog({ initialTab, onClose, onConnect }) {
  const [tab, setTab] = React.useState(initialTab)
  const [text, setText] = React.useState('')
  const [urls, setUrls] = React.useState('')
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    const ok = await extractStyle(tab === 'text' ? { text, name } : { urls: urls.split(/\s+/).filter(Boolean), name })
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <Dialog title={t('添加我的风格')} onClose={onClose} width={520}>
      <div className="md-capture-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'text'} className={tab === 'text' ? 'is-on' : ''} onClick={() => setTab('text')}>{t('贴内容')}</button>
        <button type="button" role="tab" aria-selected={tab === 'url'} className={tab === 'url' ? 'is-on' : ''} onClick={() => setTab('url')}>{t('贴链接')}</button>
      </div>
      <form className="md-form" onSubmit={submit}>
        {tab === 'text' ? (
          <label className="md-field">
            <span>{t('内容')}</span>
            <textarea rows={8} required value={text} onChange={e => setText(e.target.value)} placeholder={t('贴几篇你写过的稿子，越多越准。')} />
          </label>
        ) : (
          <label className="md-field">
            <span>{t('链接')}</span>
            <textarea rows={4} required value={urls} onChange={e => setUrls(e.target.value)} placeholder={t('你自己发过的内容链接\n一行一个，最多 5 个')} />
            <small>{t('只读公开页面。小红书、抖音、B 站和 TikTok、Instagram、X 要登录才能看，')}<button type="button" className="md-inline-link" onClick={onConnect}>{t('改用导入账号')}</button>{t('。')}</small>
          </label>
        )}
        <label className="md-field">
          <span>{t('名字（可选）')}</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('比如我的口播风格')} />
        </label>
        <div className="md-form-foot">
          <span style={{ flex: 1 }} />
          <button type="button" className="md-btn" onClick={onClose}>{t('取消')}</button>
          <button type="submit" className="md-btn is-primary" disabled={busy}>{busy ? <span className="md-shimmer">{t('正在提炼…')}</span> : t('提炼风格')}</button>
        </div>
      </form>
    </Dialog>
  )
}

function editStyle(style) {
  const sep = lang() === 'en' ? ', ' : '、'
  setDesk({
    dialog: {
      title: t('编辑风格'),
      initial: { ...style, icon: styleIcon(style), words: (style.words ?? []).join(sep), avoid: (style.avoid ?? []).join(sep) },
      fields: [
        { name: 'name', label: t('名字'), required: true },
        { name: 'icon', label: t('图标'), hint: t('一个 emoji') },
        { name: 'summary', label: t('一句话概括'), type: 'textarea', rows: 2 },
        { name: 'tone', label: t('语气'), type: 'textarea', rows: 2 },
        { name: 'sentences', label: t('句式'), type: 'textarea', rows: 2 },
        { name: 'opening', label: t('开头'), type: 'textarea', rows: 2 },
        { name: 'structure', label: t('结构'), type: 'textarea', rows: 2 },
        { name: 'words', label: t('常用词'), hint: t('用顿号分隔') },
        { name: 'avoid', label: t('绝不要'), hint: t('用顿号分隔') },
      ],
      onSubmit: (values) => {
        const list = value => String(value ?? '').split(/[、,，]/).map(v => v.trim()).filter(Boolean)
        dispatchOps([{ op: 'update_style', id: style.id, name: values.name, icon: values.icon ?? '', summary: values.summary ?? '', tone: values.tone ?? '', sentences: values.sentences ?? '', opening: values.opening ?? '', structure: values.structure ?? '', words: list(values.words), avoid: list(values.avoid) }], { label: t('修改风格') })
      },
      onDelete: style.preset ? undefined : () => dispatchOps([{ op: 'delete_style', id: style.id }], { label: t('删除风格「{name}」', { name: style.name }) }),
    },
  })
}

function StyleCard({ style, active }) {
  return (
    <article className={`md-style ${active ? 'is-active' : ''}`}>
      <header>
        <span className={`md-style-icon tone-${hash(style.id) % 6}`} aria-hidden="true">{styleIcon(style)}</span>
        <div>
          <strong>{style.name}</strong>
          <small>{active ? t('正在使用') : style.preset ? t(style.category) : style.source ?? t('手动')}</small>
        </div>
        <span className="md-grow" />
        <IconButton icon="edit" label={t('编辑「{name}」', { name: style.name })} onClick={() => editStyle(style)} />
      </header>
      {style.summary ? <p className="md-style-summary">{style.summary}</p> : null}
      {style.samples?.[0] ? <blockquote>{style.samples[0]}</blockquote> : null}
      <footer>
        <button type="button" className={`md-pill is-small ${active ? '' : 'is-primary'}`} onClick={() => dispatchOps([{ op: 'set_style', id: active ? null : style.id }], { label: t('切换风格'), silent: true })}>{active ? t('不用了') : t('用这个写')}</button>
      </footer>
    </article>
  )
}

/**
 * 定位卡：只做 / 不做 / 说法 / 红线。
 * 它管的是「写什么、不写什么」，跟风格卡（怎么写）是两件事，所以放在风格页最上面。
 */
function PositioningSection() {
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const painPoints = useDesk(s => s.state?.painPoints) ?? []
  const rows = [
    ['only', '只做', '北京、高一、化学、开学后掉队'],
    ['notDo', '不做', '高二高三、外地、竞赛、只求押题'],
    ['voice', '说法', '说家长的话：物质的量 → 孩子第一次月考垮的那一课'],
    ['redline', '红线', '不承诺提分、不说包过、不报价格'],
  ]
  const commit = (key) => (value) => {
    const next = value.trim()
    if (next === (positioning[key] ?? '')) return
    dispatchOps([{ op: 'update_positioning', [key]: next }], { label: t('更新定位卡'), silent: true })
  }
  return (
    <section className="md-tile md-positioning" aria-label={t('定位卡')}>
      <header className="md-tile-head">
        <h2>{t('定位卡')}</h2>
        <span className="md-tile-meta">{t('选题和成稿都得守这四条')}</span>
      </header>
      <div className="md-positioning-grid">
        {rows.map(([key, label, hint]) => (
          <label key={key} className="md-field md-positioning-field">
            <span>{t(label)}</span>
            <textarea rows={2} defaultValue={positioning[key] ?? ''} placeholder={t(hint)} onBlur={event => commit(key)(event.target.value)} />
          </label>
        ))}
      </div>
      {painPoints.length ? (
        <p className="md-positioning-pains"><span>{t('卡点清单')}</span>{painPoints.map(point => <b key={point}>{point}</b>)}</p>
      ) : null}
    </section>
  )
}

export function StyleView() {
  useLang()
  const monidReady = useMonidReady()
  const styles = useDesk(s => s.state.styles ?? [])
  const activeId = useDesk(s => s.state.activeStyleId)
  const skills = useDesk(s => s.state.skills)
  const [adding, setAdding] = React.useState(null)
  const [connecting, setConnecting] = React.useState(false)
  const [category, setCategory] = React.useState('全部')
  const active = styles.find(row => row.id === activeId)
  const mine = styles.filter(row => !row.preset)
  const presets = styles.filter(row => row.preset)
  const categories = STYLE_CATEGORIES.filter(name => presets.some(row => row.category === name))
  const shown = category === '全部' ? categories : categories.filter(name => name === category)
  const proposed = skills.filter(s => s.status === 'proposed')
  const rules = skills.filter(s => s.status !== 'proposed')
  const rule = skill => (
    <li key={skill.id} className="md-rule">
      <div>
        <strong>{skill.name}</strong>
        <p>{skill.rule}</p>
      </div>
      {skill.status === 'proposed'
        ? <button type="button" className="md-pill is-small is-primary" onClick={() => dispatchOps([{ op: 'update_skill', id: skill.id, status: 'active' }], { label: t('启用规则「{name}」', { name: skill.name }), silent: true })}>{t('启用')}</button>
        : <button type="button" className="md-pill is-small" onClick={() => dispatchOps([{ op: 'update_skill', id: skill.id, status: 'proposed' }], { label: t('停用规则「{name}」', { name: skill.name }), silent: true })}>{t('停用')}</button>}
      <IconButton icon="trash" label={t('删除规则「{name}」', { name: skill.name })} onClick={() => dispatchOps([{ op: 'delete_skill', id: skill.id }], { label: t('删除规则「{name}」', { name: skill.name }) })} />
    </li>
  )
  return (
    <div className="md-board-page">
      <div className="md-style-page">
        <section className="md-tile md-i-hero md-style-hero">
          <div className="md-hero-copy">
            <h1 className="md-i-line">
              {active ? <>{t('现在按')} <span className="md-inline-emoji" aria-hidden="true">{styleIcon(active)}</span> <b>{active.name}</b> {t('的风格写。')}</> : <>{t('选一种预设直接开写，')}<br />{t('或者贴几篇你写过的稿子，提炼你的风格。')}</>}
            </h1>
            <div className="md-hero-actions">
              <button type="button" className="md-pill is-primary" onClick={() => setAdding('text')}><Icon name="pen" size={14} />{t('贴内容')}</button>
              <button type="button" className="md-pill" onClick={() => setAdding('url')}><Icon name="link" size={14} />{t('贴链接')}</button>
              {/* 装好 Monid 才露出抓账号；没装的人不该看到一条走不通的路 */}
              {monidReady ? <button type="button" className="md-pill" onClick={() => setConnecting(true)}><Icon name="user" size={14} />{t('抓我的账号')}</button> : null}
            </div>
            {monidReady ? null : <button type="button" className="md-inline-link md-advanced-link" onClick={() => setConnecting(true)}>{t('进阶：装了 Monid 可以直接抓账号，一般不用')}</button>}
          </div>
        </section>

        <PositioningSection />

        {mine.length ? (
          <section className="md-style-section" aria-label={t('我的风格')}>
            <h2><span aria-hidden="true">✍️</span>{t('我的风格')}</h2>
            <div className="md-style-grid">{mine.map(style => <StyleCard key={style.id} style={style} active={style.id === activeId} />)}</div>
          </section>
        ) : null}

        <div className="md-style-filter" role="tablist" aria-label={t('博主类型')}>
          {['全部', ...categories].map(name => <button type="button" key={name} role="tab" aria-selected={category === name} className={category === name ? 'is-on' : ''} onClick={() => setCategory(name)}>{t(name)}</button>)}
        </div>

        {shown.map(name => (
          <section key={name} className="md-style-section" aria-label={t(name)}>
            <h2>{t(name)}</h2>
            <div className="md-style-grid">{presets.filter(row => row.category === name).map(style => <StyleCard key={style.id} style={style} active={style.id === activeId} />)}</div>
          </section>
        ))}

        <section className="md-tile md-rules">
          <header className="md-tile-head">
            <h2>{t('写作规则')}</h2>
            <span className="md-tile-meta">{t('每种风格都会遵守')}</span>
            <span className="md-grow" />
            <button type="button" className="md-pill is-small" onClick={learnSkills}><Icon name="spark" size={13} />{t('从数据中学习')}</button>
            <button type="button" className="md-pill is-small" onClick={exportSkills}><Icon name="bolt" size={13} />{t('导出为 Skill')}</button>
          </header>
          <ul>
            {proposed.map(rule)}
            {rules.map(rule)}
            {!proposed.length && !rules.length ? <li className="md-muted md-rule-empty">{t('在对话里说「以后标题都不要超过 20 个字」，这里就会多一条。')}</li> : null}
          </ul>
        </section>
      </div>
      {adding ? <AddStyleDialog initialTab={adding} onClose={() => setAdding(null)} onConnect={() => { setAdding(null); setConnecting(true) }} /> : null}
      {connecting ? <ConnectDialog onClose={() => setConnecting(false)} /> : null}
    </div>
  )
}
