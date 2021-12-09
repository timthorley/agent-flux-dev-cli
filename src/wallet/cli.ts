// Copyright (C) 2021 Edge Network Technologies Limited
// Use of this source code is governed by a GNU GPL-style license
// that can be found in the LICENSE.md file. All rights reserved.

import { checkVersionHandler } from '../update/cli'
import { errorHandler } from '../edge/cli'
import { formatXE } from '../transaction/xe'
import { withFile } from './storage'
import { wallet as xeWallet } from '@edge/xe-utils'
import { Command, Option } from 'commander'
import { CommandContext, Context, Network } from '..'
import { ask, askSecure } from '../input'
import { readFileSync, unlink, writeFileSync } from 'fs'

export type PassphraseOption = {
  passphrase?: string
}

export type PrivateKeyOption = {
  privateKey?: string
}

export type WalletOption = {
  wallet: string
}

const balanceAction = ({ logger, xe, ...ctx }: Context) => async () => {
  const log = logger()

  const opts = getWalletOption(ctx.parent, ctx.network)
  log.debug('options', opts)

  const address = await withFile(opts.wallet).address()

  const { balance } = await xe().wallet(address)

  console.log(`Address: ${address}`)
  console.log(`Balance: ${formatXE(balance)}`)
}

const createAction = ({ logger, ...ctx }: CommandContext) => async () => {
  const log = logger()

  const opts = {
    ...getWalletOption(ctx.parent, ctx.network),
    ...getPassphraseOption(ctx.cmd),
    ...(() => {
      const { privateKeyFile, overwrite } = ctx.cmd.opts<{
        privateKeyFile: string | undefined
        overwrite: boolean
      }>()
      return { privateKeyFile, overwrite }
    })()
  }
  log.debug('options', opts)

  const storage = withFile(opts.wallet)

  if (await storage.check() && !opts.overwrite) {
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
    // console.log('For more information, see https://wiki.edge.network/TODO')
    console.log()
    const passphrase = await askSecure('Please enter a passphrase: ')
    if (passphrase.length === 0) throw new Error('passphrase required')
    const confirmKey = await askSecure('Please confirm passphrase: ')
    if (confirmKey !== passphrase) throw new Error('passphrases do not match')
    opts.passphrase = passphrase
    console.log()
  }

  const wallet = xeWallet.create()
  log.debug('Writing file', { wallet, file: opts.wallet })
  await storage.write(wallet, opts.passphrase)
  log.debug('Wrote file', { file: opts.wallet })
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
    log.debug('Writing file', { file: pkFile })
    writeFileSync(pkFile, wallet.privateKey)
    log.debug('Wrote file', { file: pkFile })
    console.log(`Private key saved to ${pkFile}.`)
  }
  catch (err) {
    console.log('Failed to write to private key file. Displaying it instead...')
    console.log()
    console.log(`Private key: ${wallet.privateKey}`)
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

const infoAction = ({ logger, ...ctx }: CommandContext) => async () => {
  const log = logger()

  const opts = {
    ...getWalletOption(ctx.parent, ctx.network),
    ...getPassphraseOption(ctx.cmd)
  }
  log.debug('options', opts)

  const storage = withFile(opts.wallet)
  console.log(`Address: ${await storage.address()}`)

  if (opts.passphrase) {
    try {
      log.debug('Decrypting wallet', { file: opts.wallet })
      const wallet = await storage.read(opts.passphrase)
      console.log(`Private key: ${wallet.privateKey}`)
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

const forgetAction = ({ logger, ...ctx }: CommandContext) => async () => {
  const log = logger()

  const opts = {
    ...getWalletOption(ctx.parent, ctx.network),
    ...(() => {
      const { yes } = ctx.cmd.opts<{ yes: boolean }>()
      return { yes }
    })()
  }
  log.debug('options', opts)

  const storage = withFile(opts.wallet)
  if (!await storage.check()) {
    console.log('No wallet found.')
    return
  }

  console.log(`Address: ${await storage.address()}`)

  if (!opts.yes) {
    console.log()
    let confirm = ''
    const ynRegexp = /^[yn]$/
    while (confirm.length === 0) {
      const input = await ask('Are you sure you want to forget this wallet? [yn] ')
      if (ynRegexp.test(input)) confirm = input
      else console.log('Please enter y or n.')
    }
    if (confirm === 'n') return
    console.log()
  }

  log.debug('Deleting file', { wallet: opts.wallet })
  unlink(opts.wallet, err => {
    if (err !== null) throw err
    log.debug('Deleted file', { wallet: opts.wallet })
    console.log('Your wallet is forgotten.')
  })
}

const forgetHelp = [
  '\n',
  'This command deletes your wallet from disk.'
].join('')

const restoreAction = ({ logger, ...ctx }: CommandContext) => async () => {
  const log = logger()

  const opts = {
    ...getWalletOption(ctx.parent, ctx.network),
    ...(() => {
      const { overwrite } = ctx.cmd.opts<{ overwrite: boolean }>()
      return { overwrite }
    })(),
    ...getPrivateKeyOption(ctx.cmd),
    ...getPassphraseOption(ctx.cmd)
  }
  log.debug('options', opts)

  const storage = withFile(opts.wallet)

  if (await storage.check() && !opts.overwrite) {
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
    if (!xeWallet.validatePrivateKey(privateKey)) throw new Error('invalid private key')
    opts.privateKey = privateKey
    console.log()
  }

  if (!opts.passphrase) {
    console.log('To ensure your wallet is secure it will be encrypted locally using a passphrase.')
    // console.log('For more information, see https://wiki.edge.network/TODO')
    console.log()
    const passphrase = await askSecure('Please enter a passphrase: ')
    if (passphrase.length === 0) throw new Error('passphrase required')
    const confirmKey = await askSecure('Please confirm passphrase: ')
    if (confirmKey !== passphrase) throw new Error('passphrases do not match')
    opts.passphrase = passphrase
    console.log()
  }

  const wallet = xeWallet.recover(opts.privateKey || '')
  log.debug('Writing file', { wallet, file: opts.wallet })
  await storage.write(wallet, opts.passphrase)
  log.debug('Wrote file', { file: opts.wallet })
  console.log(`Wallet ${wallet.address} restored.`)
}

const restoreHelp = [
  '\n',
  'This command will restore an existing wallet using a private key you already have.\n\n',
  'You will be asked to provide a passphrase to encrypt the wallet locally. ',
  'The passphrase is also required later to decrypt the wallet for certain actions, such as signing transactions.\n\n'
].join('')

export const getPassphraseOption = (cmd: Command): PassphraseOption => {
  type Input = Record<'passphrase' | 'passphraseFile', string|undefined>
  const { passphrase, passphraseFile: file } = cmd.opts<Input>()
  if (passphrase && passphrase.length) return { passphrase }
  // read secure value from file if set
  if (file !== undefined) {
    if (file.length === 0) throw new Error('no path to passphrase file')
    const data = readFileSync(file)
    return { passphrase: data.toString() }
  }
  return {}
}

export const getPrivateKeyOption = (cmd: Command): PrivateKeyOption => {
  type Input = Record<'privateKey' | 'privateKeyFile', string|undefined>
  const { privateKey, privateKeyFile: file } = cmd.opts<Input>()
  if (privateKey && privateKey.length) return { privateKey }
  // read secure value from file if set
  if (file !== undefined) {
    if (file.length === 0) throw new Error('no path to private key file')
    const data = readFileSync(file)
    return { privateKey: data.toString() }
  }
  return {}
}

export const getWalletOption = (parent: Command, network: Network): WalletOption => {
  const { wallet } = parent.opts<Partial<WalletOption>>()
  return { wallet: wallet || network.wallet.defaultFile }
}

export const privateKeyOption = (): Option => new Option('-k, --private-key <string>', 'wallet private key')
export const privateKeyFileOption = (): Option => new Option(
  '-K, --private-key-file <path>',
  'file containing wallet private key'
)

export const passphraseOption = (): Option => new Option('-p, --passphrase <string>', 'wallet passphrase')
export const passphraseFileOption = (): Option => new Option(
  '-P, --passphrase-file <path>',
  'file containing wallet passphrase'
)

export const withContext = (ctx: Context): [Command, Option] => {
  const walletCLI = new Command('wallet')
    .description('manage wallet')

  // edge wallet balance
  const balance = new Command('balance')
    .description('check balance')
  balance.action(errorHandler(ctx, checkVersionHandler(ctx, balanceAction(ctx))))

  // edge wallet create
  const create = new Command('create')
    .description('create a new wallet')
    .addHelpText('after', createHelp)
    .option('-f, --overwrite', 'overwrite existing wallet if one exists')
    .addOption(passphraseOption())
    .addOption(passphraseFileOption())
    .addOption(privateKeyFileOption())
  create.action(errorHandler(ctx, checkVersionHandler(ctx, createAction({ ...ctx, cmd: create }))))

  // edge wallet forget
  const forget = new Command('forget')
    .description('forget saved wallet')
    .addHelpText('after', forgetHelp)
    .option('-y, --yes', 'do not ask for confirmation')
  forget.action(errorHandler(ctx, checkVersionHandler(ctx, forgetAction({ ...ctx, cmd: forget }))))

  // edge wallet info
  const info = new Command('info')
    .description('display saved wallet info')
    .addHelpText('after', infoHelp)
    .addOption(passphraseOption())
    .addOption(passphraseFileOption())
  info.action(errorHandler(ctx, checkVersionHandler(ctx, infoAction({ ...ctx, cmd: info }))))

  // edge wallet restore
  const restore = new Command('restore')
    .description('restore a wallet')
    .addHelpText('after', restoreHelp)
    .option('-f, --overwrite', 'overwrite existing wallet if one exists')
    .addOption(privateKeyOption())
    .addOption(privateKeyFileOption())
    .addOption(passphraseOption())
    .addOption(passphraseFileOption())
  restore.action(errorHandler(ctx, checkVersionHandler(ctx, restoreAction({ ...ctx, cmd: restore }))))

  walletCLI
    .addCommand(balance)
    .addCommand(create)
    .addCommand(forget)
    .addCommand(info)
    .addCommand(restore)

  return [walletCLI, new Option('-w, --wallet <file>', 'wallet file path')]
}
