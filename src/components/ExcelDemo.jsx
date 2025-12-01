import React, { useState } from 'react';
import { FileSpreadsheet, Download, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import ExcelImportExport from './ExcelImportExport.jsx';

const ExcelDemo = () => {
  const [demoSheetName] = useState('DEMO-WEEK-1');
  const [demoPayments] = useState([
    {
      id: '1',
      date: '2024-01-15',
      paymentMode: 'BANK TRANSFER',
      invoiceNo: 'INV-001-2024',
      vendor: 'Sample Vendor Ltd',
      description: 'Sample payment for services',
      procurementType: 'SERVICES',
      taxType: 'STANDARD',
      vatDecision: 'YES',
      budgetLine: 'IT Services',
      currency: 'GHS',
      fxRate: '1',
      bank: 'GCB BANK',
      fullPretax: '10000.00',
      momoCharge: '0',
      whtAmount: '500.00',
      levyAmount: '600.00',
      vatAmount: '1590.00',
      subtotal: '12190.00',
      netPayable: '11690.00',
      paymentPercentage: '100',
      amountThisTransaction: '11690.00',
      budgetImpactUSD: '11690.00',
      notes: 'Sample entry for testing'
    },
    {
      id: '2',
      date: '2024-01-16',
      paymentMode: 'MOMO TRANSFER',
      invoiceNo: 'INV-002-2024',
      vendor: 'Another Supplier',
      description: 'Office supplies purchase',
      procurementType: 'GOODS',
      taxType: 'STANDARD',
      vatDecision: 'NO',
      budgetLine: 'Office Supplies',
      currency: 'GHS',
      fxRate: '1',
      bank: 'MOMO',
      fullPretax: '5000.00',
      momoCharge: '50.00',
      whtAmount: '150.00',
      levyAmount: '300.00',
      vatAmount: '0.00',
      subtotal: '5350.00',
      netPayable: '5200.00',
      paymentPercentage: '100',
      amountThisTransaction: '5200.00',
      budgetImpactUSD: '5200.00',
      notes: 'Urgent office supplies'
    }
  ]);

  const handleImportComplete = async (importedPayments) => {
    console.log('Import completed:', importedPayments);
    
    // Simulate database save
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          message: `Successfully imported ${importedPayments.length} payments`
        });
      }, 1000);
    });
  };

  const handleExportComplete = (exportResult) => {
    console.log('Export completed:', exportResult);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                <FileSpreadsheet className="mr-3 text-blue-600" size={32} />
                Excel Import/Export Demo
              </h1>
              <p className="text-gray-600 mt-2">
                Test the comprehensive Excel template functionality for weekly payment sheets
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Demo Sheet</div>
              <div className="text-lg font-mono bg-blue-100 px-3 py-1 rounded">
                {demoSheetName}
              </div>
            </div>
          </div>
        </div>

        {/* Demo Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <Download className="mr-2 text-green-600" size={24} />
              Export Features
            </h2>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center">
                <CheckCircle className="mr-2 text-green-500" size={16} />
                Export with existing payment data
              </li>
              <li className="flex items-center">
                <CheckCircle className="mr-2 text-green-500" size={16} />
                Export empty template for new entries
              </li>
              <li className="flex items-center">
                <CheckCircle className="mr-2 text-green-500" size={16} />
                Sample template with example data
              </li>
              <li className="flex items-center">
                <CheckCircle className="mr-2 text-green-500" size={16} />
                Professional formatting and styling
              </li>
              <li className="flex items-center">
                <CheckCircle className="mr-2 text-green-500" size={16} />
                Instructions and validation worksheets
              </li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <Upload className="mr-2 text-orange-600" size={24} />
              Import Features
            </h2>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center">
                <CheckCircle className="mr-2 text-green-500" size={16} />
                Smart data validation and error checking
              </li>
              <li className="flex items-center">
                <CheckCircle className="mr-2 text-green-500" size={16} />
                Automatic tax calculations using FinancialEngine
              </li>
              <li className="flex items-center">
                <CheckCircle className="mr-2 text-green-500" size={16} />
                Preview imported data before saving
              </li>
              <li className="flex items-center">
                <CheckCircle className="mr-2 text-green-500" size={16} />
                Batch import with error handling
              </li>
              <li className="flex items-center">
                <CheckCircle className="mr-2 text-green-500" size={16} />
                Support for multiple currencies and FX rates
              </li>
            </ul>
          </div>
        </div>

        {/* Current Demo Data */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Current Demo Data</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {demoPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.vendor}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {payment.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {parseFloat(payment.fullPretax).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {payment.currency}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Excel Import/Export Component */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Excel Import/Export Interface</h2>
          <ExcelImportExport
            sheetName={demoSheetName}
            existingPayments={demoPayments}
            onImportComplete={handleImportComplete}
            onExportComplete={handleExportComplete}
            db={null} // Demo mode
            userId="demo-user"
          />
        </div>

        {/* Usage Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
          <h3 className="text-lg font-semibold text-blue-800 mb-3">How to Test</h3>
          <div className="text-blue-700 space-y-2">
            <p><strong>1. Export a Template:</strong> Try exporting with existing data to see the current payments pre-populated.</p>
            <p><strong>2. Export Sample:</strong> Get a template with example data to understand the format.</p>
            <p><strong>3. Fill & Import:</strong> Download a template, fill it with new data, and import it back.</p>
            <p><strong>4. Validation:</strong> The system will automatically calculate taxes and validate your data.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExcelDemo;
