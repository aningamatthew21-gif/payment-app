import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';

/**
 * VendorService - Single source of truth for vendor data
 * Manages vendor CRUD operations with Firestore
 */
export const VendorService = {
    // Get all vendors from Firestore Vendor Management collection
    getAllVendors: async (db, appId) => {
        try {
            console.log('[VendorService] Fetching vendors from Firestore...');
            const vendorsRef = collection(db, `artifacts/${appId}/public/data/vendors`);
            const q = query(vendorsRef, orderBy('name'));
            const snapshot = await getDocs(q);
            const vendors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            console.log(`[VendorService] Loaded ${vendors.length} vendors from Vendor Management`);
            return vendors;
        } catch (error) {
            console.error("[VendorService] Error fetching vendors:", error);
            return [];
        }
    },

    // Check if vendor already exists (case-insensitive exact match)
    vendorExists: async (db, appId, vendorName) => {
        try {
            if (!vendorName || typeof vendorName !== 'string') return null;
            const vendors = await VendorService.getAllVendors(db, appId);
            const normalizedName = vendorName.trim().toLowerCase();
            return vendors.find(v => v.name?.trim().toLowerCase() === normalizedName) || null;
        } catch (error) {
            console.error("[VendorService] Error checking vendor existence:", error);
            return null;
        }
    },

    // Add a new vendor to Firestore Vendor Management collection
    // Returns existing vendor with isDuplicate:true if already exists
    addVendor: async (db, appId, vendorData) => {
        try {
            // Check for duplicate before adding
            const existingVendor = await VendorService.vendorExists(db, appId, vendorData.name);
            if (existingVendor) {
                console.log("[VendorService] Vendor already exists, skipping:", existingVendor.name);
                return { ...existingVendor, isDuplicate: true };
            }

            console.log("[VendorService] Adding new vendor to Firestore:", vendorData);
            const vendorsRef = collection(db, `artifacts/${appId}/public/data/vendors`);
            const docRef = await addDoc(vendorsRef, {
                ...vendorData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            console.log("[VendorService] Vendor added successfully with ID:", docRef.id);
            return { id: docRef.id, ...vendorData };
        } catch (error) {
            console.error("[VendorService] Error adding vendor:", error);
            throw error;
        }
    },

    // Update a vendor in Firestore Vendor Management collection
    updateVendor: async (db, appId, vendorId, updates) => {
        try {
            console.log("[VendorService] Updating vendor:", vendorId, updates);
            const vendorRef = doc(db, `artifacts/${appId}/public/data/vendors`, vendorId);
            await updateDoc(vendorRef, {
                ...updates,
                updatedAt: new Date().toISOString()
            });
            console.log("[VendorService] Vendor updated successfully:", vendorId);
            return { id: vendorId, ...updates };
        } catch (error) {
            console.error("[VendorService] Error updating vendor:", error);
            throw error;
        }
    },

    // Delete a vendor from Firestore
    deleteVendor: async (db, appId, vendorId) => {
        try {
            console.log("[VendorService] Deleting vendor:", vendorId);
            const vendorRef = doc(db, `artifacts/${appId}/public/data/vendors`, vendorId);
            await deleteDoc(vendorRef);
            console.log("[VendorService] Vendor deleted successfully:", vendorId);
            return true;
        } catch (error) {
            console.error("[VendorService] Error deleting vendor:", error);
            throw error;
        }
    },

    // Generate Excel Template for vendor import
    generateExcelTemplate: () => {
        try {
            const workbook = XLSX.utils.book_new();

            // Template headers and sample data
            const templateData = [
                ['VENDOR IMPORT TEMPLATE'],
                ['Fill in data starting from row 4. Do not modify column headers.'],
                [],
                ['Vendor Name', 'Contact Email', 'Bank Name', 'Branch Code', 'Account Name', 'Account Number', 'Status'],
                ['ACME CORP LTD', 'finance@acme.com', 'GT Bank', '01', 'ACME CORP LTD', '1234567890', 'active'],
                ['', '', '', '', '', '', ''] // Empty row for user to fill
            ];

            const worksheet = XLSX.utils.aoa_to_sheet(templateData);

            // Set column widths
            worksheet['!cols'] = [
                { wch: 25 }, // Vendor Name
                { wch: 25 }, // Contact Email
                { wch: 20 }, // Bank Name
                { wch: 12 }, // Branch Code
                { wch: 25 }, // Account Name
                { wch: 18 }, // Account Number
                { wch: 10 }  // Status
            ];

            XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendor Import');

            // Generate and download file
            XLSX.writeFile(workbook, `Vendor_Import_Template_${new Date().toISOString().split('T')[0]}.xlsx`);

            console.log('[VendorService] Template downloaded successfully');
            return { success: true };
        } catch (error) {
            console.error('[VendorService] Error generating template:', error);
            return { success: false, error: error.message };
        }
    },

    // Parse Import File - REAL implementation with XLSX
    parseImportFile: async (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // Get first sheet
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];

                    // Convert to JSON array
                    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    console.log('[VendorService] Raw import data:', rawData);

                    // Find header row (look for "Vendor Name" in first column)
                    let headerRowIndex = -1;
                    for (let i = 0; i < Math.min(10, rawData.length); i++) {
                        if (rawData[i] && rawData[i][0] &&
                            rawData[i][0].toString().toLowerCase().includes('vendor name')) {
                            headerRowIndex = i;
                            break;
                        }
                    }

                    if (headerRowIndex === -1) {
                        resolve({
                            success: false,
                            error: 'Could not find header row. Make sure "Vendor Name" is in the first column.',
                            vendors: [],
                            summary: { totalRows: 0, validVendors: 0, errors: ['Header row not found'] }
                        });
                        return;
                    }

                    const vendors = [];
                    const errors = [];

                    // Parse data rows (after header)
                    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
                        const row = rawData[i];

                        // Skip empty rows
                        if (!row || !row[0] || row[0].toString().trim() === '') {
                            continue;
                        }

                        const vendorName = row[0]?.toString().trim() || '';
                        const email = row[1]?.toString().trim() || '';
                        const bankName = row[2]?.toString().trim() || '';
                        const branchCode = row[3]?.toString().trim() || '';
                        const accountName = row[4]?.toString().trim() || '';
                        const accountNumber = row[5]?.toString().trim() || '';
                        const status = row[6]?.toString().trim().toLowerCase() || 'active';

                        // Validation
                        const rowErrors = [];
                        if (!vendorName) rowErrors.push('Vendor name is required');
                        if (!bankName) rowErrors.push('Bank name is required');
                        if (!accountNumber) rowErrors.push('Account number is required');

                        if (rowErrors.length > 0) {
                            errors.push({
                                row: i + 1,
                                vendorName: vendorName || '(empty)',
                                errors: rowErrors
                            });
                            continue;
                        }

                        vendors.push({
                            name: vendorName,
                            email: email,
                            status: status === 'inactive' ? 'inactive' : 'active',
                            banking: {
                                bankName: bankName,
                                branchCode: branchCode,
                                accountName: accountName || vendorName,
                                accountNumber: accountNumber
                            }
                        });
                    }

                    console.log('[VendorService] Parsed vendors:', vendors.length);
                    console.log('[VendorService] Parse errors:', errors.length);

                    resolve({
                        success: true,
                        vendors: vendors,
                        summary: {
                            totalRows: rawData.length - headerRowIndex - 1,
                            validVendors: vendors.length,
                            invalidRows: errors.length,
                            errors: errors
                        }
                    });

                } catch (parseError) {
                    console.error('[VendorService] Parse error:', parseError);
                    resolve({
                        success: false,
                        error: `Failed to parse file: ${parseError.message}`,
                        vendors: [],
                        summary: { totalRows: 0, validVendors: 0, errors: [parseError.message] }
                    });
                }
            };

            reader.onerror = (error) => {
                console.error('[VendorService] File read error:', error);
                resolve({
                    success: false,
                    error: 'Failed to read file',
                    vendors: [],
                    summary: { totalRows: 0, validVendors: 0, errors: ['File read error'] }
                });
            };

            reader.readAsArrayBuffer(file);
        });
    },

    // Bulk import vendors to Firestore with duplicate detection
    importVendors: async (db, appId, vendors) => {
        try {
            console.log(`[VendorService] Importing ${vendors.length} vendors to Firestore...`);

            // Pre-fetch existing vendors for duplicate checking (more efficient than checking one-by-one)
            const existingVendors = await VendorService.getAllVendors(db, appId);
            const existingNamesSet = new Set(
                existingVendors.map(v => v.name?.trim().toLowerCase()).filter(Boolean)
            );
            console.log(`[VendorService] Found ${existingNamesSet.size} existing vendors for duplicate check`);

            const vendorsRef = collection(db, `artifacts/${appId}/public/data/vendors`);
            const results = {
                success: true,
                imported: 0,
                skipped: 0,   // Duplicates skipped
                failed: 0,
                errors: [],
                duplicates: []  // Track which vendors were skipped as duplicates
            };

            // Import each vendor individually for better error handling
            for (const vendor of vendors) {
                const vendorName = vendor.name?.trim();
                if (!vendorName) {
                    results.failed++;
                    results.errors.push({ vendor: '(empty name)', error: 'Vendor name is required' });
                    continue;
                }

                // Check for duplicate (case-insensitive)
                if (existingNamesSet.has(vendorName.toLowerCase())) {
                    console.log(`[VendorService] Skipping duplicate vendor: ${vendorName}`);
                    results.skipped++;
                    results.duplicates.push(vendorName);
                    continue;
                }

                try {
                    await addDoc(vendorsRef, {
                        ...vendor,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        importedAt: new Date().toISOString()
                    });
                    results.imported++;
                    // Add to set to prevent duplicates within same import batch
                    existingNamesSet.add(vendorName.toLowerCase());
                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        vendor: vendorName,
                        error: error.message
                    });
                }
            }

            console.log(`[VendorService] Import complete: ${results.imported} imported, ${results.skipped} skipped (duplicates), ${results.failed} failed`);
            return results;

        } catch (error) {
            console.error('[VendorService] Import error:', error);
            return {
                success: false,
                imported: 0,
                skipped: 0,
                failed: vendors.length,
                errors: [{ vendor: 'All', error: error.message }],
                duplicates: []
            };
        }
    },

    // Export all vendors to Excel
    exportVendors: async (db, appId) => {
        try {
            const vendors = await VendorService.getAllVendors(db, appId);

            if (vendors.length === 0) {
                return { success: false, error: 'No vendors to export' };
            }

            const workbook = XLSX.utils.book_new();

            // Prepare data
            const exportData = [
                ['VENDOR EXPORT'],
                [`Generated: ${new Date().toLocaleString()}`],
                [],
                ['Vendor Name', 'Contact Email', 'Bank Name', 'Branch Code', 'Account Name', 'Account Number', 'Status'],
                ...vendors.map(v => [
                    v.name || '',
                    v.email || '',
                    v.banking?.bankName || '',
                    v.banking?.branchCode || '',
                    v.banking?.accountName || '',
                    v.banking?.accountNumber || '',
                    v.status || 'active'
                ])
            ];

            const worksheet = XLSX.utils.aoa_to_sheet(exportData);

            // Set column widths
            worksheet['!cols'] = [
                { wch: 25 }, { wch: 25 }, { wch: 20 },
                { wch: 12 }, { wch: 25 }, { wch: 18 }, { wch: 10 }
            ];

            XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendors');

            XLSX.writeFile(workbook, `Vendors_Export_${new Date().toISOString().split('T')[0]}.xlsx`);

            return { success: true, count: vendors.length };
        } catch (error) {
            console.error('[VendorService] Export error:', error);
            return { success: false, error: error.message };
        }
    }
};
