import { readFileSync } from 'fs'
import readline from 'readline'

export const readSecureValue = (question: string, name: string) => (file: string | undefined): Promise<string> =>
  new Promise((resolve, reject) => {
    // read secure value from file if set
    if (file !== undefined) {
      if (file.length === 0) return reject(new Error(`no path to ${name} file`))
      try {
        const data = readFileSync(file)
        return resolve(data.toString())
      }
      catch (err) {
        return reject(err)
      }
    }

    // try interactive prompt
    if (!process.stdout.isTTY) return reject(new Error(`${name} required`))
    const rl = readline.createInterface(process.stdin, process.stdout)
    let valueAnswer = ''
    rl.on('close', () => {
      if (valueAnswer.length > 0) return resolve(valueAnswer)
      return reject(new Error(`${name} required`))
    })
    rl.question(question, answer => {
      valueAnswer = answer
      rl.close()
    })
  })
