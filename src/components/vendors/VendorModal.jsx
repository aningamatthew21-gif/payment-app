import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

const VendorModal = ({ isOpen, onClose, onSave, vendor = null }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        status: 'active',
        banking: {
            bankName: '',
            branchCode: '',
            accountName: '',
            accountNumber: ''
        }
    });

    useEffect(() => {
        if (vendor) {
            setFormData(vendor);
        } else {
            // Reset for new vendor
            setFormData({
                name: '',
                email: '',
                status: 'active',
                banking: {
                    bankName: '',
                    branchCode: '',
                    accountName: '',
                    accountNumber: ''
                }
            });
        }
    }, [vendor, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const updateBanking = (field, value) => {
        setFormData(prev => ({
            ...prev,
            banking: {
                ...prev.banking,
                [field]: value
            }
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-6 border-b border-slate-100">
                    <h3 className="text-lg font-semibold text-slate-800">
                        {vendor ? `Edit Vendor: ${vendor.name}` : 'Add New Vendor'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* General Information */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 border-b border-slate-100 pb-2">General Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Vendor Name *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g. Acme Corp Ltd."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Contact Email</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="finance@vendor.com"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Banking Details */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-4 border-b border-slate-100 pb-2">Banking Details (Critical)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Bank Name</label>
                                <input
                                    type="text"
                                    value={formData.banking.bankName}
                                    onChange={(e) => updateBanking('bankName', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g. GT Bank"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Branch / Sort Code</label>
                                <input
                                    type="text"
                                    value={formData.banking.branchCode}
                                    onChange={(e) => updateBanking('branchCode', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="e.g. 01"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Account Name</label>
                                <input
                                    type="text"
                                    value={formData.banking.accountName}
                                    onChange={(e) => updateBanking('accountName', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Name on Bank Account"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Account Number</label>
                                <input
                                    type="text"
                                    value={formData.banking.accountNumber}
                                    onChange={(e) => updateBanking('accountNumber', e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                                    placeholder="0000000000"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="status"
                            checked={formData.status === 'active'}
                            onChange={(e) => setFormData({ ...formData, status: e.target.checked ? 'active' : 'inactive' })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="status" className="text-sm text-slate-700">Vendor is Active</label>
                    </div>

                    <div className="pt-4 flex space-x-3 justify-end border-t border-slate-100 mt-6">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-slate-100 text-slate-700 font-medium rounded-md hover:bg-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <Save size={18} className="mr-2" />
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default VendorModal;
