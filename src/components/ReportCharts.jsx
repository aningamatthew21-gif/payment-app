import React, { forwardRef } from 'react';
import {
    BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

/**
 * ReportCharts Component
 * Renders charts for Strategic Reporting Hub (hidden, for image capture only)
 * Uses forwardRef to allow parent to capture DOM elements
 * CRITICAL: Uses FIXED dimensions (no ResponsiveContainer) and HEX colors only for html2canvas
 */
const ReportCharts = forwardRef(({ data }, ref) => {
    if (!data) return null;

    // Inline styles using HEX to avoid oklch parsing errors in html2canvas
    const containerStyle = {
        width: '800px',
        backgroundColor: '#ffffff',
        padding: '20px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
    };

    const chartBoxStyle = {
        marginBottom: '30px',
        padding: '20px',
        border: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
        borderRadius: '8px'
    };

    const headingStyle = {
        fontSize: '18px',
        fontWeight: '700',
        marginBottom: '15px',
        textAlign: 'center',
        color: '#374151'
    };

    return (
        <div ref={ref} style={containerStyle}>
            {/* 1. Cash Flow Chart - FIXED WIDTH (no ResponsiveContainer) */}
            <div id="chart-cashflow" style={chartBoxStyle}>
                <h3 style={headingStyle}>Daily Cash Flow Trend</h3>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <LineChart width={700} height={300} data={data.cashFlow || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11, fill: '#374151' }}
                            angle={-45}
                            textAnchor="end"
                            height={70}
                        />
                        <YAxis tick={{ fontSize: 11, fill: '#374151' }} />
                        <Tooltip
                            formatter={(value) => `GHS ${value.toLocaleString()}`}
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line
                            type="monotone"
                            dataKey="amount"
                            stroke="#2563eb"
                            strokeWidth={2}
                            name="Outflow (GHS)"
                            dot={{ fill: '#2563eb', r: 4 }}
                        />
                    </LineChart>
                </div>
            </div>

            {/* 2. Vendor Volume Chart - FIXED WIDTH */}
            <div id="chart-vendor" style={chartBoxStyle}>
                <h3 style={headingStyle}>Top 5 Vendors by Volume</h3>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <BarChart width={700} height={300} data={data.vendors?.topByVolume || []} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#374151' }} />
                        <YAxis
                            dataKey="name"
                            type="category"
                            width={180}
                            tick={{ fontSize: 11, fill: '#374151' }}
                        />
                        <Tooltip
                            formatter={(value) => `GHS ${value.toLocaleString()}`}
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}
                        />
                        <Bar dataKey="volume" fill="#8884d8" name="Total Volume (GHS)" radius={[0, 4, 4, 0]}>
                            {(data.vendors?.topByVolume || []).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </div>
            </div>

            {/* 3. Budget Efficiency Display */}
            <div id="chart-efficiency" style={chartBoxStyle}>
                <h3 style={headingStyle}>Overall Budget Efficiency</h3>
                <div style={{ height: '250px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '60px', fontWeight: '700', color: '#2563eb' }}>
                            {data.budget?.efficiencyScore?.toFixed(1) || 0}%
                        </div>
                        <p style={{ color: '#6b7280', marginTop: '10px', fontSize: '14px' }}>Efficiency Score</p>
                        <div style={{ display: 'flex', gap: '24px', marginTop: '20px', fontSize: '14px', justifyContent: 'center' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: '#ef4444' }}>
                                    {data.budget?.overspent?.length || 0}
                                </div>
                                <span style={{ color: '#4b5563' }}>Overspent</span>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>
                                    {data.budget?.underspent?.length || 0}
                                </div>
                                <span style={{ color: '#4b5563' }}>Underspent</span>
                            </div>
                        </div>
                        <div style={{ marginTop: '24px', width: '100%', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>
                            <div style={{ height: '16px', backgroundColor: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden' }}>
                                <div
                                    style={{
                                        height: '100%',
                                        backgroundColor: '#3b82f6',
                                        width: `${Math.min(data.budget?.efficiencyScore || 0, 100)}%`,
                                        transition: 'width 0.3s ease'
                                    }}
                                ></div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                                <span>0%</span>
                                <span>Target: 70%</span>
                                <span>100%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. Departmental Spend Chart */}
            <div id="chart-department" style={chartBoxStyle}>
                <h3 style={headingStyle}>Expenditure by Department</h3>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <BarChart width={700} height={300} data={data.departmental || []} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#374151' }} />
                        <YAxis
                            dataKey="name"
                            type="category"
                            width={180}
                            tick={{ fontSize: 11, fill: '#374151' }}
                        />
                        <Tooltip
                            formatter={(value) => `GHS ${value.toLocaleString()}`}
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}
                        />
                        <Bar dataKey="totalSpend" fill="#00C49F" name="Total Spend" radius={[0, 4, 4, 0]}>
                            {(data.departmental || []).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </div>
            </div>
        </div>
    );
});

ReportCharts.displayName = 'ReportCharts';

export default ReportCharts;
