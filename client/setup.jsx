// 我的设定：先定「我为谁、从哪切、她最怕什么」，再给体检和第一批可以拍的视频。
import React from 'react'
import { backupWorkspace, dispatchOps, fetchBackups, fetchChatRecords, fetchContent, fetchLeads, fetchPlatformWords, fetchVoice, fetchWorkspace, fetchWorkspaceStats, revealDir, upgradeWorkspace, savePlatformWords, saveVoice, startFromTopic, setDesk, toast, useDesk } from './desk.js'
import { t, useLang } from './i18n.js'
import { Icon } from './ui.jsx'
import { diagnosePositioning, entrySuggestions, positioningSentence, suggestTargets } from '../src/targets.js'
import { reviewPositioning } from '../src/review.js'

const WHO = [
  ['subject', '教什么科目', '比如：高中化学'],
  ['grade', '带哪个年级', '比如：高一'],
  ['city', '在哪个城市', '比如：北京；只做线上就写线上'],
]

const SECTIONS = [
  ['setup-teach', '我教什么'],
  ['setup-target', '先抓哪类家长'],
  ['setup-pains', '家长最愁什么'],
  ['setup-voice', '说话方式'],
  ['setup-samples', '原话样本'],
  ['setup-words', '平台词表'],
  ['setup-cases', '案例库'],
  ['setup-backup', '数据备份'],
  ['setup-advice', '定位体检'],
  ['setup-review', '定位复盘'],
]

const BOUNDARY = [
  ['proof', '凭什么信你（一条能验证的）', '带过 3 届高三、本地重点校在职、只做这一科 8 年'],
  ['only', '只做', '北京、高一、化学、开学后掉队'],
  ['notDo', '不做', '高二高三、外地、竞赛、只求押题'],
  ['redline', '红线', '不承诺提分、不说包过、不报价格'],
]

export function SetupView() {
  useLang()
  const positioning = useDesk(s => s.state?.positioning) ?? {}
  const setupSection = useDesk(s => s.setupSection)
  const pains = useDesk(s => s.state?.painPoints) ?? []
  const [draft, setDraft] = React.useState('')
  const [savedAt, setSavedAt] = React.useState('')
  const [voiceText, setVoiceText] = React.useState('')
  const [voiceBusy, setVoiceBusy] = React.useState(false)
  const [allowText, setAllowText] = React.useState('')
  const [banText, setBanText] = React.useState('')
  const [wordsBusy, setWordsBusy] = React.useState(false)
  const [activeSection, setActiveSection] = React.useState(SECTIONS[0][0])
  const [caseInfo, setCaseInfo] = React.useState(null)
  const [backup, setBackup] = React.useState(null)
  const [backupBusy, setBackupBusy] = React.useState(false)
  const [backups, setBackups] = React.useState([])
  const [root, setRoot] = React.useState('')
  const [stats, setStats] = React.useState(null)
  const [reviewData, setReviewData] = React.useState({ content: [], leads: [] })
  const [reviewBusy, setReviewBusy] = React.useState(false)
  const UPGRADE_KEY = 'youtulh:upgrade-result'
  const [upgradeResult, setUpgradeResultState] = React.useState(() => {
    try { return JSON.parse(sessionStorage.getItem(UPGRADE_KEY) || 'null') } catch { return null }
  })
  const setUpgradeResult = (value) => {
    setUpgradeResultState(value)
    try {
      if (value) sessionStorage.setItem(UPGRADE_KEY, JSON.stringify(value))
      else sessionStorage.removeItem(UPGRADE_KEY)
    } catch { /* 隐私模式就算了 */ }
  }

  const loadReview = React.useCallback(() => {
    setReviewBusy(true)
    return Promise.all([fetchContent(), fetchLeads()])
      .then(([content, leads]) => setReviewData({ content: content.rows ?? content.content ?? [], leads: leads.leads ?? [] }))
      .catch(() => {})
      .finally(() => setReviewBusy(false))
  }, [])


  React.useEffect(() => {
    if (!setupSection) return
    const el = document.getElementById(setupSection)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setDesk({ setupSection: '' })
  }, [setupSection])

  React.useEffect(() => {
    fetchVoice().then(data => setVoiceText((data.samples ?? []).join('\n'))).catch(() => {})
    fetchBackups().then(data => setBackups(data.backups ?? [])).catch(() => {})
    fetchWorkspace().then(data => setRoot(data.root ?? '')).catch(() => {})
    fetchWorkspaceStats().then(setStats).catch(() => {})
    loadReview()
    fetchChatRecords().then(data => {
      const cases = data.cases ?? []
      const latest = cases[cases.length - 1]
      setCaseInfo({ count: cases.length, latest })
    }).catch(() => {})
    fetchPlatformWords().then(data => {
      setAllowText((data.allow ?? []).join('\n'))
      setBanText((data.ban ?? []).join('\n'))
    }).catch(() => {})
  }, [])

  // 目录跟着滚动高亮当前那一节
  React.useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean)
    if (!els.length || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver((entries) => {
      const top = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (top) setActiveSection(top.target.id)
    }, { rootMargin: '-90px 0px -60% 0px', threshold: [0, 0.2, 0.5] })
    els.forEach(el => observer.observe(el))
    // 滚到最底部时，最后一节（定位体检）可能进不了观察区，单独兜一下
    const scroller = document.querySelector('.md-page')
    const onScroll = () => {
      if (!scroller) return
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 24) setActiveSection(SECTIONS[SECTIONS.length - 1][0])
    }
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    return () => { observer.disconnect(); scroller?.removeEventListener('scroll', onScroll) }
  }, [])

  const saveWords = async () => {
    const split = value => value.split(/\n+/).map(row => row.trim()).filter(Boolean).slice(0, 16)
    setWordsBusy(true)
    try {
      const data = await savePlatformWords({ allow: split(allowText), ban: split(banText) })
      setAllowText((data.allow ?? []).join('\n'))
      setBanText((data.ban ?? []).join('\n'))
      markSaved()
      toast(t('平台词表存好了，下一句会按这个来'))
    } catch (err) { toast(err.message, { error: true }) }
    setWordsBusy(false)
  }

  const saveVoiceSamples = async () => {
    const samples = voiceText.split(/\n+/).map(row => row.trim()).filter(Boolean).slice(0, 8)
    setVoiceBusy(true)
    try {
      const data = await saveVoice(samples)
      setVoiceText((data.samples ?? []).join('\n'))
      markSaved()
      toast(t('原话样本存好了，下次生成会照这个口气'))
    } catch (err) { toast(err.message, { error: true }) }
    setVoiceBusy(false)
  }

  const markSaved = () => setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
  const save = async (key, value) => {
    const next = String(value ?? '').trim()
    if (next === (positioning[key] ?? '')) return
    const data = await dispatchOps([{ op: 'update_positioning', [key]: next }], { label: t('保存设定'), silent: true })
    if (data) markSaved()
  }

  const reviewAngle = row => (positioning.city && row.includes(positioning.city) ? '本地' : /家长|孩子/.test(row) ? '家庭' : /考|期中|期末|分/.test(row) ? '考情' : '知识点')
  const personaSentence = positioningSentence(positioning)
  const proofIdeas = ['带过 3 届毕业班', '本地重点校在职', '只做这一科 8 年', '自己孩子刚考完']
  const personaText = [
    `我是谁：${[positioning.city, positioning.grade, positioning.subject].filter(Boolean).join('') || '（还没填）'}老师`,
    `我帮谁：${positioning.target || '（还没填）'}`,
    `她最怕：${positioning.fear || '（还没填）'}`,
    `凭什么信我：${positioning.proof || '（还没填）'}`,
    `只做：${positioning.only || '（还没填）'}`,
    `不做：${positioning.notDo || '（还没填）'}`,
  ].join('\n')
  const copyPersona = async () => {
    try {
      await navigator.clipboard.writeText(personaText)
      toast(t('人设卡复制好了'))
    } catch { toast(t('复制失败，手动选中吧'), { error: true }) }
  }
  const makeIntro = () => {
    const who = [positioning.grade, positioning.subject].filter(Boolean).join('') || '这门课'
    startFromTopic(`我是${who}老师，为什么我只带「${advice.targetShort || positioning.target || '这一类'}」`)
    toast(t('已放进选题，去生成口播'))
  }

  const addPain = (event) => {
    event.preventDefault()
    const value = draft.trim()
    if (!value) return
    if (pains.includes(value)) {
      toast(t('这条已经在了'))
      return
    }
    dispatchOps([{ op: 'set_pain_points', points: [...pains, value] }], { label: t('加一条痛点') }).then(data => { if (data) markSaved() })
    setDraft('')
  }
  const removePain = point => dispatchOps([{ op: 'set_pain_points', points: pains.filter(row => row !== point) }], { label: t('删掉一条痛点') }).then(data => { if (data) markSaved() })

  const review = reviewPositioning({ positioning, painPoints: pains, content: reviewData.content, leads: reviewData.leads })
  const reviewJump = review.topWonContent ?? review.topLeadContent
  const advice = diagnosePositioning({ ...positioning, pains })
  const cards = suggestTargets({ ...positioning, pains })
  const entries = entrySuggestions({ ...positioning, pains })

  const applyCard = (card) => {
    dispatchOps([
      { op: 'update_positioning', target: card.value, entry: card.entry, fear: card.fear },
    ], { label: t('先抓这一类'), silent: true }).then(data => {
      if (!data) return
      markSaved()
      toast(t('定位填好了：{title}', { title: card.title }))
    })
  }

  return (
    <div className="md-page md-setup">
      <header className="md-page-head">
        <div>
          <h1>{t('我的设定')}</h1>
          <p className="md-page-sub">{t('先定一类家长，再谈内容。回私信、做内容、看数据都按这个来，以后随时能改。')}</p>
        </div>
        <span className="md-setup-saved">{savedAt ? t('已保存 {time}', { time: savedAt }) : t('改完自动保存')}</span>
      </header>

      <p className={`md-setup-status ${advice.ready ? 'is-ok' : ''}`}>
        {advice.ready ? t('定位完整：人群、切入点、顾虑都写了') : t('还差 {n} 项：{list}', { n: advice.gaps.length, list: advice.gaps.slice(0, 3).map(row => t(row.label)).join('、') })}
      </p>

      <div className="md-setup-jump">
        <label>
          <span>{t('跳到')}</span>
          <select value={activeSection} onChange={event => {
            const id = event.target.value
            setActiveSection(id)
            document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}>
            {SECTIONS.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
          </select>
        </label>
      </div>

      <section className="md-setup-card" id="setup-teach">
        <h2><span>1</span>{t('我教什么')}</h2>
        <div className="md-setup-grid">
          {WHO.map(([key, label, hint]) => (
            <label key={key} className="md-field">
              <span>{t(label)}</span>
              <input defaultValue={positioning[key] ?? ''} placeholder={t(hint)} onBlur={event => save(key, event.target.value)} />
            </label>
          ))}
        </div>
      </section>

      <section className="md-setup-card" id="setup-target">
        <h2><span>2</span>{t('先抓哪类家长')}</h2>
        <p className="md-setup-hint">{t('一个账号只对一类家长说话，越窄越容易赚到钱。不知道选谁，就从下面点一个。')}</p>
        {positioningSentence(positioning) ? <p className="md-setup-sentence">{positioningSentence(positioning)}</p> : null}
        <div className="md-setup-cards">
          {cards.map(card => {
            const on = String(positioning.target ?? '') === card.value
            return (
              <button type="button" key={card.key} className={`md-setup-card-choice ${on ? 'is-on' : ''}`} onClick={() => applyCard(card)}>
                <b>{card.title}</b>
                <small>{card.why}</small>
                <small className="md-setup-fear">{t('她最怕：{fear}', { fear: card.fear })}</small>
              </button>
            )
          })}
        </div>
        <div className="md-setup-grid">
          <label className="md-field">
            <span>{t('我为谁（一句话）')}</span>
            <input key={positioning.target ?? ''} defaultValue={positioning.target ?? ''} placeholder={t('比如：北京高二物理，期中掉到及格线、家长急但没方向')} onBlur={event => save('target', event.target.value)} />
          </label>
          <label className="md-field">
            <span>{t('我从哪切进去')}</span>
            <input key={positioning.entry ?? ''} defaultValue={positioning.entry ?? ''} placeholder={t('比如：期中卷丢分最多的那一块')} onBlur={event => save('entry', event.target.value)} />
          </label>
          <label className="md-field">
            <span>{t('她最怕什么')}</span>
            <input key={positioning.fear ?? ''} defaultValue={positioning.fear ?? ''} placeholder={t('比如：怕补了一学期还是原地踏步')} onBlur={event => save('fear', event.target.value)} />
          </label>
        </div>
        <div className="md-setup-chips">
          {entries.map(row => (
            <button type="button" key={row} className="md-chip" onClick={() => save('entry', row)}>{row}</button>
          ))}
        </div>
      </section>

      <section className="md-setup-card" id="setup-pains">
        <h2><span>3</span>{t('家长最愁什么')}</h2>
        <p className="md-setup-hint">{t('写家长的原话，别写教学术语。视频的题目和开头就从这儿来。')}</p>
        <div className="md-setup-pains">
          {pains.length ? pains.map(point => (
            <span key={point} className="md-chip is-removable">
              {point}
              <button type="button" aria-label={t('删掉「{point}」', { point })} onClick={() => removePain(point)}>×</button>
            </span>
          )) : <span className="md-muted">{t('还没有，先加一条最常听到的抱怨。')}</span>}
        </div>
        <form className="md-setup-add" onSubmit={addPain}>
          <input value={draft} onChange={event => setDraft(event.target.value)} placeholder={t('比如：期中 58 分，还能补上来吗')} />
          <button type="submit" className="md-pill is-small" disabled={!draft.trim()}><Icon name="plus" size={13} />{t('加一条')}</button>
        </form>
      </section>

      <section className="md-setup-card" id="setup-voice">
        <h2><span>4</span>{t('我平时怎么说话')}</h2>
        <p className="md-setup-hint">{t('一句话就行。写出来的稿子和回私信都照这个口气。')}</p>
        <label className="md-field">
          <textarea rows={3} defaultValue={positioning.voice ?? ''} placeholder={t('比如：先接住家长的焦虑，再用一个具体数字说清楚，不喊口号')} onBlur={event => save('voice', event.target.value)} />
        </label>
      </section>

      <section className="md-setup-card" id="setup-samples">
        <h2><span>5</span>{t('我的原话样本')}</h2>
        <p className="md-setup-hint">{t('一行一句，写你平时怎么跟家长说话，3 到 5 句就够。口播、按提示改、回私信都照这个口气；不填也不会套用别人的科目和例子。')}</p>
        <label className="md-field">
          <textarea
            rows={6}
            value={voiceText}
            onChange={event => setVoiceText(event.target.value)}
            placeholder={t('比如：孩子这块不是笨，是前面那一章没接上。')}
          />
        </label>
        <div className="md-setup-samples-foot">
          <span className="md-muted">{t('存进本机，下次生成会用上。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-small" onClick={saveVoiceSamples} disabled={voiceBusy}>
            {voiceBusy ? t('保存中…') : t('保存原话')}
          </button>
        </div>
      </section>

      <section className="md-setup-card" id="setup-words">
        <h2><span>6</span>{t('平台话术词表')}</h2>
        <p className="md-setup-hint">{t('只影响平台私信阶段：小红书 / 抖音 / B站里哪些说法可以用、哪些不要出现。一行一个，存进 平台词表.md。')}</p>
        <div className="md-setup-words">
          <label className="md-field">
            <span>{t('可以出现')}</span>
            <textarea rows={5} value={allowText} onChange={event => setAllowText(event.target.value)} placeholder={'vx\n威信\n私信\n主页'} />
          </label>
          <label className="md-field">
            <span>{t('不要出现')}</span>
            <textarea rows={5} value={banText} onChange={event => setBanText(event.target.value)} placeholder={'加微信\n微信号\n手机号\n价格'} />
          </label>
        </div>
        <div className="md-setup-samples-foot">
          <span className="md-muted">{t('改这个文件也一样生效；微信阶段不受这张表限制。')}</span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-small" onClick={saveWords} disabled={wordsBusy}>
            {wordsBusy ? t('保存中…') : t('保存词表')}
          </button>
        </div>
      </section>

      <section className="md-setup-card" id="setup-cases">
        <h2><span>7</span>{t('案例库')}</h2>
        <p className="md-setup-hint">{t('你导入的人工聊天案例。聊成的案例会进「下一句建议」的参考；在这里能看到有多少条、去聊天台管理。')}</p>
        <div className="md-setup-samples-foot">
          <span className="md-muted">
            {caseInfo === null ? t('读取中…') : t('现在有 {n} 条案例', { n: caseInfo.count })}
            {caseInfo?.latest ? t(' · 最近：{scene}（{result}）', { scene: caseInfo.latest.scene || t('没写场景'), result: caseInfo.latest.result || t('未定') }) : ''}
          </span>
          <span className="md-grow" />
          <button type="button" className="md-pill is-small" onClick={() => setDesk({ view: 'dm', focusId: null, dmCases: true })}>{t('去管理案例')}</button>
        </div>
      </section>

      <section className="md-setup-card" id="setup-backup">
        <h2><span>8</span>{t('数据备份')}</h2>
        <p className="md-setup-hint">{t('你的数据（设定、线索、学生、课次、反馈、内容）都在电脑上。点一下会复制一份到旁边的「备份」文件夹，不会改动原来的数据；只保留最近 10 份，旧的自动清掉。')}</p>
        {root ? (
          <div className="md-setup-path">
            <code>{root}</code>
            <button type="button" className="md-inline-link" onClick={() => revealDir(root).catch(err => toast(err.message, { error: true }))}>{t('打开数据文件夹')}</button>
            <button type="button" className="md-inline-link" onClick={() => {
              if (navigator.clipboard?.writeText) navigator.clipboard.writeText(root).then(() => toast(t('复制了路径'))).catch(() => toast(t('复制失败'), { error: true }))
              else toast(t('这个环境不能直接复制，去表格里复制吧'), { error: true })
            }}>{t('复制路径')}</button>
          </div>
        ) : null}
        {stats ? (
          <p className="md-muted">
            {t('线索 {leads} · 学生 {students} · 班 {classes} · 课次 {lessons} · 反馈 {feedback} · 备份 {backups}', stats)}
          </p>
        ) : null}
        {upgradeResult ? (
          <div className="md-upgrade-result">
            <button type="button" className="md-inline-link" onClick={() => setUpgradeResult(null)}>{t('关闭')}</button>
            <p className="md-muted">{t('升级后：线索 {leads} · 学生 {students} · 班 {classes} · 课次 {lessons}', upgradeResult.after)}</p>
            {upgradeResult.backupDir ? (
              <div className="md-setup-path">
                <code>{t('升级前的备份：{dir}', { dir: upgradeResult.backupDir })}</code>
                <button type="button" className="md-inline-link" onClick={() => revealDir(upgradeResult.backupDir).catch(err => toast(err.message, { error: true }))}>{t('打开')}</button>
                <button type="button" className="md-inline-link" onClick={() => {
                  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(upgradeResult.backupDir).then(() => toast(t('复制了路径'))).catch(() => toast(t('复制失败'), { error: true }))
                  else toast(t('这个环境不能直接复制，去表格里复制吧'), { error: true })
                }}>{t('复制路径')}</button>
              </div>
            ) : null}
          </div>
        ) : null}
        {stats?.legacy?.length ? (
          <div className="md-legacy-row">
            <span className="md-legacy-note">{t('旧版表头：{tables}。读取已经兼容，下次保存会自动升级成新列。', { tables: stats.legacy.join('、') })}</span>
            <button type="button" className="md-inline-link" onClick={() => {
              if (!window.confirm(t('现在把这几张表升级成新列？会按当前字段重写；你自己在表格里加的额外列不会保留。'))) return
              upgradeWorkspace()
                .then(data => {
                  fetchWorkspaceStats().then(setStats).catch(() => {})
    fetchContent().then(data => setReviewData(prev => ({ ...prev, content: data.rows ?? data.content ?? [] }))).catch(() => {})
    fetchLeads().then(data => setReviewData(prev => ({ ...prev, leads: data.leads ?? [] }))).catch(() => {})
                  fetchBackups().then(next => setBackups(next.backups ?? [])).catch(() => {})
                  if (!data.sameCounts) {
                    toast(t('升级后条数对不上，已自动还原到升级前的备份；请刷新后检查'), { error: true })
                    return
                  }
                  if (data.restored) {
                    toast(t('升级过程有异常，已自动还原；数据还是升级前的样子'), { error: true })
                    return
                  }
                  const base = data.upgraded?.length ? t('升级好了：{tables}', { tables: data.upgraded.join('、') }) : t('没有需要升级的表')
                  setUpgradeResult({ backupDir: data.backupDir || '', before: data.before, after: data.after })
                  toast(data.backupDir ? t('{base} · 已自动备份一份', { base }) : base)
                })
                .catch(err => toast(err.message, { error: true }))
            }}>{t('现在升级')}</button>
          </div>
        ) : null}
        <div className="md-setup-samples-foot">
          <span className={`md-muted ${backups[0] && Date.now() - backups[0].mtime > 7 * 86400000 ? 'md-legacy-note' : ''}`}>
            {backup
              ? t('备份好了：{dir}', { dir: backup })
              : backups[0]
                ? t('上次备份：{days} 天前', { days: Math.max(0, Math.floor((Date.now() - backups[0].mtime) / 86400000)) })
                : t('还没备份过，建议现在备份一次')}
          </span>
          <span className="md-grow" />
          {backup ? <button type="button" className="md-inline-link" onClick={() => revealDir(backup).catch(err => toast(err.message, { error: true }))}>{t('打开备份文件夹')}</button> : null}
          {backup ? <button type="button" className="md-inline-link" onClick={() => {
            if (navigator.clipboard?.writeText) navigator.clipboard.writeText(backup).then(() => toast(t('复制了路径'))).catch(() => toast(t('复制失败'), { error: true }))
            else toast(t('这个环境不能直接复制，去表格里复制吧'), { error: true })
          }}>{t('复制路径')}</button> : null}
          <button type="button" className="md-pill is-small is-primary" disabled={backupBusy} onClick={() => {
            setBackupBusy(true)
            backupWorkspace()
              .then(data => { setBackup(data.dir); fetchBackups().then(next => setBackups(next.backups ?? [])).catch(() => {}); toast(t('备份好了')) })
              .catch(err => toast(err.message, { error: true }))
              .finally(() => setBackupBusy(false))
          }}>{backupBusy ? t('备份中…') : t('备份数据')}</button>
        </div>
        {backups.length ? (
          <details className="md-setup-backups">
            <summary>{t('已有的备份（{n}）', { n: backups.length })}</summary>
            <ul>
              {backups.slice(0, 10).map(item => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <span className="md-muted">{item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : ''}</span>
                  <span className="md-grow" />
                  <button type="button" className="md-inline-link" onClick={() => revealDir(item.dir).catch(err => toast(err.message, { error: true }))}>{t('打开')}</button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="md-setup-card md-advice" id="setup-advice">
        <h2>{t('定位体检')}</h2>
        <p className="md-advice-headline">{advice.headline}</p>

        <div className="md-persona-card">
          <div className="md-persona-head">
            <b>{t('人设卡')}</b>
            <span className="md-muted">{t('不用懂定位理论，把这几句话填真就行')}</span>
          </div>
          <p className="md-persona-sentence">{personaSentence || t('先把科目、年级、目标家长填上，这句话就出来了。')}</p>
          <dl>
            <div><dt>{t('我帮谁')}</dt><dd>{positioning.target || t('还没填')}</dd></div>
            <div><dt>{t('她最怕')}</dt><dd>{positioning.fear || t('还没填')}</dd></div>
            <div><dt>{t('凭什么信我')}</dt><dd>{positioning.proof || t('还没填')}</dd></div>
            <div><dt>{t('只做')}</dt><dd>{positioning.only || t('还没填')}</dd></div>
            <div><dt>{t('不做')}</dt><dd>{positioning.notDo || t('还没填')}</dd></div>
          </dl>
          {!positioning.proof ? (
            <div className="md-persona-proof">
              <span className="md-muted">{t('哪条是真的，点一下就填上：')}</span>
              {proofIdeas.map(row => (
                <button type="button" key={row} className="md-chip" onClick={() => save('proof', row)}>{row}</button>
              ))}
            </div>
          ) : null}
          <div className="md-persona-actions">
            <button type="button" className="md-inline-link" onClick={copyPersona}>{t('复制人设卡')}</button>
            <button type="button" className="md-pill is-small is-primary" onClick={makeIntro}>{t('拍一条自我介绍')}</button>
          </div>
        </div>

        <div className="md-review" id="setup-review">
          <div className="md-review-head">
            <b>{t('定位复盘')}</b>
            <span className="md-muted">{t('用最近的内容和线索，看看有没有跑偏')}</span>
            <span className="md-grow" />
            <button type="button" className="md-inline-link" onClick={loadReview} disabled={reviewBusy}>{reviewBusy ? t('刷新中…') : t('刷新复盘')}</button>
          </div>
          <div className="md-review-stats">
            <button type="button" className="md-review-stat" onClick={() => setDesk({ view: 'data', focusId: null })}><b>{review.contentTotal ? `${review.contentMatched}/${review.contentTotal}` : '—'}</b><span>{t('内容贴定位')}</span></button>
            <button type="button" className="md-review-stat" onClick={() => setDesk({ view: 'dm', focusId: null })}><b>{review.gradedLeads ? `${review.gradeMatched}/${review.gradedLeads}` : '—'}</b><span>{t('线索年级对得上')}</span></button>
            <button type="button" className="md-review-stat" onClick={() => setDesk({ view: 'dm', focusId: null })}><b>{review.wonCount}</b><span>{t('加微/报课')}</span></button>
          </div>
          <ul className="md-review-notes">
            {review.notes.map(row => <li key={row.key}>{t(row.key, row.params)}</li>)}
          </ul>
          {review.angled ? (
            <div className="md-review-mix">
              <span>{t('内容配比')}：</span>
              {['知识点', '家庭', '考情', '本地'].map(name => (
                <button type="button" key={name} className="md-inline-link" onClick={() => setDesk({ view: 'data', focusId: null, dataAngle: name })}>{t(name)} {review.angleCounts[name]}</button>
              ))}
            </div>
          ) : null}
          <p className="md-review-note">{t('按最近 30 条内容和全部线索算，只做参考')}</p>
          {review.unattributed ? (
            <button type="button" className="md-inline-link md-review-jump" onClick={() => setDesk({ view: 'dm', focusId: null })}>
              {t('去线索表补来源（{n} 条归因不到）', { n: review.unattributed })}
            </button>
          ) : null}
          {reviewJump ? (
            <button type="button" className="md-inline-link md-review-jump" onClick={() => setDesk({ view: 'data', focusId: null, dataQuery: reviewJump.title })}>
              {t('看这条内容：{title}', { title: reviewJump.title })}
            </button>
          ) : null}
          {review.nextTopics.length ? (
            <div className="md-review-next">
              <b>{t('下一步可以拍')}</b>
              <ul>
                {review.nextTopics.map(row => (
                  <li key={row}>
                    <button type="button" className="md-inline-link" onClick={() => startFromTopic(row, reviewAngle(row))}>
                      <Icon name="pen" size={12} />{row}
                      <em className="md-topic-angle">{t(reviewAngle(row))}</em>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {advice.gaps.length ? (
          <ul className="md-advice-gaps">
            {advice.gaps.map(row => <li key={row.key}><b>{t(row.label)}</b><span>{t(row.fix)}</span></li>)}
          </ul>
        ) : <p className="md-setup-hint">{t('够了：人群具体、切入点清楚、也写了顾虑。可以开始拍了。')}</p>}
        <div className="md-advice-videos">
          <b>{t('先拍这几条（科目 / 家庭 / 考情 / 本地）')}</b>
          <ul>
            {advice.firstVideos.map(row => (
              <li key={row.angle + row.text}>
                <button type="button" className="md-advice-video" onClick={() => startFromTopic(row.text)}>
                  <em>{t(row.angle)}</em>
                  <span>{row.text}</span>
                  <Icon name="pen" size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <details className="md-advice-pitfalls">
          <summary>{t('别踩的坑')}</summary>
          <ul>{advice.pitfalls.map(row => <li key={row}>{t(row)}</li>)}</ul>
        </details>
      </section>

      <section className="md-setup-card md-setup-reset">
        <h2>{t('想从头再来')}</h2>
        <p className="md-setup-hint">{t('清空设定和家长痛点，重新做一遍问卷。线索表、内容和数据都不会动。')}</p>
        <button type="button" className="md-pill" onClick={() => {
          dispatchOps([
            { op: 'update_positioning', subject: '', grade: '', city: '', target: '', entry: '', fear: '', only: '', notDo: '', voice: '', redline: '' },
            { op: 'set_pain_points', points: [] },
          ], { label: t('重做问卷') })
          setDesk({ view: 'home', focusId: null })
        }}>{t('重新做一遍问卷')}</button>
      </section>

      <details className="md-setup-card md-setup-more">
        <summary>{t('更细的边界（可选，不填也能用）')}</summary>
        <div className="md-setup-grid">
          {BOUNDARY.map(([key, label, hint]) => (
            <label key={key} className="md-field">
              <span>{t(label)}</span>
              <textarea rows={2} defaultValue={positioning[key] ?? ''} placeholder={t(hint)} onBlur={event => save(key, event.target.value)} />
            </label>
          ))}
        </div>
      </details>
    </div>
  )
}
