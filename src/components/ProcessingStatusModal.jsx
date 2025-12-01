import React from 'react';
import { Check, Loader2, AlertCircle, X } from 'lucide-react';

const ProcessingStatusModal = ({ isOpen, steps, currentStep, error, onClose }) => {
    if (!isOpen) return null;

    // Calculate progress percentage
    const totalSteps = steps.length;
    const currentStepIndex = steps.findIndex(step => step.id === currentStep);
    const progress = currentStep === 'COMPLETED'
        ? 100
        : error
            ? (currentStepIndex / totalSteps) * 100
            : Math.max(5, ((currentStepIndex + 0.5) / totalSteps) * 100);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
                {/* Header */}
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800">
                        {error ? 'Processing Failed' : currentStep === 'COMPLETED' ? 'Processing Complete' : 'Processing Payment...'}
                    </h3>
                    {error && (
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="p-6">
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-2 mb-6 overflow-hidden">
                        <div
                            className={`h-full transition-all duration-500 ease-out ${error ? 'bg-red-500' : 'bg-blue-600'}`}
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>

                    {/* Steps List */}
                    <div className="space-y-4">
                        {steps.map((step, index) => {
                            // Determine status of this step
                            let status = 'pending'; // pending, active, completed, error

                            if (error && step.id === currentStep) {
                                status = 'error';
                            } else if (currentStep === 'COMPLETED') {
                                status = 'completed';
                            } else {
                                const stepIndex = steps.findIndex(s => s.id === step.id);
                                const activeIndex = steps.findIndex(s => s.id === currentStep);

                                if (stepIndex < activeIndex) status = 'completed';
                                else if (stepIndex === activeIndex) status = 'active';
                                else status = 'pending';
                            }

                            return (
                                <div key={step.id} className="flex items-center space-x-3">
                                    {/* Icon */}
                                    <div className={`
                    flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300
                    ${status === 'completed' ? 'bg-green-100 text-green-600' :
                                            status === 'active' ? 'bg-blue-100 text-blue-600' :
                                                status === 'error' ? 'bg-red-100 text-red-600' :
                                                    'bg-slate-100 text-slate-400'}
                  `}>
                                        {status === 'completed' ? <Check size={16} strokeWidth={3} /> :
                                            status === 'active' ? <Loader2 size={16} className="animate-spin" /> :
                                                status === 'error' ? <AlertCircle size={16} /> :
                                                    <div className="w-2 h-2 bg-current rounded-full" />}
                                    </div>

                                    {/* Text */}
                                    <div className="flex-1">
                                        <p className={`text-sm font-medium ${status === 'active' ? 'text-blue-700' :
                                            status === 'completed' ? 'text-slate-700' :
                                                status === 'error' ? 'text-red-700' :
                                                    'text-slate-400'
                                            }`}>
                                            {step.label}
                                        </p>
                                        {status === 'active' && (
                                            <p className="text-xs text-blue-500 animate-pulse">Processing...</p>
                                        )}
                                        {status === 'error' && (
                                            <p className="text-xs text-red-500">{error}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                {error && (
                    <div className="bg-red-50 px-6 py-4 border-t border-red-100">
                        <div className="mb-3 text-sm text-red-700 bg-red-100 p-3 rounded border border-red-200">
                            <strong>Error:</strong> {error}
                        </div>
                        <button
                            onClick={onClose}
                            className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                        >
                            Close & Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProcessingStatusModal;
