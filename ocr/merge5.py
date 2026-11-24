#!/usr/bin/env python3
"""v5：标题识别失败的截图，按前后文继承归属；人名按去空格归并。"""
import json, os, re
from collections import OrderedDict, defaultdict, Counter

import merge3n as M

ROOT = M.ROOT
OUT_DIR = os.path.join(ROOT, 'ocr', 'conversations_ni')


def key(h):
    return re.sub(r'\s+', '', h).lower()


def pick_header(lines):
    cands = [r for r in lines if r['y'] > 0.86 and r['speaker'] == 'bg' and r['w'] > 0.28
             and re.search(r'(高一|初三|高三|班课|班|家长|妈妈|爸爸|同学)', r['text'])]
    if not cands:
        return ''
    best = max(cands, key=lambda r: r['w'])
    return best['text']


def main():
    rows = defaultdict(list)
    for line in open(os.path.join(ROOT, 'ocr', 'all2.jsonl')):
        r = json.loads(line)
        rows[r['file']].append(r)

    pages = []
    for f in M.load_images():
        if f not in rows:
            continue
        header, msgs = M.page_to_msgs(rows[f], f)
        pages.append([f, header, msgs])

    # 标题识别失败的，继承前一张；开头就失败的继承后一张
    last = ''
    for p in pages:
        if p[1] and p[1] != '未知':
            last = p[1]
        else:
            p[1] = ''
    last = ''
    for p in pages:
        if p[1]:
            last = p[1]
        else:
            p[1] = last
    nxt = ''
    for p in reversed(pages):
        if p[1]:
            nxt = p[1]
        else:
            p[1] = nxt

    persons = OrderedDict()
    for f, header, msgs in pages:
        persons.setdefault(key(header), {'raw': Counter(), 'pages': []})
        persons[key(header)]['raw'][header] += 1
        persons[key(header)]['pages'].append((f, msgs))

    os.makedirs(OUT_DIR, exist_ok=True)
    for fn in os.listdir(OUT_DIR):
        os.remove(os.path.join(OUT_DIR, fn))

    out = []
    for k, p in persons.items():
        raw = p['raw'].most_common(1)[0][0]
        merged = []
        for _f, _msgs in p['pages']:
            if not merged:
                merged = list(_msgs)
            else:
                tail, _ = M.overlap_join(merged, _msgs)
                merged += tail
        safe = re.sub(r'[\\/:*?"<>|\s]+', '_', raw)[:40]
        with open(os.path.join(OUT_DIR, safe + '.txt'), 'w') as fh:
            fh.write('# ' + raw + '\n# ' + str(len(p['pages'])) + ' 张截图\n\n')
            clean = []
            for who, text in merged:
                if who == 'time':
                    if clean and clean[-1][0] == 'time' and clean[-1][1] == text:
                        continue
                    clean.append((who, text)); continue
                nt = re.sub(r'\W', '', text)
                if len(nt) > 10 and any(re.sub(r'\W','',t) == nt for w, t in clean[-6:]):
                    continue
                clean.append((who, text))
            n = 0
            for who, text in clean:
                if who == 'time':
                    fh.write('\n[' + text + ']\n')
                else:
                    n += 1
                    fh.write(('姜: ' if who == 'self' else '家长: ') + text + '\n')
        times = [t for w, t in merged if w == 'time']
        out.append((raw, len(p['pages']), n, times[0] if times else '', times[-1] if times else ''))
    for raw, np, n, t0, t1 in out:
        print(f'{raw[:28]:<30} {np:>3}张 {n:>4}条  {t0} → {t1}')
    print('合计', len(out), '人')


if __name__ == '__main__':
    main()
