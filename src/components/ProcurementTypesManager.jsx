// Procurement Types Manager - UI component for managing procurement types and WHT rates
// This component provides CRUD operations for procurement types without affecting existing code

import React, { useState, useEffect } from 'react';
import { ProcurementTypesService } from '../services/ProcurementTypesService.js';
import { WHT_CONFIG, updateWHTConfig } from '../config/WHTConfig.js';

const ProcurementTypesManager = ({ db, appId, onClose }) => {
  const [procurementTypes, setProcurementTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    whtRate: '',
    description: ''
  });
  const [seeding, setSeeding] = useState(false);

  // Load procurement types on component mount
  useEffect(() => {
    loadProcurementTypes();
  }, [db, appId]);

  const loadProcurementTypes = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const types = await ProcurementTypesService.getProcurementTypes(db, appId);
      setProcurementTypes(types);
      
      console.log('[ProcurementTypesManager] Loaded procurement types:', types.length);
    } catch (error) {
      console.error('[ProcurementTypesManager] Error loading procurement types:', error);
      setError('Failed to load procurement types: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      whtRate: '',
      description: ''
    });
    setEditingType(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingType) {
        // Update existing type
        await ProcurementTypesService.updateProcurementType(
          db, 
          appId, 
          editingType.id, 
          formData
        );
        console.log('[ProcurementTypesManager] ✓ Procurement type updated');
      } else {
        // Create new type
        await ProcurementTypesService.createProcurementType(db, appId, formData);
        console.log('[ProcurementTypesManager] ✓ Procurement type created');
      }
      
      // Reload types and reset form
      await loadProcurementTypes();
      resetForm();
      
    } catch (error) {
      console.error('[ProcurementTypesManager] Error saving procurement type:', error);
      setError('Failed to save procurement type: ' + error.message);
    }
  };

  const handleEdit = (type) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      whtRate: type.whtRatePercentage,
      description: type.description
    });
    setShowForm(true);
  };

  const handleDelete = async (typeId) => {
    if (!window.confirm('Are you sure you want to delete this procurement type? This action cannot be undone.')) {
      return;
    }
    
    try {
      await ProcurementTypesService.deleteProcurementType(db, appId, typeId);
      console.log('[ProcurementTypesManager] ✓ Procurement type deleted');
      await loadProcurementTypes();
    } catch (error) {
      console.error('[ProcurementTypesManager] Error deleting procurement type:', error);
      setError('Failed to delete procurement type: ' + error.message);
    }
  };

  const handleSeedDefaultTypes = async () => {
    if (!window.confirm('This will create default procurement types. Continue?')) {
      return;
    }
    
    try {
      setSeeding(true);
      const result = await ProcurementTypesService.seedDefaultProcurementTypes(db, appId);
      
      if (result.success) {
        console.log('[ProcurementTypesManager] ✓ Default types seeded:', result);
        await loadProcurementTypes();
        alert(`Seeding completed: ${result.createdCount} created, ${result.skippedCount} skipped`);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('[ProcurementTypesManager] Error seeding default types:', error);
      setError('Failed to seed default types: ' + error.message);
    } finally {
      setSeeding(false);
    }
  };

  const handleEnableFeature = async () => {
    try {
      const result = updateWHTConfig({
        ENABLE_PROCUREMENT_MANAGER: true
      });
      
      if (result.success) {
        alert('Procurement Types Manager feature enabled!');
        // Optionally reload the component or notify parent
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('[ProcurementTypesManager] Error enabling feature:', error);
      setError('Failed to enable feature: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading procurement types...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Procurement Types Manager</h1>
            <p className="text-gray-600">Manage procurement types and their corresponding WHT rates</p>
          </div>
          
          <div className="flex space-x-3">
            {!WHT_CONFIG.ENABLE_PROCUREMENT_MANAGER && (
              <button
                onClick={handleEnableFeature}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                🚀 Enable Feature
              </button>
            )}
            
            <button
              onClick={handleSeedDefaultTypes}
              disabled={seeding}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {seeding ? '🌱 Seeding...' : '🌱 Seed Default Types'}
            </button>
            
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
            >
              ➕ Add New Type
            </button>
            
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              >
                ✕ Close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <span className="text-red-600 mr-2">⚠️</span>
            <span className="text-red-800">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-600 hover:text-red-800"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="mb-6 p-6 bg-gray-50 border rounded-lg">
          <h2 className="text-lg font-semibold mb-4">
            {editingType ? 'Edit Procurement Type' : 'Add New Procurement Type'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., SERVICES, GOODS, WORKS"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  WHT Rate (%) *
                </label>
                <input
                  type="number"
                  name="whtRate"
                  value={formData.whtRate}
                  onChange={handleInputChange}
                  required
                  min="0"
                  max="100"
                  step="0.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 7.5"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Brief description of the type"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                {editingType ? 'Update Type' : 'Create Type'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Procurement Types Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Procurement Types ({procurementTypes.length})
          </h3>
        </div>
        
        {procurementTypes.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">📋</div>
            <p className="text-lg font-medium mb-2">No procurement types found</p>
            <p className="mb-4">Get started by adding your first procurement type or seeding default types.</p>
            <div className="space-x-3">
              <button
                onClick={() => setShowForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                ➕ Add First Type
              </button>
              <button
                onClick={handleSeedDefaultTypes}
                disabled={seeding}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                🌱 Seed Default Types
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    WHT Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {procurementTypes.map((type) => (
                  <tr key={type.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{type.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <span className="font-medium">{type.whtRatePercentage}</span>
                        <span className="text-gray-500 ml-1">({(type.whtRate * 100).toFixed(1)}%)</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {type.description || 'No description'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        type.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {type.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(type)}
                          className="text-indigo-600 hover:text-indigo-900 transition-colors"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(type.id)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start">
          <span className="text-blue-600 mr-3">ℹ️</span>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How it works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Procurement types define the WHT rates for different categories of expenses</li>
              <li>WHT is only applied to GHS (Cedi) transactions</li>
              <li>Rates can be dynamically managed or fall back to hardcoded values</li>
              <li>Changes take effect immediately for new calculations</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcurementTypesManager;
