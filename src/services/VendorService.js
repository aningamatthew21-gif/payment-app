import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

// Mock Data for initial development/fallback
const MOCK_VENDORS = [
    {
        id: 'ven_001',
        name: 'ACME CORP LTD',
        email: 'finance@acmecorp.com',
        status: 'active',
        banking: {
            bankName: 'GT Bank',
            branchCode: '01',
            accountName: 'ACME CORP OPERATIONS',
            accountNumber: '144100223399'
        }
    },
    {
        id: 'ven_002',
        name: 'DHL LOGISTICS GHANA',
        email: 'billing@dhl.com.gh',
        status: 'active',
        banking: {
            bankName: 'Ecobank',
            branchCode: '05',
            accountName: 'DHL LOGISTICS',
            accountNumber: '0022114455'
        }
    },
    {
        id: 'ven_003',
        name: 'Z-CONSTRUCTION WORKS',
        email: 'accounts@z-const.com',
        status: 'inactive',
        banking: {
            bankName: 'Fidelity Bank',
            branchCode: '12',
            accountName: 'Z-CONSTRUCTION',
            accountNumber: '8885552211'
        }
    },
    {
        id: 'ven_004',
        name: 'OFFICE SUPPLIES DEPOT',
        email: 'sales@officesupplies.com',
        status: 'active',
        banking: {
            bankName: 'Stanbic Bank',
            branchCode: '03',
            accountName: 'OFFICE SUPPLIES DEPOT LTD',
            accountNumber: '9011223344'
        }
    },
    {
        id: 'ven_005',
        name: 'CLEANING SERVICES PRO',
        email: 'info@cleanpro.com',
        status: 'active',
        banking: {
            bankName: 'Absa Bank',
            branchCode: '08',
            accountName: 'CLEANING SERVICES PRO',
            accountNumber: '1122334455'
        }
    }
];

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

            // If no vendors in Firestore yet, return empty array (not mock data)
            return vendors;
        } catch (error) {
            console.error("[VendorService] Error fetching vendors:", error);
            return [];
        }
    },

    // Add a new vendor to Firestore Vendor Management collection
    addVendor: async (db, appId, vendorData) => {
        try {
            console.log("[VendorService] Adding vendor to Firestore:", vendorData);
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

    // Generate Excel Template
    generateExcelTemplate: () => {
        const headers = ['Vendor Name', 'Contact Email', 'Bank Name', 'Branch Code', 'Account Name', 'Account Number', 'Status'];
        const csvContent = "data:text/csv;charset=utf-8," + headers.join(",");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "vendor_import_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // Parse Import File (Mock)
    parseImportFile: async (file) => {
        return new Promise((resolve) => {
            console.log("Parsing file:", file.name);
            // Mock parsed data
            setTimeout(() => {
                resolve([
                    {
                        name: 'NEW IMPORTED VENDOR',
                        email: 'new@vendor.com',
                        status: 'active',
                        banking: {
                            bankName: 'CalBank',
                            branchCode: '20',
                            accountName: 'NEW IMPORTED VENDOR',
                            accountNumber: '1234567890'
                        }
                    }
                ]);
            }, 1000);
        });
    }
};
