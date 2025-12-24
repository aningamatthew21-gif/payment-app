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
    deleteDoc,
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
     * Update an existing bank
     * @param {Object} db - Firestore database instance
     * @param {string} appId - Application ID
     * @param {string} bankId - Bank ID to update
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated bank object
     */
    static async updateBank(db, appId, bankId, updates) {
        try {
            console.log('[BankService] Updating bank:', bankId, updates);
            const bankRef = doc(db, `artifacts/${appId}/public/data/banks`, bankId);

            // Don't allow balance updates through this method (use ledger transactions)
            const { balance, ...safeUpdates } = updates;

            await updateDoc(bankRef, {
                ...safeUpdates,
                lastUpdated: serverTimestamp()
            });

            console.log('[BankService] Bank updated successfully:', bankId);
            return { success: true, id: bankId };
        } catch (error) {
            console.error('[BankService] Error updating bank:', error);
            throw error;
        }
    }

    /**
     * Delete a bank account
     * WARNING: This should be used carefully - consider deactivating instead
     * @param {Object} db - Firestore database instance
     * @param {string} appId - Application ID
     * @param {string} bankId - Bank ID to delete
     * @returns {Promise<Object>} Result object
     */
    static async deleteBank(db, appId, bankId) {
        try {
            console.log('[BankService] Deleting bank:', bankId);
            const bankRef = doc(db, `artifacts/${appId}/public/data/banks`, bankId);
            await deleteDoc(bankRef);
            console.log('[BankService] Bank deleted successfully:', bankId);
            return { success: true };
        } catch (error) {
            console.error('[BankService] Error deleting bank:', error);
            throw error;
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
                    // Use cashFlowCategory from metadata if provided, otherwise default
                    category: metadata.cashFlowCategory || 'Other Outflow',
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
                    cashFlowCategory: metadata.cashFlowCategory || 'Other Outflow', // ✅ Explicitly store for reporting
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

    /**
     * Generate Excel Template for bank import
     * @returns {Object} Success/error result
     */
    static generateExcelTemplate() {
        try {
            // Dynamic import XLSX
            import('xlsx').then(XLSX => {
                const workbook = XLSX.utils.book_new();

                const templateData = [
                    ['BANK IMPORT TEMPLATE'],
                    ['Fill in data starting from row 4. Do not modify column headers.'],
                    [],
                    ['Bank Name', 'Account Number', 'Currency', 'Initial Balance', 'Account Type'],
                    ['GT Bank - Operations', '1234567890', 'GHS', '50000', 'Checking'],
                    ['', '', '', '', '']
                ];

                const worksheet = XLSX.utils.aoa_to_sheet(templateData);

                worksheet['!cols'] = [
                    { wch: 30 }, // Bank Name
                    { wch: 18 }, // Account Number
                    { wch: 10 }, // Currency
                    { wch: 15 }, // Initial Balance
                    { wch: 15 }  // Account Type
                ];

                XLSX.utils.book_append_sheet(workbook, worksheet, 'Bank Import');
                XLSX.writeFile(workbook, `Bank_Import_Template_${new Date().toISOString().split('T')[0]}.xlsx`);

                console.log('[BankService] Bank template downloaded successfully');
            });

            return { success: true };
        } catch (error) {
            console.error('[BankService] Error generating template:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Parse Import File for banks
     * @param {File} file - Excel file to parse
     * @returns {Promise<Object>} Parsed banks with validation results
     */
    static async parseImportFile(file) {
        return new Promise((resolve) => {
            import('xlsx').then(XLSX => {
                const reader = new FileReader();

                reader.onload = (e) => {
                    try {
                        const data = new Uint8Array(e.target.result);
                        const workbook = XLSX.read(data, { type: 'array' });

                        const sheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[sheetName];
                        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                        console.log('[BankService] Raw import data:', rawData);

                        // Find header row
                        let headerRowIndex = -1;
                        for (let i = 0; i < Math.min(10, rawData.length); i++) {
                            if (rawData[i] && rawData[i][0] &&
                                rawData[i][0].toString().toLowerCase().includes('bank name')) {
                                headerRowIndex = i;
                                break;
                            }
                        }

                        if (headerRowIndex === -1) {
                            resolve({
                                success: false,
                                error: 'Could not find header row. Make sure "Bank Name" is in the first column.',
                                banks: [],
                                summary: { totalRows: 0, validBanks: 0, errors: ['Header row not found'] }
                            });
                            return;
                        }

                        const banks = [];
                        const errors = [];
                        const validCurrencies = ['GHS', 'USD', 'EUR', 'GBP'];
                        const validTypes = ['Checking', 'Savings', 'Petty Cash', 'Money Market', 'Other'];

                        for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                            const row = rawData[i];

                            if (!row || !row[0] || row[0].toString().trim() === '') {
                                continue;
                            }

                            const bankName = row[0]?.toString().trim() || '';
                            const accountNumber = row[1]?.toString().trim() || '';
                            let currency = row[2]?.toString().trim().toUpperCase() || 'GHS';
                            const initialBalance = parseFloat(row[3]) || 0;
                            let accountType = row[4]?.toString().trim() || 'Checking';

                            // Validate and normalize currency
                            if (!validCurrencies.includes(currency)) {
                                currency = 'GHS';
                            }

                            // Validate and normalize account type
                            if (!validTypes.includes(accountType)) {
                                accountType = 'Checking';
                            }

                            // Validation
                            const rowErrors = [];
                            if (!bankName) rowErrors.push('Bank name is required');
                            if (!accountNumber) rowErrors.push('Account number is required');

                            if (rowErrors.length > 0) {
                                errors.push({
                                    row: i + 1,
                                    bankName: bankName || '(empty)',
                                    errors: rowErrors
                                });
                                continue;
                            }

                            banks.push({
                                name: bankName,
                                accountNumber: accountNumber,
                                currency: currency,
                                balance: initialBalance,
                                bankType: accountType,
                                status: 'active'
                            });
                        }

                        console.log('[BankService] Parsed banks:', banks.length);

                        resolve({
                            success: true,
                            banks: banks,
                            summary: {
                                totalRows: rawData.length - headerRowIndex - 1,
                                validBanks: banks.length,
                                invalidRows: errors.length,
                                errors: errors
                            }
                        });

                    } catch (parseError) {
                        console.error('[BankService] Parse error:', parseError);
                        resolve({
                            success: false,
                            error: `Failed to parse file: ${parseError.message}`,
                            banks: [],
                            summary: { totalRows: 0, validBanks: 0, errors: [parseError.message] }
                        });
                    }
                };

                reader.onerror = () => {
                    resolve({
                        success: false,
                        error: 'Failed to read file',
                        banks: [],
                        summary: { totalRows: 0, validBanks: 0, errors: ['File read error'] }
                    });
                };

                reader.readAsArrayBuffer(file);
            });
        });
    }

    /**
     * Bulk import banks to Firestore
     * @param {Object} db - Firestore database instance
     * @param {string} appId - Application ID
     * @param {Array} banks - Array of bank objects to import
     * @param {string} userId - User ID for audit
     * @returns {Promise<Object>} Import results
     */
    static async importBanks(db, appId, banks, userId = 'system') {
        try {
            console.log(`[BankService] Importing ${banks.length} banks to Firestore...`);

            const banksRef = collection(db, `artifacts/${appId}/public/data/banks`);
            const results = {
                success: true,
                imported: 0,
                failed: 0,
                errors: []
            };

            for (const bank of banks) {
                try {
                    await addDoc(banksRef, {
                        ...bank,
                        createdAt: serverTimestamp(),
                        createdBy: userId,
                        lastUpdated: serverTimestamp(),
                        importedAt: new Date().toISOString()
                    });
                    results.imported++;
                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        bank: bank.name,
                        error: error.message
                    });
                }
            }

            console.log(`[BankService] Import complete: ${results.imported} success, ${results.failed} failed`);
            return results;

        } catch (error) {
            console.error('[BankService] Import error:', error);
            return {
                success: false,
                imported: 0,
                failed: banks.length,
                errors: [{ bank: 'All', error: error.message }]
            };
        }
    }

    /**
     * Export all banks to Excel
     * @param {Object} db - Firestore database instance
     * @param {string} appId - Application ID
     * @returns {Promise<Object>} Export result
     */
    static async exportBanks(db, appId) {
        try {
            const banks = await this.getAllBanks(db, appId);

            if (banks.length === 0) {
                return { success: false, error: 'No banks to export' };
            }

            const XLSX = await import('xlsx');
            const workbook = XLSX.utils.book_new();

            const exportData = [
                ['BANK EXPORT'],
                [`Generated: ${new Date().toLocaleString()}`],
                [],
                ['Bank Name', 'Account Number', 'Currency', 'Current Balance', 'Account Type', 'Status'],
                ...banks.map(b => [
                    b.name || '',
                    b.accountNumber || '',
                    b.currency || 'GHS',
                    b.balance || 0,
                    b.bankType || 'Checking',
                    b.status || 'active'
                ])
            ];

            const worksheet = XLSX.utils.aoa_to_sheet(exportData);

            worksheet['!cols'] = [
                { wch: 30 }, { wch: 18 }, { wch: 10 },
                { wch: 18 }, { wch: 15 }, { wch: 10 }
            ];

            XLSX.utils.book_append_sheet(workbook, worksheet, 'Banks');
            XLSX.writeFile(workbook, `Banks_Export_${new Date().toISOString().split('T')[0]}.xlsx`);

            return { success: true, count: banks.length };
        } catch (error) {
            console.error('[BankService] Export error:', error);
            return { success: false, error: error.message };
        }
    }
}

export default BankService;
