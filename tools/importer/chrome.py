#!/usr/bin/env python3
"""Site chrome importer: writes the DA documents /nav, /footer and /fragments/disclaimer.

Inputs: browser captures under CAPTURES/home/raw (header, sidebar, site banner, region modal,
footer, Taiwan disclaimer). Output: the da-cli content root only (see common.write).

Document shapes (the header/footer blocks and scripts/disclaimer.js read them; see
docs/blocks/chrome.md):

/nav            section 1 brand    desktop logo picture, mobile (stacked) logo picture, home link
                section 2 rail     one list; item = link with :icon: + label, or (Capabilities)
                                   :icon: + label text with a nested list of fly-out links
                section 3 tools    search link (text = placeholder, href = results page),
                                   :user: Log in, Register for access (plain text = no auth link)
                section 4 regions  current region (:globe: Taiwan), h2 title, h3 group + list
                section 5 alert    the dismissible site banner paragraph
/footer         section 1          logo picture + link list
                section 2          copyright paragraphs + bold legal link list
/fragments/disclaimer
                section 1          h2 title, then the scrollable legal text
                section 2          Cancel link, I agree (bold), Change region link
"""
import re

from common import (CAPTURES, BeautifulSoup, clean, esc, image, page, section, site_path,
                    text, write)

RAW = CAPTURES / 'home' / 'raw'

# The dark (navy) icon variants are authored so the icons stay visible when /nav is edited in
# DA or Canvas; the header paints every rail icon as a CSS mask, so its colour comes from CSS.
RAIL_ICONS = {
    'Dashboard': 'rail-dashboard-dark',
    'Capabilities': 'rail-capabilities-dark',
    'Viewpoints': 'rail-viewpoints-dark',
    'About Us': 'rail-about-dark',
    'Sustainability': 'rail-sustainability-dark',
    'Contact Us': 'rail-contact-dark',
}


def soup(name):
    return BeautifulSoup((RAW / name).read_text(), 'html.parser')


def a(label, href):
    return f'<a href="{esc(site_path(href))}">{label}</a>'


def nav_document():
    header = soup('header.html')
    sidebar = soup('sidebar.html')
    banner = soup('site-banner.html')
    regions = soup('region-modal.html')

    # 1 brand: desktop logo, mobile stacked logo, home link
    desktop = header.select_one('.header__logo--desktop')
    mobile = header.select_one('.header__logo--mobile')
    brand = section(
        f'<p>{image(desktop["src"], "Manulife Investment Management")}</p>',
        f'<p>{image(mobile["src"], "Manulife Investment Management")}</p>',
        f'<p>{a("Home", header.select_one(".header__logoLink")["href"])}</p>',
    )

    # 2 rail
    items = []
    for li in sidebar.select('li.sidebar__element:not(.sidebar__element--top):not(.sidebar__element--mobile)'):
        trigger = li.select_one('.sidebar__link')
        label = text(trigger.select_one('span'))
        icon = RAIL_ICONS.get(label, '')
        icon_text = f':{icon}: ' if icon else ''
        subnav = li.select('.subnav__link')
        if subnav:
            sub = ''.join(f'<li>{a(text(s), s["href"])}</li>' for s in subnav)
            items.append(f'<li>{icon_text}{esc(label)}<ul>{sub}</ul></li>')
        else:
            items.append(f'<li>{a(icon_text + esc(label), trigger["href"])}</li>')
    rail = section(f'<ul>{"".join(items)}</ul>')

    # 3 tools: search (placeholder text + results page), log in, register
    search_box = header.select_one('atomic-search-box')
    search_href = search_box.get('redirection-url') if search_box else '/search'
    login = text(header.select_one('.header__cps-login .header__buttonCaption')) or 'Log in'
    register = text(header.select_one('.header__cps-register .header__buttonCaption')) or 'Register for access'
    # Login/Register open auth dialogs on the source (currently unavailable, see the alert), so
    # they are authored as plain text: the header renders an honest "unavailable" notice.
    # Authoring a link on either paragraph turns it into a normal link.
    tools = section(
        f'<p>{a("Search", search_href)}</p>',
        f'<p>:user: {esc(login)}</p>',
        f'<p>{esc(register)}</p>',
    )

    # 4 regions: current region, title, groups (destination = each region's "I agree" link)
    current = text(header.select_one('.language__trigger span')) or 'Taiwan'
    dest = {}
    for sec in regions.select('section.attestation'):
        title = text(sec.select_one('.region-select__title'))
        m = re.search(r'\((.+)\)', title)
        agree = sec.select_one('a.attestation__accept')
        if m and agree:
            dest[m.group(1).strip()] = agree['href']
    parts = [f'<p>:globe: {esc(current)}</p>']
    list_title = regions.select_one('.region-select__title')
    parts.append(f'<h2>{esc(text(list_title) or "Select a location")}</h2>')
    # The source shows each region's own disclaimer beside the list; those texts belong to the
    # other regional sites, so the decision pane shows this note and a Continue link instead.
    parts.append('<p>You are about to leave the Taiwan institutional site. Each location has its '
                 'own website, terms of use and disclaimer, which you will be asked to accept '
                 'there.</p>')
    for label in regions.select('.region-select__group-label'):
        group = label.find_parent(lambda t: t.name in ('div', 'li', 'section') and t.select('.region-select__country-link'))
        names = [text(b) for b in group.select('.region-select__country-link')] if group else []
        links = ''.join(f'<li>{a(esc(n), dest[n])}</li>' if n in dest else f'<li>{esc(n)}</li>' for n in names)
        parts.append(f'<h3>{esc(text(label))}</h3><ul>{links}</ul>')
        missing = [n for n in names if n not in dest]
        if missing:
            print(f'  ! no destination for regions: {missing}')
    region_section = section(''.join(parts))

    # 5 alert banner
    alert = section(f'<p>{esc(text(banner.select_one(".siteBanner__text")))}</p>')

    return page([brand, rail, tools, region_section, alert])


def footer_document():
    footer = soup('footer.html')
    logo = footer.select_one('.footer__upper-part__image img')
    links = []
    for link in footer.select('.footer__upper-part__menus a'):
        links.append(f'<li>{a(esc(text(link)), link["href"])}</li>')
    upper = section(
        f'<p>{image(logo["src"], "Manulife Investment Management")}</p>',
        f'<ul>{"".join(links)}</ul>',
    )
    copy = clean(footer.select_one('.footer__copyrights--header'))
    legal = ''.join(f'<li><strong>{a(esc(text(link)), link["href"])}</strong></li>'
                    for link in footer.select('.footer__copyrights__element a'))
    lower = section(copy, f'<ul>{legal}</ul>')
    return page([upper, lower])


def disclaimer_document():
    src = soup('disclaimer-tw.html')
    title = text(src.select_one('.region-select__title'))
    body = clean(src.select_one('.attestation__text'))
    body = re.sub(r'<strong>\s*(&nbsp;|\xa0)?\s*</strong>', ' ', body)
    body = body.replace('\xa0', ' ')
    cancel = src.select_one('a.attestation__cancel')
    agree = text(src.select_one('.attestation__accept')) or 'I agree'
    change = text(src.select_one('.attestation__region-select-link')) or 'Change region'
    text_section = section(f'<h2>{esc(title)}</h2>', body)
    # "Change region" falls back to manulifeim.com (the global location chooser) without JS;
    # scripts/disclaimer.js swaps the dialog to the /nav region list instead.
    actions = section(
        f'<p>{a(text(cancel) or "Cancel", cancel["href"])}</p>',
        f'<p><strong>{esc(agree)}</strong></p>',
        f'<p>{a(esc(change), "https://www.manulifeim.com/")}</p>',
    )
    return page([text_section, actions])


def main():
    write('/nav', nav_document())
    write('/footer', footer_document())
    write('/fragments/disclaimer', disclaimer_document())


if __name__ == '__main__':
    main()
