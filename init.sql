CREATE DATABASE IF NOT EXISTS links_compliance;
USE links_compliance;

CREATE TABLE IF NOT EXISTS agents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subdomain VARCHAR(50) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    brand_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL,
    privacy_policy_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Data for Testing
INSERT INTO agents (subdomain, first_name, last_name, brand_name, phone_number, email, privacy_policy_url)
VALUES 
('jay-bloom', 'Jay', 'Bloom', 'Links Insure', '(555) 123-4567', 'jay@links-insure.com', 'https://links-insure.com/privacy'),
('gavin-morel', 'Gavin', 'Morel', 'Links Insure', '(555) 987-6543', 'gavin@links-insure.com', 'https://links-insure.com/privacy');