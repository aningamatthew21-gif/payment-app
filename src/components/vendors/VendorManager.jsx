import React, { useState, useEffect } from 'react';
import { Search, Download, Upload, Plus, Edit2, ChevronLeft, ChevronRight, X, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';
import Layout from '../Layout/Layout';
import VendorModal from './VendorModal';
import { VendorService } from '../../services/VendorService';

const VendorManager = ({ onBack, onLogout, userId, db, appId }) => {
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVendor, setEditingVendor] = useState(null);

    // Import preview state
    const [showImportPreview, setShowImportPreview] = useState(false);
    const [importData, setImportData] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState(null);

    useEffect(() => {
        loadVendors();
    }, [db, appId]);

    const loadVendors = async () => {
        setLoading(true);
        const data = await VendorService.getAllVendors(db, appId);
        setVendors(data);
        setLoading(false);
    };

    const handleSaveVendor = async (vendorData) => {
        if (editingVendor) {
            const updated = await VendorService.updateVendor(db, appId, editingVendor.id, vendorData);
            setVendors(prev => prev.map(v => v.id === updated.id ? updated : v));
        } else {
            const newVendor = await VendorService.addVendor(db, appId, vendorData);
            setVendors(prev => [newVendor, ...prev]);
        }
        setIsModalOpen(false);
        setEditingVendor(null);
    };

    const handleEditClick = (vendor) => {
        setEditingVendor(vendor);
        setIsModalOpen(true);
    };

    const handleAddClick = () => {
        setEditingVendor(null);
        setIsModalOpen(true);
    };

    const handleDownloadTemplate = () => {
        VendorService.generateExcelTemplate();
        setImportStatus({ type: 'success', message: 'Template downloaded successfully!' });
        setTimeout(() => setImportStatus(null), 3000);
    };

    const handleExportVendors = async () => {
        const result = await VendorService.exportVendors(db, appId);
        if (result.success) {
            setImportStatus({ type: 'success', message: `Exported ${result.count} vendors successfully!` });
        } else {
            setImportStatus({ type: 'error', message: result.error || 'Export failed' });
        }
        setTimeout(() => setImportStatus(null), 3000);
    };

    const handleImportClick = () => {
        document.getElementById('vendor-import-input').click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        setImportStatus({ type: 'info', message: 'Parsing file...' });

        try {
            const result = await VendorService.parseImportFile(file);

            if (result.success && result.vendors.length > 0) {
                setImportData(result);
                setShowImportPreview(true);
                setImportStatus(null);
            } else if (result.success && result.vendors.length === 0) {
                setImportStatus({
                    type: 'error',
                    message: `No valid vendors found. ${result.summary.invalidRows} rows had errors.`
                });
            } else {
                setImportStatus({ type: 'error', message: result.error || 'Failed to parse file' });
            }
        } catch (error) {
            setImportStatus({ type: 'error', message: `Parse error: ${error.message}` });
        } finally {
            setIsImporting(false);
            e.target.value = ''; // Reset file input
        }
    };

    const handleConfirmImport = async () => {
        if (!importData || !importData.vendors) return;

        setIsImporting(true);
        setImportStatus({ type: 'info', message: 'Saving vendors to database...' });

        try {
            const result = await VendorService.importVendors(db, appId, importData.vendors);

            if (result.success && result.imported > 0) {
                setImportStatus({
                    type: 'success',
                    message: `Successfully imported ${result.imported} vendors!`
                });
                setShowImportPreview(false);
                setImportData(null);
                await loadVendors(); // Reload the vendor list
            } else {
                setImportStatus({
                    type: 'error',
                    message: `Import failed: ${result.errors.length} errors`
                });
            }
        } catch (error) {
            setImportStatus({ type: 'error', message: `Import error: ${error.message}` });
        } finally {
            setIsImporting(false);
            setTimeout(() => setImportStatus(null), 5000);
        }
    };

    const handleCancelImport = () => {
        setShowImportPreview(false);
        setImportData(null);
        setImportStatus(null);
    };

    // Filter vendors
    const filteredVendors = vendors.filter(v =>
        v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Layout
            title="Vendor Management"
            userId={userId}
            onLogout={onLogout}
            onBack={onBack}
        >
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Status Messages */}
                {importStatus && (
                    <div className={`p-4 rounded-lg border flex items-center ${importStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
                            importStatus.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
                                'bg-blue-50 border-blue-200 text-blue-800'
                        }`}>
                        {importStatus.type === 'success' && <CheckCircle className="mr-2" size={20} />}
                        {importStatus.type === 'error' && <AlertCircle className="mr-2" size={20} />}
                        {importStatus.type === 'info' && <FileSpreadsheet className="mr-2 animate-spin" size={20} />}
                        {importStatus.message}
                    </div>
                )}

                {/* Toolbar */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Search vendors..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div className="flex items-center space-x-3 w-full md:w-auto flex-wrap gap-2">
                        <button
                            onClick={handleDownloadTemplate}
                            className="flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            <Download size={18} className="mr-2" />
                            Template
                        </button>

                        <button
                            onClick={handleExportVendors}
                            disabled={vendors.length === 0}
                            className="flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                            <Download size={18} className="mr-2" />
                            Export
                        </button>

                        <input
                            type="file"
                            id="vendor-import-input"
                            className="hidden"
                            accept=".csv, .xlsx, .xls"
                            onChange={handleFileChange}
                        />
                        <button
                            onClick={handleImportClick}
                            disabled={isImporting}
                            className="flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                            <Upload size={18} className="mr-2" />
                            Import
                        </button>

                        <button
                            onClick={handleAddClick}
                            className="flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <Plus size={18} className="mr-2" />
                            Add Vendor
                        </button>
                    </div>
                </div>

                {/* Import Preview Modal */}
                {showImportPreview && importData && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                                <h3 className="text-xl font-bold text-slate-800">Import Preview</h3>
                                <button onClick={handleCancelImport} className="text-slate-400 hover:text-slate-600">
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Summary */}
                            <div className="p-6 bg-slate-50 border-b border-slate-200">
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div className="bg-white p-4 rounded-lg shadow-sm">
                                        <div className="text-2xl font-bold text-slate-800">{importData.summary.totalRows}</div>
                                        <div className="text-sm text-slate-500">Total Rows</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-lg shadow-sm">
                                        <div className="text-2xl font-bold text-green-600">{importData.summary.validVendors}</div>
                                        <div className="text-sm text-slate-500">Valid Vendors</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-lg shadow-sm">
                                        <div className="text-2xl font-bold text-red-600">{importData.summary.invalidRows}</div>
                                        <div className="text-sm text-slate-500">Errors</div>
                                    </div>
                                </div>
                            </div>

                            {/* Vendor Preview */}
                            <div className="p-6 overflow-y-auto max-h-[40vh]">
                                <h4 className="font-semibold text-slate-700 mb-3">Vendors to Import:</h4>
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-100">
                                        <tr>
                                            <th className="p-2 text-left">Vendor Name</th>
                                            <th className="p-2 text-left">Email</th>
                                            <th className="p-2 text-left">Bank</th>
                                            <th className="p-2 text-left">Account</th>
                                            <th className="p-2 text-left">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {importData.vendors.slice(0, 10).map((vendor, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-2 font-medium">{vendor.name}</td>
                                                <td className="p-2">{vendor.email || '-'}</td>
                                                <td className="p-2">{vendor.banking?.bankName || '-'}</td>
                                                <td className="p-2 font-mono text-xs">{vendor.banking?.accountNumber || '-'}</td>
                                                <td className="p-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs ${vendor.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                                                        }`}>
                                                        {vendor.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {importData.vendors.length > 10 && (
                                            <tr>
                                                <td colSpan="5" className="p-2 text-center text-slate-500">
                                                    ... and {importData.vendors.length - 10} more
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>

                                {/* Errors */}
                                {importData.summary.errors && importData.summary.errors.length > 0 && (
                                    <div className="mt-4">
                                        <h4 className="font-semibold text-red-700 mb-2">Import Errors:</h4>
                                        <div className="bg-red-50 p-3 rounded-lg text-sm">
                                            {importData.summary.errors.slice(0, 5).map((err, idx) => (
                                                <div key={idx} className="text-red-700">
                                                    Row {err.row}: {err.vendorName} - {err.errors.join(', ')}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="p-6 border-t border-slate-200 flex justify-end space-x-3">
                                <button
                                    onClick={handleCancelImport}
                                    className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmImport}
                                    disabled={isImporting || importData.vendors.length === 0}
                                    className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                    {isImporting ? 'Importing...' : `Import ${importData.vendors.length} Vendors`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Data Grid */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 uppercase text-xs font-bold tracking-wider border-b border-slate-200">
                                    <th className="p-4">Name</th>
                                    <th className="p-4">Bank Details</th>
                                    <th className="p-4">Account No.</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-slate-400">Loading vendors...</td>
                                    </tr>
                                ) : filteredVendors.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-slate-400">
                                            {vendors.length === 0
                                                ? 'No vendors yet. Add one or import from Excel.'
                                                : 'No vendors found matching your search.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredVendors.map(vendor => (
                                        <tr key={vendor.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="p-4">
                                                <div className="font-semibold text-slate-800">{vendor.name}</div>
                                                <div className="text-xs text-slate-500">{vendor.email || '-'}</div>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-sm text-slate-700">{vendor.banking?.bankName || '-'}</div>
                                                <div className="text-xs text-slate-500">Branch: {vendor.banking?.branchCode || '-'}</div>
                                            </td>
                                            <td className="p-4 font-mono text-sm text-slate-600">
                                                {vendor.banking?.accountNumber || '-'}
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${vendor.status === 'active'
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-slate-100 text-slate-800'
                                                    }`}>
                                                    {vendor.status === 'active' ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button
                                                    onClick={() => handleEditClick(vendor)}
                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Placeholder */}
                    <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
                        <span>Showing {filteredVendors.length} of {vendors.length} vendors</span>
                        <div className="flex space-x-2">
                            <button className="p-1 hover:bg-slate-100 rounded disabled:opacity-50" disabled><ChevronLeft size={20} /></button>
                            <button className="p-1 hover:bg-slate-100 rounded disabled:opacity-50" disabled><ChevronRight size={20} /></button>
                        </div>
                    </div>
                </div>
            </div>

            <VendorModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveVendor}
                vendor={editingVendor}
            />
        </Layout>
    );
};

export default VendorManager;
