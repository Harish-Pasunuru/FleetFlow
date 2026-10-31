
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();

    const refreshButton = document.getElementById("refresh-btn");

    if (refreshButton) {
        refreshButton.addEventListener("click", () => {
            refreshCurrentSection();
        });
    }

    checkConnection();
});

// Keep track of the selected page
let currentSection = "dashboard";

// ========================================
// API
// ========================================

async function fetchData(url) {
    const response = await fetch(url, {
        headers: { Accept: "application/json" }
    });

    if (!response.ok) {
        let message = `Request failed: HTTP ${response.status}`;

        try {
            const data = await response.json();
            if (data.error) message = data.error;
        } catch (_) {}

        throw new Error(message);
    }

    return response.json();
}

// ========================================
// SAFE DISPLAY HELPERS
// ========================================

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function displayValue(value) {
    return value === null || value === undefined || value === ""
        ? "—"
        : escapeHTML(value);
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value ?? "—");
}

function formatCurrency(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) return "₹0.00";

    return amount.toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDate(value) {
    if (!value) return "—";

    // Avoid date shifts for MySQL DATE values such as YYYY-MM-DD.
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
        return `${match[3]}/${match[2]}/${match[1]}`;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return escapeHTML(value);
    }

    return escapeHTML(date.toLocaleDateString("en-IN"));
}

// ========================================
// NOTICES AND TABLE STATES
// ========================================

function showNotice(message, success = false) {
    const notice = document.getElementById("notice");
    if (!notice) return;

    notice.textContent = message;
    notice.className = success ? "notice success" : "notice";
    notice.hidden = false;
}

function hideNotice() {
    const notice = document.getElementById("notice");

    if (notice) {
        notice.hidden = true;
        notice.textContent = "";
    }
}

function setTableMessage(id, columns, message) {
    const table = document.getElementById(id);
    if (!table) return;

    table.innerHTML = `
        <tr>
            <td colspan="${columns}" class="empty">
                ${escapeHTML(message)}
            </td>
        </tr>
    `;
}

function setConnectionStatus(connected) {
    setText(
        "connection-status",
        connected ? "Server connected" : "Connection unavailable"
    );

    const dot = document.querySelector(".status-dot");

    if (dot) {
        dot.style.backgroundColor = connected ? "#10b981" : "#ef4444";
    }
}

async function checkConnection() {
    try {
        await fetchData("api/health");
        setConnectionStatus(true);
    } catch (error) {
        setConnectionStatus(false);
        console.error("Connection check failed:", error);
    }
}

// ========================================
// NAVIGATION
// ========================================

function setupNavigation() {
    document.querySelectorAll(".nav-link").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();

            const section = link.dataset.section;

            if (section) showSection(section);
        });
    });

    document.querySelectorAll("[data-go]").forEach(button => {
        button.addEventListener("click", () => {
            showSection(button.dataset.go);
        });
    });

    const hash = window.location.hash.slice(1);
    const validSections = ["dashboard", "vehicles", "customers", "rentals"];

    showSection(validSections.includes(hash) ? hash : "dashboard", false);

    window.addEventListener("hashchange", () => {
        const section = window.location.hash.slice(1);

        if (validSections.includes(section)) {
            showSection(section, false);
        }
    });
}

function showSection(section, updateHash = true) {
    const titles = {
        dashboard: "Dashboard Overview",
        vehicles: "Vehicle Inventory",
        customers: "Customer Directory",
        rentals: "Rental Management"
    };

    if (!Object.prototype.hasOwnProperty.call(titles, section)) {
        section = "dashboard";
    }

    currentSection = section;

    document.querySelectorAll(".page-section").forEach(element => {
        element.hidden = true;
    });

    const sectionElement = document.getElementById(`${section}-section`);

    if (sectionElement) sectionElement.hidden = false;

    document.querySelectorAll(".nav-link").forEach(link => {
        const active = link.dataset.section === section;

        link.classList.toggle("active", active);

        if (active) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    });

    setText("page-title", titles[section]);

    if (updateHash && window.location.hash !== `#${section}`) {
        history.replaceState(null, "", `#${section}`);
    }

    refreshCurrentSection();
}

function refreshCurrentSection() {
    hideNotice();

    if (currentSection === "dashboard") return loadDashboard();
    if (currentSection === "vehicles") return loadVehicles();
    if (currentSection === "customers") return loadCustomers();
    if (currentSection === "rentals") return loadRentals();
}

// ========================================
// DASHBOARD
// ========================================

async function loadDashboard() {
    const button = document.getElementById("refresh-btn");

    if (button) {
        button.disabled = true;
        button.textContent = "Loading...";
    }

    try {
        const [dashboard, rentals] = await Promise.all([
            fetchData("api/dashboard"),
            fetchData("api/rentals")
        ]);

        setConnectionStatus(true);

        setText("total-vehicles", dashboard.total_vehicles ?? 0);
        setText("total-customers", dashboard.total_customers ?? 0);
        setText("total-rentals", dashboard.total_rentals ?? 0);
        setText(
            "total-revenue",
            formatCurrency(dashboard.total_revenue ?? 0)
        );

        if (!Array.isArray(rentals)) {
            throw new Error("The rentals API did not return a list.");
        }

        const recent = [...rentals]
            .sort((a, b) => Number(b.Rental_ID) - Number(a.Rental_ID))
            .slice(0, 5);

        renderRentals("recent-rentals", recent);

        setText(
            "last-updated",
            "Updated " + new Date().toLocaleTimeString("en-IN")
        );
    } catch (error) {
        console.error("Dashboard error:", error);

        showNotice("Unable to load dashboard: " + error.message);
        setConnectionStatus(false);

        setText("total-vehicles", "—");
        setText("total-customers", "—");
        setText("total-rentals", "—");
        setText("total-revenue", "—");

        setTableMessage("recent-rentals", 7, "Unable to load rentals.");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "↻ Refresh data";
        }
    }
}

// ========================================
// VEHICLES
// ========================================

async function loadVehicles() {
    setTableMessage("vehicles-table", 7, "Loading vehicles...");

    try {
        const vehicles = await fetchData("api/vehicles");

        if (!Array.isArray(vehicles)) {
            throw new Error("Invalid vehicle response.");
        }

        const table = document.getElementById("vehicles-table");
        if (!table) return;

        if (vehicles.length === 0) {
            setTableMessage("vehicles-table", 7, "No vehicles found.");
            return;
        }

        table.innerHTML = vehicles.map(vehicle => `
            <tr>
                <td>${displayValue(vehicle.Vehicle_ID)}</td>
                <td>${displayValue(vehicle.Registration_No)}</td>
                <td>${displayValue(vehicle.Vehicle_Name)}</td>
                <td>${displayValue(vehicle.Vehicle_Type)}</td>
                <td>${escapeHTML(formatCurrency(vehicle.Rental_Rate))}</td>
                <td>${displayValue(vehicle.Fuel_Type)}</td>
                <td><span class="status-badge">${displayValue(vehicle.Status)}</span></td>
            </tr>
        `).join("");
    } catch (error) {
        console.error("Vehicles error:", error);
        setTableMessage("vehicles-table", 7, "Unable to load vehicles.");
        showNotice("Vehicle error: " + error.message);
    }
}

// ========================================
// CUSTOMERS
// ========================================

async function loadCustomers() {
    setTableMessage("customers-table", 5, "Loading customers...");

    try {
        const customers = await fetchData("api/customers")
        if (!Array.isArray(customers)) {
            throw new Error("Invalid customer response.");
        }

        const table = document.getElementById("customers-table");
        if (!table) return;

        if (customers.length === 0) {
            setTableMessage("customers-table", 5, "No customers found.");
            return;
        }

        table.innerHTML = customers.map(customer => `
            <tr>
                <td>${displayValue(customer.Customer_ID)}</td>
                <td>${displayValue(customer.Customer_Name ?? customer.Name)}</td>
                <td>${displayValue(customer.Phone)}</td>
                <td>${displayValue(customer.Email)}</td>
                <td>${displayValue(customer.Address)}</td>
            </tr>
        `).join("");
    } catch (error) {
        console.error("Customers error:", error);
        setTableMessage("customers-table", 5, "Unable to load customers.");
        showNotice("Customer error: " + error.message);
    }
}

// ========================================
// RENTALS
// ========================================

async function loadRentals() {
    setTableMessage("rentals-table", 7, "Loading rentals...");

    try {
        const rentals = await fetchData("api/rentals");

        if (!Array.isArray(rentals)) {
            throw new Error("Invalid rental response.");
        }

        renderRentals("rentals-table", rentals);
    } catch (error) {
        console.error("Rentals error:", error);
        setTableMessage("rentals-table", 7, "Unable to load rentals.");
        showNotice("Rental error: " + error.message);
    }
}

function renderRentals(tableId, rentals) {
    const table = document.getElementById(tableId);
    if (!table) return;

    if (!Array.isArray(rentals) || rentals.length === 0) {
        setTableMessage(tableId, 7, "No rental records found.");
        return;
    }

    table.innerHTML = rentals.map(rental => `
        <tr>
            <td>${displayValue(rental.Rental_ID)}</td>
            <td>${displayValue(rental.Customer_Name ?? rental.Name)}</td>
            <td>${displayValue(rental.Vehicle_Name)}</td>
            <td>${formatDate(rental.Start_Date)}</td>
            <td>${formatDate(rental.End_Date)}</td>
            <td>${escapeHTML(formatCurrency(rental.Total_Amount))}</td>
            <td><span class="status-badge">${displayValue(rental.Rental_Status ?? rental.Status)}</span></td>
        </tr>
    `).join("");
}
