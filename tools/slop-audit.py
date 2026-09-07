#!/usr/bin/env python
"""Slop audit for one site folder: python tools/slop-audit.py
Checks visible copy and CSS for the AI-slop tells listed in the plan. Exit 1 on any failure."""
import re, sys, os, html, json

site = sys.argv[1] if len(sys.argv) > 1 else ''   # '' is the site at the repo root
root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), site)
fails, warns = [], []

def read(p):
    with open(p, encoding='utf-8') as f: return f.read()

htmlsrc = read(os.path.join(root, 'index.html'))
css = '\n'.join(read(os.path.join(root, f)) for f in os.listdir(root) if f.endswith('.css'))
css += '\n'.join(m for m in re.findall(r'<style[^>]*>(.*?)</style>', htmlsrc, re.S))

# visible text
body = re.sub(r'<(script|style|svg)[^>]*>.*?</\1>', ' ', htmlsrc, flags=re.S)
text = html.unescape(re.sub(r'<[^>]+>', ' ', body))
text = re.sub(r'\s+', ' ', text)

if '\u2014' in text: fails.append('em dash (U+2014) in visible text: ' + ' | '.join(s.strip() for s in re.findall(r'.{0,40}\u2014.{0,40}', text)[:5]))
for w in ['seamless', 'leverage', 'empower', 'elevate', 'next-gen', 'cutting-edge', 'passionate', 'built by hand', 'set in ', 'unleash', 'supercharge', 'innovative', 'synergy']:
    if re.search(r'\b' + re.escape(w), text, re.I): fails.append(f'buzzword/tic "{w}" in visible text')
for m in re.findall(r'[^.]{0,50}, not [^.]{0,50}', text):
    warns.append('"X, not Y" cadence: ' + m.strip())
if re.search(r'\b\d{2}\s*[\u2014\u2013-]\s*[A-Z]', text): warns.append('possible numbered section label like "01 - Projects"')

# nav labels vs section headings
nav = re.findall(r'<nav[^>]*>(.*?)</nav>', htmlsrc, re.S)
navlabels = [re.sub(r'<[^>]+>', '', a).strip() for n in nav for a in re.findall(r'<a[^>]*>(.*?)</a>', n, re.S)]
h2s = [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', h))).strip() for h in re.findall(r'<h2[^>]*>(.*?)</h2>', htmlsrc, re.S)]
for l in navlabels:
    if l and l.lower() not in [h.lower() for h in h2s] and l.lower() not in ('cv', 'about', 'research', 'contact', 'projects', 'paper', 'background'):
        warns.append(f'nav label "{l}" has no matching h2 (h2s: {h2s})')

# CSS checks
def cssfail(pattern, msg, flags=re.I):
    for m in re.finditer(pattern, css, flags):
        line = css[:m.start()].count('\n') + 1
        fails.append(f'{msg} (css line {line}): {m.group(0).strip()[:80]}')
cssfail(r'text-transform\s*:\s*uppercase', 'uppercase text-transform')
for m in re.finditer(r'letter-spacing\s*:\s*(-?[\d.]+)(em|px)', css):
    v, u = float(m.group(1)), m.group(2)
    if (u == 'em' and v > 0.02) or (u == 'px' and v > 0.5): fails.append(f'tracked letter-spacing {m.group(0)}')
    if (u == 'em' and v < -0.03): fails.append(f'crushed letter-spacing {m.group(0)}')
for m in re.finditer(r'border-radius\s*:\s*([^;]+);', css):
    vals = re.findall(r'([\d.]+)(px|rem|em|%)', m.group(1))
    for v, u in vals:
        if (u == 'px' and float(v) > 2) or (u in ('rem', 'em') and float(v) > 0.13) or (u == '%' and float(v) > 0): fails.append(f'border-radius above 2px: {m.group(0).strip()}')
cssfail(r'box-shadow\s*:\s*(?!none)', 'box-shadow')
cssfail(r'(linear|radial|conic)-gradient\(', 'gradient')
cssfail(r'backdrop-filter', 'backdrop-filter (glass)')
cssfail(r'filter\s*:[^;]*blur\(', 'blur filter')
cssfail(r'font-family\s*:[^;]*(Inter|Geist|Space Grotesk|Instrument Serif|Playfair|Roboto Mono|monospace)', 'slop typeface or monospace')
cssfail(r'animation-timing-function\s*:[^;]*(bounce|elastic)|cubic-bezier\([^)]*,\s*(1\.[1-9]|[2-9])[^)]*\)', 'bounce/elastic easing')
cssfail(r'transition\s*:\s*all\b', 'transition: all')
# purple / indigo hexes
def hue(hexs):
    h = hexs.lstrip('#'); h = ''.join(c*2 for c in h) if len(h) == 3 else h
    r, g, b = (int(h[i:i+2], 16)/255 for i in (0, 2, 4)); mx, mn = max(r, g, b), min(r, g, b); d = mx - mn
    if d == 0: return 0, 0
    if mx == r: hh = ((g-b)/d) % 6
    elif mx == g: hh = (b-r)/d + 2
    else: hh = (r-g)/d + 4
    return hh*60, d/mx
for m in re.finditer(r'#(?:[0-9a-fA-F]{3}){1,2}\b', css + htmlsrc):
    hh, s = hue(m.group(0))
    if 240 <= hh <= 300 and s > 0.25: fails.append(f'purple/indigo colour {m.group(0)}')

print(f'== slop audit: /{site}/ ==')
for f in fails: print('FAIL', f)
for w in warns: print('warn', w)
print(f'{len(fails)} fail, {len(warns)} warn; h2s={h2s}; nav={navlabels}')
sys.exit(1 if fails else 0)
