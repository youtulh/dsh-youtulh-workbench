// 做内容：出 10 个选题 → 勾选 → 每个选题出 3 个口播版本 → 挑一条。两步都能刷新，全程不跳页。
import React from 'react'
import { fetchSuggestions, pickTopics, profileSummary, toast, useDesk } from './desk.js'
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

export function CreateView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const configured = Boolean(positioning.subject || positioning.grade)
  const summary = profileSummary({ positioning, painPoints: pains })

  const [topics, setTopics] = React.useState([])
  const [picked, setPicked] = React.useState({})
  const [groups, setGroups] = React.useState([])
  const [examples, setExamples] = React.useState([])
  const [lessons, setLessons] = React.useState('')
  const [batch, setBatch] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [adopted, setAdopted] = React.useState({})

  React.useEffect(() => {
    fetchSuggestions().then(result => setExamples(result.prompts)).catch(() => {})
  }, [])

  const selected = topics.filter(topic => picked[topic])

  const makeTopics = async () => {
    setBusy('topics')
    try {
      const data = await post('topics', { count: TOPIC_COUNT })
      setTopics(data.topics ?? [])
      setBatch(data.batch ?? '')
      setLessons(data.lessons ?? '')
      setPicked({})
      setGroups([])
      setAdopted({})
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const makeScripts = async () => {
    if (!selected.length) return toast(t('先勾几个选题'), { error: true })
    setBusy('scripts')
    try {
      if (batch) await pickTopics(batch, selected).catch(() => {})
      const data = await post('scripts', { topics: selected, batch })
      setGroups((data.groups ?? []).map((group, index) => ({ ...group, key: `${group.topic}-${index}` })))
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
        setGroups(prev => prev.map(item => (item.topic === group.topic ? { ...next, key: `${next.topic}-${Date.now()}` } : item)))
      }
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const adopt = async (group, variant, index) => {
    const key = `${group.topic}-${index}`
    setBusy(key)
    try {
      const data = await post('content/adopt', { topic: group.topic, title: variant.title, script: variant.script, tags: variant.tags ?? [], batch })
      setAdopted(prev => ({ ...prev, [key]: true }))
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
          <p className="md-page-sub">{t('先出 10 个选题，勾中的每个给 3 个版本，你挑一条。不喜欢哪一批，就按刷新。')}</p>
          {summary ? <p className="md-profile-line"><Icon name="user" size={13} />{t('按你的设定：{summary}', { summary })}</p> : null}
        </div>
      </header>

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
            <button type="button" key={example} className="md-chip" onClick={() => { setTopics([example]); setPicked({ [example]: true }) }}>{example}</button>
          ))}
        </div>
      ) : null}

      <section className="md-create-input">
        <div className="md-create-actions">
          <span className="md-muted">
            {topics.length ? t('已出 {n} 个选题，勾选后生成。', { n: topics.length }) : t('点右边先出 10 个选题。')}
          </span>
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
            <button type="button" className="md-inline-link" onClick={() => setPicked(Object.fromEntries(topics.map(topic => [topic, true])))}>{t('全选')}</button>
            <button type="button" className="md-inline-link" onClick={() => setPicked({})}>{t('清空')}</button>
          </header>
          <ul className="md-topic-list">
            {topics.map(topic => (
              <li key={topic}>
                <button type="button" className={`md-topic ${picked[topic] ? 'is-on' : ''}`} onClick={() => setPicked({ ...picked, [topic]: !picked[topic] })}>
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
                {group.variants.map((variant, index) => {
                  const key = `${group.topic}-${index}`
                  return (
                  <li key={key} className={`md-script-item ${adopted[key] ? 'is-adopted' : ''}`}>
                    <header className="md-variant-head">
                      <span className="md-variant-tag">{variant.variant ?? 'A'}</span>
                      <h4>{variant.title}</h4>
                    </header>
                    <div className="md-script-lines">{variant.script.split('\n').map((line, index) => <p key={index}>{line || '\u00a0'}</p>)}</div>
                    <div className="md-script-tags">{(variant.tags ?? []).map(tag => <span key={tag}>#{tag}</span>)}</div>
                    <div className="md-script-actions">
                      <button type="button" className={`md-pill is-small ${adopted[key] ? 'is-primary' : ''}`} onClick={() => adopt(group, variant, index)} disabled={adopted[key] || busy === key}>
                        {adopted[key] ? t('已采用') : busy === key ? t('保存中…') : t('采用这条')}
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
