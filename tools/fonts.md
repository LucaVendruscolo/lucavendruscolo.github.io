# Fonts

The site self-hosts its fonts from `/fonts/`. The files are the latin-subset variable woff2 files that Google Fonts serves for the axis ranges below. No build step; if a font needs refreshing, re-run the commands.

Google Fonts only returns woff2 with `unicode-range` when the request carries a browser User-Agent, so `-A` is required.

```sh
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"

# Archivo (wdth 100..112, wght 400..600) + Literata (wght 400..600, roman and italic)
curl -sS -A "$UA" "https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..112,400..600&family=Literata:ital,wght@0,400..600;1,400..600&display=swap"
```

In each CSS response, take the `src: url(...)` of the block whose `unicode-range` starts with `U+0000-00FF` (the latin subset) and save it as:

| File | Family | Axes kept |
|---|---|---|
| `archivo-latin.woff2` | Archivo | wdth 100..112, wght 400..600 |
| `literata-latin.woff2` | Literata roman | wght 400..600 |
| `literata-latin-italic.woff2` | Literata italic | wght 400..600 |

Licences: both are SIL Open Font License 1.1 (Archivo by Omnibus-Type, Literata by TypeTogether).

Check axes after downloading:

```sh
python -c "from fontTools.ttLib import TTFont; import glob; [print(f, [(a.axisTag,a.minValue,a.maxValue) for a in TTFont(f)['fvar'].axes]) for f in glob.glob('fonts/*.woff2')]"
```
