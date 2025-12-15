import { lemonSqueezySetup, listOrders, listSubscriptionInvoices, listCustomers, listSubscriptions } from '@lemonsqueezy/lemonsqueezy.js';

export interface LemonSqueezyMetrics {
	date: string; // ISO date string YYYY-MM-DD
	mrr: number;
	revenue: number;
	renewalRevenue: number;
	churnRate: number; // percentage
	activeCustomers: number;
	purchases: number; // New field for purchase count
}

export async function fetchLemonSqueezyData(startDate: Date, endDate: Date): Promise<LemonSqueezyMetrics[]> {
	const apiKey = process.env.LEMONSQUEEZY_API_KEY;
	const storeId = process.env.LEMONSQUEEZY_STORE_ID;

	if (!apiKey) {
		console.warn('LemonSqueezy API Key missing.');
		return [];
	}

	lemonSqueezySetup({ apiKey, onError: (error) => console.error('Lemon Squeezy SDK Error:', error) });

	try {
		// 1. Fetch Orders
		// The SDK's listOrders handles pagination via `next` links usually, but let's check return type.
		// Usually standard LS SDK returns { data, meta, links, error } for one page.
		// We need to implement manual pagination loop using the SDK's response.
		// But `listOrders` arguments allow filtering.

		const fetchAllOrders = async () => {
			let allOrders: any[] = [];
			let hasMore = true;
			let page = 1;

			while (hasMore) {
				const { data, error } = await listOrders({
					filter: { storeId: storeId },
					page: { number: page, size: 100 }, // Maximize page size
				});

				if (error) throw new Error(error.message);
				if (!data) break;

				const orders = data.data;
				const meta = data.meta;

				// Check dates to stop early
				let allInPageTooOld = true;
				for (const order of orders) {
					const createdAt = new Date(order.attributes.created_at);
					if (createdAt >= startDate) {
						allInPageTooOld = false;
					}

					if (createdAt >= startDate && createdAt <= endDate) {
						allOrders.push(order);
					}
				}

				// If the latest item in this page is already older than startDate, we can stop?
				// Default sort is -created_at (newest first).
				const lastItem = orders[orders.length - 1];
				if (lastItem && new Date(lastItem.attributes.created_at) < startDate) {
					hasMore = false;
				} else if (meta?.page.lastPage && page >= meta.page.lastPage) {
					hasMore = false;
				} else {
					page++;
				}
			}
			return allOrders;
		};

		const orders = await fetchAllOrders();

		// 2. Fetch Subscription Invoices
		const fetchAllInvoices = async () => {
			let allInvoices: any[] = [];
			let hasMore = true;
			let page = 1;

			while (hasMore) {
				const { data, error } = await listSubscriptionInvoices({
					filter: { storeId: storeId },
					page: { number: page, size: 100 },
				});

				if (error) throw new Error(error.message);
				if (!data) break;

				const invoices = data.data;
				const meta = data.meta;

				for (const inv of invoices) {
					const createdAt = new Date(inv.attributes.created_at);
					if (createdAt >= startDate && createdAt <= endDate) {
						allInvoices.push(inv);
					}
				}

				const lastItem = invoices[invoices.length - 1];
				if (lastItem && new Date(lastItem.attributes.created_at) < startDate) {
					hasMore = false;
				} else if (meta?.page.lastPage && page >= meta.page.lastPage) {
					hasMore = false;
				} else {
					page++;
				}
			}
			return allInvoices;
		};

		const invoices = await fetchAllInvoices();

		// 3. Fetch Customers for MRR
		// We need ALL customers to calculate total MRR accurately.
		// This could be heavy but necessary for exactness.
		const fetchAllCustomers = async () => {
			let allCustomers: any[] = [];
			let hasMore = true;
			let page = 1;

			while (hasMore) {
				const { data, error } = await listCustomers({
					filter: { storeId: storeId },
					page: { number: page, size: 100 },
				});
				if (error) throw new Error(error.message);
				if (!data) break;

				allCustomers.push(...data.data);
				const meta = data.meta;

				if (meta?.page.lastPage && page >= meta.page.lastPage) {
					hasMore = false;
				} else {
					page++;
				}
			}
			return allCustomers;
		};

		const customers = await fetchAllCustomers();
		// Removed premature MRR calculation here to defer it until after active subscriptions are fetched.

		// 4. Active Subscriptions Count
		// Fetch only active ones
		const fetchActiveSubs = async () => {
			let allSubs: any[] = [];
			let hasMore = true;
			let page = 1;

			while (hasMore) {
				const { data, error } = await listSubscriptions({
					filter: { storeId: storeId, status: 'active' },
					page: { number: page, size: 100 },
				});
				if (error) throw new Error(error.message);
				if (!data) break;
				allSubs.push(...data.data);
				const meta = data.meta;

				if (meta?.page.lastPage && page >= meta.page.lastPage) {
					hasMore = false;
				} else {
					page++;
				}
			}
			return allSubs;
		};
		const activeSubs = await fetchActiveSubs();

		// 4. Calculate MRR from Active Subscriptions Only
		// We use the set of customer IDs from active subscriptions to filter the customer list.
		// This ensures we only sum the MRR of customers who are currently active.
		const activeCustomerIds = new Set(activeSubs.map((s: any) => String(s.attributes.customer_id)));

		let currentMRR = 0;
		customers.forEach((c: any) => {
			if (activeCustomerIds.has(String(c.id))) {
				currentMRR += (c.attributes.mrr || 0) / 100;
			}
		});

		const correctActiveCustomersCount = activeSubs.length;

		// Group by Date
		const dailyData: Record<string, { revenue: number; renewalRevenue: number; purchases: number }> = {};
		const currentDate = new Date(startDate);
		while (currentDate <= endDate) {
			dailyData[currentDate.toISOString().split('T')[0]] = { revenue: 0, renewalRevenue: 0, purchases: 0 };
			currentDate.setDate(currentDate.getDate() + 1);
		}

		// Process Orders
		orders.forEach((order: any) => {
			if (order.attributes.status !== 'paid') return;
			const date = order.attributes.created_at.split('T')[0];
			if (dailyData[date]) {
				const amount = order.attributes.total / 100;
				dailyData[date].revenue += amount;
				dailyData[date].purchases += 1;
			}
		});

		// Process Invoices
		invoices.forEach((invoice: any) => {
			if (invoice.attributes.status !== 'paid') return;

			// Double counting check
			const billingReason = invoice.attributes.billing_reason;
			const isInitial = billingReason === 'initial' || !!invoice.attributes.order_id;

			if (!isInitial) {
				const date = invoice.attributes.created_at.split('T')[0];
				if (dailyData[date]) {
					const amount = invoice.attributes.total / 100;
					dailyData[date].revenue += amount;
					dailyData[date].renewalRevenue += amount;
				}
			}
		});

		return Object.entries(dailyData)
			.map(([date, metrics]) => ({
				date,
				revenue: metrics.revenue,
				renewalRevenue: metrics.renewalRevenue,
				mrr: currentMRR,
				activeCustomers: correctActiveCustomersCount,
				churnRate: 0,
				purchases: metrics.purchases,
			}))
			.sort((a, b) => a.date.localeCompare(b.date));
	} catch (error) {
		console.error('Error fetching LemonSqueezy data:', error);
		return [];
	}
}
