
export interface PostHogMetrics {
  date: string; // ISO date string YYYY-MM-DD
  visitors: number;
  pricingViews: number;
  checkouts: number;
  purchases: number;
  referringDomains: Record<string, number>; // domain -> count
}

export async function fetchPostHogData(startDate: Date, endDate: Date): Promise<PostHogMetrics[]> {
  const apiKey = process.env.POSTHOG_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const host = process.env.POSTHOG_HOST || 'https://app.posthog.com';

  if (!apiKey || !projectId) {
    console.warn("PostHog credentials missing, using mock data.");
    return generateMockPostHogData(startDate, endDate);
  }

  try {
    const events = [
      { id: '$pageview', name: 'visitors' },
      { id: 'pricing_modal_opened', name: 'pricingViews' },
      { id: 'pricing_get_started_clicked', name: 'checkouts' },
      { id: 'purchase_thank_you', name: 'purchases' }
    ];

    // 1. Fetch Trends for all events
    // We fetch them in one go if possible, or parallel
    // To get "Unique Users", we use the "dau" math (Daily Active Users) which counts unique users per day.
    const trendUrl = `${host}/api/projects/${projectId}/insights/trend/?`;
    const params = new URLSearchParams({
      events: JSON.stringify(events.map(e => ({ id: e.id, math: 'dau' }))), // Use 'dau' for unique users
      date_from: startDate.toISOString(),
      date_to: endDate.toISOString(),
      display: 'ActionsLineGraph', // Returns daily counts
      interval: 'day',
    });

    const trendResponse = await fetch(trendUrl + params.toString(), {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!trendResponse.ok) {
        throw new Error(`PostHog Trend API error: ${trendResponse.statusText}`);
    }

    const trendData = await trendResponse.json();
    // trendData.result should be an array of objects, one per event
    // Each object has "data" (array of counts) and "labels" (array of dates)
    
    // 2. Fetch Referring Domains (Breakdown of $pageview)
    // We'll get top referring domains for the whole period for simplicity of the "hover" logic which usually requires pre-fetched data
    // Or we can fetch daily breakdown? Daily breakdown for referring domains is heavy.
    // The requirement is "if I focus on any point on the graph... show referring domains".
    // So we need referring domains PER DAY.
    const domainUrl = `${host}/api/projects/${projectId}/insights/trend/?`;
    const domainParams = new URLSearchParams({
        events: JSON.stringify([{ id: '$pageview', math: 'dau' }]), // Use 'dau' for unique users here too
        date_from: startDate.toISOString(),
        date_to: endDate.toISOString(),
        breakdown: '$referring_domain',
        breakdown_limit: '10', // Top 10
        interval: 'day'
    });
    
    const domainResponse = await fetch(domainUrl + domainParams.toString(), {
        headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    
    if (!domainResponse.ok) {
         console.error("PostHog Domain API error", await domainResponse.text());
        // Non-fatal, return trends without domains
    }
    const domainData = domainResponse.ok ? await domainResponse.json() : { result: [] };

    // Process Data
    const results: Record<string, PostHogMetrics> = {};

    // Initialize map with dates
    // Assuming trendData.result[0] has the complete date range
    if (trendData.result && trendData.result.length > 0) {
        trendData.result[0].days.forEach((day: string) => {
             // PostHog returns dates like "2023-10-27"
             results[day] = {
                 date: day,
                 visitors: 0,
                 pricingViews: 0,
                 checkouts: 0,
                 purchases: 0,
                 referringDomains: {}
             };
        });
    }

    // Fill event counts
    trendData.result.forEach((eventResult: any, index: number) => {
        const metricName = events[index].name as keyof PostHogMetrics;
        eventResult.data.forEach((count: number, idx: number) => {
            const date = eventResult.days[idx];
            if (results[date]) {
                (results[date] as any)[metricName] = count;
            }
        });
    });

    // Fill referring domains
    // domainData.result is array of breakdown values.
    // Each item has "label" (the domain) and "data" (counts per day)
    if (domainData.result) {
        domainData.result.forEach((item: any) => {
            const domain = item.label;
            item.data.forEach((count: number, idx: number) => {
                const date = item.days[idx];
                if (results[date]) {
                    results[date].referringDomains[domain] = count;
                }
            });
        });
    }

    return Object.values(results).sort((a, b) => a.date.localeCompare(b.date));

  } catch (error) {
    console.error("Error fetching PostHog data:", error);
    return generateMockPostHogData(startDate, endDate);
  }
}

function generateMockPostHogData(startDate: Date, endDate: Date): PostHogMetrics[] {
  const data: PostHogMetrics[] = [];
  const currentDate = new Date(startDate);
  const domains = ['google.com', 'twitter.com', 'linkedin.com', 'direct', 'facebook.com'];

  while (currentDate <= endDate) {
    const visitors = 500 + Math.floor(Math.random() * 500);
    const pricingViews = Math.floor(visitors * 0.3);
    const checkouts = Math.floor(pricingViews * 0.1);
    const purchases = Math.floor(checkouts * 0.5);

    const referringDomains: Record<string, number> = {};
    let remainingVisitors = visitors;
    
    domains.forEach(domain => {
      const count = Math.floor(Math.random() * (remainingVisitors / 2));
      referringDomains[domain] = count;
      remainingVisitors -= count;
    });
    if (remainingVisitors > 0) referringDomains['other'] = remainingVisitors;

    data.push({
      date: currentDate.toISOString().split('T')[0],
      visitors,
      pricingViews,
      checkouts,
      purchases,
      referringDomains,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return data;
}
