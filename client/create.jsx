// 做内容：出 10 个选题 → 勾选 → 每个选题出 3 个口播版本 → 挑一条。
// 中间结果放在全局 store（并写一份 sessionStorage）：切页、刷新都不会丢。
import React from 'react'
import { fetchSuggestions, patchCreate, pickTopics, profileSummary, resetCreate, restoreCreateDraft, setDesk, toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { launchFailedToast, startChat } from './launch.js'
import { Icon } from './ui.jsx'

const TOPIC_COUNT = 10

async function post(path, body) {
  const res = await fetch(`media-desk/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-media-desk-lang': document.documentElement.lang || 'zh' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || t('请求失败（{status}）', { status: res.status }))
  return data
}

const variantKey = (topic, title) => `${topic}|${title}`

export function CreateView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const configured = Boolean(positioning.subject || positioning.grade)
  const summary = profileSummary({ positioning, painPoints: pains })
  const create = useDesk(s => s.create)
  const modelOk = useDesk(s => s.modelOk)
  const modelError = useDesk(s => s.modelError)
  const { topics, picked, groups, adopted, batch, lessons, source, examples } = create
  const [busy, setBusy] = React.useState('')

  // 刷新页面后把上一次的选题和口播捡回来
  React.useEffect(() => { restoreCreateDraft() }, [])

  React.useEffect(() => {
    if (examples.length) return
    fetchSuggestions().then(result => patchCreate({ examples: result.prompts ?? [] })).catch(() => {})
  }, [examples.length])

  const selected = topics.filter(topic => picked[topic])

  const makeTopics = async () => {
    setBusy('topics')
    try {
      const data = await post('topics', { count: TOPIC_COUNT })
      patchCreate({
        topics: data.topics ?? [], batch: data.batch ?? '', lessons: data.lessons ?? '',
        source: data.source ?? '', picked: {}, groups: [], adopted: {},
      })
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const makeScripts = async () => {
    if (!selected.length) return toast(t('先勾几个选题'), { error: true })
    setBusy('scripts')
    try {
      if (batch) await pickTopics(batch, selected).catch(() => {})
      const data = await post('scripts', { topics: selected, batch })
      patchCreate({
        groups: (data.groups ?? []).map((group, index) => ({ ...group, key: `${group.topic}-${index}` })),
        source: data.source ?? '',
      })
      toast(t('每个选题出了 3 个版本，挑一条'))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const refreshGroup = async (group) => {
    setBusy(`group-${group.topic}`)
    try {
      const data = await post('scripts', { topics: [group.topic], batch })
      const next = data.groups?.[0]
      if (next) {
        patchCreate(state => ({
          groups: state.groups.map(item => (item.topic === group.topic ? { ...next, key: `${next.topic}-${Date.now()}` } : item)),
          // 这一组换了新稿子，之前那条「已采用」不再算数
          adopted: Object.fromEntries(Object.entries(state.adopted).filter(([key]) => !key.startsWith(`${group.topic}|`))),
          source: data.source ?? state.source,
        }))
      }
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const adopt = async (group, variant) => {
    const key = variantKey(group.topic, variant.title)
    setBusy(key)
    try {
      const data = await post('content/adopt', { topic: group.topic, title: variant.title, script: variant.script, tags: variant.tags ?? [], batch })
      patchCreate(state => ({ adopted: { ...state.adopted, [key]: true } }))
      toast(t('已保存到 {dir}，并记进内容库', { dir: data.dir }))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const copy = (variant) => {
    const text = `【标题】${variant.title}\n\n【口播文案】\n${variant.script}\n\n【标签】${(variant.tags ?? []).map(tag => `#${tag}`).join(' ')}`
    navigator.clipboard.writeText(text).then(() => toast(t('已复制')), () => toast(t('复制失败'), { error: true }))
  }

  return (
    <div className="md-page md-create">
      <header className="md-page-head">
        <div>
          <h1>{t('做内容')}</h1>
          <p className="md-page-sub">{t('先出 10 个选题，勾中的每个给 3 个版本，你挑一条。不喜欢哪一批，就按刷新；切到别的页面也不会丢。')}</p>
          {summary ? <p className="md-profile-line"><Icon name="user" size={13} />{t('按你的设定：{summary}', { summary })}</p> : null}
        </div>
      </header>

      {!configured ? (
        <div className="md-warn">
          <b>{t('还没填设定')}</b>
          <span>{t('先告诉我科目、年级、城市，出的选题才是给你的，不是给所有人的。')}</span>
          <button type="button" className="md-pill is-small" onClick={() => setDesk({ view: 'setup', focusId: null })}>{t('去填设定')}</button>
        </div>
      ) : null}

      {modelOk === false ? (
        <div className="md-warn">
          <b>{t('模型没通')}</b>
          <span>{modelError || t('现在只能用本地模板凑合，写出来会偏平。')}</span>
          <button type="button" className="md-pill is-small" onClick={() => setDesk({ settingsOpen: true })}>{t('去设置')}</button>
        </div>
      ) : null}

      {lessons ? (
        <details className="md-lessons md-lessons-inline">
          <summary>{t('这一批参考了你的历史结果')}</summary>
          <pre className="md-lessons-pre">{lessons.trim()}</pre>
        </details>
      ) : null}

      {examples.length ? (
        <div className="md-create-pains">
          <span>{t('没方向就点一条：')}</span>
          {examples.slice(0, 4).map(example => (
            <button type="button" key={example} className="md-chip" onClick={() => patchCreate({ topics: [example], picked: { [example]: true }, groups: [], adopted: {} })}>{example}</button>
          ))}
        </div>
      ) : null}

      <section className="md-create-input">
        <div className="md-create-actions">
          <span className="md-muted">
            {topics.length ? t('已出 {n} 个选题，勾选后生成。', { n: topics.length }) : t('点右边先出 10 个选题。')}
          </span>
          {source ? <span className={`md-source ${source === 'local' ? 'is-local' : ''}`}>{source === 'local' ? t('本地模板 · 模型没通') : t('模型生成')}</span> : null}
          <span className="md-grow" />
          <button type="button" className="md-pill" onClick={() => { if (!startChat('content', { hint: selected[0] ?? '', profile: summary })) launchFailedToast(toast) }} disabled={!selected.length}>
            <Icon name="chat" size={14} />{t('去对话里写')}
          </button>
          <button type="button" className="md-pill is-primary" onClick={makeTopics} disabled={busy === 'topics' || !configured}>
            <Icon name="refresh" size={14} />{busy === 'topics' ? t('正在想…') : topics.length ? t('刷新选题') : t('生成 10 个选题')}
          </button>
        </div>
      </section>

      {topics.length ? (
        <section className="md-topic-box">
          <header>
            <b>{t('选题')}</b>
            <span className="md-muted">{t('勾 {n} 个', { n: selected.length })}</span>
            <span className="md-grow" />
            <button type="button" className="md-inline-link" onClick={() => patchCreate({ picked: Object.fromEntries(topics.map(topic => [topic, true])) })}>{t('全选')}</button>
            <button type="button" className="md-inline-link" onClick={() => patchCreate({ picked: {} })}>{t('清空')}</button>
            <button type="button" className="md-inline-link" onClick={() => { resetCreate(); toast(t('这一批清掉了')) }}>{t('清空这批')}</button>
          </header>
          <ul className="md-topic-list">
            {topics.map(topic => (
              <li key={topic}>
                <button type="button" className={`md-topic ${picked[topic] ? 'is-on' : ''}`} onClick={() => patchCreate(state => ({ picked: { ...state.picked, [topic]: !state.picked[topic] } }))}>
                  <span className="md-topic-dot" aria-hidden="true" />{topic}
                </button>
              </li>
            ))}
          </ul>
          <div className="md-create-actions">
            <span className="md-muted">{t('每个选题会出 3 个版本，写完再挑。')}</span>
            <span className="md-grow" />
            <button type="button" className="md-pill is-primary" onClick={makeScripts} disabled={!selected.length || busy === 'scripts'}>
              <Icon name="bolt" size={14} />{busy === 'scripts' ? t('正在写 {n} 组…', { n: selected.length }) : t('为选中的 {n} 个生成口播（每个 3 条）', { n: selected.length })}
            </button>
          </div>
        </section>
      ) : null}

      {groups.length ? (
        <section className="md-script-box">
          <header>
            <b>{t('口播')}</b>
            <span className="md-muted">{t('{n} 个选题 · 每个 3 条', { n: groups.length })}</span>
            <span className="md-grow" />
            <button type="button" className="md-pill is-small" onClick={makeScripts} disabled={busy === 'scripts'}>
              <Icon name="refresh" size={13} />{t('全部重写')}
            </button>
          </header>
          {groups.map(group => (
            <div className="md-script-group" key={group.key ?? group.topic}>
              <div className="md-script-group-head">
                <h3>{group.topic}</h3>
                <span className="md-grow" />
                <button type="button" className="md-inline-link" onClick={() => refreshGroup(group)} disabled={busy === `group-${group.topic}`}>
                  {busy === `group-${group.topic}` ? t('重写中…') : t('刷新这组')}
                </button>
              </div>
              <ul>
                {group.variants.map((variant) => {
                  const key = variantKey(group.topic, variant.title)
                  const isAdopted = Boolean(adopted[key])
                  return (
                  <li key={key} className={`md-script-item ${isAdopted ? 'is-adopted' : ''}`}>
                    <header className="md-variant-head">
                      <span className="md-variant-tag">{variant.variant ?? 'A'}</span>
                      <h4>{variant.title}</h4>
                    </header>
                    <div className="md-script-lines">{variant.script.split('\n').map((line, index) => <p key={index}>{line || '\u00a0'}</p>)}</div>
                    <div className="md-script-tags">{(variant.tags ?? []).map(tag => <span key={tag}>#{tag}</span>)}</div>
                    <div className="md-script-actions">
                      <button type="button" className={`md-pill is-small ${isAdopted ? 'is-primary' : ''}`} onClick={() => adopt(group, variant)} disabled={isAdopted || busy === key}>
                        {isAdopted ? t('已采用') : busy === key ? t('保存中…') : t('采用这条')}
                      </button>
                      <button type="button" className="md-inline-link" onClick={() => copy(variant)}>{t('复制')}</button>
                    </div>
                  </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}
