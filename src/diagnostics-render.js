// 生成单文件诊断卷 HTML：手机能答、能保存、能回传，打印时不带按钮。
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')

function brandBlock(spec) {
  const brand = spec.brand ?? {}
  const logo = brand.logo && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(brand.logo)
    ? `<img class="brand-logo" src="${escape(brand.logo)}" alt="">`
    : `<span class="brand-mark">${escape(brand.mark || brand.name?.slice(0, 1) || '师')}</span>`
  return `<div class="brand">${logo}<span class="brand-text"><b>${escape(brand.name || '试听诊断')}</b><small>${escape(brand.teacher || '')}</small></span></div>`
}

export function renderDiagnosticHtml(spec, { kind = 'pre', pre = null } = {}) {
  const lesson = spec.lesson ?? {}
  const student = spec.student ?? {}
  const title = kind === 'post' ? `课后检测 · ${lesson.title || spec.title}` : (spec.title || '试听课诊断卷')
  const meta = [
    lesson.subject && lesson.grade ? `${escape(lesson.grade)}${escape(lesson.subject)}` : '',
    lesson.at ? `上课时间：${escape(lesson.at)}` : '',
    lesson.code ? `课次编码：${escape(lesson.code)}` : '',
    student.name ? `${escape(student.name)}${student.grade ? ` · ${escape(student.grade)}` : ''}` : '',
  ].filter(Boolean)
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escape(title)}</title>
<style>
  :root { --ink:#14253a; --deep:#1a3a5c; --mid:#2b5a88; --paper:#f7f3ea; --porcelain:#fffdf8; --line:rgba(20,37,58,.14); --good:#2e9e63; --bad:#d64545; --gold:#d9a441; }
  * { box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; }
  body { font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",-apple-system,sans-serif; background:var(--paper); color:var(--ink); line-height:1.6; padding-bottom:96px; }
  .wrap { max-width:680px; margin:0 auto; padding:16px 14px 30px; }
  .cover { position:relative; overflow:hidden; background:linear-gradient(135deg,#2b5a88,#1a3a5c 58%,#14253a); color:#fff; border-radius:20px; padding:22px 20px 20px; box-shadow:0 14px 34px rgba(20,37,58,.24); }
  .brand { display:flex; align-items:center; gap:10px; }
  .brand-logo { width:38px; height:38px; border-radius:10px; object-fit:contain; background:#fff; padding:3px; }
  .brand-mark { display:flex; align-items:center; justify-content:center; width:38px; height:38px; border-radius:10px; background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.25); font-size:17px; font-weight:800; }
  .brand-text { display:flex; flex-direction:column; line-height:1.25; }
  .brand-text b { font-size:14px; letter-spacing:.05em; }
  .brand-text small { font-size:11.5px; opacity:.75; }
  .cover h1 { margin-top:16px; font-size:25px; line-height:1.3; letter-spacing:.01em; }
  .cover .meta { display:flex; flex-wrap:wrap; gap:5px 12px; margin-top:10px; font-size:12px; opacity:.86; }
  .cover .watermark { position:absolute; right:-6px; bottom:-14px; font-size:56px; font-weight:800; opacity:.06; letter-spacing:.06em; pointer-events:none; }
  .tip { margin-top:18px; padding:13px 14px; border:1px solid var(--line); border-radius:14px; background:var(--porcelain); color:#43536a; font-size:13px; line-height:1.7; }
  .commit { margin-top:14px; padding:14px; border-radius:14px; background:var(--porcelain); border:1px solid var(--line); }
  .commit label { display:block; font-size:13px; font-weight:700; margin-bottom:8px; }
  .commit select { width:100%; padding:11px 12px; border:1.5px solid var(--line); border-radius:11px; background:#fff; font:inherit; font-size:14px; color:var(--ink); }
  .section { margin-top:22px; }
  .s-head { display:flex; align-items:center; gap:9px; margin-bottom:10px; }
  .s-num { width:27px; height:27px; border-radius:8px; background:var(--mid); color:#fff; font-weight:800; font-size:13px; display:flex; align-items:center; justify-content:center; }
  .s-head h2 { font-size:16px; font-weight:800; }
  .s-head small { color:#7a8a9a; font-size:11.5px; }
  .q { padding:15px; border-radius:15px; background:var(--porcelain); border:1px solid var(--line); margin-top:10px; }
  .q-stem { display:flex; gap:8px; align-items:baseline; font-size:15px; font-weight:600; }
  .q-no { color:var(--mid); font-weight:800; flex:none; }
  .formula { margin-top:9px; padding:9px 11px; border-radius:9px; background:#eef3f8; color:var(--deep); font-family:"Menlo","Consolas","SF Mono",monospace; font-size:14px; font-weight:600; line-height:1.7; }
  .opts { display:flex; flex-direction:column; gap:8px; margin-top:11px; }
  .opt { display:flex; gap:9px; align-items:baseline; width:100%; text-align:left; padding:11px 12px; border:1.5px solid var(--line); border-radius:11px; background:#fff; color:var(--ink); font:inherit; font-size:14px; line-height:1.55; cursor:pointer; transition:border-color .15s,background .15s; }
  .opt .key { flex:none; width:23px; height:23px; border-radius:50%; background:#eef3f8; color:var(--mid); font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center; }
  .opt.sel { border-color:var(--mid); background:#eef3f8; }
  .opt.sel .key { background:var(--mid); color:#fff; }
  .opt.right { border-color:var(--good); background:#eef8f1; }
  .opt.right .key { background:var(--good); color:#fff; }
  .opt.wrong { border-color:var(--bad); background:#fbefef; }
  .opt.wrong .key { background:var(--bad); color:#fff; }
  .opt.locked { pointer-events:none; }
  .bar { position:sticky; bottom:0; z-index:5; margin-top:20px; padding:12px 0 max(12px,env(safe-area-inset-bottom)); background:linear-gradient(to top,var(--paper) 72%,rgba(247,243,234,0)); }
  .bar-row { display:flex; gap:8px; }
  .btn { flex:1; min-height:50px; border:0; border-radius:13px; font:inherit; font-size:15px; font-weight:700; cursor:pointer; }
  .btn.ghost { background:var(--porcelain); color:var(--ink); border:1px solid var(--line); }
  .btn.primary { background:linear-gradient(135deg,#2b5a88,#1a3a5c); color:#fff; box-shadow:0 8px 20px rgba(20,37,58,.28); }
  .btn:disabled { opacity:.5; cursor:not-allowed; }
  .btn.is-waiting { opacity:.62; }
  .saved { text-align:center; color:#7a8a9a; font-size:11.5px; margin-top:7px; min-height:17px; }
  #report { margin-top:20px; }
  .card { padding:20px 17px; border-radius:18px; background:var(--porcelain); border:1px solid var(--line); }
  .score { font-size:46px; font-weight:800; color:var(--deep); line-height:1.1; }
  .score small { font-size:14px; color:#7a8a9a; font-weight:500; }
  .layers { display:flex; flex-direction:column; gap:7px; margin-top:16px; }
  .layer { display:flex; align-items:center; gap:9px; }
  .layer span { flex:0 0 130px; font-size:12.5px; font-weight:600; color:#3a4a5c; }
  .track { flex:1; height:9px; border-radius:5px; background:#eef0f2; overflow:hidden; }
  .track i { display:block; height:100%; border-radius:5px; background:var(--mid); }
  .layer em { flex:none; width:40px; text-align:right; font-style:normal; font-size:12px; font-weight:700; color:var(--deep); }
  .verdict { margin-top:15px; border-radius:13px; padding:14px; font-size:13.5px; line-height:1.75; }
  .verdict.stuck { background:#fbefef; color:#9c3333; border:1px solid #f0d3d3; }
  .verdict.pass { background:#eef8f1; color:#1f6b43; border:1px solid #cfe8d8; }
  .verdict.mid { background:#fdf6e8; color:#8a6420; border:1px solid #f0e3c0; }
  .verdict b { display:block; font-size:14.5px; margin-bottom:4px; }
  .wrong-box { margin-top:12px; }
  .wrong-box summary { cursor:pointer; color:var(--mid); font-size:13px; font-weight:700; }
  .wrong { padding:10px 0; border-bottom:1px dashed var(--line); font-size:12.5px; line-height:1.7; color:#3a4a5c; }
  .wrong:last-child { border-bottom:0; }
  .wrong b { color:var(--ink); }
  .cta { margin-top:15px; padding:17px; border-radius:14px; background:linear-gradient(135deg,#2b5a88,#1a3a5c); color:#fff; text-align:center; }
  .cta b { display:block; font-size:16px; }
  .cta p { margin-top:6px; font-size:13px; opacity:.92; line-height:1.7; }
  .result-actions { display:flex; gap:8px; margin-top:12px; }
  .result-actions .btn { min-height:44px; font-size:13px; }
  .result-code { width:100%; margin-top:10px; padding:9px; border:1px solid var(--line); border-radius:9px; background:#fff; color:#5a6a7c; font:12px/1.5 monospace; word-break:break-all; }
  .hidden { display:none !important; }
  .self { margin-top:16px; padding:14px; border-radius:13px; background:var(--porcelain); border:1px solid var(--line); }
  .self b { font-size:13.5px; }
  .self label { display:block; margin-top:10px; color:#43536a; font-size:12.5px; }
  .self select,.self textarea { width:100%; margin-top:4px; padding:9px 10px; border:1px solid var(--line); border-radius:9px; background:#fff; font:inherit; font-size:13px; color:var(--ink); }
  .self textarea { min-height:64px; resize:vertical; }
  .compare { margin-top:14px; padding:12px 13px; border-radius:12px; background:#eef3f8; color:#2b5a88; font-size:13px; line-height:1.7; }
  .compare b { font-size:15px; }
  @media (max-width:420px) { .cover h1 { font-size:22px; } .layer span { flex-basis:108px; } .brand-text b { font-size:13px; } }
  @media print { body { background:#fff; padding:0; } .bar,.result-actions,.wrong-box summary,.no-print { display:none !important; } .wrap { max-width:none; padding:0; } .cover { box-shadow:none; border-radius:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; } .q { break-inside:avoid; } }
</style>
</head>
<body>
<div class="wrap">
  <header class="cover">
    ${brandBlock(spec)}
    <h1>${escape(title)}</h1>
    <div class="meta">${meta.map(row => `<span>${row}</span>`).join('')}</div>
    <div class="watermark">${escape(spec.brand?.name || '诊断')}</div>
  </header>

  <div class="tip">${kind === 'post'
    ? '这次检测只看你上完课之后的掌握情况，不排名、不批评。做完点「提交看结果」，老师会根据结果安排下一步。'
    : '做完点「提交看诊断结果」，你会看到自己卡在哪一层。把结果发给老师，试听就从卡住的地方开始。'}</div>

  ${kind === 'pre' ? `<div class="commit"><label for="commitment">${escape(spec.commitment || '这次试听，你最想先解决哪一步？')}</label><select id="commitment"><option value="">先不选</option>${(spec.commitOptions || ['先补基础', '跟上学校进度', '冲高分', '解决作业', '先让孩子愿意学']).map(option => `<option>${escape(option)}</option>`).join('')}</select></div>` : ''}

  <div id="questions"></div>

  ${kind === 'post' ? `<div class="self"><b>上完这节课，你自己感觉呢？</b>
    <label>今天哪一步最清楚？<select id="self-clear"><option value="">选一个</option>${['标化合价', '找升降', '电子守恒', '完整配平', '还不太清楚'].map(option => `<option>${option}</option>`).join('')}</select></label>
    <label>还有哪一步不确定？<select id="self-unsure"><option value="">选一个</option>${['标化合价', '找升降', '电子守恒', '完整配平', '没有不确定'].map(option => `<option>${option}</option>`).join('')}</select></label>
    <label>愿意自己再做一遍吗？<select id="self-willing"><option value="">选一个</option><option>愿意</option><option>可以试试</option><option>还不想</option></select></label>
  </div>` : ''}

  <div class="bar no-print">
    <div class="bar-row"><button class="btn ghost" id="save-btn" type="button">保存答案</button><button class="btn primary" id="submit-btn" type="button">看诊断结果</button></div>
    <div class="saved" id="saved">答案只在这台设备上批改，不上传；做完可以保存结果发给老师。</div>
  </div>

  <div id="report" class="hidden"></div>
</div>
<script>
window.__YT_DIAG__ = ${safeJson({ spec, kind, pre })};
(function () {
  var data = window.__YT_DIAG__;
  var spec = data.spec;
  var answers = spec.questions.map(function () { return -1; });
  var submitted = false;
  var key = 'yt-diag-' + spec.id + '-' + data.kind;
  var letters = ['A','B','C','D'];

  function $(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function save() {
    try { localStorage.setItem(key, JSON.stringify({ answers: answers, commitment: $('commitment') ? $('commitment').value : '', savedAt: new Date().toISOString() })); $('saved').textContent = '已保存，可以关掉页面，下次接着做'; } catch (e) { $('saved').textContent = '这个浏览器不能本地保存，做完请直接复制结果'; }
  }
  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && Array.isArray(saved.answers)) answers = saved.answers;
      if (saved && $('commitment') && saved.commitment) $('commitment').value = saved.commitment;
    } catch (e) {}
  }
  function ready() { return answers.every(function (a) { return a >= 0; }); }
  function sync() { $('submit-btn').classList.toggle('is-waiting', !ready()); if (ready()) save(); }
  function render() {
    var html = '';
    var current = '';
    spec.questions.forEach(function (q, index) {
      if (q.layer !== current) {
        current = q.layer;
        var layer = spec.layers.filter(function (l) { return l.id === q.layer; })[0] || {};
        html += '<section class="section"><div class="s-head"><span class="s-num">' + (spec.layers.indexOf(layer) + 1) + '</span><h2>' + esc(layer.name || '') + '</h2><small>' + esc(layer.desc || '') + '</small></div>';
      }
      html += '<div class="q" data-q="' + index + '"><div class="q-stem"><span class="q-no">' + (index + 1) + '.</span><span>' + esc(q.stem) + '</span></div>';
      if (q.formula) html += '<div class="formula">' + esc(q.formula) + '</div>';
      html += '<div class="opts">';
      q.options.forEach(function (option, oi) {
        html += '<button type="button" class="opt' + (answers[index] === oi ? ' sel' : '') + '" data-i="' + index + '" data-o="' + oi + '"><span class="key">' + letters[oi] + '</span><span>' + esc(option) + '</span></button>';
      });
      html += '</div></div>';
      if (index === spec.questions.length - 1) html += '</section>';
    });
    $('questions').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('#questions .opt'), function (button) {
      button.addEventListener('click', function () {
        if (submitted) return;
        var i = +button.dataset.i; var o = +button.dataset.o;
        answers[i] = o;
        Array.prototype.forEach.call(document.querySelectorAll('#questions .q[data-q="' + i + '"] .opt'), function (b) { b.classList.remove('sel'); });
        button.classList.add('sel');
        sync(); save();
      });
    });
  }
  function score() {
    var layers = spec.layers.map(function (l) { return { id: l.id, name: l.name, correct: 0, total: 0 }; });
    var wrong = []; var correct = 0;
    spec.questions.forEach(function (q, i) {
      var l = layers.filter(function (x) { return x.id === q.layer; })[0];
      if (!l) return;
      l.total += 1;
      if (answers[i] === q.answer) { l.correct += 1; correct += 1; }
      else wrong.push({ index: i, q: q, chosen: answers[i] });
    });
    layers.forEach(function (l) { l.percent = l.total ? Math.round(l.correct / l.total * 100) : 0; });
    var percent = spec.questions.length ? Math.round(correct / spec.questions.length * 100) : 0;
    return { correct: correct, total: spec.questions.length, percent: percent, layers: layers, wrong: wrong, band: percent < 40 ? 'low' : percent < 75 ? 'mid' : percent < 90 ? 'high' : 'top' };
  }
  function resultPayload() {
    var extra = { commitment: $('commitment') ? $('commitment').value : '', savedAt: new Date().toISOString() };
    if (data.kind === 'post') extra.selfEval = { clear: $('self-clear') ? $('self-clear').value : '', unsure: $('self-unsure') ? $('self-unsure').value : '', willing: $('self-willing') ? $('self-willing').value : '' };
    return { v: 1, id: spec.id, kind: data.kind, answers: answers, commitment: extra.commitment, selfEval: extra.selfEval || null, studentName: (spec.student && spec.student.name) || '', savedAt: extra.savedAt };
  }
  function code() {
    var text = JSON.stringify(resultPayload());
    var bytes = new TextEncoder().encode(text);
    var binary = ''; for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return 'YT-DIAG1:' + btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }
  function submit() {
    if (submitted) return;
    var missing = answers.filter(function (a) { return a < 0; }).length;
    if (missing) {
      $('saved').textContent = '还有 ' + missing + ' 题没答，先把它们选上再批改；答案会一条条存在这台设备上。';
      var first = answers.indexOf(-1);
      var q = document.querySelector('.q[data-q="' + first + '"]');
      if (q) q.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    submitted = true;
    var result = score();
    var verdict = spec.verdicts[result.band] || { title: '诊断完成', body: '' };
    Array.prototype.forEach.call(document.querySelectorAll('#questions .opt'), function (b) { b.classList.add('locked'); });
    Array.prototype.forEach.call(document.querySelectorAll('#questions .q'), function (block) {
      var index = +block.dataset.q; var q = spec.questions[index];
      Array.prototype.forEach.call(block.querySelectorAll('.opt'), function (b, oi) {
        if (oi === q.answer) b.classList.add('right');
        if (oi === answers[index] && oi !== q.answer) b.classList.add('wrong');
      });
    });
    $('submit-btn').disabled = true;
    $('save-btn').disabled = true;
    var html = '<div class="card"><div class="score">' + result.correct + '<small> / ' + result.total + ' 题 · 正确率 ' + result.percent + '%</small></div>';
    html += '<div class="layers">';
    result.layers.forEach(function (l) { html += '<div class="layer"><span>' + esc(l.name) + '</span><div class="track"><i style="width:' + l.percent + '%"></i></div><em>' + l.correct + '/' + l.total + '</em></div>'; });
    html += '</div>';
    html += '<div class="verdict ' + (result.band === 'top' || result.band === 'high' ? 'pass' : result.band === 'mid' ? 'mid' : 'stuck') + '"><b>' + esc(verdict.title) + '</b>' + esc(verdict.body) + '</div>';
    if (result.wrong.length) {
      html += '<details class="wrong-box" open><summary>错题解析（' + result.wrong.length + ' 题）</summary>';
      result.wrong.forEach(function (row) {
        html += '<div class="wrong"><b>第 ' + (row.index + 1) + ' 题</b> · ' + esc(row.q.stem) + '<br>';
        if (row.chosen >= 0) html += '<span style="color:#9c3333">你的答案：' + letters[row.chosen] + '</span>　';
        html += '<span style="color:#1f6b43">正确答案：' + letters[row.q.answer] + '</span><br>' + esc(row.q.explain) + '</div>';
      });
      html += '</details>';
    }
    if (data.kind === 'post' && data.pre) {
      html += '<div class="compare">课前正确率 <b>' + data.pre.percent + '%</b> → 这次 <b>' + result.percent + '%</b>，' + (result.percent > data.pre.percent ? '进步 ' + (result.percent - data.pre.percent) + ' 个百分点。' : '先稳住这一段，别急着加量。') + '</div>';
    }
    html += '<div class="cta"><b>' + (data.kind === 'post' ? '把这次进步，变成下一步' : '测出断层，只是第一步') + '</b><p>' + (data.kind === 'post' ? '老师会根据这份结果，安排后续补漏；有不懂的地方，主讲和助教会盯到你会。' : '带着这份结果来试听，老师就从卡住的那一层开始讲。') + '</p></div>';
    html += '<div class="result-actions no-print"><button class="btn primary" type="button" id="copy-btn">复制结果给老师</button><button class="btn ghost" type="button" id="download-btn">保存结果</button></div><textarea class="result-code no-print" id="result-code" readonly></textarea></div>';
    $('report').innerHTML = html;
    $('report').classList.remove('hidden');
    $('result-code').value = code();
    $('copy-btn').addEventListener('click', function () {
      var value = $('result-code').value;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function () { $('copy-btn').textContent = '已复制，发给老师'; }).catch(function () { $('result-code').select(); });
      else { $('result-code').select(); document.execCommand('copy'); $('copy-btn').textContent = '已复制，发给老师'; }
    });
    $('download-btn').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(resultPayload(), null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '诊断结果-' + spec.id + '.json'; a.click();
    });
    $('report').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('save-btn').addEventListener('click', function () { save(); $('saved').textContent = '已保存。做完再点「提交看结果」。'; });
  $('submit-btn').addEventListener('click', submit);
  if ($('commitment')) $('commitment').addEventListener('change', save);
  load(); render(); sync();
})();
</script>
</body>
</html>`
}
