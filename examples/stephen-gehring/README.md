# Stephen Gehring

A personal brand for a creative director and product designer: a loud cyan band, black capitals, and quiet, well-set text underneath. Confident at the top, precise below.

## Content fundamentals

- Lead with a short, declarative claim in capitals that ends with a full stop: “CREATIVITY THAT MOVES BUSINESS.” Three short lines, no more.
- Let other people praise the work. Pair the headline with one testimonial, attributed by name in caps and title in caps: “MEGHAN MITCHELL-MARKS / CHIEF MARKETING OFFICER, AXONIUS”.
- Write in first person (“I”, “my”) in letters. Write resume entries without a subject (“Led creative direction across…”, “Built and led…”).
- Join a company and its role with an em dash: “Palo Alto Networks — Senior UX/UI Designer”. Join disciplines with a spaced slash: “PRODUCT DESIGN / UX & UI / DESIGN SYSTEMS / MOTION”. Separate inline lists with a bullet: “UX/UI & Product Design • Design Systems”.
- Use capitals for headlines, labels, eyebrows and footers; title case for company names; sentence case for body copy.
- No emoji, no exclamation marks.

## Visual foundations

**Colour.** `brand-cyan` is the brand. Use it as one full-bleed band across the top of the page (`band-height`), never as a small accent. On it set only `ink`: the logo, `eyebrow`, `headline` and `pull-quote`. Below the band the ground is `surface`. Set display type and labels in `ink`, Montserrat running text in `ink-body`, and the second half of a heading line (role, dates) in `ink-muted`. `accent-dash` appears only as the em-dash marker before a career entry; it is decorative and too light for text or icons.

**Type.** Three families with clear jobs:

- `display` (Decimal) for everything structural: `headline`, `title`, `subject`, `section-head`, `subhead`, `entry-company`, `entry-role`, `eyebrow`, `label`, `footer`. Mostly capitals.
- `sans` (Montserrat) for resume text and details: `body-sans`, `list-item`, `detail`, the header `pull-quote`, and testimonial attributions.
- `serif` (Merriweather Light) for long-form letter text: `body-serif`, with inline testimonials in `quote-serif`.

Use Decimal only where it is installed: it is a licensed Hoefler&Co face and no font file ships with this system. The `display` stack falls back to Montserrat. Montserrat and Merriweather load from Google Fonts.

Sizes come from a US Letter print layout (1pt = 1.333px). Keep their ratios when scaling for screen.

**Layout.** Two columns under the band, divided by a vertical `rule-divider` at `border-rule`: a narrow sidebar of labelled facts (contact, skills, tools) and a wide main column. Page margins are `space-margin`; the column gap is `space-gutter`. Separate sections with a full-width `rule-hairline` at `border-hairline`. Close every page with a footer: name left, SGEHRING.COM right, in `footer`, above a `rule-divider` line.

**Entries.** Start each career entry with an `accent-dash` em dash, then `entry-company` in `ink` and `entry-role` in `ink-muted`, date range right-aligned in `entry-role`. Indent the description by `space-indent`, and bullets by another `space-indent`.

**Testimonials.** In the band: a large opening quote mark in `ink`, the quote in `pull-quote`, then the name and title beside a short vertical `ink` bar. In letter text: `quote-serif` between two `rule-hairline` lines, attribution below in `attribution-name` and `attribution-role`.

**Shape and depth.** Corners are square (`radius-none`). No shadows, gradients, textures or photography. Hierarchy comes from size, weight, capitals and the cyan band alone.

## Iconography

There is no icon set. The only marks are typographic: the em dash entry marker, the small bullet (•) in lists, and the oversized opening quote mark. Do not add icons.

## Logo

Use `stephen-gehring-logo-black.svg` (Logos group) in `ink` on `brand-cyan` or `surface`, top-left inside the band, aligned to `space-margin`. It is the angled ribbon symbol with STEPHEN set light over GEHRING set bold. Do not redraw, recolour or separate the symbol from the name. Only the black version is supplied.
