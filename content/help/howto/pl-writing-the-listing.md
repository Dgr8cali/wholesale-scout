---
title: "Private label: writing the listing"
summary: Let Claude write the title, five bullets, description and backend search terms from Gate 4's complaint themes and your search terms, then edit them with live counters, compliance checks and a keyword coverage table, and export a Seller Central flat-file row.
synonyms: [listing, listing writer, title, bullets, bullet points, description, backend, search terms, generic keywords, flat file, seller central, compliance, keyword coverage, brand voice, copywriting, claude]
workspace: pl
order: 6
---
Each candidate has a **Listing** section under Suppliers and Quotes. It writes the Amazon listing from what you've already captured, so the bullets answer the complaints buyers have about the products on page one and the title carries the search terms people actually use. The Launch checklist's **Listing written** step links straight to it.

## What it's written from

Nothing new is captured. The listing is written from:

- **Gate 4**: the complaint themes mined from the page-one ASINs' reviews (with their share of the negative reviews), the theme you picked for the gate, and the Claude summary if you ran one. Themes marked *ignore* or *not fixable* are left out. See [Private label: mining reviews](/help/howto/pl-mining-reviews).
- **Gates 3 and 5**: the search terms from the attached Opportunity Explorer capture, with search volume and conversion, plus the keyword bank of the Ads product linked to the candidate, if there is one.
- **The candidate**: its name, niche keyword, sell price, specs and notes.
- **Three settings** at the top of the section: the **brand voice** (default *premium, clean, simple, no hype*), the **pack size**, and the **title limit** (default 200 characters). Each is saved with the candidate.

The line under the settings says how many themes and search terms it has to work with. With neither, mine some reviews or attach a capture first.

## Write it

**Write the listing** sends all of that to Claude once (the model set in Settings → Ads) and returns:

- a **title** that leads with the highest-volume relevant search term;
- **five bullets**, each opening with a short capitalised benefit, at least three answering a Gate 4 complaint theme;
- a **description**;
- **backend search terms**: lowercase, space-separated, at most 249 bytes;
- a **differentiation angle**: two or three sentences tying the top complaints to how this product is better.

Nothing is sent until you click. Every call is logged with its tokens and £ cost (the toast shows both), and the answer is cached by its inputs: clicking again with nothing changed returns the stored answer without a new call. **Regenerate all** asks again with a fresh call.

The backend terms are cleaned after writing: words already in the title (plurals too), competitor brands from the brand list in **Settings → Private label**, ASINs and duplicates are taken out, and the rest is cut at a word to fit 249 bytes.

## Edit it

Every field is editable, with a live counter (characters; bytes for the backend terms) that turns red when it's over. The checks run as you type:

- **Style**: the title over its limit or not leading with the lead term, words in ALL CAPS, promo words (*best*, *#1*, *free*, *sale*, *guaranteed*), a bullet without a capitalised benefit opener, fewer than three bullets on a complaint theme, and backend terms over 249 bytes.
- **Compliance**, each with a suggested rewrite: *antibacterial*, *kills 99.9%*, *disinfect*, *sterile*, *medical grade*, *FDA*, *cure*, and any competitor brand. *Eco-friendly*, *biodegradable* and *plastic-free* are flagged unless the candidate's notes say the product is certified.

**Regenerate** next to a field rewrites only that field, keeping the rest of your listing as it is (a new model call each time).

## Keyword coverage

The table lists every search term with its monthly volume and conversion, and ticks whether it appears in the title, the bullets or the backend terms. The **coverage %** is the share of the total search volume that's covered anywhere, so a missing big term costs more than a missing small one. Uncovered terms are shaded. Click any heading to sort.

## Versions, copy and export

Every generation, field rewrite, saved edit and restore is a **version**. **Save as a version** keeps your edits; **Versions** lists them all with their source and time, and **Restore** brings an earlier one back as a new version (nothing is overwritten).

**Copy all** copies the whole listing as plain text. **Flat-file row** downloads a tab-separated file with the Seller Central columns *item_name*, *bullet_point1* to *bullet_point5*, *product_description* and *generic_keywords*: paste the row into your category's inventory file template.
