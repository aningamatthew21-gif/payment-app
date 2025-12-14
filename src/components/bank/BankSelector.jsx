import React, { useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import BankCard from './BankCard';
import AddBankModal from './AddBankModal';

const BankSelector = ({ banks, onSelectBank, onBack, db, appId, userId, onBankAdded }) => {
    const [showAddModal, setShowAddModal] = useState(false);

    const handleBankAdded = () => {
        setShowAddModal(false);
        if (onBankAdded) {
            onBankAdded(); // Trigger refresh in parent
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center space-x-4 mb-8">
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
            <AddBankModal
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

