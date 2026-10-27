/**
 * Management dashboard & counter-wise reports for customer routing.
 */

function buildDateFilters(from, to, col, params, alias = '') {
    const p = alias ? `${alias}.` : '';
    let sql = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        params.push(from);
        sql += ` AND ${p}${col} >= $${params.length}::date`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        params.push(to);
        sql += ` AND ${p}${col} < ($${params.length}::date + interval '1 day')`;
    }
    return sql;
}

async function loadManagementDashboard(query, userId, from, to) {
    const params = [userId];
    const visitDate = buildDateFilters(from, to, 'started_at', params, 'v');

    const visitStats = await query(
        `SELECT
            COUNT(DISTINCT v.id)::int AS total_visitors,
            COUNT(DISTINCT v.id) FILTER (
                WHERE EXISTS (
                    SELECT 1 FROM reseller_erp_visit_interactions i
                    WHERE i.visit_id = v.id AND i.outcome IN ('sale_closed', 'sale_and_forward')
                )
                OR EXISTS (
                    SELECT 1 FROM reseller_erp_visit_billing_queue b
                    WHERE b.visit_id = v.id AND b.billing_status = 'completed'
                )
            )::int AS total_purchasers,
            COUNT(DISTINCT v.id) FILTER (
                WHERE EXISTS (
                    SELECT 1 FROM reseller_erp_visit_interactions i
                    WHERE i.visit_id = v.id AND i.outcome IN ('no_sale', 'left_shop')
                )
                AND NOT EXISTS (
                    SELECT 1 FROM reseller_erp_visit_interactions i2
                    WHERE i2.visit_id = v.id AND i2.outcome IN ('sale_closed', 'sale_and_forward')
                )
            )::int AS total_no_purchase
         FROM reseller_erp_customer_visits v
         WHERE v.reseller_user_id = $1 ${visitDate}`,
        params,
    );

    const salesParams = [userId];
    const salesDate = buildDateFilters(from, to, 'created_at', salesParams, 'i');
    const salesRow = await query(
        `SELECT
            COALESCE(SUM(i.bill_amount_inr) FILTER (
                WHERE i.outcome IN ('sale_closed', 'sale_and_forward') AND i.bill_amount_inr IS NOT NULL
            ), 0)::float AS interaction_sales,
            COUNT(*) FILTER (WHERE i.outcome IN ('sale_closed', 'sale_and_forward'))::int AS sale_count
         FROM reseller_erp_visit_interactions i
         JOIN reseller_erp_customer_visits v ON v.id = i.visit_id
         WHERE v.reseller_user_id = $1 ${salesDate}`,
        salesParams,
    );

    const billingParams = [userId];
    const billingDate = buildDateFilters(from, to, 'completed_at', billingParams, 'b');
    const billingSales = await query(
        `SELECT COALESCE(SUM(b.payment_amount_inr), 0)::float AS billed,
                COUNT(*)::int AS bills
         FROM reseller_erp_visit_billing_queue b
         WHERE b.reseller_user_id = $1 AND b.billing_status = 'completed' ${billingDate}`,
        billingParams,
    );

    const interactionSales = Number(salesRow[0]?.interaction_sales || 0);
    const billedSales = Number(billingSales[0]?.billed || 0);
    const totalSales = Math.round((interactionSales + billedSales) * 100) / 100;
    const saleCount =
        Number(salesRow[0]?.sale_count || 0) + Number(billingSales[0]?.bills || 0);
    const visitors = Number(visitStats[0]?.total_visitors || 0);
    const purchasers = Number(visitStats[0]?.total_purchasers || 0);
    const noPurchase = Number(visitStats[0]?.total_no_purchase || 0);

    const topStaffParams = [userId];
    const topStaffDate = buildDateFilters(from, to, 'created_at', topStaffParams, 'i');
    const topStaff = await query(
        `SELECT i.operator_id, o.display_name, o.username,
                COALESCE(SUM(i.bill_amount_inr) FILTER (
                    WHERE i.outcome IN ('sale_closed', 'sale_and_forward')
                ), 0)::float AS sales_amount
         FROM reseller_erp_visit_interactions i
         JOIN reseller_erp_customer_visits v ON v.id = i.visit_id
         LEFT JOIN reseller_erp_operators o ON o.id = i.operator_id
         WHERE v.reseller_user_id = $1 ${topStaffDate}
         GROUP BY i.operator_id, o.display_name, o.username
         ORDER BY sales_amount DESC NULLS LAST
         LIMIT 5`,
        topStaffParams,
    );

    const topCounterParams = [userId];
    let counterDate = '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
        topCounterParams.push(from);
        counterDate += ` AND q.queued_at >= $${topCounterParams.length}::date`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        topCounterParams.push(to);
        counterDate += ` AND q.queued_at < ($${topCounterParams.length}::date + interval '1 day')`;
    }
    const topCountersVisitors = await query(
        `SELECT sc.name AS counter_name, COUNT(DISTINCT q.visit_id)::int AS visitors
         FROM reseller_erp_visit_queue q
         JOIN reseller_erp_store_counters sc ON sc.id = q.counter_id
         JOIN reseller_erp_customer_visits v ON v.id = q.visit_id
         WHERE v.reseller_user_id = $1 ${counterDate}
         GROUP BY sc.name ORDER BY visitors DESC LIMIT 5`,
        topCounterParams,
    );

    const topCounterSalesParams = [userId];
    const topCounterSalesDate = buildDateFilters(from, to, 'created_at', topCounterSalesParams, 'i');
    const topCountersSales = await query(
        `SELECT sc.name AS counter_name,
                COALESCE(SUM(i.bill_amount_inr), 0)::float AS sales_amount
         FROM reseller_erp_visit_interactions i
         JOIN reseller_erp_customer_visits v ON v.id = i.visit_id
         LEFT JOIN reseller_erp_store_counters sc ON sc.id = i.counter_id
         WHERE v.reseller_user_id = $1
           AND i.outcome IN ('sale_closed', 'sale_and_forward') ${topCounterSalesDate}
         GROUP BY sc.name ORDER BY sales_amount DESC LIMIT 5`,
        topCounterSalesParams,
    );

    const fuParams = [userId];
    const followUps = await query(
        `SELECT
            COUNT(*) FILTER (WHERE status = 'open')::int AS pending,
            COUNT(*) FILTER (
                WHERE status = 'open' AND follow_up_at IS NOT NULL AND follow_up_at < NOW()
            )::int AS overdue
         FROM reseller_erp_visit_follow_ups
         WHERE reseller_user_id = $1`,
        fuParams,
    );

    const moveParams = [userId];
    const moveDate = buildDateFilters(from, to, 'started_at', moveParams, 'v');
    const movement = await query(
        `SELECT AVG(cnt)::float AS avg_counters_per_visit
         FROM (
            SELECT v.id, COUNT(DISTINCT q.counter_id)::int AS cnt
            FROM reseller_erp_customer_visits v
            JOIN reseller_erp_visit_queue q ON q.visit_id = v.id
            WHERE v.reseller_user_id = $1 ${moveDate}
            GROUP BY v.id
         ) sub`,
        moveParams,
    );

    const conversion =
        visitors > 0 ? Math.round((purchasers / visitors) * 1000) / 10 : 0;
    const avgBill = saleCount > 0 ? Math.round((totalSales / saleCount) * 100) / 100 : 0;

    return {
        total_visitors: visitors,
        total_purchasers: purchasers,
        total_no_purchase: noPurchase,
        total_sales_inr: totalSales,
        overall_conversion_pct: conversion,
        average_bill_inr: avgBill,
        follow_ups_pending: Number(followUps[0]?.pending || 0),
        follow_ups_overdue: Number(followUps[0]?.overdue || 0),
        avg_counters_per_visit: Math.round(Number(movement[0]?.avg_counters_per_visit || 0) * 10) / 10,
        top_salespeople: topStaff.map((r) => ({
            operator_id: r.operator_id,
            name: r.display_name || r.username || 'Staff',
            sales_amount_inr: Math.round(Number(r.sales_amount || 0) * 100) / 100,
        })),
        top_counters_by_visitors: topCountersVisitors,
        top_counters_by_sales: topCountersSales.map((r) => ({
            counter_name: r.counter_name || '—',
            sales_amount_inr: Math.round(Number(r.sales_amount || 0) * 100) / 100,
        })),
    };
}

async function loadCounterWiseReport(query, userId, from, to) {
    const counters = await query(
        `SELECT id, name FROM reseller_erp_store_counters
         WHERE reseller_user_id = $1 AND is_active = true ORDER BY sort_order, name`,
        [userId],
    );
    const rows = [];
    for (const c of counters) {
        const params = [userId, c.id];
        let qDate = '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
            params.push(from);
            qDate += ` AND q.queued_at >= $${params.length}::date`;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            params.push(to);
            qDate += ` AND q.queued_at < ($${params.length}::date + interval '1 day')`;
        }
        const visitors = await query(
            `SELECT COUNT(DISTINCT q.visit_id)::int AS n
             FROM reseller_erp_visit_queue q
             JOIN reseller_erp_customer_visits v ON v.id = q.visit_id
             WHERE v.reseller_user_id = $1 AND q.counter_id = $2 ${qDate}`,
            params,
        );

        const iParams = [userId, c.id];
        const iDate = buildDateFilters(from, to, 'created_at', iParams, 'i');
        const stats = await query(
            `SELECT
                COUNT(*) FILTER (WHERE i.outcome IN ('sale_closed', 'sale_and_forward'))::int AS purchased,
                COUNT(*) FILTER (WHERE i.outcome IN ('no_sale', 'left_shop'))::int AS no_purchase,
                COUNT(*) FILTER (WHERE i.outcome = 'forward')::int AS transferred_out,
                COALESCE(SUM(i.bill_amount_inr) FILTER (
                    WHERE i.outcome IN ('sale_closed', 'sale_and_forward')
                ), 0)::float AS sales_value
             FROM reseller_erp_visit_interactions i
             JOIN reseller_erp_customer_visits v ON v.id = i.visit_id
             WHERE v.reseller_user_id = $1 AND i.counter_id = $2 ${iDate}`,
            iParams,
        );

        const inParams = [userId, c.id];
        let inDate = '';
        if (/^\d{4}-\d{2}-\d{2}$/.test(from)) {
            inParams.push(from);
            inDate += ` AND i.created_at >= $${inParams.length}::date`;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            inParams.push(to);
            inDate += ` AND i.created_at < ($${inParams.length}::date + interval '1 day')`;
        }
        const transferredIn = await query(
            `SELECT COUNT(*)::int AS n FROM reseller_erp_visit_interactions i
             JOIN reseller_erp_customer_visits v ON v.id = i.visit_id
             WHERE v.reseller_user_id = $1 AND i.forward_counter_id = $2 ${inDate}`,
            inParams,
        );

        const fuParams = [userId, c.id];
        const fu = await query(
            `SELECT COUNT(*)::int AS n FROM reseller_erp_visit_follow_ups
             WHERE reseller_user_id = $1 AND counter_id = $2`,
            fuParams,
        );

        const purchased = Number(stats[0]?.purchased || 0);
        const visitorsN = Number(visitors[0]?.n || 0);
        const salesValue = Math.round(Number(stats[0]?.sales_value || 0) * 100) / 100;
        rows.push({
            counter_id: c.id,
            counter_name: c.name,
            total_visitors: visitorsN,
            purchased,
            no_purchase: Number(stats[0]?.no_purchase || 0),
            transferred_in: Number(transferredIn[0]?.n || 0),
            transferred_out: Number(stats[0]?.transferred_out || 0),
            conversion_pct:
                visitorsN > 0 ? Math.round((purchased / visitorsN) * 1000) / 10 : 0,
            sales_value_inr: salesValue,
            average_bill_inr: purchased > 0 ? Math.round((salesValue / purchased) * 100) / 100 : 0,
            follow_ups_created: Number(fu[0]?.n || 0),
        });
    }
    return rows;
}

async function loadSalespersonPerformance(query, userId, from, to, periodKey, periodType) {
    const params = [userId];
    const dateFilter = buildDateFilters(from, to, 'created_at', params, 'i');
    const rows = await query(
        `SELECT i.operator_id, o.display_name, o.username,
                COUNT(*)::int AS customers_attended,
                COUNT(*) FILTER (WHERE i.outcome IN ('sale_closed', 'sale_and_forward'))::int AS purchased,
                COUNT(*) FILTER (WHERE i.outcome IN ('no_sale', 'left_shop'))::int AS no_purchase,
                COUNT(*) FILTER (WHERE i.outcome = 'forward')::int AS transferred,
                COALESCE(SUM(i.bill_amount_inr) FILTER (
                    WHERE i.outcome IN ('sale_closed', 'sale_and_forward')
                ), 0)::float AS sales_amount,
                COUNT(*) FILTER (WHERE i.outcome IN ('sale_closed', 'sale_and_forward')
                    AND COALESCE(i.bill_number, '') <> '')::int AS bills_with_number
         FROM reseller_erp_visit_interactions i
         JOIN reseller_erp_customer_visits v ON v.id = i.visit_id
         LEFT JOIN reseller_erp_operators o ON o.id = i.operator_id
         WHERE v.reseller_user_id = $1 ${dateFilter}
         GROUP BY i.operator_id, o.display_name, o.username
         ORDER BY sales_amount DESC`,
        params,
    );

    const targetParams = [userId, periodType, periodKey];
    const targets = await query(
        `SELECT operator_id, target_amount_inr FROM reseller_erp_operator_sales_targets
         WHERE reseller_user_id = $1 AND period_type = $2 AND period_key = $3`,
        targetParams,
    );
    const targetByOp = new Map(targets.map((t) => [t.operator_id, Number(t.target_amount_inr || 0)]));

    return rows.map((r) => {
        const sales = Math.round(Number(r.sales_amount || 0) * 100) / 100;
        const target = targetByOp.get(r.operator_id) || 0;
        const attended = Number(r.customers_attended || 0);
        const purchased = Number(r.purchased || 0);
        const achievement = target > 0 ? Math.round((sales / target) * 1000) / 10 : null;
        return {
            operator_id: r.operator_id,
            name: r.display_name || r.username || 'Staff',
            customers_attended: attended,
            customers_purchased: purchased,
            customers_no_purchase: Number(r.no_purchase || 0),
            customers_transferred: Number(r.transferred || 0),
            sales_amount_inr: sales,
            bills_count: Number(r.bills_with_number || purchased),
            average_bill_inr: purchased > 0 ? Math.round((sales / purchased) * 100) / 100 : 0,
            conversion_pct: attended > 0 ? Math.round((purchased / attended) * 1000) / 10 : 0,
            monthly_target_inr: target,
            achievement_pct: achievement,
            target_gap_inr: target > 0 ? Math.round((target - sales) * 100) / 100 : null,
        };
    });
}

module.exports = {
    loadManagementDashboard,
    loadCounterWiseReport,
    loadSalespersonPerformance,
};
