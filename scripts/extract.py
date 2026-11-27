#!/usr/bin/env python3
"""Extract profile/spec rows from the Alspec Industrial Catalogue PDF into data/profiles.json.

Usage: python3 scripts/extract.py path/to/catalogue.pdf
Needs PyMuPDF (pip install pymupdf). Values are kept as printed; nothing is inferred.
The PDF itself is NOT committed (copyright) - keep it outside the repo / in source/ (gitignored).
"""
import sys, os, re, json, collections
import pymupdf

args = [a for a in sys.argv[1:] if not a.startswith('--')]
PDF = args[0] if args else 'source/alspec-industrial-catalogue.pdf'
MAKE_THUMBS = '--thumbs' in sys.argv  # local-only: crops catalogue drawings; not published
OUT = 'data/raw.json'
THUMBS = 'img/thumbs'
os.makedirs('data', exist_ok=True)

# Header text -> field key
def norm_header(t):
    u = re.sub(r'\s+', ' ', t.upper()).strip()
    if not u: return None
    if u.startswith('PROFILE CODE') or u == 'CODE': return 'code'
    if u == 'PROFILE': return 'profile'
    if u.startswith('DES'): return 'description'
    if u.startswith('ALLOY'): return 'alloy'
    if u.startswith('FINISH') or u.startswith('PEARL'): return 'finish'
    if u.startswith('KG / MTR') or u.startswith('KG/MTR') or u == 'KG / M': return 'kgm'
    if u.startswith('KG / SHEET') or u.startswith('KG/SHEET'): return 'kg_sheet'
    if u.startswith('KG'): return 'kg'
    if u.startswith('TH'): return 'th'
    if u.startswith('WALL'): return 'wall'
    if u.startswith('WIDTH') or u.startswith('W ('): return 'w'
    if u.startswith('HEIGHT') or u.startswith('H ('): return 'h'
    if u.startswith('DIA'): return 'dia'
    if u.startswith('RADIUS') or u.startswith('R ('): return 'radius'
    if u.startswith('LGT') or u.startswith('L (') or u.startswith('LENGTH'): return 'length'
    if u.startswith('SHEET SIZE'): return 'sheet_size'
    if u.startswith('OPEN AREA'): return 'open_area'
    if u.startswith('HOLE TYPE'): return 'hole_type'
    if u.startswith('HOLE'): return 'hole'
    if u.startswith('CENTRES'): return 'centres'
    if u.startswith('CORNER'): return 'corner'
    return re.sub(r'[^a-z0-9]+', '_', u.lower()).strip('_')

def words_in(words, x0, y0, x1, y1):
    return [w for w in words if x0 - 1 <= (w[0] + w[2]) / 2 <= x1 + 1 and y0 - 1 <= (w[1] + w[3]) / 2 <= y1 + 1]

def join_words(ws):
    if not ws: return ''
    lines = collections.defaultdict(list)
    for w in ws: lines[round((w[1] + w[3]) / 4)].append(w)   # 2pt buckets
    out = []
    for k in sorted(lines):
        out.append(' '.join(w[4] for w in sorted(lines[k], key=lambda w: w[0])))
    return re.sub(r'\s+', ' ', ' '.join(out)).strip()

def dedupe(words):
    """Drop exact duplicates and words that overlap an earlier word on the same line
    (the PDF has a few ghost/overlaid text runs, e.g. 'TEE TEE - - STRUCTURAL')."""
    out = []
    for w in words:
        bad = False
        for o in out[-60:]:
            if abs(o[1] - w[1]) > 2 or abs(o[3] - w[3]) > 2: continue
            ov = min(o[2], w[2]) - max(o[0], w[0])
            if ov > 0.5 * min(o[2] - o[0], w[2] - w[0]): bad = True; break
        if not bad: out.append(w)
    return out

def headings(page):
    hs = []
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            txt = ''.join(s['text'] for s in l['spans']).strip()
            sz = max((s['size'] for s in l['spans']), default=0)
            if sz >= 14 and txt and not txt.isdigit():
                hs.append((l['bbox'][1], l['bbox'][3], re.sub(r'\s+', ' ', txt)))
    return hs

def num(s):
    s = (s or '').strip()
    return float(s) if re.fullmatch(r'\d+(\.\d+)?', s) else None

doc = pymupdf.open(PDF)
records, gaps, tables_log = [], [], []
thumb_cache = {}

for pno in range(len(doc)):
    page = doc[pno]; pn = pno + 1
    words = dedupe(page.get_text('words'))
    try:
        tabs = page.find_tables().tables
    except Exception as e:
        gaps.append({'page': pn, 'issue': f'table detection failed: {e}'}); continue
    hs = headings(page)
    parsed_hdr_y = []
    for ti, t in enumerate(tabs):
        x0, y0, x1, y1 = t.bbox
        hdr = t.rows[0]
        cols = []
        for c in hdr.cells:
            if c is None: continue
            name = norm_header(join_words(words_in(words, *c)))
            if name: cols.append((name, c[0], c[2], c[3]))
        keys = [c[0] for c in cols]
        if 'code' not in keys and 'description' in keys and ('corner' in keys or 'wall' in keys):
            cols = [('code',) + tuple(c[1:]) if c[0] == 'description' else c for c in cols]
            keys = [c[0] for c in cols]
        if 'code' not in keys:
            gaps.append({'page': pn, 'issue': f'table {ti+1}: no CODE column (headers: {keys})'}); continue
        hdr_bottom = next(c[3] for c in cols if c[0] == 'code')
        parsed_hdr_y.append((y0 - 2, hdr_bottom + 2))
        # heading: nearest large text above table
        above = [h for h in hs if h[1] <= y0 + 2]
        heading = above[-1][2] if above else ''
        if above:
            heading = sorted(above, key=lambda h: h[1])[-1][2]
        heading = heading.strip()
        ht_alloy = re.search(r'(\d{4})\s*-\s*(T\d+|H\d+)', heading)
        title = re.sub(r'\s*\d{4}\s*-\s*[TH]\d+.*$', '', heading).strip() or heading
        cells = [c for c in t.cells if c]
        body = [w for w in words_in(words, x0, hdr_bottom + 0.5, x1, y1) if w[4] not in ('*',)]
        # group into lines
        body.sort(key=lambda w: ((w[1] + w[3]) / 2, w[0]))
        lines = []
        for w in body:
            yc = (w[1] + w[3]) / 2
            if lines and abs(lines[-1]['y'] - yc) < 3: lines[-1]['w'].append(w)
            else: lines.append({'y': yc, 'w': [w]})
        code_col = next(c for c in cols if c[0] == 'code')
        n_before = len(records)
        cur = None
        for ln in lines:
            def colwords(c):
                return [w for w in ln['w'] if c[1] - 1 <= (w[0] + w[2]) / 2 <= c[2] + 1]
            ctext = join_words(colwords(code_col))
            if 'ITEM MARKED' in join_words(ln['w']).upper(): continue
            if ctext and re.search(r'[0-9]', ctext):
                rec = {'page': pn, 'section': title, 'heading': heading}
                code = ctext.replace(' ', '')
                rec['buy_in'] = '*' in code or any(w[4].startswith('*') for w in colwords(code_col))
                rec['code'] = code.strip('*')
                m = re.match(r'^(\d{7}(?:-[0-9A-Z]{3})?)([A-Z].*)$', rec['code'])
                if m: rec['code'], rec['_desc_prefix'] = m.group(1), m.group(2)
                for c in cols:
                    if c[0] in ('code', 'profile'): continue
                    v = join_words(colwords(c))
                    if not v:
                        # merged cell (e.g. a finish spanning several rows)
                        xc = (c[1] + c[2]) / 2
                        for cb in cells:
                            if cb[0] <= xc <= cb[2] and cb[1] <= ln['y'] <= cb[3] and (cb[3] - cb[1]) > 16:
                                v = join_words(words_in(words, *cb)); break
                    rec[c[0]] = v
                # profile image cell
                pc = next((c for c in cols if c[0] == 'profile'), None)
                if pc:
                    xc = (pc[1] + pc[2]) / 2
                    for cb in cells:
                        if cb[0] <= xc <= cb[2] and cb[1] - 1 <= ln['y'] <= cb[3] + 1:
                            rec['_img'] = tuple(round(v, 1) for v in cb); break
                if ht_alloy and not rec.get('alloy'):
                    rec['alloy'] = f'{ht_alloy.group(1)} {ht_alloy.group(2)}'
                records.append(rec); cur = rec
            elif cur is not None and ln['w']:
                # continuation line: append description text
                dc = next((c for c in cols if c[0] == 'description'), None)
                if dc:
                    extra = join_words(colwords(dc))
                    if extra and extra not in cur.get('description', ''):
                        cur['description'] = (cur.get('description', '') + ' ' + extra).strip()
        added = len(records) - n_before
        tables_log.append({'page': pn, 'table': ti + 1, 'heading': heading, 'columns': keys, 'rows': added})
        if added == 0:
            gaps.append({'page': pn, 'issue': f'table {ti+1} "{heading}": header found but no rows parsed'})

    # ---- Fallback: word-position parser for tables find_tables() missed ----
    for hw in [w for w in words if w[4] in ('CODE',)]:
        hy = (hw[1] + hw[3]) / 2
        if any(a <= hy <= b for a, b in parsed_hdr_y): continue
        hdr_words = sorted([w for w in words if hy - 9 <= (w[1] + w[3]) / 2 <= hy + 12 and w[1] < hw[3] + 12], key=lambda w: w[0])
        groups = []
        for w in hdr_words:
            if groups and w[0] - groups[-1][-1][2] < 6: groups[-1].append(w)
            else: groups.append([w])
        cols = []
        for g in groups:
            name = norm_header(join_words(g))
            if name: cols.append([name, min(w[0] for w in g), max(w[2] for w in g)])
        if not any(c[0] == 'code' for c in cols): continue
        hdr_bottom = max(w[3] for w in hdr_words)
        centers = [(c[1] + c[2]) / 2 for c in cols]
        bounds = [-1] + [(centers[i] + centers[i + 1]) / 2 for i in range(len(centers) - 1)] + [9999]
        above = [h for h in hs if h[1] <= hy]
        heading = sorted(above, key=lambda h: h[1])[-1][2] if above else ''
        ht_alloy = re.search(r'(\d{4})\s*-\s*(T\d+|H\d+)', heading)
        title = re.sub(r'\s*\d{4}\s*-\s*[TH]\d+.*$', '', heading).strip() or heading
        body = sorted([w for w in words if (w[1] + w[3]) / 2 > hdr_bottom + 1 and w[4] != '*'], key=lambda w: ((w[1] + w[3]) / 2, w[0]))
        lines = []
        for w in body:
            yc = (w[1] + w[3]) / 2
            if lines and abs(lines[-1]['y'] - yc) < 3: lines[-1]['w'].append(w)
            else: lines.append({'y': yc, 'w': [w]})
        ci = next(i for i, c in enumerate(cols) if c[0] == 'code')
        # stop at footnote / next header
        stop = None
        for ln in lines:
            t = join_words(ln['w']).upper()
            if 'ITEM MARKED' in t or 'CODE' in t.split() or 'NOTE:' in t: stop = ln['y']; break
        lines = [l for l in lines if stop is None or l['y'] < stop]
        def split_cols(ln):
            byc = collections.defaultdict(list)
            for w in ln['w']:
                xc = (w[0] + w[2]) / 2
                for i in range(len(cols)):
                    if bounds[i] <= xc < bounds[i + 1]: byc[i].append(w); break
            return byc
        code_lines = []
        for ln in lines:
            byc = split_cols(ln)
            code = join_words(byc.get(ci, [])).replace(' ', '')
            if re.search(r'\d{4,}', code): code_lines.append((ln, byc, code))
        # drop trailing code lines far below the previous one (separate content)
        kept = []
        for cl in code_lines:
            if kept and cl[0]['y'] - kept[-1][0]['y'] > 90: break
            kept.append(cl)
        recs = []
        for ln, byc, code in kept:
            rec = {'page': pn, 'section': title, 'heading': heading, 'buy_in': '*' in code, 'code': code.strip('*'), '_y': ln['y']}
            m = re.match(r'^(\d{7}(?:-[0-9A-Z]{3})?)([A-Z].*)$', rec['code'])
            if m: rec['code'], rec['_desc_prefix'] = m.group(1), m.group(2)
            for i, c in enumerate(cols):
                if c[0] in ('code', 'profile'): continue
                rec[c[0]] = join_words(byc.get(i, []))
            if ht_alloy and not rec.get('alloy'): rec['alloy'] = f'{ht_alloy.group(1)} {ht_alloy.group(2)}'
            recs.append(rec)
        if recs:
            ymax = recs[-1]['_y'] + 30
            for ln in lines:
                if any(ln is k[0] for k in kept) or ln['y'] > ymax or ln['y'] < hdr_bottom: continue
                near = min(recs, key=lambda r: abs(r['_y'] - ln['y']))
                if abs(near['_y'] - ln['y']) > 30: continue
                byc = split_cols(ln)
                for i, c in enumerate(cols):
                    if c[0] in ('code', 'profile') or not byc.get(i): continue
                    near.setdefault('_frag', []).append((ln['y'], c[0], join_words(byc[i])))
        for r in recs:
            # rebuild multi-line cells in top-to-bottom order (code line value included)
            frags = r.pop('_frag', [])
            for key in {k for _, k, _ in frags}:
                parts = sorted([(y, v) for y, k, v in frags if k == key] + ([(r['_y'], r[key])] if r.get(key) else []))
                r[key] = (', ' if key == 'finish' else ' ').join(v for _, v in parts)
            r.pop('_y', None)
        records.extend(recs); added = len(recs)
        tables_log.append({'page': pn, 'table': 'fallback', 'heading': heading, 'columns': [c[0] for c in cols], 'rows': added})

# Pages with product-like text but no parsed rows
parsed_pages = {r['page'] for r in records}
if MAKE_THUMBS: os.makedirs(THUMBS, exist_ok=True)
for pno in range(len(doc)):
    pn = pno + 1
    txt = doc[pno].get_text()
    if pn not in parsed_pages and re.search(r'\b1\d{6}\b', txt):
        gaps.append({'page': pn, 'issue': 'page has product codes but no table rows were parsed'})

# Thumbnails for profile-image cells (small, for identification only)
for r in records:
    bb = r.pop('_img', None)
    if not bb or not MAKE_THUMBS: continue
    key = (r['page'], bb)
    if key not in thumb_cache:
        pg = doc[r['page'] - 1]
        rect = pymupdf.Rect(*bb)
        if rect.width < 10 or rect.height < 10: continue
        imgs = [i for i in pg.get_image_info() if pymupdf.Rect(i['bbox']).intersects(rect)]
        drawings = [d for d in pg.get_drawings() if rect.contains(d['rect']) and d['rect'].width < rect.width - 2]
        if not imgs and not drawings:
            thumb_cache[key] = None; continue
        name = f"p{r['page']}_{int(bb[0])}_{int(bb[1])}.png"
        pix = pg.get_pixmap(clip=rect + (1.5, 1.5, -1.5, -1.5), dpi=110)
        pix.save(os.path.join(THUMBS, name))
        thumb_cache[key] = f'img/thumbs/{name}'
    if thumb_cache[key]: r['img'] = thumb_cache[key]

json.dump({'source': 'Alspec Industrial Catalogue (Brendale / Chevallum)', 'pages': len(doc),
           'count': len(records), 'profiles': records, 'gaps': gaps, 'tables': tables_log},
          open(OUT, 'w'), indent=1)
print(len(records), 'records;', len(gaps), 'gaps')
