import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  Eye, 
  X, 
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react';
import {
  generatePaymentSchedulePDF,
  generateBankInstructionPDF,
  generatePaymentMemoPDF,
  generateWHTReturnPDF,
  downloadPDF,
  openPDF
} from '../services/DocumentService.js';
import { calculateWHT } from '../services/FinancialEngine.js';
import { WHTEnhancedService } from '../services/WHTEnhancedService.js';

const DocumentGenerator = ({ 
  isOpen, 
  onClose, 
  sheetName, 
  payments = [], 
  validationData = {} 
}) => {
  const [selectedDocument, setSelectedDocument] = useState('');
  const [documentOptions, setDocumentOptions] = useState({
    preparedBy: '',
    department: 'Finance',
    bank: '',
    accountNumber: '',
    period: 'Weekly'
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState(null);

  // Document types available
  const documentTypes = [
    {
      id: 'paymentSchedule',
      name: 'Payment Schedule',
      description: 'Professional payment schedule with all payment details',
      icon: FileText,
      color: 'bg-blue-500'
    },
    {
      id: 'bankInstruction',
      name: 'Bank Instruction',
      description: 'Bank transfer instructions for processing payments',
      icon: FileText,
      color: 'bg-green-500'
    },
    {
      id: 'paymentMemo',
      name: 'Payment Memo',
      description: 'Internal memo for payment approval and authorization',
      icon: FileText,
      color: 'bg-purple-500'
    },
    {
      id: 'whtReturn',
      name: 'WHT Return',
      description: 'Withholding tax return for compliance reporting',
      icon: FileText,
      color: 'bg-orange-500'
    }
  ];

  const handleGenerateDocument = async () => {
    if (!selectedDocument || !payments.length) return;
    
    setIsGenerating(true);
    try {
      let doc = null;
      const filename = `${sheetName}_${selectedDocument}_${new Date().toISOString().split('T')[0]}.pdf`;

      switch (selectedDocument) {
        case 'paymentSchedule':
          doc = generatePaymentSchedulePDF({ payments }, sheetName, documentOptions);
          break;
        case 'bankInstruction':
          doc = generateBankInstructionPDF({ 
            payments, 
            bank: documentOptions.bank, 
            accountNumber: documentOptions.accountNumber 
          }, sheetName, documentOptions);
          break;
        case 'paymentMemo':
          doc = generatePaymentMemoPDF({ 
            payments, 
            preparedBy: documentOptions.preparedBy, 
            department: documentOptions.department,
            currency: 'GHS'
          }, sheetName, documentOptions);
          break;
        case 'whtReturn':
          // Calculate WHT amounts for each payment using unified system
          // Use existing WHT values if available (already calculated by PaymentGenerator)
          // Note: If WHT is not pre-calculated, it should be calculated by PaymentGenerator first
          const paymentsWithWHT = payments.map(payment => {
            const amount = parseFloat(payment.amount || payment.fullPretax || payment.pretaxAmount || 0);
            const procurementType = payment.procurementType || payment.procurement || 'SERVICES';
            
            // Use existing WHT if already calculated by PaymentGenerator
            let whtAmount = parseFloat(payment.whtAmount) || 0;
            let whtRate = parseFloat(payment.whtRate) || 0;
            
            // If WHT not calculated, log warning (should be calculated by PaymentGenerator)
            if (!whtAmount || whtAmount === 0 || !whtRate) {
              console.warn(`[DocumentGenerator] WHT not pre-calculated for payment. Rate should be retrieved from database validation collection.`);
              // Return 0 - WHT must be calculated by PaymentGenerator using database rates
              whtAmount = 0;
              whtRate = 0;
            }
    
            return {
              ...payment,
              whtAmount: whtAmount.toFixed(2),
              whtRate: whtRate > 0 ? `${(whtRate * 100).toFixed(1)}%` : '0%'
            };
          });
          
          doc = generateWHTReturnPDF({ 
            payments: paymentsWithWHT, 
            period: documentOptions.period 
          }, sheetName, documentOptions);
          break;
        default:
          throw new Error('Unknown document type');
      }

      setGeneratedDoc(doc);
      setIsGenerating(false);
    } catch (error) {
      console.error('Error generating document:', error);
      setIsGenerating(false);
      alert('Failed to generate document. Please try again.');
    }
  };

  const handleDownload = () => {
    if (!generatedDoc) return;
    
    const filename = `${sheetName}_${selectedDocument}_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(generatedDoc, filename);
  };

  const handlePreview = () => {
    if (!generatedDoc) return;
    openPDF(generatedDoc);
  };

  const handleClose = () => {
    setSelectedDocument('');
    setDocumentOptions({
      preparedBy: '',
      department: 'Finance',
      bank: '',
      accountNumber: '',
      period: 'Weekly'
    });
    setGeneratedDoc(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Document Generator</h2>
            <p className="text-gray-600">Generate professional PDF documents for {sheetName}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
      {/* Document Type Selection */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Select Document Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {documentTypes.map((docType) => (
            <div
              key={docType.id}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedDocument === docType.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
                  onClick={() => setSelectedDocument(docType.id)}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-full ${docType.color} text-white`}>
                      <docType.icon size={20} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800">{docType.name}</h4>
              <p className="text-sm text-gray-600">{docType.description}</p>
                    </div>
                  </div>
            </div>
          ))}
        </div>
      </div>

          {/* Document Options */}
          {selectedDocument && (
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">Document Options</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedDocument === 'paymentMemo' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Prepared By
                      </label>
                      <input
                        type="text"
                        value={documentOptions.preparedBy}
                        onChange={(e) => setDocumentOptions(prev => ({ ...prev, preparedBy: e.target.value }))}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        placeholder="Your Name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Department
                      </label>
                      <input
                        type="text"
                        value={documentOptions.department}
                        onChange={(e) => setDocumentOptions(prev => ({ ...prev, department: e.target.value }))}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        placeholder="Finance"
                      />
                    </div>
                  </>
                )}

                {selectedDocument === 'bankInstruction' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Bank
                      </label>
                      <select
                        value={documentOptions.bank}
                        onChange={(e) => setDocumentOptions(prev => ({ ...prev, bank: e.target.value }))}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      >
                        <option value="">Select Bank</option>
                        {validationData.banks?.map((bank, index) => (
                          <option key={bank.id || index} value={bank.value}>
                            {bank.value}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={documentOptions.accountNumber}
                        onChange={(e) => setDocumentOptions(prev => ({ ...prev, accountNumber: e.target.value }))}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        placeholder="Account Number"
                      />
                    </div>
                  </>
                )}

                {selectedDocument === 'whtReturn' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Period
                    </label>
                    <select
                      value={documentOptions.period}
                      onChange={(e) => setDocumentOptions(prev => ({ ...prev, period: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded-md"
                    >
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
                      <option value="Quarterly">Quarterly</option>
                      <option value="Annual">Annual</option>
                    </select>
                  </div>
                )}
              </div>
          </div>
          )}

          {/* Payment Summary */}
          {payments.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">Payment Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{payments.length}</div>
                  <div className="text-sm text-blue-800">Total Payments</div>
                </div>
                <div className="bg-green-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {payments.reduce((sum, p) => sum + (parseFloat(p.amount || p.fullPretax || 0)), 0).toFixed(2)}
                  </div>
                  <div className="text-sm text-green-800">Total Amount</div>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {payments.filter(p => p.currency === 'USD').length}
                  </div>
                  <div className="text-sm text-purple-800">USD Payments</div>
                </div>
                <div className="bg-orange-50 p-3 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {payments.filter(p => p.currency === 'GHS').length}
                  </div>
                  <div className="text-sm text-orange-800">GHS Payments</div>
              </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            
            {selectedDocument && (
            <button
                onClick={handleGenerateDocument}
                disabled={isGenerating || !payments.length}
                className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <FileText size={16} />
                    <span>Generate Document</span>
                  </>
                )}
            </button>
          )}
        </div>

          {/* Generated Document Actions */}
          {generatedDoc && (
            <div className="border border-green-200 bg-green-50 rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-4">
                <CheckCircle className="text-green-600" size={24} />
                <div>
                  <h4 className="font-semibold text-green-800">Document Generated Successfully!</h4>
                  <p className="text-sm text-green-600">
                    Your {selectedDocument.replace(/([A-Z])/g, ' $1').toLowerCase()} is ready.
                  </p>
                </div>
          </div>

              <div className="flex space-x-3">
            <button
                  onClick={handlePreview}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center space-x-2"
            >
                  <Eye size={16} />
                  <span>Preview</span>
            </button>
                
            <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors flex items-center space-x-2"
            >
                  <Download size={16} />
                  <span>Download PDF</span>
            </button>
          </div>
        </div>
      )}

          {/* No Payments Warning */}
          {payments.length === 0 && (
            <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
              <div className="flex items-center space-x-3">
                <AlertCircle className="text-yellow-600" size={24} />
                  <div>
                  <h4 className="font-semibold text-yellow-800">No Payments Available</h4>
                  <p className="text-sm text-yellow-600">
                    There are no payments in this sheet to generate documents from.
                  </p>
                </div>
              </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default DocumentGenerator; 