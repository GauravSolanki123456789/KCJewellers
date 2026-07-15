/**
 * SMS Service for OTP delivery
 *
 * Config: admin app_settings (see services/smsConfig.js) with .env fallback.
 *
 * Providers: o3sms | fast2sms | msg91 | twilio
 * Dev: If no key set, OTP is logged to console
 */

function resolveProvider(config) {
    let provider = String(config?.sms_provider || process.env.SMS_PROVIDER || '').trim().toLowerCase();
    const o3Key = config?.o3sms_api_key || process.env.O3SMS_API_KEY || process.env.CO3SMS_API_KEY;
    const fastKey = config?.fast2sms_api_key || process.env.FAST2SMS_API_KEY;
    if (!provider && o3Key) provider = 'o3sms';
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

    if (provider === 'o3sms' || provider === 'co3sms' || provider === 'co3') {
        return sendViaO3SMS(mobile, otpCode, config);
    }
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

/** Co3SMS / O3SMS — api.co3.live HTTP API (key, sender, number, route, message). */
async function sendViaO3SMS(mobile, otpCode, config) {
    const apiKey =
        config?.o3sms_api_key || process.env.O3SMS_API_KEY || process.env.CO3SMS_API_KEY;
    if (!apiKey) {
        console.log(`[SMS] O3SMS API key not set. OTP for +91${mobile}: ${otpCode}`);
        return { success: true };
    }

    const sender = String(
        config?.o3sms_sender_id || process.env.O3SMS_SENDER_ID || process.env.CO3SMS_SENDER_ID || 'ALERTS',
    )
        .trim()
        .slice(0, 6);
    const route = String(config?.o3sms_route || process.env.O3SMS_ROUTE || process.env.CO3SMS_ROUTE || '2').trim();
    const templateId = String(
        config?.o3sms_dlt_template_id ||
            process.env.O3SMS_DLT_TEMPLATE_ID ||
            process.env.CO3SMS_DLT_TEMPLATE_ID ||
            '',
    ).trim();
    const template =
        config?.o3sms_message_template ||
        process.env.O3SMS_MESSAGE_TEMPLATE ||
        process.env.CO3SMS_MESSAGE_TEMPLATE ||
        'Your KC Jewellers verification code is {#var#}. Valid for 10 minutes.';
    const message = String(template)
        .replace(/\{#var#\}/gi, otpCode)
        .replace(/\{otp\}/gi, otpCode);

    const params = new URLSearchParams({
        key: apiKey,
        sender,
        number: `91${mobile}`,
        message,
        route,
    });
    if (templateId) {
        params.set('templateid', templateId);
        params.set('DLT_TE_ID', templateId);
        params.set('id', templateId);
    }

    const query = params.toString();
    const getUrl = `https://api.co3.live/api/sendsms?${query}`;
    const postUrl = 'https://api.co3.live/api/sendsms';

    try {
        let resp = await fetch(getUrl, { method: 'GET' });
        let text = String(await resp.text()).trim();

        if (!resp.ok || looksLikeO3SmsFailure(text)) {
            resp = await fetch(postUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: query,
            });
            text = String(await resp.text()).trim();
        }

        if (!resp.ok) {
            console.error('[SMS] O3SMS HTTP error:', resp.status, text);
            throw new Error(mapO3SMSError(text, resp.status));
        }

        if (looksLikeO3SmsFailure(text)) {
            console.error('[SMS] O3SMS API error:', text);
            throw new Error(mapO3SMSError(text));
        }

        return { success: true, response: text };
    } catch (error) {
        if (error.message && !error.message.includes('SMS')) {
            console.error('[SMS] O3SMS send error:', error.message);
        }
        throw error;
    }
}

function looksLikeO3SmsFailure(text) {
    const lower = String(text || '').toLowerCase();
    return (
        lower.includes('error') ||
        lower.includes('invalid') ||
        lower.includes('fail') ||
        lower.includes('insufficient') ||
        lower.includes('balance') ||
        lower.includes('rejected')
    );
}

function mapO3SMSError(msg, status) {
    const s = String(msg || '').toLowerCase();
    if (s.includes('balance') || s.includes('insufficient') || s.includes('credit')) {
        return 'SMS service temporarily unavailable. Please try again later or contact support.';
    }
    if (s.includes('invalid') && (s.includes('key') || s.includes('auth'))) {
        return 'SMS service configuration error. Please contact support.';
    }
    if (s.includes('sender') || s.includes('template') || s.includes('dlt')) {
        return 'SMS could not be sent. Check sender ID and DLT template in Admin → SMS settings.';
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
