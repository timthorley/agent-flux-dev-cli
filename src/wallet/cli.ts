import * as xe from '@edge/xe-utils'
import { Command, Option } from 'commander'
import { ask, askSecure } from '../input'
import { decryptFileWallet, defaultFile, readWallet, withFile } from './storage'
import { errorHandler, getOptions as getGlobalOptions } from '../edge/cli'
import { readFileSync, writeFileSync } from 'fs'

const createAction = (parent: Command, createCmd: Command) => async () => {
  const opts = {
    ...getGlobalOptions(parent),
    ...getWalletOption(parent),
    ...(() => {
      const {
        privateKeyFile,
        overwrite
      } = createCmd.opts<{
        privateKeyFile: string | undefined
        overwrite: boolean
      }>()
      return { privateKeyFile, overwrite }
    })(),
    ...getPassphraseOption(createCmd)
  }

  const { check, write } = withFile(opts.wallet)

  if (await check() && !opts.overwrite) {
    let confirm = ''
    const ynRegexp = /^[yn]$/
    while (confirm.length === 0) {
      const input = await ask('A wallet already exists. Overwrite? [yn] ')
      if (ynRegexp.test(input)) confirm = input
      else console.log('Please enter y or n.')
    }
    if (confirm === 'n') return
    console.log()
  }

  if (!opts.passphrase) {
    console.log('To ensure your wallet is secure it will be encrypted locally using a passphrase.')
    console.log('For more information, see https://wiki.edge.network/TODO')
    console.log()
    const passphrase = await askSecure('Please enter a passphrase: ')
    if (passphrase.length === 0) throw new Error('passphrase required')
    const confirmKey = await askSecure('Please confirm passphrase: ')
    if (confirmKey !== passphrase) throw new Error('passphrases do not match')
    opts.passphrase = passphrase
    console.log()
  }

  const wallet = xe.wallet.create()
  await write(wallet, opts.passphrase)
  console.log(`Wallet ${wallet.address} created.`)
  console.log()

  let nextStep = opts.privateKeyFile ? 'e' : ''
  if (nextStep.length === 0) {
    const ynRegexp = /^[ven]$/
    while (nextStep.length === 0) {
      const input = await ask('Would you like to (v)iew or (e)xport your private key? [ven] ')
      if (ynRegexp.test(input)) nextStep = input
      else console.log('Please enter v, e, or n.')
    }
    console.log()
  }

  if (nextStep === 'v') {
    console.log(`Private key: ${wallet.privateKey}`)
    console.log()
    console.log('Keep your private key safe!')
    return
  }
  else if (nextStep === 'n') return

  let pkFile = opts.privateKeyFile || ''
  if (pkFile.length === 0) {
    while (pkFile.length === 0) {
      const input = await ask('Enter filename to export private key to: ')
      if (input.length) pkFile = input
    }
    console.log()
  }
  try {
    writeFileSync(pkFile, wallet.privateKey)
    console.log(`Private key saved to ${pkFile}.`)
  }
  catch (err) {
    console.log('Failed to write to private key file. Displaying it instead...')
    console.log()
    console.log(`Private key: ${wallet.privateKey}`)
    console.log()
    throw err
  }
}

const createHelp = [
  '\n',
  'This command will create a new wallet.\n\n',
  'You will be asked to provide a passphrase to encrypt the wallet locally. ',
  'The passphrase is also required later to decrypt the wallet for certain actions, such as signing transactions.\n\n',
  'You will also be given the option to view or export the private key for the new wallet. ',
  'This should be copied to a secure location and kept secret.'
].join('')

const infoAction = (parent: Command, infoCmd: Command) => async () => {
  const opts = {
    ...getGlobalOptions(parent),
    ...getWalletOption(parent),
    ...getPassphraseOption(infoCmd)
  }

  const wallet = await readWallet(opts.wallet)
  console.log(`Wallet address: ${wallet.address}`)
  if (opts.passphrase) {
    try {
      const decrypted = decryptFileWallet(wallet, opts.passphrase)
      console.log(`Private key: ${decrypted.privateKey}`)
    }
    catch (err) {
      console.log(`Cannot display private key: ${(err as Error).message}`)
    }
  }
}

const infoHelp = [
  '\n',
  'This command displays information about your wallet.\n\n',
  'If a passphrase is provided, this command will also decrypt and display your private key.'
].join('')

const restoreAction = (parent: Command, restoreCmd: Command) => async () => {
  const opts = {
    ...getGlobalOptions(parent),
    ...getWalletOption(parent),
    ...(() => {
      const { overwrite } = restoreCmd.opts<{ overwrite: boolean }>()
      return { overwrite }
    })(),
    ...getPrivateKeyOption(restoreCmd),
    ...getPassphraseOption(restoreCmd)
  }

  const { check, write } = withFile(opts.wallet)

  if (await check() && !opts.overwrite) {
    let confirm = ''
    const ynRegexp = /^[yn]$/
    while (confirm.length === 0) {
      const input = await ask('A wallet already exists. Overwrite? [yn] ')
      if (ynRegexp.test(input)) confirm = input
      else console.log('Please enter y or n.')
    }
    if (confirm === 'n') return
    console.log()
  }

  if (!opts.privateKey) {
    const privateKey = await askSecure('Please enter a private key: ')
    if (privateKey.length === 0) throw new Error('private key required')
    opts.privateKey = privateKey
    console.log()
  }

  if (!opts.passphrase) {
    console.log('To ensure your wallet is secure it will be encrypted locally using a passphrase.')
    console.log('For more information, see https://wiki.edge.network/TODO')
    console.log()
    const passphrase = await askSecure('Please enter a passphrase: ')
    if (passphrase.length === 0) throw new Error('passphrase required')
    const confirmKey = await askSecure('Please confirm passphrase: ')
    if (confirmKey !== passphrase) throw new Error('passphrases do not match')
    opts.passphrase = passphrase
    console.log()
  }

  const wallet = xe.wallet.recover(opts.privateKey || '')
  await write(wallet, opts.passphrase)
  console.log(`Wallet ${wallet.address} restored.`)
}

const restoreHelp = [
  '\n',
  'This command will restore an existing wallet using a private key you already have.\n\n',
  'You will be asked to provide a passphrase to encrypt the wallet locally. ',
  'The passphrase is also required later to decrypt the wallet for certain actions, such as signing transactions.\n\n'
].join('')

export const addPassphraseOption = (cmd: Command): void =>
  [passphraseOption(), passphraseFileOption()].forEach(opt => cmd.addOption(opt))

export const addPrivateKeyOption = (cmd: Command): void =>
  [privateKeyOption(), privateKeyFileOption()].forEach(opt => cmd.addOption(opt))

export const getPassphraseOption = (cmd: Command): { passphrase?: string } => {
  const { passphrase, passphraseFile: file } = cmd.opts<Record<'passphrase' | 'passphraseFile', string|undefined>>()
  if (passphrase && passphrase.length) return { passphrase }
  // read secure value from file if set
  if (file !== undefined) {
    if (file.length === 0) throw new Error('no path to passphrase file')
    const data = readFileSync(file)
    return { passphrase: data.toString() }
  }
  return {}
}

export const getPrivateKeyOption = (cmd: Command): { privateKey?: string } => {
  const { privateKey, privateKeyFile: file } = cmd.opts<Record<'privateKey' | 'privateKeyFile', string|undefined>>()
  if (privateKey && privateKey.length) return { privateKey }
  // read secure value from file if set
  if (file !== undefined) {
    if (file.length === 0) throw new Error('no path to passphrase file')
    const data = readFileSync(file)
    return { privateKey: data.toString() }
  }
  return {}
}

export const getWalletOption = (parent: Command): { wallet: string } => {
  const { wallet } = parent.opts<{ wallet: string }>()
  if (wallet && wallet.length) return { wallet }
  return { wallet: defaultFile() }
}

const privateKeyOption = () => new Option('-k, --private-key <string>', 'wallet private key')
const privateKeyFileOption = () => new Option('-K, --private-key-file <path>', 'file containing wallet private key')

const passphraseOption = () => new Option('-p, --passphrase <string>', 'wallet passphrase')
const passphraseFileOption = () => new Option('-P, --passphrase-file <path>', 'file containing wallet passphrase')

export const withProgram = (parent: Command): void => {
  const walletCLI = new Command('wallet')
    .description('manage wallet')

  // edge wallet create
  const create = new Command('create')
    .description('create a new wallet')
    .addHelpText('after', createHelp)
    .option('-f, --overwrite', 'overwrite existing wallet if one exists')
    .addOption(privateKeyFileOption())
  addPassphraseOption(create)
  create.action(errorHandler(parent, createAction(parent, create)))

  const info = new Command('info')
    .description('display wallet info')
    .addHelpText('after', infoHelp)
  addPassphraseOption(info)
  info.action(errorHandler(parent, infoAction(parent, info)))

  // edge wallet restore
  const restore = new Command('restore')
    .description('restore a wallet')
    .addHelpText('after', restoreHelp)
    .option('-f, --overwrite', 'overwrite existing wallet if one exists')
  addPrivateKeyOption(restore)
  addPassphraseOption(restore)
  restore.action(errorHandler(parent, restoreAction(parent, restore)))

  walletCLI
    .addCommand(create)
    .addCommand(info)
    .addCommand(restore)

  parent
    .option('-w, --wallet <file>', 'wallet file path')
    .addCommand(walletCLI)
}
