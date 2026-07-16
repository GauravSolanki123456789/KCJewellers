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

/** Approved DLT example — must match Co3 / DLT portal character-for-character (except variable values). */
const O3_DLT_PLACEHOLDER_RE = /\{#(?:var|alp)#\}/gi;

/** Fill Co3SMS DLT templates — supports {#var#}, {#alp#}, {otp}. Order: name → OTP → validity. */
function fillO3OtpMessage(template, otpCode, customerLabel = 'Customer') {
    const fillers = [String(customerLabel || 'Customer').trim() || 'Customer', String(otpCode), '10 minutes'];
    let i = 0;
    let msg = String(template || '');
    msg = msg.replace(O3_DLT_PLACEHOLDER_RE, () => fillers[Math.min(i++, fillers.length - 1)] ?? otpCode);
    msg = msg.replace(/\{otp\}/gi, otpCode);
    return msg.replace(/\s+/g, ' ').trim();
}

/** Extract ordered DLT variable slots from a registered template. */
function o3TemplateVariableCount(template) {
    const matches = String(template || '').match(O3_DLT_PLACEHOLDER_RE);
    return matches ? matches.length : 0;
}

const O3_ERROR_CODES = {
    101: 'Invalid SMS API key. Check your Co3SMS key in SMS settings.',
    102: 'Invalid sender ID. Use your approved DLT header (e.g. BMSSIL).',
    105: 'SMS message body is empty. Check your DLT message template.',
    108: 'Wrong SMS route for this template. Try route 2 (Transactional) or contact Co3.',
    110: 'DLT template ID is required or invalid. Paste the exact template ID from Co3.',
};

function mapO3ErrorCode(code) {
    return O3_ERROR_CODES[code] || `SMS gateway error (code ${code}). Contact your SMS provider.`;
}

/** Co3 returns HTTP 200 for both success (long message id) and errors (101–199). */
function parseO3SmsResponse(text) {
    const t = String(text || '').trim();
    if (!t) {
        return { ok: false, error: 'Empty response from SMS gateway' };
    }
    const lower = t.toLowerCase();
    if (lower.includes('error') || lower.includes('invalid') || lower.includes('fail') || lower.includes('rejected')) {
        return { ok: false, error: t };
    }
    if (/^\d{1,3}$/.test(t)) {
        const code = parseInt(t, 10);
        if (code >= 101 && code <= 199) {
            return { ok: false, error: mapO3ErrorCode(code) };
        }
    }
    if (/^\d{4,}$/.test(t)) {
        return { ok: true, messageId: t };
    }
    if (lower.includes('success') || lower.startsWith('ok')) {
        return { ok: true, messageId: t };
    }
    if (t.length < 24) {
        return { ok: false, error: t || 'SMS gateway rejected the message' };
    }
    return { ok: true, messageId: t };
}

/** Co3SMS / O3SMS — api.co3.live (smsapi + sendsms). */
async function sendViaO3SMS(mobile, otpCode, config) {
    const result = await sendViaO3SMSDetailed(mobile, otpCode, config);
    return { success: true, response: result.gatewayResponse, messageId: result.messageId };
}

async function sendViaO3SMSDetailed(mobile, otpCode, config) {
    const apiKey =
        config?.o3sms_api_key || process.env.O3SMS_API_KEY || process.env.CO3SMS_API_KEY;
    const template =
        config?.o3sms_message_template ||
        process.env.O3SMS_MESSAGE_TEMPLATE ||
        process.env.CO3SMS_MESSAGE_TEMPLATE ||
        'Dear {#var#} Your OTP for login is {#var#} It is valid for {#var#} B.N.MARLECHA AND SONS';
    if (!apiKey) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Co3SMS API key not configured. Save your API key in SMS settings.');
        }
        console.log(`[SMS] O3SMS API key not set. OTP for +91${mobile}: ${otpCode}`);
        return {
            success: true,
            devMode: true,
            provider: 'o3sms',
            filledMessage: fillO3OtpMessage(template, otpCode),
            gatewayResponse: 'dev-mode-no-api-key',
        };
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
    const message = fillO3OtpMessage(template, otpCode);
    const varCount = o3TemplateVariableCount(template);
    const varValues = ['Customer', String(otpCode), '10 minutes'].slice(0, Math.max(varCount, 3));

    const buildSmsApiParams = (smsBody, extra = {}) => {
        const p = new URLSearchParams({
            key: apiKey,
            route,
            sender,
            number: mobile,
            sms: smsBody,
            ...extra,
        });
        if (templateId) {
            p.set('templateid', templateId);
        }
        return p;
    };

    const attempts = [
        { label: 'filled-dlt', params: buildSmsApiParams(message) },
        { label: 'template-vars', params: buildSmsApiParams(template, { variables: varValues.join('|') }) },
        {
            label: 'template-var123',
            params: buildSmsApiParams(template, {
                var1: varValues[0] || '',
                var2: varValues[1] || String(otpCode),
                var3: varValues[2] || '10 minutes',
            }),
        },
        { label: 'raw-template', params: buildSmsApiParams(template) },
    ];

    let lastText = '';
    let lastStatus = 0;
    let lastError = '';
    for (const attempt of attempts) {
        for (const method of ['GET', 'POST']) {
            try {
                const url =
                    method === 'GET'
                        ? `https://api.co3.live/api/smsapi?${attempt.params.toString()}`
                        : 'https://api.co3.live/api/smsapi';
                const resp = await fetch(url, {
                    method,
                    headers: method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
                    body: method === 'POST' ? attempt.params.toString() : undefined,
                });
                const text = String(await resp.text()).trim();
                lastText = text;
                lastStatus = resp.status;
                const parsed = parseO3SmsResponse(text);
                if (resp.ok && parsed.ok) {
                    console.log(
                        `[SMS] O3SMS sent (${attempt.label}/${method}) id=${parsed.messageId} to +91${mobile} body="${message.slice(0, 80)}…"`,
                    );
                    return {
                        success: true,
                        provider: 'o3sms',
                        messageId: parsed.messageId,
                        gatewayResponse: text,
                        filledMessage: message,
                        attempt: `${attempt.label}/${method}`,
                    };
                }
                lastError = parsed.error || text;
            } catch (err) {
                lastText = err.message || String(err);
                lastError = lastText;
            }
        }
    }

    console.error('[SMS] O3SMS API error:', lastStatus, lastText, 'filled=', message);
    const err = new Error(mapO3SMSError(lastError || lastText, lastStatus));
    err.gatewayResponse = lastText;
    err.filledMessage = message;
    throw err;
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

async function sendSMSDetailed(mobileNumber, otpCode, config = null) {
    const mobile = String(mobileNumber || '').replace(/\D/g, '').slice(-10);
    if (mobile.length !== 10) {
        throw new Error('Invalid mobile number');
    }

    const provider = resolveProvider(config);

    if (provider === 'o3sms' || provider === 'co3sms' || provider === 'co3') {
        return sendViaO3SMSDetailed(mobile, otpCode, config);
    }
    await sendSMS(mobile, otpCode, config);
    return { success: true, provider, gatewayResponse: 'sent', filledMessage: null };
}

module.exports = { sendSMS, sendSMSDetailed, fillO3OtpMessage };
