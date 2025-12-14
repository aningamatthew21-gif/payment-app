import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Edit,
  Trash2,
  Download,
  Upload,
  Save,
  AlertCircle,
  CheckCircle,
  Info,
  Percent
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy
} from 'firebase/firestore';
import { exportValidationData, importValidationData } from '../services/ExcelService.js';
import { VendorService } from '../services/VendorService.js';
import { BankService } from '../services/BankService';
import { cleanupOldBanksFromValidation } from '../utils/BankMigrationUtils';

const VALIDATION_FIELDS = {
  paymentModes: {
    label: 'Payment Modes',
    description: 'Available payment methods (e.g., BANK TRANSFER, MOMO TRANSFER)',
    icon: '💳',
    field: 'paymentModes',
    hasRate: false
  },
  procurementTypes: {
    label: 'Procurement Types',
    description: 'Types of procurement with WHT rates (e.g., GOODS, SERVICES, FLAT RATE)',
    icon: '📦',
    field: 'procurementTypes',
    hasRate: true,
    rateLabel: 'WHT Rate (%)',
    rateDescription: 'Withholding Tax rate for this procurement type'
  },
  taxTypes: {
    label: 'Tax Types',
    description: 'Tax classification types with levy rates (e.g., STANDARD, FLAT RATE, EXEMPTED)',
    icon: '💰',
    field: 'taxTypes',
    hasRate: true,
    rateLabel: 'Levy Rate (%)',
    rateDescription: 'Levy rate for this tax type'
  },
  banks: {
    label: 'Banks',
    description: 'Available banking institutions',
    icon: '🏦',
    field: 'banks',
    hasRate: false
  },
  currencies: {
    label: 'Currencies',
    description: 'Supported currency codes (e.g., GHS, USD, EUR)',
    icon: '💱',
    field: 'currencies',
    hasRate: false
  },
  budgetLines: {
    label: 'Budget Lines',
    description: 'Budget line names from Budget Management system (auto-synced)',
    icon: '📊',
    field: 'budgetLines',
    hasRate: false
  },
  vendors: {
    label: 'Vendors',
    description: 'Vendor names and identifiers',
    icon: '🏢',
    field: 'vendors',
    hasRate: false
  },
  signatories: {
    label: 'Signatories',
    description: 'Authorized signatories for approvals',
    icon: '✍️',
    field: 'signatories',
    hasRate: false
  },
  departments: {
    label: 'Departments',
    description: 'Company departments',
    icon: '🏢',
    field: 'departments',
    hasRate: false
  },
  paymentPriorities: {
    label: 'Payment Priorities',
    description: 'Priority levels for payments',
    icon: '🚨',
    field: 'paymentPriorities',
    hasRate: false
  }
};

const ValidationManager = ({ db, userId, appId, onClose }) => {
  // State for validation data
  const [validationData, setValidationData] = useState({
    paymentModes: [],
    procurementTypes: [],
    taxTypes: [],
    banks: [],
    currencies: [],
    budgetLines: [],
    vendors: [],
    signatories: [],
    paymentPriorities: []
  });

  const [companySettings, setCompanySettings] = useState({
    companyName: '',
    companyTIN: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    currency: 'GHS'
  });

  const [globalRates, setGlobalRates] = useState({
    vatRate: 15,
    nhilRate: 2.5,
    getFundRate: 2.5,
    covidRate: 1,
    momoRate: 1
  });

  // State for import/export
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState(null);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState(null);

  // UI State
  const [activeFieldManager, setActiveFieldManager] = useState(null);
  const [addValue, setAddValue] = useState('');
  const [addRate, setAddRate] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editRate, setEditRate] = useState('');

  // Load budget line names from budget management system
  const loadValidationData = async () => {
    try {
      console.log('Loading validation data from Firestore...');
      const validationRef = collection(db, `artifacts/${appId}/public/data/validation`);
      const querySnapshot = await getDocs(validationRef);

      console.log('Firestore query result:', querySnapshot.docs.length, 'documents');

      const data = {
        paymentModes: [],
        procurementTypes: [],
        taxTypes: [],
        banks: [],
        currencies: [],
        budgetLines: [],
        vendors: [],
        signatories: [],
        departments: [],
        paymentPriorities: []
      };

      // Load regular validation data
      querySnapshot.forEach(doc => {
        const item = doc.data();
        if (data.hasOwnProperty(item.field)) {
          data[item.field].push({
            id: doc.id,
            value: item.value,
            description: item.description || '',
            rate: item.rate || 0,
            isActive: item.isActive !== false
          });
        }
      });

      // Load budget line names from budget management system
      try {
        console.log('Loading budget lines from budget management...');
        const budgetRef = collection(db, `artifacts/${appId}/public/data/budgetLines`);
        const budgetQuerySnapshot = await getDocs(budgetRef);

        console.log('Budget lines found:', budgetQuerySnapshot.docs.length);

        budgetQuerySnapshot.forEach(doc => {
          const budgetLine = doc.data();
          if (budgetLine.name) {
            data.budgetLines.push({
              id: doc.id,
              value: budgetLine.name,
              description: `${budgetLine.accountNo} - ${budgetLine.deptCode} - ${budgetLine.deptDimension}`,
              rate: 0,
              isActive: true,
              budgetLineId: doc.id,
              accountNo: budgetLine.accountNo,
              deptCode: budgetLine.deptCode,
              deptDimension: budgetLine.deptDimension
            });
          }
        });
      } catch (budgetError) {
        console.error('Error loading budget lines:', budgetError);
      }

      // Load vendors from VendorService
      try {
        console.log('Loading vendors from VendorService...');
        const vendors = await VendorService.getAllVendors(db, appId);
        data.vendors = vendors.map(v => ({
          id: v.id,
          value: v.name,
          description: v.banking?.bankName ? `${v.banking.bankName} - ${v.banking.accountNumber}` : '',
          isActive: v.status === 'active'
        }));
      } catch (vendorError) {
        console.error('Error loading vendors:', vendorError);
      }

      // Load banks from BankService
      try {
        console.log('Loading banks from BankService...');

        // First, clean up any old bank entries from validation collection
        // This is a one-time migration step that's safe to run multiple times
        try {
          const cleanupResult = await cleanupOldBanksFromValidation(db, appId);
          if (cleanupResult.success && cleanupResult.deletedCount > 0) {
            console.log(`[ValidationManager] ${cleanupResult.message}`);
          }
        } catch (cleanupError) {
          console.warn('[ValidationManager] Cleanup of old banks failed (non-critical):', cleanupError);
        }

        // Now load banks from Bank Management
        const banks = await BankService.getAllBanks(db, appId);
        data.banks = banks.map(b => ({
          id: b.id,
          value: b.name,
          description: `${b.accountNumber} - ${b.currency}`,
          isActive: b.status !== 'inactive'
        }));
      } catch (bankError) {
        console.error('Error loading banks:', bankError);
      }

      console.log('Processed validation data:', data);
      setValidationData(data);

      // Load Company Settings
      try {
        const settingsRef = doc(db, `artifacts/${appId}/public/data/settings/company`);
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setCompanySettings(settingsSnap.data());
        } else {
          // Set defaults if not found
          setCompanySettings({
            companyName: 'My Company Ltd',
            companyTIN: 'C000000000',
            companyAddress: 'Accra, Ghana',
            companyPhone: '+233 00 000 0000',
            companyEmail: 'info@mycompany.com',
            currency: 'GHS'
          });
        }
      } catch (err) {
        console.error('Error loading company settings:', err);
      }

      // Load Global Rates
      try {
        const ratesRef = doc(db, `artifacts/${appId}/public/data/settings/rates`);
        const ratesSnap = await getDoc(ratesRef);
        if (ratesSnap.exists()) {
          setGlobalRates(ratesSnap.data());
        } else {
          // Set defaults if not found
          setGlobalRates({
            vatRate: 15,
            nhilRate: 2.5,
            getFundRate: 2.5,
            covidRate: 1,
            momoRate: 1
          });
        }
      } catch (err) {
        console.error('Error loading global rates:', err);
      }

    } catch (error) {
      console.error('Error loading validation data:', error);
    }
  };

  const handleSaveCompanySettings = async (e) => {
    e.preventDefault();
    try {
      const settingsRef = doc(db, `artifacts/${appId}/public/data/settings/company`);
      await setDoc(settingsRef, companySettings);
      alert('Company settings saved successfully!');
      closeFieldManager();
    } catch (err) {
      console.error('Error saving company settings:', err);
      alert('Failed to save company settings.');
    }
  };

  const handleSaveGlobalRates = async (e) => {
    e.preventDefault();
    try {
      const ratesRef = doc(db, `artifacts/${appId}/public/data/settings/rates`);
      // Ensure numbers are stored as numbers
      const numericRates = Object.keys(globalRates).reduce((acc, key) => {
        acc[key] = parseFloat(globalRates[key]);
        return acc;
      }, {});

      await setDoc(ratesRef, numericRates);
      setGlobalRates(numericRates);
      alert('Global rates saved successfully!');
      closeFieldManager();
    } catch (err) {
      console.error('Error saving global rates:', err);
      alert('Failed to save global rates.');
    }
  };

  // Initialize sample data if no validation data exists
  const initializeSampleData = async () => {
    try {
      const validationRef = collection(db, `artifacts/${appId}/public/data/validation`);
      const querySnapshot = await getDocs(validationRef);

      // Only initialize if no data exists
      if (querySnapshot.docs.length === 0) {
        console.log('No validation data found, initializing with sample data...');

        const sampleData = [
          // Procurement Types with WHT rates
          { field: 'procurementTypes', value: 'GOODS', rate: 3.0, description: 'Physical goods and materials' },
          { field: 'procurementTypes', value: 'SERVICES', rate: 5.0, description: 'Professional services and consulting' },
          { field: 'procurementTypes', value: 'FLAT RATE', rate: 4.0, description: 'Standard flat rate procurement' },

          // Tax Types with Levy rates
          { field: 'taxTypes', value: 'STANDARD', rate: 6.0, description: 'Standard tax classification' },
          { field: 'taxTypes', value: 'FLAT RATE', rate: 4.0, description: 'Flat rate tax classification' },
          { field: 'taxTypes', value: 'ST+TOURISM', rate: 7.0, description: 'Special tourism tax rate' },
          { field: 'taxTypes', value: 'ST+CST', rate: 11.0, description: 'Special CST tax rate' },
          { field: 'taxTypes', value: 'EXEMPTED', rate: 0.0, description: 'Tax exempt classification' },

          // Payment Modes
          { field: 'paymentModes', value: 'BANK TRANSFER', rate: 0, description: 'Electronic bank transfer' },
          { field: 'paymentModes', value: 'MOMO TRANSFER', rate: 0, description: 'Mobile money transfer' },
          { field: 'paymentModes', value: 'CASH', rate: 0, description: 'Cash payment' },

          // Banks
          { field: 'banks', value: 'GCB Bank', rate: 0, description: 'Ghana Commercial Bank' },
          { field: 'banks', value: 'Fidelity Bank', rate: 0, description: 'Fidelity Bank Ghana' },
          { field: 'banks', value: 'Zenith Bank', rate: 0, description: 'Zenith Bank Ghana' },

          // Currencies
          { field: 'currencies', value: 'GHS', rate: 0, description: 'Ghanaian Cedi' },
          { field: 'currencies', value: 'USD', rate: 0, description: 'US Dollar' },
          { field: 'currencies', value: 'EUR', rate: 0, description: 'Euro' },

          // Vendors
          { field: 'vendors', value: 'Sample Vendor 1', rate: 0, description: 'Example vendor for testing' },
          { field: 'vendors', value: 'Sample Vendor 2', rate: 0, description: 'Another example vendor' }
        ];

        // Add sample data to Firestore
        const addPromises = sampleData.map(item =>
          addDoc(validationRef, {
            ...item,
            isActive: true,
            createdAt: new Date(),
            createdBy: userId
          })
        );

        await Promise.all(addPromises);
        console.log('Sample validation data initialized successfully');

        // Reload the data
        await loadValidationData();
      }
    } catch (error) {
      console.error('Error initializing sample data:', error);
    }
  };

  // Load data on mount
  useEffect(() => {
    if (db && appId) {
      loadValidationData();
    }
  }, [db, appId]);

  // Open field manager for a specific field
  const openFieldManager = (fieldKey) => {
    setActiveFieldManager(fieldKey);
    setAddValue('');
    setAddRate('');
    setEditingItem(null);
    setEditValue('');
    setEditRate('');
  };

  // Close field manager
  const closeFieldManager = () => {
    setActiveFieldManager(null);
    setAddValue('');
    setAddRate('');
    setEditingItem(null);
    setEditValue('');
    setEditRate('');
  };

  // Handle adding new validation item
  const handleAddItem = async () => {
    if (!addValue.trim() || !activeFieldManager) return;

    try {
      const fieldInfo = VALIDATION_FIELDS[activeFieldManager];
      const rate = fieldInfo.hasRate ? parseFloat(addRate) || 0 : 0;

      console.log('Adding new validation item:', {
        field: activeFieldManager,
        value: addValue.trim(),
        rate: rate
      });

      const validationRef = collection(db, `artifacts/${appId}/public/data/validation`);

      const newItem = {
        field: activeFieldManager,
        value: addValue.trim(),
        description: '',
        rate: rate,
        isActive: true,
        createdAt: new Date(),
        createdBy: userId
      };

      console.log('New item data:', newItem);
      const docRef = await addDoc(validationRef, newItem);
      console.log('Item added successfully with ID:', docRef.id);

      setAddValue('');
      setAddRate('');

      // Reload data immediately
      await loadValidationData();
    } catch (error) {
      console.error('Error adding validation item:', error);
    }
  };

  // Handle editing validation item
  const handleEditItem = async () => {
    if (!editValue.trim() || !editingItem) return;

    try {
      const fieldInfo = VALIDATION_FIELDS[activeFieldManager];
      const rate = fieldInfo.hasRate ? parseFloat(editRate) || 0 : 0;

      const validationRef = doc(db, `artifacts/${appId}/public/data/validation`, editingItem.id);
      await updateDoc(validationRef, {
        value: editValue.trim(),
        rate: rate,
        updatedAt: new Date(),
        updatedBy: userId
      });

      setEditingItem(null);
      setEditValue('');
      setEditRate('');
      await loadValidationData();
    } catch (error) {
      console.error('Error updating validation item:', error);
    }
  };

  // Handle deleting validation item
  const handleDeleteItem = async (itemId) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const validationRef = doc(db, `artifacts/${appId}/public/data/validation`, itemId);
      await deleteDoc(validationRef);
      await loadValidationData();
    } catch (error) {
      console.error('Error deleting validation item:', error);
    }
  };

  // Handle export
  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportValidationData(validationData);
      setImportStatus({ type: 'success', message: 'Validation data exported successfully!' });
    } catch (error) {
      setImportStatus({ type: 'error', message: `Export failed: ${error.message}` });
    } finally {
      setIsExporting(false);
    }
  };

  // Handle import
  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const importedData = await importValidationData(file);
      setImportPreviewData(importedData);
      setShowImportPreview(true);
    } catch (error) {
      setImportStatus({ type: 'error', message: `Import failed: ${error.message}` });
    } finally {
      setIsImporting(false);
    }
  };

  // Handle import confirmation
  const handleConfirmImport = async () => {
    if (!importPreviewData) return;

    try {
      const validationRef = collection(db, `artifacts/${appId}/public/data/validation`);

      // Clear existing data
      const existingDocs = await getDocs(validationRef);
      const deletePromises = existingDocs.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // Add new data
      const addPromises = Object.entries(importPreviewData).flatMap(([field, values]) =>
        values.map(value => addDoc(validationRef, {
          field,
          value: value.value || value,
          description: value.description || '',
          rate: value.rate || 0, // Include rate in import
          isActive: value.isActive !== false,
          createdAt: new Date(),
          createdBy: userId
        }))
      );

      await Promise.all(addPromises);

      setImportStatus({ type: 'success', message: 'Validation data imported successfully!' });
      setShowImportPreview(false);
      setImportPreviewData(null);

      // Reload the data immediately
      await loadValidationData();

      console.log('Import completed. New validation data:', importPreviewData);
    } catch (error) {
      console.error('Error during import confirmation:', error);
      setImportStatus({ type: 'error', message: `Import failed: ${error.message}` });
    }
  };

  // Handle import cancellation
  const handleCancelImport = () => {
    setShowImportPreview(false);
    setImportPreviewData(null);
    setImportStatus(null);
  };

  // Clear status after delay
  useEffect(() => {
    if (importStatus) {
      const timer = setTimeout(() => setImportStatus(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [importStatus]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white p-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Validation Data Manager</h1>
            <p className="text-blue-100 mt-1">Manage dropdown options and validation data for payment fields</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-blue-200 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Import/Export Controls */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <Download size={16} />
                <span>{isExporting ? 'Exporting...' : 'Export Data'}</span>
              </button>

              <label className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer transition-colors">
                <Upload size={16} />
                <span>{isImporting ? 'Importing...' : 'Import Data'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Status Messages */}
          {importStatus && (
            <div className={`mt-4 p-3 rounded-md flex items-center space-x-2 ${importStatus.type === 'success'
              ? 'bg-green-100 text-green-800 border border-green-200'
              : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
              {importStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
              <span>{importStatus.message}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Object.entries(VALIDATION_FIELDS).map(([fieldKey, fieldInfo]) => (
              <button
                key={fieldKey}
                onClick={() => openFieldManager(fieldKey)}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all text-left w-full"
              >
                <div className="flex items-center space-x-2 mb-4">
                  <span className="text-2xl">{fieldInfo.icon}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{fieldInfo.label}</h3>
                    <p className="text-sm text-gray-600">{fieldInfo.description}</p>
                    {fieldInfo.hasRate && (
                      <div className="flex items-center space-x-1 mt-1">
                        <Percent size={12} className="text-blue-600" />
                        <span className="text-xs text-blue-600 font-medium">Includes rates</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 mb-1">
                    {validationData[fieldKey]?.length || 0}
                  </div>
                  <div className="text-sm text-gray-500">
                    {validationData[fieldKey]?.length === 1 ? 'item' : 'items'} defined
                  </div>
                </div>
              </button>
            ))}

            {/* Company Settings Button */}
            <button
              onClick={() => openFieldManager('companySettings')}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-purple-300 hover:shadow-md transition-all text-left w-full"
            >
              <div className="flex items-center space-x-2 mb-4">
                <span className="text-2xl">🏢</span>
                <div>
                  <h3 className="font-semibold text-gray-900">Company Settings</h3>
                  <p className="text-sm text-gray-600">Manage company details and global configuration</p>
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600 mb-1">⚙️</div>
                <div className="text-sm text-gray-500">Global Settings</div>
              </div>
            </button>

            {/* Global Rates Button */}
            <button
              onClick={() => openFieldManager('globalRates')}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-green-300 hover:shadow-md transition-all text-left w-full"
            >
              <div className="flex items-center space-x-2 mb-4">
                <span className="text-2xl">💹</span>
                <div>
                  <h3 className="font-semibold text-gray-900">Global Rates</h3>
                  <p className="text-sm text-gray-600">Manage standard VAT, Momo charges, and other global rates</p>
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 mb-1">%</div>
                <div className="text-sm text-gray-500">Rate Configuration</div>
              </div>
            </button>
          </div>
        </div>

        {/* Individual Field Manager Modal */}
        {activeFieldManager && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
            <div className="bg-white rounded-lg p-6 w-[700px] max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <span className="text-3xl">
                    {activeFieldManager === 'companySettings' ? '🏢' :
                      activeFieldManager === 'globalRates' ? '💹' :
                        VALIDATION_FIELDS[activeFieldManager]?.icon}
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {activeFieldManager === 'companySettings' ? 'Company Settings' :
                        activeFieldManager === 'globalRates' ? 'Global Rates' :
                          `${VALIDATION_FIELDS[activeFieldManager]?.label} Manager`}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {activeFieldManager === 'companySettings' ? 'Manage company details' :
                        activeFieldManager === 'globalRates' ? 'Manage global tax rates' :
                          VALIDATION_FIELDS[activeFieldManager]?.description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeFieldManager}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Add New Item Section */}
              {activeFieldManager === 'budgetLines' ? (
                <div className="bg-blue-50 p-4 rounded-lg mb-6 border border-blue-200">
                  <div className="flex items-center space-x-2 mb-3">
                    <Info size={20} className="text-blue-600" />
                    <h4 className="font-medium text-blue-900">Budget Lines from Budget Management</h4>
                  </div>
                  <p className="text-sm text-blue-700 mb-3">
                    Budget lines are automatically loaded from your Budget Management system.
                    To add or modify budget lines, please use the Budget Management page.
                  </p>
                  <button
                    onClick={() => {
                      // Close the validation manager first
                      onClose();
                      // Navigate to budget management using the navigation function
                      // We'll need to pass this from the parent component
                      if (window.location.hash === '#budgetManagement') {
                        window.location.reload();
                      } else {
                        window.location.hash = '#budgetManagement';
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Go to Budget Management
                  </button>
                </div>
              ) : activeFieldManager === 'vendors' ? (
                <div className="bg-cyan-50 p-4 rounded-lg mb-6 border border-cyan-200">
                  <div className="flex items-center space-x-2 mb-3">
                    <Info size={20} className="text-cyan-600" />
                    <h4 className="font-medium text-cyan-900">Vendors Managed in Vendor Management</h4>
                  </div>
                  <p className="text-sm text-cyan-700 mb-3">
                    Vendors are now managed in the dedicated Vendor Management module.
                    To add or modify vendors, please use the Vendor Management page.
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      if (window.location.hash === '#vendorManagement') {
                        window.location.reload();
                      } else {
                        window.location.hash = '#vendorManagement';
                      }
                    }}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-700 transition-colors"
                  >
                    Go to Vendor Management
                  </button>
                </div>
              ) : activeFieldManager === 'banks' ? (
                <div className="bg-emerald-50 p-4 rounded-lg mb-6 border border-emerald-200">
                  <div className="flex items-center space-x-2 mb-3">
                    <Info size={20} className="text-emerald-600" />
                    <h4 className="font-medium text-emerald-900">Banks Managed in Bank Management</h4>
                  </div>
                  <p className="text-sm text-emerald-700 mb-3">
                    Banks are now managed in the dedicated Bank Management module.
                    To add or modify bank accounts, please use the Bank Management page.
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      if (window.location.hash === '#bankManagement') {
                        window.location.reload();
                      } else {
                        window.location.hash = '#bankManagement';
                      }
                    }}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
                  >
                    Go to Bank Management
                  </button>
                </div>
              ) : activeFieldManager === 'companySettings' ? (
                <div className="bg-gray-50 p-6 rounded-lg mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                      <input
                        type="text"
                        value={companySettings.companyName}
                        onChange={(e) => setCompanySettings({ ...companySettings, companyName: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tax Identification Number (TIN)</label>
                      <input
                        type="text"
                        value={companySettings.companyTIN}
                        onChange={(e) => setCompanySettings({ ...companySettings, companyTIN: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <input
                        type="text"
                        value={companySettings.companyAddress}
                        onChange={(e) => setCompanySettings({ ...companySettings, companyAddress: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input
                        type="text"
                        value={companySettings.companyPhone}
                        onChange={(e) => setCompanySettings({ ...companySettings, companyPhone: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={companySettings.companyEmail}
                        onChange={(e) => setCompanySettings({ ...companySettings, companyEmail: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Default Currency</label>
                      <select
                        value={companySettings.currency}
                        onChange={(e) => setCompanySettings({ ...companySettings, currency: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      >
                        <option value="GHS">GHS (Ghana Cedi)</option>
                        <option value="USD">USD (US Dollar)</option>
                        <option value="EUR">EUR (Euro)</option>
                        <option value="GBP">GBP (British Pound)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveCompanySettings}
                      className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      <Save size={16} />
                      <span>Save Company Settings</span>
                    </button>
                  </div>
                </div>
              ) : activeFieldManager === 'globalRates' ? (
                <div className="bg-gray-50 p-6 rounded-lg mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Standard VAT Rate (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={globalRates.vatRate}
                          onChange={(e) => setGlobalRates({ ...globalRates, vatRate: e.target.value })}
                          className="w-full p-2 border border-gray-300 rounded-md pr-8"
                        />
                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">NHIL Rate (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={globalRates.nhilRate}
                          onChange={(e) => setGlobalRates({ ...globalRates, nhilRate: e.target.value })}
                          className="w-full p-2 border border-gray-300 rounded-md pr-8"
                        />
                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">GetFund Rate (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={globalRates.getFundRate}
                          onChange={(e) => setGlobalRates({ ...globalRates, getFundRate: e.target.value })}
                          className="w-full p-2 border border-gray-300 rounded-md pr-8"
                        />
                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">COVID-19 Levy Rate (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={globalRates.covidRate}
                          onChange={(e) => setGlobalRates({ ...globalRates, covidRate: e.target.value })}
                          className="w-full p-2 border border-gray-300 rounded-md pr-8"
                        />
                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">MoMo Charge Rate (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={globalRates.momoRate}
                          onChange={(e) => setGlobalRates({ ...globalRates, momoRate: e.target.value })}
                          className="w-full p-2 border border-gray-300 rounded-md pr-8"
                        />
                        <span className="absolute right-2 top-2 text-gray-500">%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveGlobalRates}
                      className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                    >
                      <Save size={16} />
                      <span>Save Global Rates</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h4 className="font-medium text-gray-900 mb-3">Add New {VALIDATION_FIELDS[activeFieldManager]?.label.slice(0, -1)}</h4>

                  {VALIDATION_FIELDS[activeFieldManager]?.hasRate ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {VALIDATION_FIELDS[activeFieldManager]?.label.slice(0, -1)} Name
                        </label>
                        <input
                          type="text"
                          value={addValue}
                          onChange={(e) => setAddValue(e.target.value)}
                          placeholder={`Enter ${VALIDATION_FIELDS[activeFieldManager]?.label.toLowerCase().slice(0, -1)} name`}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {VALIDATION_FIELDS[activeFieldManager]?.rateLabel}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={addRate}
                            onChange={(e) => setAddRate(e.target.value)}
                            placeholder="0.00"
                            className="w-full p-2 border border-gray-300 rounded-md pr-8"
                          />
                          <span className="absolute right-2 top-2 text-gray-500">%</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {VALIDATION_FIELDS[activeFieldManager]?.rateDescription}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="text"
                        value={addValue}
                        onChange={(e) => setAddValue(e.target.value)}
                        placeholder={`Enter ${VALIDATION_FIELDS[activeFieldManager]?.label.toLowerCase().slice(0, -1)} name`}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  )}

                  <div className="mt-3">
                    <button
                      onClick={handleAddItem}
                      disabled={!addValue.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <Plus size={16} className="mr-1" />
                      Add
                    </button>
                  </div>
                </div>
              )}

              {/* Existing Items List */}
              <div>
                <h4 className="font-medium text-gray-900 mb-3">
                  Existing {VALIDATION_FIELDS[activeFieldManager]?.label} ({validationData[activeFieldManager]?.length || 0})
                </h4>

                {validationData[activeFieldManager]?.length > 0 ? (
                  <div className="space-y-2">
                    {validationData[activeFieldManager].map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <span className="font-medium text-gray-900">{item.value}</span>
                            {VALIDATION_FIELDS[activeFieldManager]?.hasRate && (
                              <span className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded flex items-center space-x-1">
                                <Percent size={12} />
                                <span>{item.rate || 0}%</span>
                              </span>
                            )}
                          </div>
                          {activeFieldManager === 'budgetLines' && item.description && (
                            <div className="text-sm text-gray-500 mt-1">
                              {item.description}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {activeFieldManager === 'budgetLines' ? (
                            <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                              Auto-loaded
                            </div>
                          ) : activeFieldManager === 'vendors' ? (
                            <div className="text-xs text-cyan-600 bg-cyan-50 px-2 py-1 rounded">
                              Managed Externally
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => {
                                  setEditingItem(item);
                                  setEditValue(item.value);
                                  setEditRate(item.rate || '');
                                }}
                                className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                              >
                                <Edit size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <div className="text-4xl mb-2">📝</div>
                    <p>No {VALIDATION_FIELDS[activeFieldManager]?.label.toLowerCase()} defined yet</p>
                    <p className="text-sm">Use the form above to add your first item</p>
                  </div>
                )}
              </div>

              {/* Edit Modal (Inline) */}
              {editingItem && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-70">
                  <div className="bg-white rounded-lg p-6 w-[500px]">
                    <h4 className="text-lg font-semibold mb-4">Edit {VALIDATION_FIELDS[activeFieldManager]?.label.slice(0, -1)}</h4>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>

                    {VALIDATION_FIELDS[activeFieldManager]?.hasRate && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {VALIDATION_FIELDS[activeFieldManager]?.rateLabel}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={editRate}
                            onChange={(e) => setEditRate(e.target.value)}
                            placeholder="0.00"
                            className="w-full p-2 border border-gray-300 rounded-md pr-8"
                          />
                          <span className="absolute right-2 top-2 text-gray-500">%</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {VALIDATION_FIELDS[activeFieldManager]?.rateDescription}
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => {
                          setEditingItem(null);
                          setEditValue('');
                          setEditRate('');
                        }}
                        className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleEditItem}
                        disabled={!editValue.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Import Preview Modal */}
        {showImportPreview && importPreviewData && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
            <div className="bg-white rounded-lg p-6 w-[800px] max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Import Preview</h3>
              <p className="text-sm text-gray-600 mb-4">
                Review the data before importing. This will replace all existing validation data.
              </p>

              <div className="space-y-4">
                {Object.entries(importPreviewData).map(([field, values]) => (
                  <div key={field} className="border border-gray-200 rounded p-3">
                    <h4 className="font-medium text-gray-900 mb-2">
                      {VALIDATION_FIELDS[field]?.label || field} ({values.length} items)
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {values.map((value, index) => (
                        <div key={index} className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          {typeof value === 'string' ? value : value.value}
                          {VALIDATION_FIELDS[field]?.hasRate && value.rate && (
                            <span className="text-blue-600 ml-1">({value.rate}%)</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-2 mt-6">
                <button
                  onClick={handleCancelImport}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmImport}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  Confirm Import
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ValidationManager;
