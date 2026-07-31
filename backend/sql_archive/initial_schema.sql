CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
SELECT * FROM users;
CREATE TABLE call_history (
    id SERIAL PRIMARY KEY,
    caller_id INTEGER REFERENCES users(id),
    receiver_id INTEGER REFERENCES users(id),
    duration INTEGER,
    status VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE detection_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    prediction VARCHAR(50) NOT NULL,
    confidence_score DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);