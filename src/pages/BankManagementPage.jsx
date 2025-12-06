import React, { useState } from 'react';
import Layout from '../components/Layout/Layout';
import BankSelector from '../components/bank/BankSelector';
import BankDetailView from '../components/bank/BankDetailView';

// --- MOCK DATA ---
const INITIAL_BANKS = [
    {
        id: "bank_001",
        name: "GT Bank - Operations",
        currency: "GHS",
        accountNumber: "****1234",
        balance: 450200.00,
        stats: {
            monthlyInflow: 50000,
            monthlyOutflow: 20000
        },
        transactions: [
            {
                id: "tx_101",
                date: "2023-10-24",
                type: "INFLOW",
                description: "Client Payment - Project Alpha",
                amount: 50000.00,
                balanceAfter: 450200.00
            },
            {
                id: "tx_102",
                date: "2023-10-22",
                type: "OUTFLOW",
                description: "Vendor Payout - Hardware Supplies",
                amount: -10000.00,
                balanceAfter: 400200.00
            },
            {
                id: "tx_103",
                date: "2023-10-20",
                type: "OUTFLOW",
                description: "Server Costs - AWS",
                amount: -500.00,
                balanceAfter: 410200.00
            }
        ]
    },
    {
        id: "bank_002",
        name: "Ecobank - USD",
        currency: "USD",
        accountNumber: "****5678",
        balance: 12500.00,
        stats: {
            monthlyInflow: 2000,
            monthlyOutflow: 500
        },
        transactions: [
            {
                id: "tx_201",
                date: "2023-10-15",
                type: "INFLOW",
                description: "Consulting Fee",
                amount: 2000.00,
                balanceAfter: 12500.00
            }
        ]
    },
    {
        id: "bank_003",
        name: "Petty Cash",
        currency: "GHS",
        accountNumber: "N/A",
        balance: 2400.00,
        stats: {
            monthlyInflow: 5000,
            monthlyOutflow: 2600
        },
        transactions: []
    }
];

const BankManagementPage = ({ onNavigate, onBack, onLogout, userId }) => {
    const [banks, setBanks] = useState(INITIAL_BANKS);
    const [selectedBankId, setSelectedBankId] = useState(null);

    const selectedBank = banks.find(b => b.id === selectedBankId);

    const handleRecordInflow = (bankId, data) => {
        console.log("Recording Inflow:", data);

        setBanks(prevBanks => prevBanks.map(bank => {
            if (bank.id !== bankId) return bank;

            const newBalance = bank.balance + data.amount;
            const newTransaction = {
                id: `tx_${Date.now()}`,
                date: data.date,
                type: 'INFLOW',
                description: `${data.description} (${data.source})`,
                amount: data.amount,
                balanceAfter: newBalance
            };

            return {
                ...bank,
                balance: newBalance,
                stats: {
                    ...bank.stats,
                    monthlyInflow: bank.stats.monthlyInflow + data.amount
                },
                transactions: [newTransaction, ...bank.transactions]
            };
        }));
    };

    return (
        <Layout
            title="Bank Management"
            userId={userId}
            onLogout={onLogout}
            onBack={selectedBankId ? () => setSelectedBankId(null) : onBack}
        >
            <div className="max-w-7xl mx-auto">
                {selectedBankId ? (
                    <BankDetailView
                        bank={selectedBank}
                        onBack={() => setSelectedBankId(null)}
                        onRecordInflow={handleRecordInflow}
                    />
                ) : (
                    <BankSelector
                        banks={banks}
                        onSelectBank={(bank) => setSelectedBankId(bank.id)}
                        onBack={onBack}
                    />
                )}
            </div>
        </Layout>
    );
};

export default BankManagementPage;
