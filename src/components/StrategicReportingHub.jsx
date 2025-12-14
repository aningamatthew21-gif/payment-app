import React, { useState, useRef } from 'react';
import { FileText, Download, BarChart2, Calendar, X, TrendingUp, DollarSign, Users, FileCheck } from 'lucide-react';
import html2canvas from 'html2canvas';
import ReportingService from '../services/ReportingService';
import StrategicDocumentService from '../services/StrategicDocumentService';
import ReportCharts from './ReportCharts';

/**
 * Helper: Generate html2canvas options that strip oklch colors
 * CRITICAL: Must target SVG elements specifically (recharts creates SVGs)
 */
const getCanvasOptions = () => ({
    scale: 2,
    backgroundColor: '#ffffff',
    allowTaint: true,
    useCORS: true,
    logging: false,
    windowWidth: 1920,
    windowHeight: 1080,
    onclone: (clonedDoc) => {
        try {
            console.log('[DEBUG] onclone: Stripping oklch colors from cloned document...');

            // 1. Strip oklch from ALL regular elements
            const allEls = clonedDoc.body.querySelectorAll('*');
            allEls.forEach(el => {
                el.style.setProperty('color', '#374151', 'important');
                el.style.setProperty('background-color', '#ffffff', 'important');
                el.style.setProperty('border-color', '#e5e7eb', 'important');
            });

            // 2. CRITICAL: Strip oklch from SVG elements and children
            const svgElements = clonedDoc.body.querySelectorAll('svg, svg *');
            console.log(`[DEBUG] Found ${svgElements.length} SVG elements/children`);
            svgElements.forEach(el => {
                // Remove style attribute entirely from SVG elements
                el.removeAttribute('style');
                // Force safe colors on key SVG attributes
                if (el.hasAttribute('fill')) {
                    const fill = el.getAttribute('fill');
                    if (fill && fill.includes('oklch')) {
                        el.setAttribute('fill', '#2563eb');
                    }
                }
                if (el.hasAttribute('stroke')) {
                    const stroke = el.getAttribute('stroke');
                    if (stroke && stroke.includes('oklch')) {
                        el.setAttribute('stroke', '#374151');
                    }
                }
            });

            console.log('[DEBUG] onclone: oklch stripping complete');
        } catch (e) {
            console.error('[DEBUG] onclone error:', e);
        }
    }
});

const StrategicReportingHub = ({ isOpen, onClose, db, appId }) => {
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [status, setStatus] = useState('');
    const [reportData, setReportData] = useState(null);

    // Ref for the hidden chart container
    const chartsRef = useRef(null);

    const handleGenerate = async (type) => {
        setIsGenerating(true);
        setStatus('Fetching financial data...');

        try {
            // 1. Fetch Data
            const start = new Date(dateRange.start);
            const end = new Date(dateRange.end);
            // Set end date to end of day
            end.setHours(23, 59, 59, 999);

            const data = await ReportingService.getComprehensiveReportData(db, appId, start, end);
            console.log('[DEBUG] Step 1 COMPLETE: Data fetched successfully', data);
            setReportData(data); // Triggers rendering of hidden charts

            // Allow React to render the charts in the DOM
            setStatus('Rendering infographics...');
            console.log('[DEBUG] Step 2: Waiting for chart render (1500ms)...');
            await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for animation/render
            console.log('[DEBUG] Step 2 COMPLETE: Chart render wait finished');

            // 2. Capture Charts as Images
            console.log('[DEBUG] Step 3: Starting chart capture...');
            const chartImages = {};
            if (chartsRef.current) {
                console.log('[DEBUG] chartsRef.current exists:', chartsRef.current);
                const cashFlowEl = chartsRef.current.querySelector('#chart-cashflow');
                const vendorEl = chartsRef.current.querySelector('#chart-vendor');
                const effEl = chartsRef.current.querySelector('#chart-efficiency');
                console.log('[DEBUG] Chart elements found:', { cashFlowEl: !!cashFlowEl, vendorEl: !!vendorEl, effEl: !!effEl });

                if (cashFlowEl) {
                    setStatus('Capturing cash flow chart...');
                    console.log('[DEBUG] Attempting to capture cashFlowEl...', cashFlowEl);
                    try {
                        const canvas = await html2canvas(cashFlowEl, getCanvasOptions());
                        chartImages.cashFlow = canvas.toDataURL('image/png');
                        console.log('[DEBUG] Cash flow chart captured successfully');
                    } catch (err) {
                        console.error('[DEBUG] ERROR capturing cash flow chart:', err);
                        throw err;
                    }
                }
                if (vendorEl) {
                    setStatus('Capturing vendor chart...');
                    console.log('[DEBUG] Attempting to capture vendorEl...');
                    try {
                        const canvas = await html2canvas(vendorEl, getCanvasOptions());
                        chartImages.vendorVolume = canvas.toDataURL('image/png');
                        console.log('[DEBUG] Vendor chart captured successfully');
                    } catch (err) {
                        console.error('[DEBUG] ERROR capturing vendor chart:', err);
                        throw err;
                    }
                }
                if (effEl) {
                    setStatus('Capturing efficiency chart...');
                    console.log('[DEBUG] Attempting to capture effEl...');
                    try {
                        const canvas = await html2canvas(effEl, getCanvasOptions());
                        chartImages.budgetEfficiency = canvas.toDataURL('image/png');
                        console.log('[DEBUG] Efficiency chart captured successfully');
                    } catch (err) {
                        console.error('[DEBUG] ERROR capturing efficiency chart:', err);
                        throw err;
                    }
                }
                // NEW CAPTURE: Department chart
                const deptEl = chartsRef.current.querySelector('#chart-department');
                if (deptEl) {
                    setStatus('Capturing department chart...');
                    console.log('[DEBUG] Attempting to capture deptEl...');
                    try {
                        const canvas = await html2canvas(deptEl, getCanvasOptions());
                        chartImages.deptSpend = canvas.toDataURL('image/png');
                        console.log('[DEBUG] Department chart captured successfully');
                    } catch (err) {
                        console.error('[DEBUG] ERROR capturing department chart:', err);
                        throw err;
                    }
                }
                console.log('[DEBUG] Step 3 COMPLETE: All charts captured successfully');
            } else {
                console.error('[DEBUG] WARNING: chartsRef.current is null!');
            }

            // 3. Generate PDF
            setStatus('Compiling PDF document...');
            const blob = StrategicDocumentService.generateStrategicReportPDF(data, chartImages);

            // 4. Download
            setStatus('Downloading...');
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Strategic_Report_${dateRange.start}_to_${dateRange.end}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setStatus('✓ Report generated successfully!');
            setTimeout(() => setStatus(''), 2000);

        } catch (error) {
            console.error('[StrategicReportingHub] Error generating report:', error);
            setStatus('❌ Error generating report');
            setTimeout(() => setStatus(''), 3000);
        } finally {
            setIsGenerating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full mx-4 overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 flex justify-between items-center text-white">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                            <BarChart2 className="text-blue-400" size={28} />
                            Strategic Reporting Hub
                        </h2>
                        <p className="text-slate-300 text-sm mt-1">Generate intelligence reports with embedded analytics</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-700 rounded-full transition"
                        disabled={isGenerating}
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="p-8 overflow-y-auto flex-1 bg-slate-50">

                    {/* 1. Date Selection */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Calendar size={16} /> Reporting Period
                        </h3>
                        <div className="flex gap-4 items-end flex-wrap">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                                <input
                                    type="date"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                    className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    disabled={isGenerating}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                                <input
                                    type="date"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                    className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    disabled={isGenerating}
                                />
                            </div>
                            <div className="flex gap-2 pb-1">
                                <button
                                    onClick={() => {
                                        const today = new Date();
                                        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                                        setDateRange({
                                            start: firstDay.toISOString().split('T')[0],
                                            end: today.toISOString().split('T')[0]
                                        });
                                    }}
                                    className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-medium transition"
                                    disabled={isGenerating}
                                >
                                    This Month
                                </button>
                                <button
                                    onClick={() => {
                                        const today = new Date();
                                        const lastMonthFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                                        const lastMonthLast = new Date(today.getFullYear(), today.getMonth(), 0);
                                        setDateRange({
                                            start: lastMonthFirst.toISOString().split('T')[0],
                                            end: lastMonthLast.toISOString().split('T')[0]
                                        });
                                    }}
                                    className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-medium transition"
                                    disabled={isGenerating}
                                >
                                    Last Month
                                </button>
                                <button
                                    onClick={() => {
                                        const today = new Date();
                                        const startOfYear = new Date(today.getFullYear(), 0, 1);
                                        setDateRange({
                                            start: startOfYear.toISOString().split('T')[0],
                                            end: today.toISOString().split('T')[0]
                                        });
                                    }}
                                    className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-medium transition"
                                    disabled={isGenerating}
                                >
                                    Year to Date
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* 2. Report Selection Grid */}
                    <div className="space-y-6">

                        {/* Comprehensive Report Card */}
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                                <FileText size={120} />
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                                    <FileCheck size={28} />
                                    Comprehensive Management Report
                                </h3>
                                <p className="text-blue-100 mb-6 max-w-2xl">
                                    The all-in-one strategic document. Combines financial performance, budget efficiency, vendor analysis, and tax compliance into a single PDF with embedded infographics and charts.
                                </p>
                                <div className="flex flex-wrap gap-4 mb-6 text-sm">
                                    <div className="flex items-center gap-2">
                                        <DollarSign size={16} /> Financial Metrics
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <TrendingUp size={16} /> Cash Flow Analysis
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Users size={16} /> Vendor Intelligence
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <FileCheck size={16} /> Tax Compliance
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleGenerate('comprehensive')}
                                    disabled={isGenerating}
                                    className="bg-white text-blue-600 px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isGenerating ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                            {status || 'Generating...'}
                                        </>
                                    ) : (
                                        <>
                                            <Download size={20} /> Generate Full Report
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Future Individual Reports - Placeholder */}
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-slate-700 mb-2">Individual Report Modules</h4>
                            <p className="text-sm text-slate-500 mb-4">
                                Generate specific reports for focused analysis (Coming Soon)
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div className="p-4 bg-slate-50 rounded-lg text-center opacity-60 cursor-not-allowed border border-slate-200">
                                    <DollarSign className="mx-auto mb-2 text-slate-400" size={24} />
                                    <div className="font-semibold text-slate-600 text-sm">Financial Only</div>
                                    <div className="text-xs text-slate-500 mt-1">Cash Flow & Trends</div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg text-center opacity-60 cursor-not-allowed border border-slate-200">
                                    <BarChart2 className="mx-auto mb-2 text-slate-400" size={24} />
                                    <div className="font-semibold text-slate-600 text-sm">Budget Health</div>
                                    <div className="text-xs text-slate-500 mt-1">Risks & Efficiency</div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg text-center opacity-60 cursor-not-allowed border border-slate-200">
                                    <Users className="mx-auto mb-2 text-slate-400" size={24} />
                                    <div className="font-semibold text-slate-600 text-sm">Vendor Intel</div>
                                    <div className="text-xs text-slate-500 mt-1">Volume & Dependencies</div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-lg text-center opacity-60 cursor-not-allowed border border-slate-200">
                                    <FileCheck className="mx-auto mb-2 text-slate-400" size={24} />
                                    <div className="font-semibold text-slate-600 text-sm">Tax Compliance</div>
                                    <div className="text-xs text-slate-500 mt-1">WHT/VAT Audit</div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>


                {/* Hidden Chart Container - Using opacity + z-index ensures browser calculates dimensions */}
                <div style={{
                    position: 'fixed',
                    top: '0',
                    left: '0',
                    zIndex: -50,
                    opacity: 0,
                    pointerEvents: 'none',
                    backgroundColor: '#ffffff'
                }}>
                    <ReportCharts ref={chartsRef} data={reportData} />
                </div>

            </div>
        </div >
    );
};

export default StrategicReportingHub;
