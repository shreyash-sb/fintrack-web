// PROTECT ROUTE
if (!localStorage.getItem("isLoggedIn")) {
    window.location.href = "index.html";
}

const user = JSON.parse(localStorage.getItem("user"));
document.getElementById("username").textContent = user.name;

const form = document.getElementById("transactionForm");
const list = document.getElementById("transactionList");
const filter = document.getElementById("filter");

let transactions = JSON.parse(localStorage.getItem("transactions")) || [];

// UPDATE UI
function updateUI() {
    list.innerHTML = "";

    let income = 0;
    let expense = 0;

    const filterType = filter.value;

    transactions.forEach((t, index) => {

        if (filterType !== "all" && t.type !== filterType) return;

        const li = document.createElement("li");
        li.classList.add(t.type === "income" ? "income-item" : "expense-item");

        li.innerHTML = `
            <span>${t.title} - ₹${t.amount}</span>
            <button class="delete-btn" onclick="deleteTransaction(${index})">X</button>
        `;

        list.appendChild(li);

        if (t.type === "income") income += t.amount;
        else expense += t.amount;
    });

    document.getElementById("income").textContent = "₹" + income;
    document.getElementById("expense").textContent = "₹" + expense;
    document.getElementById("balance").textContent = "₹" + (income - expense);

    localStorage.setItem("transactions", JSON.stringify(transactions));
}

// ADD TRANSACTION
form.addEventListener("submit", function (e) {
    e.preventDefault();

    const title = document.getElementById("title").value.trim();
    const amount = +document.getElementById("amount").value;
    const type = document.getElementById("type").value;

    if (!title || amount <= 0) {
        alert("Enter valid data");
        return;
    }

    transactions.push({ title, amount, type });

    updateUI();
    form.reset();
});

// DELETE
function deleteTransaction(index) {
    transactions.splice(index, 1);
    updateUI();
}

// FILTER
filter.addEventListener("change", updateUI);

// CLEAR ALL
function clearAll() {
    if (confirm("Delete all transactions?")) {
        transactions = [];
        updateUI();
    }
}

// INITIAL LOAD
updateUI();