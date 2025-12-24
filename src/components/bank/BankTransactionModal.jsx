/**
 * Bank Transaction Modal
 * Unified modal for recording both Inflows and Outflows
 * Dynamically themed: Green for Inflows, Red for Outflows
 */

import React, { useState } from 'react';
import { X, Save, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

const BankTransactionModal = ({ isOpen, onClose, bank, mode = 'INFLOW', onSave }) => {
    if (!isOpen) return null;

    const isInflow = mode === 'INFLOW';

    const [formData, setFormData] = useState({
        date: new Date().toISOString().slice(0, 10),
        amount: '',
        category: '',
        description: '',
        reference: ''
    });

    const [loading, setLoading] = useState(false);

    // Dynamic category options based on transaction type
    // Aligned with CashPositionService categories for accurate reporting
    const categories = isInflow
        ? ['Cash Sales', 'Account Receivable', 'Inter-company Receipt', 'Uncredited Payment', 'Inter-account Transfer', 'Account Interest', 'Other Inflow']
        : ['Bank Charges', 'Accredited Suppliers', 'Admin Operations', 'Regulatory Payment', 'Staff Emoluments', 'Inter-account Transfer', 'Other Outflow'];

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate amount
        const parsedAmount = parseFloat(formData.amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            alert('Please enter a valid amount greater than 0');
            return;
        }

        setLoading(true);

        try {
            await onSave({
                ...formData,
                amount: parsedAmount,
                type: mode
            });

            // Reset form on success
            setFormData({
                date: new Date().toISOString().slice(0, 10),
                amount: '',
                category: '',
                description: '',
                reference: ''
            });
        } catch (error) {
            console.error('Transaction save error:', error);
            // Error handling is done in parent component
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">

                {/* Dynamic Header - Green for Inflow, Red for Outflow */}
                <div className={`p-6 text-white flex justify-between items-center ${isInflow ? 'bg-emerald-600' : 'bg-rose-600'
                    }`}>
                    <div className="flex items-center space-x-3">
                        {isInflow ? <ArrowDownLeft size={24} /> : <ArrowUpRight size={24} />}
                        <div>
                            <h2 className="text-xl font-bold">
                                {isInflow ? 'Record Inflow' : 'Record Outflow'}
                            </h2>
                            <p className="text-sm opacity-90">{bank.name} ({bank.currency || 'GHS'})</p>
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

                    {/* Amount Field - Large and Prominent */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Amount <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-3 text-slate-400 font-bold">
                                {bank.currency || 'GHS'}
                            </span>
                            <input
                                type="number"
                                step="0.01"
                                required
                                className={`w-full pl-16 p-3 text-xl font-bold border rounded-lg focus:ring-2 focus:outline-none ${isInflow
                                    ? 'border-emerald-200 focus:ring-emerald-500 text-emerald-700'
                                    : 'border-rose-200 focus:ring-rose-500 text-rose-700'
                                    }`}
                                placeholder="0.00"
                                value={formData.amount}
                                onChange={e => handleChange('amount', e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Date and Category Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                required
                                className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                value={formData.date}
                                onChange={e => handleChange('date', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Category <span className="text-red-500">*</span>
                            </label>
                            <select
                                required
                                className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                value={formData.category}
                                onChange={e => handleChange('category', e.target.value)}
                            >
                                <option value="">Select...</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Description Field */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            {isInflow ? 'Source / Payer' : 'Payee / Beneficiary'} <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder={isInflow ? "e.g. Client Name or Transfer Source" : "e.g. Bank Name or Vendor"}
                            value={formData.description}
                            onChange={e => handleChange('description', e.target.value)}
                        />
                    </div>

                    {/* Reference Field (Optional) */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Reference / Cheque No.
                        </label>
                        <input
                            type="text"
                            className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Optional reference number"
                            value={formData.reference}
                            onChange={e => handleChange('reference', e.target.value)}
                        />
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
                            className={`flex-1 py-3 text-white rounded-lg font-bold shadow-md flex justify-center items-center space-x-2 transition-colors ${isInflow
                                ? 'bg-emerald-600 hover:bg-emerald-700'
                                : 'bg-rose-600 hover:bg-rose-700'
                                } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <Save size={18} />
                            <span>
                                {loading
                                    ? 'Processing...'
                                    : isInflow ? 'Confirm Deposit' : 'Confirm Payment'
                                }
                            </span>
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};

export default BankTransactionModal;
