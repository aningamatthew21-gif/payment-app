import React, { useState, useEffect } from 'react';
import { Search, Download, Upload, Plus, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';
import Layout from '../Layout/Layout';
import VendorModal from './VendorModal';
import { VendorService } from '../../services/VendorService';

const VendorManager = ({ onBack, onLogout, userId, db, appId }) => {
    const [vendors, setVendors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingVendor, setEditingVendor] = useState(null);

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
            // Update
            const updated = await VendorService.updateVendor(db, appId, editingVendor.id, vendorData);
            setVendors(prev => prev.map(v => v.id === updated.id ? updated : v));
        } else {
            // Add
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
    };

    const handleImportClick = () => {
        // Trigger hidden file input
        document.getElementById('vendor-import-input').click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const importedVendors = await VendorService.parseImportFile(file);
            alert(`Imported ${importedVendors.length} vendors (Mock)`);
            setVendors(prev => [...importedVendors, ...prev]);
        }
    };

    // Filter vendors
    const filteredVendors = vendors.filter(v =>
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Layout
            title="Vendor Management"
            userId={userId}
            onLogout={onLogout}
            onBack={onBack}
        >
            <div className="max-w-7xl mx-auto space-y-6">
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

                    <div className="flex items-center space-x-3 w-full md:w-auto">
                        <button
                            onClick={handleDownloadTemplate}
                            className="flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                        >
                            <Download size={18} className="mr-2" />
                            Template
                        </button>

                        <input
                            type="file"
                            id="vendor-import-input"
                            className="hidden"
                            accept=".csv, .xlsx"
                            onChange={handleFileChange}
                        />
                        <button
                            onClick={handleImportClick}
                            className="flex items-center px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
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
                                        <td colSpan="5" className="p-8 text-center text-slate-400">No vendors found.</td>
                                    </tr>
                                ) : (
                                    filteredVendors.map(vendor => (
                                        <tr key={vendor.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="p-4">
                                                <div className="font-semibold text-slate-800">{vendor.name}</div>
                                                <div className="text-xs text-slate-500">{vendor.email}</div>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-sm text-slate-700">{vendor.banking.bankName}</div>
                                                <div className="text-xs text-slate-500">Branch: {vendor.banking.branchCode}</div>
                                            </td>
                                            <td className="p-4 font-mono text-sm text-slate-600">
                                                {vendor.banking.accountNumber}
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
                        <span>Showing {filteredVendors.length} vendors</span>
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
