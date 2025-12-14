/**
 * Add Bank Modal
 * Form to create new bank accounts in the system
 */

import React, { useState } from 'react';
import { X, Save, Building2 } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const AddBankModal = ({ isOpen, onClose, db, appId, userId, onSuccess }) => {
    if (!isOpen) return null;

    const [formData, setFormData] = useState({
        name: '',
        accountNumber: '',
        currency: 'GHS',
        initialBalance: '0',
        bankType: 'Checking'
    });

    const [loading, setLoading] = useState(false);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validation
        if (!formData.name.trim()) {
            alert('Please enter a bank name');
            return;
        }

        if (!formData.accountNumber.trim()) {
            alert('Please enter an account number');
            return;
        }

        const initialBalance = parseFloat(formData.initialBalance);
        if (isNaN(initialBalance)) {
            alert('Please enter a valid initial balance');
            return;
        }

        setLoading(true);

        try {
            const banksRef = collection(db, `artifacts/${appId}/public/data/banks`);

            const newBank = {
                name: formData.name.trim(),
                accountNumber: formData.accountNumber.trim(),
                currency: formData.currency,
                balance: initialBalance,
                bankType: formData.bankType,
                status: 'active',
                createdAt: serverTimestamp(),
                createdBy: userId || 'system',
                lastUpdated: serverTimestamp()
            };

            await addDoc(banksRef, newBank);

            // Reset form
            setFormData({
                name: '',
                accountNumber: '',
                currency: 'GHS',
                initialBalance: '0',
                bankType: 'Checking'
            });

            alert('Bank account created successfully!');

            if (onSuccess) {
                onSuccess();
            }

            onClose();
        } catch (error) {
            console.error('Error adding bank:', error);
            alert(`Failed to create bank account: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">

                {/* Header */}
                <div className="p-6 bg-blue-600 text-white flex justify-between items-center">
                    <div className="flex items-center space-x-3">
                        <Building2 size={24} />
                        <div>
                            <h2 className="text-xl font-bold">Add New Bank Account</h2>
                            <p className="text-sm opacity-90">Create a new bank account for tracking</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="hover:bg-white/20 p-2 rounded-full transition-colors"
                        type="button"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">

                    {/* Bank Name */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Bank Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g., GT Bank - Operations"
                            value={formData.name}
                            onChange={e => handleChange('name', e.target.value)}
                        />
                        <p className="text-xs text-slate-500 mt-1">Give this account a descriptive name</p>
                    </div>

                    {/* Account Number */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Account Number <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g., 1234567890"
                            value={formData.accountNumber}
                            onChange={e => handleChange('accountNumber', e.target.value)}
                        />
                    </div>

                    {/* Currency and Initial Balance Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Currency <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                value={formData.currency}
                                onChange={e => handleChange('currency', e.target.value)}
                            >
                                <option value="GHS">GHS</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="GBP">GBP</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Initial Balance
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                placeholder="0.00"
                                value={formData.initialBalance}
                                onChange={e => handleChange('initialBalance', e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Bank Type */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Account Type
                        </label>
                        <select
                            className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            value={formData.bankType}
                            onChange={e => handleChange('bankType', e.target.value)}
                        >
                            <option value="Checking">Checking Account</option>
                            <option value="Savings">Savings Account</option>
                            <option value="Petty Cash">Petty Cash</option>
                            <option value="Money Market">Money Market</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-4 flex space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold shadow-md flex justify-center items-center space-x-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            <Save size={18} />
                            <span>{loading ? 'Creating...' : 'Create Account'}</span>
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default AddBankModal;
