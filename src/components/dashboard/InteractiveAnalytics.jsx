import React, { useState, useEffect } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
    AreaChart, Area, CartesianGrid, Cell
} from 'recharts';
import { X, FileText } from 'lucide-react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

/**
 * InteractiveAnalytics Component
 * Provides interactive charts with drill-down capabilities
 * - Cash Flow Velocity: Click peaks to see daily payment schedule
 * - Department Utilization: Click bars to see budget line breakdowns
 */

// Process chart data from Master Log and Budget Lines
const processChartData = (masterLog, budgetLines) => {
    // 1. Process Department Data
    const deptMap = {};
    budgetLines.forEach(line => {
        const dept = line.deptDimension || 'Unassigned';
        if (!deptMap[dept]) deptMap[dept] = { name: dept, allocated: 0, spent: 0 };

        // Summing budget vs spend
        deptMap[dept].allocated += (line.monthlyValues?.reduce((a, b) => a + Math.abs(b || 0), 0) || 0);
        deptMap[dept].spent += Math.abs(line.totalSpent || 0);
    });

    // 2. Process Cash Flow (Daily)
    const dateMap = {};
    masterLog.forEach(tx => {
        const date = tx.finalizationDate?.split('T')[0] || 'Unknown';
        if (date === 'Unknown') return;

        if (!dateMap[date]) dateMap[date] = { date, amount: 0, transactions: [] };
        dateMap[date].amount += (tx.netPayable_ThisTx || 0);
        dateMap[date].transactions.push(tx); // Store raw tx for drill-down
    });

    return {
        departments: Object.values(deptMap)
            .sort((a, b) => b.spent - a.spent)
            .slice(0, 5), // Top 5 depts
        cashFlow: Object.values(dateMap)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(-14) // Last 14 days
    };
};

const InteractiveAnalytics = ({ db, appId }) => {
    const [data, setData] = useState({ departments: [], cashFlow: [] });
    const [drillDown, setDrillDown] = useState(null); // The "Pivot" State
    const [loading, setLoading] = useState(true);

    // Load Data
    useEffect(() => {
        if (!db || !appId) {
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            try {
                // Fetch budget lines
                const bSnapshot = await getDocs(collection(db, `artifacts/${appId}/public/data/budgetLines`));
                const budgetLines = bSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

                // Fetch recent logs (last 60 days, max 500 records for performance)
                const sixtyDaysAgo = new Date();
                sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

                const logsQuery = query(
                    collection(db, `artifacts/${appId}/masterLog`),
                    where('finalizationDate', '>=', sixtyDaysAgo.toISOString()),
                    orderBy('finalizationDate', 'desc'),
                    limit(500)
                );

                const lSnapshot = await getDocs(logsQuery);
                const logs = lSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

                setData(processChartData(logs, budgetLines));
            } catch (error) {
                console.error('[InteractiveAnalytics] Error fetching data:', error);
                // Set empty data on error
                setData({ departments: [], cashFlow: [] });
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [db, appId]);

    // Handle Cash Flow Click -> Show Daily Schedule
    const onCashFlowClick = (dataPoint) => {
        if (!dataPoint || !dataPoint.activePayload || !dataPoint.activePayload[0]) return;

        const payload = dataPoint.activePayload[0].payload;
        setDrillDown({
            title: `Payment Schedule for ${payload.date}`,
            type: 'schedule',
            items: payload.transactions || []
        });
    };

    // Handle Dept Click -> Show Budget Lines (would need additional query)
    const onDeptClick = (dataPoint) => {
        if (!dataPoint || !dataPoint.activePayload || !dataPoint.activePayload[0]) return;

        const dept = dataPoint.activePayload[0].payload;
        setDrillDown({
            title: `${dept.name} - Budget Breakdown`,
            type: 'budget_list',
            items: [], // Would filter budgetLines by dept in production
            message: `Detailed breakdown for ${dept.name} would show budget lines here. Total Allocated: GHS ${dept.allocated.toLocaleString()}, Spent: GHS ${dept.spent.toLocaleString()}`
        });
    };

    if (loading) {
        return (
            <div className="h-64 flex items-center justify-center text-slate-400">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm">Loading Analytics...</p>
                </div>
            </div>
        );
    }

    if (data.cashFlow.length === 0 && data.departments.length === 0) {
        return (
            <div className="bg-white p-6 rounded-xl border border-slate-200">
                <div className="text-center text-slate-400 py-8">
                    <FileText size={48} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No transaction data available</p>
                    <p className="text-xs mt-1">Charts will appear once payments are processed</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">

            {/* Cash Flow Wave Chart */}
            {data.cashFlow.length > 0 && (
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
                        Cash Flow Velocity (Last 14 Days)
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.cashFlow} onClick={onCashFlowClick} style={{ cursor: 'pointer' }}>
                                <defs>
                                    <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                    tickFormatter={d => d.slice(5)}
                                    stroke="#cbd5e1"
                                />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '8px',
                                        border: 'none',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                        backgroundColor: 'white'
                                    }}
                                    formatter={(value) => [`GHS ${value.toLocaleString()}`, 'Outflow']}
                                    labelStyle={{ color: '#334155', fontWeight: 'bold' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke="#2563eb"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorFlow)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-center text-slate-400 mt-2">
                        👆 Click any peak to see payments made on that day
                    </p>
                </div>
            )}

            {/* Department Utilization Bar Chart */}
            {data.departments.length > 0 && (
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
                        Departmental Utilization (Top 5)
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.departments} onClick={onDeptClick} style={{ cursor: 'pointer' }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" />
                                <YAxis hide />
                                <Tooltip
                                    cursor={{ fill: '#f1f5f9' }}
                                    contentStyle={{
                                        borderRadius: '8px',
                                        border: 'none',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                    }}
                                    formatter={(value) => `GHS ${value.toLocaleString()}`}
                                />
                                <Bar dataKey="allocated" fill="#e2e8f0" radius={[4, 4, 0, 0]} name="Allocated" />
                                <Bar dataKey="spent" fill="#ef4444" radius={[4, 4, 0, 0]} name="Spent" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-center text-slate-400 mt-2">
                        👆 Click a bar to view detailed budget lines
                    </p>
                </div>
            )}

            {/* Drill Down Modal */}
            {drillDown && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">

                        {/* Modal Header */}
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <FileText size={18} className="text-blue-600" />
                                {drillDown.title}
                            </h3>
                            <button
                                onClick={() => setDrillDown(null)}
                                className="p-2 hover:bg-slate-200 rounded-full transition"
                            >
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="overflow-y-auto flex-1">
                            {drillDown.type === 'schedule' && drillDown.items.length > 0 ? (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 sticky top-0">
                                        <tr>
                                            <th className="p-4">Vendor</th>
                                            <th className="p-4">Description</th>
                                            <th className="p-4">Budget Line</th>
                                            <th className="p-4 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {drillDown.items.map((tx, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition">
                                                <td className="p-4 font-medium text-slate-700">{tx.vendorName || tx.vendor || 'N/A'}</td>
                                                <td className="p-4 text-slate-500 truncate max-w-xs">{tx.description || 'No description'}</td>
                                                <td className="p-4 text-slate-600 text-xs">{tx.budgetLine || '-'}</td>
                                                <td className="p-4 text-right font-mono font-bold text-slate-700">
                                                    GHS {parseFloat(tx.netPayable_ThisTx || tx.amount || 0).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                        <tr>
                                            <td colSpan="3" className="p-4 text-right font-bold text-slate-700">Total:</td>
                                            <td className="p-4 text-right font-mono font-bold text-blue-600">
                                                GHS {drillDown.items.reduce((sum, tx) => sum + parseFloat(tx.netPayable_ThisTx || tx.amount || 0), 0).toLocaleString()}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            ) : drillDown.type === 'schedule' ? (
                                <div className="p-8 text-center text-slate-500">
                                    No transactions found for this date.
                                </div>
                            ) : (
                                <div className="p-8 text-center text-slate-500">
                                    {drillDown.message || 'Detailed breakdown would appear here.'}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
                            <button
                                className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
                                onClick={() => setDrillDown(null)}
                            >
                                Close Details
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};

export default InteractiveAnalytics;
