import { useReducer } from 'react';
import { PaymentContext, paymentReducer, initialState } from './PaymentContext';

export const PaymentProvider = ({ children }) => {
  const [state, dispatch] = useReducer(paymentReducer, initialState);

  return (
    <PaymentContext.Provider value={{ state, dispatch }}>
      {children}
    </PaymentContext.Provider>
  );
};
