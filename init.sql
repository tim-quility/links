CREATE TABLE IF NOT EXISTS agents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subdomain VARCHAR(50) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    brand_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL,
    privacy_policy_url VARCHAR(255),
    about_me TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    avatar_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed Data for Testing
INSERT INTO agents (subdomain, first_name, last_name, brand_name, phone_number, email, privacy_policy_url, about_me, city, state, zip_code, avatar_url)
VALUES 
('jay-bloom', 'Jay', 'Bloom', 'Quility Switchboard Funnel', '(555) 123-4567', 'jay@links-insure.com', 'https://links-insure.com/privacy', 'Jay Bloom is a dedicated insurance professional with over 15 years of experience helping families secure their financial future. Specializing in life insurance and mortgage protection, Jay is committed to providing personalized service and finding the best coverage options for his clients.', 'Austin', 'TX', '78701', 'https://randomuser.me/api/portraits/men/32.jpg'),
('gavin-morel', 'Gavin', 'Morel', 'Quility Switchboard Funnel', '(555) 987-6543', 'gavin@links-insure.com', 'https://links-insure.com/privacy', 'Gavin Morel is passionate about making insurance simple and accessible. With a focus on education and transparency, he guides his clients through the complexities of insurance policies to ensure they have the protection they need.', 'Dallas', 'TX', '75201', 'https://randomuser.me/api/portraits/men/45.jpg');