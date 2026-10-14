---
title: "Private label: writing the listing"
summary: Give the brand, key specs and uses, let Claude write the title, five bullets, description and backend search terms from Gate 4's complaint themes and your search terms, held to a Checks list and repaired once automatically, then export a Seller Central flat-file row.
synonyms: [listing, listing writer, brand name, key specs, suitable for, not for, claims to avoid, checks, repair, needs proof, title, bullets, bullet points, description, backend, search terms, generic keywords, flat file, seller central, compliance, keyword coverage, brand voice, copywriting, claude]
workspace: pl
order: 6
---
Each candidate has a **Listing** section under Suppliers and Quotes. It writes the Amazon listing from what you've already captured, so the bullets answer the complaints buyers have about the products on page one and the title carries the search terms people actually use. The Launch checklist's **Listing written** step links straight to it.

## What it's written from

Nothing new is captured. The listing is written from:

- **Gate 4**: the complaint themes mined from the page-one ASINs' reviews (with their share of the negative reviews), the theme you picked for the gate, and the Claude summary if you ran one. Themes marked *ignore* or *not fixable* are left out. See [Private label: mining reviews](/help/howto/pl-mining-reviews).
- **Gates 3 and 5**: the search terms from the attached Opportunity Explorer capture, with search volume and conversion, plus the keyword bank of the Ads product linked to the candidate, if there is one.
- **The candidate**: its name, niche keyword, sell price and notes.
- **Competitor brands**: the brand list in **Settings → Private label**, plus the brands of the candidate's page-one ASINs (ZEISS, Opticlear…), so a rival's name never gets into the copy or the backend terms.
- **The settings at the top of the section**, saved with the candidate as you leave each box:
  - **Brand name** (required): the title starts with it.
  - **Brand voice** (default *premium, clean, simple, no hype*), **pack size** and **title limit** (default 200 characters).
  - **Key specs**, one fact per line (*70% isopropyl alcohol*, *wipe 12 × 15 cm*, *200 individually wrapped sachets*). They start from the candidate's own specs until you save them here. They're the evidence the bullets use, and the description must mention every one.
  - **Suitable for** and **Not for**, as comma lists. The first three uses go in the title; one bullet states both lists.
  - **Claims to avoid**: never written, and flagged in compliance wherever they appear (even when the notes say certified).

The line under the settings says how many themes and search terms it has to work with. With neither, mine some reviews or attach a capture first.

## Write it

**Write the listing** sends all of that to Claude (the model set in Settings → Ads) with these rules, and the same rules are checked in code afterwards:

- **Title**: the brand, then the highest-volume search term, the pack size, *Individually Wrapped* when a spec says so, and the top three uses. The brand, top term and pack size come within the first 80 characters. It aims for 120–180 characters and is never over the limit. Under 100 characters, the length check shows an amber warning, but a short title isn't a failure and isn't sent for repair. It's in Title Case, with no ALL CAPS words and no promo words (*best*, *#1*, *free*, *sale*, *guaranteed*). No word appears twice except the product noun (*wipes*), which may appear twice; plurals count as the same word. Words inside the pack size (*200 Wipes*) or a top 3 search phrase said word for word (*Lens Wipes for Glasses*) don't count at all, the first time each appears. A word may also appear a second time when one mention is part of one of the top 3 search phrases by volume, with at most one word between its words: *Lens Cleaning Wipes* carries *lens wipes*, so it can sit alongside *Camera Lenses*. The title should include one of those phrases besides the lead term when it fits. When a use repeats a title word (*Glasses Wipes … for Glasses*), the second becomes the highest-volume synonym from your search terms (*Spectacles*, from *spectacle wipes*).
- **Five bullets**, each 150–250 characters, each opening with a 2–4 word CAPITALISED header and a colon (*STAYS MOIST: …*):
  - each has its own job: **1** answers the theme you picked in Gate 4, **2** the cleaning result, **3** size and feel, **4** the key specs no other bullet has stated, **5** what it's suitable for and not for;
  - between them, the bullets answer every real complaint at 4% or more of negative reviews (*too dry*, *leaves streaks*, *too small*; not vague ones like *not good*), using the key specs as the evidence;
  - every key spec appears in some bullet, but in no more than two, and no phrase of three or more words appears in two bullets.
- **Claims at spec strength**: no number, timing or duration unless it's in Key specs or Pack size. If the spec says *quick-drying*, the copy says *quick-drying*, not *dries in seconds*. Performance claims the specs don't state are softened (*helps reduce streaks*, *designed to*, *sealed to help keep moist*), never absolute: *streak-free*, *without leaving streaks*, *never*, *always*, *guaranteed*, *100%* and *every time* are flagged unless Key specs use them. There are no claims about how it performs over time either (*as moist next year as today*).
- **Description**: three short paragraphs that mention every key spec once.
- **Backend search terms**: lowercase, 200–249 bytes. Nothing already in the title (plurals count), no filler (*of, and, for, the, with, pack, a, to, in*), no competitor brands, no ASINs, no *Not for* words, and no health or body words (*eye, eyes, skin, medical*…) unless they're in Suitable for. Every word must relate to the product, its uses or the search terms: variants like *eyeglasses*, *specs*, *sachets*, *screens*, *tissues* or *premoistened* pass, but unrelated objects (*television*, *jewellery*, *telescope*) are taken out. Under 200 bytes after cleaning, the code tops them up itself, to 200 bytes:

1. the unused words of your search terms (highest volume first), keyword bank and Suitable for list;
2. then the plural or singular of words already there (*phone*/*phones*, *tissue*/*tissues*; not *specs*, *eyewear* or *premoistened*);
3. then other names for the product (*tissues*, *towelettes* and *cloths* for wipes).

Every added word passes the same exclusions. The repair call is used only when the code can't reach 200.
- **Differentiation angle**: two or three sentences tying the top complaints to how this product is better.

**What happens after the call:**

1. **Fixed in code**: the brand moved to the front, Title Case applied, promo words taken out, a repeated use swapped for its search-term synonym, the title cut at a word to the limit, bullet headers put in capitals, and the backend terms cleaned (unrelated words too) and filled.
2. **Checked**: the **Checks** list holds the draft to every rule above, plus compliance.
3. **Repaired once**: if a hard rule still fails (warnings, shown amber, don't count), a single follow-up call sends only the failures and the draft, and Claude fixes just those. Its answer is fixed in code and checked again, and that's the version saved.

Whatever still fails after that shows red in Checks, for you to finish by hand or with **Regenerate** on the field.

Under **Regenerate all**, the last model run stays on show:

- its version and time;
- the calls it made, with tokens in, out and thinking, and its £ cost;
- whether a repair ran, and for which rules;
- whether the backend terms were topped up in code.

Nothing is sent until you click. Both calls are logged with their tokens and £ cost (the toast shows the total), and each is cached by its inputs: clicking again with nothing changed returns the stored answers without new calls. **Regenerate all** asks again with fresh calls.

## Edit it

Every field is editable, with a live counter (characters; bytes for the backend terms) that turns red when it's over. The checks run as you type:

- **Style**: the title over its limit or not leading with the lead term, words in ALL CAPS, promo words (*best*, *#1*, *free*, *sale*, *guaranteed*), a bullet without a capitalised benefit opener, fewer than three bullets on a complaint theme, and backend terms over 249 bytes.
- **Compliance**, each with a suggested rewrite: *antibacterial*, *kills 99.9%*, *disinfect*, *sterile*, *medical grade*, *FDA*, *cure*, any competitor brand, and everything on the candidate's **Claims to avoid**. *Eco-friendly*, *biodegradable* and *plastic-free* are flagged unless the candidate's notes say the product is certified (or they're on Claims to avoid).
- **Checks**: every rule from *Write it* above, passed or failed, with what's wrong.
- **Needs proof**: any sentence that promises how the product performs (*streak-free*, *stays moist*, *quick-drying*, *3-year shelf life*, *safe on coatings*) is highlighted once, under its own field (a bullet's under that bullet), with "verify with samples before publishing". It doesn't block anything: it's a reminder to test the samples before the listing goes live.

**Regenerate** next to a field rewrites only that field, keeping the rest of your listing as it is (a new model call each time).

## Keyword coverage

The table lists every search term with its monthly volume and conversion, and ticks whether it appears in the title, the bullets or the backend terms. The **coverage %** is the share of the total search volume that's covered anywhere, so a missing big term costs more than a missing small one. Uncovered terms are shaded. Click any heading to sort.

## Versions, copy and export

Every generation, field rewrite, saved edit and restore is a **version**. **Save as a version** keeps your edits; **Versions** lists them all with their source and time, and **Restore** brings an earlier one back as a new version (nothing is overwritten).

**Copy all** copies the whole listing as plain text. **Flat-file row** downloads a tab-separated file with the Seller Central columns *item_name*, *bullet_point1* to *bullet_point5*, *product_description* and *generic_keywords*: paste the row into your category's inventory file template.
