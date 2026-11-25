// 做内容：出 10 个选题 → 勾选 → 每个选题出 3 个口播版本 → 挑一条。
// 中间结果放在全局 store（并写一份 sessionStorage）：切页、刷新都不会丢。
import React from 'react'
import { fetchSuggestions, fetchTopicsHistory, patchCreate, pickTopics, profileSummary, resetCreate, restoreCreateDraft, setDesk, toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { launchFailedToast, startChat } from './launch.js'
import { Icon } from './ui.jsx'

const TOPIC_COUNT = 10
const BRIEF_MAX = 120

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
// 中文口播大约每秒 4.2 个字，用来给个时长感觉
const charCount = value => String(value ?? '').replace(/\s/g, '').length
const secondsOf = value => Math.max(1, Math.round(charCount(value) / 4.2))

export function CreateView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const configured = Boolean(positioning.subject || positioning.grade)
  const summary = profileSummary({ positioning, painPoints: pains })
  const create = useDesk(s => s.create)
  const modelOk = useDesk(s => s.modelOk)
  const modelError = useDesk(s => s.modelError)
  const { topics, angles, picked, groups, adopted, dirs, batch, lessons, source, examples, brief, notes } = create
  const briefText = String(brief ?? '').trim()
  const [busy, setBusy] = React.useState('')
  const [editKey, setEditKey] = React.useState('')
  const [editText, setEditText] = React.useState('')

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
        topics: data.topics ?? [], angles: data.angles ?? {}, batch: data.batch ?? '', lessons: data.lessons ?? '',
        source: data.source ?? '', picked: {}, groups: [], adopted: {}, dirs: {},
      })
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  // 给了提示就直接出草稿：一条，3 版，不再先出选题
  const makeDrafts = async () => {
    if (!briefText) return makeTopics()
    setBusy('brief')
    try {
      const data = await post('scripts', { brief: briefText, batch })
      patchCreate({
        topics: [], angles: {}, picked: {}, adopted: {}, dirs: {},
        groups: (data.groups ?? []).map((group, index) => ({ ...group, key: `${group.topic}-${index}` })),
        source: data.source ?? '',
      })
      toast(t('按你的提示写了 3 版，挑一条'))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const openHistory = async () => {
    try {
      const data = await fetchTopicsHistory()
      const batches = (data.batches ?? []).filter(batch => (batch.topics ?? []).length)
      if (!batches.length) return toast(t('还没有往期选题'))
      setDesk({
        dialog: {
          title: t('往期选题'),
          submitLabel: t('下一步'),
          fields: [{
            name: 'batch', label: t('先选一批'), type: 'select', required: true,
            options: batches.map(batch => ({ value: batch.batch, label: `${batch.date || batch.batch} · ${batch.topics.length} 个选题` })),
          }],
          onSubmit: values => {
            const chosen = batches.find(batch => batch.batch === values.batch)
            if (!chosen) return
            setDesk({
              dialog: {
                title: t('往期选题'),
                submitLabel: t('填进提示'),
                fields: [{
                  name: 'topic', label: t('这批的选题'), type: 'select', required: true,
                  options: chosen.topics.map(item => ({ value: item.topic, label: `${item.picked ? '✓ ' : ''}${item.topic}` })),
                }],
                onSubmit: next => {
                  patchCreate({ brief: next.topic, topics: [], picked: {}, groups: [], adopted: {}, dirs: {} })
                  toast(t('已填进提示，点生成就行'))
                },
              },
            })
          },
        },
      })
    } catch (err) { toast(err.message, { error: true }) }
  }

  const generate = () => (briefText ? makeDrafts() : makeTopics())

  const makeScripts = async () => {
    if (!selected.length) return toast(t('先勾几个选题'), { error: true })
    setBusy('scripts')
    try {
      if (batch) await pickTopics(batch, selected).catch(() => {})
      const data = await post('scripts', { topics: selected, batch })
      patchCreate({
        groups: (data.groups ?? []).map((group, index) => ({ ...group, key: `${group.topic}-${index}` })),
        adopted: {}, dirs: {},
        source: data.source ?? '',
      })
      toast(t('每个选题出了 3 个版本，挑一条'))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const refreshGroup = async (group) => {
    setBusy(`group-${group.topic}`)
    try {
      // 按提示写出来的那组，刷新时还用同一句提示
      const body = group.source === 'brief' ? { brief: group.topic, batch } : { topics: [group.topic], batch }
      const data = await post('scripts', body)
      const next = data.groups?.[0]
      if (next) {
        patchCreate(state => ({
          groups: state.groups.map(item => (item.topic === group.topic ? { ...next, key: `${next.topic}-${Date.now()}` } : item)),
          // 这一组换了新稿子，之前那条「已采用」不再算数，旧目录映射也清掉
          adopted: Object.fromEntries(Object.entries(state.adopted).filter(([key]) => !key.startsWith(`${group.topic}|`))),
          dirs: Object.fromEntries(Object.entries(state.dirs ?? {}).filter(([key]) => !key.startsWith(`${group.topic}|`))),
          source: data.source ?? state.source,
        }))
      }
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  // 出过稿子以后，按老师写的一句要求改这组（还是 3 版）
  const improve = async (group) => {
    const note = String(notes?.[group.topic] ?? '').trim()
    if (!note) return toast(t('先写一句想怎么改'), { error: true })
    setBusy(`improve-${group.topic}`)
    try {
      const data = await post('scripts/improve', { topic: group.topic, note, variants: group.variants, batch })
      const variants = data.variants ?? []
      if (!variants.length) {
        toast(t('模型没通，这次没改；可以先点「改一下」手动改'), { error: true })
        return
      }
      patchCreate(state => ({
        groups: state.groups.map(item => (item.topic === group.topic ? { ...item, variants } : item)),
        // 稿子换了，这一组之前「已采用」的标记和旧目录映射都不再算数
        adopted: Object.fromEntries(Object.entries(state.adopted).filter(([key]) => !key.startsWith(`${group.topic}|`))),
        dirs: Object.fromEntries(Object.entries(state.dirs ?? {}).filter(([key]) => !key.startsWith(`${group.topic}|`))),
        notes: { ...state.notes, [group.topic]: '' },
        source: data.source ?? state.source,
      }))
      setEditKey('')
      toast(t('按你说的改好了，还是 3 版'))
    } catch (err) { toast(err.message, { error: true }) }
    finally { setBusy('') }
  }

  const adopt = async (group, variant) => {
    const key = variantKey(group.topic, variant.title)
    setBusy(key)
    try {
      const data = await post('content/adopt', { topic: group.topic, title: variant.title, script: variant.script, tags: variant.tags ?? [], comment: variant.comment ?? '', dm: variant.dm ?? '', batch })
      patchCreate(state => ({ adopted: { ...state.adopted, [key]: true }, dirs: { ...state.dirs, [key]: data.dir } }))
      toast(t('已保存到 {dir}，并记进内容库', { dir: data.dir }))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  const copyText = (text) => {
    navigator.clipboard.writeText(text).then(() => toast(t('已复制')), () => toast(t('复制失败'), { error: true }))
  }

  const copy = (variant) => {
    const lead = [variant.comment ? `\n\n【评论区第一条】\n${variant.comment}` : '', variant.dm ? `\n\n【私信第一句】\n${variant.dm}` : ''].join('')
    copyText(`【标题】${variant.title}\n\n【口播文案】\n${variant.script}\n\n【标签】${(variant.tags ?? []).map(tag => `#${tag}`).join(' ')}${lead}`)
  }

  const startEdit = (group, variant) => {
    setEditKey(variantKey(group.topic, variant.title))
    setEditText(variant.script)
  }

  const saveEdit = async (group, variant) => {
    const key = variantKey(group.topic, variant.title)
    const text = editText
    patchCreate(state => ({
      groups: state.groups.map(item => (item.topic !== group.topic ? item : {
        ...item,
        variants: item.variants.map(row => (variantKey(item.topic, row.title) === key ? { ...row, script: text } : row)),
      })),
    }))
    setEditKey('')
    // 已经采用过的这版：本地 Word / Markdown 也要跟着更新，不然文件夹里还是旧稿
    const dir = dirs?.[key]
    if (!dir) {
      toast(t('改好了；采用时保存的就是改过的这版'))
      return
    }
    setBusy(`save-${key}`)
    try {
      await post('content/revise', { dir, title: variant.title, topic: group.topic, script: text, tags: variant.tags ?? [], comment: variant.comment ?? '', dm: variant.dm ?? '' })
      toast(t('改好了，本地文件也更新了'))
    } catch (err) { toast(err.message, { error: true }) }
    setBusy('')
  }

  return (
    <div className="md-page md-create">
      <header className="md-page-head">
        <div>
          <h1>{t('做内容')}</h1>
          <p className="md-page-sub">{t('想好了就写一句，直接出 3 版草稿；没想好就先出 10 个选题，勾中的每个给 3 个版本。切到别的页面也不会丢。')}</p>
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
            <button type="button" key={example} className="md-chip" onClick={() => patchCreate({ topics: [example], angles: {}, picked: { [example]: true }, groups: [], adopted: {}, dirs: {}, brief: '' })}>{example}</button>
          ))}
        </div>
      ) : null}

      <section className="md-create-input">
        <label className="md-create-brief">
          <span>{t('想讲什么？（可留空）')}</span>
          <textarea
            rows={2}
            maxLength={BRIEF_MAX}
            value={brief}
            onChange={event => patchCreate({ brief: event.target.value })}
            placeholder={t('比如：讲期中卷上最爱丢分的那道题；或者家长总问「来得及吗」，我想正面回一次。')}
          />
        </label>
        <div className="md-create-brief-foot">
          <span className="md-muted">{t('写一句就直接出草稿；留空就先出 10 个选题，勾完再写。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-inline-link" onClick={openHistory}>{t('往期选题')}</button>
          {briefText ? <button type="button" className="md-inline-link" onClick={() => patchCreate({ brief: '' })}>{t('清空提示')}</button> : null}
          <span className="md-muted">{brief.length}/{BRIEF_MAX}</span>
        </div>
        <div className="md-create-actions">
          <span className="md-muted">
            {briefText
              ? t('按上面这句写，不用先挑选题。')
              : topics.length ? t('已出 {n} 个选题，勾选后生成。', { n: topics.length }) : t('点右边先出 10 个选题。')}
          </span>
          {source ? <span className={`md-source ${source === 'local' ? 'is-local' : ''}`}>{source === 'local' ? t('本地模板 · 模型没通') : t('模型生成')}</span> : null}
          <span className="md-grow" />
          {briefText ? (
            <button type="button" className="md-inline-link" onClick={makeTopics} disabled={busy === 'topics' || !configured}>{t('先看 10 个选题')}</button>
          ) : null}
          <button type="button" className="md-pill" onClick={() => { if (!startChat('content', { hint: briefText || selected[0] || '', profile: summary, target: positioning.target })) launchFailedToast(toast) }} disabled={!selected.length && !briefText}>
            <Icon name="chat" size={14} />{t('去对话里写')}
          </button>
          <button type="button" className="md-pill is-primary" onClick={generate} disabled={busy === 'topics' || busy === 'brief' || !configured}>
            <Icon name={briefText ? 'bolt' : 'refresh'} size={14} />{busy === 'brief' ? t('正在写…') : busy === 'topics' ? t('正在想…') : briefText ? t('按提示生成草稿') : topics.length ? t('刷新选题') : t('生成 10 个选题')}
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
                  <span className="md-topic-dot" aria-hidden="true" /><span className="md-topic-text">{topic}</span>
                  {angles?.[topic] ? <em className="md-topic-angle">{angles[topic]}</em> : null}
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
            <span className="md-muted">{groups.some(group => group.source === 'brief') ? t('按你的提示 · 3 条') : t('{n} 个选题 · 每个 3 条', { n: groups.length })}</span>
            <span className="md-grow" />
            <button type="button" className="md-pill is-small" onClick={() => (groups.every(group => group.source === 'brief') ? makeDrafts() : makeScripts())} disabled={busy === 'scripts' || busy === 'brief'}>
              <Icon name="refresh" size={13} />{t('全部重写')}
            </button>
          </header>
          {groups.map(group => (
            <div className="md-script-group" key={group.key ?? group.topic}>
              <div className="md-script-group-head">
                <h3>{group.source === 'brief' ? t('按你的提示写的') : group.topic}</h3>
                {group.source === 'brief' ? <span className="md-brief-echo" title={group.topic}>{group.topic}</span> : null}
                <span className="md-grow" />
                <button type="button" className="md-inline-link" onClick={() => refreshGroup(group)} disabled={busy === `group-${group.topic}` || busy === `improve-${group.topic}`}>
                  {busy === `group-${group.topic}` ? t('重写中…') : t('刷新这组')}
                </button>
              </div>
              <div className="md-script-note">
                <input
                  value={notes?.[group.topic] ?? ''}
                  maxLength={200}
                  onChange={event => patchCreate(state => ({ notes: { ...state.notes, [group.topic]: event.target.value } }))}
                  onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent?.isComposing) { event.preventDefault(); improve(group) } }}
                  placeholder={t('想怎么改？比如：开头别报分数，压到 40 秒')}
                />
                <button
                  type="button"
                  className="md-pill is-small"
                  onClick={() => improve(group)}
                  disabled={!String(notes?.[group.topic] ?? '').trim() || busy === `improve-${group.topic}` || busy === `group-${group.topic}`}
                >
                  <Icon name="spark" size={13} />{busy === `improve-${group.topic}` ? t('正在改…') : t('按提示改')}
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
                    <p className="md-script-meta">{t('约 {s} 秒 · {n} 字', { s: secondsOf(variant.script), n: charCount(variant.script) })}</p>
                    {editKey === key ? (
                      <div className="md-script-edit">
                        <textarea rows={10} value={editText} onChange={event => setEditText(event.target.value)} />
                        <div className="md-script-edit-foot">
                          <span className="md-muted">{dirs?.[key] ? t('这版已经采用，保存会同步更新本地文件。') : t('一句话一行；采用时会保存这一版。')}</span>
                          <span className="md-grow" />
                          <button type="button" className="md-inline-link" onClick={() => setEditKey('')}>{t('取消')}</button>
                          <button type="button" className="md-pill is-small" onClick={() => saveEdit(group, variant)} disabled={busy === `save-${key}`}>
                            {busy === `save-${key}` ? t('保存中…') : t('保存改动')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="md-script-lines">{variant.script.split('\n').map((line, index) => <p key={index}>{line || '\u00a0'}</p>)}</div>
                    )}
                    <div className="md-script-tags">{(variant.tags ?? []).map(tag => <span key={tag}>#{tag}</span>)}</div>
                    {variant.comment ? (
                      <div className="md-lead-pack">
                        <span className="md-lead-pack-label">{t('评论区置顶')}</span>
                        <p>{variant.comment}</p>
                        <button type="button" className="md-inline-link" onClick={() => copyText(variant.comment)}>{t('复制')}</button>
                      </div>
                    ) : null}
                    {variant.dm ? (
                      <div className="md-lead-pack">
                        <span className="md-lead-pack-label">{t('私信第一句')}</span>
                        <p>{variant.dm}</p>
                        <button type="button" className="md-inline-link" onClick={() => copyText(variant.dm)}>{t('复制')}</button>
                      </div>
                    ) : null}
                    <div className="md-script-actions">
                      <button type="button" className={`md-pill is-small ${isAdopted ? 'is-primary' : ''}`} onClick={() => adopt(group, variant)} disabled={isAdopted || busy === key || editKey === key}>
                        {isAdopted ? t('已采用') : busy === key ? t('保存中…') : t('采用这条')}
                      </button>
                      {editKey === key ? null : <button type="button" className="md-inline-link" onClick={() => startEdit(group, variant)}>{t('改一下')}</button>}
                      <button type="button" className="md-inline-link" onClick={() => copy(variant)}>{t('复制全文')}</button>
                      <button type="button" className="md-inline-link" onClick={() => copyText(variant.title)}>{t('复制标题')}</button>
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
