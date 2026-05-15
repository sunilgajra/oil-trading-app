-- SQL Schema for Murji Oil Dashboard (Trade & Logistics)
-- Created: May 2026

-- 1. Main Trades Table
CREATE TABLE trades (
    trade_id INT PRIMARY KEY AUTO_INCREMENT,
    trade_type ENUM('Buy', 'Sell') NOT NULL,
    trade_mode ENUM('local', 'import', 'hs_sale') NOT NULL,
    product_name VARCHAR(100),
    counterparty VARCHAR(255),
    quantity DECIMAL(15, 3),
    unit VARCHAR(20),
    density DECIMAL(5, 4),
    price_per_unit DECIMAL(15, 2),
    trade_date DATE,
    payment_terms VARCHAR(100),
    total_inr_value DECIMAL(15, 2),
    bl_no VARCHAR(100),
    vessel_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Trade Expenses (Logistics & Charges)
CREATE TABLE trade_expenses (
    expense_id INT PRIMARY KEY AUTO_INCREMENT,
    trade_id INT,
    expense_type VARCHAR(100), -- e.g. Line Charges, CFS, Customs
    amount DECIMAL(15, 2),
    payment_status ENUM('Paid', 'Pending') DEFAULT 'Pending',
    payment_ref VARCHAR(255),
    bill_doc_path TEXT, -- Link to the uploaded bill file
    FOREIGN KEY (trade_id) REFERENCES trades(trade_id) ON DELETE CASCADE
);

-- Example Query to calculate Total Landed Cost for a Deal
SELECT 
    t.trade_id,
    t.product_name,
    t.total_inr_value AS basic_cost,
    SUM(e.amount) AS logistics_cost,
    (t.total_inr_value + IFNULL(SUM(e.amount), 0)) AS total_landed_cost
FROM trades t
LEFT JOIN trade_expenses e ON t.trade_id = e.trade_id
WHERE t.trade_id = 1
GROUP BY t.trade_id;
