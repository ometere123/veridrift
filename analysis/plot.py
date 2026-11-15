"""Render publication figures directly from the independently scored JSON."""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter


ROOT = Path(__file__).resolve().parents[1]
SUMMARY = ROOT / "evidence" / "verification" / "summary.json"
FIGURES = ROOT / "figures"
CONDITIONS = ("A", "B", "C", "D")
LABELS = ("Direct", "Ordinary", "Provenance", "Provenance\n+ uncertainty")
COLORS = ("#566878", "#AF4E39", "#32688D", "#166B5A")


def bars(ax, frequencies, *, offsets=None, colors=COLORS, label=None, width=0.57):
    offsets = offsets if offsets is not None else range(len(frequencies))
    for index, (offset, item) in enumerate(zip(offsets, frequencies, strict=True)):
        numerator = item["numerator"]
        denominator = item["denominator"]
        rate = item["rate"]
        color = colors[index % len(colors)]
        if rate is None:
            ax.text(offset, 0.024, "—", ha="center", va="bottom", color="#68737f", fontsize=8)
            continue
        ax.bar(offset, rate, width, color=color, label=label if index == 0 else None, zorder=3)
        if rate == 0:
            ax.plot(offset, rate, "_", color=color, ms=12, zorder=4, clip_on=False)
        ax.text(offset, rate + 0.025, f"{numerator}/{denominator}", ha="center", va="bottom",
                color="#222930", fontsize=8, zorder=5)


def main():
    summary = json.loads(SUMMARY.read_text(encoding="utf-8"))
    if summary["integrity"]["issues"]:
        raise SystemExit("Resolve integrity errors before drawing figures.")
    if not summary["finalStates"]["valid"]:
        raise SystemExit("No valid model observations. No outcome figure generated.")

    plt.rcParams.update({
        "font.family": "DejaVu Sans", "axes.spines.top": False,
        "axes.spines.right": False, "axes.spines.left": False,
        "axes.edgecolor": "#d1d8de", "xtick.color": "#263442",
        "ytick.color": "#51616F", "text.color": "#16282e",
        "axes.labelcolor": "#263442", "font.size": 9,
        "pdf.fonttype": 42, "svg.fonttype": "none",
    })
    fig, axes = plt.subplots(1, 2, figsize=(9.4, 3.2), gridspec_kw={"wspace": 0.28})
    left, right = axes
    bars(left, [summary["descriptive"][c]["none"]["unsupportedCertainty"] for c in CONDITIONS])
    left.set_title("A   Unsupported certainty", loc="left", fontweight="bold")
    left.set_ylabel("Share of at-risk claims")
    old_max = max((summary["descriptive"][c]["none"]["unsupportedCertainty"]["rate"] or 0 for c in CONDITIONS), default=0)
    left.set_ylim(0, max(0.25, 1.13 * old_max + 0.04))
    revisions = summary["revision"]
    for branch, offset, color, label in (("support", -0.20, "#32688D", "Support"), ("retract", 0.20, "#166B5A", "Retraction")):
        bars(right, [revisions[c][branch]["strictPostUpdateFidelity"] for c in CONDITIONS],
             offsets=[i + offset for i in range(len(CONDITIONS))], colors=(color,), label=label, width=0.30)
    right.set_ylim(0, 1.14)
    right.set_title("B   Correct verdict and decisive citation", loc="left", fontweight="bold")
    right.set_ylabel("Share of primary targets")
    right.legend(ncols=2, frameon=False, loc="upper left", bbox_to_anchor=(0.0, 1.01), fontsize=7.5)
    for ax in axes:
        ax.set_xticks(range(len(CONDITIONS)), LABELS)
        ax.set_xlim(-0.52, 3.54)
        ax.yaxis.set_major_formatter(PercentFormatter(1, decimals=0))
        ax.grid(axis="y", color="#e5e9ed", linewidth=0.7, zorder=0)
        ax.tick_params(axis="both", length=0)
    fig.subplots_adjust(left=0.08, right=0.97, top=0.86, bottom=0.22)
    FIGURES.mkdir(exist_ok=True)
    fig.savefig(FIGURES / "outcomes.svg")
    fig.savefig(FIGURES / "outcomes.png", dpi=300)
    fig.savefig(FIGURES / "outcomes.pdf")
    plt.close(fig)


if __name__ == "__main__":
    main()


