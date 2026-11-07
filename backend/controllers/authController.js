const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../database/db');

const generateToken = (u) => jwt.sign({ id: u.id, email: u.email, name: u.name }, process.env.JWT_SECRET || 'fintrack_jwt_super_secret_key_2026_finance_secure', { expiresIn: '7d' });

// User Registration
async function register(req, res, next) {
    try {
        const { name, email, password, currency = 'INR', theme = 'light' } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: 'Name, email, and password required.' });
        if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });

        const normalizedEmail = email.trim().toLowerCase();
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
        if (existing.length) return res.status(409).json({ success: false, message: 'Account already exists with this email.' });

        const passwordHash = await bcrypt.hash(password, 10);
        const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await pool.query('INSERT INTO users (id, name, email, password_hash, currency, theme) VALUES (?, ?, ?, ?, ?, ?)', [userId, name.trim(), normalizedEmail, passwordHash, currency, theme]);

        const user = { id: userId, name: name.trim(), email: normalizedEmail, currency, theme, avatar_url: null };
        res.status(201).json({ success: true, message: 'User registered.', user, token: generateToken(user) });
    } catch (error) { next(error); }
}

// User Login
async function login(req, res, next) {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required.' });

        const [rows] = await pool.query('SELECT id, name, email, password_hash, currency, theme, avatar_url FROM users WHERE email = ?', [email.trim().toLowerCase()]);
        if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const user = { id: rows[0].id, name: rows[0].name, email: rows[0].email, currency: rows[0].currency, theme: rows[0].theme, avatar_url: rows[0].avatar_url };
        res.json({ success: true, message: 'Logged in.', user, token: generateToken(user) });
    } catch (error) { next(error); }
}

// Get Current User Profile
async function getMe(req, res, next) {
    try {
        const [rows] = await pool.query('SELECT id, name, email, currency, theme, avatar_url, created_at FROM users WHERE id = ?', [req.user.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, user: rows[0] });
    } catch (error) { next(error); }
}

// Update User Preferences
async function updateProfile(req, res, next) {
    try {
        const { name, currency, theme, avatar_url, avatarUrl } = req.body;
        const updates = [], values = [];
        if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
        if (currency !== undefined) { updates.push('currency = ?'); values.push(currency); }
        if (theme !== undefined) { updates.push('theme = ?'); values.push(theme); }
        const newAvatar = avatarUrl !== undefined ? avatarUrl : avatar_url;
        if (newAvatar !== undefined) { updates.push('avatar_url = ?'); values.push(newAvatar); }

        if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update.' });

        values.push(req.user.id);
        await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
        const [rows] = await pool.query('SELECT id, name, email, currency, theme, avatar_url FROM users WHERE id = ?', [req.user.id]);
        res.json({ success: true, message: 'Profile updated.', user: rows[0] });
    } catch (error) { next(error); }
}

// Change User Password
async function changePassword(req, res, next) {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
        }

        const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });

        const isMatch = await bcrypt.compare(currentPassword, rows[0].password_hash);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

        res.json({ success: true, message: 'Password updated successfully.' });
    } catch (error) { next(error); }
}

// Permanently Delete Account
async function deleteAccount(req, res, next) {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ success: false, message: 'Password is required to confirm account deletion.' });
        }

        const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'User not found.' });

        const isMatch = await bcrypt.compare(password, rows[0].password_hash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Incorrect password. Account deletion aborted.' });
        }

        // Delete user (foreign keys automatically CASCADE delete transactions, budgets, goals)
        await pool.query('DELETE FROM users WHERE id = ?', [req.user.id]);

        res.json({ success: true, message: 'Account and all associated records permanently deleted.' });
    } catch (error) { next(error); }
}

module.exports = { register, login, getMe, updateProfile, changePassword, deleteAccount };
