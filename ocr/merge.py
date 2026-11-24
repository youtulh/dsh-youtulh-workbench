#!/usr/bin/env python3
"""按人合并多张截图，去掉相邻截图之间的重叠消息。"""
import json, os, re
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


def norm_header(h):
    h = h.replace('＜', '').replace('<', '').replace('〈', '').strip()
    h = re.sub(r'\s+', ' ', h)
    h = h.replace('xhs', ' xhs ').replace('  ', ' ')
    return re.sub(r'\s+', ' ', h).strip()


def load_images():
    files = [f for f in os.listdir(IMG_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    return sorted(files, key=lambda f: int(re.search(r'_(\d+)_852', f).group(1)) if re.search(r'_(\d+)_852', f) else 0)


def overlap_join(acc, new):
    """acc: 已有消息列表；new: 新截图的消息列表。找最长重叠，接到后面。"""
    best = 0
    limit = min(len(acc), len(new), 40)
    for k in range(limit, 0, -1):
        if acc[-k:] == new[:k]:
            best = k
            break
    if best == 0:
        # 容忍 OCR 微小差异：按去空格比较最后 3 条
        for k in range(min(8, len(acc), len(new)), 2, -1):
            a = [re.sub(r'\s', '', x[1]) for x in acc[-k:]]
            b = [re.sub(r'\s', '', x[1]) for x in new[:k]]
            if a == b:
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
        img = Image.open(os.path.join(IMG_DIR, f)).convert('RGB')
        W, H = img.size
        lines = []
        for r in rows[f]:
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
        header = norm_header(header)

        msgs = []
        for r in lines:
            if r['y'] > 0.86:
                continue
            if r['speaker'] == 'bg':
                if TIME_RE.match(r['text']) and r['w'] < 0.4:
                    msgs.append(('time', r['text']))
                continue
            if NOISE_RE.match(r['text']):
                continue
            msgs.append((r['speaker'], r['text']))

        p = persons.setdefault(header, {'imgs': [], 'msgs': []})
        if not p['imgs']:
            p['msgs'] = msgs
            tail, k = msgs, len(msgs)
        else:
            tail, k = overlap_join(p['msgs'], msgs)
            p['msgs'] = p['msgs'] + tail
        p['imgs'].append((f, len(msgs), len(tail)))

    os.makedirs(OUT_DIR, exist_ok=True)
    for header, p in persons.items():
        safe = re.sub(r'[\\/:*?"<>|\s]+', '_', header)[:40] or '未知'
        path = os.path.join(OUT_DIR, safe + '.txt')
        n = 0
        with open(path, 'w') as fh:
            fh.write('# ' + header + '\n')
            fh.write('# ' + str(len(p['imgs'])) + ' 张截图\n\n')
            for who, text in p['msgs']:
                if who == 'time':
                    fh.write('\n[' + text + ']\n')
                else:
                    n += 1
                    fh.write(('姜: ' if who == 'self' else '家长: ') + text + '\n')
        print(f'{header}  ->  {safe}.txt  截图 {len(p["imgs"])} 张，去重后 {n} 条')
        for f, tot, added in p['imgs']:
            print(f'   {f.split("_")[-2]:>3}  识别 {tot:>2} 条，新增 {added:>2} 条')


if __name__ == '__main__':
    main()
