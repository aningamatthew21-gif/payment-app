import { createContext, useReducer } from 'react';

export const PaymentContext = createContext();

export const actionTypes = {
  SET_FIELD: 'SET_FIELD',
  SET_CALCULATED_VALUES: 'SET_CALCULATED_VALUES',
  RESET_FORM: 'RESET_FORM',
  SET_STAGED_PAYMENTS: 'SET_STAGED_PAYMENTS',
  SET_AVAILABLE_PAYMENTS: 'SET_AVAILABLE_PAYMENTS',
  SET_SELECTED_AVAILABLE: 'SET_SELECTED_AVAILABLE',
  ADD_SUPPORT_DOCUMENT: 'ADD_SUPPORT_DOCUMENT',
  REMOVE_SUPPORT_DOCUMENT: 'REMOVE_SUPPORT_DOCUMENT',
  REORDER_SUPPORT_DOCUMENTS: 'REORDER_SUPPORT_DOCUMENTS',
};

export const initialState = {
  stagedPayments: [],
  selectedAvailable: null,
  loading: true,
  error: null,
  vendor: '',
  invoiceNo: '',
  description: '',
  budgetLine: '',
  currency: 'GHS',
  paymentMode: 'BANK_TRANSFER',
  procurementType: 'GOODS',
  taxType: 'ST+CST',
  vatDecision: 'NON_VATABLE',
  fxRate: 0,
  isPartialPayment: false,
  paymentPercentage: 100,
  checkedBy: '',
  approvedBy: '',
  authorizedBy: '',
  preparedBy: '',
  paymentPriority: 'normal',
  approvalNotes: '',
  preTaxAmount: 0,
  whtAmount: 0,
  levyAmount: 0,
  vatAmount: 0,
  momoCharge: 0,
  amountThisTransaction: 0,
  budgetImpactUSD: 0,
  bank: '',
  whtRate: 0,
  supportDocuments: [], // Array of { file, preview, name, type }
};

export const paymentReducer = (state, action) => {
  switch (action.type) {
    case actionTypes.SET_FIELD:
      return { ...state, [action.payload.field]: action.payload.value };
    case actionTypes.SET_CALCULATED_VALUES:
      return { ...state, ...action.payload };
    case actionTypes.RESET_FORM:
      return {
        ...state,
        selectedAvailable: null,
        vendor: '',
        invoiceNo: '',
        description: '',
        budgetLine: '',
        currency: 'GHS',
        paymentMode: 'BANK_TRANSFER',
        procurementType: 'GOODS',
        taxType: 'ST+CST',
        vatDecision: 'NON_VATABLE',
        fxRate: 0,
        preTaxAmount: 0,
        paymentPercentage: 100,
        isPartialPayment: false,
        whtAmount: 0,
        levyAmount: 0,
        vatAmount: 0,
        momoCharge: 0,
        amountThisTransaction: 0,
        budgetImpactUSD: 0,
        checkedBy: '',
        approvedBy: '',
        authorizedBy: '',
        preparedBy: '',
        paymentPriority: 'normal',
        approvalNotes: '',
        bank: '',
        whtRate: 0,
        supportDocuments: [],
      };
    case actionTypes.SET_STAGED_PAYMENTS:
      return { ...state, stagedPayments: action.payload };
    case actionTypes.SET_AVAILABLE_PAYMENTS:
      return { ...state, availablePayments: action.payload };
    case actionTypes.SET_SELECTED_AVAILABLE:
      return { ...state, selectedAvailable: action.payload };
    case actionTypes.ADD_SUPPORT_DOCUMENT:
      return { ...state, supportDocuments: [...state.supportDocuments, action.payload] };
    case actionTypes.REMOVE_SUPPORT_DOCUMENT:
      return {
        ...state,
        supportDocuments: state.supportDocuments.filter((_, index) => index !== action.payload)
      };
    case actionTypes.REORDER_SUPPORT_DOCUMENTS: {
      const { fromIndex, toIndex } = action.payload;
      const newDocs = [...state.supportDocuments];
      const [movedDoc] = newDocs.splice(fromIndex, 1);
      newDocs.splice(toIndex, 0, movedDoc);
      return { ...state, supportDocuments: newDocs };
    }
    default:
      return state;
  }
};
