'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getDashboardData, DashboardData } from '@/app/actions';
import { OverviewChart } from '@/components/overview-chart';
import { Loader2, Calendar as CalendarIcon, ArrowDown, RefreshCcw } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface CachePayload {
    params: {
        timeRange: string;
        viewMode: string;
        dateFrom?: string;
        dateTo?: string;
    };
    data: DashboardData[];
    timestamp: number;
}

export function DashboardClient() {
  const [timeRange, setTimeRange] = useState('30d');
  const [granularity, setGranularity] = useState('day');
  const [data, setData] = useState<DashboardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple');
  
  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });

  useEffect(() => {
    // Load persisted view mode on mount
    const savedMode = localStorage.getItem('dashboard_view_mode');
    if (savedMode === 'simple' || savedMode === 'advanced') {
        setViewMode(savedMode);
    }
  }, []);

  const handleViewModeChange = (checked: boolean) => {
      const mode = checked ? 'advanced' : 'simple';
      setViewMode(mode);
      localStorage.setItem('dashboard_view_mode', mode);
  };

  const loadData = useCallback(async (forceRefresh = false) => {
      setLoading(true);
      try {
        // Determine params
        const currentParams = {
            timeRange,
            viewMode,
            dateFrom: date?.from?.toISOString(),
            dateTo: date?.to?.toISOString()
        };

        // If not forcing refresh, try to load from cache
        if (!forceRefresh) {
            const cached = localStorage.getItem('dashboard_data_cache');
            if (cached) {
                try {
                    const parsedCache: CachePayload = JSON.parse(cached);
                    // Check if params match
                    // For simple mode, the dates are calculated dynamically (yesterday/today), so we need to be careful.
                    // But typically 'simple' mode implies a specific behavior.
                    // However, to ensure we don't show stale data if the user changes settings, strict equality on params is good.
                    // Exception: in Simple mode, we calculate dates inside the fetch logic, so 'currentParams' might not capture the *actual* fetched range unless we pre-calculate it.
                    
                    // Let's refine params for Simple Mode
                    // In Simple Mode, timeRange is ignored, dates are Yesterday-Today.
                    // But if we cache with 'simple' viewMode, we should also check if the cached data is *recent enough* (e.g. same day).
                    // Actually, let's just use the params we have. If viewMode is 'simple', we rely on 'viewMode' being the key.
                    // But if I load it tomorrow, 'simple' is still 'simple', but I need new data.
                    // So for simple mode, we should perhaps include the current date in the params?
                    // Or just let the cache logic handle it:
                    
                    // Pre-calculation for Simple Mode to ensure cache validity
                    let effectiveParams = { ...currentParams };
                    if (viewMode === 'simple') {
                         const today = new Date();
                         const yesterday = new Date(new Date().setDate(today.getDate() - 1));
                         effectiveParams.dateFrom = yesterday.toISOString().split('T')[0]; // compare by day
                         effectiveParams.dateTo = today.toISOString().split('T')[0];
                    }

                    const cachedParams = parsedCache.params;
                    
                    // Simple deep compare
                    const isMatch = JSON.stringify(effectiveParams) === JSON.stringify(cachedParams);

                    if (isMatch) {
                        setData(parsedCache.data);
                        setLoading(false);
                        return; 
                    }
                } catch (e) {
                    console.error("Failed to parse cache", e);
                }
            }
        }

        // Fetch from API
        let result: DashboardData[];
        let fetchParams = { ...currentParams }; // Store what we actually used

        if (viewMode === 'simple') {
            const today = new Date();
            const yesterday = new Date(new Date().setDate(today.getDate() - 1));
            // Update params for cache consistency
            fetchParams.dateFrom = yesterday.toISOString().split('T')[0];
            fetchParams.dateTo = today.toISOString().split('T')[0];
            
            result = await getDashboardData('custom', yesterday, today);
        } else {
            if (timeRange === 'custom' && date?.from && date?.to) {
                result = await getDashboardData(timeRange, date.from, date.to);
            } else {
                result = await getDashboardData(timeRange);
            }
        }
        
        setData(result);
        
        // Update Cache
        const cachePayload: CachePayload = {
            params: fetchParams,
            data: result,
            timestamp: Date.now()
        };
        localStorage.setItem('dashboard_data_cache', JSON.stringify(cachePayload));

      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setLoading(false);
      }
  }, [timeRange, date, viewMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
      loadData(true);
  };

  const aggregatedData = useMemo(() => {
    if (granularity === 'day') return data;
    
    // Simple aggregation logic (could be more robust)
    const aggregated: DashboardData[] = [];
    let currentBucket: DashboardData | null = null;
    
    data.forEach((item, index) => {
        const date = new Date(item.date);
        let bucketKey = '';
        
        if (granularity === 'week') {
            // ISO week date or simply start of week
             const day = date.getDay();
             const diff = date.getDate() - day + (day == 0 ? -6:1); // adjust when day is sunday
             const weekStart = new Date(date.setDate(diff)).toISOString().split('T')[0];
             bucketKey = weekStart;
        } else if (granularity === 'month') {
            bucketKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
        }

        if (!currentBucket || currentBucket.date !== bucketKey) {
            if (currentBucket) aggregated.push(currentBucket);
            currentBucket = { ...item, date: bucketKey, referringDomains: { ...item.referringDomains } };
        } else {
            // Aggregate values
            currentBucket.visitors += item.visitors;
            currentBucket.pricingViews += item.pricingViews;
            currentBucket.checkouts += item.checkouts;
            currentBucket.purchases += item.purchases;
            currentBucket.revenue += item.revenue;
            currentBucket.renewalRevenue += item.renewalRevenue;
            // MRR, Active Customers, Churn are point-in-time or averages, not sums.
            // For simplicity, let's take the last value or average.
            currentBucket.mrr = item.mrr; 
            currentBucket.activeCustomers = item.activeCustomers;
            currentBucket.churnRate = item.churnRate; // Maybe average?

            // Merge referring domains
            Object.entries(item.referringDomains).forEach(([domain, count]) => {
                currentBucket!.referringDomains[domain] = (currentBucket!.referringDomains[domain] || 0) + count;
            });
        }
    });
    if (currentBucket) aggregated.push(currentBucket);
    
    return aggregated;

  }, [data, granularity]);

  // Latest data point for simple view or top cards
  const latestData = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className="p-4 md:p-8 space-y-8">
      {/* Header Section */}
      {viewMode === 'advanced' ? (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <p className="text-muted-foreground">Overview of your SaaS metrics and analytics.</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
                <div className="flex items-center space-x-2">
                    <Switch 
                        id="view-mode" 
                        checked={viewMode === 'advanced'}
                        onCheckedChange={handleViewModeChange}
                    />
                    <Label htmlFor="view-mode">Advanced</Label>
                </div>

                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                    {timeRange === 'custom' && (
                        <div className="grid gap-2">
                            <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    id="date"
                                    variant={"outline"}
                                    className={cn(
                                    "w-[240px] justify-start text-left font-normal",
                                    !date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date?.from ? (
                                    date.to ? (
                                        <>
                                        {format(date.from, "LLL dd, y")} -{" "}
                                        {format(date.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(date.from, "LLL dd, y")
                                    )
                                    ) : (
                                    <span>Pick a date</span>
                                    )}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={date?.from}
                                    selected={date}
                                    onSelect={setDate}
                                    numberOfMonths={2}
                                />
                                </PopoverContent>
                            </Popover>
                        </div>
                    )}

                    <Select value={timeRange} onValueChange={setTimeRange}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select time range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7d">Last 7 days</SelectItem>
                            <SelectItem value="14d">Last 14 days</SelectItem>
                            <SelectItem value="30d">Last 30 days</SelectItem>
                            <SelectItem value="90d">Last 3 months</SelectItem>
                            <SelectItem value="ytd">Year to Date</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                            <SelectItem value="custom">Custom Range</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={granularity} onValueChange={setGranularity}>
                        <SelectTrigger className="w-[130px]">
                            <SelectValue placeholder="Granularity" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="day">Daily</SelectItem>
                            <SelectItem value="week">Weekly</SelectItem>
                            <SelectItem value="month">Monthly</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </div>
      ) : (
        /* Simple Mode Header */
        <div className="flex flex-col items-center justify-center space-y-4 mb-8">
             <div className="text-center">
                  <h3 className="text-2xl font-bold">Today's Performance</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                      {latestData ? new Date(latestData.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Loading...'}
                  </p>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                    id="view-mode-simple" 
                    checked={viewMode === 'advanced'}
                    onCheckedChange={handleViewModeChange}
                />
                <Label htmlFor="view-mode-simple">Simple View</Label>
            </div>
        </div>
      )}

      {viewMode === 'simple' ? (
          <div className="space-y-8 max-w-md mx-auto">
              {/* Revenue & MRR Top Cards */}
              <div className="grid grid-cols-2 gap-3">
                  <Card className="bg-primary/5 border-primary/20 shadow-sm">
                      <CardContent className="p-3 flex flex-col items-center justify-center text-center">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Revenue</span>
                          <span className="text-xl font-bold text-primary mt-0.5">${latestData?.revenue.toLocaleString() || '0'}</span>
                          {latestData && (
                              <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground">
                                  <span className="whitespace-nowrap">New: <span className="font-semibold text-primary/80">${(latestData.revenue - latestData.renewalRevenue).toLocaleString()}</span></span>
                                  <span className="text-border">|</span>
                                  <span className="whitespace-nowrap">Ren: <span className="font-semibold text-primary/80">${latestData.renewalRevenue.toLocaleString()}</span></span>
                              </div>
                          )}
                      </CardContent>
                  </Card>
                  <Card className="bg-blue-500/5 border-blue-500/20 shadow-sm">
                      <CardContent className="p-3 flex flex-col items-center justify-center text-center">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">MRR</span>
                          <span className="text-xl font-bold text-blue-600 mt-0.5">${latestData?.mrr.toLocaleString() || '0'}</span>
                          <div className="text-[9px] text-muted-foreground mt-1">
                              Active: <span className="font-semibold text-foreground">{latestData?.activeCustomers || '0'}</span>
                          </div>
                      </CardContent>
                  </Card>
              </div>

              {/* Funnel */}
              <div className="flex flex-col items-center w-full space-y-4">
                  {/* Step 1: Visitors (100% width) */}
                  <div className="w-full relative group">
                      <div className="h-16 flex items-center justify-between px-4 border rounded-xl shadow-sm bg-card relative z-10">
                          <span className="text-sm font-medium text-muted-foreground">Visitors</span>
                          <span className="text-xl font-bold">{latestData?.visitors.toLocaleString() || '0'}</span>
                      </div>
                      
                      {/* Connector */}
                      <div className="absolute left-1/2 -bottom-6 w-px h-6 bg-border -translate-x-1/2 z-0"></div>
                      <div className="absolute left-1/2 -bottom-3 -translate-x-1/2 z-20">
                           <div className="bg-background px-2 text-[10px] font-medium text-muted-foreground border rounded-full py-0.5 flex items-center gap-1 shadow-sm">
                                <ArrowDown className="h-2.5 w-2.5" />
                                {latestData && latestData.visitors > 0 
                                    ? ((latestData.pricingViews / latestData.visitors) * 100).toFixed(1) 
                                    : '0.0'}%
                            </div>
                      </div>
                  </div>

                  {/* Step 2: Pricing Views (85% width) */}
                  <div className="w-[85%] relative group">
                      <div className="h-16 flex items-center justify-between px-4 border rounded-xl shadow-sm bg-card relative z-10">
                          <span className="text-sm font-medium text-muted-foreground">Pricing Views</span>
                          <span className="text-xl font-bold">{latestData?.pricingViews.toLocaleString() || '0'}</span>
                      </div>

                       {/* Connector */}
                      <div className="absolute left-1/2 -bottom-6 w-px h-6 bg-border -translate-x-1/2 z-0"></div>
                      <div className="absolute left-1/2 -bottom-3 -translate-x-1/2 z-20">
                           <div className="bg-background px-2 text-[10px] font-medium text-muted-foreground border rounded-full py-0.5 flex items-center gap-1 shadow-sm">
                                <ArrowDown className="h-2.5 w-2.5" />
                                {latestData && latestData.pricingViews > 0 
                                    ? ((latestData.checkouts / latestData.pricingViews) * 100).toFixed(1) 
                                    : '0.0'}%
                            </div>
                      </div>
                  </div>

                  {/* Step 3: Checkouts (70% width) */}
                  <div className="w-[70%] relative group">
                      <div className="h-16 flex items-center justify-between px-4 border rounded-xl shadow-sm bg-card relative z-10">
                          <span className="text-sm font-medium text-muted-foreground">Checkouts</span>
                          <span className="text-xl font-bold">{latestData?.checkouts.toLocaleString() || '0'}</span>
                      </div>

                       {/* Connector */}
                      <div className="absolute left-1/2 -bottom-6 w-px h-6 bg-border -translate-x-1/2 z-0"></div>
                      <div className="absolute left-1/2 -bottom-3 -translate-x-1/2 z-20">
                           <div className="bg-background px-2 text-[10px] font-medium text-muted-foreground border rounded-full py-0.5 flex items-center gap-1 shadow-sm">
                                <ArrowDown className="h-2.5 w-2.5" />
                                {latestData && latestData.checkouts > 0 
                                    ? ((latestData.purchases / latestData.checkouts) * 100).toFixed(1) 
                                    : '0.0'}%
                            </div>
                      </div>
                  </div>

                  {/* Step 4: Purchases (55% width) */}
                  <div className="w-[55%] relative group">
                      <div className="h-16 flex items-center justify-between px-4 border-2 border-green-500/20 rounded-xl shadow-sm bg-green-50/50 dark:bg-green-900/10 relative z-10">
                          <span className="text-sm font-medium text-green-700 dark:text-green-400">Purchases</span>
                          <span className="text-xl font-bold text-green-700 dark:text-green-400">{latestData?.purchases.toLocaleString() || '0'}</span>
                      </div>
                  </div>
              </div>
          </div>
      ) : (
        /* Advanced View (Existing Dashboard) */
        <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${data.reduce((acc, curr) => acc + curr.revenue, 0).toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            In selected period
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Current MRR</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            ${data.length > 0 ? data[data.length-1].mrr.toFixed(2) : '0.00'}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Latest value
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {data.length > 0 ? data[data.length-1].activeCustomers : 0}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Latest count
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Visitors</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {data.reduce((acc, curr) => acc + curr.visitors, 0).toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            In selected period
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>Overview</CardTitle>
                    <CardDescription>
                        Compare visitors, interactions, and revenue over time.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pl-2">
                    {loading ? (
                        <div className="flex h-[400px] items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : (
                        <OverviewChart data={aggregatedData} />
                    )}
                </CardContent>
            </Card>
        </>
      )}
      
      {/* Mobile Sticky Refresh Button */}
      <div className="fixed bottom-4 left-4 right-4 md:hidden z-50">
        <Button 
            className="w-full shadow-lg" 
            size="lg" 
            onClick={handleRefresh}
            disabled={loading}
        >
            {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
            )}
            Refresh Metrics
        </Button>
      </div>
    </div>
  );
}
