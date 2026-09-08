/**
 * Fintrack - Authentication & User Profile Management
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Theme
    const savedTheme = localStorage.getItem('fintrack_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Password Visibility Toggle Handler
    const toggleBtns = document.querySelectorAll('.password-toggle');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.parentElement.querySelector('input');
            if (input.type === 'password') {
                input.type = 'text';
                btn.classList.remove('fa-eye');
                btn.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                btn.classList.remove('fa-eye-slash');
                btn.classList.add('fa-eye');
            }
        });
    });

    // SIGNUP HANDLER
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();
            const currency = document.getElementById('currency') ? document.getElementById('currency').value : 'INR';
            const errorBanner = document.getElementById('errorBanner');
            const errorText = document.getElementById('errorText');

            const showError = (msg) => {
                if (errorBanner && errorText) {
                    errorText.textContent = msg;
                    errorBanner.style.display = 'flex';
                }
            };

            if (!name || !email || !password) {
                showError('Please fill in all required fields.');
                return;
            }

            if (password.length < 6) {
                showError('Password must be at least 6 characters.');
                return;
            }

            const users = window.StorageManager ? window.StorageManager.getUsers() : [];
            const existing = users.find(u => u.email.toLowerCase() === email.toLowerCase());

            if (existing) {
                showError('An account with this email already exists.');
                return;
            }

            const newUser = {
                id: 'usr_' + Date.now(),
                name,
                email,
                password,
                currency,
                createdAt: new Date().toISOString()
            };

            users.push(newUser);
            if (window.StorageManager) {
                window.StorageManager.saveUsers(users);
                window.StorageManager.setCurrentUser(newUser);
            }

            // Redirect to dashboard
            window.location.href = 'dashboard.html';
        });
    }

    // LOGIN HANDLER
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();
            const errorBanner = document.getElementById('errorBanner');
            const errorText = document.getElementById('errorText');

            const showError = (msg) => {
                if (errorBanner && errorText) {
                    errorText.textContent = msg;
                    errorBanner.style.display = 'flex';
                }
            };

            if (!email || !password) {
                showError('Please enter your email and password.');
                return;
            }

            const users = window.StorageManager ? window.StorageManager.getUsers() : [];
            const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

            if (!user) {
                showError('No account found with this email. Please sign up.');
                return;
            }

            if (user.password !== password) {
                showError('Incorrect password. Please try again.');
                return;
            }

            if (window.StorageManager) {
                window.StorageManager.setCurrentUser(user);
            }
            window.location.href = 'dashboard.html';
        });
    }
});

// LOGOUT
function logout() {
    if (window.StorageManager) {
        window.StorageManager.clearCurrentUser();
    }
    window.location.href = 'index.html';
}

window.logout = logout;