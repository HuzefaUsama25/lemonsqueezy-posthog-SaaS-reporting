import { NextResponse } from "next/server";

import { fetchLemonSqueezyData } from "@/lib/lemonsqueezy";

/** USD string like "$4,005" — whole dollars, no cents */
function formatUsd(amount: number): string {
	const dollars = Math.round(amount);
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(dollars);
}

function utcDayBounds(): { dayKey: string; start: Date; end: Date } {
	const dayKey = new Date().toISOString().split("T")[0];
	const start = new Date(`${dayKey}T00:00:00.000Z`);
	const end = new Date(`${dayKey}T23:59:59.999Z`);
	return { dayKey, start, end };
}

export async function GET() {
	const { dayKey, start, end } = utcDayBounds();
	const lemonRows = await fetchLemonSqueezyData(start, end);
	const today = lemonRows.find((row) => row.date === dayKey);

	const mrr = today?.mrr ?? 0;
	const salesToday = today?.revenue ?? 0;

	return NextResponse.json({
		MRR: formatUsd(mrr),
		SalesToday: formatUsd(salesToday),
	});
}
