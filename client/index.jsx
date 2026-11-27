// dsh-youtulh-workbench 浏览器半片：侧栏入口 + main 全局面板。
import React from 'react'
import { CreateView } from './create.jsx'
import { dispatchOps, loadDesk, setDesk, undo, useDesk } from './desk.js'
import { DataView } from './data.jsx'
import { DiagnosticsView } from './diagnostics.jsx'
import { DmView } from './dm.jsx'
import { setAppCtx } from './launch.js'
import { SetupView } from './setup.jsx'
import { StudentsView } from './students.jsx'
import { WelcomeView } from './welcome.jsx'
import { SettingsDialog } from './settings.jsx'
import css from './styles.css'
import { lang, subscribeLang, t, useLang } from './i18n.js'
import { updateUrl, useVersionInfo } from './version.js'
import { Dialog, FormDialog, Icon, IconButton, Toast } from './ui.jsx'

const PANEL_ID = 'media-desk'

// navKey：同一个中文在别处意思不同（单数的“灵感”“风格”），英文导航另查一条
const NAV = [
  { id: 'home', label: '首页', icon: 'wall' },
  { id: 'content', label: '做内容', icon: 'pen' },
  { id: 'diagnose', label: '试听诊断', icon: 'spark' },
  { id: 'data', label: '看数据', icon: 'list' },
  { id: 'dm', label: '线索表', icon: 'chat' },
  { id: 'students', label: '学生管理', icon: 'target' },
  { id: 'setup', label: '我的设定', icon: 'user' },
]

const VIEWS = { home: WelcomeView, dm: DmView, diagnose: DiagnosticsView, students: StudentsView, content: CreateView, data: DataView, setup: SetupView }

function UpdateBadge() {
  const info = useVersionInfo()
  const href = updateUrl(info)
  if (!href) return null
  return (
    <a className="md-update" href={href} target="_blank" rel="noreferrer" title={t('新版本 {version} 已发布，点击查看更新说明', { version: info.latest })}>
      ↑ v{info.latest}
    </a>
  )
}

function SampleBadge() {
  const hasSample = useDesk(s => s.state.items.some(i => i.sample))
  if (!hasSample) return null
  return (
    <button type="button" className="md-sample" title={t('现在看到的内容都是示例，可以一键清空')} onClick={() => setDesk({
      dialog: {
        title: t('清空示例数据'),
        submitLabel: t('清空'),
        fields: [],
        onSubmit: () => dispatchOps([{ op: 'clear_samples' }], { label: t('清空示例数据') }),
      },
    })}>{t('示例数据 · 清空')}</button>
  )
}

/** 面板出错时别整片空白：告诉用户数据还在，给重试和重新加载两个出口。 */
class PanelBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, copied: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    // 出问题时留一份现场，方便回头查（不往外发）
    try { window.__youtulhLastError = String(error?.stack || error) } catch { /* 忽略 */ }
    console.error('[Youtulh 工作台]', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="md-page md-crash">
        <h1>{this.props.page ? t('{page}这一页出错了', { page: t(this.props.page) }) : t('工作台这一页出错了')}</h1>
        <p className="md-muted">{t('你的数据都还在，没有丢。先点重新加载；还不行就把下面这行发给我。')}</p>
        <pre className="md-crash-detail">{String(this.state.error?.message || this.state.error)}</pre>
        <div className="md-create-actions">
          <button type="button" className="md-pill" onClick={() => this.setState({ error: null })}>{t('重试')}</button>
          <button type="button" className="md-pill" onClick={async () => {
            const text = window.__youtulhLastError || String(this.state.error?.message || this.state.error)
            try {
              await navigator.clipboard.writeText(text)
              this.setState({ copied: true })
            } catch { /* 剪贴板不可用就算了 */ }
          }}>{this.state.copied ? t('已复制') : t('复制错误信息')}</button>
          <button type="button" className="md-pill is-primary" onClick={() => window.location.reload()}>{t('重新加载')}</button>
        </div>
      </div>
    )
  }
}

function Desk() {
  // 切换语言时整棵树重新渲染
  useLang()
  const ready = useDesk(s => Boolean(s.state))
  const error = useDesk(s => s.error)
  const view = useDesk(s => s.view)
  const dockOpen = useDesk(s => s.dockOpen)
  const canUndo = useDesk(s => s.canUndo)
  const rootRef = React.useRef(null)
  const [width, setWidth] = React.useState(1600)
  const narrow = width < 1020

  React.useEffect(() => { loadDesk() }, [])
  // 窗口窄的时候对话栏会盖住内容，默认收起，需要时再打开
  React.useEffect(() => {
    if (narrow) setDesk({ dockOpen: false })
  }, [narrow])
  React.useEffect(() => {
    const el = rootRef.current
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  React.useEffect(() => {
    const onKey = (event) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable
      if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey && !typing && canUndo) {
        event.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canUndo])

  // 工作区有自己的对话栏
  const focused = useDesk(s => Boolean(s.focusId))
  const showDock = dockOpen && !focused
  const Active = VIEWS[view] ?? WelcomeView
  return (
    <div className={`md-root ${narrow ? 'is-narrow' : ''} ${width < 780 ? 'is-compact' : ''} ${showDock ? 'has-dock' : ''}`} ref={rootRef}>
      <style>{css}</style>
      <div className="md-ambient" aria-hidden="true"><i /><i /><i /></div>
      <aside className="md-rail">
        <div className="md-brand">
          <span className="md-brand-mark"><Icon name="scatter" size={15} /></span>
          <span className="md-brand-text"><b>Youtulh</b><small>{t('工作台')}</small></span>
        </div>
        <nav className="md-rail-nav" aria-label={t('推流工具导航')}>
          {NAV.map(entry => (
            <button
              type="button"
              key={entry.id}
              className={view === entry.id ? 'is-on' : ''}
              aria-current={view === entry.id ? 'page' : undefined}
              onClick={() => setDesk({ view: entry.id, focusId: null })}
            >
              <Icon name={entry.icon} size={15} />
              <span>{entry.navKey && lang() === 'en' ? t(entry.navKey) : t(entry.label)}</span>
            </button>
          ))}
        </nav>
        <div className="md-rail-foot">
          {ready ? <SampleBadge /> : null}
          {ready ? <UpdateBadge /> : null}
        </div>
      </aside>
      <div className="md-main">
        <header className="md-topbar" data-window-drag="">
          <nav className="md-nav" aria-label={t('推流工具导航')}>
            {NAV.map(entry => (
              <button type="button" key={entry.id} className={view === entry.id ? 'is-on' : ''} aria-current={view === entry.id ? 'page' : undefined} onClick={() => setDesk({ view: entry.id, focusId: null })}>{entry.navKey && lang() === 'en' ? t(entry.navKey) : t(entry.label)}</button>
            ))}
          </nav>
          <span style={{ flex: 1 }} />
          {canUndo ? <IconButton icon="undo" label={t('撤销上一步')} onClick={undo} /> : null}
          <IconButton icon="gear" label={t('设置')} onClick={() => setDesk({ settingsOpen: true })} />
        </header>
        <main className="md-content" key={view}>
          {error ? (
            <div className="md-page"><p className="md-muted">{t('工作台加载失败：{error}', { error })}</p><button type="button" className="md-btn" onClick={loadDesk}>{t('重试')}</button></div>
          ) : ready ? <PanelBoundary key={view} page={NAV.find(entry => entry.id === view)?.label ?? ''}><Active /></PanelBoundary> : <div className="md-loading"><span className="md-shimmer">{t('正在打开工作台…')}</span></div>}
        </main>
      </div>
      <FormDialog />
      {ready ? <SettingsDialog /> : null}
      <Toast />
    </div>
  )
}

function Root() {
  return <PanelBoundary><Desk /></PanelBoundary>
}

function PanelIcon({ size }) {
  return <Icon name="scatter" size={size} />
}

export const inject = ['slots', 'uiWorkspace']

export function apply(ctx) {
  setAppCtx(ctx)
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, Root))
  // 侧栏的名字只在注册时读一次，换语言时重新注册
  ctx.effect(() => {
    let release = null
    const mount = () => {
      release?.()
      release = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 5,
        label: () => t('Youtulh 工作台'),
      }, PanelIcon))
    }
    mount()
    const off = subscribeLang(mount)
    return () => { off(); release?.() }
  }, 'dsh-youtulh-workbench: sidebar entry')
  mountBetterSidebar(ctx)
}

/**
 * 装了 dsh-better-sidebar 就再挂一个右侧栏的页面（#10）：左侧栏被别的插件整个接管时，
 * 这是唯一还点得到的入口。没装就什么都不做——它是软依赖，不进顶层的 inject。
 */
function mountBetterSidebar(ctx) {
  const register = inner => {
    const sidebar = inner.betterSidebar ?? inner.get?.('betterSidebar')
    if (typeof sidebar?.registerTab !== 'function') return
    inner.effect(() => sidebar.registerTab({
      id: `${PANEL_ID}:workbench`,
      title: () => t('Youtulh 工作台'),
      description: () => t('灵感、内容、排期、复盘、风格'),
      icon: size => <PanelIcon size={size} />,
      order: 60,
      single: true,
      component: Root,
    }), 'dsh-youtulh-workbench: better-sidebar tab')
  }
  try {
    // 服务晚于我们就绪、或者中途被卸掉再装回，子作用域都会跟着重来
    if (typeof ctx.inject === 'function') ctx.inject(['betterSidebar'], register)
    else register(ctx)
  } catch (error) {
    console.warn('[dsh-youtulh-workbench] better-sidebar tab skipped:', error)
  }
}
