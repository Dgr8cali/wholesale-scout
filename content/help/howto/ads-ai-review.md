---
title: "Ads: AI review"
summary: Explain this product, Recommend targets and the monthly review on Ads → Review — what Claude is sent, what it may and may not do, and what each run costs.
synonyms: [ai, claude, anthropic, explain, narrative, monthly review, target acos recommender, recommend targets, launch target, steady target, ai cost, tokens, schedule]
workspace: ads
order: 5
route: /ads/review
---
Three Ads features ask Claude (Anthropic's model) to read the app's own figures and write about them. **The API is called only when you click, or by the monthly schedule if you turn it on.** Claude never sets a bid or a budget: it writes narrative and proposes target ACoS values. Changes to campaigns still come only from the [rules](/help/howto/ads-rules-and-proposals), which you approve.

## What Claude is sent

A compact summary built from your imports, never the raw files: the product's figures (spend, sales, ACoS, break-even, TACoS, profit after ads, CPC, conversion), its top wasting and converting search terms, the placement split, campaigns, budget-limited days, the open proposals, stock cover, and notes on what's missing. It's capped at about 20,000 tokens; the longest lists are trimmed first and the data says so. **The data sent** under each panel shows exactly what would go, without calling the API.

Claude is told to use only those figures and to cite every number it uses. The app then checks each figure in the answer against the data sent: "Every figure checked" in green, or the figures it couldn't find in amber, for you to check.

## Explain this product

On each product on the [Ads dashboard](/help/howto/ads-importing-reports), **Explain** gives a 150–250 word read of the period: what happened (spend, sales, ACoS against break-even, TACoS, profit after ads), the two or three biggest drivers, and what the open proposals would change. The answer is stored: it's shown again on the next visit, and clicking again while the data hasn't changed returns the stored answer at no cost. **Re-run** asks again anyway.

## Recommend targets

Under a product's **Price, costs and target**, **Recommend** proposes a launch and a steady target ACoS from break-even, review count, rank, phase, days of cover and the account's CPC and conversion, with a paragraph of justification and a confidence (low, medium, high). The app keeps the targets between 1% and 99% and the steady target at or below the launch one, and warns when steady is above break-even. **Apply** writes both to the product's targets; nothing changes until you click it.

## The monthly review

**Ads → Review** (also a tile on Home) reviews a month: pick it (last month by default) and click **Run review**. You get:

- **Recommendations**: three, ranked by expected profit impact, each with an estimate of £ a month when the data supports one, and the rule that would make the change (a link to Ads → Rules) or "Manual action".
- **Did last month's changes work?**: each bulk sheet batch you uploaded between the start of the previous month and the end of this one, comparing the 14 days before its upload with the 14 days after. A verdict needs the daily Campaign report with at least 10 days on each side; otherwise it says "too early" or "not measurable" and why.
- **By product** and **Account-wide**: the narrative for the month.

Per-month figures come from the daily Campaign report. With only range data (a bulk export over several weeks), the review says the figures cover the range, not the month.

**Scheduled**: Settings → Ads → **Run the monthly review on the 1st at 06:00** reviews the previous month automatically. It's off by default.

## Cost

Every run shows what it cost: "This review cost £0.04 (3,059 tokens in, 2,723 out)". Each call is logged with its tokens and cost, and Settings → Ads shows the last 30 days' spend (Home's review tile too). On the default model and one product, an explanation costs about £0.04, a target recommendation about £0.01 and a monthly review about £0.04; more products mean a longer review. Failed calls are logged too, with whatever they cost.

Settings → Ads sets the **model** (Claude Sonnet 5.5 by default; Haiku 4.5 is cheaper, Opus 5.5 the most capable), the **$ per million tokens** in and out the cost line uses (defaults per model; check them against Anthropic's pricing), and **£ per $**. The key is `ANTHROPIC_API_KEY` in the environment.
