#!/usr/bin/env python3
"""v3：先把换行拼回气泡，再按气泡去重叠，最后按人合并。"""
import json, os, re, difflib
from collections import OrderedDict, defaultdict
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(ROOT, '微信图片')
OUT_DIR = os.path.join(ROOT, 'ocr', 'conversations')

TIME_RE = re.compile(r'^(\d{1,2}月\d{1,2}日.*|\d{1,2}:\d{2}|昨天.*|前天.*|星期[一二三四五六日].*|\d{4}年\d{1,2}月\d{1,2}日.*)$')
NOISE_RE = re.compile(r'^(按住 说话|按住说话|发送|•••|\.\.\.|〈|<|5G|4G|Wi-Fi|WIFI)$')


def sample_colors(img, r, W, H, dx=10):
    x0, x1 = r['x'] * W, (r['x'] + r['w']) * W
    yc = (1 - r['y'] - r['h'] / 2) * H
    pts = [(x0 - dx, yc), (x1 + dx, yc), (x0 - dx, yc + 12), (x1 + dx, yc - 12), (x0 - dx, yc - 12)]
    out = []
    for px, py in pts:
        px, py = int(max(0, min(W - 1, px))), int(max(0, min(H - 1, py)))
        out.append(img.getpixel((px, py)))
    return out


def classify(colors):
    greens = [c for c in colors if c[1] - c[0] > 40 and c[1] > 100]
    if len(greens) >= 2:
        return 'self'
    means = [sum(c) / 3 for c in colors]
    spreads = [max(c) - min(c) for c in colors]
    if sum(1 for m, s in zip(means, spreads) if 25 < m < 90 and s < 14) >= 2:
        return 'other'
    if sum(1 for m, s in zip(means, spreads) if 195 < m < 251 and s < 14) >= 2:
        return 'other'
    return 'bg'


def norm_header(h):
    h = h.replace('＜', '').replace('<', '').replace('〈', '').strip()
    h = re.sub(r'\s+', ' ', h)
    h = h.replace('xhs', ' xhs ')
    return re.sub(r'\s+', ' ', h).strip()


def norm_text(t):
    return re.sub(r'[^\w\u4e00-\u9fff]', '', t)


def load_images():
    files = [f for f in os.listdir(IMG_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    return sorted(files, key=lambda f: int(re.search(r'_(\d+)_852', f).group(1)) if re.search(r'_(\d+)_852', f) else 0)


def page_to_msgs(rows, f):
    img = Image.open(os.path.join(IMG_DIR, f)).convert('RGB')
    W, H = img.size
    lines = []
    for r in rows:
        r['text'] = r['text'].replace('\u200b', '').strip()
        if not r['text']:
            continue
        r['speaker'] = classify(sample_colors(img, r, W, H))
        lines.append(r)
    lines.sort(key=lambda r: (-r['y'], r['x']))

    header = ''
    for r in lines:
        if r['y'] > 0.86 and r['w'] > 0.25 and r['speaker'] == 'bg':
            if re.search(r'(妈妈|爸爸|同学|家长|老师|叔叔|阿姨)', r['text']) or r['w'] > 0.4:
                header = r['text']
                break
    if not header:
        cands = [r for r in lines if r['y'] > 0.86 and r['w'] > 0.2]
        header = max(cands, key=lambda r: r['w'])['text'] if cands else '未知'

    msgs = []  # (who, text)  who in self/other/time
    cur = None
    for r in lines:
        if r['y'] > 0.86 or r['y'] < 0.09:   # 顶部标题栏 / 底部输入栏
            continue
        if r['speaker'] == 'bg':
            if TIME_RE.match(r['text']) and r['w'] < 0.4:
                msgs.append(('time', r['text']))
                cur = None
            continue
        if NOISE_RE.match(r['text']) or re.fullmatch(r'[+wvW•·\-"”|]+', r['text']):
            continue
        if cur and cur[0] == r['speaker'] and -0.012 <= cur[2] - (r['y'] + r['h']) < 0.014 and abs(r['x'] - cur[3]) < 0.04:
            cur[1] += r['text']
            cur[2] = r['y']
        else:
            cur = [r['speaker'], r['text'], r['y'], r['x']]
            msgs.append(cur)
    return norm_header(header), [(m[0], m[1]) for m in msgs]


def overlap_join(acc, new):
    best = 0
    for k in range(min(len(acc), len(new), 40), 0, -1):
        a = [norm_text(x[1]) for x in acc[-k:]]
        b = [norm_text(x[1]) for x in new[:k]]
        same = sum(1 for x, y in zip(a, b) if x and y and (x == y or difflib.SequenceMatcher(None, x, y).ratio() > 0.75))
        if same / k >= 0.85:
            best = k
            break
    return new[best:], best


def main():
    rows = defaultdict(list)
    for line in open(os.path.join(ROOT, 'ocr', 'all.jsonl')):
        r = json.loads(line)
        rows[r['file']].append(r)

    persons = OrderedDict()
    for f in load_images():
        if f not in rows:
            continue
        header, msgs = page_to_msgs(rows[f], f)
        p = persons.setdefault(header, {'imgs': [], 'msgs': []})
        if not p['msgs']:
            p['msgs'] = msgs
            added = len(msgs)
        else:
            tail, k = overlap_join(p['msgs'], msgs)
            p['msgs'] += tail
            added = len(tail)
        p['imgs'].append((f, len(msgs), added))

    os.makedirs(OUT_DIR, exist_ok=True)
    for fn in os.listdir(OUT_DIR):
        os.remove(os.path.join(OUT_DIR, fn))
    for header, p in persons.items():
        safe = re.sub(r'[\\/:*?"<>|\s]+', '_', header)[:40] or '未知'
        with open(os.path.join(OUT_DIR, safe + '.txt'), 'w') as fh:
            fh.write('# ' + header + '\n# ' + str(len(p['imgs'])) + ' 张截图\n\n')
            n = 0
            for who, text in p['msgs']:
                if who == 'time':
                    fh.write('\n[' + text + ']\n')
                else:
                    n += 1
                    fh.write(('姜: ' if who == 'self' else '家长: ') + text + '\n')
        print(f'{header}: {len(p["imgs"])} 张，{n} 条')


if __name__ == '__main__':
    main()
