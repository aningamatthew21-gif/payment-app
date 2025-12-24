/**
 * Cash Position Service
 * Calculates the Weekly Cash Position Report data
 * Aggregates bank balances, inflows, outflows, and pending payments by currency
 */

import {
    collection,
    getDocs,
    query,
    where,
    orderBy
} from 'firebase/firestore';

// Cash Flow Categories - Standardized for reporting
export const INFLOW_CATEGORIES = [
    { value: 'Cash Sales', label: 'Cash Sales' },
    { value: 'Account Receivable', label: 'Account Receivable' },
    { value: 'Inter-company Receipt', label: 'Inter-company Receipt' },
    { value: 'Uncredited Payment', label: 'Uncredited Payment' },
    { value: 'Inter-account Transfer', label: 'Inter-account Transfer (In)' },
    { value: 'Account Interest', label: 'Account Interest' },
    { value: 'Other Inflow', label: 'Other Inflow' }
];

export const OUTFLOW_CATEGORIES = [
    { value: 'Accredited Suppliers', label: 'Accredited Suppliers (Vendor)' },
    { value: 'Admin Operations', label: 'Admin Operations (Opex)' },
    { value: 'Regulatory Payment', label: 'Regulatory Payment (Tax, SSNIT)' },
    { value: 'Staff Emoluments', label: 'Staff Emoluments (Salaries)' },
    { value: 'Loan Principal', label: 'Loan Principal Prepayment' },
    { value: 'Inter-account Transfer', label: 'Inter-account Transfer (Out)' },
    { value: 'Inter-company Transfer', label: 'Inter-company Transfer' },
    { value: 'USD Purchase', label: 'USD Purchase' },
    { value: 'Bank Charges', label: 'Bank Charges' },
    { value: 'Other Outflow', label: 'Other Outflow' }
];

// Pending Payment Categories (subset of outflow categories)
export const PENDING_CATEGORIES = [
    { value: 'Credit Suppliers Payment', label: 'Credit Suppliers Payment' },
    { value: 'Inter-account Transfer', label: 'Inter-account Transfer' },
    { value: 'Inter-company Transfer', label: 'Inter-company Transfer' },
    { value: 'Admin Operations', label: 'Admin Operations' },
    { value: 'Project Support Services', label: 'Project Support Services' },
    { value: 'PPE', label: 'PPE' },
    { value: 'Regulatory Payments', label: 'Regulatory Payments' },
    { value: 'USD Purchased', label: 'USD Purchased' }
];

export class CashPositionService {

    /**
     * Calculate the Tuesday date boundaries for a given report date
     * @param {Date} reportDate - The date to calculate Tuesday boundaries for
     * @returns {Object} { previousTuesday, currentTuesday }
     */
    static getTuesdayDates(reportDate = new Date()) {
        const date = new Date(reportDate);
        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, 2 = Tuesday, ...

        // Calculate current (or most recent) Tuesday
        let daysFromTuesday = dayOfWeek - 2; // Difference from Tuesday
        if (daysFromTuesday < 0) daysFromTuesday += 7; // If before Tuesday, go to last week

        const currentTuesday = new Date(date);
        currentTuesday.setDate(date.getDate() - daysFromTuesday);
        currentTuesday.setHours(0, 0, 0, 0);

        // Previous Tuesday is exactly 7 days before
        const previousTuesday = new Date(currentTuesday);
        previousTuesday.setDate(currentTuesday.getDate() - 7);
        previousTuesday.setHours(0, 0, 0, 0);

        // End of current Tuesday (for range queries)
        const currentTuesdayEnd = new Date(currentTuesday);
        currentTuesdayEnd.setHours(23, 59, 59, 999);

        // End of previous Tuesday (opening balance cutoff)
        const previousTuesdayEnd = new Date(previousTuesday);
        previousTuesdayEnd.setHours(23, 59, 59, 999);

        console.log('[CashPositionService] Tuesday dates calculated:', {
            previousTuesday: previousTuesday.toISOString(),
            currentTuesday: currentTuesday.toISOString()
        });

        return {
            previousTuesday,
            previousTuesdayEnd,
            currentTuesday,
            currentTuesdayEnd
        };
    }

    /**
     * Get all active banks grouped by currency
     * @param {Object} db - Firestore instance
     * @param {string} appId - Application ID
     * @returns {Promise<Object>} Banks grouped by currency { GHS: [...], USD: [...] }
     */
    static async getBanksByCurrency(db, appId) {
        try {
            const banksRef = collection(db, `artifacts/${appId}/public/data/banks`);
            const snapshot = await getDocs(banksRef);

            const banksByCurrency = {};

            snapshot.forEach(doc => {
                const bank = { id: doc.id, ...doc.data() };
                if (bank.status === 'active' || !bank.status) { // Include banks without status as active
                    const currency = bank.currency || 'GHS';
                    if (!banksByCurrency[currency]) {
                        banksByCurrency[currency] = [];
                    }
                    banksByCurrency[currency].push(bank);
                }
            });

            console.log('[CashPositionService] Banks by currency:', Object.keys(banksByCurrency).map(c => `${c}: ${banksByCurrency[c].length}`));

            return banksByCurrency;
        } catch (error) {
            console.error('[CashPositionService] Error fetching banks:', error);
            return {};
        }
    }

    /**
     * Get opening balances for all banks as of a specific date
     * Uses the bank ledger to calculate point-in-time balances
     * @param {Object} db - Firestore instance
     * @param {string} appId - Application ID
     * @param {Date} asOfDate - The date to calculate balances for
     * @returns {Promise<Object>} Balances by bankId { bankId: { balance, currency, name } }
     */
    static async getOpeningBalances(db, appId, asOfDate) {
        try {
            console.log('[CashPositionService] Calculating opening balances as of:', asOfDate.toISOString());

            // Get all banks first
            const banksRef = collection(db, `artifacts/${appId}/public/data/banks`);
            const banksSnapshot = await getDocs(banksRef);

            const balances = {};

            // Initialize with current balances (we'll adjust backwards if needed)
            banksSnapshot.forEach(doc => {
                const bank = doc.data();
                if (bank.status === 'active' || !bank.status) {
                    balances[doc.id] = {
                        balance: Number(bank.balance || 0),
                        currency: bank.currency || 'GHS',
                        name: bank.name
                    };
                }
            });

            // Get all ledger entries after the asOfDate to "reverse" them
            const ledgerRef = collection(db, `artifacts/${appId}/public/data/bankLedger`);
            const snapshot = await getDocs(ledgerRef);

            snapshot.forEach(doc => {
                const entry = doc.data();
                const bankId = entry.bankId;

                // Parse timestamp
                let entryDate;
                if (entry.timestamp?.toDate) {
                    entryDate = entry.timestamp.toDate();
                } else if (entry.date) {
                    entryDate = new Date(entry.date);
                } else {
                    return; // Skip entries without dates
                }

                // If entry is AFTER asOfDate, we need to reverse its effect
                if (entryDate > asOfDate && balances[bankId]) {
                    const amount = Number(entry.amount || 0);
                    // Reverse: if it was added, subtract; if subtracted, add
                    balances[bankId].balance -= amount;
                }
            });

            // Round balances
            Object.keys(balances).forEach(bankId => {
                balances[bankId].balance = Math.round(balances[bankId].balance * 100) / 100;
            });

            console.log('[CashPositionService] Opening balances calculated for', Object.keys(balances).length, 'banks');

            return balances;
        } catch (error) {
            console.error('[CashPositionService] Error calculating opening balances:', error);
            return {};
        }
    }

    /**
     * Get cash flows (inflows and outflows) within a date range, grouped by category and bank
     * @param {Object} db - Firestore instance
     * @param {string} appId - Application ID
     * @param {Date} startDate - Start of period
     * @param {Date} endDate - End of period
     * @returns {Promise<Object>} { inflows: { category: { bankId: amount } }, outflows: { ... } }
     */
    static async getCashFlows(db, appId, startDate, endDate) {
        try {
            console.log('[CashPositionService] Fetching cash flows from', startDate.toISOString(), 'to', endDate.toISOString());

            const ledgerRef = collection(db, `artifacts/${appId}/public/data/bankLedger`);
            const snapshot = await getDocs(ledgerRef);

            const inflows = {};
            const outflows = {};

            // Initialize all categories with empty objects
            INFLOW_CATEGORIES.forEach(cat => { inflows[cat.value] = {}; });
            OUTFLOW_CATEGORIES.forEach(cat => { outflows[cat.value] = {}; });

            snapshot.forEach(doc => {
                const entry = doc.data();

                // Parse timestamp
                let entryDate;
                if (entry.timestamp?.toDate) {
                    entryDate = entry.timestamp.toDate();
                } else if (entry.date) {
                    entryDate = new Date(entry.date);
                } else {
                    return; // Skip entries without dates
                }

                // Check if within range
                if (entryDate < startDate || entryDate > endDate) {
                    return;
                }

                const bankId = entry.bankId;
                const amount = Math.abs(Number(entry.amount || 0));
                // Check both 'category' and 'cashFlowCategory' fields for compatibility
                const category = entry.category || entry.cashFlowCategory || (entry.type === 'INFLOW' ? 'Other Inflow' : 'Other Outflow');
                const type = entry.type || (entry.amount > 0 ? 'INFLOW' : 'OUTFLOW');

                if (type === 'INFLOW') {
                    // Map to closest matching category or use 'Other Inflow'
                    const matchedCat = INFLOW_CATEGORIES.find(c => c.value === category)?.value || 'Other Inflow';
                    if (!inflows[matchedCat]) inflows[matchedCat] = {};
                    inflows[matchedCat][bankId] = (inflows[matchedCat][bankId] || 0) + amount;
                } else {
                    // Map to closest matching category or use 'Other Outflow'
                    const matchedCat = OUTFLOW_CATEGORIES.find(c => c.value === category)?.value || 'Other Outflow';
                    if (!outflows[matchedCat]) outflows[matchedCat] = {};
                    outflows[matchedCat][bankId] = (outflows[matchedCat][bankId] || 0) + amount;
                }
            });

            console.log('[CashPositionService] Cash flows processed');

            return { inflows, outflows };
        } catch (error) {
            console.error('[CashPositionService] Error fetching cash flows:', error);
            return { inflows: {}, outflows: {} };
        }
    }

    /**
     * Get pending payments from staged payments and weekly sheets
     * @param {Object} db - Firestore instance
     * @param {string} appId - Application ID
     * @returns {Promise<Object>} { category: { bankId: amount } }
     */
    static async getPendingPayments(db, appId) {
        try {
            console.log('[CashPositionService] Fetching pending payments');

            const pending = {};
            PENDING_CATEGORIES.forEach(cat => { pending[cat.value] = {}; });

            // 1. Get staged payments that are not finalized
            try {
                const stagedRef = collection(db, `artifacts/${appId}/public/data/stagedPayments`);
                const stagedSnapshot = await getDocs(stagedRef);

                stagedSnapshot.forEach(doc => {
                    const payment = doc.data();
                    if (payment.status !== 'finalized' && payment.status !== 'completed') {
                        const amount = Number(payment.netPayable || payment.amount || 0);
                        const bankId = payment.bankId || payment.bank || 'unknown';
                        const category = payment.cashFlowCategory || 'Admin Operations';

                        const matchedCat = PENDING_CATEGORIES.find(c => c.value === category)?.value || 'Admin Operations';
                        if (!pending[matchedCat]) pending[matchedCat] = {};
                        pending[matchedCat][bankId] = (pending[matchedCat][bankId] || 0) + amount;
                    }
                });
            } catch (e) {
                console.warn('[CashPositionService] Could not fetch staged payments:', e.message);
            }

            // 2. Get weekly sheets with status 'processing' or 'approved'
            try {
                const sheetsRef = collection(db, `artifacts/${appId}/public/data/weeklySheets`);
                const sheetsSnapshot = await getDocs(sheetsRef);

                sheetsSnapshot.forEach(doc => {
                    const sheet = doc.data();
                    const status = (sheet.status || '').toLowerCase();

                    if (status === 'processing' || status === 'approved' || status === 'pending') {
                        // Sum up unfinalised transactions in this sheet
                        const transactions = sheet.transactions || [];
                        transactions.forEach(tx => {
                            if (tx.status !== 'finalized' && tx.status !== 'completed' && tx.status !== 'paid') {
                                const amount = Number(tx.netPayable || tx.amount || 0);
                                const bankId = tx.bankId || tx.bank || 'unknown';
                                const category = tx.cashFlowCategory || 'Admin Operations';

                                const matchedCat = PENDING_CATEGORIES.find(c => c.value === category)?.value || 'Admin Operations';
                                if (!pending[matchedCat]) pending[matchedCat] = {};
                                pending[matchedCat][bankId] = (pending[matchedCat][bankId] || 0) + amount;
                            }
                        });
                    }
                });
            } catch (e) {
                console.warn('[CashPositionService] Could not fetch weekly sheets:', e.message);
            }

            console.log('[CashPositionService] Pending payments calculated');

            return pending;
        } catch (error) {
            console.error('[CashPositionService] Error fetching pending payments:', error);
            return {};
        }
    }

    /**
     * Generate the complete Weekly Cash Position Report data
     * @param {Object} db - Firestore instance
     * @param {string} appId - Application ID
     * @param {Date} reportDate - The report date (will snap to Tuesday)
     * @returns {Promise<Object>} Complete report data structure
     */
    static async generateWeeklyCashPosition(db, appId, reportDate = new Date()) {
        try {
            console.log('[CashPositionService] Generating weekly cash position for:', reportDate.toISOString());

            // 1. Calculate Tuesday boundaries
            const dates = this.getTuesdayDates(reportDate);

            // 2. Get banks grouped by currency
            const banksByCurrency = await this.getBanksByCurrency(db, appId);

            // 3. Get opening balances (as of previous Tuesday end)
            const openingBalances = await this.getOpeningBalances(db, appId, dates.previousTuesdayEnd);

            // 4. Get cash flows for the period
            const { inflows, outflows } = await this.getCashFlows(
                db, appId,
                dates.previousTuesday,
                dates.currentTuesdayEnd
            );

            // 5. Get pending payments
            const pending = await this.getPendingPayments(db, appId);

            // 6. Build report structure by currency
            const reportByCurrency = {};

            for (const [currency, banks] of Object.entries(banksByCurrency)) {
                const bankIds = banks.map(b => b.id);
                const bankNames = {};
                banks.forEach(b => { bankNames[b.id] = b.name; });

                // Calculate totals per category for this currency's banks
                const currencyReport = {
                    currency,
                    banks: banks.map(b => ({ id: b.id, name: b.name })),
                    openingBalance: {},
                    inflows: {},
                    outflows: {},
                    pending: {},
                    totals: {
                        openingBalance: 0,
                        totalInflow: 0,
                        cashAvailable: 0,
                        totalOutflow: 0,
                        currentBalance: 0,
                        totalPending: 0,
                        estimatedClosing: 0
                    }
                };

                // Opening balances
                bankIds.forEach(bankId => {
                    const bal = openingBalances[bankId]?.balance || 0;
                    currencyReport.openingBalance[bankId] = bal;
                    currencyReport.totals.openingBalance += bal;
                });

                // Inflows
                INFLOW_CATEGORIES.forEach(cat => {
                    currencyReport.inflows[cat.value] = {};
                    let catTotal = 0;
                    bankIds.forEach(bankId => {
                        const amt = inflows[cat.value]?.[bankId] || 0;
                        currencyReport.inflows[cat.value][bankId] = amt;
                        catTotal += amt;
                    });
                    currencyReport.inflows[cat.value]['_total'] = catTotal;
                    currencyReport.totals.totalInflow += catTotal;
                });

                // Cash available = Opening + Inflows
                currencyReport.totals.cashAvailable = currencyReport.totals.openingBalance + currencyReport.totals.totalInflow;

                // Outflows
                OUTFLOW_CATEGORIES.forEach(cat => {
                    currencyReport.outflows[cat.value] = {};
                    let catTotal = 0;
                    bankIds.forEach(bankId => {
                        const amt = outflows[cat.value]?.[bankId] || 0;
                        currencyReport.outflows[cat.value][bankId] = amt;
                        catTotal += amt;
                    });
                    currencyReport.outflows[cat.value]['_total'] = catTotal;
                    currencyReport.totals.totalOutflow += catTotal;
                });

                // Current balance = Cash available - Outflows
                currencyReport.totals.currentBalance = currencyReport.totals.cashAvailable - currencyReport.totals.totalOutflow;

                // Calculate per-bank current balance
                currencyReport.currentBalance = {};
                bankIds.forEach(bankId => {
                    let bankBalance = currencyReport.openingBalance[bankId] || 0;
                    // Add inflows
                    INFLOW_CATEGORIES.forEach(cat => {
                        bankBalance += currencyReport.inflows[cat.value]?.[bankId] || 0;
                    });
                    // Subtract outflows
                    OUTFLOW_CATEGORIES.forEach(cat => {
                        bankBalance -= currencyReport.outflows[cat.value]?.[bankId] || 0;
                    });
                    currencyReport.currentBalance[bankId] = bankBalance;
                });

                // Pending payments
                PENDING_CATEGORIES.forEach(cat => {
                    currencyReport.pending[cat.value] = {};
                    let catTotal = 0;
                    bankIds.forEach(bankId => {
                        const amt = pending[cat.value]?.[bankId] || 0;
                        currencyReport.pending[cat.value][bankId] = amt;
                        catTotal += amt;
                    });
                    currencyReport.pending[cat.value]['_total'] = catTotal;
                    currencyReport.totals.totalPending += catTotal;
                });

                // Estimated closing = Current balance - Pending
                currencyReport.totals.estimatedClosing = currencyReport.totals.currentBalance - currencyReport.totals.totalPending;

                // Calculate per-bank estimated closing
                currencyReport.estimatedClosing = {};
                bankIds.forEach(bankId => {
                    let estClosing = currencyReport.currentBalance[bankId] || 0;
                    PENDING_CATEGORIES.forEach(cat => {
                        estClosing -= currencyReport.pending[cat.value]?.[bankId] || 0;
                    });
                    currencyReport.estimatedClosing[bankId] = estClosing;
                });

                reportByCurrency[currency] = currencyReport;
            }

            const result = {
                reportDate: dates.currentTuesday,
                previousTuesday: dates.previousTuesday,
                currentTuesday: dates.currentTuesday,
                generatedAt: new Date(),
                currencies: Object.keys(reportByCurrency),
                data: reportByCurrency
            };

            console.log('[CashPositionService] Report generated successfully for currencies:', result.currencies);

            return result;
        } catch (error) {
            console.error('[CashPositionService] Error generating cash position:', error);
            throw error;
        }
    }
}

export default CashPositionService;
