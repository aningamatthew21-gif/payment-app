
import React, { useState, useEffect } from 'react';
import { getApprovers } from '../services/ApproverService';

const ApproverSelector = ({ db, appId, selections, onSelectionChange }) => {
  const [approvers, setApprovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('ApproverSelector: Component mounted. Initializing approver fetch.');
    const fetchApprovers = async () => {
      if (!db || !appId) {
        console.error('ApproverSelector: Missing required props: db or appId.');
        setError('Database connection is not available.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log('ApproverSelector: Calling getApprovers service.');
        const fetchedApprovers = await getApprovers(db, appId);
        setApprovers(fetchedApprovers);
        console.log('ApproverSelector: Approvers successfully fetched and set in state.', fetchedApprovers);
      } catch (err) {
        console.error('ApproverSelector: Failed to fetch approvers.', err);
        setError('Could not load the list of approvers. Please try refreshing the page.');
      } finally {
        setLoading(false);
        console.log('ApproverSelector: Fetch process finished.');
      }
    };

    fetchApprovers();
  }, [db, appId]);

  const handleSelectChange = (role, value) => {
    console.log(`ApproverSelector: Selection changed for role '${role}' to '${value}'`);
    onSelectionChange(role, value);
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-500">Loading Approvers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-300 rounded-lg p-4">
        <h4 className="text-md font-semibold text-red-800">Error Loading Approvers</h4>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-3 px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
        >
          Refresh Page
        </button>
      </div>
    );
  }

  const roles = [
    { id: 'preparedBy', label: 'Prepared By' },
    { id: 'checkedBy', label: 'Checked By', required: true },
    { id: 'approvedBy', label: 'Approved By', required: true },
    { id: 'authorizedBy', label: 'Authorized By', required: true },
  ];

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Approval & Authorization</h3>
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          Select the designated personnel for each approval step. Fields marked with <span className="text-red-500">*</span> are mandatory for staging a payment.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {roles.map(role => (
          <div key={role.id}>
            <label htmlFor={role.id} className="block text-sm font-medium text-gray-700 mb-2">
              {role.label} {role.required && <span className="text-red-500">*</span>}
            </label>
            <select
              id={role.id}
              name={role.id}
              value={selections[role.id] || ''}
              onChange={(e) => handleSelectChange(role.id, e.target.value)}
              className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white ${
                role.required && !selections[role.id] ? 'border-red-300' : 'border-gray-300'
              }`}
            >
              <option value="">Select a person</option>
              {approvers.map(approver => (
                <option key={approver.id} value={approver.id}>
                  {approver.name} ({approver.role})
                </option>
              ))}
            </select>
            {!selections[role.id] && role.required && (
                <p className="text-xs text-red-600 mt-1">This field is required.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ApproverSelector;
