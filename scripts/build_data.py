#!/usr/bin/env python3
"""Turn data/raw.json (from extract.py) into data/profiles.json used by the app.
Only tidies/normalises what was printed: groups sections into browse categories,
parses numeric copies of printed dimensions for filtering, fixes obvious extraction
artefacts (heading glyph loss, text spill between columns). Prices are not captured."""
import json, re, collections

raw = json.load(open('data/raw.json'))

SECTION_FIX = {
    '': 'SIGNPANEL - ACM COMPOSITE PANEL',      # p9 heading is an image
    '*': 'ROUTERED BOX',                        # p35 heading text is "ROUTERED BOX * *"
    'ARAVAN TRIM': 'CARAVAN TRIM',              # first glyph clipped in text layer
}
# (category id, label, blurb, icon, matcher on section/page)
CATS = [
    ('flat-bar', 'Flat bar', 'Mill & anodised flat', 'flat', lambda s, p: s == 'FLAT BAR'),
    ('bar-rod', 'Square bar & round rod', 'Solid bar', 'rod', lambda s, p: s in ('SQUARE BAR', 'ROUND ROD')),
    ('angle', 'Angle', 'Equal, unequal & structural', 'angle', lambda s, p: 'ANGLE' in s),
    ('channel', 'Channel', 'U-channel 6060-T5', 'channel', lambda s, p: s == 'CHANNEL'),
    ('tee', 'Tee section', 'T-bar', 'tee', lambda s, p: s.startswith('TEE')),
    ('round-tube', 'Round tube', 'Tube & structural tube', 'tube', lambda s, p: s.startswith('ROUND TUBE')),
    ('shs', 'Square hollow (SHS)', 'Square & radius corner', 'shs', lambda s, p: 'SQUARE' in s and 'BOX' in s),
    ('rhs', 'Rectangular hollow (RHS)', 'Square & radius corner', 'rhs', lambda s, p: 'RECT' in s and 'BOX' in s),
    ('sheet-plate', 'Sheet, plate & coil', '5005, 5052, 5083, tread, pattern', 'sheet', lambda s, p: 6 <= p <= 12 and not any(k in s for k in ('MESH', 'GRILLE'))),
    ('mesh', 'Mesh & grille', 'Alugard, security, expanded, walkway', 'mesh', lambda s, p: any(k in s for k in ('MESH', 'GRILLE', 'WALKWAY'))),
    ('fencing', 'Fencing, slats & gates', 'DuraSlat, slat, routered, spear, gate', 'fence', lambda s, p: 31 <= p <= 36),
    ('balustrade', 'Balustrade', 'EndurAl & balustrade sections', 'balustrade', lambda s, p: 37 <= p <= 43),
    ('louvre', 'Louvres & battens', 'CityScape, Solaire, blades', 'louvre', lambda s, p: 44 <= p <= 53),
    ('patio', 'WideSpan patio', 'Beams, connectors, endcaps', 'patio', lambda s, p: 54 <= p <= 57),
    ('coolroom', 'Coolroom', 'Annexe sections', 'coolroom', lambda s, p: 58 <= p <= 60),
    ('transport', 'Transport', 'Rub rails, tray & body sections', 'transport', lambda s, p: 61 <= p <= 64),
    ('facade', 'Façade', 'Top hats & façade sections', 'facade', lambda s, p: 65 <= p <= 66),
    ('misc', 'Misc extrusions', 'Seating, stairs, planks, trims, skirting', 'misc', lambda s, p: 67 <= p <= 75),
    ('hardware', 'Hardware & fittings', 'Hinges, paint, gate fittings, welding, brackets', 'hardware', lambda s, p: 76 <= p <= 83),
    ('endcaps', 'End caps, bends & joiners', 'CNC & plastic caps, mandrel bends', 'endcap', lambda s, p: 84 <= p <= 87),
]

def f(v):
    v = (v or '').strip()
    m = re.fullmatch(r'\d+(?:\.\d+)?', v)
    return float(v) if m else None

out = []; seen = collections.Counter()
for r in raw['profiles']:
    r = dict(r)
    sec = SECTION_FIX.get(r['section'], r['section'])
    r['section'] = sec
    if r.get('_desc_prefix'):
        r['description'] = (r.pop('_desc_prefix') + ' ' + r.get('description', '')).strip()
    # collapse ghost-text doubling ("200g 200g", "x x") left by overlaid text runs in the PDF
    if r.get('description'):
        t = r['description'].split(); r['description'] = ' '.join(w for i, w in enumerate(t) if i == 0 or w != t[i - 1])
    # p30: alloy+temper printed in the description cell spills its temper into the W column ("T5 75.00")
    for k in ('w', 'h', 'th', 'dia'):
        m = re.fullmatch(r'([TH]\d+)\s+(\d+(?:\.\d+)?)', (r.get(k) or '').strip())
        if m:
            r[k] = m.group(2); r['description'] = (r.get('description', '') + ' ' + m.group(1)).strip()
    fin = (r.get('finish') or '').strip('*').strip()
    if ', RAD,' in fin:                  # p57 description word "RAD" spilled into the finish column
        fin = fin.replace(', RAD,', ','); r['description'] = r.get('description', '').replace('2mm ALUMINIUM', '2mm RAD ALUMINIUM')
    r['finish'] = fin
    if re.search(r'(^|, )CNC ', r.get('finish') or ''):   # p57 description word spilled into finish column
        r['description'] = (r.get('description', '') + ' CNC').strip(); r['finish'] = re.sub(r'(^|, )CNC ', r'\1', r['finish'])
    if r['page'] == 84 and not r.get('description'):
        r['description'] = f"CNC ALUMINIUM ENDCAP {r['code']}"; r['size'] = r['code']; r['code'] = ''
    cat = next((c for c in CATS if c[4](sec.upper(), r['page'])), None)
    r['cat'] = cat[0] if cat else 'other'
    for k in ('w', 'h', 'th', 'dia', 'radius', 'kgm', 'length', 'kg_sheet'):
        if k in r: r[k + '_n'] = f(r[k])
    # wall thickness used for filtering = TH column (or WALL column)
    r['wall_n'] = r.get('th_n') if r.get('th_n') is not None else f((r.get('wall') or '').replace('mm', ''))
    # sheet-size style dims printed as "3.0mm 1220 x 2440"
    al = (r.get('alloy') or '')
    if not al:
        m = re.search(r'\b(\d{4}[A-Z]?)\s*-?\s*([TH]\d+)\b', r.get('heading', '') + ' ' + (r.get('description') or ''))
        if m: al = f'{m.group(1)}-{m.group(2)}'
    else:
        al = re.sub(r'\s+', '-', al.strip())
    r['alloy'] = al
    if r.get('length') and not re.search(r'[a-zA-Z]', r['length']): r['length_mm'] = r['length']
    key = (r['code'] or r.get('size', ''), r.get('finish', ''), r['page'])
    seen[key] += 1
    r['id'] = re.sub(r'[^A-Za-z0-9-]+', '', f"{r['code'] or 'x'+(r.get('size') or '')}-{r['page']}-{seen[key]}-{(r.get('finish') or '')[:12]}")
    out.append(r)

cats = []
for c in CATS:
    items = [r for r in out if r['cat'] == c[0]]
    if not items: continue
    pages = sorted({r['page'] for r in items})
    cats.append({'id': c[0], 'label': c[1], 'blurb': c[2], 'icon': c[3], 'count': len(items),
                 'pages': [pages[0], pages[-1]], 'sections': sorted({r['section'] for r in items}, key=lambda s: min(r['page'] for r in items if r['section'] == s))})
other = [r for r in out if r['cat'] == 'other']
data = {'source': raw['source'], 'pdf_pages': raw['pages'], 'generated_by': 'scripts/extract.py + scripts/build_data.py',
        'count': len(out), 'categories': cats, 'profiles': out,
        'pdf_url': 'https://www.alspec.com.au/wp-content/uploads/2024/07/Alspec-Industrial-Catalogue-Brendale-Chevallum.pdf',
        'gaps': [g for g in raw['gaps'] if g['page'] not in {r['page'] for r in out}]}
json.dump(data, open('data/profiles.json', 'w'), separators=(',', ':'))
print(len(out), 'profiles;', len(cats), 'categories; uncategorised:', len(other))
for c in cats: print(f"  {c['label']:28} {c['count']:4}  p{c['pages'][0]}-{c['pages'][1]}")
for r in other[:10]: print('  OTHER', r['page'], r['section'])
