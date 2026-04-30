// SIGNUP
const signupForm = document.getElementById("signupForm");

if (signupForm) {
    signupForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value.trim();
        const errorMsg = document.getElementById("errorMsg");

        if (!name || !email || !password) {
            errorMsg.textContent = "All fields are required!";
            return;
        }

        if (password.length < 6) {
            errorMsg.textContent = "Password must be at least 6 characters!";
            return;
        }

        const user = { name, email, password };

        localStorage.setItem("user", JSON.stringify(user));

        alert("Signup successful!");
        window.location.href = "index.html";
    });
}


// LOGIN
const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
        e.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value.trim();
        const errorMsg = document.getElementById("errorMsg");

        const storedUser = JSON.parse(localStorage.getItem("user"));

        if (!storedUser) {
            errorMsg.textContent = "No user found. Please signup first.";
            return;
        }

        if (email === storedUser.email && password === storedUser.password) {
            localStorage.setItem("isLoggedIn", "true");
            window.location.href = "dashboard.html";
        } else {
            errorMsg.textContent = "Invalid email or password!";
        }
    });
}


// LOGOUT
function logout() {
    localStorage.removeItem("isLoggedIn");
    window.location.href = "index.html";
}