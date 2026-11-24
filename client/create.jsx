// 做内容：先在这里出 30 个选题草稿，勾选后一次性生成口播（标题 + 稿子 + 标签），全程不跳页。
import React from 'react'
import { fetchSuggestions, pickTopics, profileSummary, saveOutput, toast, updateContentRow, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { launchFailedToast, startChat } from './launch.js'
import { Icon } from './ui.jsx'

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
  const [scripts, setScripts] = React.useState([])
  const [examples, setExamples] = React.useState([])
  const [busy, setBusy] = React.useState('')
  const [saving, setSaving] = React.useState('')
  const [batch, setBatch] = React.useState('')
  const [lessons, setLessons] = React.useState('')
  const [adopted, setAdopted] = React.useState({})

  React.useEffect(() => {
    fetchSuggestions().then(result => setExamples(result.prompts)).catch(() => {})
  }, [])

  const selected = topics.filter(topic => picked[topic])

  const makeTopics = async () => {
    setBusy('topics')
    try {
      const data = await post('topics', { count: 30 })
      setTopics(data.topics ?? [])
      setBatch(data.batch ?? '')
      setLessons(data.lessons ?? '')
      setPicked({})
      setScripts([])
      setAdopted({})
    } catch (err) {
      toast(err.message, { error: true })
    }
    setBusy('')
  }

  const makeScripts = async () => {
    if (!selected.length) return toast(t('先勾几个选题'), { error: true })
    setBusy('scripts')
    try {
      // 先记勾选（学习信号），再生口播
      if (batch) await pickTopics(batch, selected).catch(() => {})
      const data = await post('scripts', { topics: selected, batch })
      setScripts(data.scripts ?? [])
      toast(t('已生成 {n} 条，并记进内容库', { n: (data.scripts ?? []).length }))
    } catch (err) {
      toast(err.message, { error: true })
    }
    setBusy('')
  }

  const copy = (value) => navigator.clipboard.writeText(value).then(() => toast(t('已复制')), () => toast(t('复制失败'), { error: true }))

  const save = async (row, index) => {
    setSaving(String(index))
    try {
      const result = await saveOutput({ kind: 'content', title: row.title, content: `【标题】${row.title}\n\n【口播文案】\n${row.script}\n\n【标签】${(row.tags ?? []).map(tag => `#${tag}`).join(' ')}` })
      toast(t('已存到 {dir}', { dir: result.dir }))
    } catch (err) {
      toast(err.message, { error: true })
    }
    setSaving('')
  }

  return (
    <div className="md-page md-create">
      <header className="md-page-head">
        <div>
          <h1>{t('做内容')}</h1>
          <p className="md-page-sub">{t('先出 30 个选题，勾中想要的，再一次生成口播。全部在这个页面里完成。')}</p>
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
            <button type="button" key={example} className="md-chip" onClick={() => setTopics([example])}>{example}</button>
          ))}
        </div>
      ) : null}

      <section className="md-create-input">
        <div className="md-create-actions">
          <span className="md-muted">
            {topics.length ? t('已出 {n} 个选题，勾选后点右边生成。', { n: topics.length }) : t('点右边先出 30 个选题草稿。')}
          </span>
          <span className="md-grow" />
          <button type="button" className="md-pill" onClick={() => { if (!startChat('content', { hint: selected[0] ?? '', profile: summary })) launchFailedToast(toast) }} disabled={!selected.length}>
            <Icon name="chat" size={14} />{t('去对话里写')}
          </button>
          <button type="button" className="md-pill is-primary" onClick={makeTopics} disabled={busy === 'topics' || !configured}>
            <Icon name="spark" size={14} />{busy === 'topics' ? t('正在想…') : topics.length ? t('换一批选题') : t('生成 30 个选题')}
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
            <span className="md-muted">{t('勾中的每一条都会单独生成一条口播。')}</span>
            <span className="md-grow" />
            <button type="button" className="md-pill is-primary" onClick={makeScripts} disabled={!selected.length || busy === 'scripts'}>
              <Icon name="bolt" size={14} />{busy === 'scripts' ? t('正在写 {n} 条…', { n: selected.length }) : t('为选中的 {n} 个生成口播', { n: selected.length })}
            </button>
          </div>
        </section>
      ) : null}

      {scripts.length ? (
        <section className="md-script-box">
          <header><b>{t('口播')}</b><span className="md-muted">{t('{n} 条', { n: scripts.length })}</span></header>
          <ul>
            {scripts.map((row, index) => (
              <li key={`${row.title}-${index}`} className="md-script-item">
                <h3>{row.title}</h3>
                <div className="md-script-lines">{row.script.split('\n').map((line, i) => <p key={i}>{line || '\u00a0'}</p>)}</div>
                <div className="md-script-tags">{(row.tags ?? []).map(tag => <span key={tag}>#{tag}</span>)}</div>
                <div className="md-script-actions">
                  <button
                    type="button"
                    className={`md-pill is-small ${adopted[row.title] ? 'is-primary' : ''}`}
                    onClick={async () => {
                      if (!row.dir) return
                      try {
                        await updateContentRow(row.dir, { '采用': '采用' })
                        setAdopted({ ...adopted, [row.title]: true })
                        toast(t('已标记为采用'))
                      } catch (err) { toast(err.message, { error: true }) }
                    }}
                  >{adopted[row.title] ? t('已采用') : t('采用这条')}</button>
                  <button type="button" className="md-inline-link" onClick={() => copy(`【标题】${row.title}\n\n【口播文案】\n${row.script}\n\n【标签】${(row.tags ?? []).map(tag => `#${tag}`).join(' ')}`)}>{t('复制')}</button>
                  <button type="button" className="md-inline-link" onClick={() => save(row, index)} disabled={saving === String(index)}>{saving === String(index) ? t('保存中…') : t('再存一份 Word')}</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
