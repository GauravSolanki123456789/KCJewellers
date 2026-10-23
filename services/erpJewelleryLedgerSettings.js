async function loadJewelleryLedgerMetalEnabled(query, userId) {
    try {
        const rows = await query(`SELECT settings FROM reseller_erp_settings WHERE reseller_user_id = $1`, [userId]);
        let settings = rows[0]?.settings ?? {};
        if (typeof settings === 'string') {
            try {
                settings = JSON.parse(settings);
            } catch {
                settings = {};
            }
        }
        return settings.jewelleryLedgerMetalEnabled === true;
    } catch {
        return false;
    }
}

module.exports = { loadJewelleryLedgerMetalEnabled };
