const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');

exports.signup = async (req, res) => {
    const { fullName, email, password } = req.body;

    try {
        const checkSql = 'SELECT * FROM users WHERE email = ?';
        db.query(checkSql, [email], async (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (results.length > 0) return res.status(400).json({ error: 'Email already registered' });

            const hashedPassword = await bcrypt.hash(password, 10);

            const insertSql = 'INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)';
            db.query(insertSql, [fullName, email, hashedPassword], (err, result) => {
                if (err) return res.status(500).json({ error: 'Error creating user' });
                res.status(201).json({ message: 'Account created successfully!', userId: result.insertId });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

exports.login = (req, res) => {
    const { email, password } = req.body;

    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0) return res.status(400).json({ error: 'User not found' });

        const user = results[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).json({ error: 'Incorrect password' });

        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        res.json({
            message: 'Login successful!',
            token,
            user: { id: user.id, fullName: user.full_name, email: user.email }
        });
    });
};

exports.logout = (req, res) => {
    res.json({ message: 'Logged out successfully' });
};
