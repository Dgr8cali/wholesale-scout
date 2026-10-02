---
title: "Ads: rank checks"
summary: Check where a product sits in Amazon's organic search results for its keywords, with the extension, one manual run at a time; and read the rank sparkline.
synonyms: [rank check, organic rank, keyword rank, position, page one, serp, sparkline, extension, ranked ease off, slipping]
workspace: ads
order: 3
---
A **rank check** records where your product sits among Amazon's **organic** results (sponsored results skipped) for each of its tracked keywords. It's done by the [Chrome extension](/help/pages/extension) (0.3.0 or later) in your own browser, **only when you click**.

## What's tracked

For each product: every **exact** keyword in its campaigns, the head terms of its [launch](/help/howto/ads-launching-a-product), and any keyword you add. A run checks at most **30 keywords**.

## Running a check

1. Click the extension's icon. Under **Check ranks**, pick the product: it lists how many keywords it has.
2. Click **Check ranks**. A new amazon.co.uk tab opens and searches each keyword in turn, with a random pause of **3–6 seconds** before each search.
3. A panel at the bottom right of that tab shows each keyword's result as it comes in, and a **Stop** button. Stopping keeps the results so far.
4. At the end (or on Stop) the results are saved to the app.

For each keyword the extension reads the search results page, skips the sponsored ones, and counts the organic results in order. If the product isn't on page 1, it reads page 2 (and 3) until 48 organic results have been seen. A position is **1–48**, with the page it was on; otherwise **not in the top 48**. If Amazon shows a captcha, the run stops and says so.

**This is a manual check, deliberately slow and small.** Amazon's Conditions of Use don't allow automated data gathering, so it never runs on a schedule, one run goes at a time, and each search waits 3–6 seconds. Use it a few times a week at most, not in a loop.

## Reading it

The dashboard's **Keywords** table has an **Organic rank** column: the latest position (#12, or >48), and a sparkline of the last 8 checks. Higher on the sparkline is better (closer to #1). A point at the bottom is "not in the top 48". Hover for each check's date, position and page.

Two rules use the checks ([Ads: rules and proposals](/help/howto/ads-rules-and-proposals)):

- **Ranked — ease off**: position 8 or better on the last 3 checks → bid −20%, because the ad pays for a slot the listing already holds.
- **Slipping**: position worse by 10+ places between the last two checks, while the keyword's ACoS is under target → bid +10%.
