-- Add table to securely store user-provided LLM API keys.

CREATE TABLE IF NOT EXISTS user_api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,   -- 1 key per provider logic or exactly one dict/text block, MVP we'll store multiple providers if needed
    provider VARCHAR(50) NOT NULL,     -- e.g., 'openai', 'anthropic', 'google'
    key_ciphertext BLOB NOT NULL,      -- AES-256-GCM encrypted key
    auth_tag BLOB NOT NULL,            -- AES GCM auth tag for integrity
    nonce BLOB NOT NULL,               -- Unique initialization vector per key
    last_four VARCHAR(4) NOT NULL,     -- Masked key for UI ('...xxxx')
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, provider)          -- 1 key per provider per user
);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_userid ON user_api_keys(user_id);
