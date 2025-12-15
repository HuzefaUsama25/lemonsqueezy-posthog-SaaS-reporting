'use client'

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getDashboardData, DashboardData } from '@/app/actions';
import { OverviewChart } from '@/components/overview-chart';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function DashboardClient() {
  const [timeRange, setTimeRange] = useState('30d');
  const [granularity, setGranularity] = useState('day');
  const [data, setData] = useState<DashboardData[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date(),
  });

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        let result;
        if (timeRange === 'custom' && date?.from && date?.to) {
             result = await getDashboardData(timeRange, date.from, date.to);
        } else {
             result = await getDashboardData(timeRange);
        }
        setData(result);
      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [timeRange, date]);

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

  return (
    <div className="p-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
            <p className="text-muted-foreground">Overview of your SaaS metrics and analytics.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
            {timeRange === 'custom' && (
                <div className="grid gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button
                            id="date"
                            variant={"outline"}
                            className={cn(
                            "w-[300px] justify-start text-left font-normal",
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
                 <SelectTrigger className="w-[180px]">
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
    </div>
  );
}
