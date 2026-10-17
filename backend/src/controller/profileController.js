const UserProfile = require("../models/UserProfile");
const OtpCode = require("../models/OtpCode");
const { sendOtpSms } = require("../services/smsService");

const VERIFY_PHONE_PURPOSE = "verify_phone";
const MAX_NAME_LENGTH = 100;

// The Personal Information screen's view of the public.users row.
const toProfileResponse = (profile) => ({
  fullName: profile.full_name,
  email: profile.email,
  phone: profile.phone ?? null,
  phoneVerified: profile.phone_verified === true,
  createdAt: profile.created_at ?? null,
});

exports.getProfile = async (req, res) => {
  try {
    const profile = await UserProfile.getById(req.user.userId);
    return res.status(200).json(toProfileResponse(profile));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

// Body may hold fullName, phone, or both. A blank phone removes it.
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, phone: rawPhone } = req.body || {};
    const updates = {};

    if (fullName !== undefined) {
      const name = String(fullName).trim();
      if (!name) {
        return res.status(400).json({ error: "Full name cannot be empty" });
      }
      if (name.length > MAX_NAME_LENGTH) {
        return res.status(400).json({ error: "Full name is too long" });
      }
      updates.full_name = name;
    }

    if (rawPhone !== undefined) {
      const phone = UserProfile.normalisePhone(String(rawPhone ?? "").trim());

      if (phone && !UserProfile.isValidPhone(phone)) {
        return res.status(400).json({ error: "Invalid phone number" });
      }

      const current = await UserProfile.getById(req.user.userId);
      if (phone !== (current.phone ?? null)) {
        if (phone) {
          const owner = await UserProfile.getByPhone(phone);
          if (owner && owner.user_id !== req.user.userId) {
            return res.status(400).json({ error: "Phone number already registered" });
          }
        }
        // A new number has to be proven again before SMS login trusts it.
        updates.phone = phone;
        updates.phone_verified = false;
        await OtpCode.invalidateActive(req.user.userId, VERIFY_PHONE_PURPOSE);
      }
    }

    if (Object.keys(updates).length === 0) {
      const profile = await UserProfile.getById(req.user.userId);
      return res.status(200).json(toProfileResponse(profile));
    }

    const profile = await UserProfile.updateById(req.user.userId, updates);
    return res.status(200).json(toProfileResponse(profile));
  } catch (error) {
    // Two accounts saving the same number at once: the UNIQUE column wins.
    if (error?.code === "23505") {
      return res.status(400).json({ error: "Phone number already registered" });
    }
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

// Sends an SMS code to the phone on file so the user can prove it is theirs.
exports.sendPhoneCode = async (req, res) => {
  try {
    const profile = await UserProfile.getById(req.user.userId);

    if (!profile.phone) {
      return res.status(400).json({ error: "No phone number on file" });
    }
    if (profile.phone_verified) {
      return res.status(400).json({ error: "Phone number is already verified" });
    }

    const { inCooldown, retryAfter } = await OtpCode.isInCooldown(
      profile.user_id,
      VERIFY_PHONE_PURPOSE
    );
    if (inCooldown) {
      return res.status(429).json({
        error: `Please wait ${retryAfter}s before requesting another code`,
        retryAfter,
      });
    }
    if (await OtpCode.isOverDailyLimit(profile.user_id)) {
      return res.status(429).json({ error: "Too many codes today, please try again tomorrow" });
    }

    const { code } = await OtpCode.create(profile.user_id, VERIFY_PHONE_PURPOSE, profile.phone);
    await sendOtpSms(profile.phone, code, VERIFY_PHONE_PURPOSE);

    return res.status(200).json({
      message: "Code sent",
      expiresInMinutes: OtpCode.OTP_TTL_MINUTES,
      resendAfter: OtpCode.RESEND_COOLDOWN_SECONDS,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

exports.verifyPhoneCode = async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) {
      return res.status(400).json({ error: "Code is required" });
    }

    const result = await OtpCode.verify(req.user.userId, VERIFY_PHONE_PURPOSE, code);

    if (!result.valid) {
      switch (result.reason) {
        case "expired":
          return res.status(400).json({ error: "Code expired, please request a new one" });
        case "too_many_attempts":
          return res.status(429).json({ error: "Too many incorrect attempts, please request a new code" });
        case "no_active_code":
          return res.status(400).json({ error: "No active code, please request one" });
        default:
          return res.status(401).json({ error: "Incorrect code", attemptsLeft: result.attemptsLeft });
      }
    }

    // The code must have gone to the number still on file; if the phone
    // changed after it was sent, it proves nothing about the new one.
    const profile = await UserProfile.getById(req.user.userId);
    if (result.destination !== profile.phone) {
      return res.status(400).json({ error: "Phone number changed, please request a new code" });
    }

    await UserProfile.markPhoneVerified(req.user.userId);
    return res.status(200).json(toProfileResponse({ ...profile, phone_verified: true }));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};
