/**
 * SMS Service for OTP delivery
 *
 * Config: admin app_settings (see services/smsConfig.js) with .env fallback.
 *
 * Providers: fast2sms | msg91 | twilio
 * Dev: If no key set, OTP is logged to console
 */

function resolveProvider(config) {
    let provider = String(config?.sms_provider || process.env.SMS_PROVIDER || '').trim().toLowerCase();
    const fastKey = config?.fast2sms_api_key || process.env.FAST2SMS_API_KEY;
    if (!provider && fastKey) provider = 'fast2sms';
    if (!provider) provider = 'msg91';
    return provider;
}

async function sendSMS(mobileNumber, otpCode, config = null) {
    const mobile = String(mobileNumber || '').replace(/\D/g, '').slice(-10);
    if (mobile.length !== 10) {
        throw new Error('Invalid mobile number');
    }

    const provider = resolveProvider(config);

    if (provider === 'fast2sms') {
        return sendViaFast2SMS(mobile, otpCode, config);
    }
    if (provider === 'msg91') {
        return sendViaMSG91(mobile, otpCode, config);
    }
    if (provider === 'twilio') {
        return sendViaTwilio(mobile, otpCode, config);
    }
    console.log(`[SMS] To: +91${mobile} | OTP: ${otpCode}`);
    return { success: true };
}

async function sendViaFast2SMS(mobile, otpCode, config) {
    const apiKey = config?.fast2sms_api_key || process.env.FAST2SMS_API_KEY;
    if (!apiKey) {
        console.log(`[SMS] FAST2SMS_API_KEY not set. OTP for +91${mobile}: ${otpCode}`);
        return { success: true };
    }

    try {
        const resp = await fetch('https://www.fast2sms.com/dev/bulkV2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                authorization: apiKey,
            },
            body: JSON.stringify({
                variables_values: otpCode,
                route: 'otp',
                numbers: mobile,
            }),
        });

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            const msg = data.message || (Array.isArray(data.message) ? data.message[0] : null) || `HTTP ${resp.status}`;
            console.error('[SMS] Fast2SMS HTTP error:', resp.status, msg);
            throw new Error(mapFast2SMSError(msg, resp.status));
        }

        if (data.return === false) {
            const msg = (Array.isArray(data.message) ? data.message.join(' ') : data.message) || 'SMS send failed';
            console.error('[SMS] Fast2SMS API error:', msg);
            throw new Error(mapFast2SMSError(msg));
        }

        return { success: true };
    } catch (error) {
        if (error.message && !error.message.includes('Invalid') && !error.message.includes('balance') && !error.message.includes('failed')) {
            console.error('[SMS] Fast2SMS send error:', error.message);
        }
        throw error;
    }
}

function mapFast2SMSError(msg, status) {
    const s = String(msg || '').toLowerCase();
    if (s.includes('balance') || s.includes('insufficient') || s.includes('low balance') || s.includes('wallet')) {
        return 'SMS service temporarily unavailable. Please try again later or contact support.';
    }
    if (s.includes('invalid') && (s.includes('number') || s.includes('mobile') || s.includes('recipient'))) {
        return 'Invalid mobile number. Please check and try again.';
    }
    if (s.includes('invalid') && (s.includes('credential') || s.includes('auth') || s.includes('key'))) {
        return 'SMS service configuration error. Please contact support.';
    }
    if (s.includes('dlt') || s.includes('template') || s.includes('sender')) {
        return 'SMS could not be sent. Please try again or use another sign-in method.';
    }
    if (status === 429) {
        return 'Too many attempts. Please try again after a few minutes.';
    }
    if (status >= 500) {
        return 'SMS service temporarily unavailable. Please try again later.';
    }
    return msg || 'Failed to send OTP. Please try again.';
}

async function sendViaMSG91(mobile, otpCode, config) {
    const authKey = config?.msg91_auth_key || process.env.MSG91_AUTH_KEY || process.env.SMS_PROVIDER_API_KEY;
    if (!authKey) {
        console.log(`[SMS] MSG91_AUTH_KEY not set. OTP for +91${mobile}: ${otpCode}`);
        return { success: true };
    }
    const senderId = String(config?.msg91_sender_id || process.env.MSG91_SENDER_ID || 'KCJEWL').slice(0, 6);
    const message = `Your KC Jewellers verification code is ${otpCode}. Valid for 10 minutes.`;
    const params = new URLSearchParams({
        authkey: authKey,
        mobile: `91${mobile}`,
        otp: otpCode,
        message,
        sender: senderId,
        otp_expiry: '10',
    });
    try {
        const resp = await fetch(`https://api.msg91.com/api/sendotp.php?${params}`);
        const text = await resp.text();
        if (!resp.ok) {
            console.error('[SMS] MSG91 error:', text);
            throw new Error('SMS send failed');
        }
        const data = text.startsWith('{') ? JSON.parse(text) : { type: text };
        if (data.type === 'error') {
            throw new Error(data.message || 'SMS send failed');
        }
        return { success: true };
    } catch (error) {
        console.error('[SMS] MSG91 send error:', error.message);
        throw error;
    }
}

async function sendViaTwilio(mobile, otpCode, config) {
    const accountSid = config?.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
    const authToken = config?.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
    const from = config?.twilio_phone_number || process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !from) {
        console.log(`[SMS] Twilio not configured. OTP for +91${mobile}: ${otpCode}`);
        return { success: true };
    }
    try {
        const twilio = require('twilio');
        const client = twilio(accountSid, authToken);
        await client.messages.create({
            body: `Your KC Jewellers verification code is ${otpCode}. Valid for 10 minutes.`,
            from,
            to: `+91${mobile}`,
        });
        return { success: true };
    } catch (error) {
        console.error('[SMS] Twilio send error:', error.message);
        throw error;
    }
}

module.exports = { sendSMS };
