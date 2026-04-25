require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MySQL (XAMPP)
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'firebomba_db'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection FAILED:', err);
    } else {
        console.log('Connected to FireBomba Database!');
    }
});

// --- SIGN UP ROUTE ---
app.post('/api/signup', async (req, res) => {
    const { fullName, email, password } = req.body;

    try {
        // Check if user already exists
        const checkSql = 'SELECT * FROM users WHERE email = ?';
        db.query(checkSql, [email], async (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (results.length > 0) return res.status(400).json({ error: 'Email already registered' });

            // Hash the password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert new user
            const insertSql = 'INSERT INTO users (full_name, email, password) VALUES (?, ?, ?)';
            db.query(insertSql, [fullName, email, hashedPassword], (err, result) => {
                if (err) return res.status(500).json({ error: 'Error creating user' });
                res.status(201).json({ message: 'Account created successfully!', userId: result.insertId });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// --- LOGIN ROUTE ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0) return res.status(400).json({ error: 'User not found' });

        const user = results[0];
        
        // Compare password with hashed password
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return res.status(400).json({ error: 'Incorrect password' });

        res.json({ 
            message: 'Login successful!', 
            user: { id: user.id, fullName: user.full_name, email: user.email } 
        });
    });
});

// --- LOGOUT ROUTE ---
app.post('/api/logout', (req, res) => {
    res.json({ message: 'Logged out successfully' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});