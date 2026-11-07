/**
 * Fintrack - Authentication Controller (API with Local Storage Fallback)
 * Handles dedicated login.html and signup.html pages, and landing page state
 */
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const banner = document.getElementById('errorBanner');
    const tabLogin = document.getElementById('tabLoginBtn');
    const tabSignup = document.getElementById('tabSignupBtn');

    // Optional Tab Switching (if ever used in a combined card)
    const switchAuthTab = (mode) => {
        if (banner) banner.classList.remove('visible');
        if (mode === 'signup') {
            tabSignup?.classList.add('active');
            tabLogin?.classList.remove('active');
            signupForm?.classList.remove('d-none');
            loginForm?.classList.add('d-none');
        } else {
            tabLogin?.classList.add('active');
            tabSignup?.classList.remove('active');
            loginForm?.classList.remove('d-none');
            signupForm?.classList.add('d-none');
        }
    };

    tabLogin?.addEventListener('click', () => switchAuthTab('login'));
    tabSignup?.addEventListener('click', () => switchAuthTab('signup'));

    // Check active user session
    const currentUser = window.StorageManager?.getCurrentUser();

    // On Landing Page (index.html): customize action buttons if user is already logged in
    const landingNav = document.getElementById('landingNavActions');
    const heroCtaGroup = document.getElementById('heroCtaGroup');
    if (currentUser) {
        if (landingNav) {
            landingNav.innerHTML = `<a href="dashboard.html" class="btn btn-primary btn-sm"><i class="fa-solid fa-gauge"></i> Open Dashboard (${currentUser.name || 'Account'})</a>`;
        }
        if (heroCtaGroup) {
            const getStartedBtn = heroCtaGroup.querySelector('#heroGetStartedBtn');
            if (getStartedBtn) {
                getStartedBtn.href = 'dashboard.html';
                getStartedBtn.innerHTML = '<i class="fa-solid fa-gauge"></i> Go to Dashboard';
            }
        }
    }

    // On login.html or signup.html: display active session notification banner
    const loggedInBanner = document.getElementById('alreadyLoggedInBanner');
    if (loggedInBanner && currentUser) {
        loggedInBanner.innerHTML = `<i class="fa-solid fa-circle-info text-primary"></i> <span>Signed in as <strong>${currentUser.email}</strong>. <a href="dashboard.html">Open Dashboard</a> or proceed below to switch accounts.</span>`;
        loggedInBanner.classList.remove('d-none');
    }

    // Password Visibility Toggle
    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.parentElement.querySelector('input');
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.classList.toggle('fa-eye', !isPassword);
            btn.classList.toggle('fa-eye-slash', isPassword);
        });
    });

    const showError = (msg) => {
        const text = document.getElementById('errorText');
        if (banner && text) {
            text.textContent = msg;
            banner.classList.add('visible');
        }
    };

    // SIGNUP FORM SUBMISSION (signup.html)
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = (document.getElementById('signupName') || document.getElementById('name'))?.value.trim();
            const email = (document.getElementById('signupEmail') || document.getElementById('email'))?.value.trim();
            const password = (document.getElementById('signupPassword') || document.getElementById('password'))?.value.trim();
            const currency = (document.getElementById('signupCurrency') || document.getElementById('currency'))?.value || 'INR';
            const btn = document.getElementById('signupSubmitBtn') || signupForm.querySelector('button[type="submit"]');

            if (!name || !email || !password) return showError('Please fill in all required fields.');
            if (password.length < 6) return showError('Password must be at least 6 characters.');

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';
            }

            try {
                if (window.ApiService) {
                    const res = await window.ApiService.auth.register({ name, email, password, currency });
                    if (res?.success && res.token) {
                        window.ApiService.setToken(res.token);
                        window.StorageManager?.setCurrentUser(res.user);
                        return window.location.href = 'dashboard.html';
                    }
                }
            } catch (err) {
                if (!err.message.includes('fetch')) {
                    showError(err.message);
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Free Account';
                    }
                    return;
                }
            }

            // Local storage fallback
            const users = window.StorageManager?.getUsers() || [];
            if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
                showError('An account with this email already exists.');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Free Account';
                }
                return;
            }
            const newUser = { id: `usr_${Date.now()}`, name, email, password, currency, createdAt: new Date().toISOString() };
            users.push(newUser);
            window.StorageManager?.saveUsers(users);
            window.StorageManager?.setCurrentUser(newUser);
            window.location.href = 'dashboard.html';
        });
    }

    // LOGIN FORM SUBMISSION (login.html)
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email')?.value.trim();
            const password = document.getElementById('password')?.value.trim();
            const btn = document.getElementById('loginSubmitBtn') || loginForm.querySelector('button[type="submit"]');

            if (!email || !password) return showError('Please enter your email and password.');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';
            }

            try {
                if (window.ApiService) {
                    const res = await window.ApiService.auth.login({ email, password });
                    if (res?.success && res.token) {
                        window.ApiService.setToken(res.token);
                        window.StorageManager?.setCurrentUser(res.user);
                        return window.location.href = 'dashboard.html';
                    }
                }
            } catch (err) {
                if (!err.message.includes('fetch')) {
                    showError(err.message);
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In to Dashboard';
                    }
                    return;
                }
            }

            // Local storage fallback
            const user = (window.StorageManager?.getUsers() || []).find(u => u.email.toLowerCase() === email.toLowerCase());
            if (!user) {
                showError('No account found with this email. Please create an account.');
            } else if (user.password !== password) {
                showError('Incorrect password. Please try again.');
            } else {
                window.StorageManager?.setCurrentUser(user);
                return window.location.href = 'dashboard.html';
            }
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In to Dashboard';
            }
        });
    }
});
