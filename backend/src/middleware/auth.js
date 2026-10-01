const supabase = require("../config/supabase");
const UserProfile = require("../models/UserProfile");
const Room = require("../models/Room");

module.exports = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            error: "Access denied. No token provided."
        });
    }

    try {
        const {
            data: { user },
            error
        } = await supabase.auth.getUser(token);

        // Must be 401, not 403: the app only tries a silent refresh on a 401,
        // so a 403 here dropped the user once the 1-hour access token expired
        // instead of quietly renewing it.
        if (error || !user) {
            return res.status(401).json({
                error: "Invalid or expired token."
            });
        }

        // The app data (bilik, rooms) hangs off the public.users profile, not
        // the auth user, so it is looked up on every request.
        const profile = await UserProfile.getById(user.id);
        if (!profile) {
            return res.status(403).json({
                error: "User profile not found."
            });
        }

        // A user owns a bilik; "their room" is the ?roomId the app asked for
        // when it belongs to that bilik, otherwise the bilik's first room.
        const bilikRoomIds = await Room.getRoomIdsByBilik(profile.bilik_id);
        const requestedRoomId = Number(req.query.roomId);

        req.user = {
            ...user,
            userId: user.id,
            email: user.email,
            fullName: profile.full_name,
            role: profile.role,
            bilikId: profile.bilik_id,
            roomId: bilikRoomIds.includes(requestedRoomId)
                ? requestedRoomId
                : bilikRoomIds[0] ?? null,
        };

        next();

    } catch (err) {
        console.error("Authentication error:", err);

        return res.status(403).json({
            error: "Invalid or expired token."
        });
    }
};