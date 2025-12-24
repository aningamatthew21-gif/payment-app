import React, { useState } from 'react';
import { ChevronLeft, Plus, Download, Upload, X, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';
import BankCard from './BankCard';
import BankModal from './BankModal';
import { BankService } from '../../services/BankService';

const BankSelector = ({ banks, onSelectBank, onBack, db, appId, userId, onBankAdded }) => {
    const [showAddModal, setShowAddModal] = useState(false);

    // Import state
    const [showImportPreview, setShowImportPreview] = useState(false);
    const [importData, setImportData] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importStatus, setImportStatus] = useState(null);

    const handleBankAdded = () => {
        setShowAddModal(false);
        if (onBankAdded) {
            onBankAdded();
        }
    };

    const handleDownloadTemplate = () => {
        BankService.generateExcelTemplate();
        setImportStatus({ type: 'success', message: 'Template downloaded successfully!' });
        setTimeout(() => setImportStatus(null), 3000);
    };

    const handleExportBanks = async () => {
        const result = await BankService.exportBanks(db, appId);
        if (result.success) {
            setImportStatus({ type: 'success', message: `Exported ${result.count} banks successfully!` });
        } else {
            setImportStatus({ type: 'error', message: result.error || 'Export failed' });
        }
        setTimeout(() => setImportStatus(null), 3000);
    };

    const handleImportClick = () => {
        document.getElementById('bank-import-input').click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        setImportStatus({ type: 'info', message: 'Parsing file...' });

        try {
            const result = await BankService.parseImportFile(file);

            if (result.success && result.banks.length > 0) {
                setImportData(result);
                setShowImportPreview(true);
                setImportStatus(null);
            } else if (result.success && result.banks.length === 0) {
                setImportStatus({
                    type: 'error',
                    message: `No valid banks found. ${result.summary.invalidRows} rows had errors.`
                });
            } else {
                setImportStatus({ type: 'error', message: result.error || 'Failed to parse file' });
            }
        } catch (error) {
            setImportStatus({ type: 'error', message: `Parse error: ${error.message}` });
        } finally {
            setIsImporting(false);
            e.target.value = '';
        }
    };

    const handleConfirmImport = async () => {
        if (!importData || !importData.banks) return;

        setIsImporting(true);
        setImportStatus({ type: 'info', message: 'Saving banks to database...' });

        try {
            const result = await BankService.importBanks(db, appId, importData.banks, userId);

            if (result.success && result.imported > 0) {
                setImportStatus({
                    type: 'success',
                    message: `Successfully imported ${result.imported} banks!`
                });
                setShowImportPreview(false);
                setImportData(null);
                if (onBankAdded) {
                    onBankAdded(); // Refresh bank list
                }
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

    return (
        <div className="space-y-6">
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

            {/* Header with Import/Export */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <div className="flex items-center space-x-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Bank Management</h1>
                        <p className="text-slate-500">Select an account to view details and manage transactions</p>
                    </div>
                </div>

                {/* Import/Export Buttons */}
                <div className="flex items-center space-x-3 ml-12 md:ml-0">
                    <button
                        onClick={handleDownloadTemplate}
                        className="flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm"
                    >
                        <Download size={16} className="mr-2" />
                        Template
                    </button>

                    <button
                        onClick={handleExportBanks}
                        disabled={banks.length === 0}
                        className="flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 text-sm"
                    >
                        <Download size={16} className="mr-2" />
                        Export
                    </button>

                    <input
                        type="file"
                        id="bank-import-input"
                        className="hidden"
                        accept=".csv, .xlsx, .xls"
                        onChange={handleFileChange}
                    />
                    <button
                        onClick={handleImportClick}
                        disabled={isImporting}
                        className="flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
                    >
                        <Upload size={16} className="mr-2" />
                        Import
                    </button>
                </div>
            </div>

            {/* Import Preview Modal */}
            {showImportPreview && importData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-800">Bank Import Preview</h3>
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
                                    <div className="text-2xl font-bold text-green-600">{importData.summary.validBanks}</div>
                                    <div className="text-sm text-slate-500">Valid Banks</div>
                                </div>
                                <div className="bg-white p-4 rounded-lg shadow-sm">
                                    <div className="text-2xl font-bold text-red-600">{importData.summary.invalidRows}</div>
                                    <div className="text-sm text-slate-500">Errors</div>
                                </div>
                            </div>
                        </div>

                        {/* Bank Preview */}
                        <div className="p-6 overflow-y-auto max-h-[40vh]">
                            <h4 className="font-semibold text-slate-700 mb-3">Banks to Import:</h4>
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100">
                                    <tr>
                                        <th className="p-2 text-left">Bank Name</th>
                                        <th className="p-2 text-left">Account No.</th>
                                        <th className="p-2 text-left">Currency</th>
                                        <th className="p-2 text-right">Balance</th>
                                        <th className="p-2 text-left">Type</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {importData.banks.slice(0, 10).map((bank, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-2 font-medium">{bank.name}</td>
                                            <td className="p-2 font-mono text-xs">{bank.accountNumber}</td>
                                            <td className="p-2">{bank.currency}</td>
                                            <td className="p-2 text-right font-mono">{bank.balance.toLocaleString()}</td>
                                            <td className="p-2">
                                                <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700">
                                                    {bank.bankType}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {importData.banks.length > 10 && (
                                        <tr>
                                            <td colSpan="5" className="p-2 text-center text-slate-500">
                                                ... and {importData.banks.length - 10} more
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
                                                Row {err.row}: {err.bankName} - {err.errors.join(', ')}
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
                                disabled={isImporting || importData.banks.length === 0}
                                className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                                {isImporting ? 'Importing...' : `Import ${importData.banks.length} Banks`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bank Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {banks.map(bank => (
                    <BankCard
                        key={bank.id}
                        bank={bank}
                        onClick={onSelectBank}
                    />
                ))}

                {/* Add New Bank Placeholder */}
                <div
                    onClick={() => setShowAddModal(true)}
                    className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer min-h-[200px]"
                >
                    <div className="p-3 bg-white rounded-full shadow-sm mb-3">
                        <Plus size={24} />
                    </div>
                    <span className="font-medium">Add New Bank</span>
                </div>
            </div>

            {/* Add Bank Modal */}
            <BankModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                db={db}
                appId={appId}
                userId={userId}
                onSuccess={handleBankAdded}
            />
        </div>
    );
};

export default BankSelector;
