#!/usr/bin/env python3
"""把 OCR 结果按气泡颜色分左右、按聊天标题分人，拼成每人一份对话 txt。"""
import json, os, re, sys, unicodedata
from collections import OrderedDict, defaultdict
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(ROOT, '微信图片')
OUT_DIR = os.path.join(ROOT, 'ocr', 'conversations')

TIME_RE = re.compile(r'^(\d{1,2}月\d{1,2}日.*|\d{1,2}:\d{2}|昨天.*|前天.*|星期[一二三四五六日].*|\d{4}年\d{1,2}月\d{1,2}日.*)$')
NOISE_RE = re.compile(r'^(按住 说话|按住说话|发送|•••|\.\.\.|〈|<|5G|4G|Wi-Fi|WIFI|\d{1,2}:\d{2})$')


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
    """green=self, gray=other, bg=背景/系统"""
    greens = [c for c in colors if c[1] - c[0] > 40 and c[1] > 100]
    if len(greens) >= 2:
        return 'self'
    means = [sum(c) / 3 for c in colors]
    spreads = [max(c) - min(c) for c in colors]
    dark_bubble = sum(1 for m, s in zip(means, spreads) if 25 < m < 90 and s < 14)
    light_bubble = sum(1 for m, s in zip(means, spreads) if 195 < m < 251 and s < 14)
    if dark_bubble >= 2 or light_bubble >= 2:
        return 'other'
    return 'bg'


def load_images():
    files = [f for f in os.listdir(IMG_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    def idx(f):
        m = re.search(r'_(\d+)_852', f)
        return int(m.group(1)) if m else 0
    return sorted(files, key=idx)


def clean(text):
    t = text.replace('\u200b', '').strip()
    return t


def main():
    rows = defaultdict(list)
    for line in open(os.path.join(ROOT, 'ocr', 'all.jsonl')):
        r = json.loads(line)
        rows[r['file']].append(r)

    persons = OrderedDict()
    report = []
    for f in load_images():
        if f not in rows:
            report.append((f, 'NO_OCR', 0))
            continue
        img = Image.open(os.path.join(IMG_DIR, f)).convert('RGB')
        W, H = img.size
        lines = []
        for r in rows[f]:
            r['text'] = clean(r['text'])
            if not r['text']:
                continue
            r['speaker'] = classify(sample_colors(img, r, W, H))
            lines.append(r)
        lines.sort(key=lambda r: (-r['y'], r['x']))

        # 标题栏：顶部、较宽的那一行
        header = ''
        for r in lines:
            if r['y'] > 0.86 and r['w'] > 0.25 and r['speaker'] == 'bg':
                if re.search(r'(妈妈|爸爸|同学|家长|老师|妈|爸|叔叔|阿姨|姐|哥)', r['text']) or r['w'] > 0.4:
                    header = r['text']
                    break
        if not header:
            # 退一步：顶部最宽的一行
            cands = [r for r in lines if r['y'] > 0.86 and r['w'] > 0.2]
            header = max(cands, key=lambda r: r['w'])['text'] if cands else '未知'

        msgs = []
        for r in lines:
            if r['y'] > 0.86:   # 状态栏/标题栏
                continue
            if r['speaker'] == 'bg':
                if TIME_RE.match(r['text']) and r['w'] < 0.4:
                    msgs.append(('time', r['text']))
                continue
            if NOISE_RE.match(r['text']):
                continue
            msgs.append((r['speaker'], r['text']))

        report.append((f, header, len([m for m in msgs if m[0] != 'time'])))
        p = persons.setdefault(header, {'header': header, 'imgs': [], 'msgs': []})
        p['imgs'].append(f)
        p['msgs'].extend(msgs)

    os.makedirs(OUT_DIR, exist_ok=True)
    summary = []
    for header, p in persons.items():
        safe = re.sub(r'[\\/:*?"<>|\s]+', '_', header)[:40] or '未知'
        path = os.path.join(OUT_DIR, safe + '.txt')
        n = 0
        with open(path, 'w') as fh:
            fh.write('# ' + header + '\n')
            fh.write('# 截图 ' + str(len(p['imgs'])) + ' 张：' + ', '.join(i.split('_')[-2] for i in p['imgs']) + '\n\n')
            for who, text in p['msgs']:
                if who == 'time':
                    fh.write('\n[' + text + ']\n')
                else:
                    n += 1
                    fh.write(('姜: ' if who == 'self' else '家长: ') + text + '\n')
        summary.append((header, len(p['imgs']), n, safe))

    print(f'{"聊天标题":<46} 张数 条数')
    for header, ni, n, safe in summary:
        print(f'{header[:44]:<46} {ni:>3} {n:>4}')
    print('\n共', len(summary), '人 /', sum(s[1] for s in summary), '张图')
    print('\n-- 每张图的标题识别 --')
    for f, h, n in report:
        print(f.split('_')[-2] if '_' in f else f, '|', h, '|', n)


if __name__ == '__main__':
    main()
