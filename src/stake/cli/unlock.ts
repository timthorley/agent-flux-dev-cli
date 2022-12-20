// Copyright (C) 2022 Edge Network Technologies Limited
// Use of this source code is governed by a GNU GPL-style license
// that can be found in the LICENSE.md file. All rights reserved.

import * as cli from '../../cli'
import * as repl from '../../repl'
import * as xeUtils from '@edge/xe-utils'
import { Command } from 'commander'
import { checkVersionHandler } from '../../update/cli'
import { errorHandler } from '../../cli'
import { findOne } from '..'
import { formatXE } from '../../transaction/xe'
import { CommandContext, Context } from '../..'
import { askToSignTx, handleCreateTxResult } from '../../transaction'
import { formatTime, toDays, toUpperCaseFirst } from '../../helpers'

/** Unlock a stake. */
export const action = (ctx: CommandContext) => async (id: string): Promise<void> => {
  const opts = {
    ...await cli.passphrase.read(ctx.cmd),
    ...cli.yes.read(ctx.cmd)
  }

  const wallet = ctx.wallet()
  const { results: stakes } = await ctx.indexClient().stakes(await wallet.address(), { limit: 999 })
  const stake = findOne(stakes, id)

  if (stake.unlockRequested !== undefined) {
    if (stake.unlockRequested + stake.unlockPeriod > Date.now()) {
      console.log('Unlock has already been requested.')
      console.log(`This stake will unlock at ${formatTime(stake.unlockRequested)}`)
    }
    else console.log('This stake is already unlocked.')
    return
  }

  if (!opts.yes) {
    // eslint-disable-next-line max-len
    console.log(`You are requesting to unlock a ${toUpperCaseFirst(stake.type)} stake.`)
    console.log([
      `After the unlock wait period of ${toDays(stake.unlockPeriod)} days, `,
      `you will be able to release the stake and return ${formatXE(stake.amount)} to your available balance.`
    ].join(''))
    console.log()
    if (await repl.askLetter('Proceed with unlock?', 'yn') === 'n') return
    console.log()
  }

  await askToSignTx(opts)
  const hostWallet = await wallet.read(opts.passphrase as string)

  const xeClient = ctx.xeClient()
  const onChainWallet = await xeClient.walletWithNextNonce(hostWallet.address)

  const tx = xeUtils.tx.sign({
    timestamp: Date.now(),
    sender: hostWallet.address,
    recipient: hostWallet.address,
    amount: 0,
    data: {
      action: 'unlock_stake',
      memo: 'Unlock Stake',
      stake: stake.hash
    },
    nonce: onChainWallet.nonce
  }, hostWallet.privateKey)

  const result = await xeClient.createTransaction(tx)
  if (!handleCreateTxResult(ctx.network, result)) process.exitCode = 1
}

export const command = (ctx: Context): Command => {
  const cmd = new Command('unlock')
    .argument('<id>', 'stake ID')
    .description('unlock a stake')
    .addHelpText('after', help)
  cli.passphrase.configure(cmd)
  cli.yes.configure(cmd)
  cmd.action(errorHandler(ctx, checkVersionHandler(ctx, action({ ...ctx, cmd }))))
  return cmd
}

const help = `
Unlock a stake.
`
