import React, { useEffect, useState } from 'react';
//import { useAuth } from '../contexts/AuthContext';
import { collection, query, where, orderBy, db, limit, onSnapshot } from 'firebase/firestore';
import UndoService from '../services/UndoService';

const UndoPanel = () => {
 //  const { db, appId } = useAuth();
  const [recentBatches, setRecentBatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUndoing, setIsUndoing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db || !appId) return;

    setIsLoading(true);
    const txCol = collection(db, `artifacts/${appId}/public/transactionLog`);
    const q = query(txCol, where('status', '==', 'finalized'), orderBy('timestamp', 'desc'), limit(10));

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecentBatches(rows);
      setIsLoading(false);
    }, (err) => {
      setError(err.message);
      setIsLoading(false);
    });

    return () => unsub();
  }, [db, appId]);

  const handleUndo = async (batchId) => {
    if (!db || !appId || !batchId) return;
    if (!confirm(`Undo batch ${batchId}? This will mark the batch as undone and revert related states.`)) return;

    setIsUndoing(true);
    setError('');
    try {
      await UndoService.undoBatch(db, appId, batchId);
      alert('Batch successfully undone.');
    } catch (e) {
      console.error(e);
      setError(e.message || 'Failed to undo batch');
      alert('Failed to undo batch.');
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Undo Finalized Batches</h2>
      <p className="text-sm text-gray-600 mb-4">Use this panel to undo recently finalized payment batches. This action records an audit trail.</p>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {isLoading ? (
        <div className="text-gray-500">Loading recent batches...</div>
      ) : recentBatches.length === 0 ? (
        <div className="text-gray-500">No finalized batches found.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">Batch ID</th>
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">Weekly Sheet</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Payments</th>
                <th className="text-right py-2 px-2 text-sm font-medium text-gray-600">Total Amount</th>
                <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">Date</th>
                <th className="text-center py-2 px-2 text-sm font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {recentBatches.map((b) => (
                <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-2 text-sm text-gray-800 font-medium">{b.batchId}</td>
                  <td className="py-2 px-2 text-sm text-gray-800">{b.metadata?.weeklySheetName || '—'}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{b.paymentCount}</td>
                  <td className="py-2 px-2 text-sm text-gray-800 text-right">{Number(b.totalAmount || 0).toLocaleString('en-GH', { style: 'currency', currency: 'GHS' })}</td>
                  <td className="py-2 px-2 text-sm text-gray-800">{new Date(b.timestamp).toLocaleString()}</td>
                  <td className="py-2 px-2 text-center">
                    <button
                      disabled={isUndoing}
                      onClick={() => handleUndo(b.batchId)}
                      className={`px-3 py-1 rounded text-sm ${isUndoing ? 'bg-gray-300 text-gray-500' : 'bg-red-600 text-white hover:bg-red-700'}`}
                    >
                      {isUndoing ? 'Working...' : 'Undo'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default UndoPanel;