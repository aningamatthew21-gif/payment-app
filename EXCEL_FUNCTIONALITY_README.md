# Excel Import/Export Functionality

## Overview

The payment system now includes comprehensive Excel import/export functionality that allows users to:

1. **Export** Excel templates with existing payment data or as empty templates
2. **Fill** the templates offline in Excel (preferred by many users for data entry)
3. **Import** the filled templates back to automatically update the database
4. **Validate** data during import with automatic tax calculations

## Features

### Export Capabilities

- **Export with Existing Data**: Pre-populates template with current weekly sheet payments
- **Export Empty Template**: Clean template for new payment entries
- **Export Sample Template**: Template with example data for learning
- **Professional Formatting**: Proper column widths, headers, and styling
- **Multiple Worksheets**: Main data sheet + instructions + validation lists

### Import Capabilities

- **Smart Validation**: Checks data integrity and required fields
- **Automatic Calculations**: Uses FinancialEngine to calculate taxes, levies, and totals
- **Error Handling**: Identifies and reports data issues
- **Preview Mode**: Shows imported data before saving to database
- **Batch Processing**: Handles multiple payments efficiently

### Template Structure

The Excel template includes the following columns:

| Column | Field | Description | Required |
|--------|-------|-------------|----------|
| A | DATE | Payment date (DD/MM/YYYY) | Yes |
| B | PAYMENT MODE | Bank Transfer, MOMO, Cash, etc. | Yes |
| C | INVOICE NUMBER | Vendor invoice reference | No |
| D | VENDORS | Supplier/vendor name | Yes |
| E | DESCRIPTIONS | Payment description | Yes |
| F | PROCUREMENT TYPE | Goods, Services, Flat Rate | Yes |
| G | TAX TYPE | Standard, Flat Rate, ST+Tourism, etc. | Yes |
| H | VAT DECISION | Yes/No for VAT application | Yes |
| I | BUDGET LINE | Budget line code/name | No |
| J | CURRENCY | GHS, USD, EUR, GBP | Yes |
| K | FX RATE | Exchange rate (default: 1) | No |
| L | BANK | Bank name for payment | No |
| M | FULL PRE-TAX AMOUNT | Original invoice amount | Yes |
| N | MOMO CHARGE % | Mobile money charge percentage | No |
| O | WHT AMOUNT | Withholding tax amount | Auto-calculated |
| P | LEVY AMOUNT | Levy amount | Auto-calculated |
| Q | VAT AMOUNT | VAT amount | Auto-calculated |
| R | SUBTOTAL | Pre-tax + Levy + VAT | Auto-calculated |
| S | NET PAYABLE | Final payable amount | Auto-calculated |
| T | PAYMENT PERCENTAGE | Partial payment % (default: 100) | No |
| U | AMOUNT THIS TRANSACTION | Actual payment amount | Auto-calculated |
| V | BUDGET IMPACT (USD) | USD equivalent for budget tracking | Auto-calculated |
| W | NOTES | Additional information | No |

## How to Use

### 1. Export a Template

1. Navigate to a weekly payment sheet
2. Click the **Excel Import/Export** section
3. Choose export option:
   - **Export with Existing Data**: Includes current payments
   - **Export Empty Template**: Clean template for new entries
   - **Export Sample Template**: Template with example data

### 2. Fill the Template

1. Open the downloaded Excel file
2. Fill in payment details starting from row 5
3. Use dropdown lists for standardized fields
4. Save the file when complete

### 3. Import the Template

1. Click **Select Excel File** in the import section
2. Choose your filled template
3. Review the import preview
4. Click **Confirm Import** to save to database

## Technical Implementation

### Components

- **`ExcelService.js`**: Core Excel processing logic
- **`ExcelImportExport.jsx`**: React component for the interface
- **`ExcelDemo.jsx`**: Demo page for testing functionality

### Key Functions

#### Export Functions
```javascript
exportWeeklySheetTemplate(sheetName, existingPayments, options)
generateSampleTemplate(sheetName)
```

#### Import Functions
```javascript
importWeeklySheetTemplate(file, sheetName)
processImportedPayments(payments)
```

### Data Processing

1. **Validation**: Checks file structure and required fields
2. **Transformation**: Converts Excel data to internal format
3. **Calculation**: Uses FinancialEngine for tax computations
4. **Storage**: Saves to Firestore database

## Validation Rules

### Required Fields
- Date
- Vendor name
- Description
- Full pre-tax amount
- Currency

### Data Types
- **Dates**: Must be valid date format
- **Numbers**: Must be numeric for amounts
- **Percentages**: Must be 0-100 for payment percentages
- **Currencies**: Must be valid currency codes

### Business Rules
- **WHT**: Calculated based on procurement type (Goods: 3%, Services: 5%)
- **Levy**: Based on tax type (Standard: 6%, Flat Rate: 4%, etc.)
- **VAT**: 15% on (pre-tax + levy) if VAT decision is 'YES'
- **MOMO Charge**: 1% if payment mode is 'MOMO TRANSFER'

## Error Handling

### Common Issues
- **Missing required fields**: Import will fail with specific error messages
- **Invalid data types**: Numbers in text fields, invalid dates
- **File format issues**: Non-Excel files, corrupted files
- **Sheet name mismatch**: Template sheet name must match weekly sheet

### Error Recovery
- **Validation errors**: Fix in Excel and re-import
- **Processing errors**: Check console for detailed error messages
- **Database errors**: Verify database connection and permissions

## Testing

### Demo Page
Access the Excel demo at `/excelDemo` to test functionality:
- Export various template types
- Import sample data
- Test validation and error handling

### Test Scenarios
1. **Basic Export/Import**: Export template, fill with data, import
2. **Partial Payments**: Test payment percentage calculations
3. **Multiple Currencies**: Test FX rate handling
4. **Tax Calculations**: Verify automatic tax computations
5. **Error Cases**: Test with invalid data

## Integration

### With Existing System
- **Weekly Sheets**: Integrated into WeeklyPaymentsDetail component
- **Financial Engine**: Uses existing tax calculation logic
- **Database**: Saves to Firestore collections
- **UI**: Consistent with existing design patterns

### Future Enhancements
- **Bulk Operations**: Import/export multiple sheets
- **Template Customization**: User-defined column layouts
- **Advanced Validation**: Business rule configuration
- **Audit Trail**: Track import/export history

## Performance Considerations

### File Size Limits
- **Recommended**: Up to 1000 payment rows
- **Maximum**: 5000 rows (may impact performance)
- **Memory**: Large files processed in chunks

### Processing Time
- **Small files** (<100 rows): <1 second
- **Medium files** (100-500 rows): 1-3 seconds
- **Large files** (500+ rows): 3-10 seconds

## Security

### File Validation
- **File type**: Only Excel files (.xlsx, .xls)
- **Content validation**: Checks for malicious content
- **Size limits**: Prevents oversized file uploads

### Data Sanitization
- **Input cleaning**: Removes potentially harmful content
- **Type conversion**: Safe conversion of data types
- **Error isolation**: Prevents single error from affecting entire import

## Troubleshooting

### Common Problems

#### Export Issues
- **File not downloading**: Check browser download settings
- **Template formatting**: Ensure XLSX library is loaded
- **Large files**: Consider reducing data size

#### Import Issues
- **Validation errors**: Check required fields and data types
- **Calculation errors**: Verify tax rates and business rules
- **Database errors**: Check Firestore permissions and connection

#### Performance Issues
- **Slow import**: Reduce file size or number of rows
- **Memory issues**: Close other applications
- **Browser freezing**: Use smaller files or restart browser

### Debug Information
- **Console logs**: Check browser console for detailed errors
- **Network tab**: Monitor file upload/download progress
- **Application state**: Verify component state and props

## Support

### Getting Help
1. **Check console**: Look for error messages
2. **Review validation**: Ensure data meets requirements
3. **Test with sample**: Use demo page for testing
4. **Contact support**: For persistent issues

### Best Practices
1. **Backup data**: Keep copies of important templates
2. **Test imports**: Validate data before production use
3. **Regular updates**: Keep system and libraries updated
4. **Documentation**: Maintain import/export procedures

## Conclusion

The Excel import/export functionality provides a powerful bridge between the web application and traditional Excel workflows. It maintains data integrity while offering the flexibility users expect from spreadsheet applications.

For questions or issues, refer to the console logs and validation messages, or contact the development team for assistance.
