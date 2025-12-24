/**
 * Weekly Cash Position Report Component
 * Displays cash position data grouped by currency
 * Matches the Excel-based bank position report format
 * 
 * STYLING: Clean design with grey totals, light blue grid lines
 * DISPLAY: Shows ALL categories (with dashes for empty ones)
 */

import React, { useState, useEffect } from 'react';
import { X, Download, Calendar, RefreshCw, Wallet, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { CashPositionService, INFLOW_CATEGORIES, OUTFLOW_CATEGORIES, PENDING_CATEGORIES } from '../services/CashPositionService';

const WeeklyCashPositionReport = ({ isOpen, onClose, db, appId }) => {
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

    useEffect(() => {
        if (isOpen && db && appId) {
            loadReportData();
        }
    }, [isOpen, db, appId, selectedDate]);

    const loadReportData = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await CashPositionService.generateWeeklyCashPosition(db, appId, new Date(selectedDate));
            setReportData(data);
        } catch (err) {
            console.error('[WeeklyCashPositionReport] Error loading data:', err);
            setError(err.message || 'Failed to load report data');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount, currency = 'GHS') => {
        if (amount === 0 || amount === null || amount === undefined) return '-';
        const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '₵';
        const isNegative = amount < 0;
        const formatted = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return isNegative ? `(${symbol}${formatted})` : `${symbol}${formatted}`;
    };

    const formatDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const exportToExcel = () => {
        if (!reportData) return;

        const wb = XLSX.utils.book_new();

        Object.entries(reportData.data).forEach(([currency, currencyData]) => {
            const banks = currencyData.banks;
            const rows = [];

            // Header row
            rows.push(['#', 'Cash Inflows', ...banks.map(b => b.name), 'TOTAL']);

            // Row 1: Opening Balance
            rows.push([
                1,
                `Balance as of ${formatDate(reportData.previousTuesday)}`,
                ...banks.map(b => currencyData.openingBalance[b.id] || '-'),
                currencyData.totals.openingBalance || '-'
            ]);

            // Row 2: Cash Inflows header
            rows.push([2, 'Cash Inflows', ...banks.map(() => ''), '']);

            // Inflow categories - ALL of them
            let rowNum = 3;
            INFLOW_CATEGORIES.forEach(cat => {
                const catData = currencyData.inflows[cat.value] || {};
                rows.push([
                    rowNum++,
                    `  ${cat.label}`,
                    ...banks.map(b => catData[b.id] || '-'),
                    catData['_total'] || '-'
                ]);
            });

            // Total Inflow
            rows.push([
                rowNum++,
                'Total Cash Inflow',
                ...banks.map(b => {
                    let total = 0;
                    INFLOW_CATEGORIES.forEach(cat => {
                        total += currencyData.inflows[cat.value]?.[b.id] || 0;
                    });
                    return total || '-';
                }),
                currencyData.totals.totalInflow || '-'
            ]);

            // Empty row
            rows.push([rowNum++, '', ...banks.map(() => ''), '']);

            // Total Cash Available
            rows.push([
                rowNum++,
                'Total Cash Available (A)',
                ...banks.map(b => {
                    const opening = currencyData.openingBalance[b.id] || 0;
                    let inflows = 0;
                    INFLOW_CATEGORIES.forEach(cat => {
                        inflows += currencyData.inflows[cat.value]?.[b.id] || 0;
                    });
                    return (opening + inflows) || '-';
                }),
                currencyData.totals.cashAvailable || '-'
            ]);

            // Payments Processed header
            rows.push([rowNum++, 'Payments Processed', ...banks.map(() => ''), '']);

            // Outflow categories - ALL of them
            OUTFLOW_CATEGORIES.forEach(cat => {
                const catData = currencyData.outflows[cat.value] || {};
                rows.push([
                    rowNum++,
                    `  ${cat.label}`,
                    ...banks.map(b => catData[b.id] || '-'),
                    catData['_total'] || '-'
                ]);
            });

            // Total Outflow
            rows.push([
                rowNum++,
                'Total Cash Out flow (B)',
                ...banks.map(b => {
                    let total = 0;
                    OUTFLOW_CATEGORIES.forEach(cat => {
                        total += currencyData.outflows[cat.value]?.[b.id] || 0;
                    });
                    return total || '-';
                }),
                currencyData.totals.totalOutflow || '-'
            ]);

            // Empty row
            rows.push([rowNum++, '', ...banks.map(() => ''), '']);

            // Balance row
            rows.push([
                rowNum++,
                `Balance as of ${formatDate(reportData.currentTuesday)}`,
                ...banks.map(b => currencyData.currentBalance[b.id] || '-'),
                currencyData.totals.currentBalance || '-'
            ]);

            // Empty row
            rows.push([rowNum++, '', ...banks.map(() => ''), '']);

            // Pending Payments header
            rows.push([rowNum++, 'Pending Payments', ...banks.map(() => ''), '']);

            // Pending categories - ALL of them
            PENDING_CATEGORIES.forEach(cat => {
                const catData = currencyData.pending[cat.value] || {};
                rows.push([
                    rowNum++,
                    `  ${cat.label}`,
                    ...banks.map(b => catData[b.id] || '-'),
                    catData['_total'] || '-'
                ]);
            });

            // Total Pending
            rows.push([
                rowNum++,
                'Total Pending Payment',
                ...banks.map(b => {
                    let total = 0;
                    PENDING_CATEGORIES.forEach(cat => {
                        total += currencyData.pending[cat.value]?.[b.id] || 0;
                    });
                    return total || '-';
                }),
                currencyData.totals.totalPending || '-'
            ]);

            // Empty row
            rows.push([rowNum++, '', ...banks.map(() => ''), '']);

            // Estimated Closing Balance
            rows.push([
                rowNum++,
                'Estimated Closing Balance',
                ...banks.map(b => currencyData.estimatedClosing[b.id] || '-'),
                currencyData.totals.estimatedClosing || '-'
            ]);

            // Create worksheet
            const ws = XLSX.utils.aoa_to_sheet(rows);

            // Set column widths
            ws['!cols'] = [{ wch: 5 }, { wch: 28 }, ...banks.map(() => ({ wch: 15 })), { wch: 15 }];

            XLSX.utils.book_append_sheet(wb, ws, `Cash Flow ${currency}`);
        });

        // Download
        const fileName = `Cash_Position_${reportData.currentTuesday.toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // Common cell styles
    const cellBorder = 'border border-blue-200';
    const headerCell = `${cellBorder} bg-blue-100 text-slate-800 font-semibold`;
    const dataCell = `${cellBorder} text-slate-700`;
    const totalRow = 'bg-gray-200 font-semibold';
    const sectionHeader = 'bg-yellow-100 font-bold text-slate-800';

    const renderCurrencyBlock = (currency, currencyData) => {
        const banks = currencyData.banks;

        return (
            <div key={currency} className="mb-8 bg-white rounded-lg shadow-md overflow-hidden border border-gray-300">
                {/* Currency Header */}
                <div className="px-6 py-3 bg-blue-700 text-white">
                    <h3 className="text-lg font-bold">
                        {currency} CASH POSITION
                    </h3>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-blue-100">
                                <th className={`${headerCell} text-center px-2 py-2 w-10`}>#</th>
                                <th className={`${headerCell} text-left px-3 py-2 min-w-[200px]`}>Cash Inflows</th>
                                {banks.map(bank => (
                                    <th key={bank.id} className={`${headerCell} text-right px-3 py-2 min-w-[110px]`}>
                                        {bank.name}
                                    </th>
                                ))}
                                <th className={`${headerCell} text-right px-3 py-2 min-w-[110px] bg-blue-200`}>TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Row 1: Opening Balance */}
                            <tr className={totalRow}>
                                <td className={`${cellBorder} text-center px-2 py-1.5 bg-gray-200`}>1</td>
                                <td className={`${cellBorder} px-3 py-1.5 bg-gray-200`}>
                                    Balance as of {formatDate(reportData.previousTuesday)}
                                </td>
                                {banks.map(bank => (
                                    <td key={bank.id} className={`${cellBorder} text-right px-3 py-1.5 bg-gray-200`}>
                                        {formatCurrency(currencyData.openingBalance[bank.id], currency)}
                                    </td>
                                ))}
                                <td className={`${cellBorder} text-right px-3 py-1.5 font-bold bg-gray-300`}>
                                    {formatCurrency(currencyData.totals.openingBalance, currency)}
                                </td>
                            </tr>

                            {/* Row 2: Cash Inflows header */}
                            <tr className={sectionHeader}>
                                <td className={`${cellBorder} text-center px-2 py-1.5 bg-yellow-100`}>2</td>
                                <td colSpan={banks.length + 2} className={`${cellBorder} px-3 py-1.5 bg-yellow-100`}>
                                    Cash Inflows
                                </td>
                            </tr>

                            {/* Inflow categories - ALL */}
                            {INFLOW_CATEGORIES.map((cat, idx) => {
                                const catData = currencyData.inflows[cat.value] || {};
                                return (
                                    <tr key={cat.value} className="hover:bg-blue-50">
                                        <td className={`${dataCell} text-center px-2 py-1`}>{3 + idx}</td>
                                        <td className={`${dataCell} px-3 py-1 pl-6`}>{cat.label}</td>
                                        {banks.map(bank => (
                                            <td key={bank.id} className={`${dataCell} text-right px-3 py-1`}>
                                                {formatCurrency(catData[bank.id], currency)}
                                            </td>
                                        ))}
                                        <td className={`${dataCell} text-right px-3 py-1 bg-gray-50`}>
                                            {formatCurrency(catData['_total'], currency)}
                                        </td>
                                    </tr>
                                );
                            })}

                            {/* Total Inflow */}
                            <tr className={totalRow}>
                                <td className={`${cellBorder} text-center px-2 py-1.5 bg-gray-200`}>{3 + INFLOW_CATEGORIES.length}</td>
                                <td className={`${cellBorder} px-3 py-1.5 bg-gray-200`}>Total Cash Inflow</td>
                                {banks.map(bank => {
                                    let total = 0;
                                    INFLOW_CATEGORIES.forEach(cat => {
                                        total += currencyData.inflows[cat.value]?.[bank.id] || 0;
                                    });
                                    return (
                                        <td key={bank.id} className={`${cellBorder} text-right px-3 py-1.5 bg-gray-200`}>
                                            {formatCurrency(total, currency)}
                                        </td>
                                    );
                                })}
                                <td className={`${cellBorder} text-right px-3 py-1.5 font-bold bg-gray-300`}>
                                    {formatCurrency(currencyData.totals.totalInflow, currency)}
                                </td>
                            </tr>

                            {/* Total Cash Available */}
                            <tr className="bg-blue-100 font-bold">
                                <td className={`${cellBorder} text-center px-2 py-2 bg-blue-100`}>{4 + INFLOW_CATEGORIES.length}</td>
                                <td className={`${cellBorder} px-3 py-2 bg-blue-100`}>Total Cash Available (A)</td>
                                {banks.map(bank => {
                                    const opening = currencyData.openingBalance[bank.id] || 0;
                                    let inflows = 0;
                                    INFLOW_CATEGORIES.forEach(cat => {
                                        inflows += currencyData.inflows[cat.value]?.[bank.id] || 0;
                                    });
                                    return (
                                        <td key={bank.id} className={`${cellBorder} text-right px-3 py-2 bg-blue-100`}>
                                            {formatCurrency(opening + inflows, currency)}
                                        </td>
                                    );
                                })}
                                <td className={`${cellBorder} text-right px-3 py-2 font-bold bg-blue-200`}>
                                    {formatCurrency(currencyData.totals.cashAvailable, currency)}
                                </td>
                            </tr>

                            {/* Payments Processed header */}
                            <tr className={sectionHeader}>
                                <td className={`${cellBorder} text-center px-2 py-1.5 bg-yellow-100`}>{5 + INFLOW_CATEGORIES.length}</td>
                                <td colSpan={banks.length + 2} className={`${cellBorder} px-3 py-1.5 bg-yellow-100`}>
                                    Payments Processed
                                </td>
                            </tr>

                            {/* Outflow categories - ALL */}
                            {OUTFLOW_CATEGORIES.map((cat, idx) => {
                                const catData = currencyData.outflows[cat.value] || {};
                                return (
                                    <tr key={cat.value} className="hover:bg-blue-50">
                                        <td className={`${dataCell} text-center px-2 py-1`}>{6 + INFLOW_CATEGORIES.length + idx}</td>
                                        <td className={`${dataCell} px-3 py-1 pl-6`}>{cat.label}</td>
                                        {banks.map(bank => (
                                            <td key={bank.id} className={`${dataCell} text-right px-3 py-1`}>
                                                {formatCurrency(catData[bank.id], currency)}
                                            </td>
                                        ))}
                                        <td className={`${dataCell} text-right px-3 py-1 bg-gray-50`}>
                                            {formatCurrency(catData['_total'], currency)}
                                        </td>
                                    </tr>
                                );
                            })}

                            {/* Total Outflow */}
                            <tr className={totalRow}>
                                <td className={`${cellBorder} text-center px-2 py-1.5 bg-gray-200`}>{6 + INFLOW_CATEGORIES.length + OUTFLOW_CATEGORIES.length}</td>
                                <td className={`${cellBorder} px-3 py-1.5 bg-gray-200`}>Total Cash Out flow (B)</td>
                                {banks.map(bank => {
                                    let total = 0;
                                    OUTFLOW_CATEGORIES.forEach(cat => {
                                        total += currencyData.outflows[cat.value]?.[bank.id] || 0;
                                    });
                                    return (
                                        <td key={bank.id} className={`${cellBorder} text-right px-3 py-1.5 bg-gray-200`}>
                                            {formatCurrency(total, currency)}
                                        </td>
                                    );
                                })}
                                <td className={`${cellBorder} text-right px-3 py-1.5 font-bold bg-gray-300`}>
                                    {formatCurrency(currencyData.totals.totalOutflow, currency)}
                                </td>
                            </tr>

                            {/* Balance row */}
                            <tr className={totalRow}>
                                <td className={`${cellBorder} text-center px-2 py-1.5 bg-gray-200`}>{7 + INFLOW_CATEGORIES.length + OUTFLOW_CATEGORIES.length}</td>
                                <td className={`${cellBorder} px-3 py-1.5 bg-gray-200`}>
                                    Balance as of {formatDate(reportData.currentTuesday)}
                                </td>
                                {banks.map(bank => (
                                    <td key={bank.id} className={`${cellBorder} text-right px-3 py-1.5 bg-gray-200 ${(currencyData.currentBalance[bank.id] || 0) < 0 ? 'text-red-600' : ''}`}>
                                        {formatCurrency(currencyData.currentBalance[bank.id], currency)}
                                    </td>
                                ))}
                                <td className={`${cellBorder} text-right px-3 py-1.5 font-bold bg-gray-300 ${currencyData.totals.currentBalance < 0 ? 'text-red-600' : ''}`}>
                                    {formatCurrency(currencyData.totals.currentBalance, currency)}
                                </td>
                            </tr>

                            {/* Pending Payments header */}
                            <tr className={sectionHeader}>
                                <td className={`${cellBorder} text-center px-2 py-1.5 bg-yellow-100`}>{8 + INFLOW_CATEGORIES.length + OUTFLOW_CATEGORIES.length}</td>
                                <td colSpan={banks.length + 2} className={`${cellBorder} px-3 py-1.5 bg-yellow-100`}>
                                    Pending Payments
                                </td>
                            </tr>

                            {/* Pending categories - ALL */}
                            {PENDING_CATEGORIES.map((cat, idx) => {
                                const catData = currencyData.pending[cat.value] || {};
                                return (
                                    <tr key={cat.value} className="hover:bg-blue-50">
                                        <td className={`${dataCell} text-center px-2 py-1`}>
                                            {9 + INFLOW_CATEGORIES.length + OUTFLOW_CATEGORIES.length + idx}
                                        </td>
                                        <td className={`${dataCell} px-3 py-1 pl-6`}>{cat.label}</td>
                                        {banks.map(bank => (
                                            <td key={bank.id} className={`${dataCell} text-right px-3 py-1`}>
                                                {formatCurrency(catData[bank.id], currency)}
                                            </td>
                                        ))}
                                        <td className={`${dataCell} text-right px-3 py-1 bg-gray-50`}>
                                            {formatCurrency(catData['_total'], currency)}
                                        </td>
                                    </tr>
                                );
                            })}

                            {/* Total Pending */}
                            <tr className={totalRow}>
                                <td className={`${cellBorder} text-center px-2 py-1.5 bg-gray-200`}>
                                    {9 + INFLOW_CATEGORIES.length + OUTFLOW_CATEGORIES.length + PENDING_CATEGORIES.length}
                                </td>
                                <td className={`${cellBorder} px-3 py-1.5 bg-gray-200`}>Total Pending Payment</td>
                                {banks.map(bank => {
                                    let total = 0;
                                    PENDING_CATEGORIES.forEach(cat => {
                                        total += currencyData.pending[cat.value]?.[bank.id] || 0;
                                    });
                                    return (
                                        <td key={bank.id} className={`${cellBorder} text-right px-3 py-1.5 bg-gray-200`}>
                                            {formatCurrency(total, currency)}
                                        </td>
                                    );
                                })}
                                <td className={`${cellBorder} text-right px-3 py-1.5 font-bold bg-gray-300`}>
                                    {formatCurrency(currencyData.totals.totalPending, currency)}
                                </td>
                            </tr>

                            {/* Estimated Closing Balance */}
                            <tr className="bg-gray-300 font-bold">
                                <td className={`${cellBorder} text-center px-2 py-2 bg-gray-300`}>
                                    {10 + INFLOW_CATEGORIES.length + OUTFLOW_CATEGORIES.length + PENDING_CATEGORIES.length}
                                </td>
                                <td className={`${cellBorder} px-3 py-2 bg-gray-300`}>Estimated Closing Balance</td>
                                {banks.map(bank => (
                                    <td key={bank.id} className={`${cellBorder} text-right px-3 py-2 bg-gray-300 ${(currencyData.estimatedClosing[bank.id] || 0) < 0 ? 'text-red-600' : ''}`}>
                                        {formatCurrency(currencyData.estimatedClosing[bank.id], currency)}
                                    </td>
                                ))}
                                <td className={`${cellBorder} text-right px-3 py-2 font-bold bg-gray-400 ${currencyData.totals.estimatedClosing < 0 ? 'text-red-600' : ''}`}>
                                    {formatCurrency(currencyData.totals.estimatedClosing, currency)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-100 rounded-lg shadow-xl max-w-[95vw] w-full max-h-[95vh] overflow-hidden flex flex-col">

                {/* Header */}
                <div className="bg-blue-800 p-4 flex justify-between items-center text-white">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Wallet size={24} />
                            Weekly Cash Position Report
                        </h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-blue-700 rounded px-3 py-1.5">
                            <Calendar size={16} />
                            <input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent border-none text-white text-sm focus:outline-none"
                            />
                        </div>
                        <button
                            onClick={loadReportData}
                            disabled={loading}
                            className="p-2 hover:bg-blue-700 rounded transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={exportToExcel}
                            disabled={!reportData || loading}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded font-medium flex items-center gap-2 disabled:opacity-50"
                        >
                            <Download size={16} />
                            Export
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-blue-700 rounded transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Period Info */}
                {reportData && (
                    <div className="bg-white border-b px-4 py-2 text-sm">
                        <span className="font-medium">Period:</span>{' '}
                        <span className="font-bold">
                            {formatDate(reportData.previousTuesday)} → {formatDate(reportData.currentTuesday)}
                        </span>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {loading && (
                        <div className="flex items-center justify-center py-16">
                            <RefreshCw size={40} className="animate-spin text-blue-600" />
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-100 border border-red-300 rounded p-4 text-center">
                            <AlertCircle className="mx-auto mb-2 text-red-500" size={28} />
                            <p className="text-red-700">{error}</p>
                            <button
                                onClick={loadReportData}
                                className="mt-3 px-4 py-1.5 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                                Retry
                            </button>
                        </div>
                    )}

                    {!loading && !error && reportData && (
                        <>
                            {reportData.currencies.length === 0 ? (
                                <div className="text-center py-16 text-gray-500">
                                    <Wallet size={40} className="mx-auto mb-3 text-gray-400" />
                                    <p>No active bank accounts found.</p>
                                </div>
                            ) : (
                                Object.entries(reportData.data).map(([currency, currencyData]) =>
                                    renderCurrencyBlock(currency, currencyData)
                                )
                            )}
                        </>
                    )}
                </div>

            </div>
        </div>
    );
};

export default WeeklyCashPositionReport;
