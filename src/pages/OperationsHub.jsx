import React, { useState, useEffect } from 'react';
import SheetSelector from '../components/SheetSelector';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import BudgetTracker from '../components/BudgetTracker';
import DocumentGenerator from '../components/DocumentGenerator';
import UndoPanel from '../components/UndoPanel';
import PaymentGenerator from '../components/PaymentGenerator';
import useWeeklyPayments from '../hooks/useWeeklyPayments';

const OperationsHub = () => {
  const [selectedSheet, setSelectedSheet] = useState(null);
  const { payments, loading } = useWeeklyPayments(selectedSheet?.id || null, { status: 'pending' });
  const [availablePayments, setAvailablePayments] = useState([]);

  useEffect(() => {
    setAvailablePayments(payments || []);
  }, [payments]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold text-gray-900">Operations Hub</h1>
        <SheetSelector
          selectedSheetId={selectedSheet?.id || ''}
          onChange={(sheet) => setSelectedSheet(sheet)}
        />
      </div>

      {!selectedSheet ? (
        <div className="p-6 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
          Select a weekly sheet to view analytics, generate documents, and manage payments.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Analytics */}
          <AnalyticsDashboard
            weeklySheetId={selectedSheet.id}
            weeklySheetName={selectedSheet.name}
          />

          {/* Budget */}
          <BudgetTracker
            weeklySheetId={selectedSheet.id}
            weeklySheetName={selectedSheet.name}
          />

          {/* Documents */}
          <DocumentGenerator
            weeklySheetId={selectedSheet.id}
            weeklySheetName={selectedSheet.name}
          />

          {/* Payments */}
          <div className="space-y-2">
            {loading && (
              <div className="text-sm text-gray-500">Loading pending payments...</div>
            )}
            <PaymentGenerator
              weeklySheetId={selectedSheet.id}
              weeklySheetName={selectedSheet.name}
              availablePayments={availablePayments}
              setAvailablePayments={setAvailablePayments}
            />
          </div>

          {/* Undo */}
          <UndoPanel />
        </div>
      )}
    </div>
  );
};

export default OperationsHub;