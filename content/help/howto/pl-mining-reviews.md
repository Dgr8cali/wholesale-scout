---
title: "Private label: mining reviews"
summary: Paste the top listings' 1–3★ reviews into Gate 4, read the Themes table, and let the theme you pick fill the gate's share of negative reviews and a draft six words.
synonyms: [reviews, critical reviews, negative reviews, 1 star, complaints, themes, gate 4, fixable, six words, differentiator, synonyms, review mining, summarise reviews, claude]
workspace: pl
order: 5
---
Gate 4 asks for one complaint that repeats across the top listings, that a factory can fix cheaply, and that you can say in six words. **Mine the reviews**, in a candidate's Gate 4 section, does the counting for you.

## Paste the reviews

1. In the gate's table, click **Read the critical reviews** (or **1–3★ reviews** above each box) for a listing. Amazon opens its critical reviews: the one-, two- and three-star ones.
2. Select the page's text (Ctrl+A, Ctrl+C) and paste it into that listing's box. Paste more pages into the same box if you want more reviews: 50 a listing is plenty.
3. Click outside the box: it's saved, and the count of reviews read shows above it.

**Paste all** takes several listings at once: start each listing's reviews with a line `ASIN: B0…`. Each listing's paste replaces what was saved for it, and a listing that isn't in the top five gets its own box.

**Or send them with the extension** (version 0.5.2 or later). On a listing's reviews page on amazon.co.uk (click **See all reviews**; filter to 1, 2 or 3 stars), a panel at the bottom right counts the reviews it has read, by star; a product page with reviews on it gets the same panel at the bottom left. If it doesn't appear, click the extension's icon and **Capture reviews on this page**. Click through as many pages as you want (filter to critical reviews first): each page is added. Click **Send reviews to Private label** and they go into the Gate 4 box of the candidate with that ASIN among its page-one ASINs. If several candidates have it, or none, the panel asks which. Sending again adds only reviews it hasn't seen (Amazon's review id). Reviews you pasted by hand for that listing stay until you choose **Add to them** or **Replace them**. Only the 1–3★ reviews go into the box; 4–5★ ones, and any whose stars couldn't be read, are kept but not mined. The box says **from the extension** with the count; editing its text by hand makes it your paste.

The raw text is kept with the candidate. Everything after that happens in your browser, with no API call.

## How the reviews are read

- **Splitting.** On Amazon's page, a line like "1.0 out of 5 stars Lid broke in a week" starts a review: the star rating and the title come from it. The reviewer's name, "Reviewed in the United Kingdom on …", "Verified Purchase", colour and size lines and "Helpful / Report" are dropped. Text without star lines is split at "Reviewed in …" lines (the line before is the title), and otherwise at blank lines.
- **Phrases.** Each sentence is lower-cased and the stop words are dropped ("the", "it", "after", "bought"…). "Not", "no" and "too" are kept, because they carry the complaint. The pairs and triples of words that remain are the phrases: "lid breaks", "flimsy clip", "compartment too small". Plurals are folded ("lids" counts as "lid").
- **Synonyms.** A short list turns words that mean the same into one: broke, broken, snapped, fell apart and cracked become **breaks**; small, tiny and short become **too small**; leak, leaks and leaking become **leaks**; smell and odour become **smells**; doesn't work and stopped working become **stopped working**. Each group is also a theme of its own (any of its words). Edit the list under **Synonyms**: it's shared by every candidate, and **Reset to defaults** brings the original back.
- **Counting.** A theme counts each review once, however often it's said. A phrase needs at least 2 reviews (or 4% of them, on a big paste). A phrase that adds nothing is dropped: one with the same reviews as a shorter phrase inside it, or the two halves of "lid pop open" when the triple says it.

## The Themes table

Each theme shows how many reviews mention it, the **% of negative reviews** (all the reviews pasted for the candidate), which listings it appears on, and three example sentences from different reviews. Sort by any column. A theme on most of the top listings is a niche-wide complaint, not one seller's bad batch.

For each theme:

- **Use for Gate 4** fills **Share of negative reviews with it** with the theme's % and **The six words** with a draft ("the only pill box whose lid doesn't break"). Then answer **Can a factory fix it cheaply?** Yes or No; No marks the theme not fixable, so pick another. The draft is a starting point: edit the six words in the gate.
- **Not fixable** greys the theme out (delivery, price and taste complaints aren't a factory's to fix).
- **Ignore** hides it (show the ignored ones with the link under the table).

The gate's **Cost of the fix** is still yours to fill: ask a supplier.

## Ask Claude to summarise

**Summarise** sends the themes (with their shares) and the reviews to Claude, and returns the top three complaints a factory could fix, one sentence each, with the theme each matches. Themes marked not fixable or ignored are left out. It calls the API only when you click; the same data asked again returns the stored answer at no cost, and **Re-run** asks again anyway. The cost of each run shows under the answer (a few pence; it's logged with the Ads AI calls, and Settings → Ads shows the total). **The data sent** shows exactly what would go. Figures in the answer that aren't in the data sent are listed for you to check.
