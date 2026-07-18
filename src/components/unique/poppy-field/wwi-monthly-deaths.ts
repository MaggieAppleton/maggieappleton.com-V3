// Reconstructed monthly military-death series for WWI (all nations, all-cause).
// Values are in THOUSANDS of dead, which is also the poppy count for that month.
//
// Modelled, not measured — no monthly all-nations record exists. National
// totals (~9.5M) sit within the scholarly cluster of 9.16M–10.06M (Urlanis,
// Winter, Overmans, Prost). Shaped around dated battle/campaign periods with a
// disease baseline and a 1918 influenza bulge, NOT summed from individual
// battle tolls — a month's number isn't a claim about any one battle. Deaths ≠
// casualties: POW-heavy operations (e.g. Caporetto) are deliberately not spikes.

export interface MonthDeaths {
	year: number;
	month: number; // 1–12
	deaths: number; // thousands of dead ≈ poppies for the month
}

export const MONTHLY: MonthDeaths[] = [
	{ year: 1914, month: 8, deaths: 230 },
	{ year: 1914, month: 9, deaths: 270 },
	{ year: 1914, month: 10, deaths: 210 },
	{ year: 1914, month: 11, deaths: 190 },
	{ year: 1914, month: 12, deaths: 160 },
	{ year: 1915, month: 1, deaths: 100 },
	{ year: 1915, month: 2, deaths: 130 },
	{ year: 1915, month: 3, deaths: 120 },
	{ year: 1915, month: 4, deaths: 150 },
	{ year: 1915, month: 5, deaths: 210 },
	{ year: 1915, month: 6, deaths: 200 },
	{ year: 1915, month: 7, deaths: 180 },
	{ year: 1915, month: 8, deaths: 180 },
	{ year: 1915, month: 9, deaths: 200 },
	{ year: 1915, month: 10, deaths: 170 },
	{ year: 1915, month: 11, deaths: 130 },
	{ year: 1915, month: 12, deaths: 110 },
	{ year: 1916, month: 1, deaths: 110 },
	{ year: 1916, month: 2, deaths: 140 },
	{ year: 1916, month: 3, deaths: 190 },
	{ year: 1916, month: 4, deaths: 200 },
	{ year: 1916, month: 5, deaths: 210 },
	{ year: 1916, month: 6, deaths: 260 },
	{ year: 1916, month: 7, deaths: 290 }, // crest — three concurrent offensives (Verdun, Somme, Brusilov)
	{ year: 1916, month: 8, deaths: 280 },
	{ year: 1916, month: 9, deaths: 270 },
	{ year: 1916, month: 10, deaths: 230 },
	{ year: 1916, month: 11, deaths: 200 },
	{ year: 1916, month: 12, deaths: 160 },
	{ year: 1917, month: 1, deaths: 130 },
	{ year: 1917, month: 2, deaths: 130 },
	{ year: 1917, month: 3, deaths: 140 },
	{ year: 1917, month: 4, deaths: 190 }, // Nivelle
	{ year: 1917, month: 5, deaths: 170 },
	{ year: 1917, month: 6, deaths: 160 },
	{ year: 1917, month: 7, deaths: 180 },
	{ year: 1917, month: 8, deaths: 190 },
	{ year: 1917, month: 9, deaths: 180 },
	{ year: 1917, month: 10, deaths: 210 }, // Passchendaele + Caporetto
	{ year: 1917, month: 11, deaths: 180 },
	{ year: 1917, month: 12, deaths: 130 },
	{ year: 1918, month: 1, deaths: 120 },
	{ year: 1918, month: 2, deaths: 120 },
	{ year: 1918, month: 3, deaths: 230 }, // German Spring Offensive
	{ year: 1918, month: 4, deaths: 220 },
	{ year: 1918, month: 5, deaths: 200 },
	{ year: 1918, month: 6, deaths: 180 },
	{ year: 1918, month: 7, deaths: 170 },
	{ year: 1918, month: 8, deaths: 220 }, // Hundred Days
	{ year: 1918, month: 9, deaths: 230 }, // Meuse–Argonne
	{ year: 1918, month: 10, deaths: 260 }, // fighting + influenza
	{ year: 1918, month: 11, deaths: 110 }, // war ends on the 11th
];

export interface Battle {
	id: string;
	label: string;
	startIndex: number; // into MONTHLY (0-based)
	endIndex: number;
	note: string;
}

// Indices into MONTHLY (0-based): 1914 Aug=0…Dec=4; 1915 Jan=5…Dec=16;
// 1916 Jan=17…Dec=28; 1917 Jan=29…Dec=40; 1918 Jan=41…Nov=51.
export const BATTLES: Battle[] = [
	{ id: "ypres1", label: "First Ypres", startIndex: 2, endIndex: 3, note: "Oct-Nov 1914" },
	{ id: "gallipoli", label: "Gallipoli", startIndex: 8, endIndex: 16, note: "1915" },
	{ id: "verdun-somme", label: "Verdun & the Somme", startIndex: 23, endIndex: 27, note: "1916 – the deadliest year" },
	{ id: "passchendaele", label: "Passchendaele", startIndex: 38, endIndex: 39, note: "Autumn 1917" },
	{ id: "spring", label: "Spring Offensive", startIndex: 43, endIndex: 44, note: "March 1918" },
	{ id: "armistice", label: "Armistice", startIndex: 51, endIndex: 51, note: "11 Nov 1918 – the war ends" },
];

const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (m: MonthDeaths) => `${MONTH_NAMES[m.month]} ${m.year}`;

// Modelled share of each month's dead from disease/flu/other (cause of death
// wasn't recorded month-by-month): ~30% overall, weighted up on disease-heavy
// fronts (Gallipoli, Serbian typhus) and the autumn 1918 flu pandemic.
function diseaseShareFor(m: MonthDeaths): number {
	if (m.year === 1918 && m.month >= 9) {
		return m.month === 10 ? 0.52 : m.month === 11 ? 0.48 : 0.4; // Sep · Oct · Nov flu bulge
	}
	switch (m.year) {
		case 1914:
			return 0.2;
		case 1915:
			return 0.34;
		case 1916:
			return 0.24;
		case 1917:
			return 0.32;
		default:
			return 0.3; // 1918 Jan–Aug
	}
}

/** Poppies in this month that represent disease / flu / other deaths (rest are combat). */
export const diseaseCount = (m: MonthDeaths) => Math.round(m.deaths * diseaseShareFor(m));

export const SOURCES_PREFIX =
	"Roughly one poppy per 1,000 dead, totalling ~9.5 million across all nations (estimates range from 9.16–10.06 million – ";
export const SOURCES_SUFFIX =
	"). Monthly counts and the combat/disease split are approximate and built from these sources. Claude Opus 4.8 deep research compiled this data.";

export const SOURCE_CITATIONS = [
	{ name: "Urlanis", url: "https://archive.org/details/warspopulationurlanis" },
	{ name: "Winter", url: "https://link.springer.com/book/10.1057/9780230506244" },
	{ name: "Overmans", url: "https://www.ruediger-overmans.de/" },
	{ name: "Prost", url: "https://encyclopedia.1914-1918-online.net/article/war-losses/" },
];
