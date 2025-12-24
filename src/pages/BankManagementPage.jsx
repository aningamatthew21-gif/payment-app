import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout/Layout';
import BankSelector from '../components/bank/BankSelector';
import BankDetailView from '../components/bank/BankDetailView';
import { BankService } from '../services/BankService';

const BankManagementPage = ({ onNavigate, onBack, onLogout, userId, db, appId }) => {
    const [banks, setBanks] = useState([]);
    const [selectedBankId, setSelectedBankId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Load banks from BankService
    useEffect(() => {
        if (db && appId) {
            loadBanks();
        }
    }, [db, appId, refreshTrigger]);

    const loadBanks = async () => {
        try {
            setLoading(true);
            const fetchedBanks = await BankService.getAllBanks(db, appId);

            // Calculate monthly stats for each bank from ledger
            const banksWithStats = await Promise.all(fetchedBanks.map(async (bank) => {
                try {
                    const ledger = await BankService.getBankLedger(db, appId, bank.id);
                    const stats = calculateMonthlyStatsFromLedger(ledger);
                    return { ...bank, stats };
                } catch (error) {
                    console.error(`Error loading stats for ${bank.name}:`, error);
                    return { ...bank, stats: { monthlyInflow: 0, monthlyOutflow: 0 } };
                }
            }));

            setBanks(banksWithStats);
        } catch (error) {
            console.error('Error loading banks:', error);
            alert('Failed to load banks: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Helper to calculate monthly stats from ledger entries
    const calculateMonthlyStatsFromLedger = (ledger) => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let monthlyInflow = 0;
        let monthlyOutflow = 0;

        ledger.forEach(entry => {
            // Handle Firestore timestamp properly
            let entryDate;
            if (entry.timestamp?.toDate) {
                entryDate = entry.timestamp.toDate();
            } else if (entry.timestamp?.seconds) {
                entryDate = new Date(entry.timestamp.seconds * 1000);
            } else if (entry.date) {
                entryDate = new Date(entry.date);
            } else if (entry.timestamp) {
                entryDate = new Date(entry.timestamp);
            } else {
                return; // Skip entries without valid date
            }

            // Validate date
            if (isNaN(entryDate.getTime())) return;

            if (entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear) {
                if (entry.type === 'INFLOW') {
                    monthlyInflow += Math.abs(Number(entry.amount || 0));
                } else {
                    monthlyOutflow += Math.abs(Number(entry.amount || 0));
                }
            }
        });

        return { monthlyInflow, monthlyOutflow };
    };

    const selectedBank = banks.find(b => b.id === selectedBankId);

    const handleBankUpdate = () => {
        // Trigger refresh after a bank operation
        setRefreshTrigger(prev => prev + 1);
    };

    return (
        <Layout
            title="Bank Management"
            userId={userId}
            onLogout={onLogout}
            onBack={selectedBankId ? () => setSelectedBankId(null) : onBack}
        >
            <div className="max-w-7xl mx-auto">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                            <p className="mt-2 text-slate-600">Loading banks...</p>
                        </div>
                    </div>
                ) : selectedBankId ? (
                    <BankDetailView
                        bank={selectedBank}
                        onBack={() => {
                            setSelectedBankId(null);
                            handleBankUpdate(); // Refresh list when returning
                        }}
                        db={db}
                        appId={appId}
                        userId={userId}
                    />
                ) : (
                    <BankSelector
                        banks={banks}
                        onSelectBank={(bank) => setSelectedBankId(bank.id)}
                        onBack={onBack}
                        db={db}
                        appId={appId}
                        userId={userId}
                        onBankAdded={handleBankUpdate}
                    />
                )}
            </div>
        </Layout>
    );
};

export default BankManagementPage;

