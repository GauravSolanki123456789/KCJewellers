/**
 * TSPL Label Printer Module for TSC/Printronix Auto-ID Thermal Printers
 * Generates TSPL commands matching the exact layout from sample label
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

/**
 * Generate TSPL command string for a product label
 * Matches exact layout from sample label:
 * - QR code (top-left, stacked)
 * - Barcode number, Material, Company Code (right side)
 * - Style Code, Weight, Pcs (bottom section)
 * 
 * @param {Object} itemData - Product data
 * @param {string} itemData.barcodeNumber - Barcode number (e.g., "31954489")
 * @param {string} itemData.styleCode - Style code (e.g., "TURKEY PREMIUM CHAIN")
 * @param {string} itemData.weight - Weight in grams (e.g., "24.640")
 * @param {number} itemData.pcs - Number of pieces (e.g., 1)
 * @param {string} itemData.companyCode - Company code with MC/GM (e.g., "MY92575")
 * @param {string} itemData.material - Material type (e.g., "STERLING SILVER")
 * @returns {string} TSPL command string
 */
function generateTSPLLabel(itemData) {
    const {
        barcodeNumber = '',
        styleCode = '',
        weight = '0.000',
        pcs = 1,
        companyCode = 'MY925',
        material = 'STERLING SILVER'
    } = itemData;

    // Label dimensions (in dots, 203 DPI = 8 dots/mm)
    // Standard label: ~100mm x 50mm = 800 x 400 dots
    const LABEL_WIDTH = 800;  // 100mm
    const LABEL_HEIGHT = 400; // 50mm
    const DPI = 203; // Standard thermal printer DPI

    // Coordinates (in dots, from top-left origin, 203 DPI = 8 dots/mm)
    // Based on sample label layout analysis:
    // Label appears to be ~100mm x 50mm = 800 x 400 dots
    
    // QR Code positions (left side, stacked vertically)
    // QR codes are approximately 10mm x 10mm = 80 dots
    const QR1_X = 30;   // First QR code X position (left margin)
    const QR1_Y = 20;    // First QR code Y position (top margin)
    const QR_SIZE = 80;  // QR code size in dots (10mm)
    
    const QR2_X = 30;    // Second QR code X position (same X as first)
    const QR2_Y = 110;   // Second QR code Y position (90 dots below first QR + gap)
    
    // Text positions (right side of QR codes)
    // Text starts approximately 120mm from left edge = 120 dots
    const TEXT_START_X = 120; // Text starts after QR codes
    const TEXT_LINE1_Y = 25;  // Barcode number (aligned with first QR)
    const TEXT_LINE2_Y = 50;  // Material (below barcode number)
    const TEXT_LINE3_Y = 75;  // Company code (below material)
    
    // Bottom section positions (below QR codes and text)
    const BOTTOM_START_Y = 180; // Bottom section starts here
    const STYLE_CODE_Y = BOTTOM_START_Y;    // Style code (larger, bold)
    const WEIGHT_Y = BOTTOM_START_Y + 30;    // Weight (below style code)
    const PCS_Y = BOTTOM_START_Y + 55;       // Pcs (below weight)
    
    // Font sizes (TSPL font sizes: 1-8, where 1=smallest, 8=largest)
    // Font "3" = 24x24 dots, Font "4" = 32x32 dots
    const FONT_SMALL = 3;   // For regular text (barcode number, material, etc.)
    const FONT_MEDIUM = 4;  // For style code (larger)
    const FONT_LARGE = 5;   // For emphasis (if needed)

    // Build TSPL command string
    let tspl = '';
    
    // Initialize printer and set label size
    tspl += 'SIZE 100 mm, 50 mm\n';
    tspl += 'GAP 3 mm, 0 mm\n';
    tspl += 'DIRECTION 1\n';
    tspl += 'REFERENCE 0,0\n';
    tspl += 'OFFSET 0 mm\n';
    tspl += 'SET PEEL OFF\n';
    tspl += 'SET CUTTER OFF\n';
    tspl += 'SET PARTIAL_CUTTER OFF\n';
    tspl += 'SET TEAR ON\n';
    tspl += 'CLEAR\n';
    
    // QR Code 1 (top-left) - Contains barcode number
    // QRCODE x,y,ECC level,cell width,mode,rotation,mask,model,area,format,content
    tspl += `QRCODE ${QR1_X},${QR1_Y},M,4,A,0,M2,S3,"${barcodeNumber}"\n`;
    
    // QR Code 2 (below first QR) - Contains company code + weight
    const qr2Content = `${companyCode}|${weight}`;
    tspl += `QRCODE ${QR2_X},${QR2_Y},M,4,A,0,M2,S3,"${qr2Content}"\n`;
    
    // Text section (right side of QR codes)
    // TEXT x,y,"font",rotation,x-multiplication,y-multiplication,"content"
    // rotation: 0=normal, 90=rotated
    // x-multiplication, y-multiplication: 1=normal, 2=double size
    
    // Barcode number (line 1) - larger, bold
    tspl += `TEXT ${TEXT_START_X},${TEXT_LINE1_Y},"3",0,1,1,"${barcodeNumber}"\n`;
    
    // Material (line 2) - medium size
    tspl += `TEXT ${TEXT_START_X},${TEXT_LINE2_Y},"3",0,1,1,"${material}"\n`;
    
    // Company code (line 3) - medium size
    tspl += `TEXT ${TEXT_START_X},${TEXT_LINE3_Y},"3",0,1,1,"${companyCode}"\n`;
    
    // Bottom section (full width, left-aligned)
    // Style Code (larger font, bold appearance)
    tspl += `TEXT 30,${STYLE_CODE_Y},"4",0,1,1,"${styleCode}"\n`;
    
    // Weight (with "WT:" prefix)
    tspl += `TEXT 30,${WEIGHT_Y},"3",0,1,1,"WT:${weight}"\n`;
    
    // Pcs (with "Pcs:" prefix)
    tspl += `TEXT 30,${PCS_Y},"3",0,1,1,"Pcs:${pcs}"\n`;
    
    // Print command
    tspl += 'PRINT 1,1\n';
    
    return tspl;
}

/**
 * Send TSPL commands to printer via network (TCP/IP)
 * @param {string} tsplCommands - TSPL command string
 * @param {string} printerIP - Printer IP address (e.g., "192.168.1.100")
 * @param {number} printerPort - Printer port (default: 9100 for TSPL)
 * @returns {Promise<boolean>} Success status
 */
async function sendToNetworkPrinter(tsplCommands, printerIP, printerPort = 9100) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        let connected = false;
        
        client.setTimeout(5000); // 5 second timeout
        
        client.connect(printerPort, printerIP, () => {
            connected = true;
            console.log(`✅ Connected to printer at ${printerIP}:${printerPort}`);
            
            // Send TSPL commands
            client.write(tsplCommands, 'utf8', (err) => {
                if (err) {
                    console.error('❌ Error sending data:', err);
                    client.destroy();
                    reject(err);
                } else {
                    console.log('✅ TSPL commands sent successfully');
                    client.destroy();
                    resolve(true);
                }
            });
        });
        
        client.on('error', (err) => {
            console.error('❌ Printer connection error:', err);
            if (!connected) {
                reject(err);
            }
        });
        
        client.on('timeout', () => {
            console.error('❌ Printer connection timeout');
            client.destroy();
            reject(new Error('Connection timeout'));
        });
    });
}

/**
 * Send TSPL commands to printer via USB (using file write to printer port)
 * Windows: COM port (e.g., "COM3")
 * Linux: /dev/usb/lp0 or similar
 * @param {string} tsplCommands - TSPL command string
 * @param {string} printerPort - Printer port path
 * @returns {Promise<boolean>} Success status
 */
async function sendToUSBPrinter(tsplCommands, printerPort) {
    return new Promise((resolve, reject) => {
        // Try direct file write first (works on Linux/Mac)
        try {
            // For Windows COM ports, we'll need a different approach
            // For now, try direct write (may work on some systems)
            if (process.platform === 'win32') {
                // Windows: Try using raw printer port
                // Note: This requires proper permissions and printer setup
                const { exec } = require('child_process');
                // Write to file first, then copy to printer
                const tempFile = path.join(__dirname, '..', 'temp_label.txt');
                fs.writeFileSync(tempFile, tsplCommands, 'utf8');
                
                // Use copy command to send to printer (Windows)
                exec(`copy /B "${tempFile}" "${printerPort}"`, (error, stdout, stderr) => {
                    if (error) {
                        console.error('❌ Error sending to printer:', error);
                        reject(error);
                    } else {
                        console.log('✅ TSPL commands sent to USB printer');
                        // Clean up temp file
                        try { fs.unlinkSync(tempFile); } catch (e) {}
                        resolve(true);
                    }
                });
            } else {
                // Linux/Mac: Direct file write
                fs.writeFileSync(printerPort, tsplCommands, 'utf8');
                console.log(`✅ TSPL commands written to ${printerPort}`);
                resolve(true);
            }
        } catch (err) {
            console.error('❌ Error writing to printer:', err);
            reject(err);
        }
    });
}

/**
 * Print label for a single product
 * @param {Object} itemData - Product data
 * @param {Object} printerConfig - Printer configuration
 * @param {string} printerConfig.type - "network" or "usb"
 * @param {string} printerConfig.address - IP address (network) or port path (USB)
 * @param {number} printerConfig.port - Port number (network only, default: 9100)
 * @returns {Promise<boolean>} Success status
 */
async function printLabel(itemData, printerConfig) {
    try {
        // Generate TSPL commands
        const tsplCommands = generateTSPLLabel(itemData);
        
        // Send to printer based on type
        if (printerConfig.type === 'network') {
            return await sendToNetworkPrinter(
                tsplCommands,
                printerConfig.address,
                printerConfig.port || 9100
            );
        } else if (printerConfig.type === 'usb') {
            return await sendToUSBPrinter(tsplCommands, printerConfig.address);
        } else {
            throw new Error(`Unknown printer type: ${printerConfig.type}`);
        }
    } catch (error) {
        console.error('❌ Error printing label:', error);
        throw error;
    }
}

/**
 * Generate preview image of label (using canvas or similar)
 * This is a placeholder - actual implementation would use a canvas library
 * @param {Object} itemData - Product data
 * @returns {Promise<Buffer>} Image buffer
 */
async function generateLabelPreview(itemData) {
    // This would use a canvas library to render the label
    // For now, return a placeholder
    console.log('📷 Label preview generation not yet implemented');
    return null;
}

module.exports = {
    generateTSPLLabel,
    printLabel,
    sendToNetworkPrinter,
    sendToUSBPrinter,
    generateLabelPreview
};

