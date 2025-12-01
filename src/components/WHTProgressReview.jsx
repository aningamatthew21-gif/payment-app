// WHT Progress Review Component - For monitoring implementation progress
// This component provides visual progress tracking without affecting existing code

import React, { useState, useEffect } from 'react';
import { 
  getWHTProgressReport, 
  getWHTQuickStatus, 
  checkWHTSystemHealth,
  WHT_CONFIG 
} from '../config/WHTConfig.js';

const WHTProgressReview = () => {
  const [progress, setProgress] = useState(null);
  const [quickStatus, setQuickStatus] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [activeTab, setActiveTab] = useState('progress');

  useEffect(() => {
    // Load progress data
    setProgress(getWHTProgressReport());
    setQuickStatus(getWHTQuickStatus());
    setSystemHealth(checkWHTSystemHealth());
  }, []);

  const refreshProgress = () => {
    setProgress(getWHTProgressReport());
    setQuickStatus(getWHTQuickStatus());
    setSystemHealth(checkWHTSystemHealth());
  };

  if (!progress || !quickStatus || !systemHealth) {
    return <div className="p-4">Loading progress...</div>;
  }

  const renderProgressBar = (percentage) => {
    const width = percentage.replace('%', '');
    return (
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div 
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
          style={{ width: `${width}%` }}
        ></div>
      </div>
    );
  };

  const renderPhaseProgress = (phase) => (
    <div key={phase.name} className="mb-6 p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-3">{phase.name}</h3>
      <div className="mb-2 flex justify-between items-center">
        <span className="text-sm text-gray-600">Progress: {phase.progress}</span>
        <span className="text-sm font-medium">{phase.progress}</span>
      </div>
      {renderProgressBar(phase.progress)}
      
      <div className="mt-3 space-y-2">
        {phase.steps.map((step) => (
          <div key={step.step} className="flex items-center space-x-3">
            <span className={`text-sm ${
              step.status.includes('COMPLETED') ? 'text-green-600' :
              step.status.includes('NEXT') ? 'text-blue-600' :
              'text-gray-500'
            }`}>
              {step.status}
            </span>
            <span className="text-sm font-medium">{step.name}</span>
            <span className={`text-xs px-2 py-1 rounded ${
              step.risk === 'ZERO' ? 'bg-green-100 text-green-800' :
              step.risk === 'LOW' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {step.risk} RISK
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSystemHealth = () => (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg">
        <h3 className="text-lg font-semibold mb-3">System Health</h3>
        <div className="flex items-center space-x-3 mb-3">
          <span className={`text-lg font-bold ${
            systemHealth.overall === 'healthy' ? 'text-green-600' :
            systemHealth.overall === 'warning' ? 'text-yellow-600' :
            'text-red-600'
          }`}>
            {systemHealth.overall.toUpperCase()}
          </span>
          <span className="text-sm text-gray-500">{systemHealth.timestamp}</span>
        </div>
        
        <div className="space-y-2">
          {Object.entries(systemHealth.features).map(([feature, config]) => (
            <div key={feature} className="flex justify-between items-center">
              <span className="text-sm font-medium">{config.description}</span>
              <span className={`text-xs px-2 py-1 rounded ${
                config.status === 'active' ? 'bg-green-100 text-green-800' :
                config.status === 'fallback' ? 'bg-yellow-100 text-yellow-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {config.status}
              </span>
            </div>
          ))}
        </div>
        
        {systemHealth.warnings.length > 0 && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <h4 className="font-medium text-yellow-800 mb-2">Warnings:</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              {systemHealth.warnings.map((warning, index) => (
                <li key={index}>• {warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );

  const renderConfiguration = () => (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Feature Flags</h3>
        <div className="space-y-3">
          {Object.entries(WHT_CONFIG).filter(([key]) => key.startsWith('USE_') || key.startsWith('ENABLE_')).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center">
              <span className="text-sm font-medium">{key}</span>
              <span className={`text-xs px-2 py-1 rounded ${
                value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {value ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="p-4 border rounded-lg">
        <h3 className="text-lg font-semibold mb-3">Database Rate Sources</h3>
        <div className="space-y-2">
          <div className="text-sm text-gray-600">
            <p className="mb-2">WHT rates are retrieved from:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Primary: Procurement Types Collection</li>
              <li>Fallback: Validation Collection (field: 'procurementTypes')</li>
            </ul>
            <p className="mt-2 text-xs text-gray-500">
              No hardcoded rates - all rates must be stored in database
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">WHT System Progress Review</h1>
        <p className="text-gray-600">Monitor the implementation progress of the Withholding Tax enhancement system</p>
      </div>

      {/* Quick Status Bar */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <span className="text-sm text-blue-600">Current Status:</span>
            <span className="ml-2 font-medium text-blue-800">{quickStatus.status}</span>
          </div>
          <div className="text-right">
            <span className="text-sm text-blue-600">Progress:</span>
            <span className="ml-2 font-bold text-blue-800">{quickStatus.progress}</span>
          </div>
        </div>
        <div className="mt-2 flex justify-between items-center">
          <div>
            <span className="text-sm text-blue-600">Phase:</span>
            <span className="ml-2 font-medium text-blue-800">{quickStatus.currentPhase}</span>
          </div>
          <div className="text-right">
            <span className="text-sm text-blue-600">Risk Level:</span>
            <span className="ml-2 font-bold text-blue-800">{quickStatus.riskLevel}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'progress', name: 'Progress Overview', icon: '📊' },
            { id: 'health', name: 'System Health', icon: '🏥' },
            { id: 'config', name: 'Configuration', icon: '⚙️' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mb-6">
        {activeTab === 'progress' && (
          <div>
            <div className="mb-4">
              <h2 className="text-xl font-semibold mb-3">Overall Progress</h2>
              <div className="mb-2 flex justify-between items-center">
                <span className="text-sm text-gray-600">Overall Progress: {progress.overallProgress}</span>
                <span className="text-sm font-medium">{progress.completedSteps} / {progress.totalSteps} steps</span>
              </div>
              {renderProgressBar(progress.overallProgress)}
            </div>
            
            {renderPhaseProgress(progress.phase1)}
            {renderPhaseProgress(progress.phase2)}
            {renderPhaseProgress(progress.phase3)}
          </div>
        )}

        {activeTab === 'health' && renderSystemHealth()}
        {activeTab === 'config' && renderConfiguration()}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <button
          onClick={refreshProgress}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
        >
          🔄 Refresh Progress
        </button>
        
        <div className="text-sm text-gray-500">
          Last updated: {new Date(progress.timestamp).toLocaleString()}
        </div>
      </div>
    </div>
  );
};

export default WHTProgressReview;
