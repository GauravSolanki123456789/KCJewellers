/**
 * SMS Service for OTP delivery
 * 
 * MSG91 (default): Set MSG91_AUTH_KEY or SMS_PROVIDER_API_KEY in .env
 *   Optional: MSG91_SENDER_ID (default: KCJEWL)
 * 
 * Twilio: Set SMS_PROVIDER=twilio and TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 * 
 * Dev: If no key set, OTP is logged to console
 */

async function sendSMS(mobileNumber, otpCode) {
    const provider = process.env.SMS_PROVIDER || 'msg91';
    const mobile = String(mobileNumber || '').replace(/\D/g, '').slice(-10);
    if (mobile.length !== 10) {
        throw new Error('Invalid mobile number');
    }

    if (provider === 'msg91') {
        return sendViaMSG91(mobile, otpCode);
    }
    if (provider === 'twilio') {
        return sendViaTwilio(mobile, otpCode);
    }
    console.log(`[SMS] To: +91${mobile} | OTP: ${otpCode}`);
    return { success: true };
}

async function sendViaMSG91(mobile, otpCode) {
    const authKey = process.env.MSG91_AUTH_KEY || process.env.SMS_PROVIDER_API_KEY;
    if (!authKey) {
        console.log(`[SMS] MSG91_AUTH_KEY not set. OTP for +91${mobile}: ${otpCode}`);
        return { success: true };
    }
    const senderId = (process.env.MSG91_SENDER_ID || 'KCJEWL').slice(0, 6);
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
    } catch (err) {
        console.error('[SMS] MSG91 send error:', err.message);
        throw err;
    }
}

async function sendViaTwilio(mobile, otpCode) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
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
    } catch (err) {
        console.error('[SMS] Twilio send error:', err.message);
        throw err;
    }
}

module.exports = { sendSMS };
