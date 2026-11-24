#!/usr/bin/env python3
"""v4：先按「从头重来」切成多轮截图，每轮内部去重叠，最后取信息量最大的那一轮。"""
import json, os, re, difflib
from collections import OrderedDict, defaultdict

import merge3n as M

ROOT = M.ROOT
OUT_DIR = os.path.join(ROOT, 'ocr', 'conversations_ni')


def norm(t):
    return re.sub(r'[^\w\u4e00-\u9fff]', '', t)


def first_kind(msgs):
    for who, t in msgs:
        if who != 'time':
            return norm(t)
    return ''


def merge_pass(pages):
    acc = []
    for h, msgs in pages:
        if not acc:
            acc = list(msgs)
        else:
            tail, _ = M.overlap_join(acc, msgs)
            acc += tail
    return acc


def chars(msgs):
    return sum(len(t) for w, t in msgs if w != 'time')


def main():
    rows = defaultdict(list)
    for line in open(os.path.join(ROOT, 'ocr', 'all2.jsonl')):
        r = json.loads(line)
        rows[r['file']].append(r)

    persons = OrderedDict()
    for f in M.load_images():
        if f not in rows:
            continue
        header, msgs = M.page_to_msgs(rows[f], f)
        persons.setdefault(header, []).append((f, msgs))

    os.makedirs(OUT_DIR, exist_ok=True)
    for fn in os.listdir(OUT_DIR):
        os.remove(os.path.join(OUT_DIR, fn))

    for header, pages in persons.items():
        # 切轮：新一轮的第一条 = 本轮第一条
        passes = []
        cur = []
        start_key = None
        for f, msgs in pages:
            k = first_kind(msgs)
            if cur and start_key and k and k == start_key:
                passes.append(cur)
                cur = []
                start_key = None
            if not cur:
                start_key = k or first_kind(msgs)
            cur.append((f, msgs))
        if cur:
            passes.append(cur)

        merged = [merge_pass(p) for p in passes]
        best = max(merged, key=chars) if merged else []
        # 其它轮里超出这一轮末尾的内容补上
        tail_keys = {norm(t) for w, t in best[-6:] if w != 'time'}
        for other in merged:
            if other is best:
                continue
            extra = []
            for w, t in other:
                if w == 'time':
                    if extra:
                        break
                    continue
                if norm(t) in tail_keys:
                    break
                extra.append((w, t))
            # 只在确实更长时才补
            if chars(extra) > 120 and chars(other) > chars(best) + 120:
                best = best + extra

        safe = re.sub(r'[\\/:*?"<>|\s]+', '_', header)[:40] or '未知'
        path = os.path.join(OUT_DIR, safe + '.txt')
        with open(path, 'w') as fh:
            fh.write('# ' + header + '\n')
            fh.write('# %d 张截图 / %d 轮\n\n' % (len(pages), len(passes)))
            n = 0
            for who, text in best:
                if who == 'time':
                    fh.write('\n[' + text + ']\n')
                else:
                    n += 1
                    fh.write(('姜: ' if who == 'self' else '家长: ') + text + '\n')
        print(f'{header}: 截图 {len(pages)} 张 / {len(passes)} 轮，输出 {n} 条')


if __name__ == '__main__':
    main()
