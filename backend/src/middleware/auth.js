const supabase = require("../config/supabase");

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

        if (error || !user) {
            return res.status(403).json({
                error: "Invalid or expired token."
            });
        }

        // Make the Supabase user available to protected routes
        req.user = user;

        next();

    } catch (err) {
        console.error("Authentication error:", err);

        return res.status(403).json({
            error: "Invalid or expired token."
        });
    }
};