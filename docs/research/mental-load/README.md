# Mental-load data for visual exploration

Prepared 7 September 2026 for *Machines for the Domestic Mental Load*. The working draft remains unedited by this research package. The tldraw canvas is included as the working space for research and narrative development. This folder is research material; it is not imported into the website.

## Start here

- [Exploratory reference sheet](exploration.png): conventional task comparisons, the distribution across individual parents, and the follow-up's adjusted associations for mothers. [SVG version](exploration.svg).
- [Visual directions](visual-directions.md): three alternative treatments to discuss before developing an essay component.
- [Working tldraw canvas](Machines%20for%20the%20Mental%20Load%20%E2%80%94%20Working%20Notes.tldraw): narrative development, source notes, visualisation thinking, and the domestic-automation-paradox research.
- [Published results](published-data.json): 21 tasks × 2 respondent groups × 4 published response categories, headline proportions, follow-up domain means and selected regression results.
- [Respondent records](respondents.json): 3,000 parents × 21 responses, plus four selected archive indicators. Compact record arrays are described by the file's `record_fields`, `response_codebook` and order fields.
- [Recomputed summaries](survey-derived.json): exact response counts/percentages, domain and scale means, quantiles, task-count distributions and exploratory unadjusted subgroup means.
- [Validation record](validation.json): source hash, matched headlines, six rounding discrepancies and the unresolved follow-up sample restriction.
- [Original public data](sources/Replication_Data_ESR.RData), [author's analysis code](sources/Replication_ESR_FINAL_ACCEPTED.R), and [archive metadata](sources/dataverse-metadata.json).

## Where the records came from

The two papers from the canvas are:

1. Weeks & Ruppanner, [*A typology of US parents' mental loads: Core and episodic cognitive labor*](https://doi.org/10.1111/jomf.13057), *Journal of Marriage and Family* 87(3), 966–989 (2025). [Open PDF](https://anacweeks.github.io/assets/pdf/Weeks_Ruppanner_2024_JMF.pdf). The PDF was published online in 2024; the journal issue is 2025.
2. Weeks, Kowalewska & Ruppanner, [*Take a Load Off? Not for Mothers: Gender, Cognitive Labor, and the Limits of Time and Money*](https://journals.sagepub.com/doi/10.1177/23780231251384527), *Socius* 11 (2025).

Both analyse the February–March 2023 Dynata survey of US parents. The first uses a sample of 3,000 parents; the second restricts its analysis to 2,133 partnered heterosexual parents (1,103 mothers and 1,030 fathers). The second is a further analysis of the same survey, not an independent replication or observation of the same households changing over time. These are individual respondents, not matched partners.

The public respondent data were located through a third paper, Weeks's [*The political consequences of the mental load*](https://academic.oup.com/esr/article/42/3/372/8235651), which describes the same survey. Its [Harvard Dataverse replication archive](https://doi.org/10.7910/DVN/QR51A8), version 1.0, contains `Replication_Data_ESR.RData` and `Replication_ESR_FINAL_ACCEPTED.R`. The archive is CC0; the two target papers are CC BY. The original data's MD5 matches the archive metadata: `bba7e1e31ebe3665d927127f397da87d`.

The archive contains a 3,000 × 78 data frame. This extraction exports the 21 task responses and four existing work/household indicators, omitting the unrelated political-attitude variables. No participant identities or partner-matching identifiers are supplied. Export row numbers are ordinals only.

## What has been checked

- All 3,000 applicable-task denominators reproduce the denominator supplied in the archive.
- All supplied total task-share values reproduce from the individual responses, including the 11 undefined shares where no tasks apply.
- All six JMF headline task-share means reproduce at the published precision: all tasks 71% / 45%; daily 79% / 37%; episodic 53% / 65%, mothers / fathers.
- 162 of 168 published task-response percentage cells match direct rounding of the archive percentages. The other six differ by one point, and all are consistent with rounding first to one decimal place and then to a whole number. This is a plausible explanation, not a verified account of how the original table was generated. Both versions are preserved.
- All exported task-count distribution bins sum to their stated respondent-group sizes.
- The published numerical tables were checked in the original PDF text and publisher article. The exploratory graphic uses those transcribed values where labelled, and raw-derived values only in its distribution panel.

The follow-up's exact analytic sample has **not** been reconstructed. Filtering the archive to `partner == 1` and `lgbt == 0` produces 2,205 records, not 2,133. Its complete exclusion/recoding rules would need to be recovered before reproducing its regressions or treating filtered microdata as its sample. For now, the published *Socius* tables supply all follow-up results. Its supplemental DOCX was identified on the publisher page but could not be retrieved during this pass.

## Units and denominators

**A task percentage** answers: what percentage of this respondent group selected a particular response for this task? The two groups have different sample sizes (1,658 mothers and 1,342 fathers). Mothers' and fathers' “mostly me” percentages are not complementary shares of the same household. Do not normalise them to a single 100% split.

**A task-share scale** is calculated within each respondent: the number of “mostly me” answers divided by the number of applicable tasks. Then those respondent shares are averaged. The headline proportions are consequently not the simple mean of the 21 published “mostly me” percentages. Do not derive the 79% daily headline by averaging its 15 table rows.

**A task count** simply counts “mostly me” answers, out of 21 overall or three per domain. It counts responsibilities of unequal size. It does not measure time, recurrence, urgency, cognitive difficulty, emotional work or total mental burden. The authors' “Daily” and “Episodic” dimensions are groupings from factor analysis, not observed schedules; birthday planning is in Daily without implying that it happens every day.

**Response categories:** the raw data distinguish mostly me, mostly partner, equally shared, someone else, and not applicable. Empty strings in this archive represent the latter, confirmed against its supplied denominator. In published JMF Table 2, “Other” combines someone else and not applicable. It is therefore not an outsourcing percentage.

**Physical care hours** in *Socius* include looking after children and elderly, ill or disabled family members. The measure is broader than childcare alone. Physical work is recalled weekly, not timed by researchers. Cognitive responsibilities and physical hours cannot be added into one workload total.

**Adjusted associations:** `irr` is an incidence rate ratio from a negative binomial regression. The comparison-group value is 1. A value of 0.83 means 17% lower expected count/hours, holding the other model variables constant. It does not mean 17 percentage points or 17 fewer hours. Employment, ≥US$100,000 personal salary and higher earnings than a partner are separate binary comparisons, not steps on a continuous career or salary trajectory.

No significant difference does not establish a zero difference. The mothers' cognitive estimates are 1.00, 0.95 and 1.03; keep the point estimates and their uncertainty distinction. Standard errors and stars are recorded as printed. Some are inconsistent under a simple Wald calculation using rounded entries, so this extraction does not manufacture confidence intervals. Obtain full-precision coefficients and covariance information before an inferential graphic needs numerical intervals.

## Small source issues to retain

- *Socius* Table 1 prints 13.72 versus 8.18 cognitive tasks and “66.96%” more for mothers. The means imply approximately **67.73%**; the prose rounds to 68%. Prefer the task counts or “about 68%” rather than repeating 66.96%. The JSON retains the source's original value for audit.
- Some domain differences differ from subtraction of rounded means: scheduling is printed as 1.60, while 2.44 − 0.83 = 1.61. Those can reflect rounding of underlying values. Do not silently overwrite the source column.
- For employed fathers' other-housework coefficient (0.70), the publisher HTML and indexed PDF disagree on two versus three significance stars. Both indicate p < .01. This does not affect the mothers-only model panel.
- The tldraw working note paraphrases the food-date item as use-by dates. The survey says sell-by dates; exact wording is preserved in the dataset.

## Findings that suggest useful visual forms

The raw records make it possible to show distributions and actual combinations of responsibilities. For the daily scale, the median share of applicable tasks claimed by mothers is **91.29%**, versus **26.67%** for fathers. These are fresh descriptive calculations, not additional published findings. Denominators are 1,650 mothers and 1,337 fathers with at least one applicable daily task. About **38.55%** of those mothers and **12.42%** of those fathers report being mostly responsible for every applicable daily task.

There is substantial variation in each group. A visual of two average silhouettes would erase that variation, as well as implying paired households. Respondent-level task patterns can show both the asymmetry and the exceptions.

The follow-up supports a separate comparison: mothers' physical work differs with employment and high personal income, while there is no statistically significant reduction in their cognitive task count. It does not support “nothing changes for anyone”: higher-income fathers report more core cognitive tasks, and breadwinning fathers report more episodic tasks. For some high-resource comparisons the between-gender gap is not statistically significant, even though mothers' own load does not significantly decline.

Neither paper measures what personal agents can automate or how much work they remove. Use these data to establish the problem. An agent intervention is a subsequent argument or explicitly labelled scenario, with no invented numerical saving.

## Rebuild

The original source files are retained. The scripts require temporary Python dependencies, not website dependencies:

```sh
uv run --no-project --with rdata python docs/research/mental-load/extract-survey.py
uv run --no-project --with matplotlib python docs/research/mental-load/plot-exploration.py
```

The extraction verifies the downloaded data hash and the main numerical invariants before writing the JSON exports. Its indicator-based subgroup summaries are exploratory, unadjusted comparisons over the full archive; they are not substitutes for the follow-up's adjusted results.
