/**
 * Bank Service
 * Implements ledger-based bank account management
 * Ensures all balance changes are atomic and recorded in an immutable ledger
 */

import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    runTransaction,
    query,
    orderBy,
    where,
    serverTimestamp
} from 'firebase/firestore';

export class BankService {

    /**
     * Get all active banks
     * @param {Object} db - Firestore database instance
     * @param {string} appId - Application ID
     * @returns {Promise<Array>} Array of bank objects
     */
    static async getAllBanks(db, appId) {
        try {
            console.log('[BankService] Fetching all banks...');
            const banksRef = collection(db, `artifacts/${appId}/public/data/banks`);
            const snapshot = await getDocs(banksRef);

            const banks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            console.log(`[BankService] Fetched ${banks.length} banks`);
            return banks;
        } catch (error) {
            console.error('[BankService] Error fetching banks:', error);
            return [];
        }
    }

    /**
     * Get a single bank by ID
     * @param {Object} db - Firestore database instance
     * @param {string} appId - Application ID
     * @param {string} bankId - Bank ID
     * @returns {Promise<Object|null>} Bank object or null
     */
    static async getBankById(db, appId, bankId) {
        try {
            const bankRef = doc(db, `artifacts/${appId}/public/data/banks`, bankId);
            const bankDoc = await getDoc(bankRef);

            if (bankDoc.exists()) {
                return { id: bankDoc.id, ...bankDoc.data() };
            }
            return null;
        } catch (error) {
            console.error('[BankService] Error fetching bank:', error);
            return null;
        }
    }

    /**
     * Get ledger history for a specific bank
     * @param {Object} db - Firestore database instance
     * @param {string} appId - Application ID
     * @param {string} bankId - Bank ID to filter ledger entries
     * @returns {Promise<Array>} Array of ledger entries
     */
    static async getBankLedger(db, appId, bankId = null) {
        try {
            console.log(`[BankService] Fetching ledger for bank: ${bankId || 'all'}`);
            const ledgerRef = collection(db, `artifacts/${appId}/public/data/bankLedger`);

            let q;
            if (bankId) {
                // Query with filter and order
                q = query(
                    ledgerRef,
                    where('bankId', '==', bankId),
                    orderBy('timestamp', 'desc')
                );
            } else {
                // Query all, ordered by timestamp
                q = query(ledgerRef, orderBy('timestamp', 'desc'));
            }

            const snapshot = await getDocs(q);
            const ledger = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            console.log(`[BankService] Fetched ${ledger.length} ledger entries`);
            return ledger;
        } catch (error) {
            console.error('[BankService] Error fetching ledger:', error);

            // Fallback: if composite index doesn't exist, fetch all and filter client-side
            if (error.code === 'failed-precondition' || error.message?.includes('index')) {
                console.warn('[BankService] Composite index not found, using client-side filter');
                try {
                    const ledgerRef = collection(db, `artifacts/${appId}/public/data/bankLedger`);
                    const snapshot = await getDocs(ledgerRef);
                    let ledger = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    // Client-side filter
                    if (bankId) {
                        ledger = ledger.filter(entry => entry.bankId === bankId);
                    }

                    // Client-side sort
                    ledger.sort((a, b) => {
                        const dateA = new Date(a.timestamp || 0);
                        const dateB = new Date(b.timestamp || 0);
                        return dateB - dateA; // Descending
                    });

                    return ledger;
                } catch (fallbackError) {
                    console.error('[BankService] Fallback fetch failed:', fallbackError);
                    return [];
                }
            }

            return [];
        }
    }

    /**
     * Process a manual transaction (Inflow or Outflow)
     * Uses Firestore transactions to ensure atomicity
     * @param {Object} db - Firestore database instance
     * @param {string} appId - Application ID
     * @param {Object} transactionData - Transaction details
     * @returns {Promise<Object>} Result with success status and new balance
     */
    static async processManualTransaction(db, appId, transactionData) {
        const {
            bankId,
            type, // 'INFLOW' or 'OUTFLOW'
            amount,
            category,
            description,
            reference,
            date,
            userId
        } = transactionData;

        try {
            console.log(`[BankService] Processing ${type} transaction:`, {
                bankId,
                amount,
                category
            });

            // Use Firestore transaction for atomicity
            const result = await runTransaction(db, async (transaction) => {
                // 1. Read current bank state
                const bankRef = doc(db, `artifacts/${appId}/public/data/banks`, bankId);
                const bankDoc = await transaction.get(bankRef);

                if (!bankDoc.exists()) {
                    throw new Error(`Bank account not found: ${bankId}`);
                }

                const bankData = bankDoc.data();
                const currentBalance = Number(bankData.balance || 0);
                const parsedAmount = Number(amount);

                if (isNaN(parsedAmount) || parsedAmount <= 0) {
                    throw new Error('Invalid transaction amount');
                }

                // 2. Calculate new balance
                let newBalance = currentBalance;
                let impactAmount = 0;

                if (type === 'INFLOW') {
                    newBalance += parsedAmount;
                    impactAmount = parsedAmount; // Positive
                } else if (type === 'OUTFLOW') {
                    // Optional: Check for sufficient funds
                    if (currentBalance < parsedAmount) {
                        console.warn(`[BankService] Insufficient funds: ${currentBalance} < ${parsedAmount}`);
                        // You can throw an error here to prevent overdrafts
                        // throw new Error('Insufficient funds for this outflow');
                    }
                    newBalance -= parsedAmount;
                    impactAmount = -parsedAmount; // Negative
                } else {
                    throw new Error(`Invalid transaction type: ${type}`);
                }

                // 3. Update bank balance
                transaction.update(bankRef, {
                    balance: newBalance,
                    lastUpdated: serverTimestamp()
                });

                // 4. Create immutable ledger entry
                const ledgerRef = doc(collection(db, `artifacts/${appId}/public/data/bankLedger`));
                transaction.set(ledgerRef, {
                    bankId,
                    bankName: bankData.name,
                    type,
                    amount: impactAmount, // Store with sign (+/-)
                    category: category || 'Uncategorized',
                    description: description || '',
                    reference: reference || '',
                    timestamp: serverTimestamp(), // Use Firestore server timestamp
                    date: date || new Date().toISOString(), // Keep ISO string for searching
                    balanceAfter: newBalance,
                    balanceBefore: currentBalance,
                    createdAt: serverTimestamp(),
                    source: 'MANUAL_ENTRY',
                    userId: userId || 'system',
                    currency: bankData.currency || 'GHS',
                    // Vendor/Source tracking
                    vendor: type === 'OUTFLOW' ? (transactionData.vendor || '') : '',
                    sourceEntity: type === 'INFLOW' ? (transactionData.sourceEntity || category) : ''
                });

                console.log(`[BankService] Transaction completed: ${currentBalance} -> ${newBalance}`);

                return {
                    success: true,
                    newBalance,
                    previousBalance: currentBalance,
                    impactAmount
                };
            });

            return result;

        } catch (error) {
            console.error('[BankService] Transaction failed:', error);
            throw error;
        }
    }

    /**
     * Process a payment finalization (automated deduction)
     * Called by PaymentFinalizationService
     * @param {Object} db - Firestore database instance
     * @param {string} appId - Application ID
     * @param {Object} deductionData - Deduction details
     * @returns {Promise<Object>} Result with success status
     */
    static async processPaymentDeduction(db, appId, deductionData) {
        const {
            bankId,
            bankName,
            amount,
            batchId,
            paymentCount,
            userId,
            metadata = {}
        } = deductionData;

        try {
            console.log(`[BankService] Processing payment deduction for batch: ${batchId}`);

            const result = await runTransaction(db, async (transaction) => {
                // 1. Read current bank state
                const bankRef = doc(db, `artifacts/${appId}/public/data/banks`, bankId);
                const bankDoc = await transaction.get(bankRef);

                if (!bankDoc.exists()) {
                    throw new Error(`Bank account not found: ${bankId}`);
                }

                const bankData = bankDoc.data();
                const currentBalance = Number(bankData.balance || 0);
                const parsedAmount = Number(amount);

                if (isNaN(parsedAmount) || parsedAmount <= 0) {
                    throw new Error('Invalid deduction amount');
                }

                // 2. Check for sufficient funds (optional, can allow overdrafts)
                if (currentBalance < parsedAmount) {
                    console.warn(`[BankService] Insufficient funds: ${currentBalance} < ${parsedAmount}`);
                    // Uncomment to prevent overdrafts:
                    // throw new Error(`Insufficient funds in ${bankData.name}: ${currentBalance} < ${parsedAmount}`);
                }

                const newBalance = currentBalance - parsedAmount;

                // 3. Update bank balance
                transaction.update(bankRef, {
                    balance: newBalance,
                    lastUpdated: serverTimestamp()
                });

                // 4. Create ledger entry with enriched data
                const ledgerRef = doc(collection(db, `artifacts/${appId}/public/data/bankLedger`));
                transaction.set(ledgerRef, {
                    bankId,
                    bankName: bankData.name,
                    type: 'OUTFLOW',
                    amount: -parsedAmount, // Negative for outflow
                    category: 'Payment Batch',
                    description: metadata.description || `Payment batch finalization (${paymentCount} payment${paymentCount > 1 ? 's' : ''})`,
                    reference: batchId,
                    relatedEntityId: batchId, // Link back to the batch
                    timestamp: serverTimestamp(), // Use Firestore server timestamp
                    date: new Date().toISOString(), // Keep ISO string for searching
                    balanceAfter: newBalance,
                    balanceBefore: currentBalance,
                    createdAt: serverTimestamp(),
                    source: 'PAYMENT_FINALIZATION',
                    userId: userId || 'system',
                    currency: bankData.currency || 'GHS',
                    // Payment-specific tracking
                    vendor: metadata.vendors || '', // Comma-separated vendor names
                    paymentCount,
                    metadata
                });

                console.log(`[BankService] Payment deduction completed: ${currentBalance} -> ${newBalance}`);

                return {
                    success: true,
                    newBalance,
                    previousBalance: currentBalance,
                    deductedAmount: parsedAmount
                };
            });

            return result;

        } catch (error) {
            console.error('[BankService] Payment deduction failed:', error);
            throw error;
        }
    }

    /**
     * Get bank balance summary
     * @param {Object} db - Firestore database instance
     * @param {string} appId - Application ID
     * @returns {Promise<Object>} Summary with total balance across all banks
     */
    static async getBankSummary(db, appId) {
        try {
            const banks = await this.getAllBanks(db, appId);

            const totalBalance = banks.reduce((sum, bank) => {
                return sum + Number(bank.balance || 0);
            }, 0);

            const activeBanks = banks.filter(bank => bank.status !== 'inactive').length;

            return {
                totalBalance,
                bankCount: banks.length,
                activeBanks,
                banks
            };
        } catch (error) {
            console.error('[BankService] Error getting summary:', error);
            return {
                totalBalance: 0,
                bankCount: 0,
                activeBanks: 0,
                banks: []
            };
        }
    }
}

export default BankService;
