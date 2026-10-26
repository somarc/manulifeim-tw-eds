#!/usr/bin/env python3
"""Homepage importer: browser captures → DA document /index.

Inputs (structured captures, nothing is fetched): home/hero.json (carousel slides) and
home/sections.json (post-hero sections). Output: <DA workspace content root>/index.html.

Block shapes follow docs/CONTENT-MODEL.md:
  Carousel (hero)             one row per slide: [picture][h1|h2, p, p **link**]
  Cards (info)                one row per tile:  [h3, p, p link]
  Disclosure (small)          [p label][rich body]  (small = fine print)
  Cards (image)               one row per tile:  [picture][h3, p, p link]
  Article Cards (list, toggle) / (news)   config rows [Source][path], [Limit][n]
  Social                      one row per network: [:icon:][p link]
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CAPTURES, BeautifulSoup, block, clean, esc, image, link, page, section, site_path, write  # noqa: E402

HOME = CAPTURES / 'home'


def tidy(markup):
    """Source heading/paragraph HTML → authorable inline HTML.

    Drops the source's stray <br>, turns &nbsp; into spaces and moves edge spaces out of <em>
    so "<em> Alternative&nbsp;</em>Credit" becomes "<em>Alternative</em> Credit".
    """
    markup = re.sub(r'<br\s*/?>', ' ', markup)
    markup = markup.replace('&nbsp;', ' ').replace('\xa0', ' ')
    markup = re.sub(r'\s+', ' ', markup)
    markup = re.sub(r'<em>(\s*)(.*?)(\s*)</em>',
                    lambda m: f"{m.group(1)}<em>{m.group(2)}</em>{m.group(3)}", markup)
    markup = re.sub(r'\s+', ' ', markup)
    return markup.strip()


def text_html(value):
    return esc(tidy(value))


def para(inner):
    return f'<p>{inner}</p>'


def hero_section(hero):
    rows = []
    for slide in hero['slides']:
        level = 1 if slide['index'] == 0 else 2  # one h1 per page; every slide looks the same
        # decode_contents() keeps entities escaped ("L&amp;G"); headings carry only <em>/<br>
        heading = tidy(BeautifulSoup(slide['headingHTML'], 'html.parser').decode_contents())
        cta = slide['cta']
        copy = (f'<h{level}>{heading}</h{level}>'
                + para(text_html(slide['body']))
                + para(f"<strong>{link(esc(cta['label']), cta['href'])}</strong>"))
        rows.append([image(slide['image']['src'], slide['image'].get('alt') or ''), copy])
    return section(block('carousel hero', rows))


def intro_section(spec):
    body = tidy(clean(BeautifulSoup(spec['html'], 'html.parser')))
    return section(body, style='intro')


def capabilities_and_disclosure(caps, disc):
    tiles = [[f"<h3>{text_html(item['title'])}</h3>"
              + para(text_html(item['text']))
              + para(link(esc(item['link']['label']), item['link']['href']))]
             for item in caps['items']]
    # <small> does not survive DA → aem.page (the <sup> does), so the fine-print size is the
    # block's `small` variant; the source's <sup> raise is kept as authored.
    body = clean(BeautifulSoup(disc['html'], 'html.parser'))
    body = re.sub(r'</?small>', '', body.replace('\xa0', ' '))
    body = re.sub(r'\s+</p>', '</p>', re.sub(r' {2,}', ' ', body))
    return section(block('cards info', tiles),
                   block('disclosure small', [[para('Important disclosures'), body]]))


def sustainability_section(title, intro, cards):
    head = title['heading']
    cta = title['links'][0]
    rows = [[image(item['image']['src'], item['image'].get('alt') or ''),
             f"<h3>{text_html(item['title'])}</h3>"
             + para(text_html(item['text']))
             + para(link(esc(item['link']['label']), item['link']['href']))]
            for item in cards['items']]
    return section(f"<h2>{tidy(head['html'])}</h2>",
                   para(link(esc(cta['text']), cta['href'])),
                   para(text_html(intro['text'])),
                   block('cards image', rows),
                   style='title-row, display')


def listing_section(heading, cta_label, cta_href, variant, source, limit, style):
    config = [[para('Source'), para(esc(source))], [para('Limit'), para(str(limit))]]
    return section(f'<h2>{heading}</h2>',
                   para(link(esc(cta_label), cta_href)),
                   block(f'article-cards {variant}', config),
                   style=style)


def social_section(spec):
    rows = []
    for item in spec['social']:
        network = 'linkedin' if 'linkedin' in item['href'] else 'link'
        rows.append([para(f':{network}:'), para(link(esc(item['label']), item['href']))])
    return section(f"<h2>{tidy(spec['heading']['html'])}</h2>", block('social', rows),
                   style='display')


def main():
    hero = json.loads((HOME / 'hero.json').read_text())
    sections = {s['id']: s for s in json.loads((HOME / 'sections.json').read_text())['sections']}

    viewpoints = sections['latest-viewpoints']
    news = sections['latest-news-title']
    meta = {
        'Title': 'Institutional asset management | Manulife Investment Management',
        'Description': ('A leading global asset manager, we help investors by understanding and '
                        'managing risks and by helping them make the most of the investment '
                        'possibilities.'),
        'Image': image(hero['slides'][0]['image']['src']),
    }
    document = page([
        hero_section(hero),
        intro_section(sections['intro']),
        capabilities_and_disclosure(sections['capabilities'], sections['important-disclosures']),
        sustainability_section(sections['sustainability-title'], sections['sustainability-intro'],
                               sections['sustainability-cards']),
        listing_section('Latest viewpoints', viewpoints['header']['viewAll']['text'],
                        viewpoints['header']['viewAll']['href'], 'list toggle', '/viewpoints/', 3,
                        'title-row, inline-controls'),
        listing_section(esc(news['heading']['text']), news['links'][0]['text'],
                        news['links'][0]['href'], 'news', '/about-us/press-releases/', 4,
                        'title-row, display'),
        social_section(sections['stay-connected']),
    ], meta)
    target = write('/index', document)
    print(f'  links: viewpoints → {site_path(viewpoints["header"]["viewAll"]["href"])}')
    return target


if __name__ == '__main__':
    main()
