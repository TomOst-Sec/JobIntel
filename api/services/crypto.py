import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag
import secrets

# In production, this MUST be loaded from a secure KMS or strict env var.
# For local MVP development, we will mock it if not present.
_mock_key = b'nexus_mock_master_key_32_bytes!!' 
MASTER_KEY = os.environ.get("NEXUS_MASTER_KEY_B64")

def _get_master_key() -> bytes:
    if MASTER_KEY:
        import base64
        return base64.b64decode(MASTER_KEY)
    return _mock_key

def encrypt_api_key(plaintext_key: str) -> tuple[bytes, bytes, bytes]:
    """
    Encrypts a plaintext API key using AES-256-GCM.
    Returns: (ciphertext, auth_tag, nonce)
    """
    key = _get_master_key()
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)  # 96-bit nonce recommended for GCM
    
    # encrypt format: ciphertext + tag
    encrypted_data = aesgcm.encrypt(nonce, plaintext_key.encode('utf-8'), None)
    
    # split ciphertext and auth tag
    ciphertext = encrypted_data[:-16]
    auth_tag = encrypted_data[-16:]
    
    return ciphertext, auth_tag, nonce

def decrypt_api_key(ciphertext: bytes, auth_tag: bytes, nonce: bytes) -> str:
    """
    Decrypts an API key securely using AES-256-GCM.
    """
    key = _get_master_key()
    aesgcm = AESGCM(key)
    
    try:
        data = ciphertext + auth_tag
        plaintext = aesgcm.decrypt(nonce, data, None)
        return plaintext.decode('utf-8')
    except InvalidTag:
        raise ValueError("Corrupted or tampered API key detected during decryption.")
