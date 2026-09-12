"""Build visualisation data from Weeks's public CC0 survey archive.

Run: uv run --no-project --with rdata python docs/research/mental-load/extract-survey.py
Only task responses and selected household/work indicators are exported.
The website does not import any of these research files.
"""

from pathlib import Path
import hashlib
import json
import math

import rdata

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "sources" / "Replication_Data_ESR.RData"
EXPECTED_SHA256 = "51bbdfc1fffaf0c8b2310b6ce405edefeedd8caa617ce22b9fbf212c38cad707"
assert hashlib.sha256(RAW.read_bytes()).hexdigest() == EXPECTED_SHA256
published = json.loads((ROOT / "published-data.json").read_text())
df = rdata.read_rda(str(RAW))["dat1"]
assert df.shape == (3000, 78)

# Task order follows Tables 1-2 of the JMF paper, not the archive column order.
columns = [
    "Q41_1", "Q41_2", "Q41_3",  # cleaning
    "Q40_1.1", "Q40_2", "Q40_3",  # scheduling
    "Q37_1", "Q37_2", "Q37_3",  # childcare
    "Q38_1", "Q38_2", "Q38_3",  # maintenance
    "Q36_1", "Q36_2", "Q36_3",  # finances
    "Q39_1", "Q39_2", "Q39_3",  # social relationships
    "Q34_1", "Q34_2", "Q34_3",  # food
]
response_codes = {
    "": 0,
    "Mostly me": 1,
    "Mostly my partner": 2,
    "Partner and I share equally": 3,
    "Someone else (includes friends and family)": 4,
}
assert set(df[columns].stack().unique()) == set(response_codes)
responses = df[columns].apply(lambda s: s.map(response_codes))
assert not responses.isna().any().any()
applicable = (responses != 0).sum(axis=1)
primary = (responses == 1).sum(axis=1)
assert (applicable == df.p_m_load_relevant_2).all()
share = primary / applicable
assert share.isna().equals(df.p_m_load_share_relevant2.isna())
assert ((share - df.p_m_load_share_relevant2).abs().dropna() < 1e-12).all()

def number(value):
    return None if not math.isfinite(float(value)) else float(value)

def round_half_up(value):
    return math.floor(value + 0.5)

derived = {
    "source": published["sources"]["survey_archive"],
    "status": "Recomputed from public respondent data; not new published-paper results.",
    "sample": {"total": 3000, "mothers": 1658, "fathers": 1342},
    "notes": [
        "Individual respondents, not paired couples.",
        "Percentages retain source precision; round for display only.",
        "The archive stores not-applicable responses as empty strings. Their tally exactly reproduces the supplied applicable-task denominator for all 3000 respondents.",
        "Task response percentages use all respondents in a gender group. Scale means exclude people with no applicable tasks in that scale.",
        "Task count is not hours, recurrence, effort, distress or total household burden.",
    ],
    "task_responses": [],
    "scale_summaries": [],
    "domain_summaries": [],
    "distributions": [],
    "descriptive_subgroups": [],
}
discrepancies = []
matched_cells = 0

for task, column in zip(published["tasks"], columns):
    for gender, gender_value in [("mothers", 1), ("fathers", 0)]:
        subset = responses.loc[df.woman == gender_value, column]
        counts = {str(code): int((subset == code).sum()) for code in range(5)}
        percents = {code: count / len(subset) * 100 for code, count in counts.items()}
        derived["task_responses"].append({
            "task_id": task["id"], "archive_variable": column, "gender": gender,
            "n": len(subset), "counts_by_response_code": counts,
            "percent_by_response_code": percents,
        })
        values = [percents[str(code)] for code in [1, 2, 3]] + [percents["0"] + percents["4"]]
        for response, source_value, value in zip(published["response_order"], task[gender], values):
            rounded = round_half_up(value)
            if source_value == rounded:
                matched_cells += 1
            else:
                discrepancies.append({
                    "task_id": task["id"], "gender": gender, "response": response,
                    "published_percent": source_value, "recomputed_percent": value,
                    "rounded_recomputed_percent": rounded,
                    "round_to_tenths_then_whole": round_half_up(round(value, 1)),
                })

scales = {
    "all": columns,
    "daily": [c for t, c in zip(published["tasks"], columns) if t["dimension"] == "daily"],
    "episodic": [c for t, c in zip(published["tasks"], columns) if t["dimension"] == "episodic"],
}
for scale, cols in scales.items():
    counts = (responses[cols] == 1).sum(axis=1)
    denominator = (responses[cols] != 0).sum(axis=1)
    shares = counts / denominator
    for gender, gender_value in [("mothers", 1), ("fathers", 0)]:
        mask = df.woman == gender_value
        values = shares[mask].dropna()
        derived["scale_summaries"].append({
            "scale": scale, "gender": gender, "maximum_tasks": len(cols),
            "n": int(mask.sum()), "n_with_applicable_tasks": len(values),
            "mean_primary_task_count": float(counts[mask].mean()),
            "mean_primary_share_of_applicable_tasks": float(values.mean()),
            "share_quantiles": {str(q): float(values.quantile(q)) for q in [0, .25, .5, .75, 1]},
            "n_primary_for_all_applicable": int((values == 1).sum()),
        })
        derived["distributions"].append({
            "scale": scale, "gender": gender, "n": int(mask.sum()),
            "unit": "respondents by number of tasks answered Mostly me",
            "bins": [{"primary_task_count": k, "respondents": int((counts[mask] == k).sum())}
                     for k in range(len(cols) + 1)],
        })

for domain in dict.fromkeys(t["domain"] for t in published["tasks"]):
    cols = [c for t, c in zip(published["tasks"], columns) if t["domain"] == domain]
    count = (responses[cols] == 1).sum(axis=1)
    for gender, value in [("mothers", 1), ("fathers", 0)]:
        mask = df.woman == value
        derived["domain_summaries"].append({
            "domain": domain, "gender": gender, "maximum_tasks": 3,
            "n": int(mask.sum()), "mean_primary_task_count": float(count[mask].mean()),
        })

# These exploratory comparisons use the full archive, not the Socius analytic sample.
# Preserve source variable names to avoid implying undocumented recoding.
for indicator in ["partner", "employed", "income_high", "relative_income"]:
    for level in [0, 1]:
        for gender, value in [("mothers", 1), ("fathers", 0)]:
            mask = (df.woman == value) & (df[indicator] == level)
            derived["descriptive_subgroups"].append({
                "archive_indicator": indicator, "level": level, "gender": gender,
                "n": int(mask.sum()), "mean_primary_task_count": float(primary[mask].mean()),
                "note": "Unadjusted, full archive. Do not substitute for the follow-up's adjusted model estimates.",
            })

respondents = {
    "source_doi": "10.7910/DVN/QR51A8", "source_version": "1.0", "licence": "CC0 1.0",
    "note": "Selected fields from public research records. Row index is an export ordinal, not an identity or household identifier. No pairing between mothers and fathers is available.",
    "response_codebook": {"0": "not_applicable", "1": "mostly_me", "2": "mostly_partner", "3": "shared_equally", "4": "someone_else"},
    "task_ids_in_response_order": list(range(1, 22)),
    "archive_variables_in_response_order": columns,
    "indicator_order": ["partner", "employed", "income_high", "relative_income"],
    "record_fields": ["row_index", "gender", "responses", "archive_indicators"],
    "records": [],
}
for ordinal, (_, row) in enumerate(df.iterrows(), 1):
    respondents["records"].append([
        ordinal, "mothers" if row.woman == 1 else "fathers",
        [response_codes[row[c]] for c in columns],
        [number(row[c]) for c in respondents["indicator_order"]],
    ])

# Ensure the headline proportions agree, while keeping every source cell auditable.
expected = {("all", "mothers"): .71, ("all", "fathers"): .45,
            ("daily", "mothers"): .79, ("daily", "fathers"): .37,
            ("episodic", "mothers"): .53, ("episodic", "fathers"): .65}
for row in derived["scale_summaries"]:
    assert round(row["mean_primary_share_of_applicable_tasks"], 2) == expected[row["scale"], row["gender"]]
for distribution in derived["distributions"]:
    assert sum(b["respondents"] for b in distribution["bins"]) == distribution["n"]
assert len(derived["task_responses"]) == 42
assert len(respondents["records"]) == 3000
assert matched_cells + len(discrepancies) == 168

audit = {
    "source_checksum_verified": True,
    "source_shape": [3000, 78],
    "applicable_denominators_reproduced": 3000,
    "supplied_all_task_shares_reproduced": 3000,
    "headline_scale_means_match_at_published_precision": True,
    "task_table_cells_matching_direct_rounding": matched_cells,
    "task_table_cells_total": 168,
    "task_table_discrepancies": discrepancies,
    "rounding_note": "All six one-point discrepancies are consistent with first rounding to one decimal place and then rounding to an integer. This explains their pattern but is not verified as the original table-generation method.",
    "followup_sample": {
        "published_n": 2133,
        "archive_partner_1_lgbt_0_n": int(((df.partner == 1) & (df.lgbt == 0)).sum()),
        "status": "Exact Socius analytic sample not reproduced; do not relabel this archive subset as the follow-up sample. Published Socius tables remain the source for its results.",
    },
}
for filename, value in [("survey-derived.json", derived), ("respondents.json", respondents), ("validation.json", audit)]:
    (ROOT / filename).write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + "\n")
print(json.dumps({"respondents": 3000, "task_response_cells": 63000, "matched_published_cells": matched_cells,
                  "rounding_discrepancies": len(discrepancies), "headline_means_verified": True}))
