'use server'

import { fetchLemonSqueezyData, LemonSqueezyMetrics } from '@/lib/lemonsqueezy';
import { fetchPostHogData, PostHogMetrics } from '@/lib/posthog';

export interface DashboardData {
  date: string;
  // PostHog
  visitors: number;
  pricingViews: number;
  checkouts: number;
  referringDomains: Record<string, number>;
  // LemonSqueezy
  mrr: number;
  revenue: number;
  renewalRevenue: number;
  churnRate: number;
  activeCustomers: number;
  purchases: number; // Now sourced from LemonSqueezy
}

export async function getDashboardData(timeRange: string, customStart?: Date, customEnd?: Date): Promise<DashboardData[]> {
  // Determine date range based on timeRange
  let endDate = new Date();
  let startDate = new Date();
  
  if (timeRange === 'custom' && customStart && customEnd) {
      startDate = new Date(customStart);
      endDate = new Date(customEnd);
  } else if (timeRange === '7d') {
    startDate.setDate(endDate.getDate() - 7);
  } else if (timeRange === '14d') {
    startDate.setDate(endDate.getDate() - 14);
  } else if (timeRange === '30d') {
    startDate.setDate(endDate.getDate() - 30);
  } else if (timeRange === '90d') {
    startDate.setDate(endDate.getDate() - 90);
  } else if (timeRange === 'ytd') {
    startDate = new Date(new Date().getFullYear(), 0, 1); // Jan 1st of current year
  } else if (timeRange === 'all') {
    startDate = new Date(2023, 0, 1); // Arbitrary "all time" start, adjust as needed or use earliest data point
  } else {
     // default 30d
    startDate.setDate(endDate.getDate() - 30);
  }

  const [lemonData, postHogData] = await Promise.all([
    fetchLemonSqueezyData(startDate, endDate),
    fetchPostHogData(startDate, endDate),
  ]);

  // Merge data by date
  // Assuming both return sorted arrays with same dates for this mock
  // In real world, would need robust merging by date key
  
  const mergedData: DashboardData[] = lemonData.map((lemonItem) => {
    const postHogItem = postHogData.find(p => p.date === lemonItem.date) || {
      visitors: 0,
      pricingViews: 0,
      checkouts: 0,
      purchases: 0,
      referringDomains: {},
      date: lemonItem.date
    };

    return {
      ...lemonItem,
      ...postHogItem,
      purchases: lemonItem.purchases, // Override PostHog purchases with LemonSqueezy purchases
    };
  });

  return mergedData;
}
