import { calculatePayment, calculateTotalTaxes } from './FinancialEngine.js';

describe('FinancialEngine', () => {
  describe('calculateTotalTaxes', () => {
    it('should calculate taxes correctly for a standard GHS transaction', () => {
      const transaction = {
        fullPretax: 100,
        procurementType: 'GOODS',
        taxType: 'STANDARD',
        vatDecision: 'YES',
        paymentMode: 'BNK TRNSF',
        currency: 'GHS',
        fxRate: 1,
      };
      const rates = {
        whtRate: 0.05,
        levyRate: 0.01,
        vatRate: 0.15,
        momoRate: 0,
      };
      const result = calculateTotalTaxes(transaction, rates);
      expect(result.wht).toBe(5);
      expect(result.levy).toBe(1);
      expect(result.vat).toBe(15.15);
      expect(result.netPayable).toBe(111.15);
    });
  });

  describe('calculatePayment', () => {
    it('should calculate payment details correctly for a full payment', () => {
      const paymentData = {
        preTaxAmount: 100,
        paymentPercentage: 100,
        isPartialPayment: false,
        currency: 'GHS',
        fxRate: 13.5,
        procurementType: 'GOODS',
        taxType: 'STANDARD',
        vatDecision: 'YES',
        paymentMode: 'BNK TRNSF',
      };
      const rates = {
        whtRate: 0.05,
        levyRate: 0.01,
        vatRate: 0.15,
        momoRate: 0,
      };

      const result = calculatePayment(paymentData, rates);

      expect(result.whtAmount).toBe(5);
      expect(result.levyAmount).toBe(1);
      expect(result.vatAmount).toBe(15.15);
      expect(result.momoCharge).toBe(0);
      expect(result.amountThisTransaction).toBe(111.15);
      expect(result.budgetImpactUSD).toBeCloseTo(8.23);
    });

    it('should calculate payment details correctly for a partial payment', () => {
        const paymentData = {
            preTaxAmount: 100,
            paymentPercentage: 50,
            isPartialPayment: true,
            currency: 'GHS',
            fxRate: 13.5,
            procurementType: 'GOODS',
            taxType: 'STANDARD',
            vatDecision: 'YES',
            paymentMode: 'BNK TRNSF',
        };
        const rates = {
            whtRate: 0.05,
            levyRate: 0.01,
            vatRate: 0.15,
            momoRate: 0,
        };

        const result = calculatePayment(paymentData, rates);

        expect(result.whtAmount).toBe(2.5);
        expect(result.levyAmount).toBe(0.5);
        expect(result.vatAmount).toBe(7.575);
        expect(result.momoCharge).toBe(0);
        expect(result.amountThisTransaction).toBe(55.575);
        expect(result.budgetImpactUSD).toBeCloseTo(4.12);
    });
  });
});
