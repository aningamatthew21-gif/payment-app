import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs, addDoc, writeBatch, updateDoc } from 'firebase/firestore';
import { ArrowLeft, LogOut, CreditCard, RefreshCw, Plus, FileText, Edit, Trash2, Save, X, FileSpreadsheet } from 'lucide-react';
import Layout from '../components/Layout/Layout';
import VendorDiscoveryService from '../services/VendorDiscoveryService';
import ExcelImportExport from '../components/ExcelImportExport';
import FlexibleVendorInput from '../components/FlexibleVendorInput';
import DocumentGenerator from '../components/DocumentGenerator';
// PaymentStaging has been relocated to PaymentGenerator (Dual-Mode SS/BF)
import EnhancedUndoPanel from '../components/EnhancedUndoPanel';
import { safeToFixed } from '../utils/formatters';
import { useSettings } from '../contexts/SettingsContext';
import { calculateTotalTaxes } from '../services/FinancialEngine';
import { VendorService } from '../services/VendorService';
import { BankService } from '../services/BankService';

const WeeklyPaymentsDetail = ({ db, userId, appId, onNavigate, onBack, onLogout, sheetName }) => {
    console.log('=== WeeklyPaymentsDetail RENDER ===');
    console.log('Received sheetName prop:', sheetName);
    console.log('Type of sheetName:', typeof sheetName);
    console.log('sheetName truthy check:', !!sheetName);

    const { globalRates } = useSettings();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingPayment, setEditingPayment] = useState(null);
    const [showDocumentGenerator, setShowDocumentGenerator] = useState(false);
    const [showUndoPanel, setShowUndoPanel] = useState(false);
    // showPaymentStaging state removed - Batch Finalize now in PaymentGenerator
    const [showExcelModal, setShowExcelModal] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'partial' | 'paid'

    // Vendor discovery service instance for this component
    const vendorDiscoveryService = useMemo(() => {
        if (db && appId) {
            return new VendorDiscoveryService(db, appId);
        }
        return null;
    }, [db, appId]);

    // Calculate row numbers for payments (stable index based on full list)
    const paymentsWithRow = useMemo(() => {
        return payments.map((p, index) => ({
            ...p,
            originalSheetRow: index + 1
        }));
    }, [payments]);

    // Form state for adding/editing
    const [formData, setFormData] = useState({
        date: '', paymentMode: '', invoiceNumber: '', vendors: '', descriptions: '', procurement: '',
        taxType: '', vat: '', budgetLines: '', currency: '', fxRate: '', amount: '', serviceCharge: '', momoCharge: '',
        department: '', paymentPriority: ''
    });

    // State for validation data (dropdown options)
    const [validationData, setValidationData] = useState({
        paymentModes: [],
        vendors: [],
        procurementTypes: [],
        taxTypes: [],
        banks: [],

        currencies: [],
        budgetLines: [],
        departments: [],
        paymentPriorities: []
    });

    // Fetch payments for the selected sheet
    useEffect(() => {
        if (!db || !userId) return;
        setLoading(true);
        const paymentsCollection = collection(db, `artifacts/${appId}/public/data/weeklySheets/${sheetName}/payments`);
        const unsubscribe = onSnapshot(paymentsCollection, (snapshot) => {
            const paymentsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            console.log('=== PAYMENTS DATA RECEIVED ===');
            console.log('Total payments:', paymentsData.length);
            paymentsData.forEach((payment, index) => {
                console.log(`Payment ${index + 1}:`, {
                    id: payment.id,
                    vendor: payment.vendor,
                    description: payment.description,
                    fullPretax: payment.fullPretax,
                    amount: payment.amount,
                    budgetLine: payment.budgetLine,
                    budgetLines: payment.budgetLines,
                    procurementType: payment.procurementType,
                    procurement: payment.procurement,
                    vatDecision: payment.vatDecision,
                    vat: payment.vat
                });
            });
            console.log('================================');
            setPayments(paymentsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, appId, sheetName]);

    // Load validation data function - moved outside useEffect for accessibility
    const loadValidationData = async () => {
        if (!db || !userId) return;

        try {
            console.log('Loading validation data for WeeklyPaymentsDetail...');
            const validationRef = collection(db, `artifacts/${appId}/public/data/validation`);
            const querySnapshot = await getDocs(validationRef);

            const data = {
                paymentModes: [],
                vendors: [],
                procurementTypes: [],
                taxTypes: [],
                banks: [],

                currencies: [],
                budgetLines: [],
                departments: [],
                paymentPriorities: []
            };

            // Load regular validation data
            querySnapshot.forEach(doc => {
                const item = doc.data();
                console.log('Loading validation item:', item);
                if (data[item.field]) {
                    data[item.field].push({
                        id: doc.id,
                        value: item.value,
                        description: item.description || '',
                        rate: item.rate || 0, // Include the rate field
                        isActive: item.isActive !== false
                    });
                    console.log(`Added to ${item.field}: ${item.value} with rate: ${item.rate || 0}`);
                }
            });

            // Load enhanced budget line data from Budget Management system
            try {
                console.log('Loading enhanced budget lines for WeeklyPaymentsDetail...');
                const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
                const budgetQuerySnapshot = await getDocs(budgetRef);

                console.log('Budget lines found for WeeklyPaymentsDetail:', budgetQuerySnapshot.docs.length);

                // Extract unique departments from budget lines
                const uniqueDepts = new Set();

                budgetQuerySnapshot.forEach(doc => {
                    const budgetLine = doc.data();
                    if (budgetLine.name) {
                        // Build display string with only available fields
                        let displayParts = [budgetLine.name];
                        if (budgetLine.accountNo) displayParts.push(budgetLine.accountNo);
                        if (budgetLine.deptCode) displayParts.push(budgetLine.deptCode);
                        if (budgetLine.deptDimension) displayParts.push(budgetLine.deptDimension);

                        const displayValue = displayParts.join(' - ');

                        data.budgetLines.push({
                            id: doc.id,
                            value: displayValue, // Full formatted display for dropdown
                            name: budgetLine.name, // Original name for data storage
                            description: '', // Clear description, info is now in value
                            isActive: true,
                            budgetLineId: doc.id,
                            accountNo: budgetLine.accountNo || '',
                            deptCode: budgetLine.deptCode || '',
                            deptDimension: budgetLine.deptDimension || ''
                        });

                        // Collect unique deptDimension values for departments
                        if (budgetLine.deptDimension) {
                            uniqueDepts.add(budgetLine.deptDimension);
                        }

                        console.log(`Added enhanced budget line: ${displayValue}`);
                    }
                });

                // Populate departments from unique deptDimension values (single source of truth)
                data.departments = Array.from(uniqueDepts).sort().map((dept, index) => ({
                    id: `dept_${index}`,
                    value: dept,
                    description: 'From Budget Management',
                    isActive: true,
                    autoLoaded: true
                }));

                console.log('Departments extracted from budget lines:', data.departments.length);
            } catch (budgetError) {
                console.error('Error loading enhanced budget lines for WeeklyPaymentsDetail:', budgetError);
            }

            // CORE WHT INTEGRATION: Load enhanced procurement types with WHT rates
            try {
                console.log('Loading enhanced procurement types for WeeklyPaymentsDetail...');
                const { ProcurementTypesService } = await import('../services/ProcurementTypesService.js');
                const procurementTypes = await ProcurementTypesService.getProcurementTypes(db, appId);

                if (procurementTypes && procurementTypes.length > 0) {
                    console.log(`Found ${procurementTypes.length} enhanced procurement types`);

                    // Replace existing procurement types with enhanced ones
                    data.procurementTypes = procurementTypes.map(pt => ({
                        id: pt.id,
                        value: pt.name,
                        description: pt.description || `WHT Rate: ${pt.whtRate}%`,
                        rate: pt.whtRate,
                        isActive: true,
                        procurementTypeId: pt.id,
                        whtRate: pt.whtRate
                    }));

                    console.log('Enhanced procurement types loaded with WHT rates:', data.procurementTypes);
                } else {
                    console.log('No enhanced procurement types found, using existing ones');
                }
            } catch (whtError) {
                console.warn('Error loading enhanced procurement types, using existing ones:', whtError);
            }

            // VENDOR MANAGEMENT INTEGRATION: Load vendors from VendorService (single source of truth)
            try {
                console.log('Loading vendors from Vendor Management for WeeklyPaymentsDetail...');
                const managedVendors = await VendorService.getAllVendors(db, appId);

                // Always use VendorService as the single source of truth (even if empty)
                data.vendors = (managedVendors || []).map(v => ({
                    id: v.id,
                    value: v.name,
                    description: v.email || '',
                    isActive: v.status === 'active',
                    vendorId: v.id,
                    banking: v.banking || null
                }));

                console.log('Vendors loaded from Vendor Management:', data.vendors.length);
            } catch (vendorError) {
                console.warn('Error loading vendors from Vendor Management:', vendorError);
                // On error, keep empty array - don't fall back to validation collection
                data.vendors = [];
            }

            // BANK MANAGEMENT INTEGRATION: Load banks from BankService (single source of truth)
            try {
                console.log('Loading banks from Bank Management for WeeklyPaymentsDetail...');
                const managedBanks = await BankService.getAllBanks(db, appId);

                if (managedBanks && managedBanks.length > 0) {
                    console.log(`Found ${managedBanks.length} banks from Bank Management`);

                    // Replace validation collection banks with Bank Management banks
                    data.banks = managedBanks.map(b => ({
                        id: b.id,
                        value: b.name,
                        description: `${b.accountNumber} - ${b.currency}`,
                        isActive: b.status !== 'inactive'
                    }));

                    console.log('Banks loaded from Bank Management:', data.banks.length);
                } else {
                    console.log('No banks found in Bank Management, existing validation banks will be used');
                }
            } catch (bankError) {
                console.warn('Error loading banks from Bank Management, using validation collection:', bankError);
            }

            console.log('Enhanced validation data loaded for WeeklyPaymentsDetail:', data);
            setValidationData(data);
        } catch (error) {
            console.error('Error loading validation data:', error);
        }
    };

    // Load validation data from Firestore
    useEffect(() => {
        if (!db || !userId) return;
        loadValidationData();
    }, [db, userId, appId]);

    // Vendor management functions for WeeklyPaymentsDetail
    const handleNewVendor = async (vendorName) => {
        if (!vendorDiscoveryService || !vendorName?.trim()) return;

        try {
            console.log('[WeeklyPaymentsDetail] Adding new vendor:', vendorName);

            // Add the new vendor to the validation database
            const result = await vendorDiscoveryService.autoAddVendors([vendorName.trim()]);

            if (result.success) {
                console.log('[WeeklyPaymentsDetail] New vendor added successfully:', result);

                // Reload validation data to include the new vendor
                await loadValidationData();

                // Show success message
                alert(`Vendor "${vendorName}" has been added to the system successfully!`);
            } else {
                console.error('[WeeklyPaymentsDetail] Failed to add new vendor:', result);
                alert(`Failed to add vendor "${vendorName}". Please try again.`);
            }
        } catch (error) {
            console.error('[WeeklyPaymentsDetail] Error adding new vendor:', error);
            alert(`Error adding vendor "${vendorName}": ${error.message}`);
        }
    };

    const handleVendorChange = (newVendorName) => {
        // Update the form data with the new vendor name
        setFormData(prev => ({
            ...prev,
            vendors: newVendorName
        }));
    };

    const handleUndoTransaction = () => {
        // PERMANENTLY INTEGRATED WHT SYSTEM
        console.log('[App] WHT system permanently integrated, opening undo panel with WHT cleanup');
        setShowUndoPanel(true);
    };

    const handleUndoComplete = () => {
        setShowUndoPanel(false);
        // Refresh the payments data to reflect the undone transaction
        if (db && userId && sheetName) {
            // The onSnapshot listener should automatically update the payments
            console.log('Undo completed, payments should refresh automatically');
        }
    };

    const handleOpenPaymentGenerator = () => {
        onNavigate('paymentGenerator', { payments: payments, sheetName: sheetName });
    };

    // Enhanced Excel import with vendor discovery for WeeklyPaymentsDetail
    const handleExcelImportComplete = async (importedPayments) => {
        if (!importedPayments || !db || !userId || !vendorDiscoveryService) {
            console.error('[WeeklyPaymentsDetail] Missing required data for Excel import');
            return { success: false, error: 'Missing required data for import' };
        }

        try {
            console.log('[WeeklyPaymentsDetail] Starting enhanced Excel import with vendor discovery...');

            // Step 1: Discover new vendors from imported data
            const discoveryResult = await vendorDiscoveryService.discoverNewVendors(
                importedPayments,
                validationData.vendors
            );

            console.log('[WeeklyPaymentsDetail] Vendor discovery result:', discoveryResult);

            // Step 2: Auto-add new vendors if any were discovered
            if (discoveryResult.newVendors.length > 0) {
                console.log('[WeeklyPaymentsDetail] Auto-adding new vendors:', discoveryResult.newVendors);

                const addResult = await vendorDiscoveryService.autoAddVendors(discoveryResult.newVendors);

                if (addResult.success) {
                    console.log('[WeeklyPaymentsDetail] New vendors added successfully:', addResult);

                    // Reload validation data to include new vendors
                    await loadValidationData();

                    // Show success message for new vendors
                    if (addResult.addedVendors.length > 0) {
                        const vendorNames = addResult.addedVendors.map(v => v.name).join(', ');
                        alert(`New vendors discovered and added: ${vendorNames}`);
                    }
                } else {
                    console.warn('[WeeklyPaymentsDetail] Some vendors failed to be added:', addResult.errors);
                }
            }

            // Step 3: Save imported payments to the current weekly sheet
            const paymentsCollectionRef = collection(db, `artifacts/${appId}/public/data/weeklySheets/${sheetName}/payments`);
            const batch = writeBatch(db);

            let successCount = 0;
            importedPayments.forEach(payment => {
                if (payment.status !== 'error') {
                    const docRef = doc(paymentsCollectionRef);
                    batch.set(docRef, payment);
                    successCount++;
                }
            });

            console.log(`Committing batch with ${successCount} payments...`);
            await batch.commit();

            console.log('Import completed successfully, payments should appear automatically via onSnapshot');

            return {
                success: true,
                message: `Successfully imported ${successCount} payments`
            };

        } catch (error) {
            console.error("Error importing payments:", error);
            return { success: false, error: error.message };
        }
    };

    const handleExcelExportComplete = (exportResult) => {
        console.log('Export completed:', exportResult);
        // Could add toast notification here if needed
    };



    // --- Helper functions for partial payment display ---
    const calculateRemainingBalance = (payment) => {
        const total = Number(payment.total_amount || payment.fullPretax || payment.amount || 0);
        const paid = Number(payment.paid_amount || 0);
        return Math.max(0, total - paid);
    };

    const calculatePaidPercentage = (payment) => {
        const total = Number(payment.total_amount || payment.fullPretax || payment.amount || 0);
        if (total === 0) return 0;
        const paid = Number(payment.paid_amount || 0);
        return Math.min(100, (paid / total) * 100);
    };

    const calculateRemainingPercentage = (payment) => {
        return 100 - calculatePaidPercentage(payment);
    };

    const getPaymentStatus = (payment) => {
        // Priority 1: Use explicit payment_status if set
        if (payment.payment_status) {
            return payment.payment_status.toLowerCase();
        }
        // Priority 2: Check isPartialPayment flag (set by PaymentGenerator)
        if (payment.isPartialPayment && payment.paymentPercentage && payment.paymentPercentage < 100) {
            // Check if it's been finalized but still has remaining balance
            const total = Number(payment.total_amount || payment.fullPretax || payment.amount || 0);
            const paid = Number(payment.paid_amount || 0);
            if (paid > 0 && paid < total) {
                return 'partial';
            }
        }
        // Priority 3: Legacy boolean 'paid' field
        if (payment.paid === true) {
            return 'paid';
        }
        return 'pending';
    };

    // Filter payments based on status
    const filteredPayments = useMemo(() => {
        if (statusFilter === 'all') return payments;
        return payments.filter(p => getPaymentStatus(p) === statusFilter);
    }, [payments, statusFilter]);

    // --- Enhanced status badge with percentage ---
    const getStatusBadge = (payment) => {
        const status = getPaymentStatus(payment);
        const paidPercent = calculatePaidPercentage(payment);
        const remainingBalance = calculateRemainingBalance(payment);

        // Determine styles based on status
        const styles = {
            paid: 'bg-green-100 text-green-800 border-green-200',
            partial: 'bg-yellow-100 text-yellow-800 border-yellow-200',
            pending: 'bg-gray-100 text-gray-800 border-gray-200',
            finalized: 'bg-blue-100 text-blue-800 border-blue-200'
        };

        const currentStyle = styles[status] || styles.pending;

        if (status === 'partial') {
            return (
                <div className="flex flex-col items-center">
                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full border ${currentStyle}`}>
                        PARTIAL {paidPercent.toFixed(0)}%
                    </span>
                    <span className="text-xs text-orange-600 mt-1">
                        Remaining: {safeToFixed(remainingBalance)}
                    </span>
                </div>
            );
        }

        return (
            <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full border ${currentStyle}`}>
                {status.toUpperCase()}
            </span>
        );
    };

    const handleEditClick = (payment) => {
        setEditingPayment(payment.id);
        // Map payment fields to form field names
        setFormData({
            date: payment.date || new Date().toISOString().slice(0, 10),
            paymentMode: payment.paymentMode || '',
            invoiceNumber: payment.invoiceNo || '',
            vendors: payment.vendor || '',
            descriptions: payment.description || '',
            procurement: payment.procurementType || '',
            taxType: payment.taxType || '',
            vat: payment.vatDecision || 'NO',
            budgetLines: payment.budgetLine || '',
            currency: payment.currency || 'GHS',
            fxRate: payment.fxRate || '1',
            bank: payment.bank || '',
            amount: payment.fullPretax || payment.amount || '',
            serviceCharge: payment.serviceChargeAmount || '',
            momoCharge: payment.momoCharge || '',
            department: payment.department || '',
            paymentPriority: payment.paymentPriority || '',
            // FIX: Load WHT Rate for display (convert 0.03 to 3)
            whtRate: payment.whtRate ? payment.whtRate * 100 : ''
        });
    };

    const handleAddClick = () => {
        setEditingPayment('new');
        setFormData({
            date: new Date().toISOString().slice(0, 10),
            paymentMode: '',
            invoiceNumber: '',
            vendors: '',
            descriptions: '',
            procurement: '',
            taxType: '',
            vat: 'NO',
            budgetLines: '',
            currency: 'GHS',
            fxRate: '1',
            bank: '',
            amount: '',
            serviceCharge: '',
            momoCharge: '',
            department: '',
            paymentPriority: ''
        });
    };

    const handleSave = async () => {
        console.log('handleSave called with formData:', formData);
        console.log('db available:', !!db);
        console.log('userId available:', !!userId);

        if (!db || !userId) {
            console.error('Missing db or userId');
            return;
        }

        // CRITICAL: Check if sheetName is available
        if (!sheetName) {
            console.error('CRITICAL ERROR: sheetName is undefined!');
            console.log('Current sheetName:', sheetName);
            alert('No weekly sheet selected. Please select a sheet first.');
            return;
        }

        // Validate required fields
        if (!formData.vendors || !formData.amount || !formData.budgetLines) {
            console.error('Missing required fields:', { vendors: !!formData.vendors, amount: !!formData.amount, budgetLines: !!formData.budgetLines });
            alert('Please fill in all required fields: Vendors, Amount, and Budget Line');
            return;
        }

        if (parseFloat(formData.amount) <= 0) {
            console.error('Invalid amount:', formData.amount);
            alert('Amount must be greater than 0');
            return;
        }

        try {
            // Prepare payment data with proper structure
            console.log('=== DATA TRANSFORMATION DEBUG ===');
            console.log('Original formData:', formData);

            const paymentData = {
                date: formData.date || new Date().toISOString().slice(0, 10),
                paymentMode: formData.paymentMode || 'BANK TRANSFER',
                invoiceNo: formData.invoiceNumber || '',
                vendor: formData.vendors || '',
                description: formData.descriptions || '',
                procurementType: formData.procurement || 'SERVICES',
                taxType: formData.taxType || 'STANDARD',
                vatDecision: formData.vat || 'NO',
                budgetLine: formData.budgetLines || '',
                currency: formData.currency || 'GHS',
                fxRate: parseFloat(formData.fxRate) || 1,
                bank: formData.bank || '',
                fullPretax: parseFloat(formData.amount) || 0,
                serviceChargeAmount: parseFloat(formData.serviceCharge) || 0,
                momoCharge: parseFloat(formData.momoCharge) || 0,
                department: formData.department || '',
                paymentPriority: formData.paymentPriority || '',
                status: 'pending',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            console.log('Transformed paymentData:', paymentData);
            console.log('Field mapping check:');
            console.log('  vendors → vendor:', formData.vendors, '→', paymentData.vendor);
            console.log('  descriptions → description:', formData.descriptions, '→', paymentData.description);
            console.log('  procurement → procurementType:', formData.procurement, '→', paymentData.procurementType);
            console.log('  vat → vatDecision:', formData.vat, '→', paymentData.vatDecision);
            console.log('  budgetLines → budgetLine:', formData.budgetLines, '→', paymentData.budgetLine);
            console.log('  amount → fullPretax:', formData.amount, '→', paymentData.fullPretax);
            console.log('================================');

            if (editingPayment === 'new') {
                // Add new payment
                console.log('Adding new payment to collection:', `artifacts/${appId}/public/data/weeklySheets/${sheetName}/payments`);
                console.log('Payment data:', paymentData);
                const docRef = await addDoc(collection(db, `artifacts/${appId}/public/data/weeklySheets/${sheetName}/payments`), paymentData);
                console.log('New payment added with ID:', docRef.id);
            } else {
                // Update existing payment
                console.log('Updating existing payment:', editingPayment);
                const docRef = doc(db, `artifacts/${appId}/public/data/weeklySheets/${sheetName}/payments`, editingPayment);
                await setDoc(docRef, { ...paymentData, updatedAt: new Date().toISOString() });
                console.log('Payment updated successfully');
            }

            setEditingPayment(null);
            setFormData({});

            // Refresh the payments list by triggering a re-render
            // The useEffect will automatically refresh the payments

        } catch (e) {
            console.error("Error saving document: ", e);
            alert(`Failed to save transaction: ${e.message}`);
        }
    };

    const handleCancelEdit = () => {
        setEditingPayment(null);
        setFormData({});
    };

    const handleDelete = async (id) => {
        if (window.confirm("Are you sure you want to delete this transaction?")) {
            if (!db || !userId) return;
            try {
                await deleteDoc(doc(db, `artifacts/${appId}/public/data/weeklySheets/${sheetName}/payments`, id));
                // Refresh is handled by snapshot listener
            } catch (e) {
                console.error("Error deleting document: ", e);
                alert("Failed to delete transaction.");
            }
        }
    };

    const handleChange = async (e) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const newData = { ...prev, [name]: value };

            // Auto-calculate taxes when relevant fields change
            // NOTE: WHT calculation removed - handled by PaymentGenerator system only
            if (['amount', 'taxType', 'vat', 'paymentMode', 'currency', 'procurement'].includes(name)) {
                const transaction = {
                    fullPretax: parseFloat(name === 'amount' ? value : newData.amount) || 0,
                    procurementType: name === 'procurement' ? value : newData.procurement,
                    taxType: name === 'taxType' ? value : newData.taxType,
                    vatDecision: name === 'vat' ? value : newData.vat,
                    paymentMode: name === 'paymentMode' ? value : newData.paymentMode,
                    currency: name === 'currency' ? value : newData.currency,
                    fxRate: parseFloat(newData.fxRate) || 1
                };

                // Use FinancialEngine to calculate taxes with dynamic rates
                // WHT will be calculated by PaymentGenerator when payments are processed
                const calculation = calculateTotalTaxes(transaction, globalRates);

                // Update derived fields
                // NOTE: WHT/NetPayable calculations removed - handled exclusively by PaymentGenerator
                newData.momoCharge = calculation.momoCharge;
            }

            console.log('Updated formData:', newData);
            return newData;
        });
    };

    const vatOptions = ['YES', 'NO', 'EXEMPT'];

    if (loading) {
        return <div className="p-4 text-center">Loading payments for {sheetName}...</div>;
    }

    return (
        <Layout
            title={`Payments for ${sheetName}`}
            userId={userId}
            onBack={onBack}
            onLogout={onLogout}
        >
            {!sheetName ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center">
                        <div className="text-red-800">
                            <strong>Error:</strong> No weekly sheet selected. Please go back and select a sheet first.
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white p-6 rounded-xl shadow-md space-y-4">
                    <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
                        <button
                            onClick={handleOpenPaymentGenerator}
                            className="flex-1 p-3 bg-blue-500 text-white font-semibold rounded-md flex items-center justify-center space-x-2 hover:bg-blue-600 transition-colors"
                        >
                            <CreditCard size={20} />
                            <span>Open in Payment Generator</span>
                        </button>
                        <button
                            onClick={handleUndoTransaction}
                            className="flex-1 p-3 bg-yellow-500 text-white font-semibold rounded-md flex items-center justify-center space-x-2 hover:bg-yellow-600 transition-colors"
                        >
                            <RefreshCw size={20} />
                            <span>Undo Transaction</span>
                        </button>
                        <button
                            onClick={handleAddClick}
                            className="flex-1 p-3 bg-green-500 text-white font-semibold rounded-md flex items-center justify-center space-x-2 hover:bg-green-600 transition-colors"
                        >
                            <Plus size={20} />
                            <span>Add Transaction</span>
                        </button>
                        {/* Batch Finalize button removed - now accessed via Payment Generator's BF mode toggle */}
                        <button
                            onClick={() => setShowExcelModal(true)}
                            className="flex-1 p-3 bg-indigo-500 text-white font-semibold rounded-md flex items-center justify-center space-x-2 hover:bg-indigo-600 transition-colors"
                        >
                            <FileSpreadsheet size={20} />
                            <span>Excel Import/Export</span>
                        </button>
                    </div>

                    {editingPayment && (
                        <div className="bg-gray-100 p-6 rounded-xl shadow-inner space-y-4">
                            <h3 className="text-lg font-bold">{editingPayment === 'new' ? 'Add New Transaction' : 'Edit Transaction'}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Vendor */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                                    <FlexibleVendorInput
                                        value={formData.vendors || ''}
                                        onChange={handleVendorChange}
                                        onNewVendor={handleNewVendor}
                                        options={validationData.vendors}
                                        placeholder="Select or type vendor name..."
                                        className="p-2 w-full"
                                        allowNew={true}
                                        validationService={vendorDiscoveryService}
                                    />
                                </div>

                                {/* Invoice Number */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                                    <input type="text" name="invoiceNumber" placeholder="Invoice #" value={formData.invoiceNumber || ''} onChange={handleChange} className="p-2 border rounded-md w-full" />
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                    <input type="text" name="descriptions" placeholder="Description" value={formData.descriptions || ''} onChange={handleChange} className="p-2 border rounded-md w-full" />
                                </div>

                                {/* Amount */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                                    <input type="number" name="amount" placeholder="Amount" value={formData.amount || ''} onChange={handleChange} className="p-2 border rounded-md w-full" />
                                </div>

                                {/* Service Charge */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Charge</label>
                                    <input
                                        type="number"
                                        name="serviceCharge"
                                        placeholder="Service Charge"
                                        value={formData.serviceCharge || ''}
                                        onChange={handleChange}
                                        className="p-2 border rounded-md w-full bg-yellow-50 border-yellow-200"
                                        title="Enter amount to calculate WHT on (if different from Total Amount)"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Leave empty if WHT applies to Total</p>
                                </div>

                                {/* Payment Mode */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                                    <select name="paymentMode" value={formData.paymentMode || ''} onChange={handleChange} className="p-2 border rounded-md w-full">
                                        <option value="">Select Payment Mode</option>
                                        {validationData.paymentModes.length > 0 ? (
                                            validationData.paymentModes.map((modeOption, index) => (
                                                <option key={modeOption.id || index} value={modeOption.value}>
                                                    {modeOption.value}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="" disabled>No payment modes available</option>
                                        )}
                                    </select>
                                </div>

                                {/* Procurement Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Procurement Type</label>
                                    <select name="procurement" value={formData.procurement || ''} onChange={handleChange} className="p-2 border rounded-md w-full">
                                        <option value="">Select Procurement</option>
                                        {validationData.procurementTypes.length > 0 ? (
                                            validationData.procurementTypes.map((typeOption, index) => (
                                                <option key={typeOption.id || index} value={typeOption.value}>
                                                    {typeOption.value}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="" disabled>No procurement types available</option>
                                        )}
                                    </select>
                                </div>

                                {/* Tax Type */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tax Type</label>
                                    <select name="taxType" value={formData.taxType || ''} onChange={handleChange} className="p-2 border rounded-md w-full">
                                        <option value="">Select Tax Type</option>
                                        {validationData.taxTypes.length > 0 ? (
                                            validationData.taxTypes.map((typeOption, index) => (
                                                <option key={typeOption.id || index} value={typeOption.value}>
                                                    {typeOption.value}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="" disabled>No tax types available</option>
                                        )}
                                    </select>
                                </div>

                                {/* VAT Status */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">VAT Status</label>
                                    <select name="vat" value={formData.vat || ''} onChange={handleChange} className="p-2 border rounded-md w-full">
                                        <option value="">Select VAT Status</option>
                                        {vatOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>

                                {/* Budget Line */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Budget Line</label>
                                    <select name="budgetLines" value={formData.budgetLines || ''} onChange={handleChange} className="p-2 border rounded-md w-full">
                                        <option value="">Select Budget Line</option>
                                        {validationData.budgetLines.length > 0 ? (
                                            validationData.budgetLines.map((budgetLineOption, index) => (
                                                <option key={budgetLineOption.id || index} value={budgetLineOption.name || budgetLineOption.value}>
                                                    {budgetLineOption.value}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="" disabled>No budget lines available</option>
                                        )}
                                    </select>
                                </div>

                                {/* Currency */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                                    <select name="currency" value={formData.currency || ''} onChange={handleChange} className="p-2 border rounded-md w-full">
                                        <option value="">Select Currency</option>
                                        {validationData.currencies.length > 0 ? (
                                            validationData.currencies.map((currencyOption, index) => (
                                                <option key={currencyOption.id || index} value={currencyOption.value}>
                                                    {currencyOption.value}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="GHS">GHS</option>
                                        )}
                                    </select>
                                </div>

                                {/* FX Rate */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">FX Rate</label>
                                    <input type="number" name="fxRate" placeholder="FX Rate" value={formData.fxRate || ''} onChange={handleChange} className="p-2 border rounded-md w-full" />
                                </div>

                                {/* Bank */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
                                    <select name="bank" value={formData.bank || ''} onChange={handleChange} className="p-2 border rounded-md w-full">
                                        <option value="">Select Bank</option>
                                        {validationData.banks.length > 0 ? (
                                            validationData.banks.map((bankOption, index) => (
                                                <option key={bankOption.id || index} value={bankOption.value}>
                                                    {bankOption.value}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="" disabled>No banks available</option>
                                        )}
                                    </select>
                                </div>

                                {/* Momo Charge % */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Momo Charge %</label>
                                    <input type="text" name="momoCharge" placeholder="Momo Charge %" value={formData.momoCharge || ''} onChange={handleChange} className="p-2 border rounded-md w-full" />
                                </div>

                                {/* Department */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                                    <select name="department" value={formData.department || ''} onChange={handleChange} className="p-2 border rounded-md w-full">
                                        <option value="">Select Department</option>
                                        {validationData.departments.length > 0 ? (
                                            validationData.departments.map((opt, index) => (
                                                <option key={opt.id || index} value={opt.value}>{opt.value}</option>
                                            ))
                                        ) : (
                                            <option value="" disabled>No departments available</option>
                                        )}
                                    </select>
                                </div>

                                {/* Payment Priority */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Priority</label>
                                    <select name="paymentPriority" value={formData.paymentPriority || ''} onChange={handleChange} className="p-2 border rounded-md w-full">
                                        <option value="">Select Priority</option>
                                        {validationData.paymentPriorities.length > 0 ? (
                                            validationData.paymentPriorities.map((opt, index) => (
                                                <option key={opt.id || index} value={opt.value}>{opt.value}</option>
                                            ))
                                        ) : (
                                            <option value="" disabled>No priorities available</option>
                                        )}
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end space-x-2">
                                <button onClick={handleSave} className="p-2 bg-green-500 text-white rounded-md flex items-center space-x-2">
                                    <Save size={16} /><span>Save</span>
                                </button>
                                <button onClick={handleCancelEdit} className="p-2 bg-gray-500 text-white rounded-md flex items-center space-x-2">
                                    <X size={16} /><span>Cancel</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Payments List Header with Filter */}
                    <div className="flex justify-between items-center pt-4 mb-2">
                        <h3 className="text-xl font-bold">Payments List</h3>
                        <div className="flex items-center space-x-4">
                            {/* Status Filter */}
                            <div className="flex items-center space-x-2">
                                <label className="text-sm font-medium text-gray-600">Filter:</label>
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="p-2 border rounded-md text-sm bg-white"
                                >
                                    <option value="all">All Payments ({payments.length})</option>
                                    <option value="pending">Pending ({payments.filter(p => getPaymentStatus(p) === 'pending').length})</option>
                                    <option value="partial">Partial ({payments.filter(p => getPaymentStatus(p) === 'partial').length})</option>
                                    <option value="paid">Paid ({payments.filter(p => getPaymentStatus(p) === 'paid').length})</option>
                                </select>
                            </div>
                            {/* Count badges */}
                            <div className="flex space-x-2 text-xs">
                                <span className="px-2 py-1 bg-gray-100 rounded">Total: {payments.length}</span>
                                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
                                    Partial: {payments.filter(p => getPaymentStatus(p) === 'partial').length}
                                </span>
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
                                    Paid: {payments.filter(p => getPaymentStatus(p) === 'paid').length}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-300 rounded-md overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-200">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Mode</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendors</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descriptions</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Procurement</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tax Type</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VAT</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Budget Lines</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">FX Rate</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bank</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service Charge</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WHT Rate</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WHT Amount</th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Momo Charge %</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredPayments.map((payment, index) => {
                                        // Calculate the original index in the full list (1-based)
                                        const originalIndex = payments.findIndex(p => p.id === payment.id) + 1;
                                        return (
                                            <tr key={payment.id || index} className={`hover:bg-gray-50 ${getPaymentStatus(payment) === 'paid' ? 'bg-green-50' : getPaymentStatus(payment) === 'partial' ? 'bg-yellow-50' : ''}`}>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    <div className="flex space-x-2">
                                                        <button
                                                            onClick={() => handleEditClick(payment)}
                                                            className="text-indigo-600 hover:text-indigo-900"
                                                            disabled={getPaymentStatus(payment) === 'paid'}
                                                        >
                                                            <Edit size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(payment.id)}
                                                            className="text-red-600 hover:text-red-900"
                                                            disabled={getPaymentStatus(payment) === 'paid'}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                                {/* Show the original row number */}
                                                <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {originalIndex}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.date}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.paymentMode}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.invoiceNo}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.vendor}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.description}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.procurementType}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.taxType}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.vatDecision}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.budgetLine}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.currency}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.fxRate}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.bank}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                                    {payment.serviceChargeAmount > 0 ? (
                                                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                                                            {safeToFixed(payment.serviceChargeAmount)}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    {payment.whtRate ? `${(Number(payment.whtRate) * 100).toFixed(1).replace(/\.0$/, '')}%` : '-'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                    {payment.whtAmount ? safeToFixed(payment.whtAmount) : '-'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">{safeToFixed(payment.fullPretax)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.momoCharge}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.department}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm">{payment.paymentPriority}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                    {getStatusBadge(payment)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <button
                        onClick={onBack}
                        className="mt-4 p-3 bg-gray-500 text-white font-semibold rounded-md hover:bg-gray-600 transition-colors"
                    >
                        <ArrowLeft size={16} className="inline mr-2" /> Back to Weekly Payments
                    </button>
                </div>
            )}

            {/* Document Generator Modal */}
            {
                showDocumentGenerator && (
                    <DocumentGenerator
                        isOpen={showDocumentGenerator}
                        onClose={() => setShowDocumentGenerator(false)}
                        sheetName={sheetName}
                        payments={payments}
                        validationData={validationData}
                    />
                )
            }

            {/* Enhanced Undo Panel */}
            {
                showUndoPanel && (
                    <EnhancedUndoPanel
                        db={db}
                        userId={userId}
                        appId={appId}
                        onUndoComplete={handleUndoComplete}
                        weeklySheetFilter={sheetName}
                    />
                )
            }

            {/* PaymentStaging Modal removed - now integrated into PaymentGenerator's Batch Finalize (BF) mode */}

            {/* Excel Import/Export Modal */}
            {showExcelModal && (
                <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative">
                        <button
                            onClick={() => setShowExcelModal(false)}
                            className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 z-10"
                        >
                            <X size={24} />
                        </button>
                        <div className="p-2">
                            <ExcelImportExport
                                sheetName={sheetName}
                                existingPayments={payments}
                                onImportComplete={handleExcelImportComplete}
                                onExportComplete={handleExcelExportComplete}
                                db={db}
                                userId={userId}
                                validationData={validationData}
                            />
                        </div>
                    </div>
                </div>
            )}
        </Layout >
    );
};

export default WeeklyPaymentsDetail;
