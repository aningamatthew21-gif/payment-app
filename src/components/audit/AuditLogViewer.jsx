import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, Shield, Clock, ChevronDown, ChevronUp, X, FileText } from 'lucide-react';
import AuditService, { AUDIT_ACTIONS } from '../../services/AuditService';
import * as XLSX from 'xlsx';

/**
 * AuditLogViewer Component
 * Displays system audit logs with search, filter, and export capabilities
 */
const AuditLogViewer = ({ db, appId, currentUser }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('ALL');
    const [searchText, setSearchText] = useState('');
    const [expandedLog, setExpandedLog] = useState(null);
    const [stats, setStats] = useState(null);

    const auditService = new AuditService(db, appId);

    useEffect(() => {
        loadLogs();
        loadStats();
    }, [db, appId, filterType]);

    const loadLogs = async () => {
        setLoading(true);
        const filters = filterType !== 'ALL' ? { actionType: filterType } : {};

        try {
            const data = await auditService.getLogs(filters, 100);
            setLogs(data);
        } catch (error) {
            console.error('[AuditLogViewer] Failed to load audit logs:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            const statistics = await auditService.getStatistics();
            setStats(statistics);
        } catch (error) {
            console.error('[AuditLogViewer] Failed to load statistics:', error);
        }
    };

    const handleSearch = async () => {
        if (!searchText.trim()) {
            loadLogs();
            return;
        }

        setLoading(true);
        try {
            const results = await auditService.searchLogs(searchText);
            setLogs(results);
        } catch (error) {
            console.error('[AuditLogViewer] Search failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        const exportData = logs.map(log => ({
            Timestamp: log.timestamp.toLocaleString(),
            Action: log.actionType,
            User: log.userEmail,
            Resource: log.resource,
            Details: log.details
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "AuditTrail");
        XLSX.writeFile(wb, `Audit_Logs_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const getActionBadgeClass = (actionType) => {
        const baseClass = "px-2 py-1 rounded text-xs font-bold border ";

        if (actionType.includes('DELETE')) return baseClass + 'bg-red-100 text-red-700 border-red-200';
        if (actionType.includes('CREATE')) return baseClass + 'bg-green-100 text-green-700 border-green-200';
        if (actionType.includes('UPDATE')) return baseClass + 'bg-blue-100 text-blue-700 border-blue-200';
        if (actionType.includes('LOGIN') || actionType.includes('LOGOUT')) return baseClass + 'bg-purple-100 text-purple-700 border-purple-200';
        if (actionType.includes('EXPORT')) return baseClass + 'bg-indigo-100 text-indigo-700 border-indigo-200';
        if (actionType.includes('APPROVE')) return baseClass + 'bg-teal-100 text-teal-700 border-teal-200';
        if (actionType.includes('ERROR')) return baseClass + 'bg-red-100 text-red-700 border-red-200';

        return baseClass + 'bg-slate-100 text-slate-700 border-slate-200';
    };

    const getUserInitial = (email) => {
        return email ? email[0].toUpperCase() : '?';
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col" style={{ height: '800px' }}>

            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Shield className="text-blue-600" size={24} /> System Audit Trail
                    </h2>
                    <p className="text-slate-500 text-sm">Immutable record of all system actions</p>
                    {stats && (
                        <div className="flex gap-4 mt-2 text-xs text-slate-500">
                            <span>Last Hour: <strong>{stats.lastHour}</strong></span>
                            <span>Last 24h: <strong>{stats.lastDay}</strong></span>
                            <span>Total Loaded: <strong>{stats.totalLogs}</strong></span>
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={loadLogs}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium"
                    >
                        <Filter size={16} /> Refresh
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={logs.length === 0}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download size={16} /> Export Logs
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="p-4 border-b border-slate-100 flex gap-4 items-center bg-slate-50">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search by user, action, or detail..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                    />
                </div>
                <select
                    className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-700 text-sm"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                >
                    <option value="ALL">All Actions</option>
                    {Object.entries(AUDIT_ACTIONS).map(([key, value]) => (
                        <option key={key} value={value}>{value}</option>
                    ))}
                </select>
            </div>

            {/* Log Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 font-semibold text-slate-700 sticky top-0 z-10">
                        <tr>
                            <th className="p-4 w-48">Timestamp</th>
                            <th className="p-4 w-48">User</th>
                            <th className="p-4 w-32">Action</th>
                            <th className="p-4">Details</th>
                            <th className="p-4 w-16"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="p-8 text-center text-slate-400">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                                    Loading logs...
                                </td>
                            </tr>
                        ) : logs.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-8 text-center text-slate-400">
                                    <FileText size={48} className="mx-auto mb-2 opacity-30" />
                                    <p>No audit logs found</p>
                                    <p className="text-xs mt-1">Actions will appear here once users interact with the system</p>
                                </td>
                            </tr>
                        ) : (
                            logs.map(log => (
                                <React.Fragment key={log.id}>
                                    <tr className="hover:bg-blue-50/50 transition-colors cursor-pointer" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                                        <td className="p-4 font-mono text-xs flex items-center gap-2 text-slate-500">
                                            <Clock size={14} /> {log.timestamp.toLocaleString()}
                                        </td>
                                        <td className="p-4 font-medium text-slate-800">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                                                    {getUserInitial(log.userEmail)}
                                                </div>
                                                <span className="truncate max-w-[200px]" title={log.userEmail}>{log.userEmail}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={getActionBadgeClass(log.actionType)}>
                                                {log.actionType}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="font-medium text-slate-700">{log.resource}</div>
                                            <div className="text-xs text-slate-400 truncate max-w-md" title={log.details}>
                                                {log.details}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            {expandedLog === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </td>
                                    </tr>

                                    {/* Expanded Details */}
                                    {expandedLog === log.id && (
                                        <tr className="bg-slate-50">
                                            <td colSpan="5" className="p-4">
                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                    <div>
                                                        <strong className="text-slate-700">User ID:</strong>
                                                        <p className="text-slate-600 font-mono text-xs">{log.userId}</p>
                                                    </div>
                                                    <div>
                                                        <strong className="text-slate-700">User Name:</strong>
                                                        <p className="text-slate-600">{log.userName}</p>
                                                    </div>
                                                    <div>
                                                        <strong className="text-slate-700">User Agent:</strong>
                                                        <p className="text-slate-600 text-xs truncate" title={log.userAgent}>{log.userAgent}</p>
                                                    </div>
                                                    <div>
                                                        <strong className="text-slate-700">Session ID:</strong>
                                                        <p className="text-slate-600 font-mono text-xs">{log.sessionId || 'N/A'}</p>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <strong className="text-slate-700">Full Details:</strong>
                                                        <pre className="text-slate-600 text-xs bg-white p-2 rounded mt-1 overflow-auto max-h-32 border border-slate-200">
                                                            {log.details}
                                                        </pre>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center rounded-b-xl">
                <div className="text-sm text-slate-500">
                    Showing {logs.length} most recent entries
                </div>
                <div className="text-xs text-slate-400">
                    Logs are immutable and cannot be edited or deleted
                </div>
            </div>
        </div>
    );
};

export default AuditLogViewer;
