
"use strict";

const express = require("express");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);

// --------------------------------------------------
// PROJECT PATHS
// Supports server.js in the root or project folder.
// --------------------------------------------------

const ROOT_DIR = __dirname;

const PROJECT_DIR = fs.existsSync(
    path.join(ROOT_DIR, "templates", "index.html")
)
    ? ROOT_DIR
    : path.join(ROOT_DIR, "VehicleRentalSystem");

const STATIC_DIR = path.join(PROJECT_DIR, "static");
const TEMPLATES_DIR = path.join(PROJECT_DIR, "templates");
const INDEX_FILE = path.join(TEMPLATES_DIR, "index.html");

// Load .env from the root or the project folder.
const ENV_FILE = fs.existsSync(path.join(ROOT_DIR, ".env"))
    ? path.join(ROOT_DIR, ".env")
    : path.join(PROJECT_DIR, ".env");

dotenv.config({ path: ENV_FILE });

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// --------------------------------------------------
// STATIC FILES
// --------------------------------------------------

app.use("/static", express.static(STATIC_DIR, {
    fallthrough: true,
    index: false,
    maxAge: 0
}));

// --------------------------------------------------
// MYSQL CONNECTION
// --------------------------------------------------

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5051),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --------------------------------------------------
// HOME PAGE
// --------------------------------------------------

app.get("/", (req, res) => {
    if (!fs.existsSync(INDEX_FILE)) {
        return res.status(500).send(
            "FleetFlow: index.html not found. Check templates/index.html."
        );
    }

    res.sendFile(INDEX_FILE);
});

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/api/health", (req, res) => {
    res.json({
        status: "running",
        application: "FleetFlow",
        backend: "Node.js"
    });
});

// --------------------------------------------------
// DATABASE HEALTH CHECK
// --------------------------------------------------

app.get("/api/db-health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            status: "connected",
            database: process.env.DB_NAME
        });
    } catch (err) {
        console.error("Database health error:", err.message);

        res.status(500).json({
            error: "Database connection failed"
        });
    }
});

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

app.get("/api/dashboard", async (req, res) => {
    try {
        const [[vehicles]] = await pool.query(
            "SELECT COUNT(*) AS total FROM vehicle"
        );

        const [[customers]] = await pool.query(
            "SELECT COUNT(*) AS total FROM customer"
        );

        const [[rentals]] = await pool.query(
            "SELECT COUNT(*) AS total FROM rental"
        );

        const [[revenue]] = await pool.query(
            "SELECT COALESCE(SUM(Total_Amount), 0) AS revenue FROM rental"
        );

        res.json({
            total_vehicles: Number(vehicles.total),
            total_customers: Number(customers.total),
            total_rentals: Number(rentals.total),
            total_revenue: Number(revenue.revenue)
        });
    } catch (err) {
        console.error("Dashboard SQL error:", err.message);

        res.status(500).json({
            error: "Unable to load dashboard. Check the database schema."
        });
    }
});

// --------------------------------------------------
// VEHICLES
// --------------------------------------------------

app.get("/api/vehicles", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                Vehicle_ID,
                Registration_No,
                Vehicle_Name,
                Vehicle_Type,
                Rental_Rate,
                Fuel_Type,
                Status
            FROM vehicle
            ORDER BY Vehicle_ID
        `);

        res.json(rows);
    } catch (err) {
        console.error("Vehicles SQL error:", err.message);

        res.status(500).json({
            error: "Unable to fetch vehicles. Check vehicle table columns."
        });
    }
});

// --------------------------------------------------
// CUSTOMERS
// --------------------------------------------------

app.get("/api/customers", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                Customer_ID,
                Name AS Customer_Name,
                Phone,
                Email,
                Address
            FROM customer
            ORDER BY Customer_ID
        `);

        res.json(rows);
    } catch (err) {
        console.error("Customers SQL error:", err.message);

        res.status(500).json({
            error: "Unable to fetch customers. Check customer table columns."
        });
    }
});

// --------------------------------------------------
// RENTALS
// --------------------------------------------------

app.get("/api/rentals", async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT
                r.Rental_ID,
                c.Name AS Customer_Name,
                v.Vehicle_Name,
                r.Start_Date,
                r.End_Date,
                r.Total_Amount,
                r.Rental_Status
            FROM rental AS r
            JOIN customer AS c
                ON r.Customer_ID = c.Customer_ID
            JOIN vehicle AS v
                ON r.Vehicle_ID = v.Vehicle_ID
            ORDER BY r.Rental_ID
        `);

        res.json(rows);
    } catch (err) {
        console.error("Rentals SQL error:", err.message);

        res.status(500).json({
            error: "Unable to fetch rentals. Check rental table columns."
        });
    }
});

// --------------------------------------------------
// STATIC FILE FALLBACK
// Makes missing CSS/JS files easier to diagnose.
// --------------------------------------------------

app.use("/static", (req, res) => {
    res.status(404).send(
        "Static file not found: " + req.path
    );
});

// --------------------------------------------------
// UNKNOWN API ROUTES
// --------------------------------------------------

app.use("/api", (req, res) => {
    res.status(404).json({
        error: "API route not found",
        path: req.originalUrl
    });
});

// --------------------------------------------------
// UNKNOWN ROUTES
// --------------------------------------------------

app.use((req, res) => {
    res.status(404).send("FleetFlow: page not found.");
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log("==================================");
    console.log("FleetFlow server started");
    console.log("Port:", PORT);
    console.log("Project directory:", PROJECT_DIR);
    console.log("Environment file:", ENV_FILE);
    console.log("HTML exists:", fs.existsSync(INDEX_FILE));
    console.log(
        "CSS exists:",
        fs.existsSync(path.join(STATIC_DIR, "style.css"))
    );
    console.log(
        "JavaScript exists:",
        fs.existsSync(path.join(STATIC_DIR, "script.js"))
    );
    console.log("==================================");
});

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error(
            `Port ${PORT} is already in use. Stop the existing server before restarting.`
        );
    } else {
        console.error("Server error:", err.message);
    }
});

// --------------------------------------------------
// GRACEFUL SHUTDOWN
// --------------------------------------------------

let shuttingDown = false;

async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log("Shutting down FleetFlow...");

    server.close(async () => {
        try {
            await pool.end();
            console.log("Database pool closed.");
        } catch (err) {
            console.error("Database shutdown error:", err.message);
        }

        process.exit(0);
    });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
