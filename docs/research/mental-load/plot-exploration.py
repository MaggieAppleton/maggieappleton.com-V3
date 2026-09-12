"""A conventional reference sheet for exploring the data, not a final essay graphic.

Run: uv run --no-project --with matplotlib python docs/research/mental-load/plot-exploration.py
"""
from pathlib import Path
import json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parent
published = json.loads((ROOT / "published-data.json").read_text())
derived = json.loads((ROOT / "survey-derived.json").read_text())
colours = {"mothers": "#9c3f39", "fathers": "#326773"}
paper, ink, muted = "#faf8f2", "#302e2b", "#77736c"
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10,
                     "text.color": ink, "axes.labelcolor": ink, "xtick.color": muted,
                     "ytick.color": ink, "axes.facecolor": paper, "figure.facecolor": paper,
                     "axes.spines.top": False, "axes.spines.right": False,
                     "axes.spines.left": False, "axes.edgecolor": "#d4d0c6"})
fig = plt.figure(figsize=(17, 13), layout="constrained")
grid = fig.add_gridspec(2, 2, width_ratios=[1.18, 1], hspace=.18, wspace=.17)
fig.suptitle("Who keeps the household in mind?", fontsize=25, fontweight="bold", x=.04, ha="left")

ax = fig.add_subplot(grid[:, 0])
tasks = sorted(published["tasks"], key=lambda t: (t["dimension"] != "daily", -(t["mothers"][0]-t["fathers"][0])))
positions = np.arange(len(tasks))
for pos, task in zip(positions, tasks):
    m, f = task["mothers"][0], task["fathers"][0]
    ax.plot([m, f], [pos, pos], color="#d0c8bb", lw=2, zorder=1)
    for gender, value in [("mothers", m), ("fathers", f)]:
        ax.scatter(value, pos, s=48, c=colours[gender], zorder=3)
        direction = 1 if value == max(m, f) else -1
        ax.annotate(str(value), (value, pos), xytext=(direction * 9, 0), textcoords="offset points",
                    ha="left" if direction == 1 else "right", va="center", fontsize=9, color=colours[gender])
ax.axhline(14.5, color="#b9b1a2", ls="--", lw=.8)
ax.text(2, 14.5, "DAILY ↑   /   EPISODIC ↓", ha="left", va="center", fontsize=8, color=muted,
        bbox={"facecolor": paper, "edgecolor": "none", "pad": 2})
ax.set_yticks(positions, [t["label"] for t in tasks])
ax.tick_params(axis="y", length=0, pad=12)
ax.invert_yaxis()
ax.set_xlim(0, 101)
ax.set_xticks(range(0, 101, 20), [f"{v}%" for v in range(0, 101, 20)])
ax.set_xlabel('Respondents selecting “Mostly me”\nSeparate groups; percentages do not add to 100.', labelpad=14)
ax.set_title("1. The responsibility gap, task by task", loc="left", fontsize=14, pad=34)
for gender in ["mothers", "fathers"]:
    ax.scatter([], [], c=colours[gender], label=gender.title(), s=45)
ax.legend(frameon=False, ncol=2, loc="lower left", bbox_to_anchor=(0, 1.005))
ax.grid(axis="x", color="#ebe6dc", lw=.7)
ax.set_axisbelow(True)

ax = fig.add_subplot(grid[0, 1])
for gender, offset in [("mothers", -.2), ("fathers", .2)]:
    row = next(r for r in derived["distributions"] if r["gender"] == gender and r["scale"] == "all")
    x = np.array([b["primary_task_count"] for b in row["bins"]])
    y = np.array([b["respondents"] / row["n"] * 100 for b in row["bins"]])
    ax.bar(x + offset, y, width=.39, color=colours[gender], alpha=.9, label=f'{gender.title()} (n={row["n"]:,})')
ax.set_title("2. The averages hide a distribution", loc="left", fontsize=14, pad=15)
ax.set_xlabel('Number of the 21 tasks answered “Mostly me”')
ax.set_ylabel("Percentage of respondent group")
ax.set_xticks([0, 3, 6, 9, 12, 15, 18, 21])
ax.legend(frameon=False, fontsize=9)
ax.grid(axis="y", color="#ebe6dc", lw=.7)
ax.set_axisbelow(True)
ax.text(0, -.20, "Recomputed from all 3,000 survey records. Eleven respondents\nhad no applicable tasks and appear in the zero-task bin.",
        transform=ax.transAxes, fontsize=9, color=muted, va="top")

ax = fig.add_subplot(grid[1, 1])
labels = []
pos = 0
for predictor, title in [("employed", "In paid employment"), ("high_income", "Personal salary ≥ US$100,000"), ("earns_more", "Earns more than partner")]:
    for outcome, label in [("cognitive_task_count", "Cognitive tasks"), ("care_hours", "Care hours"), ("housework_hours", "Housework hours")]:
        row = next(r for r in published["followup_models"]["rows"] if r["gender"] == "mothers" and r["predictor"] == predictor and r["outcome"] == outcome)
        value = round(100 * (row["irr"] - 1))
        significant = bool(row["significance"])
        ax.plot([0, value], [pos, pos], color="#d0c8bb", lw=2)
        ax.scatter(value, pos, s=65, facecolors=colours["mothers"] if significant else paper,
                   edgecolors=colours["mothers"], linewidth=1.6, zorder=3)
        ax.annotate(f'{value:+d}%' if value else "0%", (value, pos), xytext=(9, 0),
                    textcoords="offset points", va="center", fontsize=10)
        labels.append((pos, label))
        if outcome == "cognitive_task_count":
            ax.text(-41, pos-.65, title, fontsize=10, fontweight="bold")
        pos += 1
    pos += 1.1
ax.set_title("3. For mothers, physical work shifts more", loc="left", fontsize=14, pad=16)
ax.set_yticks([p for p, _ in labels], [label for _, label in labels])
ax.tick_params(axis="y", length=0, pad=9)
ax.set_ylim(pos - 1, -1.4)
ax.set_xlim(-42, 12)
ax.axvline(0, lw=.8, color="#b9b1a2", ls="--")
ax.set_xticks([-40, -30, -20, -10, 0, 10], ["−40%", "−30%", "−20%", "−10%", "0", "+10%"])
ax.set_xlabel("Adjusted relative difference from the comparison group")
ax.text(0, -.17, "Filled: p < .05 in the paper. Open: not significant.\nPoint estimates only; no claim of an exactly zero effect.\nThese are separate associations, not changes over time.",
        transform=ax.transAxes, fontsize=9, color=muted, va="top")

fig.supxlabel("EXPLORATORY REFERENCE  ·  1: Weeks & Ruppanner, JMF, Tables 1–2 (2025 issue)   ·   2: Weeks, Harvard Dataverse QR51A8, v1\n"
              "3: Weeks, Kowalewska & Ruppanner, Socius, Table 2 (2025), 2,133 parents   ·   Source notes and exact values accompany this file.",
              fontsize=9, color=muted)
fig.savefig(ROOT / "exploration.png", dpi=150, bbox_inches="tight", pad_inches=.3)
fig.savefig(ROOT / "exploration.svg", bbox_inches="tight", pad_inches=.3)
print("Created exploration.png and exploration.svg")
