'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ChartConfig, ChartContainer } from '@/components/ui/chart';
import { DashboardData } from '@/app/actions';
import { TooltipProps } from 'recharts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings2 } from 'lucide-react';

interface OverviewChartProps {
	data: DashboardData[];
}

const chartConfig = {
	visitors: {
		label: 'Visitors',
		color: 'var(--chart-1)',
	},
	pricingViews: {
		label: 'Pricing Views',
		color: 'var(--chart-2)',
	},
	checkouts: {
		label: 'Checkouts',
		color: 'var(--chart-3)',
	},
	purchases: {
		label: 'Purchases',
		color: 'var(--chart-4)',
	},
	revenue: {
		label: 'Revenue',
		color: 'var(--chart-5)',
	},
	mrr: {
		label: 'MRR',
		color: '#3b82f6', // Blue
	},
	visitorToPriceViewRate: {
		label: 'Visitor → Price',
		color: '#8884d8', // Purple
	},
	priceViewToCheckoutRate: {
		label: 'Price → Checkout',
		color: '#82ca9d', // Green
	},
	checkoutToPurchaseRate: {
		label: 'Checkout → Purchase',
		color: '#ffc658', // Orange
	},
	customRate: {
		label: 'Custom Rate',
		color: '#ff8042', // Red/Orange
	},
} satisfies ChartConfig;

// Helper to calculate rate safely
const calculateRate = (numerator: number, denominator: number) => {
	if (!denominator || denominator === 0) return 0;
	return (numerator / denominator) * 100;
};

const CustomTooltipContent = ({ active, payload, label }: TooltipProps<number, string>) => {
	if (active && payload && payload.length) {
		const dataPoint = payload[0].payload as any; // Using any to access computed properties
		//const newRevenue = dataPoint.revenue - dataPoint.renewalRevenue;

		return (
			<div className="rounded-lg border bg-background p-4 shadow-sm min-w-[300px]">
				<div className="mb-2 border-b pb-2">
					<h3 className="font-semibold">
						{new Date(label).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
					</h3>
				</div>
				<div className="flex flex-col gap-4 mb-4">
					<div className="flex flex-col border-b pb-2">
						<div className="flex justify-between items-baseline">
							<span className="text-sm text-muted-foreground">Revenue</span>
							<span className="text-2xl font-bold" style={{ color: 'var(--color-revenue)' }}>
								${dataPoint.revenue.toLocaleString()}
							</span>
						</div>
						<div className="flex justify-between items-baseline mt-1">
							<span className="text-sm text-muted-foreground">MRR</span>
							<span className="text-xl font-bold" style={{ color: chartConfig.mrr.color }}>
								${dataPoint.mrr.toLocaleString()}
							</span>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="flex flex-col">
							<span className="text-sm text-muted-foreground">Visitors</span>
							<span className="text-lg font-bold" style={{ color: 'var(--color-visitors)' }}>
								{dataPoint.visitors.toLocaleString()}
							</span>
						</div>
						<div className="flex flex-col">
							<span className="text-sm text-muted-foreground">Pricing Views</span>
							<span className="text-lg font-bold" style={{ color: 'var(--color-pricingViews)' }}>
								{dataPoint.pricingViews.toLocaleString()}
							</span>
						</div>
						<div className="flex flex-col">
							<span className="text-sm text-muted-foreground">Checkouts</span>
							<span className="text-lg font-bold" style={{ color: 'var(--color-checkouts)' }}>
								{dataPoint.checkouts}
							</span>
						</div>
						<div className="flex flex-col">
							<span className="text-sm text-muted-foreground">Purchases</span>
							<span className="text-lg font-bold" style={{ color: 'var(--color-purchases)' }}>
								{dataPoint.purchases}
							</span>
						</div>
					</div>

					{/* Rates Section */}
					<div className="border-t pt-2 grid grid-cols-2 gap-4">
						<div className="flex flex-col">
							<span className="text-xs text-muted-foreground">Visitor → Price</span>
							<span className="font-bold" style={{ color: chartConfig.visitorToPriceViewRate.color }}>
								{dataPoint.visitorToPriceViewRate.toFixed(1)}%
							</span>
						</div>
						<div className="flex flex-col">
							<span className="text-xs text-muted-foreground">Price → Checkout</span>
							<span className="font-bold" style={{ color: chartConfig.priceViewToCheckoutRate.color }}>
								{dataPoint.priceViewToCheckoutRate.toFixed(1)}%
							</span>
						</div>
						<div className="flex flex-col">
							<span className="text-xs text-muted-foreground">Checkout → Purchase</span>
							<span className="font-bold" style={{ color: chartConfig.checkoutToPurchaseRate.color }}>
								{dataPoint.checkoutToPurchaseRate.toFixed(1)}%
							</span>
						</div>
						{/* Show custom rate if enabled */}
						{dataPoint.customRate !== undefined && (
							<div className="flex flex-col">
								<span className="text-xs text-muted-foreground">Custom Rate</span>
								<span className="font-bold" style={{ color: chartConfig.customRate.color }}>
									{dataPoint.customRate.toFixed(1)}%
								</span>
							</div>
						)}
					</div>
				</div>

				<div className="mb-2 border-b pb-1 mt-2">
					<h4 className="text-xs font-semibold text-muted-foreground">Referring Domains</h4>
				</div>
				<div className="text-xs space-y-1 mb-4">
					{Object.entries(dataPoint.referringDomains)
						.sort(([, a], [, b]) => (b as number) - (a as number))
						.slice(0, 5) // Top 5
						.map(([domain, count]) => {
							let displayDomain = domain;
							if (domain === '$direct') displayDomain = 'Direct';
							else if (domain.includes('posthog_breakdown_other')) displayDomain = 'Other';
							else displayDomain = domain.replace(/^www\./, '');

							// Capitalize first letter
							displayDomain = displayDomain.charAt(0).toUpperCase() + displayDomain.slice(1);

							return (
								<div key={domain} className="flex justify-between">
									<span className="truncate max-w-[150px]" title={displayDomain}>
										{displayDomain}
									</span>
									<span className="font-medium">{count as React.ReactNode}</span>
								</div>
							);
						})}
					{Object.keys(dataPoint.referringDomains).length === 0 && <span className="text-muted-foreground italic">No referral data</span>}
				</div>
			</div>
		);
	}
	return null;
};

type MetricKey = keyof typeof chartConfig;

export function OverviewChart({ data }: OverviewChartProps) {
	const [activeMetrics, setActiveMetrics] = useState<MetricKey[]>(['revenue', 'visitors', 'pricingViews', 'checkouts', 'purchases']);
	const [customConfig, setCustomConfig] = useState({ numerator: 'purchases', denominator: 'visitors' });
	const [isConfigOpen, setIsConfigOpen] = useState(false);

	useEffect(() => {
		const saved = localStorage.getItem('dashboard_active_metrics');
		if (saved) {
			try {
				setActiveMetrics(JSON.parse(saved));
			} catch (e) {
				console.error('Failed to parse saved metrics', e);
			}
		}
		const savedCustom = localStorage.getItem('dashboard_custom_rate_config');
		if (savedCustom) {
			try {
				setCustomConfig(JSON.parse(savedCustom));
			} catch (e) {
				console.error('Failed to parse custom config', e);
			}
		}
	}, []);

	const toggleMetric = (metric: MetricKey) => {
		const newMetrics = activeMetrics.includes(metric) ? activeMetrics.filter((m) => m !== metric) : [...activeMetrics, metric];

		setActiveMetrics(newMetrics);
		localStorage.setItem('dashboard_active_metrics', JSON.stringify(newMetrics));
	};

	const saveCustomConfig = (newConfig: { numerator: string; denominator: string }) => {
		setCustomConfig(newConfig);
		localStorage.setItem('dashboard_custom_rate_config', JSON.stringify(newConfig));
	};

	const processedData = useMemo(() => {
		return data.map((item) => ({
			...item,
			visitorToPriceViewRate: calculateRate(item.pricingViews, item.visitors),
			priceViewToCheckoutRate: calculateRate(item.checkouts, item.pricingViews),
			checkoutToPurchaseRate: calculateRate(item.purchases, item.checkouts),
			customRate: calculateRate((item as any)[customConfig.numerator], (item as any)[customConfig.denominator]),
		}));
	}, [data, customConfig]);

	const metricOptions = [
		{ value: 'visitors', label: 'Visitors' },
		{ value: 'pricingViews', label: 'Pricing Views' },
		{ value: 'checkouts', label: 'Checkouts' },
		{ value: 'purchases', label: 'Purchases' },
		{ value: 'mrr', label: 'MRR' },
		// Excluding Revenue for now as it doesn't make sense in rate calc usually (e.g. Visitors/Revenue?)
	];

	const rateMetrics: MetricKey[] = ['visitorToPriceViewRate', 'priceViewToCheckoutRate', 'checkoutToPurchaseRate', 'customRate'];
	const isOnlyRates = activeMetrics.length > 0 && activeMetrics.every((m) => rateMetrics.includes(m));

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap gap-2 items-center">
				{(Object.keys(chartConfig) as MetricKey[]).map((metric) => (
					<div key={metric} className="flex items-center gap-1">
						<Button
							variant="outline"
							size="sm"
							onClick={() => toggleMetric(metric)}
							className={cn(
								'border-2',
								activeMetrics.includes(metric) ? 'bg-accent/50 border-[color:var(--color-border-active)]' : 'opacity-50 grayscale'
							)}
							style={
								{
									// Use CSS variable injection for dynamic border color based on chart config
									'--color-border-active': chartConfig[metric].color,
								} as React.CSSProperties
							}
						>
							<div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: chartConfig[metric].color }} />
							{chartConfig[metric].label}
						</Button>
						{metric === 'customRate' && (
							<Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
								<DialogTrigger asChild>
									<Button variant="ghost" size="icon" className="h-8 w-8">
										<Settings2 className="h-4 w-4" />
									</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Configure Custom Rate</DialogTitle>
									</DialogHeader>
									<div className="grid gap-4 py-4">
										<div className="grid grid-cols-4 items-center gap-4">
											<Label htmlFor="numerator" className="text-right">
												Numerator
											</Label>
											<Select
												value={customConfig.numerator}
												onValueChange={(val) => saveCustomConfig({ ...customConfig, numerator: val })}
											>
												<SelectTrigger className="col-span-3">
													<SelectValue placeholder="Select metric" />
												</SelectTrigger>
												<SelectContent>
													{metricOptions.map((opt) => (
														<SelectItem key={opt.value} value={opt.value}>
															{opt.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
										<div className="grid grid-cols-4 items-center gap-4">
											<Label htmlFor="denominator" className="text-right">
												Denominator
											</Label>
											<Select
												value={customConfig.denominator}
												onValueChange={(val) => saveCustomConfig({ ...customConfig, denominator: val })}
											>
												<SelectTrigger className="col-span-3">
													<SelectValue placeholder="Select metric" />
												</SelectTrigger>
												<SelectContent>
													{metricOptions.map((opt) => (
														<SelectItem key={opt.value} value={opt.value}>
															{opt.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
								</DialogContent>
							</Dialog>
						)}
					</div>
				))}
			</div>

			<ChartContainer config={chartConfig} className="min-h-[400px] w-full">
				<ComposedChart data={processedData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
					<CartesianGrid vertical={false} strokeDasharray="3 3" />
					<XAxis
						dataKey="date"
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						minTickGap={32}
						tickFormatter={(value) => {
							const date = new Date(value);
							return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
						}}
					/>

					{/* Shared Axes: Left for counts, Right for Revenue */}
					<YAxis yAxisId="left" orientation="left" tickLine={false} axisLine={false} tickMargin={8} hide={isOnlyRates} />
					<YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} tickMargin={8} unit="$" hide={isOnlyRates} />

					{/* Hidden Axis for Percentage (Rates) - Auto scaled */}
					<YAxis
						yAxisId="percentage"
						orientation="right"
						hide={!isOnlyRates}
						domain={isOnlyRates ? [0, 100] : [0, 'auto']}
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						unit="%"
					/>

					<Tooltip content={<CustomTooltipContent />} />

					{/* No Recharts Legend - using custom toggles above */}

					{activeMetrics.includes('visitors') && (
						<Line
							yAxisId="left"
							type="monotone"
							dataKey="visitors"
							stroke="var(--color-visitors)"
							strokeWidth={2}
							dot={false}
							name="Unique Visitors"
						/>
					)}
					{activeMetrics.includes('pricingViews') && (
						<Line
							yAxisId="left"
							type="monotone"
							dataKey="pricingViews"
							stroke="var(--color-pricingViews)"
							strokeWidth={2}
							dot={false}
							name="Unique Pricing Views"
						/>
					)}
					{activeMetrics.includes('checkouts') && (
						<Line
							yAxisId="left"
							type="monotone"
							dataKey="checkouts"
							stroke="var(--color-checkouts)"
							strokeWidth={2}
							dot={false}
							name="Unique Checkouts"
						/>
					)}
					{activeMetrics.includes('purchases') && (
						<Line
							yAxisId="left"
							type="monotone"
							dataKey="purchases"
							stroke="var(--color-purchases)"
							strokeWidth={2}
							dot={false}
							name="Unique Purchases"
						/>
					)}

					{activeMetrics.includes('revenue') && (
						<Line
							yAxisId="right"
							type="monotone"
							dataKey="revenue"
							stroke="var(--color-revenue)"
							strokeWidth={2}
							dot={false}
							name="Revenue"
						/>
					)}
					{activeMetrics.includes('mrr') && (
						<Line yAxisId="right" type="monotone" dataKey="mrr" stroke={chartConfig.mrr.color} strokeWidth={2} dot={false} name="MRR" />
					)}

					{/* Rate Lines - Using percentage axis */}
					{activeMetrics.includes('visitorToPriceViewRate') && (
						<Line
							yAxisId="percentage"
							type="monotone"
							dataKey="visitorToPriceViewRate"
							stroke={chartConfig.visitorToPriceViewRate.color}
							strokeWidth={2}
							strokeDasharray="5 5"
							dot={false}
							name="Visitor → Price"
						/>
					)}
					{activeMetrics.includes('priceViewToCheckoutRate') && (
						<Line
							yAxisId="percentage"
							type="monotone"
							dataKey="priceViewToCheckoutRate"
							stroke={chartConfig.priceViewToCheckoutRate.color}
							strokeWidth={2}
							strokeDasharray="5 5"
							dot={false}
							name="Price → Checkout"
						/>
					)}
					{activeMetrics.includes('checkoutToPurchaseRate') && (
						<Line
							yAxisId="percentage"
							type="monotone"
							dataKey="checkoutToPurchaseRate"
							stroke={chartConfig.checkoutToPurchaseRate.color}
							strokeWidth={2}
							strokeDasharray="5 5"
							dot={false}
							name="Checkout → Purchase"
						/>
					)}
					{activeMetrics.includes('customRate') && (
						<Line
							yAxisId="percentage"
							type="monotone"
							dataKey="customRate"
							stroke={chartConfig.customRate.color}
							strokeWidth={2}
							strokeDasharray="3 3"
							dot={false}
							name="Custom Rate"
						/>
					)}
				</ComposedChart>
			</ChartContainer>
		</div>
	);
}
