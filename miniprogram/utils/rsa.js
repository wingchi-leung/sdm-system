const JSEncrypt = require('./vendor/jsencrypt.min.js');

function normalizePublicKey(publicKey) {
  let key = publicKey == null ? '' : String(publicKey).trim();
  if (!key) return '';
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, '\n').trim();
}

function encryptWithPublicKey(plainText, publicKey) {
  const text = plainText == null ? '' : String(plainText);
  const key = normalizePublicKey(publicKey);
  if (!text) {
    throw new Error('待加密内容不能为空');
  }
  if (!key) {
    throw new Error('加密公钥不能为空');
  }
  const encryptor = new JSEncrypt();
  encryptor.setPublicKey(key);
  const encrypted = encryptor.encrypt(text);
  if (!encrypted) {
    throw new Error('RSA 加密失败，请检查公钥配置');
  }
  return encrypted;
}

module.exports = {
  encryptWithPublicKey,
};
