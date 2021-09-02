import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

export type EncryptedPair = {
  iv: string
  content: string
}

export type EncryptedWallet = Pick<Wallet, 'address'> & {
  key: {
    public: EncryptedPair
    private: EncryptedPair
  }
}

export type Wallet = {
  address: string
  key: {
    public: string
    private: string
  }
}

const decrypt = (encPair: EncryptedPair, secretKey: string): string => {
  const decipher = createDecipheriv('aes-256-ctr', resizeKey(secretKey), Buffer.from(encPair.iv, 'hex'))
  const value = Buffer.concat([decipher.update(Buffer.from(encPair.content, 'hex')), decipher.final()])
  return value.toString()
}

const encrypt = (value: string, secretKey: string): EncryptedPair => {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-ctr', resizeKey(secretKey), iv)
  const encValue = Buffer.concat([cipher.update(value), cipher.final()])
  return {
    iv: iv.toString('hex'),
    content: encValue.toString('hex')
  }
}

// right-pad secret key input to ensure compatibility with cipher
// TODO discuss, improve approach
const resizeKey = (secretKey: string): string => {
  if (secretKey.length >= 32) return secretKey
  let resized = secretKey
  for (let i = secretKey.length; i < 32; i++) resized += '0'
  return resized
}

export const decryptWallet = (encWallet: EncryptedWallet, secretKey: string): Wallet => ({
  ...encWallet,
  key: {
    public: decrypt(encWallet.key.public, secretKey),
    private: decrypt(encWallet.key.private, secretKey)
  }
})

export const encryptWallet = (wallet: Wallet, secretKey: string): EncryptedWallet => ({
  ...wallet,
  key: {
    public: encrypt(wallet.key.public, secretKey),
    private: encrypt(wallet.key.public, secretKey)
  }
})
